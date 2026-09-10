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
  defaultLogger,
} from "./platform/logger/index.js";
import {
  createHttpServer,
  type HttpRateLimiter,
  type IFileStorage,
} from "./platform/http/index.js";
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
import {
  type IClock,
  type IIdGenerator,
  serializeError,
} from "@fun-chess/shared";
import {
  InMemoryRoomStore,
  type RoomStore,
  MAX_ROOMS,
  RoomService,
  type IRoomService,
  clearAllDisconnectTimers,
  DisconnectTimerRegistry,
  type IDisconnectTimerRegistry,
  registerRoomSocketHandlers,
  handleSocketDisconnect,
  InMemorySessionRegistry,
  type SessionRegistry,
} from "./features/rooms/index.js";
import {
  GameService,
  type IGameService,
  registerGameSocketHandlers,
} from "./features/game/index.js";
import {
  RelayAddressService,
  type IRelayAddressService,
} from "./features/lan/index.js";

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
  fileStorage?: IFileStorage;
  autoListen?: boolean;
  timerRegistry?: IDisconnectTimerRegistry;
  onExit?: (code: number) => void;
  relayAddressService?: IRelayAddressService;
  allowedOrigins?: string[];
  httpRateLimiter?: HttpRateLimiter;
  socketRateLimiter?: SocketRateLimiter;
  roomCreateRateLimiter?: SocketRateLimiter;
}

export interface ServerInstance {
  server: http.Server;
  io: TypedSocketServer;
  shutdownCoordinator: ShutdownCoordinator;
  roomStore: RoomStore;
  roomService: IRoomService;
  gameService: IGameService;
  sessionRegistry: SessionRegistry;
  relayAddressService: IRelayAddressService;
  timerRegistry: IDisconnectTimerRegistry;
  logger: Logger;
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
  roomService: IRoomService;
  gameService: IGameService;
  relayAddressService: IRelayAddressService;
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
  const resolvedLogger = logger ?? options.logger ?? defaultLogger;
  const timerRegistry = options.timerRegistry ?? new DisconnectTimerRegistry();
  const clock = options.clock ?? new SystemClock();
  const idGenerator = options.idGenerator ?? new UuidGenerator();
  const sessionRegistry =
    options.sessionRegistry ??
    new InMemorySessionRegistry(clock, idGenerator, resolvedLogger, env.SESSION_SECRET);
  const roomStore =
    options.roomStore ??
    new InMemoryRoomStore({
      clock,
      logger: resolvedLogger,
      maxRooms: env.MAX_ROOMS ?? MAX_ROOMS,
      maxCancelledTickets: 5_000,
    });
  const roomService = new RoomService(
    roomStore,
    sessionRegistry,
    clock,
    idGenerator,
    timerRegistry,
    resolvedLogger,
  );
  const gameService = new GameService(
    roomService,
    clock,
    idGenerator,
    resolvedLogger,
    sessionRegistry,
  );
  const relayAddressService =
    options.relayAddressService ??
    new RelayAddressService({
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
  const { roomService, gameService, timerRegistry } = domainServices;

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
      const socketUserId = (socket.data as Record<string, unknown> | undefined)?.userId as string | undefined;
      logger.error("Client socket transport error", {
        operation: "socket_error",
        correlationId: connectionCorrelationId,
        socketId: socket.id,
        ...(socketUserId ? { userId: socketUserId } : {}),
        error: serializeError(err),
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
      env.TRUST_PROXY,
    );

    // Wrap async disconnect listener in try/catch with structured error log
    socket.on("disconnect", async (reason) => {
      const socketUserId = (socket.data as Record<string, unknown> | undefined)?.userId as string | undefined;
      const disconnectCorrelationId = randomUUID();
      const startTime = performance.now();
      logger.info("Client socket disconnected", {
        operation: "socket_disconnected",
        correlationId: disconnectCorrelationId,
        socketId: socket.id,
        reason,
        ...(socketUserId ? { userId: socketUserId } : {}),
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
        const duration = Math.round(performance.now() - startTime);
        logger.info("Client socket disconnect handler completed", {
          operation: "socket_disconnected",
          correlationId: disconnectCorrelationId,
          socketId: socket.id,
          reason,
          duration,
          durationMs: duration,
          status: "success",
          ...(socketUserId ? { userId: socketUserId } : {}),
        });
      } catch (err: unknown) {
        const duration = Math.round(performance.now() - startTime);
        logger.error("Client socket disconnect handler failed", {
          operation: "socket_disconnected",
          status: "failed",
          correlationId: disconnectCorrelationId,
          socketId: socket.id,
          reason,
          duration,
          durationMs: duration,
          error: serializeError(err),
          ...(socketUserId ? { userId: socketUserId } : {}),
        });
      }
    });
  });
}

/**
 * Sets up periodic room and session cleanup tasks with structured logging (MAJ-031).
 */
export function setupBackgroundJobs(
  roomService: IRoomService,
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
          error: serializeError(err),
        });
      }
    },
    5 * 60 * 1000,
  );
  cleanupInterval.unref?.();
  return cleanupInterval;
}

export interface ServerBootstrapConfig {
  env: ServerEnv;
  allowedOrigins: string[];
  logger: Logger;
  port: number;
  host: string;
  isProduction: boolean;
  distPath: string;
  bootstrapCorrelationId: string;
  startTime: number;
}

/**
 * Resolves and validates environment configuration for server bootstrapping (MAJ-015, SEC-RT-003).
 */
export function resolveServerBootstrapConfig(
  options: StartServerOptions,
): ServerBootstrapConfig {
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
  const allowedOrigins = options.allowedOrigins ?? resolveAllowedOrigins(env);
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

  return {
    env,
    allowedOrigins,
    logger,
    port,
    host,
    isProduction,
    distPath,
    bootstrapCorrelationId,
    startTime,
  };
}

export interface HttpLayerSetupParams {
  domainServices: DomainServices;
  bootstrapConfig: ServerBootstrapConfig;
  fileStorage?: IFileStorage;
  httpRateLimiter?: HttpRateLimiter;
  getActiveSocketCount: () => number;
}

/**
 * Configures HTTP server with API routes, rate limiting, and SPA static handling (MAJ-003, MIN-005).
 */
export function setupHttpLayer(params: HttpLayerSetupParams): http.Server {
  const { domainServices, bootstrapConfig, fileStorage, httpRateLimiter, getActiveSocketCount } = params;
  const { env, allowedOrigins, logger, port, distPath } = bootstrapConfig;

  const httpHandler = createHttpServer({
    roomStore: domainServices.roomStore,
    relayAddressService: domainServices.relayAddressService,
    logger,
    port,
    distPath,
    fileStorage,
    allowedOrigins,
    env,
    metricsSecret: env.METRICS_SECRET,
    rateLimiter: httpRateLimiter,
    getActiveSocketCount,
  });

  const server = http.createServer(httpHandler);
  server.requestTimeout = 30_000;
  server.headersTimeout = 31_000;
  server.keepAliveTimeout = 5_000;

  return server;
}

export interface SocketLayerSetupParams {
  server: http.Server;
  domainServices: DomainServices;
  bootstrapConfig: ServerBootstrapConfig;
  socketRateLimiter?: SocketRateLimiter;
  roomCreateRateLimiter?: SocketRateLimiter;
}

export interface SocketLayer {
  io: TypedSocketServer;
  rateLimiter: SocketRateLimiter;
  roomCreateRateLimiter: SocketRateLimiter;
}

/**
 * Sets up Socket.io server, rate limiting instances, and ingress gateways (MAJ-003, MAJ-031).
 */
export function setupSocketLayer(params: SocketLayerSetupParams): SocketLayer {
  const { server, domainServices, bootstrapConfig, socketRateLimiter, roomCreateRateLimiter: optRoomCreateLimiter } = params;
  const { allowedOrigins, logger, env } = bootstrapConfig;

  const io = createSocketServer(server, {
    allowedOrigins,
    logger,
    env,
  });

  const rateLimiter =
    socketRateLimiter ??
    createSocketRateLimiter({
      maxKeys: env.RATE_LIMIT_MAX_KEYS ?? 10_000,
      windowMs: env.RATE_LIMIT_WINDOW_MS ?? 10_000,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS ?? (env.NODE_ENV === "production" ? 60 : 1000),
      logger,
    });

  const roomCreateRateLimiter =
    optRoomCreateLimiter ??
    createSocketRateLimiter({
      maxRequests: env.RATE_LIMIT_ROOM_CREATE_MAX,
      windowMs: 60_000,
      logger,
    });

  setupSocketGateway(io, domainServices, rateLimiter, env, logger, roomCreateRateLimiter);

  return { io, rateLimiter, roomCreateRateLimiter };
}

export interface LifecycleSetupParams {
  server: http.Server;
  io: TypedSocketServer;
  bootstrapConfig: ServerBootstrapConfig;
  domainServices: DomainServices;
  rateLimiter: SocketRateLimiter;
  roomCreateRateLimiter: SocketRateLimiter;
  httpRateLimiter?: HttpRateLimiter;
  onExit?: (code: number) => void;
}

export interface LifecycleComponents {
  shutdownCoordinator: ShutdownCoordinator;
  cleanupInterval: NodeJS.Timeout;
}

/**
 * Configures background cleanup tasks and graceful termination coordinator (CRIT-002, MAJ-010).
 */
export function setupLifecycle(params: LifecycleSetupParams): LifecycleComponents {
  const { server, io, bootstrapConfig, domainServices, rateLimiter, roomCreateRateLimiter, httpRateLimiter, onExit: optOnExit } = params;
  const { logger, env } = bootstrapConfig;
  const { roomService, timerRegistry } = domainServices;

  const cleanupInterval = setupBackgroundJobs(roomService, logger);

  const onExit =
    optOnExit ??
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
        httpRateLimiter?.destroy();
        rateLimiter.destroy();
        roomCreateRateLimiter.destroy();
      },
    ],
  };

  const shutdownCoordinator = new ShutdownCoordinator(coordinatorOptions);
  if (env.NODE_ENV !== "test") {
    shutdownCoordinator.installProcessHandlers();
  }

  return { shutdownCoordinator, cleanupInterval };
}

export interface BindHttpServerParams {
  server: http.Server;
  host: string;
  port: number;
}

/**
 * Binds HTTP server to target port and host with error listener cleanup (MAJ-009).
 */
export async function bindHttpServer(
  params: BindHttpServerParams,
): Promise<{ boundPort: number; boundUrl: string }> {
  const { server, host, port } = params;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const addr = server.address();
  const boundPort = addr && typeof addr === "object" ? addr.port : port;
  const boundUrl = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${boundPort}`;

  return { boundPort, boundUrl };
}

export interface CloseHandlerParams {
  server: http.Server;
  io: TypedSocketServer;
  logger: Logger;
  cleanupInterval: NodeJS.Timeout;
  timerRegistry: IDisconnectTimerRegistry;
  shutdownCoordinator: ShutdownCoordinator;
  rateLimiter: SocketRateLimiter;
  roomCreateRateLimiter: SocketRateLimiter;
  httpRateLimiter?: HttpRateLimiter;
}

/**
 * Creates programmatic close handle with timeout race and guaranteed timer release (MAJ-008).
 */
export function createCloseHandler(
  params: CloseHandlerParams,
): () => Promise<void> {
  const { server, io, logger, cleanupInterval, timerRegistry, shutdownCoordinator, rateLimiter, roomCreateRateLimiter, httpRateLimiter } = params;

  return async (): Promise<void> => {
    const closeCorrelationId = randomUUID();
    const closeStartTime = performance.now();
    logger.info("Fun Chess server closing...", {
      operation: "server_close",
      correlationId: closeCorrelationId,
    });

    let timer: NodeJS.Timeout | undefined;
    try {
      const closePromise = (async () => {
        clearInterval(cleanupInterval);
        timerRegistry.clear();
        clearAllDisconnectTimers();
        httpRateLimiter?.destroy();
        rateLimiter.destroy();
        roomCreateRateLimiter.destroy();
        shutdownCoordinator.dispose();

        if (typeof io.disconnectSockets === "function") {
          io.disconnectSockets(true);
        }

        await new Promise<void>((resolve, reject) => {
          io.close((err) => (err ? reject(err) : resolve()));
        });

        if (server.listening) {
          const sWithConn = server as http.Server & {
            closeIdleConnections?: () => void;
            closeAllConnections?: () => void;
          };
          sWithConn.closeIdleConnections?.();
          sWithConn.closeAllConnections?.();

          await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
          });
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
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
        error: serializeError(err),
      });
      throw err;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };
}

/**
 * Emits structured logging upon successful server startup (MAJ-031).
 */
export function logBootstrapSuccess(
  bootstrapConfig: ServerBootstrapConfig,
  relayAddressService: IRelayAddressService,
  boundPort: number,
): void {
  const { logger, bootstrapCorrelationId, startTime, isProduction, env } = bootstrapConfig;
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

/**
 * Main application bootstrap function.
 * Wires storage adapters, business logic services, HTTP/SPA routing, and Socket.io ingress.
 * Returns running ServerInstance with lifecycle handles (MAJ-033, MAJ-031).
 */
export async function startServer(options: StartServerOptions = {}): Promise<ServerInstance> {
  const bootstrapConfig = resolveServerBootstrapConfig(options);
  const { logger, bootstrapCorrelationId, env, port, host } = bootstrapConfig;

  logger.info("Initializing Fun Chess server bootstrap...", {
    operation: "server_bootstrap",
    correlationId: bootstrapCorrelationId,
    port,
    host,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    trustProxy: env.TRUST_PROXY,
  });

  const domainServices = setupDomainServices(options, env, port, logger);
  const ioRef: { current?: TypedSocketServer } = {};

  const server = setupHttpLayer({
    domainServices,
    bootstrapConfig,
    fileStorage: options.fileStorage,
    httpRateLimiter: options.httpRateLimiter,
    getActiveSocketCount: () => (ioRef.current ? ioRef.current.sockets.sockets.size : 0),
  });

  const { io, rateLimiter, roomCreateRateLimiter } = setupSocketLayer({
    server,
    domainServices,
    bootstrapConfig,
    socketRateLimiter: options.socketRateLimiter,
    roomCreateRateLimiter: options.roomCreateRateLimiter,
  });
  ioRef.current = io;

  const { shutdownCoordinator, cleanupInterval } = setupLifecycle({
    server,
    io,
    bootstrapConfig,
    domainServices,
    rateLimiter,
    roomCreateRateLimiter,
    httpRateLimiter: options.httpRateLimiter,
    onExit: options.onExit,
  });

  const autoListen = options.autoListen ?? true;
  let boundPort = port;
  let boundUrl = `http://${host}:${port}`;

  try {
    if (autoListen) {
      const bound = await bindHttpServer({ server, host, port });
      boundPort = bound.boundPort;
      boundUrl = bound.boundUrl;
      logBootstrapSuccess(bootstrapConfig, domainServices.relayAddressService, boundPort);
    }
  } catch (bootstrapError) {
    const duration = Math.round(performance.now() - bootstrapConfig.startTime);
    logger.error("Fun Chess server bootstrap failed", {
      operation: "server_bootstrap",
      correlationId: bootstrapCorrelationId,
      status: "failed",
      duration,
      durationMs: duration,
      port,
      host,
      error: serializeError(bootstrapError),
    });
    clearInterval(cleanupInterval);
    domainServices.timerRegistry.clear();
    clearAllDisconnectTimers();
    rateLimiter.destroy();
    roomCreateRateLimiter.destroy();
    shutdownCoordinator.dispose();
    throw bootstrapError;
  }

  const close = createCloseHandler({
    server,
    io,
    logger,
    cleanupInterval,
    timerRegistry: domainServices.timerRegistry,
    shutdownCoordinator,
    rateLimiter,
    roomCreateRateLimiter,
    httpRateLimiter: options.httpRateLimiter,
  });

  return {
    server,
    io,
    shutdownCoordinator,
    roomStore: domainServices.roomStore,
    roomService: domainServices.roomService,
    gameService: domainServices.gameService,
    sessionRegistry: domainServices.sessionRegistry,
    relayAddressService: domainServices.relayAddressService,
    timerRegistry: domainServices.timerRegistry,
    logger,
    rateLimiter,
    roomCreateRateLimiter,
    config: env,
    port: boundPort,
    url: boundUrl,
    close,
  };
}

export const FALLBACK_LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
] as const;

export type FallbackLogLevel = (typeof FALLBACK_LOG_LEVELS)[number];

/**
 * Safely parses and validates an unknown log level string against the allowed log levels.
 * Returns the matching FallbackLogLevel or defaults to "info" on invalid or missing values (ENH-001).
 */
export function parseFallbackLogLevel(rawLevel: unknown): FallbackLogLevel {
  if (typeof rawLevel !== "string") {
    return "info";
  }
  const normalized = rawLevel.trim().toLowerCase();
  return (FALLBACK_LOG_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as FallbackLogLevel)
    : "info";
}

// Auto-start if executed directly via node or CLI
const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]!);

if (isMain) {
  startServer().catch((err) => {
    const bootstrapCorrelationId = randomUUID();
    const safeLogLevel = parseFallbackLogLevel(process.env.LOG_LEVEL);
    const fallbackLogger = new PinoLogger({
      level: safeLogLevel,
    });
    fallbackLogger.fatal("Fatal bootstrap error during server startup", {
      operation: "server_bootstrap_fatal",
      correlationId: bootstrapCorrelationId,
      error: serializeError(err),
    });
    process.exit(1);
  });
}
