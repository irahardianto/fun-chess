import { randomInt } from "node:crypto";
import {
  CreateRoomRequest,
  GameOverPayload,
  GameState,
  JoinRoomRequest,
  PieceColor,
  Player,
  ReconnectRequest,
  RoomState,
  createGameOverPayload,
} from "@fun-chess/shared";
import { RoomStore } from "./room.store.js";
import { IRoomService, IRoomGameAdapter } from "./room.interface.js";
import { SessionRegistry } from "./session_registry.js";
import { InMemorySessionRegistry } from "./in_memory_session_registry.js";
import {
  IClock,
  SystemClock,
  IIdGenerator,
  UuidGenerator,
} from "./clock.js";
import {
  type IDisconnectTimerRegistry,
  DisconnectTimerRegistry,
  DISCONNECT_GRACE_PERIOD_MS,
} from "./disconnect_timer_registry.js";
import {
  RoomNotFoundError,
  InvalidRoomCodeError,
  UnauthorizedError,
  PlayerNotInRoomError,
  InvalidPayloadError,
  RoomAlreadyExistsError,
  OptimisticLockConflictError,
  GameNotActiveError,
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
} from "./room.logic.js";

const ROOM_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes 0, O, 1, I
const ROOM_CODE_LENGTH = 4;

/**
 * Service coordinating room creation, player joining, reconnection, and session lifecycle.
 * Implements IRoomService for socket/HTTP ingress and IRoomGameAdapter for game engine integration (MAJ-016, MAJ-017).
 * Pure state transitions are delegated to room.logic.ts (MAJ-015).
 */
export class RoomService implements IRoomService, IRoomGameAdapter {
  constructor(
    private readonly store: RoomStore,
    private readonly sessionRegistry: SessionRegistry = new InMemorySessionRegistry(),
    private readonly clock: IClock = new SystemClock(),
    private readonly idGenerator: IIdGenerator = new UuidGenerator(),
    private readonly timerRegistry: IDisconnectTimerRegistry = new DisconnectTimerRegistry(),
  ) {}

  /**
   * Initializes a new game room with host player and returns state + sessionToken.
   */
  public async createRoom(
    req: CreateRoomRequest,
    socketId: string,
  ): Promise<{ room: RoomState; sessionToken: string }> {
    const rawName = req.playerName?.trim();
    if (!rawName || rawName.length === 0) {
      throw new InvalidPayloadError(
        "playerName",
        "Player name cannot be empty",
      );
    }
    if (rawName.length > 20) {
      throw new InvalidPayloadError(
        "playerName",
        "Player name must be 20 characters or fewer",
      );
    }

    const playerId = this.idGenerator.generateId();

    const randomIntVal =
      !req.preferredColor || req.preferredColor === "random"
        ? this.idGenerator.generateRandomInt
          ? this.idGenerator.generateRandomInt(0, 2)
          : randomInt(0, 2)
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
        await this.store.createIfAbsent(candidateRoom);
        createdRoom = candidateRoom;
        created = true;
        break;
      } catch (err) {
        if (err instanceof RoomAlreadyExistsError) {
          continue;
        }
        throw err;
      }
    }

    if (!created) {
      const fallbackCode = `R${now.toString(36).toUpperCase().slice(-3)}`;
      createdRoom = createInitialRoomState({
        roomCode: fallbackCode,
        hostPlayer,
        createdAt: now,
      });
      await this.store.createIfAbsent(createdRoom);
    }

    const sessionRecord = await this.sessionRegistry.createSession({
      playerId,
      roomCode: createdRoom.roomCode,
      color: hostColor,
      isHost: true,
      socketId,
    });

    return { room: createdRoom, sessionToken: sessionRecord.sessionToken };
  }

  /**
   * Joins an existing room by 4-letter room code.
   */
  public async joinRoom(
    req: JoinRoomRequest,
    socketId: string,
  ): Promise<{ room: RoomState; player: Player; sessionToken: string }> {
    const normalizedCode = (req.roomCode || "").trim().toUpperCase();
    if (!normalizedCode || normalizedCode.length !== ROOM_CODE_LENGTH) {
      throw new InvalidRoomCodeError(req.roomCode || "");
    }

    const rawName = req.playerName?.trim();
    if (!rawName || rawName.length === 0) {
      throw new InvalidPayloadError(
        "playerName",
        "Player name cannot be empty",
      );
    }
    if (rawName.length > 20) {
      throw new InvalidPayloadError(
        "playerName",
        "Player name must be 20 characters or fewer",
      );
    }

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
    };

    const result = await this.store.mutate(normalizedCode, async (room) => {
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
    });

    const sessionRecord = await this.sessionRegistry.createSession({
      playerId,
      roomCode: normalizedCode,
      color: result.assignedColor,
      isHost: false,
      socketId,
    });

    return {
      room: result.room,
      player: result.player,
      sessionToken: sessionRecord.sessionToken,
    };
  }

  /**
   * Restores a dropped player session after network glitch or page refresh.
   */
  public async reconnect(
    req: ReconnectRequest,
    socketId: string,
  ): Promise<{ room: RoomState; player: Player }> {
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

    const normalizedCode = req.roomCode.trim().toUpperCase();
    if (normalizedCode.length !== ROOM_CODE_LENGTH) {
      throw new InvalidRoomCodeError(req.roomCode);
    }
    const existing = await this.store.findByCode(normalizedCode);
    if (!existing) {
      throw new RoomNotFoundError(normalizedCode);
    }

    const session = await this.sessionRegistry.validateSession(
      req.sessionToken,
      normalizedCode,
      req.playerId,
    );
    if (!session) {
      throw new UnauthorizedError("Invalid session token");
    }

    const result = await this.store.mutate(normalizedCode, async (room) => {
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
    });

    await this.sessionRegistry.touchSession(req.sessionToken, socketId);
    return result;
  }

  /**
   * Removes or updates a player when they intentionally leave a room.
   */
  public async leaveRoom(
    roomCode: string,
    socketId: string,
  ): Promise<{
    room: RoomState;
    player: Player;
    shouldDelete: boolean;
    gameOverPayload?: GameOverPayload;
  }> {
    const normalizedCode = roomCode.trim().toUpperCase();

    return this.store.withLock(normalizedCode, async () => {
      const room = await this.store.findByCode(normalizedCode);
      if (!room) {
        throw new RoomNotFoundError(normalizedCode);
      }

      let leavingPlayer: Player | null = null;
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
      const { nextRoom, shouldDelete, gameOverPayload } =
        leaveRoomTransition(room, leavingPlayer.id, now);

      if (shouldDelete || gameOverPayload) {
        this.timerRegistry.cancelAllForRoom(normalizedCode);
      }

      if (shouldDelete) {
        await this.store.delete(normalizedCode);
        await this.sessionRegistry.deleteSessionsForRoom(normalizedCode);
      } else {
        await this.store.save(nextRoom);
      }

      return {
        room: nextRoom,
        player: leavingPlayer,
        shouldDelete,
        gameOverPayload,
      };
    });
  }

  /**
   * Handles unexpected socket drop. Marks player disconnected and pauses active match.
   * Manages disconnect grace timer under the room lock to eliminate race with immediate reconnect (MAJ-028).
   */
  public async handleDisconnect(
    socketId: string,
    onForfeit?: (room: RoomState, gameOverPayload: GameOverPayload) => void | Promise<void>,
    gracePeriodMs = DISCONNECT_GRACE_PERIOD_MS,
    timerRegistry?: IDisconnectTimerRegistry,
  ): Promise<{
    room: RoomState;
    player: Player;
    wasActiveGame: boolean;
  } | null> {
    const match = await this.store.findBySocketId(socketId);
    if (!match) return null;

    const { room: matchedRoom, playerId } = match;
    const targetTimerRegistry = timerRegistry ?? this.timerRegistry;

    return this.store.withLock(matchedRoom.roomCode, async () => {
      const room = await this.store.findByCode(matchedRoom.roomCode);
      if (!room) return null;

      const now = this.clock.now();
      const { nextRoom, paused, droppedPlayer } = disconnectPlayerTransition(
        room,
        playerId,
        now,
      );

      if (!droppedPlayer) return null;

      await this.store.save(nextRoom);

      if (paused) {
        // Clear any previous timer under lock and install new timer under lock (MAJ-028)
        targetTimerRegistry.cancel(matchedRoom.roomCode, playerId);
        if (targetTimerRegistry !== this.timerRegistry) {
          this.timerRegistry.cancel(matchedRoom.roomCode, playerId);
        }

        const timer = setTimeout(async () => {
          targetTimerRegistry.cancel(matchedRoom.roomCode, playerId);
          if (targetTimerRegistry !== this.timerRegistry) {
            this.timerRegistry.cancel(matchedRoom.roomCode, playerId);
          }
          const forfeitResult = await this.handleAbandonmentForfeit(
            matchedRoom.roomCode,
            playerId,
          );
          if (forfeitResult && onForfeit) {
            await onForfeit(forfeitResult.room, forfeitResult.gameOverPayload);
          }
        }, gracePeriodMs);

        timer.unref?.();
        targetTimerRegistry.set(matchedRoom.roomCode, playerId, timer);
        if (targetTimerRegistry !== this.timerRegistry) {
          this.timerRegistry.set(matchedRoom.roomCode, playerId, timer);
        }
      }

      return { room: nextRoom, player: droppedPlayer, wasActiveGame: paused };
    });
  }

  /**
   * Handles disconnect grace period expiration. If player has not reconnected,
   * forfeits the match by abandonment and awards the win to the opponent.
   */
  public async handleAbandonmentForfeit(
    roomCode: string,
    disconnectedPlayerId: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload } | null> {
    const normalizedCode = roomCode.trim().toUpperCase();

    return this.store.withLock(normalizedCode, async () => {
      const room = await this.store.findByCode(normalizedCode);
      if (!room) return null;

      // Only forfeit if room is still paused waiting for reconnect
      if (room.status !== "paused_disconnect") return null;

      // Check if disconnected player is still disconnected
      let disconnectedPlayer: Player | null = null;
      if (room.whitePlayer?.id === disconnectedPlayerId) {
        disconnectedPlayer = room.whitePlayer;
      } else if (room.blackPlayer?.id === disconnectedPlayerId) {
        disconnectedPlayer = room.blackPlayer;
      }

      if (!disconnectedPlayer || disconnectedPlayer.isConnected) {
        return null;
      }

      const winnerColor: PieceColor =
        disconnectedPlayer.color === "w" ? "b" : "w";
      const winnerPlayer =
        winnerColor === "w" ? room.whitePlayer : room.blackPlayer;

      room.status = "game_over";
      room.lastActivityAt = this.clock.now();

      let gameOverPayload: GameOverPayload;

      if (winnerPlayer && winnerPlayer.isConnected) {
        gameOverPayload = createGameOverPayload({
          winner: winnerColor,
          winnerName: winnerPlayer.name,
          loserName: disconnectedPlayer.name,
          reason: "abandonment",
          finalFen: room.game.fen,
          totalMoves: room.game.moveCount,
          startTimeMs: room.createdAt,
        });
      } else {
        // Both players are disconnected when the grace timer expires
        gameOverPayload = createGameOverPayload({
          winner: "draw",
          reason: "abandonment",
          finalFen: room.game.fen,
          totalMoves: room.game.moveCount,
          startTimeMs: room.createdAt,
        });
      }

      await this.store.save(room);
      return { room, gameOverPayload };
    });
  }

  /**
   * Finds a room by code.
   */
  public async getRoom(roomCode: string): Promise<RoomState | null> {
    return this.store.findByCode(roomCode.trim().toUpperCase());
  }

  /**
   * Cleans up stale rooms inactive for longer than maxAgeMs (default 10 minutes).
   */
  public async cleanupAbandonedRooms(
    maxAgeMs = 10 * 60 * 1000,
  ): Promise<number> {
    // PERF: Also evict expired sessions across all rooms to prevent memory leaks
    await this.sessionRegistry.cleanupExpiredSessions();

    const rooms = await this.store.listActiveRooms();
    const now = this.clock.now();
    let cleaned = 0;

    for (const room of rooms) {
      if (now - room.lastActivityAt > maxAgeMs) {
        // MIN-006: Cancel disconnect timers when cleaning up abandoned rooms
        this.timerRegistry.cancelAllForRoom(room.roomCode);
        await this.store.delete(room.roomCode);
        await this.sessionRegistry.deleteSessionsForRoom(room.roomCode);
        cleaned++;
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
  ): Promise<RoomState> {
    const code = roomCode.trim().toUpperCase();
    return this.store.mutate(code, async (room) => {
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
    });
  }

  /**
   * Finalizes a match with an explicit game-over payload (resignation, timeout, draw).
   */
  public async finalizeGame(
    roomCode: string,
    gameOverPayload: GameOverPayload,
  ): Promise<RoomState> {
    const code = roomCode.trim().toUpperCase();
    return this.store.mutate(code, async (room) => {
      if (room.status !== "playing") {
        throw new GameNotActiveError(room.status);
      }
      if (gameOverPayload.reason === "draw_agreement" && !room.drawOffer) {
        throw new GameNotActiveError("No draw offer is currently pending");
      }
      const now = this.clock.now();
      const updated = finalizeGameTransition(room, gameOverPayload, now);
      return { updatedRoom: updated, result: updated };
    });
  }

  /**
   * Records a proposed draw offer or response in the room state.
   */
  public async updateDrawOffer(
    roomCode: string,
    drawOffer: RoomState["drawOffer"],
  ): Promise<RoomState> {
    const code = roomCode.trim().toUpperCase();
    return this.store.mutate(code, async (room) => {
      const now = this.clock.now();
      const updated = updateDrawOfferTransition(room, drawOffer, now);
      return { updatedRoom: updated, result: updated };
    });
  }

  /**
   * Records a rematch proposal or acceptance in the room state.
   */
  public async updateRematch(
    roomCode: string,
    rematch: RoomState["rematch"],
    newGameState?: GameState,
    players?: { whitePlayer: Player | null; blackPlayer: Player | null },
  ): Promise<RoomState> {
    const code = roomCode.trim().toUpperCase();
    const result = await this.store.mutate(code, async (room) => {
      const now = this.clock.now();
      const updated = updateRematchTransition(
        room,
        rematch,
        newGameState,
        now,
        players,
      );
      return { updatedRoom: updated, result: updated };
    });

    if (rematch?.status === "accepted") {
      if (result.whitePlayer) {
        await this.sessionRegistry.updateSessionColor(
          code,
          result.whitePlayer.id,
          "w",
        );
      }
      if (result.blackPlayer) {
        await this.sessionRegistry.updateSessionColor(
          code,
          result.blackPlayer.id,
          "b",
        );
      }
    }

    return result;
  }

  /**
   * Generates a 4-letter uppercase room code candidate.
   */
  private generateRoomCodeCandidate(): string {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const idx = this.idGenerator.generateRandomInt
        ? this.idGenerator.generateRandomInt(0, ROOM_CODE_CHARSET.length)
        : randomInt(0, ROOM_CODE_CHARSET.length);
      code += ROOM_CODE_CHARSET.charAt(idx);
    }
    return code;
  }

  /**
   * Generates a 4-letter uppercase room code, ensuring uniqueness against current store.
   */
  private async generateUniqueRoomCode(): Promise<string> {
    let attempts = 0;
    while (attempts < 100) {
      const code = this.generateRoomCodeCandidate();
      const existing = await this.store.findByCode(code);
      if (!existing) {
        return code;
      }
      attempts++;
    }

    // Fallback timestamp code
    return `R${this.clock.now().toString(36).toUpperCase().slice(-3)}`;
  }
}
