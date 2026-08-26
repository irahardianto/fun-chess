import { Chess } from 'chess.js';
import type {
  Square,
  Puzzle,
  HintLevel,
  HintData,
} from '@fun-chess/shared';
import { parseUciMove } from './puzzle_validator';

const PIECE_NAMES: Record<string, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

/**
 * Extended HintData supporting optional highlightArrow vector for UI overlays.
 */
export interface ExtendedHintData extends HintData {
  readonly highlightArrow?: { from: Square; to: Square };
}

/**
 * Pure 3-tier progressive hint generator returning structured HintData.
 * Level 1: Source Square Nudge & subtle attention cue
 * Level 2: Target Square Glow & directional beacon with tactical rationale
 * Level 3: Full Solution vector arrow, SAN notation, and complete explanation
 * Adheres to Rule 2 (Pure Business Logic — zero framework, zero I/O).
 *
 * @param puzzle - The active puzzle
 * @param currentMoveIndex - Current ply index in puzzle.moves
 * @param currentFen - Current FEN position
 * @param requestedLevel - Desired hint level (0, 1, 2, or 3)
 * @returns Structured HintData payload
 */
export function generateProgressiveHint(
  puzzle: Puzzle,
  currentMoveIndex: number,
  currentFen: string,
  requestedLevel: HintLevel
): ExtendedHintData {
  if (requestedLevel === 0 || !puzzle || !puzzle.moves || currentMoveIndex >= puzzle.moves.length) {
    return {
      level: 0,
      tier: 'none',
      message: 'Take your time and scan the board for active pieces!',
    };
  }

  const expectedUci = puzzle.moves[currentMoveIndex] ?? '';
  if (!expectedUci) {
    return {
      level: 0,
      tier: 'none',
      message: 'No further moves in this puzzle.',
    };
  }

  const { from, to, promotion } = parseUciMove(expectedUci);

  // Extract piece type from current position
  let pieceName = 'Piece';
  let san = expectedUci;
  try {
    const chess = new Chess(currentFen);
    const piece = chess.get(from as unknown as import('chess.js').Square);
    if (piece) {
      pieceName = PIECE_NAMES[piece.type] ?? 'Piece';
    }
    const moveRes = chess.move({
      from: from as unknown as import('chess.js').Square,
      to: to as unknown as import('chess.js').Square,
      promotion,
    });
    if (moveRes) {
      san = moveRes.san;
    }
  } catch {
    // Fallback if chess fails
  }

  if (requestedLevel === 1) {
    return {
      level: 1,
      tier: 'piece_nudge',
      sourceSquare: from,
      message: `Look at your ${pieceName} on ${from}! Can it make a powerful move?`,
      mascotDialogue: `Which piece can leap or strike? Check out ${from}! 💡`,
    };
  }

  if (requestedLevel === 2) {
    return {
      level: 2,
      tier: 'target_glow',
      sourceSquare: from,
      targetSquare: to,
      message: `Move your ${pieceName} from ${from} to ${to} to attack!`,
      mascotDialogue: `I spot an amazing target square on ${to}! 🎯`,
    };
  }

  // Level 3: Full Solution
  return {
    level: 3,
    tier: 'full_solution',
    sourceSquare: from,
    targetSquare: to,
    solutionSan: san,
    solutionUci: expectedUci,
    highlightArrow: { from, to },
    message: `Play ${san} (${from} to ${to}) to execute the winning move!`,
    mascotDialogue: `Here is the winning move: ${san}! 👑`,
  };
}

export const generatePuzzleHint = generateProgressiveHint;
