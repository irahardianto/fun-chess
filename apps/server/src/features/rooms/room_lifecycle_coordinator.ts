import {
  AppError,
  type GameOverPayload,
  type Player,
  type RoomState,
  type IClock,
  normalizeRoomCode,
  serializeError,
} from "@fun-chess/shared";
import type { IRoomStore } from "./room.store.js";
import type { ISessionRegistry } from "./session_registry.js";
import { SystemClock } from "../../platform/time/index.js";
import {
  type Logger,
  defaultLogger,
  runLoggedJob,
} from "../../platform/logger/index.js";
import {
  type IDisconnectTimerRegistry,
  DisconnectTimerRegistry,
  DISCONNECT_GRACE_PERIOD_MS,
} from "./disconnect_timer_registry.js";
import {
  type ITimerService,
  type TimerHandle,
  SystemTimerService,
} from "./timer_service.js";
import { RoomNotFoundError } from "./room.errors.js";
import {
  disconnectPlayerTransition,
  abandonmentForfeitTransition,
} from "./room.logic.js";

/**
 * Contract for managing room lifecycle events: disconnects, abandonment grace periods,
 * forfeits, and background cleanup of stale rooms and sessions.
 */
export interface IRoomLifecycleCoordinator {
  handleDisconnect(
    socketId: string,
    onForfeit?: (
      room: RoomState,
      gameOverPayload: GameOverPayload,
      correlationId?: string,
      playerId?: string,
    ) => void | Promise<void>,
    gracePeriodMs?: number,
    timerRegistry?: IDisconnectTimerRegistry,
    correlationId?: string,
  ): Promise<{ room: RoomState; player: Player; wasActiveGame: boolean } | null>;

  handleAbandonmentForfeit(
    roomCode: string,
    disconnectedPlayerId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload } | null>;

  cleanupAbandonedRooms(maxAgeMs?: number, jobCorrelationId?: string): Promise<number>;

  cleanupExpiredSessions(): Promise<number>;
}

/**
 * Coordinates socket disconnect events, abandonment grace timers, forfeits,
 * and stale room/session background cleanup under room locks.
 */
export class RoomLifecycleCoordinator implements IRoomLifecycleCoordinator {
  private readonly clock: IClock;
  private readonly timerRegistry: IDisconnectTimerRegistry;
  private readonly timerService: ITimerService;
  private readonly logger: Logger;

  constructor(
    private readonly store: IRoomStore,
    private readonly sessionRegistry: ISessionRegistry,
    clock?: IClock,
    timerRegistry?: IDisconnectTimerRegistry,
    timerService?: ITimerService,
    logger?: Logger,
  ) {
    this.clock = clock ?? new SystemClock();
    this.timerRegistry = timerRegistry ?? new DisconnectTimerRegistry();
    this.timerService = timerService ?? new SystemTimerService();
    this.logger = logger ?? defaultLogger;
  }

  /**
   * Helper to log service failures with 4xx demotion to warn (MAJ-012).
   */
  private logServiceFailure(
    operation: string,
    actionName: string,
    startTime: number,
    correlationId: string | undefined,
    err: unknown,
    metadata?: Record<string, unknown>,
  ): void {
    const duration = this.clock.now() - startTime;
    const isClientError = err instanceof AppError && err.statusCode < 500;
    const logContext = {
      operation,
      duration,
      durationMs: duration,
      error: serializeError(err),
      ...(metadata ?? {}),
      ...(correlationId ? { correlationId } : {}),
    };
    if (isClientError) {
      this.logger.warn(`${actionName} rejected`, logContext);
    } else {
      this.logger.error(`${actionName} failed`, logContext);
    }
  }

  /**
   * Helper to synchronize timer operations across target and primary registries (MAJ-012).
   */
  private syncTimerRegistries(
    action: (registry: IDisconnectTimerRegistry) => void,
    targetRegistry: IDisconnectTimerRegistry,
  ): void {
    action(targetRegistry);
    if (targetRegistry !== this.timerRegistry) {
      action(this.timerRegistry);
    }
  }

  /**
   * Schedules disconnect abandonment forfeit timer with structured logging and error capture (MAJ-004, MAJ-012).
   */
  private scheduleAbandonmentTimer(
    roomCode: string,
    playerId: string,
    gracePeriodMs: number,
    onForfeit?: (
      room: RoomState,
      gameOverPayload: GameOverPayload,
      correlationId?: string,
      playerId?: string,
    ) => void | Promise<void>,
    targetTimerRegistry: IDisconnectTimerRegistry = this.timerRegistry,
  ): NodeJS.Timeout | TimerHandle {
    const timer = this.timerService.setTimeout(async () => {
      try {
        await runLoggedJob(
          this.logger,
          "disconnect_grace_period_abandonment",
          async (jobCorrelationId) => {
            this.syncTimerRegistries(
              (reg) => reg.cancel(roomCode, playerId),
              targetTimerRegistry,
            );
            const forfeitResult = await this.handleAbandonmentForfeit(
              roomCode,
              playerId,
              jobCorrelationId,
            );
            if (forfeitResult && onForfeit) {
              await onForfeit(
                forfeitResult.room,
                forfeitResult.gameOverPayload,
                jobCorrelationId,
                playerId,
              );
            }
            return {
              roomCode,
              playerId,
              forfeited: Boolean(forfeitResult),
            };
          },
        );
      } catch (err: unknown) {
        // MAJ-015: runLoggedJob already logs failures with correlationId, duration, and serialized error.
        // Catch prevents unhandled rejection in unref'd timer callback without duplicate logging.
        void err;
      }
    }, gracePeriodMs);

    timer.unref?.();
    return timer;
  }

  /**
   * Handles unexpected socket drop. Marks player disconnected and pauses active match.
   * Manages disconnect grace timer under the room lock to eliminate race with immediate reconnect (MAJ-028).
   */
  public async handleDisconnect(
    socketId: string,
    onForfeit?: (
      room: RoomState,
      gameOverPayload: GameOverPayload,
      correlationId?: string,
      playerId?: string,
    ) => void | Promise<void>,
    gracePeriodMs = DISCONNECT_GRACE_PERIOD_MS,
    timerRegistry?: IDisconnectTimerRegistry,
    correlationId?: string,
  ): Promise<{
    room: RoomState;
    player: Player;
    wasActiveGame: boolean;
  } | null> {
    const match = await this.store.findBySocketId(socketId);
    if (!match) return null;

    const { room: matchedRoom, playerId } = match;
    const targetTimerRegistry = timerRegistry ?? this.timerRegistry;

    return this.store.withLock(
      matchedRoom.roomCode,
      async () => {
        const room = await this.store.findByCode(matchedRoom.roomCode);
        if (!room) return null;

        // CRIT-001: verify under lock that player's current socket matches the disconnecting socket
        const currentPlayer =
          room.whitePlayer?.id === playerId
            ? room.whitePlayer
            : room.blackPlayer?.id === playerId
              ? room.blackPlayer
              : (room.spectators.find((s) => s.id === playerId) ?? null);

        if (!currentPlayer) return null;

        if (currentPlayer.socketId !== socketId) {
          this.logger.debug("Stale disconnect event ignored", {
            operation: "handle_disconnect",
            roomCode: matchedRoom.roomCode,
            playerId,
            expectedSocketId: currentPlayer.socketId,
            actualSocketId: socketId,
            ...(correlationId ? { correlationId } : {}),
          });
          return null;
        }

        const now = this.clock.now();
        const { nextRoom, paused, droppedPlayer } = disconnectPlayerTransition(
          room,
          playerId,
          now,
        );

        if (!droppedPlayer) return null;

        await this.store.save(nextRoom, undefined, { correlationId });

        if (paused) {
          // Clear any previous timer under lock and install new timer under lock (MAJ-028, MAJ-012)
          this.syncTimerRegistries(
            (reg) => reg.cancel(matchedRoom.roomCode, playerId),
            targetTimerRegistry,
          );

          const timer = this.scheduleAbandonmentTimer(
            matchedRoom.roomCode,
            playerId,
            gracePeriodMs,
            onForfeit,
            targetTimerRegistry,
          );

          this.syncTimerRegistries(
            (reg) => reg.set(matchedRoom.roomCode, playerId, timer),
            targetTimerRegistry,
          );
        }

        return { room: nextRoom, player: droppedPlayer, wasActiveGame: paused };
      },
      correlationId,
    );
  }

  /**
   * Handles disconnect grace period expiration. If player has not reconnected,
   * forfeits the match by abandonment and awards the win to the opponent.
   */
  public async handleAbandonmentForfeit(
    roomCode: string,
    disconnectedPlayerId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload } | null> {
    const normalizedCode = normalizeRoomCode(roomCode);
    const startTime = this.clock.now();

    this.logger.info("Processing abandonment forfeit", {
      operation: "room_abandonment_forfeit",
      roomCode: normalizedCode,
      disconnectedPlayerId,
      ...(correlationId ? { correlationId } : {}),
    });

    try {
      const outcome = await this.store.mutate(
        normalizedCode,
        (current) => {
          const transition = abandonmentForfeitTransition(
            current,
            disconnectedPlayerId,
            this.clock.now(),
          );
          if (!transition) {
            return { updatedRoom: current, result: null };
          }
          return {
            updatedRoom: transition.nextRoom,
            result: {
              room: transition.nextRoom,
              gameOverPayload: transition.gameOverPayload,
            },
          };
        },
        correlationId,
      );

      const duration = this.clock.now() - startTime;
      if (outcome) {
        this.logger.info("Abandonment forfeit completed successfully", {
          operation: "room_abandonment_forfeit",
          roomCode: normalizedCode,
          disconnectedPlayerId,
          winner: outcome.gameOverPayload.winner,
          duration,
          durationMs: duration,
          ...(correlationId ? { correlationId } : {}),
        });
      } else {
        this.logger.info(
          "Abandonment forfeit skipped: player reconnected or room state changed",
          {
            operation: "room_abandonment_forfeit",
            roomCode: normalizedCode,
            disconnectedPlayerId,
            duration,
            durationMs: duration,
            ...(correlationId ? { correlationId } : {}),
          },
        );
      }

      return outcome;
    } catch (error) {
      if (error instanceof RoomNotFoundError) {
        const duration = this.clock.now() - startTime;
        this.logger.info("Abandonment forfeit skipped: room not found", {
          operation: "room_abandonment_forfeit",
          roomCode: normalizedCode,
          disconnectedPlayerId,
          duration,
          durationMs: duration,
          ...(correlationId ? { correlationId } : {}),
        });
        return null;
      }

      this.logServiceFailure(
        "room_abandonment_forfeit",
        "Abandonment forfeit processing",
        startTime,
        correlationId,
        error,
        {
          roomCode: normalizedCode,
          disconnectedPlayerId,
        },
      );
      throw error;
    }
  }

  /**
   * Cleans up stale rooms inactive for longer than maxAgeMs (default 10 minutes).
   */
  public async cleanupAbandonedRooms(
    maxAgeMs = 10 * 60 * 1000,
    jobCorrelationId?: string,
  ): Promise<number> {
    const correlationId = jobCorrelationId;
    // PERF: Also evict expired sessions across all rooms to prevent memory leaks
    await this.sessionRegistry.cleanupExpiredSessions({ correlationId });

    const rooms = await this.store.listActiveRooms();
    const now = this.clock.now();
    let cleaned = 0;

    for (const room of rooms) {
      if (now - room.lastActivityAt > maxAgeMs) {
        try {
          // MIN-006: Cancel disconnect timers when cleaning up abandoned rooms
          this.timerRegistry.cancelAllForRoom(room.roomCode);
          await this.store.delete(room.roomCode, { correlationId });
          await this.sessionRegistry.deleteSessionsForRoom(room.roomCode, {
            correlationId,
          });
          cleaned++;
        } catch (error) {
          this.logger.error("Failed to cleanup abandoned room", {
            operation: "room_cleanup_abandoned_error",
            roomCode: room.roomCode,
            error: serializeError(error),
            ...(correlationId ? { correlationId } : {}),
          });
        }
      }
    }

    return cleaned;
  }

  /**
   * Cleans up expired sessions in the session registry.
   * PERF: Prevents unbounded memory growth in long-running deployments.
   */
  public async cleanupExpiredSessions(): Promise<number> {
    return this.sessionRegistry.cleanupExpiredSessions();
  }
}
