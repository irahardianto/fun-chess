import {
  GameOverPayload,
  GameOverReason,
  GameState,
  MakeMoveRequest,
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
  normalizeRoomCode,
  systemClock,
  type IClock,
  type IIdGenerator,
} from "@fun-chess/shared";
import { randomUUID } from "node:crypto";
import type { IRoomGameAdapter, ISessionRegistry } from "../rooms/index.js";
import { ChessEngine } from "./chess_engine.js";
import { type Logger, defaultLogger } from "../../platform/logger/index.js";
import { IGameService, MoveApplicationResult } from "./game.interface.js";

export type { MoveApplicationResult };

/**
 * Service orchestrating chess game actions (moves, resignations, draws, and rematches).
 * Delegates all room persistence and mutation operations strictly through IRoomGameAdapter (MAJ-012).
 */
export class GameService implements IGameService {
  private readonly roomAdapter: IRoomGameAdapter;
  private readonly clock: IClock;
  private readonly idGenerator: IIdGenerator;
  private readonly logger: Logger;
  private readonly sessionRegistry?: ISessionRegistry;

  constructor(
    roomAdapter: IRoomGameAdapter,
    clock: IClock,
    idGenerator: IIdGenerator,
    logger: Logger,
    sessionRegistry?: ISessionRegistry,
  );
  /**
   * @deprecated Legacy signature for interim compatibility prior to SC-5 composition root wiring.
   */
  constructor(
    roomAdapter: IRoomGameAdapter,
    clock?: IClock,
    idGenerator?: IIdGenerator,
    loggerOrSessionRegistry?: Logger | ISessionRegistry,
    sessionRegistry?: ISessionRegistry,
  );
  constructor(
    roomAdapter: IRoomGameAdapter,
    clock?: IClock,
    idGenerator?: IIdGenerator,
    loggerOrSessionRegistry?: Logger | ISessionRegistry,
    sessionRegistry?: ISessionRegistry,
  ) {
    this.roomAdapter = roomAdapter;
    this.clock = clock ?? systemClock;
    this.idGenerator = idGenerator ?? {
      generateId: () => randomUUID(),
      generateRandomInt: (min: number, max: number) =>
        Math.floor(Math.random() * (max - min)) + min,
    };

    if (
      loggerOrSessionRegistry &&
      "info" in loggerOrSessionRegistry &&
      typeof loggerOrSessionRegistry.info === "function"
    ) {
      this.logger = loggerOrSessionRegistry as Logger;
      this.sessionRegistry = sessionRegistry;
    } else {
      this.logger = defaultLogger;
      this.sessionRegistry =
        loggerOrSessionRegistry as ISessionRegistry | undefined;
    }
  }

  /**
   * Validates room status and player socket membership prior to processing move (MAJ-008).
   */
  private async validateMoveIngress(
    req: MakeMoveRequest,
    socketId: string,
  ): Promise<{ room: RoomState; player: Player }> {
    const roomCode = normalizeRoomCode(req.roomCode);
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

    return { room, player };
  }

  /**
   * Derives check state and checked king coordinates without duplication (MIN-016).
   */
  private resolveCheckInfo(
    gameState: GameState,
  ): { inCheck: PieceColor; kingSquare: string } | undefined {
    if (!gameState.isCheck) {
      return undefined;
    }
    const checkedColor: PieceColor = gameState.turn;
    const kingSquare = ChessEngine.findKingSquare(gameState.fen, checkedColor);
    if (kingSquare) {
      return { inCheck: checkedColor, kingSquare };
    }
    return undefined;
  }

  /**
   * Evaluates sequencing numbers and client idempotency keys to handle resubmission safely (MAJ-008, MAJ-031).
   */
  private checkIdempotentReplay(
    req: MakeMoveRequest,
    room: RoomState,
    player: Player,
  ): MoveApplicationResult | null {
    const roomCode = room.roomCode;

    // Handle expectedMoveNumber sequence validation (MAJ-031)
    if (
      req.expectedMoveNumber !== undefined &&
      req.expectedMoveNumber !== room.game.moveCount
    ) {
      if (req.expectedMoveNumber < room.game.moveCount) {
        const isMatchingLastMove =
          room.game.lastMove !== null &&
          room.game.lastMove.from === req.move.from &&
          room.game.lastMove.to === req.move.to;

        const lastMoveResult = room.game.moveHistory.at(-1);
        if (isMatchingLastMove && lastMoveResult) {
          const checkInfo = this.resolveCheckInfo(room.game);

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
      const lastMoveResult = room.game.moveHistory.at(-1);
      if (lastMoveResult) {
        const checkInfo = this.resolveCheckInfo(room.game);

        return {
          room,
          moveResult: lastMoveResult,
          gameState: room.game,
          checkInfo,
        };
      }
    }

    return null;
  }

  /**
   * Determines terminal checkmate or draw states and produces GameOverPayload (MAJ-008).
   */
  private classifyGameOverOutcome(
    room: RoomState,
    player: Player,
    outcomeState: GameState,
  ): {
    gameOverPayload?: GameOverPayload;
    checkInfo?: { inCheck: PieceColor; kingSquare: string };
  } {
    if (outcomeState.isCheckmate) {
      const gameOverPayload = createGameOverPayload({
        winner: player.color,
        winnerName: player.name,
        reason: "checkmate",
        finalFen: outcomeState.fen,
        totalMoves: outcomeState.moveCount,
        startTimeMs: room.createdAt,
      });
      return { gameOverPayload };
    }

    if (outcomeState.isDraw) {
      const reason: GameOverReason = outcomeState.isStalemate
        ? "stalemate"
        : outcomeState.isThreefoldRepetition
          ? "threefold_repetition"
          : outcomeState.isInsufficientMaterial
            ? "insufficient_material"
            : outcomeState.isFiftyMoveRule
              ? "fifty_move_rule"
              : "draw_agreement";

      const gameOverPayload = createGameOverPayload({
        winner: "draw",
        reason,
        finalFen: outcomeState.fen,
        totalMoves: outcomeState.moveCount,
        startTimeMs: room.createdAt,
      });
      return { gameOverPayload };
    }

    const checkInfo = this.resolveCheckInfo(outcomeState);
    return { checkInfo };
  }

  /**
   * Refreshes sliding session TTL in sessionRegistry for active player upon valid move (CRIT-002).
   */
  private async touchPlayerSession(
    roomCode: string,
    playerId: string,
    socketId: string,
  ): Promise<void> {
    if (!this.sessionRegistry) return;
    if (typeof this.sessionRegistry.getSessionTokenForPlayer === "function") {
      const token = await this.sessionRegistry.getSessionTokenForPlayer(roomCode, playerId);
      if (token) {
        await this.sessionRegistry.touchSession(token, socketId);
      }
    }
  }

  /**
   * Validates and applies a move from a player socket through roomAdapter.
   * Handles expectedMoveNumber idempotency and sequencing guards (MAJ-031, MAJ-008).
   */
  public async makeMove(
    req: MakeMoveRequest,
    socketId: string,
  ): Promise<MoveApplicationResult> {
    const startTime = this.clock.now();
    const roomCode = normalizeRoomCode(req.roomCode);

    try {
      const { room, player } = await this.validateMoveIngress(req, socketId);

      this.logger.debug("Applying chess move", {
        operation: "game_move",
        roomCode,
        playerId: player.id,
        move: req.move,
      });

      const replayResult = this.checkIdempotentReplay(req, room, player);
      if (replayResult) {
        const duration = this.clock.now() - startTime;
        this.logger.info("Chess move applied", {
          operation: "game_move",
          roomCode,
          playerId: player.id,
          san: replayResult.moveResult.san,
          duration,
          durationMs: duration,
          isGameOver: Boolean(replayResult.gameOverPayload),
        });
        return replayResult;
      }

      if (player.color !== room.game.turn) {
        const duration = this.clock.now() - startTime;
        this.logger.warn("Invalid move rejected", {
          operation: "game_move_rejected",
          roomCode,
          playerId: player.id,
          reason: "Not your turn",
          duration,
          durationMs: duration,
        });
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
        const duration = this.clock.now() - startTime;
        this.logger.warn("Invalid move rejected", {
          operation: "game_move_rejected",
          roomCode,
          playerId: player.id,
          reason: outcome.error,
          duration,
          durationMs: duration,
        });
        throw new InvalidMoveError(outcome.error);
      }

      const { gameOverPayload, checkInfo } = this.classifyGameOverOutcome(
        room,
        player,
        outcome.nextState,
      );

      const updatedRoom = await this.roomAdapter.applyGameMove(
        room.roomCode,
        outcome.nextState,
        gameOverPayload,
      );

      await this.touchPlayerSession(room.roomCode, player.id, socketId);

      const duration = this.clock.now() - startTime;
      this.logger.info("Chess move applied", {
        operation: "game_move",
        roomCode,
        playerId: player.id,
        san: outcome.moveResult.san,
        duration,
        durationMs: duration,
        isGameOver: Boolean(gameOverPayload),
      });

      return {
        room: updatedRoom,
        moveResult: outcome.moveResult,
        gameState: outcome.nextState,
        checkInfo,
        gameOverPayload,
      };
    } catch (err) {
      if (
        !(err instanceof InvalidMoveError) &&
        !(err instanceof NotYourTurnError)
      ) {
        const duration = this.clock.now() - startTime;
        this.logger.error("Chess move failed", {
          operation: "game_move",
          roomCode,
          duration,
          durationMs: duration,
          error:
            err instanceof Error
              ? { name: err.name, message: err.message, stack: err.stack }
              : { raw: err },
        });
      }
      throw err;
    }
  }

  /**
   * Concedes active match to the opponent through roomAdapter.
   */
  public async resign(
    roomCode: string,
    socketId: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload }> {
    const startTime = this.clock.now();
    const code = normalizeRoomCode(roomCode);

    try {
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

      const duration = this.clock.now() - startTime;
      this.logger.info("Player resigned", {
        operation: "game_resign",
        roomCode: code,
        playerId: player.id,
        winnerColor,
        duration,
        durationMs: duration,
      });

      return { room: updatedRoom, gameOverPayload };
    } catch (err) {
      const duration = this.clock.now() - startTime;
      this.logger.error("Player resignation failed", {
        operation: "game_resign",
        roomCode: code,
        duration,
        durationMs: duration,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
      throw err;
    }
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
    const startTime = this.clock.now();
    const code = normalizeRoomCode(roomCode);

    try {
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

      const opponent = player.color === "w" ? room.blackPlayer : room.whitePlayer;

      const updatedRoom = await this.roomAdapter.updateDrawOffer(code, {
        offeredBy: player.id,
        offeredAt: this.clock.now(),
      });

      const duration = this.clock.now() - startTime;
      this.logger.info("Draw offer processed", {
        operation: "game_draw_action",
        roomCode: code,
        playerId: player.id,
        action: "offer",
        duration,
        durationMs: duration,
      });

      return {
        room: updatedRoom,
        fromPlayer: player,
        opponentPlayer: opponent,
      };
    } catch (err) {
      const duration = this.clock.now() - startTime;
      this.logger.error("Draw offer failed", {
        operation: "game_draw_action",
        roomCode: code,
        duration,
        durationMs: duration,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
      throw err;
    }
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
    const startTime = this.clock.now();
    const code = normalizeRoomCode(roomCode);

    try {
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

      const action = accept ? "accept" : "decline";

      if (!accept) {
        const updatedRoom = await this.roomAdapter.updateDrawOffer(code, null);
        const duration = this.clock.now() - startTime;
        this.logger.info("Draw offer processed", {
          operation: "game_draw_action",
          roomCode: code,
          playerId: player.id,
          action,
          duration,
          durationMs: duration,
        });

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

      const duration = this.clock.now() - startTime;
      this.logger.info("Draw offer processed", {
        operation: "game_draw_action",
        roomCode: code,
        playerId: player.id,
        action,
        duration,
        durationMs: duration,
      });

      return {
        room: updatedRoom,
        accept: true,
        byPlayerId: player.id,
        gameOverPayload,
      };
    } catch (err) {
      const duration = this.clock.now() - startTime;
      this.logger.error("Draw response failed", {
        operation: "game_draw_action",
        roomCode: code,
        duration,
        durationMs: duration,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
      throw err;
    }
  }

  /**
   * Initiates a rematch request following game over through roomAdapter.
   */
  public async requestRematch(
    roomCode: string,
    socketId: string,
  ): Promise<{ room: RoomState; requestedBy: string; requesterName: string }> {
    const startTime = this.clock.now();
    const code = normalizeRoomCode(roomCode);

    try {
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

      const duration = this.clock.now() - startTime;
      this.logger.info("Rematch action processed", {
        operation: "game_rematch_action",
        roomCode: code,
        playerId: player.id,
        status: "pending",
        duration,
        durationMs: duration,
      });

      return {
        room: updatedRoom,
        requestedBy: player.id,
        requesterName: player.name,
      };
    } catch (err) {
      const duration = this.clock.now() - startTime;
      this.logger.error("Rematch request failed", {
        operation: "game_rematch_action",
        roomCode: code,
        duration,
        durationMs: duration,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
      throw err;
    }
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
    const startTime = this.clock.now();
    const code = normalizeRoomCode(roomCode);

    try {
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

      const status = accept ? "accepted" : "declined";

      if (!accept) {
        const updatedRoom = await this.roomAdapter.updateRematch(code, {
          ...room.rematch,
          status: "declined",
        });

        const duration = this.clock.now() - startTime;
        this.logger.info("Rematch action processed", {
          operation: "game_rematch_action",
          roomCode: code,
          playerId: player.id,
          status,
          duration,
          durationMs: duration,
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

      const duration = this.clock.now() - startTime;
      this.logger.info("Rematch action processed", {
        operation: "game_rematch_action",
        roomCode: code,
        playerId: player.id,
        status,
        duration,
        durationMs: duration,
      });

      return {
        room: updatedRoom,
        accept: true,
        byPlayerId: player.id,
        nextGameState: updatedRoom.game,
      };
    } catch (err) {
      const duration = this.clock.now() - startTime;
      this.logger.error("Rematch response failed", {
        operation: "game_rematch_action",
        roomCode: code,
        duration,
        durationMs: duration,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
      throw err;
    }
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
