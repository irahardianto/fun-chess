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
  createInitialGameState,
  createGameOverPayload,
  RoomNotFoundError,
  GameNotActiveError,
  PlayerNotInRoomError,
  NotYourTurnError,
  InvalidMoveError,
  InvalidPayloadError,
} from "@fun-chess/shared";
import { RoomStore } from "../rooms/index.js";
import { ChessEngine } from "./chess_engine.js";
import {
  IClock,
  SystemClock,
  IIdGenerator,
  UuidGenerator,
} from "./clock.js";

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
  constructor(
    private readonly store: RoomStore,
    private readonly clock: IClock = new SystemClock(),
    private readonly idGenerator: IIdGenerator = new UuidGenerator(),
  ) {}

  /**
   * Validates and applies a move from a player socket.
   */
  public async makeMove(
    req: MakeMoveRequest,
    socketId: string,
  ): Promise<MoveApplicationResult> {
    const roomCode = (req.roomCode || "").trim().toUpperCase();

    return this.store.mutate(roomCode, async (room) => {
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
      room.lastActivityAt = this.clock.now();
      if (room.drawOffer) {
        room.drawOffer = null;
      }

      let checkInfo: { inCheck: PieceColor; kingSquare: string } | undefined;
      let gameOverPayload: GameOverPayload | undefined;

      if (outcome.nextState.isCheckmate) {
        room.status = "game_over";
        gameOverPayload = createGameOverPayload({
          winner: player.color,
          winnerName: player.name,
          reason: "checkmate",
          finalFen: outcome.nextState.fen,
          totalMoves: outcome.nextState.moveCount,
          startTimeMs: room.createdAt,
        });
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

        gameOverPayload = createGameOverPayload({
          winner: "draw",
          reason,
          finalFen: outcome.nextState.fen,
          totalMoves: outcome.nextState.moveCount,
          startTimeMs: room.createdAt,
        });
      } else if (outcome.nextState.isCheck) {
        const chess = new Chess(outcome.nextState.fen);
        const kingSquare =
          ChessEngine.getKingSquare(chess, outcome.nextState.turn) || "e1";
        checkInfo = {
          inCheck: outcome.nextState.turn,
          kingSquare,
        };
      }

      return {
        updatedRoom: room,
        result: {
          room,
          moveResult: outcome.moveResult,
          gameState: outcome.nextState,
          checkInfo,
          gameOverPayload,
        },
      };
    });
  }

  /**
   * Concedes active match to the opponent.
   */
  public async resign(
    roomCode: string,
    socketId: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload }> {
    const code = roomCode.trim().toUpperCase();
    return this.store.mutate(code, async (room) => {
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
      room.lastActivityAt = this.clock.now();

      const gameOverPayload: GameOverPayload = createGameOverPayload({
        winner: winnerColor,
        winnerName,
        loserName: player.name,
        reason: "resignation",
        finalFen: room.game.fen,
        totalMoves: room.game.moveCount,
        startTimeMs: room.createdAt,
      });

      return {
        updatedRoom: room,
        result: { room, gameOverPayload },
      };
    });
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
    return this.store.mutate(code, async (room) => {
      if (room.status !== "playing") {
        throw new GameNotActiveError(room.status);
      }

      const player = this.getPlayerBySocketId(room, socketId);
      if (!player) {
        throw new PlayerNotInRoomError(socketId);
      }

      const opponent =
        player.color === "w" ? room.blackPlayer : room.whitePlayer;

      room.drawOffer = { offeredBy: socketId, offeredAt: this.clock.now() };
      room.lastActivityAt = this.clock.now();

      return {
        updatedRoom: room,
        result: { room, fromPlayer: player, opponentPlayer: opponent },
      };
    });
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
    return this.store.mutate<{
      room: RoomState;
      accept: boolean;
      byPlayerId: string;
      gameOverPayload?: GameOverPayload;
    }>(code, async (room) => {
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
        room.lastActivityAt = this.clock.now();
        return {
          updatedRoom: room,
          result: { room, accept: false, byPlayerId: player.id },
        };
      }

      room.status = "game_over";
      room.lastActivityAt = this.clock.now();

      const gameOverPayload: GameOverPayload = createGameOverPayload({
        winner: "draw",
        reason: "draw_agreement",
        finalFen: room.game.fen,
        totalMoves: room.game.moveCount,
        startTimeMs: room.createdAt,
      });

      return {
        updatedRoom: room,
        result: { room, accept: true, byPlayerId: player.id, gameOverPayload },
      };
    });
  }

  /**
   * Initiates a rematch request following game over.
   */
  public async requestRematch(
    roomCode: string,
    socketId: string,
  ): Promise<{ room: RoomState; requestedBy: string; requesterName: string }> {
    const code = roomCode.trim().toUpperCase();
    return this.store.mutate(code, async (room) => {
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
        requestedAt: this.clock.now(),
        status: "pending",
      };
      room.status = "rematch_pending";
      room.lastActivityAt = this.clock.now();

      return {
        updatedRoom: room,
        result: { room, requestedBy: player.id, requesterName: player.name },
      };
    });
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
    return this.store.mutate<{
      room: RoomState;
      accept: boolean;
      byPlayerId: string;
      nextGameState?: GameState;
    }>(code, async (room) => {
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
        room.lastActivityAt = this.clock.now();
        return {
          updatedRoom: room,
          result: { room, accept: false, byPlayerId: player.id },
        };
      }

      // Accept rematch: swap piece colors
      const whitePlayer = room.whitePlayer;
      const blackPlayer = room.blackPlayer;

      if (
        !whitePlayer ||
        !blackPlayer ||
        !whitePlayer.isConnected ||
        !blackPlayer.isConnected
      ) {
        throw new GameNotActiveError(
          "Both players must be connected to start a rematch",
        );
      }

      whitePlayer.color = "b";
      blackPlayer.color = "w";

      room.whitePlayer = blackPlayer;
      room.blackPlayer = whitePlayer;

      // Reset board using shared helper
      room.game = createInitialGameState();
      room.rematch.status = "accepted";
      room.status = "playing";
      room.lastActivityAt = this.clock.now();

      return {
        updatedRoom: room,
        result: {
          room,
          accept: true,
          byPlayerId: player.id,
          nextGameState: room.game,
        },
      };
    });
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
