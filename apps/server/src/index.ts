import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PinoLogger } from "./platform/logger/pino_logger.js";
import { createHttpServer } from "./platform/http/http_server.js";
import { createSocketServer } from "./platform/socket/socket_server.js";
import { InMemoryRoomStore } from "./features/rooms/in_memory_room.store.js";
import { RoomService } from "./features/rooms/room.service.js";
import { GameService } from "./features/game/game.service.js";
import { LanService } from "./features/lan/lan.service.js";
import { RelayAddressService } from "./features/lan/relay_address.service.js";
import {
  registerRoomSocketHandlers,
  handleSocketDisconnect,
} from "./features/rooms/room.socket_handler.js";
import { registerGameSocketHandlers } from "./features/game/game.socket_handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main application bootstrap function.
 * Wires storage adapters, business logic services, HTTP/SPA routing, and Socket.io ingress.
 */
async function bootstrap(): Promise<void> {
  const logger = new PinoLogger({
    level: process.env.LOG_LEVEL || "info",
  });

  const port = Number(process.env.PORT) || 3000;
  const host = "0.0.0.0";
  const distPath = path.resolve(__dirname, "../../client/dist");

  logger.info("Initializing Fun Chess server bootstrap...", { port, host });

  // 1. Instantiate Storage Adapters & Domain Services
  const roomStore = new InMemoryRoomStore();
  const roomService = new RoomService(roomStore);
  const gameService = new GameService(roomStore);
  const lanService = new LanService();
  const relayAddressService = new RelayAddressService();

  // 2. Setup Native HTTP Server with API & SPA Static File Routing
  const httpHandler = createHttpServer({
    roomStore,
    lanService,
    relayAddressService,
    logger,
    port,
    distPath,
    getActiveSocketCount: () => (io ? io.sockets.sockets.size : 0),
  });

  const server = http.createServer(httpHandler);

  // 3. Setup Typed Socket.io Server
  const io = createSocketServer(server);

  // 4. Register Feature Socket Ingress Handlers
  io.on("connection", (socket) => {
    logger.info("Client socket connected", {
      operation: "socket_connected",
      socketId: socket.id,
      remoteAddress: socket.handshake.address,
    });

    registerRoomSocketHandlers(io, socket, roomService, logger);
    registerGameSocketHandlers(io, socket, gameService, logger);

    socket.on("disconnect", async (reason) => {
      logger.info("Client socket disconnected", {
        operation: "socket_disconnected",
        socketId: socket.id,
        reason,
      });
      await handleSocketDisconnect(io, socket.id, roomService, logger);
    });
  });

  // 5. Periodic Abandoned Room Cleanup (every 5 minutes)
  const cleanupInterval = setInterval(
    async () => {
      try {
        const count = await roomService.cleanupAbandonedRooms(10 * 60 * 1000);
        if (count > 0) {
          logger.info(`Periodic cleanup: removed ${count} inactive room(s)`, {
            operation: "room_cleanup",
            cleanedCount: count,
          });
        }
      } catch (err) {
        logger.error("Error during periodic room cleanup", {
          operation: "room_cleanup_error",
          error: err instanceof Error ? { message: err.message } : { raw: err },
        });
      }
    },
    5 * 60 * 1000,
  );

  // 6. Graceful Process Termination
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`, { signal });
    clearInterval(cleanupInterval);
    io.close(() => {
      server.close(() => {
        logger.info("Fun Chess server closed successfully.");
        process.exit(0);
      });
    });

    // Force exit after timeout if sockets hang
    setTimeout(() => {
      logger.error("Forced shutdown due to timeout.");
      process.exit(1);
    }, 5000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // 7. Bind and Start Server
  server.listen(port, host, () => {
    const addrInfo = relayAddressService.getAddressingInfo(port);

    logger.info("Fun Chess server started successfully", {
      port,
      relayMode: addrInfo.relayMode,
      isCloudRelay: addrInfo.isCloudRelay,
      lanIp: addrInfo.lanIp,
      joinUrl: addrInfo.joinUrl,
      publicUrl: addrInfo.publicUrl,
      localUrl: addrInfo.localUrl,
    });

    console.log(`
============================================================
  ♞ FUN CHESS ${addrInfo.relayMode === "cloud" ? "CLOUD RELAY" : "LOCAL LAN"} SERVER IS RUNNING!
  
  Mode:       ${addrInfo.relayMode === "cloud" ? "Cloud Relay" : "Local LAN"}
  Localhost:  ${addrInfo.localUrl}
  Join URL:   ${addrInfo.joinUrl}
  ${addrInfo.publicUrl ? `Public URL: ${addrInfo.publicUrl}` : `LAN Host:   http://${addrInfo.lanIp}:${port}`}
  
  Share this URL or scan QR code on any device!
============================================================
    `);
  });
}

bootstrap().catch((err) => {
  console.error("Fatal bootstrap error:", err);
  process.exit(1);
});
