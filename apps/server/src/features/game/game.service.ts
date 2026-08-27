import { Chess } from "chess.js";
import {
  GameOverPayload,
  GameOverReason,
  GameState,
  MakeMoveRequest,
  MoveResult,
  PieceColor,
  Player,
  RoomState,
} from "@fun-chess/shared";
import { RoomStore } from "../rooms/room.store.js";
import {
  RoomNotFoundError,
  GameNotActiveError,
  PlayerNotInRoomError,
  NotYourTurnError,
  InvalidMoveError,
  InvalidPayloadError,
  AppError,
} from "../rooms/room.errors.js";
import { ChessEngine } from "./chess_engine.js";

export interface MoveApplicationResult {
  room: RoomState;
  moveResult: MoveResult;
  gameState: GameState;
  checkInfo?: { inCheck: PieceColor; kingSquare: string };
  gameOverPayload?: GameOverPayload;
}

/**
 * Service orchestrating chess game actions (moves, resignations, draws, and rematches).
 */
export class GameService {
  constructor(private readonly store: RoomStore) {}

  /**
   * Validates and applies a move from a player socket.
   */
  public async makeMove(
    req: MakeMoveRequest,
    socketId: string,
  ): Promise<MoveApplicationResult> {
    const roomCode = (req.roomCode || "").trim().toUpperCase();
    const room = await this.store.findByCode(roomCode);
    if (!room) {
      throw new RoomNotFoundError(roomCode);
    }

    if (room.status !== "playing") {
      throw new GameNotActiveError(room.status);
    }

    const player = this.getPlayerBySocketId(room, socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }

    if (player.color !== room.game.turn) {
      throw new NotYourTurnError();
    }

    const outcome = ChessEngine.validateAndApplyMove(
      room.game.fen,
      req.move,
      player.color,
      room.game.moveHistory,
    );

    if (!outcome.success) {
      throw new InvalidMoveError(outcome.error);
    }

    room.game = outcome.nextState;
    room.lastActivityAt = Date.now();
    if (room.drawOffer) {
      room.drawOffer = null;
    }

    let checkInfo: { inCheck: PieceColor; kingSquare: string } | undefined;
    let gameOverPayload: GameOverPayload | undefined;

    if (outcome.nextState.isCheckmate) {
      room.status = "game_over";
      const durationSeconds = Math.max(
        1,
        Math.round((Date.now() - room.createdAt) / 1000),
      );
      gameOverPayload = {
        winner: player.color,
        winnerName: player.name,
        reason: "checkmate",
        message: `Checkmate! ${player.name} won the match.`,
        finalFen: outcome.nextState.fen,
        totalMoves: outcome.nextState.moveCount,
        durationSeconds,
      };
    } else if (outcome.nextState.isDraw) {
      room.status = "game_over";
      const reason: GameOverReason = outcome.nextState.isStalemate
        ? "stalemate"
        : outcome.nextState.isThreefoldRepetition
          ? "threefold_repetition"
          : outcome.nextState.isInsufficientMaterial
            ? "insufficient_material"
            : outcome.nextState.isFiftyMoveRule
              ? "fifty_move_rule"
              : "draw_agreement";

      const durationSeconds = Math.max(
        1,
        Math.round((Date.now() - room.createdAt) / 1000),
      );
      gameOverPayload = {
        winner: "draw",
        reason,
        message: `Draw by ${reason.replace(/_/g, " ")}!`,
        finalFen: outcome.nextState.fen,
        totalMoves: outcome.nextState.moveCount,
        durationSeconds,
      };
    } else if (outcome.nextState.isCheck) {
      const chess = new Chess(outcome.nextState.fen);
      const kingSquare =
        ChessEngine.getKingSquare(chess, outcome.nextState.turn) || "e1";
      checkInfo = {
        inCheck: outcome.nextState.turn,
        kingSquare,
      };
    }

    await this.store.save(room);

    return {
      room,
      moveResult: outcome.moveResult,
      gameState: outcome.nextState,
      checkInfo,
      gameOverPayload,
    };
  }

  /**
   * Concedes active match to the opponent.
   */
  public async resign(
    roomCode: string,
    socketId: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload }> {
    const code = roomCode.trim().toUpperCase();
    const room = await this.store.findByCode(code);
    if (!room) {
      throw new RoomNotFoundError(code);
    }

    if (room.status !== "playing") {
      throw new GameNotActiveError(room.status);
    }

    const player = this.getPlayerBySocketId(room, socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }

    const winnerColor: PieceColor = player.color === "w" ? "b" : "w";
    const winnerPlayer =
      winnerColor === "w" ? room.whitePlayer : room.blackPlayer;
    const winnerName = winnerPlayer?.name || "Opponent";

    room.status = "game_over";
    room.drawOffer = null;
    room.lastActivityAt = Date.now();

    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - room.createdAt) / 1000),
    );
    const gameOverPayload: GameOverPayload = {
      winner: winnerColor,
      winnerName,
      reason: "resignation",
      message: `${player.name} resigned. ${winnerName} won the match!`,
      finalFen: room.game.fen,
      totalMoves: room.game.moveCount,
      durationSeconds,
    };

    await this.store.save(room);
    return { room, gameOverPayload };
  }

  /**
   * Proposes a peaceful draw to opponent.
   */
  public async offerDraw(
    roomCode: string,
    socketId: string,
  ): Promise<{
    room: RoomState;
    fromPlayer: Player;
    opponentPlayer: Player | null;
  }> {
    const code = roomCode.trim().toUpperCase();
    const room = await this.store.findByCode(code);
    if (!room) {
      throw new RoomNotFoundError(code);
    }

    if (room.status !== "playing") {
      throw new GameNotActiveError(room.status);
    }

    const player = this.getPlayerBySocketId(room, socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }

    const opponent = player.color === "w" ? room.blackPlayer : room.whitePlayer;

    room.drawOffer = { offeredBy: socketId, offeredAt: Date.now() };
    room.lastActivityAt = Date.now();
    await this.store.save(room);

    return { room, fromPlayer: player, opponentPlayer: opponent };
  }

  /**
   * Responds to draw offer.
   */
  public async respondDraw(
    roomCode: string,
    socketId: string,
    accept: boolean,
  ): Promise<{
    room: RoomState;
    accept: boolean;
    byPlayerId: string;
    gameOverPayload?: GameOverPayload;
  }> {
    const code = roomCode.trim().toUpperCase();
    const room = await this.store.findByCode(code);
    if (!room) {
      throw new RoomNotFoundError(code);
    }

    if (room.status !== "playing") {
      throw new GameNotActiveError(room.status);
    }

    const player = this.getPlayerBySocketId(room, socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }

    if (!room.drawOffer) {
      throw new GameNotActiveError("No draw offer is currently pending");
    }

    if (room.drawOffer.offeredBy === socketId) {
      throw new InvalidPayloadError(
        "draw",
        "Cannot accept or decline your own draw offer",
      );
    }

    room.drawOffer = null;

    if (!accept) {
      room.lastActivityAt = Date.now();
      await this.store.save(room);
      return { room, accept: false, byPlayerId: player.id };
    }

    room.status = "game_over";
    room.lastActivityAt = Date.now();

    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - room.createdAt) / 1000),
    );
    const gameOverPayload: GameOverPayload = {
      winner: "draw",
      reason: "draw_agreement",
      message: "Match concluded with a mutually agreed draw.",
      finalFen: room.game.fen,
      totalMoves: room.game.moveCount,
      durationSeconds,
    };

    await this.store.save(room);
    return { room, accept: true, byPlayerId: player.id, gameOverPayload };
  }

  /**
   * Initiates a rematch request following game over.
   */
  public async requestRematch(
    roomCode: string,
    socketId: string,
  ): Promise<{ room: RoomState; requestedBy: string; requesterName: string }> {
    const code = roomCode.trim().toUpperCase();
    const room = await this.store.findByCode(code);
    if (!room) {
      throw new RoomNotFoundError(code);
    }

    if (room.status !== "game_over" && room.status !== "rematch_pending") {
      throw new GameNotActiveError(
        "Rematches can only be requested after game over",
      );
    }

    const player = this.getPlayerBySocketId(room, socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }

    room.rematch = {
      requestedBy: player.id,
      requestedAt: Date.now(),
      status: "pending",
    };
    room.status = "rematch_pending";
    room.lastActivityAt = Date.now();

    await this.store.save(room);
    return { room, requestedBy: player.id, requesterName: player.name };
  }

  /**
   * Accepts or declines rematch proposal. If accepted, player piece colors are swapped.
   */
  public async respondRematch(
    roomCode: string,
    socketId: string,
    accept: boolean,
  ): Promise<{
    room: RoomState;
    accept: boolean;
    byPlayerId: string;
    nextGameState?: GameState;
  }> {
    const code = roomCode.trim().toUpperCase();
    const room = await this.store.findByCode(code);
    if (!room) {
      throw new RoomNotFoundError(code);
    }

    if (!room.rematch || room.rematch.status !== "pending") {
      throw new GameNotActiveError(
        "No pending rematch request found for this room",
      );
    }

    const player = this.getPlayerBySocketId(room, socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }

    if (player.id === room.rematch.requestedBy) {
      throw new InvalidPayloadError(
        "rematch",
        "Cannot accept or decline your own rematch request",
      );
    }

    room.drawOffer = null;

    if (!accept) {
      room.rematch.status = "declined";
      room.status = "game_over";
      room.lastActivityAt = Date.now();
      await this.store.save(room);
      return { room, accept: false, byPlayerId: player.id };
    }

    // Accept rematch: swap piece colors
    const whitePlayer = room.whitePlayer;
    const blackPlayer = room.blackPlayer;

    if (whitePlayer) whitePlayer.color = "b";
    if (blackPlayer) blackPlayer.color = "w";

    room.whitePlayer = blackPlayer;
    room.blackPlayer = whitePlayer;

    // Reset board
    const initialChess = new Chess();
    room.game = ChessEngine.extractGameState(initialChess, null);
    room.rematch.status = "accepted";
    room.status = "playing";
    room.lastActivityAt = Date.now();

    await this.store.save(room);
    return {
      room,
      accept: true,
      byPlayerId: player.id,
      nextGameState: room.game,
    };
  }

  private getPlayerBySocketId(
    room: RoomState,
    socketId: string,
  ): Player | null {
    if (room.whitePlayer?.socketId === socketId) return room.whitePlayer;
    if (room.blackPlayer?.socketId === socketId) return room.blackPlayer;
    return null;
  }
}
