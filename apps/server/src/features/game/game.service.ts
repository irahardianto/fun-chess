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
  OptimisticLockConflictError,
} from "@fun-chess/shared";
import type { IRoomGameAdapter } from "../rooms/index.js";
import { ChessEngine } from "./chess_engine.js";
import {
  IClock,
  SystemClock,
  IIdGenerator,
  UuidGenerator,
} from "./clock.js";
import {
  IGameService,
  MoveApplicationResult,
} from "./game.interface.js";

export type { MoveApplicationResult };

/**
 * Service orchestrating chess game actions (moves, resignations, draws, and rematches).
 * Delegates all room persistence and mutation operations strictly through IRoomGameAdapter (MAJ-012).
 */
export class GameService implements IGameService {
  private readonly roomAdapter: IRoomGameAdapter;
  private readonly clock: IClock;
  private readonly idGenerator: IIdGenerator;

  constructor(
    roomAdapter: IRoomGameAdapter,
    clock?: IClock,
    idGenerator?: IIdGenerator,
  ) {
    this.roomAdapter = roomAdapter;
    this.clock = clock ?? new SystemClock();
    this.idGenerator = idGenerator ?? new UuidGenerator();
  }

  /**
   * Validates and applies a move from a player socket through roomAdapter.
   * Handles expectedMoveNumber idempotency and sequencing guards (MAJ-031).
   */
  public async makeMove(
    req: MakeMoveRequest,
    socketId: string,
  ): Promise<MoveApplicationResult> {
    const roomCode = (req.roomCode || "").trim().toUpperCase();
    const room = await this.roomAdapter.getRoom(roomCode);

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

    // Handle expectedMoveNumber and idempotencyKey (MAJ-031)
    if (
      req.expectedMoveNumber !== undefined &&
      req.expectedMoveNumber !== room.game.moveCount
    ) {
      if (req.expectedMoveNumber < room.game.moveCount) {
        const isMatchingLastMove =
          room.game.lastMove !== null &&
          room.game.lastMove.from === req.move.from &&
          room.game.lastMove.to === req.move.to;

        if (isMatchingLastMove && room.game.moveHistory.length > 0) {
          const lastMoveResult =
            room.game.moveHistory[room.game.moveHistory.length - 1]!;

          let checkInfo: { inCheck: PieceColor; kingSquare: string } | undefined;
          if (room.game.isCheck) {
            const checkedColor: PieceColor = room.game.turn;
            const kingSquare = ChessEngine.findKingSquare(
              room.game.fen,
              checkedColor,
            );
            if (kingSquare) {
              checkInfo = { inCheck: checkedColor, kingSquare };
            }
          }

          return {
            room,
            moveResult: lastMoveResult,
            gameState: room.game,
            checkInfo,
          };
        }

        throw new OptimisticLockConflictError(
          roomCode,
          req.expectedMoveNumber,
          room.game.moveCount,
        );
      }

      if (req.expectedMoveNumber > room.game.moveCount) {
        throw new InvalidMoveError(
          "Move out of sequence: expectedMoveNumber is in the future",
        );
      }
    }

    // Also handle idempotencyKey deduplication if client resubmitted without expectedMoveNumber
    if (
      req.idempotencyKey &&
      player.color !== room.game.turn &&
      room.game.lastMove !== null &&
      room.game.lastMove.from === req.move.from &&
      room.game.lastMove.to === req.move.to &&
      room.game.moveHistory.length > 0
    ) {
      const lastMoveResult =
        room.game.moveHistory[room.game.moveHistory.length - 1]!;

      let checkInfo: { inCheck: PieceColor; kingSquare: string } | undefined;
      if (room.game.isCheck) {
        const checkedColor: PieceColor = room.game.turn;
        const kingSquare = ChessEngine.findKingSquare(
          room.game.fen,
          checkedColor,
        );
        if (kingSquare) {
          checkInfo = { inCheck: checkedColor, kingSquare };
        }
      }

      return {
        room,
        moveResult: lastMoveResult,
        gameState: room.game,
        checkInfo,
      };
    }

    if (player.color !== room.game.turn) {
      throw new NotYourTurnError();
    }

    const outcome = ChessEngine.validateAndApplyMove(
      room.game.fen,
      req.move,
      player.color,
      room.game.moveHistory,
      this.clock.now(),
    );

    if (!outcome.success) {
      throw new InvalidMoveError(outcome.error);
    }

    let checkInfo: { inCheck: PieceColor; kingSquare: string } | undefined;
    let gameOverPayload: GameOverPayload | undefined;

    if (outcome.nextState.isCheckmate) {
      gameOverPayload = createGameOverPayload({
        winner: player.color,
        winnerName: player.name,
        reason: "checkmate",
        finalFen: outcome.nextState.fen,
        totalMoves: outcome.nextState.moveCount,
        startTimeMs: room.createdAt,
      });
    } else if (outcome.nextState.isDraw) {
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
      const checkedColor: PieceColor = outcome.nextState.turn;
      const kingSquare = ChessEngine.findKingSquare(
        outcome.nextState.fen,
        checkedColor,
      );
      if (kingSquare) {
        checkInfo = { inCheck: checkedColor, kingSquare };
      }
    }

    const updatedRoom = await this.roomAdapter.applyGameMove(
      roomCode,
      outcome.nextState,
      gameOverPayload,
    );

    return {
      room: updatedRoom,
      moveResult: outcome.moveResult,
      gameState: outcome.nextState,
      checkInfo,
      gameOverPayload,
    };
  }

  /**
   * Concedes active match to the opponent through roomAdapter.
   */
  public async resign(
    roomCode: string,
    socketId: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload }> {
    const code = roomCode.trim().toUpperCase();
    const room = await this.roomAdapter.getRoom(code);

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

    const gameOverPayload: GameOverPayload = createGameOverPayload({
      winner: winnerColor,
      winnerName,
      loserName: player.name,
      reason: "resignation",
      finalFen: room.game.fen,
      totalMoves: room.game.moveCount,
      startTimeMs: room.createdAt,
    });

    const updatedRoom = await this.roomAdapter.finalizeGame(
      code,
      gameOverPayload,
    );

    return { room: updatedRoom, gameOverPayload };
  }

  /**
   * Proposes a peaceful draw to opponent through roomAdapter.
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
    const room = await this.roomAdapter.getRoom(code);

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

    const opponent =
      player.color === "w" ? room.blackPlayer : room.whitePlayer;

    const updatedRoom = await this.roomAdapter.updateDrawOffer(code, {
      offeredBy: player.id,
      offeredAt: this.clock.now(),
    });

    return {
      room: updatedRoom,
      fromPlayer: player,
      opponentPlayer: opponent,
    };
  }

  /**
   * Responds to draw offer through roomAdapter.
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
    const room = await this.roomAdapter.getRoom(code);

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

    if (room.drawOffer.offeredBy === player.id) {
      throw new InvalidPayloadError(
        "draw",
        "Cannot accept or decline your own draw offer",
      );
    }

    if (!accept) {
      const updatedRoom = await this.roomAdapter.updateDrawOffer(code, null);
      return {
        room: updatedRoom,
        accept: false,
        byPlayerId: player.id,
      };
    }

    const gameOverPayload: GameOverPayload = createGameOverPayload({
      winner: "draw",
      reason: "draw_agreement",
      finalFen: room.game.fen,
      totalMoves: room.game.moveCount,
      startTimeMs: room.createdAt,
    });

    const updatedRoom = await this.roomAdapter.finalizeGame(
      code,
      gameOverPayload,
    );

    return {
      room: updatedRoom,
      accept: true,
      byPlayerId: player.id,
      gameOverPayload,
    };
  }

  /**
   * Initiates a rematch request following game over through roomAdapter.
   */
  public async requestRematch(
    roomCode: string,
    socketId: string,
  ): Promise<{ room: RoomState; requestedBy: string; requesterName: string }> {
    const code = roomCode.trim().toUpperCase();
    const room = await this.roomAdapter.getRoom(code);

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

    const updatedRoom = await this.roomAdapter.updateRematch(code, {
      requestedBy: player.id,
      requestedAt: this.clock.now(),
      status: "pending",
    });

    return {
      room: updatedRoom,
      requestedBy: player.id,
      requesterName: player.name,
    };
  }

  /**
   * Accepts or declines rematch proposal through roomAdapter. If accepted, player piece colors are swapped.
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
    const room = await this.roomAdapter.getRoom(code);

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

    if (!accept) {
      const updatedRoom = await this.roomAdapter.updateRematch(code, {
        ...room.rematch,
        status: "declined",
      });
      return {
        room: updatedRoom,
        accept: false,
        byPlayerId: player.id,
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

    const swappedWhite: Player = { ...blackPlayer, color: "w" };
    const swappedBlack: Player = { ...whitePlayer, color: "b" };
    const nextGameState = createInitialGameState();

    const updatedRoom = await this.roomAdapter.updateRematch(
      code,
      {
        ...room.rematch,
        status: "accepted",
      },
      nextGameState,
      { whitePlayer: swappedWhite, blackPlayer: swappedBlack },
    );

    return {
      room: updatedRoom,
      accept: true,
      byPlayerId: player.id,
      nextGameState: updatedRoom.game,
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
