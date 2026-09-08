import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  validateServerConfig,
  resolveAllowedOrigins,
  type ServerEnv,
} from "./platform/config/index.js";
import {
  PinoLogger,
  type Logger,
  runLoggedJob,
} from "./platform/logger/index.js";
import { createHttpServer } from "./platform/http/index.js";
import {
  createSocketServer,
  createSocketRateLimiter,
  type TypedSocketServer,
  type SocketRateLimiter,
} from "./platform/socket/index.js";
import {
  ShutdownCoordinator,
  type ShutdownCoordinatorOptions,
} from "./platform/lifecycle/index.js";
import {
  SystemClock,
  UuidGenerator,
} from "./platform/time/index.js";
import type { IClock, IIdGenerator } from "@fun-chess/shared";
import {
  InMemoryRoomStore,
  type RoomStore,
  RoomService,
  clearAllDisconnectTimers,
  defaultDisconnectTimerRegistry,
  type IDisconnectTimerRegistry,
  registerRoomSocketHandlers,
  handleSocketDisconnect,
} from "./features/rooms/index.js";
import {
  GameService,
  registerGameSocketHandlers,
} from "./features/game/index.js";
import { RelayAddressService } from "./features/lan/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StartServerOptions {
  config?: Partial<ServerEnv>;
  port?: number;
  host?: string;
  logger?: Logger;
  roomStore?: RoomStore;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  distPath?: string;
  autoListen?: boolean;
  timerRegistry?: IDisconnectTimerRegistry;
  onExit?: (code: number) => void;
}

export interface ServerInstance {
  server: http.Server;
  io: TypedSocketServer;
  shutdownCoordinator: ShutdownCoordinator;
  roomStore: RoomStore;
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
  // 1. Centralized Fail-Fast Environment Validation (MAJ-015, MAJ-016, MAJ-004, MAJ-001, SEC-RT-003)
  const rawMerged: Record<string, unknown> = {
    ...process.env,
    ...(options.config || {}),
  };

  if (options.port !== undefined) {
    rawMerged.PORT = options.port;
  }
  if (options.host !== undefined) {
    rawMerged.HOST = options.host;
  }

  const env: ServerEnv = validateServerConfig(rawMerged);
  const allowedOrigins = resolveAllowedOrigins(env);

  const logger =
    options.logger ??
    new PinoLogger({
      level: env.LOG_LEVEL,
    });

  const port = options.port ?? env.PORT;
  const host = options.host ?? env.HOST;
  const isProduction = env.NODE_ENV === "production";
  const distPath =
    options.distPath ?? env.CLIENT_DIST_PATH ?? path.resolve(__dirname, "../../client/dist");

  const bootstrapCorrelationId = randomUUID();
  const startTime = performance.now();
  logger.info("Initializing Fun Chess server bootstrap...", {
    operation: "server_bootstrap",
    correlationId: bootstrapCorrelationId,
    port,
    host,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    trustProxy: env.TRUST_PROXY,
  });

  // 2. Instantiate Storage Adapters & Domain Services
  const timerRegistry = options.timerRegistry ?? defaultDisconnectTimerRegistry;
  const roomStore = options.roomStore ?? new InMemoryRoomStore();
  const clock = options.clock ?? new SystemClock();
  const idGenerator = options.idGenerator ?? new UuidGenerator();
  const roomService = new RoomService(
    roomStore,
    undefined,
    clock,
    idGenerator,
    timerRegistry,
  );
  const gameService = new GameService(roomStore, clock, idGenerator);
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

  // Configure connection timeouts (MIN-007)
  server.requestTimeout = 30_000;
  server.headersTimeout = 31_000;
  server.keepAliveTimeout = 5_000;

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
    registerGameSocketHandlers(
      io,
      socket,
      gameService,
      logger,
      rateLimiter,
      timerRegistry,
    );

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
          return { cleanedCount: count };
        });
      } catch (err) {
        // Log scheduled job error explicitly (no silent catches)
        logger.debug("Scheduled room_cleanup caught rejection", {
          operation: "room_cleanup",
          error:
            err instanceof Error
              ? { name: err.name, message: err.message }
              : { raw: err },
        });
      }
    },
    5 * 60 * 1000,
  );
  cleanupInterval.unref?.();

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

    const duration = Math.round(performance.now() - startTime);
    logger.info("Fun Chess server started successfully", {
      operation: "server_bootstrap",
      correlationId: bootstrapCorrelationId,
      status: "success",
      duration,
      durationMs: duration,
      port: boundPort,
      relayMode: addrInfo.relayMode,
      isCloudRelay: addrInfo.isCloudRelay,
      lanIp: addrInfo.lanIp,
      joinUrl: addrInfo.joinUrl,
      publicUrl: addrInfo.publicUrl,
      localUrl: addrInfo.localUrl,
    });

    // Structured logger for banner (ENH-004)
    if (!isProduction && env.NODE_ENV !== "test" && Boolean(process.stdout.isTTY)) {
      logger.info("Fun Chess server ready", {
        operation: "server_banner",
        correlationId: bootstrapCorrelationId,
        relayMode: addrInfo.relayMode,
        localUrl: addrInfo.localUrl,
        joinUrl: addrInfo.joinUrl,
        publicUrl: addrInfo.publicUrl,
      });
    }
  }

  const close = async (): Promise<void> => {
    const closeCorrelationId = randomUUID();
    const closeStartTime = performance.now();
    logger.info("Fun Chess server closing...", {
      operation: "server_close",
      correlationId: closeCorrelationId,
    });

    try {
      clearInterval(cleanupInterval);
      timerRegistry.clear();
      clearAllDisconnectTimers();
      rateLimiter.destroy();
      if (typeof io.disconnectSockets === "function") {
        io.disconnectSockets(true);
      }
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (server.listening) {
        const sWithConn = server as http.Server & {
          closeIdleConnections?: () => void;
          closeAllConnections?: () => void;
        };
        if (typeof sWithConn.closeIdleConnections === "function") {
          sWithConn.closeIdleConnections();
        }
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      const closeDuration = Math.round(performance.now() - closeStartTime);
      logger.info("Fun Chess server closed successfully", {
        operation: "server_close",
        correlationId: closeCorrelationId,
        status: "success",
        duration: closeDuration,
        durationMs: closeDuration,
      });
    } catch (err) {
      const closeDuration = Math.round(performance.now() - closeStartTime);
      logger.error("Fun Chess server close error", {
        operation: "server_close",
        correlationId: closeCorrelationId,
        status: "failed",
        duration: closeDuration,
        durationMs: closeDuration,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
      throw err;
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
    const rawLogLevel = process.env.LOG_LEVEL;
    const validLogLevels = ["trace", "debug", "info", "warn", "error", "fatal"];
    const safeLogLevel =
      typeof rawLogLevel === "string" && validLogLevels.includes(rawLogLevel.toLowerCase())
        ? (rawLogLevel.toLowerCase() as any)
        : "info";
    const fallbackLogger = new PinoLogger({
      level: safeLogLevel,
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
