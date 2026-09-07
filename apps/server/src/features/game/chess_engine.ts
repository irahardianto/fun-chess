import { Chess, Square as ChessJsSquare } from "chess.js";
import {
  GameState,
  MovePayload,
  MoveResult,
  PieceColor,
  PieceType,
  Square,
} from "@fun-chess/shared";

const PIECE_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const STARTING_PIECES: Record<PieceType, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
  k: 1,
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

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

/**
 * Server-authoritative pure chess engine wrapper around chess.js.
 * Encapsulates rule validation, state extraction, check detection, and material balance calculations.
 */
export class ChessEngine {
  /**
   * Validates and applies a move to the current FEN board state.
   */
  public static validateAndApplyMove(
    currentFen: string,
    move: MovePayload,
    expectedTurn: PieceColor,
    currentHistory: MoveResult[] = [],
  ): MoveValidationOutcome {
    let chess: Chess;
    try {
      chess = new Chess(currentFen);
    } catch (err: unknown) {
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

      const moveResult: MoveResult = {
        from: result.from,
        to: result.to,
        san: result.san,
        piece: result.piece as PieceType,
        color: result.color as PieceColor,
        captured: result.captured ? (result.captured as PieceType) : undefined,
        promotion: result.promotion
          ? (result.promotion as PieceType)
          : undefined,
        flags: result.flags,
        fen: chess.fen(),
        moveNumber: currentHistory.length + 1,
        timestamp: Date.now(),
      };

      const updatedHistory = [...currentHistory, moveResult];
      const nextState = this.extractGameState(
        chess,
        { from: result.from, to: result.to },
        updatedHistory,
        currentHistory.length === 0 ? currentFen : undefined,
      );

      return { success: true, nextState, moveResult };
    } catch (err: unknown) {
      return {
        success: false,
        error: (err as Error).message || "Invalid move coordinates",
      };
    }
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
    const board = chess.board();

    const whiteCounts: Record<PieceType, number> = {
      p: 0,
      n: 0,
      b: 0,
      r: 0,
      q: 0,
      k: 0,
    };
    const blackCounts: Record<PieceType, number> = {
      p: 0,
      n: 0,
      b: 0,
      r: 0,
      q: 0,
      k: 0,
    };

    let whiteMaterial = 0;
    let blackMaterial = 0;

    for (let r = 0; r < 8; r++) {
      const row = board[r];
      if (!row) continue;
      for (let c = 0; c < 8; c++) {
        const piece = row[c];
        if (!piece) continue;

        const pType = piece.type as PieceType;
        if (piece.color === "w") {
          whiteCounts[pType]++;
          whiteMaterial += PIECE_VALUES[pType];
        } else {
          blackCounts[pType]++;
          blackMaterial += PIECE_VALUES[pType];
        }
      }
    }

    const capturedWhite: PieceType[] = [];
    const capturedBlack: PieceType[] = [];

    // Pieces order: q, r, b, n, p
    const pieceOrder: PieceType[] = ["q", "r", "b", "n", "p"];

    for (const type of pieceOrder) {
      const whiteMissing = Math.max(
        0,
        STARTING_PIECES[type] - whiteCounts[type],
      );
      for (let i = 0; i < whiteMissing; i++) {
        capturedWhite.push(type);
      }

      const blackMissing = Math.max(
        0,
        STARTING_PIECES[type] - blackCounts[type],
      );
      for (let i = 0; i < blackMissing; i++) {
        capturedBlack.push(type);
      }
    }

    const materialAdvantage = {
      white: Math.max(0, whiteMaterial - blackMaterial),
      black: Math.max(0, blackMaterial - whiteMaterial),
    };

    return {
      capturedWhite,
      capturedBlack,
      materialAdvantage,
    };
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
      const pos = this.normalizeFen(moveHistory[i]!.fen);
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
   */
  public static getKingSquare(chess: Chess, color: PieceColor): Square | null {
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      const row = board[r];
      if (!row) continue;
      for (let c = 0; c < 8; c++) {
        const piece = row[c];
        if (piece && piece.type === "k" && piece.color === color) {
          const file = FILES[c];
          const rank = RANKS[r];
          if (file && rank) {
            return `${file}${rank}` as Square;
          }
        }
      }
    }
    return null;
  }
}
