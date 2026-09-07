import { randomUUID, randomInt } from "node:crypto";
import {
  CreateRoomRequest,
  GameOverPayload,
  JoinRoomRequest,
  PieceColor,
  Player,
  ReconnectRequest,
  RoomState,
  createInitialGameState,
  createGameOverPayload,
} from "@fun-chess/shared";
import { RoomStore } from "./room.store.js";
import { IRoomService } from "./room.interface.js";
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
  defaultDisconnectTimerRegistry,
  cancelAllDisconnectTimersForRoom,
} from "./disconnect_timer_registry.js";
import {
  RoomNotFoundError,
  RoomFullError,
  InvalidRoomCodeError,
  UnauthorizedError,
  PlayerNotInRoomError,
  InvalidPayloadError,
} from "./room.errors.js";

const ROOM_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes 0, O, 1, I
const ROOM_CODE_LENGTH = 4;

/**
 * Service coordinating room creation, player joining, reconnection, and session lifecycle.
 */
export class RoomService implements IRoomService {
  constructor(
    private readonly store: RoomStore,
    private readonly sessionRegistry: SessionRegistry = new InMemorySessionRegistry(),
    private readonly clock: IClock = new SystemClock(),
    private readonly idGenerator: IIdGenerator = new UuidGenerator(),
    private readonly timerRegistry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
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

    const roomCode = await this.generateUniqueRoomCode();
    const playerId = this.idGenerator.generateId();

    let hostColor: PieceColor;
    if (req.preferredColor === "random" || !req.preferredColor) {
      hostColor = (this.idGenerator.generateRandomInt ? this.idGenerator.generateRandomInt(0, 2) : randomInt(0, 2)) === 0 ? "w" : "b";
    } else {
      hostColor = req.preferredColor;
    }

    const hostPlayer: Player = {
      id: playerId,
      socketId,
      name: rawName,
      avatar: req.avatar || "🦁",
      color: hostColor,
      isHost: true,
      isConnected: true,
      connectedAt: this.clock.now(),
    };

    const initialGameState = createInitialGameState();

    const newRoom: RoomState = {
      roomCode,
      version: 1,
      status: "lobby",
      hostId: playerId,
      whitePlayer: hostColor === "w" ? hostPlayer : null,
      blackPlayer: hostColor === "b" ? hostPlayer : null,
      spectators: [],
      game: initialGameState,
      rematch: null,
      drawOffer: null,
      createdAt: this.clock.now(),
      lastActivityAt: this.clock.now(),
    };

    await this.store.save(newRoom);

    const sessionRecord = await this.sessionRegistry.createSession({
      playerId,
      roomCode,
      color: hostColor,
      isHost: true,
      socketId,
    });

    return { room: newRoom, sessionToken: sessionRecord.sessionToken };
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

    const result = await this.store.mutate(normalizedCode, async (room) => {
      if (room.whitePlayer && room.blackPlayer) {
        throw new RoomFullError(normalizedCode);
      }

      const assignedColor: PieceColor = room.whitePlayer ? "b" : "w";

      const player: Player = {
        id: playerId,
        socketId,
        name: rawName,
        avatar: req.avatar || "🦁",
        color: assignedColor,
        isHost: false,
        isConnected: true,
        connectedAt: this.clock.now(),
      };

      if (assignedColor === "w") {
        room.whitePlayer = player;
      } else {
        room.blackPlayer = player;
      }

      room.status = "playing";
      room.lastActivityAt = this.clock.now();

      return {
        updatedRoom: room,
        result: { room, player, assignedColor },
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
    const normalizedCode = (req.roomCode || "").trim().toUpperCase();
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
      let targetPlayer: Player | null = null;
      if (room.whitePlayer?.id === req.playerId) {
        targetPlayer = room.whitePlayer;
      } else if (room.blackPlayer?.id === req.playerId) {
        targetPlayer = room.blackPlayer;
      } else {
        targetPlayer =
          room.spectators.find((s) => s.id === req.playerId) || null;
      }

      if (!targetPlayer) {
        throw new UnauthorizedError("Player not found in room");
      }

      targetPlayer.socketId = socketId;
      targetPlayer.isConnected = true;

      // If game was paused waiting for disconnect, resume if both players now connected
      if (room.status === "paused_disconnect") {
        if (room.whitePlayer?.isConnected && room.blackPlayer?.isConnected) {
          room.status = "playing";
        }
      }

      room.lastActivityAt = this.clock.now();
      return {
        updatedRoom: room,
        result: { room, player: targetPlayer },
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
      let isPlayingPlayer = false;
      if (room.whitePlayer?.socketId === socketId) {
        leavingPlayer = room.whitePlayer;
        room.whitePlayer = null;
        isPlayingPlayer = true;
      } else if (room.blackPlayer?.socketId === socketId) {
        leavingPlayer = room.blackPlayer;
        room.blackPlayer = null;
        isPlayingPlayer = true;
      } else {
        const idx = room.spectators.findIndex((s) => s.socketId === socketId);
        if (idx !== -1 && room.spectators[idx]) {
          leavingPlayer = room.spectators[idx];
          room.spectators.splice(idx, 1);
        }
      }

      if (!leavingPlayer) {
        throw new PlayerNotInRoomError(socketId);
      }

      if (
        isPlayingPlayer &&
        (room.status === "playing" || room.status === "paused_disconnect")
      ) {
        const remainingPlayer =
          leavingPlayer.color === "w" ? room.blackPlayer : room.whitePlayer;
        if (remainingPlayer) {
          room.status = "game_over";
          room.lastActivityAt = this.clock.now();
          const gameOverPayload: GameOverPayload = createGameOverPayload({
            winner: remainingPlayer.color,
            winnerName: remainingPlayer.name,
            loserName: leavingPlayer.name,
            reason: "abandonment",
            message: `${leavingPlayer.name} left the game. ${remainingPlayer.name} won by abandonment!`,
            finalFen: room.game.fen,
            totalMoves: room.game.moveCount,
            startTimeMs: room.createdAt,
          });
          await this.store.save(room);
          return {
            room,
            player: leavingPlayer,
            shouldDelete: false,
            gameOverPayload,
          };
        }
      }

      const shouldDelete =
        leavingPlayer.isHost ||
        (!room.whitePlayer && !room.blackPlayer);

      if (shouldDelete) {
        await this.store.delete(normalizedCode);
        await this.sessionRegistry.deleteSessionsForRoom(normalizedCode);
      } else {
        room.lastActivityAt = this.clock.now();
        await this.store.save(room);
      }

      return { room, player: leavingPlayer, shouldDelete };
    });
  }

  /**
   * Handles unexpected socket drop. Marks player disconnected and pauses active match.
   */
  public async handleDisconnect(socketId: string): Promise<{
    room: RoomState;
    player: Player;
    wasActiveGame: boolean;
  } | null> {
    const match = await this.store.findBySocketId(socketId);
    if (!match) return null;

    const { room: matchedRoom, playerId } = match;

    return this.store.withLock(matchedRoom.roomCode, async () => {
      const room = await this.store.findByCode(matchedRoom.roomCode);
      if (!room) return null;

      let droppedPlayer: Player | null = null;
      let isSpectator = false;

      if (room.whitePlayer?.id === playerId) {
        room.whitePlayer.isConnected = false;
        droppedPlayer = room.whitePlayer;
      } else if (room.blackPlayer?.id === playerId) {
        room.blackPlayer.isConnected = false;
        droppedPlayer = room.blackPlayer;
      } else {
        const spectator = room.spectators.find((s) => s.id === playerId);
        if (spectator) {
          spectator.isConnected = false;
          droppedPlayer = spectator;
          isSpectator = true;
        }
      }

      if (!droppedPlayer) return null;

      const isActivePlayer = !isSpectator;
      let wasActiveGame = false;

      if (
        isActivePlayer &&
        (room.status === "playing" || room.status === "paused_disconnect")
      ) {
        wasActiveGame = true;
        room.status = "paused_disconnect";
      }

      room.lastActivityAt = this.clock.now();
      await this.store.save(room);

      return { room, player: droppedPlayer, wasActiveGame };
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

  /**
   * Generates a 4-letter uppercase room code, ensuring uniqueness against current store.
   */
  private async generateUniqueRoomCode(): Promise<string> {
    let attempts = 0;
    while (attempts < 100) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        const idx = this.idGenerator.generateRandomInt
          ? this.idGenerator.generateRandomInt(0, ROOM_CODE_CHARSET.length)
          : randomInt(0, ROOM_CODE_CHARSET.length);
        code += ROOM_CODE_CHARSET.charAt(idx);
      }

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
