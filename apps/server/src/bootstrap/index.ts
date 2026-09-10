import type http from "node:http";
import { performance } from "node:perf_hooks";
import { serializeError } from "@fun-chess/shared";
import type { ServerEnv } from "../platform/config/index.js";
import type { Logger } from "../platform/logger/index.js";
import type {
  TypedSocketServer,
  SocketRateLimiter,
} from "../platform/socket/index.js";
import type { ShutdownCoordinator } from "../platform/lifecycle/index.js";
import {
  clearAllDisconnectTimers,
  type RoomStore,
  type IRoomService,
  type SessionRegistry,
  type IDisconnectTimerRegistry,
  type ITimerService,
} from "../features/rooms/index.js";
import type { IGameService } from "../features/game/index.js";
import type { IRelayAddressService } from "../features/lan/index.js";
import {
  setupDomainServices,
  type StartServerOptions,
  type DomainServices,
} from "./domain_services.js";
import {
  setupSocketGateway,
  setupSocketLayer,
  type SocketLayer,
  type SocketLayerSetupParams,
} from "./socket_gateway.js";
import {
  setupHttpLayer,
  bindHttpServer,
  createCloseHandler,
  logBootstrapSuccess,
  resolveServerBootstrapConfig,
  parseFallbackLogLevel,
  FALLBACK_LOG_LEVELS,
  type ServerBootstrapConfig,
  type HttpLayerSetupParams,
  type BindHttpServerParams,
  type CloseHandlerParams,
  type FallbackLogLevel,
} from "./http_layer.js";
import {
  setupLifecycle,
  setupBackgroundJobs,
  type LifecycleSetupParams,
  type LifecycleComponents,
} from "./lifecycle.js";

export {
  // Domain services
  setupDomainServices,
  type StartServerOptions,
  type DomainServices,
  // Socket gateway & layer
  setupSocketGateway,
  setupSocketLayer,
  type SocketLayer,
  type SocketLayerSetupParams,
  // HTTP layer & helpers
  setupHttpLayer,
  bindHttpServer,
  createCloseHandler,
  logBootstrapSuccess,
  resolveServerBootstrapConfig,
  parseFallbackLogLevel,
  FALLBACK_LOG_LEVELS,
  type ServerBootstrapConfig,
  type HttpLayerSetupParams,
  type BindHttpServerParams,
  type CloseHandlerParams,
  type FallbackLogLevel,
  // Lifecycle & jobs
  setupLifecycle,
  setupBackgroundJobs,
  type LifecycleSetupParams,
  type LifecycleComponents,
};

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
  timerService: ITimerService;
  logger: Logger;
  rateLimiter: SocketRateLimiter;
  roomCreateRateLimiter: SocketRateLimiter;
  config: ServerEnv;
  port: number;
  url: string;
  close: () => Promise<void>;
}

/**
 * Main application bootstrap function.
 * Wires storage adapters, business logic services, HTTP/SPA routing, and Socket.io ingress.
 * Returns running ServerInstance with lifecycle handles (MAJ-033, MAJ-031, MAJ-027).
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
    domainServices.timerService.clearInterval(cleanupInterval);
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
    timerService: domainServices.timerService,
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
    timerService: domainServices.timerService,
    logger,
    rateLimiter,
    roomCreateRateLimiter,
    config: env,
    port: boundPort,
    url: boundUrl,
    close,
  };
}
