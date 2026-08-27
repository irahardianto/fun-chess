import type {
  Puzzle,
  HintLevel,
  ExtendedHintData,
  PieceType,
} from '@fun-chess/shared';
import { createSafeChess } from '@fun-chess/shared';
import { parseUciMove } from './puzzle_validator';
import { PIECE_DISPLAY_NAMES } from './puzzle_analysis_engine';

export const THEME_ICONS: Record<string, string> = {
  fork: '🍴',
  pin: '📌',
  skewer: '🗡️',
  discovered_attack: '⚡',
  discovered_check: '⚡',
  double_check: '⚡⚡',
  hanging_piece: '🎁',
  trapped_piece: '🕸️',
  back_rank_mate: '👑',
  smothered_mate: '🐴',
  mate_in_1: '👑',
  mate_in_2: '👑',
  mate_in_3: '👑',
  greek_gift: '🎁',
  pawn_endgame: '♟️',
  rook_endgame: '♜',
  queen_endgame: '♛',
  deflection: '🔀',
  decoy: '🎯',
  windmill: '🔄',
};

// Re-export type for compatibility
export type { ExtendedHintData };

/**
 * Pure 3-tier progressive hint generator returning structured ExtendedHintData.
 * Level 1: Source Square Nudge & subtle attention cue with conceptual rationale
 * Level 2: Target Square Glow & directional beacon with tactical objective
 * Level 3: Full Solution vector arrow, SAN notation, and complete explanation
 * Adheres to Rule 2 (Pure Business Logic — zero framework, zero I/O).
 *
 * @param puzzle - The active puzzle
 * @param currentMoveIndex - Current ply index in puzzle.moves
 * @param currentFen - Current FEN position
 * @param requestedLevel - Desired hint level (0, 1, 2, or 3)
 * @returns Structured ExtendedHintData payload
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
  const themeIcon = (puzzle.primaryTheme && THEME_ICONS[puzzle.primaryTheme]) ?? '💡';
  const stepExp = puzzle.stepExplanations?.[currentMoveIndex];
  const tacticalObjective = (currentMoveIndex > 0 && stepExp?.explanation)
    ? stepExp.explanation
    : (puzzle.tacticalGoal ?? stepExp?.explanation ?? undefined);
  const targetSquares = puzzle.targetSquares ?? (to ? [to] : undefined);
  const threatSquares = puzzle.targetSquares ?? puzzle.keySquares ?? (to ? [to] : undefined);

  // Extract piece type from current position
  let pieceName = 'Piece';
  let san = stepExp?.moveSan ?? expectedUci;
  try {
    const chess = createSafeChess(currentFen);
    const piece = chess.get(from as unknown as import('chess.js').Square);
    if (piece) {
      pieceName = PIECE_DISPLAY_NAMES[piece.type as PieceType] ?? 'Piece';
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
    const conceptualMsg = (currentMoveIndex > 0 && stepExp?.explanation)
      ? `Look at your ${pieceName} on ${from}! ${stepExp.explanation}`
      : tacticalObjective
        ? `Look at your ${pieceName} on ${from}! ${tacticalObjective}`
        : `Look at your ${pieceName} on ${from}! Can it make a powerful move?`;

    return {
      level: 1,
      tier: 'piece_nudge',
      sourceSquare: from,
      themeIcon,
      tacticalObjective,
      message: conceptualMsg,
      mascotDialogue: `Which piece can leap or strike? Check out ${from}! 💡`,
    };
  }

  if (requestedLevel === 2) {
    const targetMsg = (currentMoveIndex > 0 && stepExp?.explanation)
      ? `Move your ${pieceName} from ${from} to ${to}! ${stepExp.explanation}`
      : tacticalObjective
        ? `Move your ${pieceName} from ${from} to ${to}! Goal: ${tacticalObjective}`
        : `Move your ${pieceName} from ${from} to ${to} to attack!`;

    return {
      level: 2,
      tier: 'target_glow',
      sourceSquare: from,
      targetSquare: to,
      themeIcon,
      tacticalObjective,
      targetSquares,
      threatSquares,
      message: targetMsg,
      mascotDialogue: `I spot an amazing target square on ${to}! 🎯`,
    };
  }

  // Level 3: Full Solution
  const fullSolutionMsg = stepExp?.explanation
    ? `Play ${san} (${from} to ${to})! ${stepExp.explanation}`
    : `Play ${san} (${from} to ${to}) to execute the winning move!`;

  return {
    level: 3,
    tier: 'full_solution',
    sourceSquare: from,
    targetSquare: to,
    solutionSan: san,
    solutionUci: expectedUci,
    themeIcon,
    tacticalObjective,
    targetSquares,
    threatSquares,
    highlightArrow: { from, to },
    message: fullSolutionMsg,
    mascotDialogue: `Here is the winning move: ${san}! 👑`,
  };
}

export const generatePuzzleHint = generateProgressiveHint;

