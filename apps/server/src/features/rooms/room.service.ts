import { randomUUID } from "node:crypto";
import { Chess } from "chess.js";
import {
  CreateRoomRequest,
  GameOverPayload,
  JoinRoomRequest,
  PieceColor,
  Player,
  ReconnectRequest,
  RoomState,
} from "@fun-chess/shared";
import { RoomStore } from "./room.store.js";
import {
  RoomNotFoundError,
  RoomFullError,
  InvalidRoomCodeError,
  UnauthorizedError,
  PlayerNotInRoomError,
  InvalidPayloadError,
} from "./room.errors.js";
import { ChessEngine } from "../game/chess_engine.js";

const ROOM_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes 0, O, 1, I
const ROOM_CODE_LENGTH = 4;

/**
 * Service coordinating room creation, player joining, reconnection, and session lifecycle.
 */
export class RoomService {
  constructor(private readonly store: RoomStore) {}

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
    const playerId = randomUUID();
    const sessionToken = randomUUID();

    let hostColor: PieceColor;
    if (req.preferredColor === "random" || !req.preferredColor) {
      hostColor = Math.random() < 0.5 ? "w" : "b";
    } else {
      hostColor = req.preferredColor;
    }

    const hostPlayer: Player = {
      id: playerId,
      socketId,
      name: rawName,
      color: hostColor,
      isHost: true,
      isConnected: true,
      sessionToken,
      connectedAt: Date.now(),
    };

    const initialGameState = ChessEngine.extractGameState(new Chess(), null);

    const newRoom: RoomState = {
      roomCode,
      status: "lobby",
      hostId: playerId,
      whitePlayer: hostColor === "w" ? hostPlayer : null,
      blackPlayer: hostColor === "b" ? hostPlayer : null,
      spectators: [],
      game: initialGameState,
      rematch: null,
      drawOffer: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    await this.store.save(newRoom);
    return { room: newRoom, sessionToken };
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

    const room = await this.store.findByCode(normalizedCode);
    if (!room) {
      throw new RoomNotFoundError(normalizedCode);
    }

    if (room.whitePlayer && room.blackPlayer) {
      throw new RoomFullError(normalizedCode);
    }

    const playerId = randomUUID();
    const sessionToken = randomUUID();
    const assignedColor: PieceColor = room.whitePlayer ? "b" : "w";

    const player: Player = {
      id: playerId,
      socketId,
      name: rawName,
      color: assignedColor,
      isHost: false,
      isConnected: true,
      sessionToken,
      connectedAt: Date.now(),
    };

    if (assignedColor === "w") {
      room.whitePlayer = player;
    } else {
      room.blackPlayer = player;
    }

    room.status = "playing";
    room.lastActivityAt = Date.now();

    await this.store.save(room);
    return { room, player, sessionToken };
  }

  /**
   * Restores a dropped player session after network glitch or page refresh.
   */
  public async reconnect(
    req: ReconnectRequest,
    socketId: string,
  ): Promise<{ room: RoomState; player: Player }> {
    const normalizedCode = (req.roomCode || "").trim().toUpperCase();
    const room = await this.store.findByCode(normalizedCode);
    if (!room) {
      throw new RoomNotFoundError(normalizedCode);
    }

    let targetPlayer: Player | null = null;
    if (room.whitePlayer?.id === req.playerId) {
      targetPlayer = room.whitePlayer;
    } else if (room.blackPlayer?.id === req.playerId) {
      targetPlayer = room.blackPlayer;
    } else {
      targetPlayer = room.spectators.find((s) => s.id === req.playerId) || null;
    }

    if (!targetPlayer) {
      throw new UnauthorizedError("Player not found in room");
    }

    if (targetPlayer.sessionToken !== req.sessionToken) {
      throw new UnauthorizedError("Invalid session token");
    }

    targetPlayer.socketId = socketId;
    targetPlayer.isConnected = true;

    // If game was paused waiting for disconnect, resume if both players now connected
    if (room.status === "paused_disconnect") {
      if (room.whitePlayer?.isConnected && room.blackPlayer?.isConnected) {
        room.status = "playing";
      }
    }

    room.lastActivityAt = Date.now();
    await this.store.save(room);

    return { room, player: targetPlayer };
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
        room.lastActivityAt = Date.now();
        const durationSeconds = Math.max(
          1,
          Math.round((Date.now() - room.createdAt) / 1000),
        );
        const gameOverPayload: GameOverPayload = {
          winner: remainingPlayer.color,
          winnerName: remainingPlayer.name,
          reason: "abandonment",
          message: `${leavingPlayer.name} left the game. ${remainingPlayer.name} won by abandonment!`,
          finalFen: room.game.fen,
          totalMoves: room.game.moveCount,
          durationSeconds,
        };
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
      (!room.whitePlayer && !room.blackPlayer) ||
      room.status === "lobby";

    if (shouldDelete) {
      await this.store.delete(normalizedCode);
    } else {
      room.lastActivityAt = Date.now();
      await this.store.save(room);
    }

    return { room, player: leavingPlayer, shouldDelete };
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

    const { room, playerId } = match;
    let droppedPlayer: Player | null = null;

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
      }
    }

    if (!droppedPlayer) return null;

    const wasActiveGame = room.status === "playing";
    if (wasActiveGame) {
      room.status = "paused_disconnect";
    }

    room.lastActivityAt = Date.now();
    await this.store.save(room);

    return { room, player: droppedPlayer, wasActiveGame };
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
    const winnerName = winnerPlayer?.name || "Opponent";

    room.status = "game_over";
    room.lastActivityAt = Date.now();

    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - room.createdAt) / 1000),
    );
    const gameOverPayload: GameOverPayload = {
      winner: winnerColor,
      winnerName,
      reason: "abandonment",
      message: `${disconnectedPlayer.name} disconnected. ${winnerName} won by abandonment!`,
      finalFen: room.game.fen,
      totalMoves: room.game.moveCount,
      durationSeconds,
    };

    await this.store.save(room);
    return { room, gameOverPayload };
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
    const rooms = await this.store.listActiveRooms();
    const now = Date.now();
    let cleaned = 0;

    for (const room of rooms) {
      if (now - room.lastActivityAt > maxAgeMs) {
        await this.store.delete(room.roomCode);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Generates a 4-letter uppercase room code, ensuring uniqueness against current store.
   */
  private async generateUniqueRoomCode(): Promise<string> {
    let attempts = 0;
    while (attempts < 100) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        const idx = Math.floor(Math.random() * ROOM_CODE_CHARSET.length);
        code += ROOM_CODE_CHARSET.charAt(idx);
      }

      const existing = await this.store.findByCode(code);
      if (!existing) {
        return code;
      }
      attempts++;
    }

    // Fallback timestamp code
    return `R${Date.now().toString(36).toUpperCase().slice(-3)}`;
  }
}
