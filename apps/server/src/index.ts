import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  loadServerConfig,
  resolveAllowedOrigins,
  type ServerEnv,
} from "./platform/config/index.js";
import { PinoLogger } from "./platform/logger/pino_logger.js";
import { Logger } from "./platform/logger/logger.interface.js";
import { runLoggedJob } from "./platform/logger/job_runner.js";
import { createHttpServer } from "./platform/http/http_server.js";
import {
  createSocketServer,
  type TypedSocketServer,
} from "./platform/socket/socket_server.js";
import {
  ShutdownCoordinator,
  type ShutdownCoordinatorOptions,
} from "./platform/lifecycle/shutdown_coordinator.js";
import {
  InMemoryRoomStore,
  RoomService,
  clearAllDisconnectTimers,
  defaultDisconnectTimerRegistry,
  type IDisconnectTimerRegistry,
} from "./features/rooms/index.js";
import { GameService } from "./features/game/index.js";
import { RelayAddressService } from "./features/lan/index.js";
import {
  registerRoomSocketHandlers,
  handleSocketDisconnect,
} from "./features/rooms/room.socket_handler.js";
import { registerGameSocketHandlers } from "./features/game/game.socket_handler.js";
import {
  createSocketRateLimiter,
  type SocketRateLimiter,
} from "./platform/socket/socket_rate_limiter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StartServerOptions {
  config?: Partial<ServerEnv>;
  port?: number;
  host?: string;
  logger?: Logger;
  roomStore?: InMemoryRoomStore;
  distPath?: string;
  autoListen?: boolean;
  timerRegistry?: IDisconnectTimerRegistry;
  onExit?: (code: number) => void;
}

export interface ServerInstance {
  server: http.Server;
  io: TypedSocketServer;
  shutdownCoordinator: ShutdownCoordinator;
  roomStore: InMemoryRoomStore;
  roomService: RoomService;
  gameService: GameService;
  rateLimiter: SocketRateLimiter;
  config: ServerEnv;
  port: number;
  url: string;
  close: () => Promise<void>;
}

/**
 * Main application bootstrap function.
 * Wires storage adapters, business logic services, HTTP/SPA routing, and Socket.io ingress.
 * Returns running ServerInstance with lifecycle handles (MAJ-033).
 */
export async function startServer(options: StartServerOptions = {}): Promise<ServerInstance> {
  // 1. Centralized Fail-Fast Environment Validation (MAJ-015, MAJ-016, MAJ-004)
  const baseConfig = loadServerConfig(process.env);
  const env: ServerEnv = {
    ...baseConfig,
    ...(options.config || {}),
  };

  if (options.port !== undefined) {
    (env as any).PORT = options.port;
  }
  if (options.host !== undefined) {
    (env as any).HOST = options.host;
  }

  const allowedOrigins = resolveAllowedOrigins(env);

  const logger =
    options.logger ??
    new PinoLogger({
      level: env.LOG_LEVEL,
    });

  const port = options.port ?? env.PORT;
  const host = options.host ?? env.HOST;
  const isProduction = env.NODE_ENV === "production";
  const distPath = options.distPath ?? path.resolve(__dirname, "../../client/dist");

  logger.info("Initializing Fun Chess server bootstrap...", {
    port,
    host,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    trustProxy: env.TRUST_PROXY,
  });

  // 2. Instantiate Storage Adapters & Domain Services
  const timerRegistry = options.timerRegistry ?? defaultDisconnectTimerRegistry;
  const roomStore = options.roomStore ?? new InMemoryRoomStore();
  const roomService = new RoomService(
    roomStore,
    undefined,
    undefined,
    undefined,
    timerRegistry,
  );
  const gameService = new GameService(roomStore);
  const relayAddressService = new RelayAddressService({
    publicUrl: env.PUBLIC_URL,
    host: env.HOST,
    port,
    lanIp: env.LAN_IP,
    hostIp: env.HOST_IP,
  });

  let ioInstance: TypedSocketServer | undefined;

  // 3. Setup Native HTTP Server with API & SPA Static File Routing (MAJ-003, MAJ-019, MAJ-004)
  const httpHandler = createHttpServer({
    roomStore,
    relayAddressService,
    logger,
    port,
    distPath,
    allowedOrigins,
    env,
    getActiveSocketCount: () => (ioInstance ? ioInstance.sockets.sockets.size : 0),
  });

  const server = http.createServer(httpHandler);

  // 4. Setup Typed Socket.io Server with Strict CORS (MAJ-003, CRIT-006, MAJ-022)
  const io = createSocketServer(server, {
    allowedOrigins,
    logger,
    env,
  });
  ioInstance = io;

  // Shared Socket Rate Limiter singleton (SEC-HIGH-001, MAJ-001, MAJ-003, MAJ-015)
  const rateLimiter = createSocketRateLimiter({
    maxKeys: env.RATE_LIMIT_MAX_KEYS ?? 10_000,
    windowMs: env.RATE_LIMIT_WINDOW_MS ?? 10_000,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS ?? (env.NODE_ENV === "production" ? 60 : 1000),
    logger,
  });

  // 5. Register Feature Socket Ingress Handlers & Transport Error Logging (ENH-005, MAJ-025, CRIT-003)
  io.on("connection", (socket) => {
    socket.data = socket.data || {};
    socket.data.trustProxy = env.TRUST_PROXY;
    socket.data.rateLimiter = rateLimiter;

    const connectionCorrelationId = randomUUID();

    logger.info("Client socket connected", {
      operation: "socket_connected",
      correlationId: connectionCorrelationId,
      socketId: socket.id,
      remoteAddress: socket.handshake.address,
    });

    socket.on("error", (err: Error) => {
      logger.error("Client socket transport error", {
        operation: "socket_error",
        correlationId: connectionCorrelationId,
        socketId: socket.id,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
    });

    // Register all game & room handlers with structured logging middleware
    registerRoomSocketHandlers(
      io,
      socket,
      roomService,
      logger,
      rateLimiter,
      timerRegistry,
    );
    registerGameSocketHandlers(io, socket, gameService, logger, rateLimiter);

    // CRIT-003 & MAJ-025: Wrap async disconnect listener in try/catch with structured error log
    socket.on("disconnect", async (reason) => {
      const disconnectCorrelationId = randomUUID();
      logger.info("Client socket disconnected", {
        operation: "socket_disconnected",
        correlationId: disconnectCorrelationId,
        socketId: socket.id,
        reason,
      });

      try {
        await handleSocketDisconnect(
          io,
          socket.id,
          roomService,
          logger,
          undefined,
          rateLimiter,
          timerRegistry,
          disconnectCorrelationId,
        );
      } catch (err: unknown) {
        logger.error("Client socket disconnect handler failed", {
          operation: "socket_disconnect_error",
          correlationId: disconnectCorrelationId,
          socketId: socket.id,
          reason,
          error:
            err instanceof Error
              ? { name: err.name, message: err.message, stack: err.stack }
              : { raw: err },
        });
      }
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

  // 7. Graceful Process Termination & Crash Guards (CRIT-002, CRIT-003, ENH-008, ENH-011, MAJ-010, MIN-013)
  const onExit =
    options.onExit ??
    (env.NODE_ENV === "test" ? () => {} : (code: number) => process.exit(code));

  const coordinatorOptions: ShutdownCoordinatorOptions = {
    server,
    io,
    logger,
    cleanupInterval,
    timeoutMs: 5000,
    onExit,
    additionalCleanups: [
      () => {
        timerRegistry.clear();
        clearAllDisconnectTimers();
      },
      () => {
        rateLimiter.destroy();
      },
    ],
  };

  const shutdownCoordinator = new ShutdownCoordinator(coordinatorOptions);

  if (env.NODE_ENV !== "test") {
    shutdownCoordinator.installProcessHandlers();
  }

  // 8. Bind and Start Server
  const autoListen = options.autoListen ?? true;
  let boundPort = port;
  let boundUrl = `http://${host}:${port}`;

  if (autoListen) {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.removeListener("error", reject);
        const addr = server.address();
        if (addr && typeof addr === "object") {
          boundPort = addr.port;
          boundUrl = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${boundPort}`;
        }
        resolve();
      });
    });

    const addrInfo = relayAddressService.getAddressingInfo(boundPort);

    logger.info("Fun Chess server started successfully", {
      port: boundPort,
      relayMode: addrInfo.relayMode,
      isCloudRelay: addrInfo.isCloudRelay,
      lanIp: addrInfo.lanIp,
      joinUrl: addrInfo.joinUrl,
      publicUrl: addrInfo.publicUrl,
      localUrl: addrInfo.localUrl,
    });

    // Suppress ASCII banner in production and test
    if (!isProduction && env.NODE_ENV !== "test") {
      console.log(`
============================================================
  ♞ FUN CHESS ${addrInfo.relayMode === "cloud" ? "CLOUD RELAY" : "LOCAL LAN"} SERVER IS RUNNING!
  
  Mode:       ${addrInfo.relayMode === "cloud" ? "Cloud Relay" : "Local LAN"}
  Localhost:  ${addrInfo.localUrl}
  Join URL:   ${addrInfo.joinUrl}
  ${addrInfo.publicUrl ? `Public URL: ${addrInfo.publicUrl}` : `LAN Host:   http://${addrInfo.lanIp}:${boundPort}`}
  
  Share this URL or scan QR code on any device!
============================================================
      `);
    }
  }

  const close = async (): Promise<void> => {
    clearInterval(cleanupInterval);
    timerRegistry.clear();
    clearAllDisconnectTimers();
    rateLimiter.destroy();
    if (typeof io.disconnectSockets === "function") {
      io.disconnectSockets(true);
    }
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (server.listening) {
      if (typeof (server as any).closeIdleConnections === "function") {
        (server as any).closeIdleConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };

  return {
    server,
    io,
    shutdownCoordinator,
    roomStore,
    roomService,
    gameService,
    rateLimiter,
    config: env,
    port: boundPort,
    url: boundUrl,
    close,
  };
}

// Auto-start if executed directly via node or CLI
const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]!);

if (isMain) {
  startServer().catch((err) => {
    const bootstrapCorrelationId = randomUUID();
    const fallbackLogger = new PinoLogger({
      level: (process.env.LOG_LEVEL as any) ?? "info",
    });
    fallbackLogger.fatal("Fatal bootstrap error during server startup", {
      operation: "server_bootstrap_fatal",
      correlationId: bootstrapCorrelationId,
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : { raw: err },
    });
    process.exit(1);
  });
}
