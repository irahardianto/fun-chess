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
import type { RoomStore } from "../rooms/room.store.js";
import type { SessionRegistry } from "../rooms/session_registry.js";
import {
  applyGameMoveTransition,
  finalizeGameTransition,
  updateDrawOfferTransition,
  updateRematchTransition,
} from "../rooms/room.logic.js";
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
 * Executes state transitions atomically under RoomStore.mutate lock with pure transition delegates.
 */
export class GameService implements IGameService {
  private readonly store: RoomStore;
  private readonly clock: IClock;
  private readonly idGenerator: IIdGenerator;
  private readonly sessionRegistry?: SessionRegistry;

  constructor(
    store: RoomStore,
    clock?: IClock | SessionRegistry,
    idGenerator?: IIdGenerator,
    sessionRegistry?: SessionRegistry,
  ) {
    this.store = store;
    if (clock && ("createSession" in clock || "validateSession" in clock)) {
      this.sessionRegistry = clock as SessionRegistry;
      this.clock = new SystemClock();
      this.idGenerator = idGenerator ?? new UuidGenerator();
    } else {
      this.clock = (clock as IClock) ?? new SystemClock();
      this.idGenerator = idGenerator ?? new UuidGenerator();
      this.sessionRegistry = sessionRegistry;
    }
  }

  /**
   * Validates and applies a move from a player socket atomically under store lock.
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

      const updated = applyGameMoveTransition(
        room,
        outcome.nextState,
        gameOverPayload,
        this.clock.now(),
      );

      return {
        updatedRoom: updated,
        result: {
          room: updated,
          moveResult: outcome.moveResult,
          gameState: outcome.nextState,
          checkInfo,
          gameOverPayload,
        },
      };
    });
  }

  /**
   * Concedes active match to the opponent under store lock.
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

      const gameOverPayload: GameOverPayload = createGameOverPayload({
        winner: winnerColor,
        winnerName,
        loserName: player.name,
        reason: "resignation",
        finalFen: room.game.fen,
        totalMoves: room.game.moveCount,
        startTimeMs: room.createdAt,
      });

      const updated = finalizeGameTransition(
        room,
        gameOverPayload,
        this.clock.now(),
      );

      return {
        updatedRoom: updated,
        result: { room: updated, gameOverPayload },
      };
    });
  }

  /**
   * Proposes a peaceful draw to opponent under store lock.
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

      const updated = updateDrawOfferTransition(
        room,
        { offeredBy: player.id, offeredAt: this.clock.now() },
        this.clock.now(),
      );

      return {
        updatedRoom: updated,
        result: { room: updated, fromPlayer: player, opponentPlayer: opponent },
      };
    });
  }

  /**
   * Responds to draw offer under store lock.
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

      if (room.drawOffer.offeredBy === player.id) {
        throw new InvalidPayloadError(
          "draw",
          "Cannot accept or decline your own draw offer",
        );
      }

      if (!accept) {
        const updated = updateDrawOfferTransition(room, null, this.clock.now());
        return {
          updatedRoom: updated,
          result: { room: updated, accept: false, byPlayerId: player.id },
        };
      }

      const gameOverPayload: GameOverPayload = createGameOverPayload({
        winner: "draw",
        reason: "draw_agreement",
        finalFen: room.game.fen,
        totalMoves: room.game.moveCount,
        startTimeMs: room.createdAt,
      });

      const updated = finalizeGameTransition(
        room,
        gameOverPayload,
        this.clock.now(),
      );

      return {
        updatedRoom: updated,
        result: {
          room: updated,
          accept: true,
          byPlayerId: player.id,
          gameOverPayload,
        },
      };
    });
  }

  /**
   * Initiates a rematch request following game over under store lock.
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

      const updated = updateRematchTransition(
        room,
        {
          requestedBy: player.id,
          requestedAt: this.clock.now(),
          status: "pending",
        },
        undefined,
        this.clock.now(),
      );

      return {
        updatedRoom: updated,
        result: {
          room: updated,
          requestedBy: player.id,
          requesterName: player.name,
        },
      };
    });
  }

  /**
   * Accepts or declines rematch proposal under store lock. If accepted, player piece colors are swapped.
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

      if (!accept) {
        const updated = updateRematchTransition(
          room,
          {
            ...room.rematch,
            status: "declined",
          },
          undefined,
          this.clock.now(),
        );
        return {
          updatedRoom: updated,
          result: { room: updated, accept: false, byPlayerId: player.id },
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

      if (this.sessionRegistry?.updateSessionColor) {
        await this.sessionRegistry.updateSessionColor(code, whitePlayer.id, "b");
        await this.sessionRegistry.updateSessionColor(code, blackPlayer.id, "w");
      }

      const nextGameState = createInitialGameState();
      const updated = updateRematchTransition(
        room,
        {
          ...room.rematch,
          status: "accepted",
        },
        nextGameState,
        this.clock.now(),
        { whitePlayer: swappedWhite, blackPlayer: swappedBlack },
      );

      return {
        updatedRoom: updated,
        result: {
          room: updated,
          accept: true,
          byPlayerId: player.id,
          nextGameState: updated.game,
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
