import { Chess } from 'chess.js';
import type {
  Square,
  PieceColor,
  PieceType,
  PuzzleTheme,
} from '@fun-chess/shared';
import {
  parseUciMove,
  createSafeChess,
  isValidFen,
  PIECE_CENTIPAWN_VALUES,
} from '@fun-chess/shared';
import { getSquaresAttackedByPiece, findKingSquare } from '../geometry/attack_rays';
import { PIECE_DISPLAY_NAMES } from '../pedagogy/rules_of_thumb';
import { logger } from '@/platform/telemetry';

/**
 * Detects checkmate motif (smothered mate, back-rank mate, or mate in 1).
 */
export function detectCheckmateMotif(
  chessAfter: Chess,
  pieceType: PieceType,
  oppColor: PieceColor,
  to: Square,
): { theme: PuzzleTheme; confidence: number; explanation: string } | null {
  if (!chessAfter.isCheckmate()) return null;

  if (pieceType === 'n') {
    return {
      theme: 'smothered_mate',
      confidence: 0.95,
      explanation: 'Smothered mate! The King is trapped by its own pieces.',
    };
  }

  const kingRank = oppColor === 'b' ? '8' : '1';
  if (to.charAt(1) === kingRank && (pieceType === 'r' || pieceType === 'q')) {
    return {
      theme: 'back_rank_mate',
      confidence: 0.95,
      explanation: 'Back rank mate! The trapped King had no escape squares.',
    };
  }

  return {
    theme: 'mate_in_1',
    confidence: 0.95,
    explanation: 'Checkmate! The enemy King is defeated.',
  };
}

/**
 * Detects discovered check or double check motif.
 */
export function detectDiscoveredCheckMotif(
  chessAfter: Chess,
  moverColor: PieceColor,
  oppColor: PieceColor,
  to: Square,
  pieceType: PieceType,
): { theme: PuzzleTheme; confidence: number; explanation: string } | null {
  if (!chessAfter.inCheck()) return null;

  const boardAfter = chessAfter.board();
  let attackersCount = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = boardAfter[r]?.[c];
      if (p && p.color === moverColor) {
        const fChar = String.fromCharCode(97 + c);
        const sq = `${fChar}${8 - r}` as Square;
        const attacks = getSquaresAttackedByPiece(boardAfter, sq, p.type as PieceType, moverColor);
        const kingSq = findKingSquare(boardAfter, oppColor);
        if (kingSq && attacks.includes(kingSq)) {
          attackersCount++;
        }
      }
    }
  }

  if (attackersCount >= 2) {
    return {
      theme: 'double_check',
      confidence: 0.95,
      explanation: 'Double check! Two pieces attack the King simultaneously.',
    };
  }

  const kingSq = findKingSquare(boardAfter, oppColor);
  const destAttacks = getSquaresAttackedByPiece(boardAfter, to, pieceType, moverColor);
  if (kingSq && !destAttacks.includes(kingSq)) {
    return {
      theme: 'discovered_check',
      confidence: 0.90,
      explanation: 'Discovered check! Moving uncovered an attack on the enemy King.',
    };
  }

  return null;
}

/**
 * Detects fork / double attack motif against high-value targets.
 */
export function detectForkMotif(
  boardAfter: ({ type: string; color: string } | null)[][],
  to: Square,
  pieceType: PieceType,
  moverColor: PieceColor,
  oppColor: PieceColor,
): { theme: PuzzleTheme; confidence: number; explanation: string } | null {
  const attackedSquares = getSquaresAttackedByPiece(boardAfter, to, pieceType, moverColor);
  const attackedHighPieces: { type: PieceType; square: Square }[] = [];

  for (const sq of attackedSquares) {
    const file = sq.charCodeAt(0) - 97;
    const rank = parseInt(sq.charAt(1), 10) - 1;
    const targetPiece = boardAfter[7 - rank]?.[file];
    if (targetPiece && targetPiece.color === oppColor) {
      if (
        targetPiece.type === 'k' ||
        targetPiece.type === 'q' ||
        targetPiece.type === 'r' ||
        targetPiece.type === 'b' ||
        targetPiece.type === 'n'
      ) {
        attackedHighPieces.push({ type: targetPiece.type as PieceType, square: sq });
      }
    }
  }

  if (attackedHighPieces.length >= 2) {
    return {
      theme: 'fork',
      confidence: 0.90,
      explanation: `Fork! The ${PIECE_DISPLAY_NAMES[pieceType]} attacks multiple high-value pieces simultaneously.`,
    };
  }

  return null;
}

/**
 * Detects pin or skewer along sliding piece rays.
 */
export function detectPinOrSkewer(
  board: ({ type: string; color: string } | null)[][],
  square: Square,
  pieceType: PieceType,
  _moverColor: PieceColor,
  oppColor: PieceColor,
): { theme: PuzzleTheme; confidence: number; explanation: string } | null {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square.charAt(1), 10) - 1;
  const rIdx = 7 - rank;
  const cIdx = file;

  const rays: [number, number][] = [];
  if (pieceType === 'b' || pieceType === 'q') {
    rays.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  }
  if (pieceType === 'r' || pieceType === 'q') {
    rays.push([-1, 0], [1, 0], [0, -1], [0, 1]);
  }

  for (const [dr, dc] of rays) {
    let nr = rIdx + dr;
    let nc = cIdx + dc;
    let firstPiece: { type: PieceType; color: PieceColor } | null = null;
    let secondPiece: { type: PieceType; color: PieceColor } | null = null;

    while (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
      const p = board[nr]?.[nc];
      if (p) {
        if (!firstPiece) {
          firstPiece = { type: p.type as PieceType, color: p.color as PieceColor };
        } else if (!secondPiece) {
          secondPiece = { type: p.type as PieceType, color: p.color as PieceColor };
          break;
        }
      }
      nr += dr;
      nc += dc;
    }

    if (firstPiece && secondPiece && firstPiece.color === oppColor && secondPiece.color === oppColor) {
      const val1 = PIECE_CENTIPAWN_VALUES[firstPiece.type];
      const val2 = PIECE_CENTIPAWN_VALUES[secondPiece.type];

      if (firstPiece.type === 'k' || (secondPiece.type !== 'k' && val1 > val2)) {
        return {
          theme: 'skewer',
          confidence: 0.88,
          explanation: `Skewer! The ${PIECE_DISPLAY_NAMES[firstPiece.type]} is forced to move, exposing the piece behind it.`,
        };
      } else if (secondPiece.type === 'k' || val2 > val1) {
        return {
          theme: 'pin',
          confidence: 0.88,
          explanation: `Pin! The ${PIECE_DISPLAY_NAMES[firstPiece.type]} is pinned against a higher-value target.`,
        };
      }
    }
  }

  return null;
}

/**
 * Detects pin or skewer along sliding piece rays.
 */
export function detectPinOrSkewerMotif(
  boardAfter: ({ type: string; color: string } | null)[][],
  to: Square,
  pieceType: PieceType,
  moverColor: PieceColor,
  oppColor: PieceColor,
): { theme: PuzzleTheme; confidence: number; explanation: string } | null {
  if (pieceType !== 'b' && pieceType !== 'r' && pieceType !== 'q') {
    return null;
  }
  return detectPinOrSkewer(boardAfter, to, pieceType, moverColor, oppColor);
}

/**
 * Default fallback hanging piece motif.
 */
export function detectHangingPieceMotif(): {
  theme: PuzzleTheme;
  confidence: number;
  explanation: string;
} {
  return {
    theme: 'hanging_piece',
    confidence: 0.70,
    explanation: 'Tactical strike winning material.',
  };
}

/**
 * Classifies the primary tactical motif executed in a move or sequence.
 */
export function classifyTacticalMotif(
  fenBefore: string,
  moveUci: string,
  fenAfter: string,
): {
  readonly theme: PuzzleTheme;
  readonly confidence: number;
  readonly explanation: string;
} {
  if (!isValidFen(fenBefore) || !isValidFen(fenAfter)) {
    return {
      theme: 'fork',
      confidence: 0.5,
      explanation: 'Tactical move executed.',
    };
  }

  let chessBefore: Chess;
  let chessAfter: Chess;
  try {
    chessBefore = createSafeChess(fenBefore);
    chessAfter = createSafeChess(fenAfter);
  } catch (err: unknown) {
    logger.debug('Invalid FEN in detectMoveTheme', {
      operation: 'detect_move_theme_fen_parse',
      fenBefore,
      fenAfter,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      theme: 'fork',
      confidence: 0.5,
      explanation: 'Tactical move executed.',
    };
  }

  const { from, to, promotion } = parseUciMove(moveUci);
  const moverColor = chessBefore.turn();
  const oppColor: PieceColor = moverColor === 'w' ? 'b' : 'w';
  const movingPiece = chessBefore.get(from as unknown as import('chess.js').Square);
  const pieceType = (promotion ? 'q' : movingPiece?.type ?? 'p') as PieceType;

  // 1. Checkmate
  const mate = detectCheckmateMotif(chessAfter, pieceType, oppColor, to as Square);
  if (mate) return mate;

  // 2. Discovered Check / Double Check
  const discCheck = detectDiscoveredCheckMotif(chessAfter, moverColor, oppColor, to as Square, pieceType);
  if (discCheck) return discCheck;

  // 3. Pawn Promotion
  if (promotion || (pieceType === 'p' && (to.charAt(1) === '8' || to.charAt(1) === '1'))) {
    return {
      theme: 'pawn_endgame',
      confidence: 0.85,
      explanation: 'Pawn promotion to Queen creates a dominant material advantage.',
    };
  }

  // 4. Fork / Double Attack
  const boardAfter = chessAfter.board();
  const fork = detectForkMotif(boardAfter, to as Square, pieceType, moverColor, oppColor);
  if (fork) return fork;

  // 5. Pin / Skewer Detection (along rays from destination)
  const pinOrSkewer = detectPinOrSkewerMotif(boardAfter, to as Square, pieceType, moverColor, oppColor);
  if (pinOrSkewer) return pinOrSkewer;

  // 6. Greek Gift Check
  if (pieceType === 'b' && (to === 'h7' || to === 'h2') && movingPiece?.type === 'b') {
    return {
      theme: 'greek_gift',
      confidence: 0.90,
      explanation: "Greek Gift sacrifice! Tearing open the enemy King's fortress.",
    };
  }

  return detectHangingPieceMotif();
}
