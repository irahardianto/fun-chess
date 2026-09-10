import type { Chess, Square as ChessSquare } from 'chess.js';
import type {
  Puzzle,
  HintLevel,
  ExtendedHintData,
  PieceType,
  PieceColor,
  Square,
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

export type { ExtendedHintData };

export interface HintPieceDetails {
  pieceType?: PieceType;
  color?: PieceColor;
  pieceName: string;
}

export interface HintContext {
  from: Square;
  to?: Square;
  san: string;
  expectedUci: string;
  pieceName: string;
  themeIcon: string;
  tacticalObjective?: string;
  stepExplanation?: string;
  targetSquares?: readonly Square[];
  threatSquares?: readonly Square[];
}

/**
 * Pure helper resolving piece type, color, and display name from board position.
 */
export function resolveHintPieceDetails(from: Square, board: Chess): HintPieceDetails {
  const piece = board.get(from as unknown as ChessSquare);
  if (!piece) {
    return { pieceName: 'Piece' };
  }
  return {
    pieceType: piece.type as PieceType,
    color: piece.color as PieceColor,
    pieceName: PIECE_DISPLAY_NAMES[piece.type as PieceType] ?? 'Piece',
  };
}

function formatLevel1Hint(context: HintContext): ExtendedHintData {
  const { from, pieceName, themeIcon, tacticalObjective, stepExplanation } = context;
  const message = stepExplanation
    ? `Look at your ${pieceName} on ${from}! ${stepExplanation}`
    : tacticalObjective
      ? `Look at your ${pieceName} on ${from}! ${tacticalObjective}`
      : `Look at your ${pieceName} on ${from}! Can it make a powerful move?`;

  return {
    level: 1,
    tier: 'piece_nudge',
    sourceSquare: from,
    themeIcon,
    tacticalObjective,
    message,
    mascotDialogue: `Which piece can leap or strike? Check out ${from}! 💡`,
  };
}

function formatLevel2Hint(context: HintContext): ExtendedHintData {
  const { from, to, pieceName, themeIcon, tacticalObjective, stepExplanation, targetSquares, threatSquares } = context;
  const message = stepExplanation
    ? `Move your ${pieceName} from ${from} to ${to}! ${stepExplanation}`
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
    message,
    mascotDialogue: `I spot an amazing target square on ${to}! 🎯`,
  };
}

function formatLevel3Hint(context: HintContext): ExtendedHintData {
  const { from, to, san, expectedUci, themeIcon, tacticalObjective, stepExplanation, targetSquares, threatSquares } = context;
  const message = stepExplanation
    ? `Play ${san} (${from} to ${to})! ${stepExplanation}`
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
    highlightArrow: to ? { from, to } : undefined,
    message,
    mascotDialogue: `Here is the winning move: ${san}! 👑`,
  };
}

/**
 * Pure formatting helper for hint text and highlighting by level.
 */
export function formatHintByLevel(level: HintLevel, context: HintContext): ExtendedHintData {
  switch (level) {
    case 1:
      return formatLevel1Hint(context);
    case 2:
      return formatLevel2Hint(context);
    case 3:
      return formatLevel3Hint(context);
    default:
      return {
        level: 0,
        tier: 'none',
        message: 'Take your time and scan the board for active pieces!',
      };
  }
}

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
 * @param customLogger - Optional logger instance
 * @returns Structured ExtendedHintData payload
 */
export function generateProgressiveHint(
  puzzle: Puzzle,
  currentMoveIndex: number,
  currentFen: string,
  requestedLevel: HintLevel,
  _customLogger?: unknown
): ExtendedHintData {
  if (requestedLevel === 0 || !puzzle?.moves || currentMoveIndex >= puzzle.moves.length) {
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
  const stepExp = puzzle.stepExplanations?.[currentMoveIndex];
  const stepExplanation = (currentMoveIndex > 0 && stepExp?.explanation) ? stepExp.explanation : undefined;
  const tacticalObjective = stepExplanation ?? puzzle.tacticalGoal ?? stepExp?.explanation;

  let pieceName = 'Piece';
  let san = stepExp?.moveSan ?? expectedUci;

  try {
    const chess = createSafeChess(currentFen);
    pieceName = resolveHintPieceDetails(from, chess).pieceName;
    const moveRes = chess.move({
      from: from as unknown as ChessSquare,
      to: to as unknown as ChessSquare,
      promotion,
    });
    if (moveRes) {
      san = moveRes.san;
    }
  } catch (_err) {
    san = stepExp?.moveSan ?? expectedUci;
  }

  const context: HintContext = {
    from,
    to,
    san,
    expectedUci,
    pieceName,
    themeIcon: (puzzle.primaryTheme && THEME_ICONS[puzzle.primaryTheme]) ?? '💡',
    tacticalObjective,
    stepExplanation,
    targetSquares: puzzle.targetSquares ?? (to ? [to] : undefined),
    threatSquares: puzzle.targetSquares ?? puzzle.keySquares ?? (to ? [to] : undefined),
  };

  return formatHintByLevel(requestedLevel, context);
}

export const generatePuzzleHint = generateProgressiveHint;
