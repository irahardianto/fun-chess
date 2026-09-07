import { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, ServerOptions } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "@fun-chess/shared";
import { isOriginAllowed, loadServerConfig, resolveAllowedOrigins } from "../config/index.js";

export type TypedSocketServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents
>;

export interface SocketServerConfig extends Partial<ServerOptions> {
  allowedOrigins?: string[];
}

/**
 * Creates and configures a Socket.io server instance attached to an HTTP server.
 * Enforces CORS origin allowlist restrictions in production mode (MAJ-003).
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
        try {
          const env = loadServerConfig(process.env);
          return resolveAllowedOrigins(env);
        } catch {
          return [];
        }
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

  const { allowedOrigins: _omit, ...ioOptions } = customOptions || {};

  return new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
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
}
