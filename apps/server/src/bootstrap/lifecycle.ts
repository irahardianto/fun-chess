import type http from "node:http";
import {
  ShutdownCoordinator,
  type ShutdownCoordinatorOptions,
} from "../platform/lifecycle/index.js";
import {
  type Logger,
  runLoggedJob,
} from "../platform/logger/index.js";
import type {
  TypedSocketServer,
  SocketRateLimiter,
} from "../platform/socket/index.js";
import type { HttpRateLimiter } from "../platform/http/index.js";
import {
  clearAllDisconnectTimers,
  type IRoomService,
  type ITimerService,
  type TimerHandle,
  SystemTimerService,
} from "../features/rooms/index.js";
import type { DomainServices } from "./domain_services.js";
import type { ServerBootstrapConfig } from "./http_layer.js";

/**
 * Sets up periodic room and session cleanup tasks with structured logging (MAJ-031).
 * Uses injected ITimerService to schedule recurring periodic execution (AC-16 / MAJ-014).
 * Propagates jobCorrelationId to cleanupAbandonedRooms for audit traceability (AC-13 / MAJ-010).
 */
export function setupBackgroundJobs(
  roomService: IRoomService,
  logger: Logger,
  timerService: ITimerService = new SystemTimerService(),
): TimerHandle {
  const cleanupInterval = timerService.setInterval(
    async () => {
      try {
        await runLoggedJob(logger, "room_cleanup", async (jobCorrelationId) => {
          const count = await roomService.cleanupAbandonedRooms(
            10 * 60 * 1000,
            jobCorrelationId,
          );
          return { cleanedCount: count };
        });
      } catch (err: unknown) {
        // Prevent unhandled rejection in setInterval callback.
        // runLoggedJob already logged the failure with the job's correlationId and duration (MAJ-015).
        void err;
      }
    },
    5 * 60 * 1000,
  );
  cleanupInterval.unref?.();
  return cleanupInterval;
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
  cleanupInterval: TimerHandle;
}

/**
 * Configures background cleanup tasks and graceful termination coordinator (CRIT-002, MAJ-010).
 */
export function setupLifecycle(params: LifecycleSetupParams): LifecycleComponents {
  const { server, io, bootstrapConfig, domainServices, rateLimiter, roomCreateRateLimiter, httpRateLimiter, onExit: optOnExit } = params;
  const { logger, env } = bootstrapConfig;
  const { roomService, timerRegistry, timerService } = domainServices;

  const cleanupInterval = setupBackgroundJobs(roomService, logger, timerService);

  const onExit =
    optOnExit ??
    (env.NODE_ENV === "test" ? () => {} : (code: number) => process.exit(code));

  const coordinatorOptions: ShutdownCoordinatorOptions = {
    server,
    io,
    logger,
    cleanupInterval,
    timerService,
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
