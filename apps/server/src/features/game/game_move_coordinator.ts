import {
  AppError,
  type GameOverPayload,
  type GameOverReason,
  type GameState,
  type MakeMoveRequest,
  type PieceColor,
  type Player,
  type RoomState,
  createGameOverPayload,
  RoomNotFoundError,
  GameNotActiveError,
  NotYourTurnError,
  InvalidMoveError,
  OptimisticLockConflictError,
  normalizeRoomCode,
  type IClock,
  serializeError,
} from "@fun-chess/shared";
import type { IRoomGameAdapter, ISessionRegistry } from "../rooms/index.js";
import { type Logger } from "../../platform/logger/index.js";
import { ChessEngine } from "./chess_engine.js";
import type { MoveApplicationResult } from "./game.interface.js";
import type { IGamePlayerResolver } from "./game_player_resolver.js";

/**
 * Interface contract for game move execution and validation coordination.
 */
export interface IGameMoveCoordinator {
  makeMove(
    req: MakeMoveRequest,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<MoveApplicationResult>;
}

/**
 * Coordinates chess move validation, execution, idempotency replays, game over derivation,
 * state persistence via IRoomGameAdapter, and session touch updates (MAJ-008, MAJ-031, CRIT-002).
 */
export class GameMoveCoordinator implements IGameMoveCoordinator {
  constructor(
    private readonly roomAdapter: IRoomGameAdapter,
    private readonly clock: IClock,
    private readonly logger: Logger,
    private readonly playerResolver: IGamePlayerResolver,
    private readonly sessionRegistry?: ISessionRegistry,
  ) {}

  /**
   * Validates room status and player socket membership prior to processing move (MAJ-008).
   */
  private async validateMoveIngress(
    req: MakeMoveRequest,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{ room: RoomState; player: Player }> {
    const roomCode = normalizeRoomCode(req.roomCode);
    const room = await this.roomAdapter.getRoom(roomCode, correlationId);

    if (!room) {
      throw new RoomNotFoundError(roomCode);
    }

    if (room.status !== "playing") {
      throw new GameNotActiveError(room.status);
    }

    const { player, room: resolvedRoom } =
      await this.playerResolver.resolveAuthenticatedPlayer(
        room,
        socketId,
        sessionToken,
        correlationId,
      );

    return { room: resolvedRoom, player };
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
    correlationId?: string,
  ): Promise<void> {
    if (!this.sessionRegistry) return;
    if (typeof this.sessionRegistry.getSessionTokenForPlayer === "function") {
      const opts = correlationId !== undefined ? { correlationId } : undefined;
      const token = opts
        ? await this.sessionRegistry.getSessionTokenForPlayer(
            roomCode,
            playerId,
            opts,
          )
        : await this.sessionRegistry.getSessionTokenForPlayer(
            roomCode,
            playerId,
          );
      if (token) {
        if (opts) {
          await this.sessionRegistry.touchSession(
            token,
            socketId,
            undefined,
            opts,
          );
        } else {
          await this.sessionRegistry.touchSession(token, socketId);
        }
      }
    }
  }

  /**
   * Helper standardizing service-layer error logging with semantic demotion (MAJ-012).
   */
  private logServiceFailure(
    operation: string,
    actionName: string,
    roomCode: string,
    startTime: number,
    correlationId: string | undefined,
    err: unknown,
  ): void {
    const duration = this.clock.now() - startTime;
    const isClientError = err instanceof AppError && err.statusCode < 500;
    const logContext = {
      operation,
      correlationId,
      roomCode,
      duration,
      durationMs: duration,
      error: serializeError(err),
    };
    if (isClientError) {
      this.logger.warn(`${actionName} rejected`, logContext);
    } else {
      this.logger.error(`${actionName} failed`, logContext);
    }
  }

  /**
   * Validates and applies a move from a player socket through roomAdapter.
   * Handles expectedMoveNumber idempotency and sequencing guards (MAJ-031, MAJ-008).
   */
  public async makeMove(
    req: MakeMoveRequest,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<MoveApplicationResult> {
    const startTime = this.clock.now();
    const roomCode = normalizeRoomCode(req.roomCode);

    try {
      const { room, player } = await this.validateMoveIngress(
        req,
        socketId,
        correlationId,
        sessionToken,
      );

      this.logger.debug("Applying chess move", {
        operation: "game_move",
        correlationId,
        roomCode,
        playerId: player.id,
        move: req.move,
      });

      const replayResult = this.checkIdempotentReplay(req, room, player);
      if (replayResult) {
        const duration = this.clock.now() - startTime;
        this.logger.info("Chess move applied", {
          operation: "game_move",
          correlationId,
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
          correlationId,
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
          correlationId,
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
        correlationId,
      );

      await this.touchPlayerSession(
        room.roomCode,
        player.id,
        socketId,
        correlationId,
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Chess move applied", {
        operation: "game_move",
        correlationId,
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
        this.logServiceFailure(
          "game_move",
          "Chess move",
          roomCode,
          startTime,
          correlationId,
          err,
        );
      }
      throw err;
    }
  }
}
