import type http from "node:http";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { serializeError } from "@fun-chess/shared";
import {
  createSocketServer,
  createSocketRateLimiter,
  type TypedSocketServer,
  type SocketRateLimiter,
} from "../platform/socket/index.js";
import {
  registerRoomSocketHandlers,
  handleSocketDisconnect,
} from "../features/rooms/index.js";
import { registerGameSocketHandlers } from "../features/game/index.js";
import type { Logger } from "../platform/logger/index.js";
import type { ServerEnv } from "../platform/config/index.js";
import type { DomainServices } from "./domain_services.js";
import type { ServerBootstrapConfig } from "./http_layer.js";

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
