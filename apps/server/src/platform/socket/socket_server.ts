import { randomUUID } from "node:crypto";
import { Server as HttpServer, ServerResponse as HttpServerResponse } from "node:http";
import { Server as SocketIOServer, ServerOptions } from "socket.io";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketErrorPayload,
} from "@fun-chess/shared";
import { isOriginAllowed, resolveAllowedOrigins, type ServerEnv } from "../config/index.js";
import { Logger } from "../logger/logger.interface.js";
import {
  extractClientIp,
  createSocketRateLimiter,
  SocketRateLimiter,
} from "./socket_rate_limiter.js";

export const HANDSHAKE_RATE_LIMIT_WINDOW_MS = 10_000;
export const HANDSHAKE_RATE_LIMIT_MAX_REQUESTS = 30;
export const MAX_CONCURRENT_SOCKETS_PER_IP = 10;

export interface SocketRateLimitErrorPayload extends SocketErrorPayload {
  readonly retryAfter?: number;
}

export interface IConnectionTracker {
  getActiveCount(ip: string): number;
  increment(ip: string): number;
  decrement(ip: string): number;
  reset(): void;
  getAllCounts(): ReadonlyMap<string, number>;
}

/**
 * Tracks concurrent active socket connections per client IP (MAJ-002).
 * Automatically cleans up IP keys when active count drops to 0 to prevent memory leaks.
 */
export class ConnectionTracker implements IConnectionTracker {
  private readonly connections = new Map<string, number>();

  getActiveCount(ip: string): number {
    return this.connections.get(ip) ?? 0;
  }

  increment(ip: string): number {
    const current = this.getActiveCount(ip);
    const updated = current + 1;
    this.connections.set(ip, updated);
    return updated;
  }

  decrement(ip: string): number {
    const current = this.getActiveCount(ip);
    if (current <= 1) {
      this.connections.delete(ip);
      return 0;
    }
    const updated = current - 1;
    this.connections.set(ip, updated);
    return updated;
  }

  reset(): void {
    this.connections.clear();
  }

  getAllCounts(): ReadonlyMap<string, number> {
    return new Map(this.connections);
  }
}

/**
 * Creates Socket.IO connection middleware capping concurrent active sockets per client IP (MAJ-002, api_contracts.md §6.4).
 */
export function createConcurrentConnectionMiddleware(
  connectionTracker: ConnectionTracker,
  maxConcurrentSocketsPerIp: number = MAX_CONCURRENT_SOCKETS_PER_IP,
  trustProxy: boolean = false,
  logger?: Logger,
): (
  socket: {
    id: string;
    handshake?: unknown;
    on: (event: "disconnect", cb: () => void) => unknown;
  },
  next: (err?: Error) => void,
) => void {
  return (socket, next) => {
    const clientIp = extractClientIp(socket, trustProxy);
    const activeCount = connectionTracker.getActiveCount(clientIp);

    if (activeCount >= maxConcurrentSocketsPerIp) {
      logger?.warn("Socket connection rejected: concurrent connection limit exceeded", {
        operation: "socket_concurrent_limit_exceeded",
        correlationId: randomUUID(),
        clientIp,
        socketId: socket.id,
        activeConnections: activeCount,
        maxAllowed: maxConcurrentSocketsPerIp,
      });

      const error = new Error("Maximum concurrent connections exceeded");
      const errorPayload: SocketRateLimitErrorPayload = {
        code: "ERR_RATE_LIMITED",
        message: `Maximum concurrent connections exceeded (${maxConcurrentSocketsPerIp} per IP). Close existing tabs.`,
        correlationId: randomUUID(),
        retryAfter: 30,
        details: {
          activeConnections: activeCount,
          maxAllowed: maxConcurrentSocketsPerIp,
          retryAfter: 30,
        },
      };

      (error as unknown as { data: SocketRateLimitErrorPayload }).data = errorPayload;
      next(error);
      return;
    }

    connectionTracker.increment(clientIp);
    socket.on("disconnect", () => {
      connectionTracker.decrement(clientIp);
    });
    next();
  };
}

export type TypedSocketServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents
> & {
  connectionTracker?: ConnectionTracker;
  handshakeRateLimiter?: SocketRateLimiter;
  __hasConnectionCapMiddleware?: boolean;
};

export interface SocketServerConfig extends Partial<ServerOptions> {
  allowedOrigins?: string[];
  logger?: Logger;
  env?: Partial<ServerEnv>;
  handshakeRateLimiter?: SocketRateLimiter;
  connectionTracker?: ConnectionTracker;
  maxConcurrentSocketsPerIp?: number;
  trustProxy?: boolean;
}

/**
 * Creates and configures a Socket.io server instance attached to an HTTP server.
 * Delegates strictly to resolveAllowedOrigins without direct process.env reads (MAJ-002).
 * Strips query strings before logging connection error URLs to prevent token exposure (MAJ-017).
 * Enforces CORS origin allowlist restrictions and cleans up Engine.IO rejection code (CRIT-002).
 * Enforces handshake rate limiting (30 requests / 10s per IP) and HTTP 429 responses (MAJ-002).
 * Enforces concurrent connection capping (10 sockets per IP) via connection middleware (MAJ-002).
 */
export function createSocketServer(
  httpServer: HttpServer,
  customOptions?: SocketServerConfig,
): TypedSocketServer {
  const allowedOrigins =
    customOptions?.allowedOrigins ??
    resolveAllowedOrigins(customOptions?.env);

  const corsOrigin =
    allowedOrigins.includes("*")
      ? "*"
      : (
          origin: string | undefined,
          callback: (err: Error | null, success?: boolean) => void,
        ) => {
          if (isOriginAllowed(origin, allowedOrigins)) {
            callback(null, true);
          } else {
            callback(new Error(`CORS origin not allowed: ${origin}`), false);
          }
        };

  const {
    allowedOrigins: _omit,
    logger,
    env,
    handshakeRateLimiter: optHandshakeLimiter,
    connectionTracker: optConnectionTracker,
    maxConcurrentSocketsPerIp = MAX_CONCURRENT_SOCKETS_PER_IP,
    trustProxy: optTrustProxy,
    ...ioOptions
  } = customOptions || {};

  const trustProxy = optTrustProxy ?? Boolean(env?.TRUST_PROXY);

  const handshakeRateLimiter =
    optHandshakeLimiter ??
    createSocketRateLimiter({
      windowMs: HANDSHAKE_RATE_LIMIT_WINDOW_MS,
      maxRequests: HANDSHAKE_RATE_LIMIT_MAX_REQUESTS,
      maxKeys: 10_000,
      logger,
    });

  const connectionTracker = optConnectionTracker ?? new ConnectionTracker();

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: corsOrigin,
        methods: ["GET", "POST"],
      },
      allowRequest: (req, callback) => {
        const origin = req.headers.origin;
        if (!isOriginAllowed(origin, allowedOrigins)) {
          logger?.warn("Socket connection rejected: origin not allowed", {
            operation: "socket_cors_rejected",
            correlationId: randomUUID(),
            origin,
            url: req.url?.split("?")[0],
          });
          callback("Unauthorized origin", false);
          return;
        }

        const clientIp = extractClientIp(req, trustProxy);
        if (!handshakeRateLimiter.consume(clientIp)) {
          logger?.warn("Socket connection rejected: handshake rate limit exceeded", {
            operation: "socket_handshake_rate_limited",
            correlationId: randomUUID(),
            clientIp,
            url: req.url?.split("?")[0],
          });

          const res = (req as { res?: HttpServerResponse }).res;
          if (res && !res.headersSent) {
            res.statusCode = 429;
            const origWriteHead = res.writeHead.bind(res);
            res.writeHead = (_statusCode: number, ...args: unknown[]) => {
              res.statusCode = 429;
              res.setHeader("Retry-After", "10");
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              return (origWriteHead as (...a: unknown[]) => HttpServerResponse)(429, ...args);
            };
            const origEnd = res.end.bind(res);
            res.end = (_chunk?: unknown, ...args: unknown[]) => {
              const body = JSON.stringify({
                code: "ERR_RATE_LIMITED",
                message: "Too many connection attempts. Please wait before reconnecting.",
                retryAfter: 10,
              });
              return (origEnd as (...a: unknown[]) => HttpServerResponse)(body, ...args);
            };
          }

          callback("Handshake rate limit exceeded", false);
          return;
        }

        callback(null, true);
      },
      pingInterval: 25000,
      pingTimeout: 20000,
      ...ioOptions,
    },
  ) as TypedSocketServer;

  // Level 2: Concurrent connection cap middleware (MAJ-002, api_contracts.md §6.4)
  io.use(
    createConcurrentConnectionMiddleware(
      connectionTracker,
      maxConcurrentSocketsPerIp,
      trustProxy,
      logger,
    ),
  );

  io.connectionTracker = connectionTracker;
  io.handshakeRateLimiter = handshakeRateLimiter;
  io.__hasConnectionCapMiddleware = true;

  if (logger) {
    io.engine.on("connection_error", (err: unknown) => {
      const errorObj = err as {
        req?: {
          headers?: Record<string, string | string[] | undefined>;
          url?: string;
        };
        code?: number | string;
        message?: string;
        context?: unknown;
      };

      const sanitizedUrl = errorObj.req?.url?.split("?")[0];

      logger.warn("Socket engine connection error", {
        correlationId: randomUUID(),
        operation: "socket_engine_connection_error",
        code: errorObj.code,
        message: errorObj.message,
        context: errorObj.context,
        url: sanitizedUrl,
        origin: errorObj.req?.headers?.origin,
      });
    });
  }

  return io;
}
