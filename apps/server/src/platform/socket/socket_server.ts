import { randomUUID } from "node:crypto";
import { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, ServerOptions } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "@fun-chess/shared";
import { isOriginAllowed, resolveAllowedOrigins, type ServerEnv } from "../config/index.js";
import { Logger } from "../logger/logger.interface.js";

export type TypedSocketServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents
>;

export interface SocketServerConfig extends Partial<ServerOptions> {
  allowedOrigins?: string[];
  logger?: Logger;
  env?: Partial<ServerEnv>;
}

/**
 * Creates and configures a Socket.io server instance attached to an HTTP server.
 * Delegates strictly to resolveAllowedOrigins without direct process.env reads (MAJ-002).
 * Strips query strings before logging connection error URLs to prevent token exposure (MAJ-017).
 * Enforces CORS origin allowlist restrictions.
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

  const { allowedOrigins: _omit, logger, env: _env, ...ioOptions } = customOptions || {};

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: corsOrigin,
        methods: ["GET", "POST"],
      },
      allowRequest: (req, callback) => {
        const origin = req.headers.origin;
        if (isOriginAllowed(origin, allowedOrigins)) {
          callback(null, true);
        } else {
          logger?.warn("Socket connection rejected: origin not allowed", {
            operation: "socket_cors_rejected",
            correlationId: randomUUID(),
            origin,
            url: req.url?.split("?")[0],
          });
          callback(3 as unknown as string, false);
        }
      },
      pingInterval: 25000,
      pingTimeout: 20000,
      ...ioOptions,
    },
  );

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
