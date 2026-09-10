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
} from "../../platform/logger/index.js";
import {
  type IDisconnectTimerRegistry,
  DisconnectTimerRegistry,
} from "./disconnect_timer_registry.js";
import {
  type ITimerService,
  SystemTimerService,
} from "./timer_service.js";
import {
  InvalidPayloadError,
  RoomAlreadyExistsError,
  OptimisticLockConflictError,
  GameNotActiveError,
  RoomCapacityExceededError,
} from "./room.errors.js";
import {
  type IRoomCodeGenerator,
  RoomCodeGenerator,
  DEFAULT_MAX_ATTEMPTS,
} from "./room_code_generator.js";
import {
  type IRematchCoordinator,
  RematchCoordinator,
} from "./rematch_coordinator.js";
import {
  type IDrawCoordinator,
  DrawCoordinator,
} from "./draw_coordinator.js";
import {
  type IRoomLifecycleCoordinator,
  RoomLifecycleCoordinator,
} from "./room_lifecycle_coordinator.js";
import {
  type IRoomMemberCoordinator,
  RoomMemberCoordinator,
} from "./room_member_coordinator.js";
import {
  createInitialRoomState,
  assignPlayerColors,
  applyGameMoveTransition,
  finalizeGameTransition,
  updateDrawOfferTransition,
  updateRematchTransition,
} from "./room.logic.js";

/**
 * Service coordinating room creation, player joining, reconnection, and session lifecycle.
 * Implements IRoomService for socket/HTTP ingress and IRoomGameAdapter for game engine integration (MAJ-016, MAJ-017).
 * Pure state transitions are delegated to room.logic.ts (MAJ-015).
 * Subdomain lifecycle and membership operations are delegated to dedicated coordinators.
 */
export class RoomService implements IRoomService, IRoomGameAdapter {
  private readonly logger: Logger;
  private readonly timerService: ITimerService;
  private readonly clock: IClock;
  private readonly idGenerator: IIdGenerator;
  private readonly timerRegistry: IDisconnectTimerRegistry;
  public readonly codeGenerator: IRoomCodeGenerator;
  public readonly rematchCoordinator: IRematchCoordinator;
  public readonly drawCoordinator: IDrawCoordinator;
  public readonly lifecycleCoordinator: IRoomLifecycleCoordinator;
  public readonly memberCoordinator: IRoomMemberCoordinator;

  constructor(
    private readonly store: IRoomStore,
    private readonly sessionRegistry: ISessionRegistry,
    clock?: IClock,
    idGenerator?: IIdGenerator,
    timerRegistry?: IDisconnectTimerRegistry,
    logger?: Logger,
    timerService?: ITimerService,
    codeGenerator?: IRoomCodeGenerator,
    rematchCoordinator?: IRematchCoordinator,
    drawCoordinator?: IDrawCoordinator,
    lifecycleCoordinator?: IRoomLifecycleCoordinator,
    memberCoordinator?: IRoomMemberCoordinator,
  ) {
    this.logger = logger ?? defaultLogger;
    this.timerService = timerService ?? new SystemTimerService();
    this.clock = clock ?? new SystemClock();
    this.idGenerator = idGenerator ?? new UuidGenerator();
    this.timerRegistry = timerRegistry ?? new DisconnectTimerRegistry();
    this.codeGenerator =
      codeGenerator ?? new RoomCodeGenerator(this.idGenerator);
    this.rematchCoordinator =
      rematchCoordinator ??
      new RematchCoordinator(this.store, this.sessionRegistry, this.clock);
    this.drawCoordinator =
      drawCoordinator ?? new DrawCoordinator(this.store, this.clock);
    this.lifecycleCoordinator =
      lifecycleCoordinator ??
      new RoomLifecycleCoordinator(
        this.store,
        this.sessionRegistry,
        this.clock,
        this.timerRegistry,
        this.timerService,
        this.logger,
      );
    this.memberCoordinator =
      memberCoordinator ??
      new RoomMemberCoordinator(
        this.store,
        this.sessionRegistry,
        this.clock,
        this.timerRegistry,
        this.logger,
        this.idGenerator,
      );
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
      let created = false;

      for (let attempt = 0; attempt < DEFAULT_MAX_ATTEMPTS; attempt++) {
        const roomCode = this.codeGenerator.generateCandidate();
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
      this.logServiceFailure(
        "room_create",
        "Room creation",
        startTime,
        correlationId,
        err,
      );
      throw err;
    }
  }

  /**
   * Joins an existing room by 4-letter room code.
   * Delegated to RoomMemberCoordinator.
   */
  public async joinRoom(
    req: JoinRoomRequest,
    socketId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; player: Player; sessionToken: string }> {
    return this.memberCoordinator.joinRoom(req, socketId, correlationId);
  }

  /**
   * Restores a dropped player session after network glitch or page refresh.
   * Delegated to RoomMemberCoordinator.
   */
  public async reconnect(
    req: ReconnectRequest,
    socketId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; player: Player; sessionToken: string }> {
    return this.memberCoordinator.reconnect(req, socketId, correlationId);
  }

  /**
   * Removes or updates a player when they intentionally leave a room.
   * Delegated to RoomMemberCoordinator.
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
    const result = await this.memberCoordinator.leaveRoom(
      roomCode,
      socketId,
      correlationId,
    );
    return result as {
      room: RoomState;
      player: Player;
      shouldDelete: boolean;
      gameOverPayload?: GameOverPayload;
    };
  }

  /**
   * Handles unexpected socket drop. Marks player disconnected and pauses active match.
   * Delegated to RoomLifecycleCoordinator.
   */
  public async handleDisconnect(
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
  ): Promise<{
    room: RoomState;
    player: Player;
    wasActiveGame: boolean;
  } | null> {
    return this.lifecycleCoordinator.handleDisconnect(
      socketId,
      onForfeit,
      gracePeriodMs,
      timerRegistry,
      correlationId,
    );
  }

  /**
   * Handles disconnect grace period expiration.
   * Delegated to RoomLifecycleCoordinator.
   */
  public async handleAbandonmentForfeit(
    roomCode: string,
    disconnectedPlayerId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload } | null> {
    return this.lifecycleCoordinator.handleAbandonmentForfeit(
      roomCode,
      disconnectedPlayerId,
      correlationId,
    );
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
   * Delegated to RoomLifecycleCoordinator.
   */
  public async cleanupAbandonedRooms(
    maxAgeMs?: number,
    jobCorrelationId?: string,
  ): Promise<number> {
    return this.lifecycleCoordinator.cleanupAbandonedRooms(
      maxAgeMs,
      jobCorrelationId,
    );
  }

  /**
   * Cleans up expired sessions in the session registry.
   * Delegated to RoomLifecycleCoordinator.
   */
  public async cleanupExpiredSessions(): Promise<number> {
    return this.lifecycleCoordinator.cleanupExpiredSessions();
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
    this.logger.debug("Applying game move", {
      operation: "room_apply_game_move",
      roomCode: code,
      moveCount: nextGameState.moveCount,
      ...(correlationId ? { correlationId } : {}),
    });
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
    this.logger.debug("Finalizing game", {
      operation: "room_finalize_game",
      roomCode: code,
      reason: gameOverPayload.reason,
      winner: gameOverPayload.winner,
      ...(correlationId ? { correlationId } : {}),
    });
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
    this.logger.debug("Updating draw offer", {
      operation: "room_update_draw_offer",
      roomCode: code,
      ...(correlationId ? { correlationId } : {}),
    });
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
    this.logger.debug("Updating rematch", {
      operation: "room_update_rematch",
      roomCode: code,
      ...(correlationId ? { correlationId } : {}),
    });
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
   * Delegated to RoomMemberCoordinator.
   */
  public async updatePlayerSocket(
    roomCode: string,
    playerId: string,
    newSocketId: string,
    correlationId?: string,
  ): Promise<RoomState> {
    return this.memberCoordinator.updatePlayerSocket(
      roomCode,
      playerId,
      newSocketId,
      correlationId,
    );
  }
}
