import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadServerConfig, resolveAllowedOrigins } from "./platform/config/index.js";
import { PinoLogger } from "./platform/logger/pino_logger.js";
import { runLoggedJob } from "./platform/logger/job_runner.js";
import { createHttpServer } from "./platform/http/http_server.js";
import { createSocketServer } from "./platform/socket/socket_server.js";
import { ShutdownCoordinator } from "./platform/lifecycle/shutdown_coordinator.js";
import { InMemoryRoomStore } from "./features/rooms/in_memory_room.store.js";
import { RoomService } from "./features/rooms/room.service.js";
import { GameService } from "./features/game/game.service.js";
import { RelayAddressService } from "./features/lan/relay_address.service.js";
import {
  registerRoomSocketHandlers,
  handleSocketDisconnect,
  clearAllDisconnectTimers,
  createSocketRateLimiter,
} from "./features/rooms/room.socket_handler.js";
import { registerGameSocketHandlers } from "./features/game/game.socket_handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main application bootstrap function.
 * Wires storage adapters, business logic services, HTTP/SPA routing, and Socket.io ingress.
 */
async function bootstrap(): Promise<void> {
  // 1. Centralized Fail-Fast Environment Validation (MAJ-015, MAJ-016)
  const env = loadServerConfig(process.env);
  const allowedOrigins = resolveAllowedOrigins(env);

  const logger = new PinoLogger({
    level: env.LOG_LEVEL,
  });

  const port = env.PORT;
  const host = env.HOST;
  const isProduction = env.NODE_ENV === "production";
  const distPath = path.resolve(__dirname, "../../client/dist");

  logger.info("Initializing Fun Chess server bootstrap...", {
    port,
    host,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
  });

  // 2. Instantiate Storage Adapters & Domain Services
  const roomStore = new InMemoryRoomStore();
  const roomService = new RoomService(roomStore);
  const gameService = new GameService(roomStore);
  const relayAddressService = new RelayAddressService({
    publicUrl: env.PUBLIC_URL,
    host: env.HOST,
    port: env.PORT,
    lanIp: env.LAN_IP,
  });

  // 3. Setup Native HTTP Server with API & SPA Static File Routing (MAJ-003, MAJ-019)
  const httpHandler = createHttpServer({
    roomStore,
    relayAddressService,
    logger,
    port,
    distPath,
    allowedOrigins,
    getActiveSocketCount: () => (io ? io.sockets.sockets.size : 0),
  });

  const server = http.createServer(httpHandler);

  // 4. Setup Typed Socket.io Server with Strict CORS (MAJ-003)
  const io = createSocketServer(server, {
    allowedOrigins,
  });

  // Shared Socket Rate Limiter singleton (SEC-HIGH-001, MAJ-001)
  const rateLimiter = createSocketRateLimiter();

  // 5. Register Feature Socket Ingress Handlers & Transport Error Logging (ENH-005)
  io.on("connection", (socket) => {
    logger.info("Client socket connected", {
      operation: "socket_connected",
      socketId: socket.id,
      remoteAddress: socket.handshake.address,
    });

    socket.on("error", (err: Error) => {
      logger.error("Client socket transport error", {
        operation: "socket_error",
        socketId: socket.id,
        error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { raw: err },
      });
    });

    registerRoomSocketHandlers(io, socket, roomService, logger, rateLimiter);
    registerGameSocketHandlers(io, socket, gameService, logger, rateLimiter);

    socket.on("disconnect", async (reason) => {
      logger.info("Client socket disconnected", {
        operation: "socket_disconnected",
        socketId: socket.id,
        reason,
      });
      await handleSocketDisconnect(io, socket.id, roomService, logger);
    });
  });

  // 6. Periodic Abandoned Room & Expired Session Cleanup with 3-point structured logging (MAJ-017, CRIT-003)
  const cleanupInterval = setInterval(
    async () => {
      try {
        await runLoggedJob(logger, "room_cleanup", async () => {
          const count = await roomService.cleanupAbandonedRooms(10 * 60 * 1000);
          const sessionsCleaned = await roomService.cleanupExpiredSessions();
          return { cleanedCount: count, cleanedSessions: sessionsCleaned };
        });
      } catch {
        // Error is logged by runLoggedJob; do not trigger unhandled rejection
      }
    },
    5 * 60 * 1000,
  );

  // 7. Graceful Process Termination & Crash Guards (CRIT-002, ENH-008, ENH-011)
  const shutdownCoordinator = new ShutdownCoordinator({
    server,
    io,
    logger,
    cleanupInterval,
    timeoutMs: 5000,
    additionalCleanups: [
      () => {
        clearAllDisconnectTimers();
      },
      () => {
        rateLimiter.destroy();
      },
    ],
  });

  shutdownCoordinator.installProcessHandlers();

  // 8. Bind and Start Server
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

    // Suppress ASCII banner in production (MIN-016)
    if (!isProduction) {
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
    }
  });
}

bootstrap().catch((err) => {
  console.error("Fatal bootstrap error:", err);
  process.exit(1);
});
