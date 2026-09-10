import { Chess } from "chess.js";
import type { PieceType, PieceColor, GameState, Square } from "../contracts/models.js";
import { createSafeChess } from "./chess_factory.js";

/**
 * Standard chess piece point values:
 * Pawn: 1, Knight: 3, Bishop: 3, Rook: 5, Queen: 9, King: 0.
 */
export const STANDARD_PIECE_POINTS: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/**
 * Alias for STANDARD_PIECE_POINTS (MAJ-035).
 */
export const STANDARD_PIECE_VALUES = STANDARD_PIECE_POINTS;

/**
 * Alias for STANDARD_PIECE_POINTS (MAJ-035).
 */
export const PIECE_STANDARD_POINTS = STANDARD_PIECE_POINTS;

/**
 * Centipawn piece valuations for heuristic chess evaluation:
 * Pawn: 100, Knight: 320, Bishop: 330, Rook: 500, Queen: 900, King: 0 (MAJ-035).
 */
export const PIECE_CENTIPAWN_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

/**
 * Alias for PIECE_CENTIPAWN_VALUES (MAJ-035).
 */
export const PIECE_VALUES = PIECE_CENTIPAWN_VALUES;

const STARTING_PIECES: Record<PieceType, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
  k: 1,
};

/**
 * Summary of board piece counts and total material values for both players.
 */
export interface BoardMaterialSummary {
  readonly whiteCounts: Record<PieceType, number>;
  readonly blackCounts: Record<PieceType, number>;
  readonly whiteMaterial: number;
  readonly blackMaterial: number;
}

/**
 * Iterates across the board once to count pieces and calculate material values (MIN-018).
 * Centralized logic shared across material difference and capture calculations.
 *
 * @param chess - Active Chess instance
 * @returns BoardMaterialSummary containing piece counts and total material for white and black
 */
export function calculateBoardMaterial(chess: Chess): BoardMaterialSummary {
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
      const points = STANDARD_PIECE_POINTS[pType] ?? 0;
      if (piece.color === "w") {
        whiteCounts[pType]++;
        whiteMaterial += points;
      } else {
        blackCounts[pType]++;
        blackMaterial += points;
      }
    }
  }

  return {
    whiteCounts,
    blackCounts,
    whiteMaterial,
    blackMaterial,
  };
}

/**
 * Net material advantage for both white and black.
 */
export interface MaterialDifference {
  white: number;
  black: number;
}

/**
 * Calculates net material advantage for both players (MIN-016).
 *
 * @param chessOrSummary - Active Chess instance or precomputed BoardMaterialSummary
 * @returns Non-negative material advantage for white and black
 */
export function calculateMaterialDifference(
  chessOrSummary: Chess | BoardMaterialSummary,
): MaterialDifference {
  const summary =
    "whiteMaterial" in chessOrSummary
      ? chessOrSummary
      : calculateBoardMaterial(chessOrSummary);

  return {
    white: Math.max(0, summary.whiteMaterial - summary.blackMaterial),
    black: Math.max(0, summary.blackMaterial - summary.whiteMaterial),
  };
}

/**
 * Captured pieces lists for white and black.
 */
export interface CapturedPieces {
  capturedWhite: PieceType[];
  capturedBlack: PieceType[];
}

/**
 * Calculates captured piece lists for both sides based on missing starting pieces (MIN-016).
 *
 * @param chessOrSummary - Active Chess instance or precomputed BoardMaterialSummary
 * @returns Ordered lists of captured pieces (q, r, b, n, p)
 */
export function calculateCaptures(
  chessOrSummary: Chess | BoardMaterialSummary,
): CapturedPieces {
  const summary =
    "whiteCounts" in chessOrSummary
      ? chessOrSummary
      : calculateBoardMaterial(chessOrSummary);

  const capturedWhite: PieceType[] = [];
  const capturedBlack: PieceType[] = [];

  const pieceOrder: PieceType[] = ["q", "r", "b", "n", "p"];

  for (const type of pieceOrder) {
    const whiteMissing = Math.max(0, STARTING_PIECES[type] - summary.whiteCounts[type]);
    for (let i = 0; i < whiteMissing; i++) {
      capturedWhite.push(type);
    }

    const blackMissing = Math.max(0, STARTING_PIECES[type] - summary.blackCounts[type]);
    for (let i = 0; i < blackMissing; i++) {
      capturedBlack.push(type);
    }
  }

  return {
    capturedWhite,
    capturedBlack,
  };
}

/**
 * Calculates captured pieces and net material advantages for both players.
 * Composes calculateBoardMaterial, calculateMaterialDifference, and calculateCaptures (MIN-016, MIN-018).
 *
 * @param chess - Active Chess instance
 * @returns Captured piece arrays and calculated material advantage
 */
export function calculateMaterialAndCaptures(chess: Chess): {
  capturedWhite: PieceType[];
  capturedBlack: PieceType[];
  materialAdvantage: { white: number; black: number };
} {
  const summary = calculateBoardMaterial(chess);
  const { capturedWhite, capturedBlack } = calculateCaptures(summary);
  const materialAdvantage = calculateMaterialDifference(summary);

  return {
    capturedWhite,
    capturedBlack,
    materialAdvantage,
  };
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

/**
 * Locates the board coordinate square of the king for a given color (MIN-019).
 *
 * @param chess - Active Chess instance
 * @param color - Color of the king to find ('w' or 'b')
 * @returns The board square coordinate (e.g. "e1", "e8") or null if not found
 */
export function getKingSquare(chess: Chess, color: PieceColor): Square | null {
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

/**
 * Determines whether a given move constitutes a pawn promotion.
 *
 * @param from - Source square
 * @param to - Destination square
 * @param pieceOrChess - Optional piece at source square or Chess instance
 * @returns true if the move is a pawn promotion
 */
export function isPawnPromotion(
  from: Square | string,
  to: Square | string,
  pieceOrChess?: { type: string; color: string } | Chess | null,
): boolean {
  if (!to || typeof to !== "string" || to.length < 2) return false;
  let piece: { type: string; color: string } | null | undefined = null;

  if (pieceOrChess && typeof (pieceOrChess as Chess).get === "function") {
    try {
      piece = (pieceOrChess as Chess).get(from as Square);
    } catch (err: unknown) {
      const debugFn = typeof console !== "undefined" ? console["debug"] : undefined;
      debugFn?.("isPawnPromotion failed to get piece at square", {
        from,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  } else if (pieceOrChess && typeof pieceOrChess === "object") {
    piece = pieceOrChess as { type: string; color: string };
  }

  if (!piece || piece.type !== "p") return false;
  const toRank = to.charAt(1);
  return (
    (piece.color === "w" && toRank === "8") ||
    (piece.color === "b" && toRank === "1")
  );
}

/**
 * Creates the initial authoritative GameState for a room or match.
 *
 * @param fen - Optional starting FEN; defaults to standard starting position
 * @returns Initial GameState
 */
export function createInitialGameState(fen?: string): GameState {
  const chess = createSafeChess(fen);
  const { capturedWhite, capturedBlack, materialAdvantage } =
    calculateMaterialAndCaptures(chess);

  const isCheck = chess.inCheck();
  const isCheckmate = chess.isCheckmate();
  const isDraw = chess.isDraw();
  const isStalemate = chess.isStalemate();
  const isThreefoldRepetition = chess.isThreefoldRepetition();
  const isInsufficientMaterial = chess.isInsufficientMaterial();

  return {
    fen: chess.fen(),
    turn: chess.turn() as PieceColor,
    isCheck,
    isCheckmate,
    isDraw,
    isStalemate,
    isThreefoldRepetition,
    isInsufficientMaterial,
    isFiftyMoveRule: chess.isDraw() && !isStalemate && !isThreefoldRepetition && !isInsufficientMaterial,
    moveHistory: [],
    capturedWhite,
    capturedBlack,
    materialAdvantage,
    lastMove: null,
    moveCount: 0,
  };
}
