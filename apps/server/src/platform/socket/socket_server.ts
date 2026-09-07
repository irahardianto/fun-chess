import { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, ServerOptions } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "@fun-chess/shared";
import { isOriginAllowed, loadServerConfig, resolveAllowedOrigins } from "../config/index.js";
import { Logger } from "../logger/logger.interface.js";

export type TypedSocketServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents
>;

export interface SocketServerConfig extends Partial<ServerOptions> {
  allowedOrigins?: string[];
  logger?: Logger;
}

/**
 * Creates and configures a Socket.io server instance attached to an HTTP server.
 * Enforces CORS origin allowlist restrictions in production mode (MAJ-003).
 * Fails fast on invalid configuration during origin resolution (CRIT-006).
 * Logs engine transport and handshake errors when logger is provided (MAJ-022).
 */
export function createSocketServer(
  httpServer: HttpServer,
  customOptions?: SocketServerConfig,
): TypedSocketServer {
  const allowedOrigins =
    customOptions?.allowedOrigins ??
    (() => {
      if (process.env.CORS_ORIGIN) {
        return process.env.CORS_ORIGIN.split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (process.env.NODE_ENV === "production") {
        // Fail fast without swallowing config exceptions (CRIT-006)
        const env = loadServerConfig(process.env);
        return resolveAllowedOrigins(env);
      }
      return ["*"];
    })();

  const corsOrigin =
    allowedOrigins.includes("*")
      ? "*"
      : allowedOrigins.length === 1
        ? allowedOrigins[0]
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

  const { allowedOrigins: _omit, logger, ...ioOptions } = customOptions || {};

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: corsOrigin,
        methods: ["GET", "POST"],
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

      logger.warn("Socket engine connection error", {
        operation: "socket_engine_connection_error",
        code: errorObj.code,
        message: errorObj.message,
        context: errorObj.context,
        url: errorObj.req?.url,
        origin: errorObj.req?.headers?.origin,
      });
    });
  }

  return io;
}
