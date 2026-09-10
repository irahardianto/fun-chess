import {
  AppError,
  CreateRoomRequest,
  GameOverPayload,
  GameState,
  JoinRoomRequest,
  Player,
  ReconnectRequest,
  RoomState,
  normalizeRoomCode,
  validatePlayerName,
  serializeError,
  toErrorMessage,
  type IClock,
  type IIdGenerator,
} from "@fun-chess/shared";
import { IRoomStore, MAX_ROOMS } from "./room.store.js";
import { IRoomService, IRoomGameAdapter } from "./room.interface.js";
import { ISessionRegistry } from "./session_registry.js";
import { SystemClock, UuidGenerator } from "../../platform/time/index.js";
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
import {
  RoomNotFoundError,
  InvalidRoomCodeError,
  UnauthorizedError,
  PlayerNotInRoomError,
  InvalidPayloadError,
  RoomAlreadyExistsError,
  OptimisticLockConflictError,
  GameNotActiveError,
  RoomCapacityExceededError,
} from "./room.errors.js";
import {
  createInitialRoomState,
  assignPlayerColors,
  addPlayerToRoom,
  disconnectPlayerTransition,
  reconnectPlayerTransition,
  leaveRoomTransition,
  applyGameMoveTransition,
  finalizeGameTransition,
  updateDrawOfferTransition,
  updateRematchTransition,
  abandonmentForfeitTransition,
} from "./room.logic.js";

const ROOM_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes 0, O, 1, I
const ROOM_CODE_LENGTH = 4;

/**
 * Service coordinating room creation, player joining, reconnection, and session lifecycle.
 * Implements IRoomService for socket/HTTP ingress and IRoomGameAdapter for game engine integration (MAJ-016, MAJ-017).
 * Pure state transitions are delegated to room.logic.ts (MAJ-015).
 */
export class RoomService implements IRoomService, IRoomGameAdapter {
  private readonly logger: Logger;
  private readonly timerService: ITimerService;

  constructor(
    private readonly store: IRoomStore,
    private readonly sessionRegistry: ISessionRegistry,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly timerRegistry: IDisconnectTimerRegistry,
    logger?: Logger,
    timerService?: ITimerService,
  ) {
    this.logger = logger ?? defaultLogger;
    this.timerService = timerService ?? new SystemTimerService();
    // Zero fallback instantiation in types per API contract MAJ-005.
    // Defensively ensure non-null if legacy test callers pass undefined at runtime.
    if (!this.clock) {
      this.clock = new SystemClock();
    }
    if (!this.idGenerator) {
      this.idGenerator = new UuidGenerator();
    }
    if (!this.timerRegistry) {
      this.timerRegistry = new DisconnectTimerRegistry();
    }
  }

  /**
   * Initializes a new game room with host player and returns state + sessionToken.
   */
  public async createRoom(
    req: CreateRoomRequest,
    socketId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; player: Player; sessionToken: string }> {
    const startTime = this.clock.now();
    let rawName: string | undefined;

    try {
      try {
        rawName = validatePlayerName(req.playerName);
      } catch (err) {
        throw new InvalidPayloadError(
          "playerName",
          toErrorMessage(err),
        );
      }

      this.logger.info("Creating room", {
        operation: "room_create",
        playerName: rawName,
        ...(correlationId ? { correlationId } : {}),
      });

      const playerId = this.idGenerator.generateId();

      const randomIntVal =
        !req.preferredColor || req.preferredColor === "random"
          ? this.idGenerator.generateRandomInt(0, 2)
          : 0;

      const { hostColor } = assignPlayerColors(req.preferredColor, randomIntVal);

      const now = this.clock.now();
      const hostPlayer: Player = {
        id: playerId,
        socketId,
        name: rawName,
        avatar: req.avatar || "🦁",
        color: hostColor,
        isHost: true,
        isConnected: true,
        connectedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      let createdRoom!: RoomState;
      const MAX_CODE_ATTEMPTS = 100;
      let created = false;

      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const roomCode = this.generateRoomCodeCandidate();
        const candidateRoom = createInitialRoomState({
          roomCode,
          hostPlayer,
          createdAt: now,
        });

        try {
          await this.store.createIfAbsent(candidateRoom, { correlationId });
          createdRoom = candidateRoom;
          created = true;
          break;
        } catch (err) {
          if (err instanceof RoomAlreadyExistsError) {
            this.logger.warn("Room code collision, generating fallback", {
              operation: "room_code_collision_retry",
              attempts: attempt + 1,
              ...(correlationId ? { correlationId } : {}),
            });
            continue;
          }
          throw err;
        }
      }

      if (!created) {
        // Defensively attempt fallback code generation with collision handling (MAJ-003)
        const fallbackCode = `R${now.toString(36).toUpperCase().slice(-3)}`;
        createdRoom = createInitialRoomState({
          roomCode: fallbackCode,
          hostPlayer,
          createdAt: now,
        });
        try {
          await this.store.createIfAbsent(createdRoom, { correlationId });
          created = true;
        } catch (err) {
          if (err instanceof RoomAlreadyExistsError) {
            throw new RoomCapacityExceededError(MAX_ROOMS);
          }
          throw err;
        }
      }

      const sessionRecord = await this.sessionRegistry.createSession(
        {
          playerId,
          roomCode: createdRoom.roomCode,
          color: hostColor,
          isHost: true,
          socketId,
        },
        { correlationId },
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Room created", {
        operation: "room_create",
        roomCode: createdRoom.roomCode,
        playerId,
        duration,
        durationMs: duration,
        ...(correlationId ? { correlationId } : {}),
      });

      return {
        room: createdRoom,
        player: hostPlayer,
        sessionToken: sessionRecord.sessionToken,
      };
    } catch (err) {
      const duration = this.clock.now() - startTime;
      const isClientError = err instanceof AppError && err.statusCode < 500;
      const logContext = {
        operation: "room_create",
        duration,
        durationMs: duration,
        error: serializeError(err),
        ...(correlationId ? { correlationId } : {}),
      };
      if (isClientError) {
        this.logger.warn("Room creation rejected", logContext);
      } else {
        this.logger.error("Room creation failed", logContext);
      }
      throw err;
    }
  }

  /**
   * Joins an existing room by 4-letter room code.
   */
  public async joinRoom(
    req: JoinRoomRequest,
    socketId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; player: Player; sessionToken: string }> {
    const startTime = this.clock.now();
    const normalizedCode = normalizeRoomCode(req.roomCode || "");
    let rawName: string | undefined;

    try {
      if (!normalizedCode || normalizedCode.length !== ROOM_CODE_LENGTH) {
        throw new InvalidRoomCodeError(req.roomCode || "");
      }

      try {
        rawName = validatePlayerName(req.playerName);
      } catch (err) {
        throw new InvalidPayloadError(
          "playerName",
          toErrorMessage(err),
        );
      }

      this.logger.info("Joining room", {
        operation: "room_join",
        roomCode: normalizedCode,
        playerName: rawName,
        ...(correlationId ? { correlationId } : {}),
      });

      const playerId = this.idGenerator.generateId();
      const now = this.clock.now();

      const playerCandidate: Player = {
        id: playerId,
        socketId,
        name: rawName,
        avatar: req.avatar || "🦁",
        color: "b", // assigned by addPlayerToRoom
        isHost: false,
        isConnected: true,
        connectedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const result = await this.store.mutate(
        normalizedCode,
        async (room) => {
          const { nextRoom, assignedColor } = addPlayerToRoom(
            room,
            playerCandidate,
            false,
            this.clock.now(),
          );

          const assignedPlayer =
            assignedColor === "w" ? nextRoom.whitePlayer! : nextRoom.blackPlayer!;

          return {
            updatedRoom: nextRoom,
            result: {
              room: nextRoom,
              player: assignedPlayer,
              assignedColor: assignedColor!,
            },
          };
        },
        correlationId,
      );

      const sessionRecord = await this.sessionRegistry.createSession(
        {
          playerId,
          roomCode: normalizedCode,
          color: result.assignedColor,
          isHost: false,
          socketId,
        },
        { correlationId },
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Room joined", {
        operation: "room_join",
        roomCode: normalizedCode,
        playerId: result.player.id,
        role: "player",
        duration,
        durationMs: duration,
        ...(correlationId ? { correlationId } : {}),
      });

      return {
        room: result.room,
        player: result.player,
        sessionToken: sessionRecord.sessionToken,
      };
    } catch (err) {
      const duration = this.clock.now() - startTime;
      const isClientError = err instanceof AppError && err.statusCode < 500;
      const logContext = {
        operation: "room_join",
        roomCode: normalizedCode,
        playerName: rawName,
        duration,
        durationMs: duration,
        error: serializeError(err),
        ...(correlationId ? { correlationId } : {}),
      };
      if (isClientError) {
        this.logger.warn("Room join rejected", logContext);
      } else {
        this.logger.error("Room join failed", logContext);
      }
      throw err;
    }
  }

  /**
   * Restores a dropped player session after network glitch or page refresh.
   */
  public async reconnect(
    req: ReconnectRequest,
    socketId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; player: Player; sessionToken: string }> {
    const startTime = this.clock.now();

    if (!req.roomCode || req.roomCode.trim().length === 0) {
      throw new InvalidPayloadError("roomCode", "Room code cannot be empty");
    }
    if (!req.playerId || req.playerId.trim().length === 0) {
      throw new InvalidPayloadError("playerId", "Player ID cannot be empty");
    }
    if (!req.sessionToken || req.sessionToken.trim().length === 0) {
      throw new InvalidPayloadError(
        "sessionToken",
        "Session token cannot be empty",
      );
    }

    const normalizedCode = normalizeRoomCode(req.roomCode);
    if (normalizedCode.length !== ROOM_CODE_LENGTH) {
      throw new InvalidRoomCodeError(req.roomCode);
    }

    this.logger.info("Reconnecting player", {
      operation: "room_reconnect",
      roomCode: normalizedCode,
      playerId: req.playerId,
      ...(correlationId ? { correlationId } : {}),
    });

    try {
      const existing = await this.store.findByCode(normalizedCode);
      if (!existing) {
        throw new RoomNotFoundError(normalizedCode);
      }

      const session = await this.sessionRegistry.validateSession(
        req.sessionToken,
        normalizedCode,
        req.playerId,
        { signal: undefined },
      );
      if (!session) {
        throw new UnauthorizedError("Invalid session token");
      }

      const result = await this.store.mutate(
        normalizedCode,
        async (room) => {
          // Cancel disconnect timer under room lock (MAJ-028)
          this.timerRegistry.cancel(normalizedCode, req.playerId);

          const { nextRoom, player } = reconnectPlayerTransition(
            room,
            req.playerId,
            socketId,
            this.clock.now(),
          );

          return {
            updatedRoom: nextRoom,
            result: { room: nextRoom, player },
          };
        },
        correlationId,
      );

      await this.sessionRegistry.touchSession(
        req.sessionToken,
        socketId,
        undefined,
        { correlationId },
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Player reconnected", {
        operation: "room_reconnect",
        roomCode: normalizedCode,
        playerId: req.playerId,
        duration,
        durationMs: duration,
        ...(correlationId ? { correlationId } : {}),
      });

      return {
        ...result,
        sessionToken: session.sessionToken,
      };
    } catch (err) {
      const duration = this.clock.now() - startTime;
      const isClientError = err instanceof AppError && err.statusCode < 500;
      const logContext = {
        operation: "room_reconnect",
        roomCode: normalizedCode,
        playerId: req.playerId,
        duration,
        durationMs: duration,
        error: serializeError(err),
        ...(correlationId ? { correlationId } : {}),
      };
      if (isClientError) {
        this.logger.warn("Player reconnect rejected", logContext);
      } else {
        this.logger.error("Player reconnect failed", logContext);
      }
      throw err;
    }
  }

  /**
   * Removes or updates a player when they intentionally leave a room.
   */
  public async leaveRoom(
    roomCode: string,
    socketId: string,
    correlationId?: string,
  ): Promise<{
    room: RoomState;
    player: Player;
    shouldDelete: boolean;
    gameOverPayload?: GameOverPayload;
  }> {
    const startTime = this.clock.now();
    const normalizedCode = normalizeRoomCode(roomCode);

    this.logger.info("Leaving room", {
      operation: "room_leave",
      roomCode: normalizedCode,
      socketId,
      ...(correlationId ? { correlationId } : {}),
    });

    try {
      const result = await this.store.withLock(
        normalizedCode,
        async () => {
          const room = await this.store.findByCode(normalizedCode);
          if (!room) {
            throw new RoomNotFoundError(normalizedCode);
          }

          let leavingPlayer: Player | null;
          if (room.whitePlayer?.socketId === socketId) {
            leavingPlayer = room.whitePlayer;
          } else if (room.blackPlayer?.socketId === socketId) {
            leavingPlayer = room.blackPlayer;
          } else {
            leavingPlayer =
              room.spectators.find((s) => s.socketId === socketId) ?? null;
          }

          if (!leavingPlayer) {
            throw new PlayerNotInRoomError(socketId);
          }

          // Cancel disconnect timer for leaving player under room lock (MAJ-028)
          this.timerRegistry.cancel(normalizedCode, leavingPlayer.id);

          const now = this.clock.now();
          const { nextRoom, shouldDelete, gameOverPayload } = leaveRoomTransition(
            room,
            leavingPlayer.id,
            now,
          );

          if (shouldDelete || gameOverPayload) {
            this.timerRegistry.cancelAllForRoom(normalizedCode);
          }

          if (shouldDelete) {
            await this.store.delete(normalizedCode, { correlationId });
            await this.sessionRegistry.deleteSessionsForRoom(normalizedCode, {
              correlationId,
            });
          } else {
            await this.store.save(nextRoom, undefined, { correlationId });
            await this.sessionRegistry.deleteSessionForPlayer(
              normalizedCode,
              leavingPlayer.id,
              { correlationId },
            );
          }

          return {
            room: nextRoom,
            player: leavingPlayer,
            shouldDelete,
            gameOverPayload,
          };
        },
        correlationId,
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Room left", {
        operation: "room_leave",
        roomCode: normalizedCode,
        playerId: result.player.id,
        shouldDelete: result.shouldDelete,
        duration,
        durationMs: duration,
        ...(correlationId ? { correlationId } : {}),
      });

      return result;
    } catch (err) {
      const duration = this.clock.now() - startTime;
      const isClientError = err instanceof AppError && err.statusCode < 500;
      const logContext = {
        operation: "room_leave",
        roomCode: normalizedCode,
        duration,
        durationMs: duration,
        error: serializeError(err),
        ...(correlationId ? { correlationId } : {}),
      };
      if (isClientError) {
        this.logger.warn("Room leave rejected", logContext);
      } else {
        this.logger.error("Room leave failed", logContext);
      }
      throw err;
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
      } catch (err) {
        // MAJ-004: Catch and log error explicitly with full room and player context
        this.logger.error("Disconnect grace-period forfeiture job failed", {
          operation: "disconnect_grace_period_abandonment",
          roomCode,
          playerId,
          error: serializeError(err),
        });
      }
    }, gracePeriodMs);

    timer.unref?.();
    return timer;
  }

  /**
   * Handles unexpected socket drop. Marks player disconnected and pauses active match.
   * Manages disconnect grace timer under the room lock to eliminate race with immediate reconnect (MAJ-028).
   * Decomposed into focused helpers per MAJ-012.
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
   * Remediated to use store.mutate() with pure state transition, CAS version guards,
   * and structured logging per CRIT-001.
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

      const duration = this.clock.now() - startTime;
      const isClientError = error instanceof AppError && error.statusCode < 500;
      const logContext = {
        operation: "room_abandonment_forfeit",
        roomCode: normalizedCode,
        disconnectedPlayerId,
        duration,
        durationMs: duration,
        error: serializeError(error),
        ...(correlationId ? { correlationId } : {}),
      };
      if (isClientError) {
        this.logger.warn("Abandonment forfeit processing rejected", logContext);
      } else {
        this.logger.error("Abandonment forfeit processing failed", logContext);
      }
      throw error;
    }
  }

  /**
   * Finds a room by code.
   */
  public async getRoom(
    roomCode: string,
    _correlationId?: string,
  ): Promise<RoomState | null> {
    return this.store.findByCode(normalizeRoomCode(roomCode));
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

  // --- IRoomGameAdapter Implementation (MAJ-016 & MAJ-017) ---

  /**
   * Applies an executed chess move and state update to the room under exclusive lock.
   */
  public async applyGameMove(
    roomCode: string,
    nextGameState: GameState,
    gameOverPayload?: GameOverPayload,
    correlationId?: string,
  ): Promise<RoomState> {
    const code = normalizeRoomCode(roomCode);
    return this.store.mutate(
      code,
      async (room) => {
        if (room.status !== "playing") {
          throw new GameNotActiveError(room.status);
        }
        if (nextGameState.moveCount <= room.game.moveCount) {
          throw new OptimisticLockConflictError(
            room.roomCode,
            nextGameState.moveCount - 1,
            room.game.moveCount,
          );
        }
        const now = this.clock.now();
        const updated = applyGameMoveTransition(
          room,
          nextGameState,
          gameOverPayload,
          now,
        );
        return { updatedRoom: updated, result: updated };
      },
      correlationId,
    );
  }

  /**
   * Finalizes a match with an explicit game-over payload (resignation, timeout, draw).
   */
  public async finalizeGame(
    roomCode: string,
    gameOverPayload: GameOverPayload,
    correlationId?: string,
  ): Promise<RoomState> {
    const code = normalizeRoomCode(roomCode);
    return this.store.mutate(
      code,
      async (room) => {
        if (room.status !== "playing") {
          throw new GameNotActiveError(room.status);
        }
        if (gameOverPayload.reason === "draw_agreement" && !room.drawOffer) {
          throw new GameNotActiveError("No draw offer is currently pending");
        }
        const now = this.clock.now();
        const updated = finalizeGameTransition(room, gameOverPayload, now);
        return { updatedRoom: updated, result: updated };
      },
      correlationId,
    );
  }

  /**
   * Records a proposed draw offer or response in the room state.
   */
  public async updateDrawOffer(
    roomCode: string,
    drawOffer: RoomState["drawOffer"],
    correlationId?: string,
  ): Promise<RoomState> {
    const code = normalizeRoomCode(roomCode);
    return this.store.mutate(
      code,
      async (room) => {
        const now = this.clock.now();
        const updated = updateDrawOfferTransition(room, drawOffer, now);
        return { updatedRoom: updated, result: updated };
      },
      correlationId,
    );
  }

  /**
   * Records a rematch proposal or acceptance in the room state.
   */
  public async updateRematch(
    roomCode: string,
    rematch: RoomState["rematch"],
    newGameState?: GameState,
    players?: { whitePlayer: Player | null; blackPlayer: Player | null },
    correlationId?: string,
  ): Promise<RoomState> {
    const code = normalizeRoomCode(roomCode);
    const result = await this.store.mutate(
      code,
      async (room) => {
        const now = this.clock.now();
        const updated = updateRematchTransition(
          room,
          rematch,
          newGameState,
          now,
          players,
        );
        return { updatedRoom: updated, result: updated };
      },
      correlationId,
    );

    if (rematch?.status === "accepted") {
      if (result.whitePlayer) {
        await this.sessionRegistry.updateSessionColor(
          code,
          result.whitePlayer.id,
          "w",
          { correlationId },
        );
      }
      if (result.blackPlayer) {
        await this.sessionRegistry.updateSessionColor(
          code,
          result.blackPlayer.id,
          "b",
          { correlationId },
        );
      }
    }

    return result;
  }

  /**
   * Updates a player's socket ID in the room state under lock (MAJ-007 socket auto-healing).
   */
  public async updatePlayerSocket(
    roomCode: string,
    playerId: string,
    newSocketId: string,
    correlationId?: string,
  ): Promise<RoomState> {
    const code = normalizeRoomCode(roomCode);
    return this.store.mutate(
      code,
      async (room) => {
        let whitePlayer = room.whitePlayer;
        let blackPlayer = room.blackPlayer;
        let spectators = room.spectators;
        let found = false;

        if (whitePlayer?.id === playerId) {
          whitePlayer = { ...whitePlayer, socketId: newSocketId, isConnected: true };
          found = true;
        } else if (blackPlayer?.id === playerId) {
          blackPlayer = { ...blackPlayer, socketId: newSocketId, isConnected: true };
          found = true;
        } else if (spectators.some((s) => s.id === playerId)) {
          spectators = spectators.map((s) =>
            s.id === playerId ? { ...s, socketId: newSocketId, isConnected: true } : s,
          );
          found = true;
        }

        if (!found) {
          throw new PlayerNotInRoomError(playerId);
        }

        const now = this.clock.now();
        const updatedRoom: RoomState = {
          ...room,
          whitePlayer,
          blackPlayer,
          spectators,
          lastActivityAt: now,
        };

        return { updatedRoom, result: updatedRoom };
      },
      correlationId,
    );
  }

  /**
   * Generates a 4-letter uppercase room code candidate.
   */
  private generateRoomCodeCandidate(): string {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const idx = this.idGenerator.generateRandomInt(
        0,
        ROOM_CODE_CHARSET.length,
      );
      code += ROOM_CODE_CHARSET.charAt(idx);
    }
    return code;
  }
}
