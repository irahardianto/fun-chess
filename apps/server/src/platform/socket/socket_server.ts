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
        origin: "*",
        methods: ["GET", "POST"],
      },
      pingInterval: 10000,
      pingTimeout: 5000,
      ...customOptions,
    },
  );
}
