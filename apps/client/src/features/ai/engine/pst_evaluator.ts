import { Chess } from 'chess.js';
import type { PieceSquareTableSet } from '@fun-chess/shared';
import { createSafeChess } from '@fun-chess/shared';
import {
  PIECE_VALUES,
  DEFAULT_PST_TABLES,
  getPieceSquareValue,
  indexToSquare,
} from './piece_square_tables.js';

export const CHECKMATE_SCORE = 100000;
export const STALEMATE_SCORE = 0;

/**
 * Determines whether a position has entered the endgame phase based on remaining non-pawn material.
 * Threshold: total non-pawn material on board <= 1300 centipawns.
 */
export function isEndgamePhase(chess: Chess): boolean {
  const board = chess.board();
  let nonPawnMaterial = 0;

  for (let r = 0; r < 8; r++) {
    const row = board[r];
    if (!row) continue;
    for (let c = 0; c < 8; c++) {
      const piece = row[c];
      if (piece && piece.type !== 'p' && piece.type !== 'k') {
        nonPawnMaterial += PIECE_VALUES[piece.type] ?? 0;
      }
    }
  }

  return nonPawnMaterial <= 1300;
}

/**
 * Calculates raw piece material sum without positional PST adjustments.
 */
export function getMaterialCount(chess: Chess): { white: number; black: number; net: number } {
  const board = chess.board();
  let white = 0;
  let black = 0;

  for (let r = 0; r < 8; r++) {
    const row = board[r];
    if (!row) continue;
    for (let c = 0; c < 8; c++) {
      const piece = row[c];
      if (piece && piece.type !== 'k') {
        const val = PIECE_VALUES[piece.type] ?? 0;
        if (piece.color === 'w') {
          white += val;
        } else {
          black += val;
        }
      }
    }
  }

  return {
    white,
    black,
    net: white - black,
  };
}

/**
 * Evaluates the static position score of a chess game in centipawns.
 * Returns positive score for White advantage, negative for Black advantage.
 *
 * @param chess - chess.js instance
 * @param usePst - Whether to include Piece-Square Tables positional adjustments (default: true)
 * @param customPst - Optional custom Piece-Square Table set
 */
export function evaluateBoard(
  chess: Chess,
  usePst = true,
  customPst: PieceSquareTableSet = DEFAULT_PST_TABLES,
): number {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -CHECKMATE_SCORE : CHECKMATE_SCORE;
  }

  if (chess.isDraw()) {
    return STALEMATE_SCORE;
  }

  const isEndgame = isEndgamePhase(chess);
  const board = chess.board();
  let score = 0;

  for (let r = 0; r < 8; r++) {
    const row = board[r];
    if (!row) continue;
    for (let c = 0; c < 8; c++) {
      const piece = row[c];
      if (!piece) continue;

      const square = indexToSquare(r * 8 + c);
      const materialVal = PIECE_VALUES[piece.type] ?? 0;
      const pstVal = usePst
        ? getPieceSquareValue(piece.type, piece.color, square, isEndgame, customPst)
        : 0;
      const totalPieceVal = materialVal + pstVal;

      if (piece.color === 'w') {
        score += totalPieceVal;
      } else {
        score -= totalPieceVal;
      }
    }
  }

  return score;
}

/**
 * Evaluates the static position score of a FEN string.
 *
 * @param fen - Valid chess FEN string
 * @param usePst - Whether to include Piece-Square Tables positional adjustments
 * @param customPst - Optional custom Piece-Square Table set
 */
export function evaluateFen(
  fen: string,
  usePst = true,
  customPst: PieceSquareTableSet = DEFAULT_PST_TABLES,
): number {
  const chess = createSafeChess(fen);
  return evaluateBoard(chess, usePst, customPst);
}
