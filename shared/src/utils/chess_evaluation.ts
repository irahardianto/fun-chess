import { Chess } from "chess.js";
import type { PieceType, PieceColor, GameState, Square } from "../contracts/models.js";
import { createSafeChess } from "./chess_factory.js";

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

/**
 * Calculates captured pieces and net material advantages for both players.
 *
 * @param chess - Active Chess instance
 * @returns Captured piece arrays and calculated material advantage
 */
export function calculateMaterialAndCaptures(chess: Chess): {
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

  const pieceOrder: PieceType[] = ["q", "r", "b", "n", "p"];

  for (const type of pieceOrder) {
    const whiteMissing = Math.max(0, STARTING_PIECES[type] - whiteCounts[type]);
    for (let i = 0; i < whiteMissing; i++) {
      capturedWhite.push(type);
    }

    const blackMissing = Math.max(0, STARTING_PIECES[type] - blackCounts[type]);
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
    } catch {
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
