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
  InMemorySessionRegistry,
  type SessionRegistry,
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
  sessionRegistry?: SessionRegistry;
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
  sessionRegistry: SessionRegistry;
  rateLimiter: SocketRateLimiter;
  roomCreateRateLimiter: SocketRateLimiter;
  config: ServerEnv;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export interface DomainServices {
  timerRegistry: IDisconnectTimerRegistry;
  roomStore: RoomStore;
  clock: IClock;
  idGenerator: IIdGenerator;
  sessionRegistry: SessionRegistry;
  roomService: RoomService;
  gameService: GameService;
  relayAddressService: RelayAddressService;
}

/**
 * Initializes domain storage adapters, business logic services, and network addressing (MAJ-031).
 */
export function setupDomainServices(
  options: StartServerOptions,
  env: ServerEnv,
  port: number,
  logger?: Logger,
): DomainServices {
  const timerRegistry = options.timerRegistry ?? defaultDisconnectTimerRegistry;
  const clock = options.clock ?? new SystemClock();
  const idGenerator = options.idGenerator ?? new UuidGenerator();
  const sessionRegistry =
    options.sessionRegistry ?? new InMemorySessionRegistry(clock, idGenerator);
  const roomStore = options.roomStore ?? new InMemoryRoomStore(clock, idGenerator, logger);
  const roomService = new RoomService(
    roomStore,
    sessionRegistry,
    clock,
    idGenerator,
    timerRegistry,
    logger,
  );
  const gameService = new GameService(roomService, clock, idGenerator, sessionRegistry);
  const relayAddressService = new RelayAddressService({
    publicUrl: env.PUBLIC_URL,
    host: env.HOST,
    port,
    lanIp: env.LAN_IP,
    hostIp: env.HOST_IP,
  });

  return {
    timerRegistry,
    roomStore,
    clock,
    idGenerator,
    sessionRegistry,
    roomService,
    gameService,
    relayAddressService,
  };
}

/**
 * Configures Socket.io ingress event listeners, rate limiting, and structured logging (MAJ-031).
 */
export function setupSocketGateway(
  io: TypedSocketServer,
  domainServices: DomainServices,
  rateLimiter: SocketRateLimiter,
  env: ServerEnv,
  logger: Logger,
  roomCreateRateLimiter?: SocketRateLimiter,
): void {
  const { roomService, gameService, timerRegistry, sessionRegistry } = domainServices;

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
      roomCreateRateLimiter,
      env.TRUST_PROXY,
    );
    registerGameSocketHandlers(
      io,
      socket,
      gameService,
      logger,
      rateLimiter,
      timerRegistry,
      sessionRegistry,
      env.TRUST_PROXY,
    );

    // Wrap async disconnect listener in try/catch with structured error log
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
}

/**
 * Sets up periodic room and session cleanup tasks with structured logging (MAJ-031).
 */
export function setupBackgroundJobs(
  roomService: RoomService,
  logger: Logger,
): NodeJS.Timeout {
  const cleanupInterval = setInterval(
    async () => {
      try {
        await runLoggedJob(logger, "room_cleanup", async () => {
          const count = await roomService.cleanupAbandonedRooms(10 * 60 * 1000);
          return { cleanedCount: count };
        });
      } catch (err) {
        logger.error("Scheduled room_cleanup caught rejection", {
          operation: "room_cleanup",
          correlationId: randomUUID(),
          error:
            err instanceof Error
              ? { name: err.name, message: err.message, stack: err.stack }
              : { raw: err },
        });
      }
    },
    5 * 60 * 1000,
  );
  cleanupInterval.unref?.();
  return cleanupInterval;
}

/**
 * Main application bootstrap function.
 * Wires storage adapters, business logic services, HTTP/SPA routing, and Socket.io ingress.
 * Returns running ServerInstance with lifecycle handles (MAJ-033, MAJ-031).
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

  // 2. Instantiate Storage Adapters & Domain Services (MAJ-031)
  const domainServices = setupDomainServices(options, env, port, logger);
  const { timerRegistry, roomStore, roomService, gameService, relayAddressService } = domainServices;

  const ioRef: { current?: TypedSocketServer } = {};

  // 3. Setup Native HTTP Server with API & SPA Static File Routing (MAJ-003, MAJ-019, MAJ-004)
  const httpHandler = createHttpServer({
    roomStore,
    relayAddressService,
    logger,
    port,
    distPath,
    allowedOrigins,
    env,
    getActiveSocketCount: () => (ioRef.current ? ioRef.current.sockets.sockets.size : 0),
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
  ioRef.current = io;

  // Shared Socket Rate Limiter singleton (SEC-HIGH-001, MAJ-001, MAJ-003, MAJ-015)
  const rateLimiter = createSocketRateLimiter({
    maxKeys: env.RATE_LIMIT_MAX_KEYS ?? 10_000,
    windowMs: env.RATE_LIMIT_WINDOW_MS ?? 10_000,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS ?? (env.NODE_ENV === "production" ? 60 : 1000),
    logger,
  });

  const roomCreateRateLimiter = createSocketRateLimiter({
    maxRequests: env.RATE_LIMIT_ROOM_CREATE_MAX,
    windowMs: 60_000,
    logger,
  });

  // 5. Register Feature Socket Ingress Handlers & Transport Error Logging (MAJ-031)
  setupSocketGateway(io, domainServices, rateLimiter, env, logger, roomCreateRateLimiter);

  // 6. Periodic Abandoned Room & Expired Session Cleanup (MAJ-031)
  const cleanupInterval = setupBackgroundJobs(roomService, logger);

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
        roomCreateRateLimiter.destroy();
      },
    ],
  };

  const shutdownCoordinator = new ShutdownCoordinator(coordinatorOptions);

  if (env.NODE_ENV !== "test") {
    shutdownCoordinator.installProcessHandlers();
  }

  // 8. Bind and Start Server with robust cleanup on bootstrap error (MAJ-009)
  const autoListen = options.autoListen ?? true;
  let boundPort = port;
  let boundUrl = `http://${host}:${port}`;

  try {
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
  } catch (bootstrapError) {
    const duration = Math.round(performance.now() - startTime);
    logger.error("Fun Chess server bootstrap failed", {
      operation: "server_bootstrap",
      correlationId: bootstrapCorrelationId,
      status: "failed",
      duration,
      durationMs: duration,
      port,
      host,
      error:
        bootstrapError instanceof Error
          ? { name: bootstrapError.name, message: bootstrapError.message, stack: bootstrapError.stack }
          : { raw: bootstrapError },
    });
    // Clean up background jobs, rate limiters, and listeners on startup error (MAJ-009)
    clearInterval(cleanupInterval);
    timerRegistry.clear();
    clearAllDisconnectTimers();
    rateLimiter.destroy();
    roomCreateRateLimiter.destroy();
    shutdownCoordinator.dispose();
    throw bootstrapError;
  }

  // Programmatic close with timeout race, connection closing, and error propagation (MAJ-007, MAJ-008)
  const close = async (): Promise<void> => {
    const closeCorrelationId = randomUUID();
    const closeStartTime = performance.now();
    logger.info("Fun Chess server closing...", {
      operation: "server_close",
      correlationId: closeCorrelationId,
    });

    try {
      const closePromise = (async () => {
        clearInterval(cleanupInterval);
        timerRegistry.clear();
        clearAllDisconnectTimers();
        rateLimiter.destroy();
        roomCreateRateLimiter.destroy();
        shutdownCoordinator.dispose();

        if (typeof io.disconnectSockets === "function") {
          io.disconnectSockets(true);
        }

        await new Promise<void>((resolve, reject) => {
          io.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        if (server.listening) {
          const sWithConn = server as http.Server & {
            closeIdleConnections?: () => void;
            closeAllConnections?: () => void;
          };
          if (typeof sWithConn.closeIdleConnections === "function") {
            sWithConn.closeIdleConnections();
          }
          if (typeof sWithConn.closeAllConnections === "function") {
            sWithConn.closeAllConnections();
          }

          await new Promise<void>((resolve, reject) => {
            server.close((err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Server close timed out after 5000ms"));
        }, 5000);
        timer.unref?.();
      });

      await Promise.race([closePromise, timeoutPromise]);

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
    sessionRegistry: domainServices.sessionRegistry,
    rateLimiter,
    roomCreateRateLimiter,
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
    const validLogLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
    type LogLevelType = (typeof validLogLevels)[number];
    const safeLogLevel: LogLevelType =
      typeof rawLogLevel === "string" && (validLogLevels as readonly string[]).includes(rawLogLevel.toLowerCase())
        ? (rawLogLevel.toLowerCase() as LogLevelType)
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
