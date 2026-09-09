import { Chess, Move, Square as ChessJsSquare } from "chess.js";
import {
  GameState,
  MovePayload,
  MoveResult,
  PieceColor,
  PieceType,
  PromotionPiece,
  Square,
  calculateMaterialAndCaptures,
  getKingSquare,
} from "@fun-chess/shared";
import { type Logger, defaultLogger } from "../../platform/logger/index.js";

export interface ValidationSuccess {
  success: true;
  nextState: GameState;
  moveResult: MoveResult;
}

export interface ValidationFailure {
  success: false;
  error: string;
}

export type MoveValidationOutcome = ValidationSuccess | ValidationFailure;

export type MoveValidationResult =
  | { success: true; chess: Chess; moveResultObj: Move }
  | { success: false; error: string };

export interface MoveApplicationOutcome {
  nextState: GameState;
  moveResult: MoveResult;
}

/**
 * Server-authoritative pure chess engine wrapper around chess.js.
 * Encapsulates rule validation, state extraction, check detection, and material balance calculations.
 */
export class ChessEngine {
  /**
   * Pure move validation verifying legality, turn matching, and FEN integrity.
   *
   * @param currentFen - Current FEN board state string
   * @param move - Proposed move coordinates and optional promotion piece
   * @param expectedTurn - Active player piece color ('w' or 'b')
   * @returns MoveValidationResult containing hydrated Chess instance and Move object on success, or error reason on failure
   */
  public static validateMove(
    currentFen: string,
    move: MovePayload,
    expectedTurn: PieceColor,
    logger: Logger = defaultLogger,
  ): MoveValidationResult {
    let chess: Chess;
    try {
      chess = new Chess(currentFen);
    } catch (err) {
      logger.debug("FEN parsing failed during move validation", {
        operation: "chess_engine_validate_move_fen",
        currentFen,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : { raw: err },
      });
      return { success: false, error: "Invalid board FEN string" };
    }

    if (chess.turn() !== expectedTurn) {
      return { success: false, error: "Not your turn" };
    }

    try {
      const result = chess.move({
        from: move.from as ChessJsSquare,
        to: move.to as ChessJsSquare,
        promotion: move.promotion,
      });

      if (!result) {
        return { success: false, error: "Illegal move" };
      }

      return { success: true, chess, moveResultObj: result };
    } catch (err: unknown) {
      logger.debug("Move application threw exception in chess.js", {
        operation: "chess_engine_move_exception",
        move,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : { raw: err },
      });
      return {
        success: false,
        error: (err as Error).message || "Invalid move coordinates",
      };
    }
  }

  /**
   * Pure state application transforming a validated Chess instance and Move object into GameState and MoveResult.
   *
   * @param chess - Mutated Chess instance after move execution
   * @param moveResultObj - Move metadata object returned by chess.js move()
   * @param currentHistory - Existing move history records
   * @param timestamp - Timestamp ms when move was accepted
   * @param initialFen - Optional initial FEN for repetition tracking
   * @returns MoveApplicationOutcome containing nextState and moveResult
   */
  public static applyMove(
    chess: Chess,
    moveResultObj: Move,
    currentHistory: MoveResult[],
    timestamp: number,
    initialFen?: string,
  ): MoveApplicationOutcome {
    const moveResult: MoveResult = {
      from: moveResultObj.from,
      to: moveResultObj.to,
      san: moveResultObj.san,
      piece: moveResultObj.piece as PieceType,
      color: moveResultObj.color as PieceColor,
      captured: moveResultObj.captured
        ? (moveResultObj.captured as PieceType)
        : undefined,
      promotion: moveResultObj.promotion
        ? (moveResultObj.promotion as PromotionPiece)
        : undefined,
      flags: moveResultObj.flags,
      fen: chess.fen(),
      moveNumber: currentHistory.length + 1,
      timestamp,
    };

    const updatedHistory = [...currentHistory, moveResult];
    const nextState = this.extractGameState(
      chess,
      { from: moveResultObj.from, to: moveResultObj.to },
      updatedHistory,
      initialFen ??
        (currentHistory.length === 0 ? moveResultObj.before : undefined),
    );

    return { nextState, moveResult };
  }

  /**
   * Validates and applies a move to the current FEN board state.
   * Delegates to pure validateMove and applyMove methods to preserve backwards compatibility.
   * Requires explicit timestamp (MAJ-016).
   */
  public static validateAndApplyMove(
    currentFen: string,
    move: MovePayload,
    expectedTurn: PieceColor,
    currentHistory: MoveResult[],
    timestamp: number,
  ): MoveValidationOutcome {
    const validation = this.validateMove(currentFen, move, expectedTurn);
    if (!validation.success) {
      return validation;
    }

    const { nextState, moveResult } = this.applyMove(
      validation.chess,
      validation.moveResultObj,
      currentHistory,
      timestamp,
      currentHistory.length === 0 ? currentFen : undefined,
    );

    return { success: true, nextState, moveResult };
  }

  /**
   * Pure extractor transforming chess.js board instance into the canonical Fun Chess GameState.
   */
  public static extractGameState(
    chess: Chess,
    lastMove: { from: string; to: string } | null,
    moveHistory: MoveResult[] = [],
    initialFen?: string,
  ): GameState {
    const fen = chess.fen();
    const turn = chess.turn() as PieceColor;
    const isCheck = chess.inCheck();
    // PERF: Checkmate requires check; Stalemate requires NO check. Avoids redundant legal move generation.
    const isCheckmate = isCheck && chess.isGameOver();
    const isStalemate = !isCheck && chess.isStalemate();
    const isThreefoldRepetition = this.isThreefoldRepetition(
      chess,
      moveHistory,
      initialFen,
    );
    const isInsufficientMaterial = chess.isInsufficientMaterial();

    // FEN halfmove clock (5th token)
    const fenTokens = fen.split(" ");
    const halfMoveClock = parseInt(fenTokens[4] || "0", 10);
    const isFiftyMoveRule =
      halfMoveClock >= 100 ||
      (chess.isDraw() &&
        !isStalemate &&
        !isThreefoldRepetition &&
        !isInsufficientMaterial);
    const isDraw =
      chess.isDraw() ||
      isStalemate ||
      isThreefoldRepetition ||
      isInsufficientMaterial ||
      isFiftyMoveRule;

    const { capturedWhite, capturedBlack, materialAdvantage } =
      this.calculateMaterialAndCaptures(chess);

    return {
      fen,
      turn,
      isCheck,
      isCheckmate,
      isDraw,
      isStalemate,
      isThreefoldRepetition,
      isInsufficientMaterial,
      isFiftyMoveRule,
      moveHistory,
      capturedWhite,
      capturedBlack,
      materialAdvantage,
      lastMove,
      moveCount: moveHistory.length,
    };
  }

  /**
   * Calculates captured pieces and net material advantages for both players.
   */
  public static calculateMaterialAndCaptures(chess: Chess): {
    capturedWhite: PieceType[];
    capturedBlack: PieceType[];
    materialAdvantage: { white: number; black: number };
  } {
    return calculateMaterialAndCaptures(chess);
  }

  // PERF: Standard starting position normalized signature constant. Avoids replaying all moves on new Chess().
  private static readonly STANDARD_START_NORMALIZED_FEN =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

  /**
   * Normalizes a FEN string to its position signature:
   * piece placement + active color + castling availability + en passant target square
   * (the first 4 whitespace-separated tokens of the FEN string).
   */
  public static normalizeFen(fen: string): string {
    // PERF: Fast linear scan to find 4th space delimiter, avoiding regex split(/\s+/) array allocations.
    let spaces = 0;
    const trimmed = fen.trim();
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === " ") {
        spaces++;
        if (spaces === 4) {
          return trimmed.slice(0, i);
        }
      }
    }
    return trimmed;
  }

  /**
   * Determines whether threefold repetition has occurred by tracking normalized FEN
   * occurrences across the game history plus current board position.
   */
  public static isThreefoldRepetition(
    chess: Chess,
    moveHistory: MoveResult[] = [],
    initialFen?: string,
  ): boolean {
    if (chess.isThreefoldRepetition()) {
      return true;
    }

    if (moveHistory.length === 0) {
      return false;
    }

    // PERF: O(1) starting position signature instead of replaying the entire history on new Chess()
    const startPos = initialFen
      ? this.normalizeFen(initialFen)
      : this.STANDARD_START_NORMALIZED_FEN;

    const counts = new Map<string, number>();
    counts.set(startPos, 1);

    for (let i = 0; i < moveHistory.length; i++) {
      const historyItem = moveHistory[i];
      if (!historyItem?.fen) continue;
      const pos = this.normalizeFen(historyItem.fen);
      const count = (counts.get(pos) || 0) + 1;
      if (count >= 3) {
        return true;
      }
      counts.set(pos, count);
    }

    return false;
  }

  /**
   * Locates the square of the king for a given color.
   * Delegates to shared getKingSquare (MIN-019).
   */
  public static getKingSquare(chess: Chess, color: PieceColor): Square | null {
    return getKingSquare(chess, color);
  }

  /**
   * Locates the square of the king from a FEN string.
   * Catches FEN parsing errors and logs debug details before returning null (MIN-001).
   */
  public static findKingSquare(
    fen: string,
    color: PieceColor,
  ): Square | null {
    try {
      const chess = new Chess(fen);
      return this.getKingSquare(chess, color);
    } catch (err) {
      defaultLogger.debug("FEN parse failure in findKingSquare", {
        operation: "chess_find_king_square",
        color,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
