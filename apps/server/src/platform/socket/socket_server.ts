import { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, ServerOptions } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "@fun-chess/shared";

export type TypedSocketServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents
>;

/**
 * Creates and configures a Socket.io server instance attached to an HTTP server.
 */
export function createSocketServer(
  httpServer: HttpServer,
  customOptions?: Partial<ServerOptions>,
): TypedSocketServer {
  return new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
      },
      pingInterval: 25000,
      pingTimeout: 20000,
      ...customOptions,
    },
  );
}
