import { Chess } from 'chess.js';
import type {
  Square,
  PieceColor,
  Puzzle,
  PlayerMoveAction,
  MoveValidationOutcome,
} from '@fun-chess/shared';
import {
  generateMistakeRefutation,
  analyzePuzzleSolution,
  generateStepBreakdowns,
} from './puzzle_analysis_engine';

/**
 * Normalizes a PlayerMoveAction into a standard 4-5 character UCI string.
 */
export function formatPlayerMoveToUci(move: PlayerMoveAction): string {
  const promo = move.promotion ? move.promotion.toLowerCase() : '';
  return `${move.from}${move.to}${promo}`;
}

/**
 * Parses a UCI move string (e.g. "e2e4", "e7e8q") into constituent parts.
 */
export function parseUciMove(uci: string): {
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n';
} {
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promoChar = uci.length > 4 ? uci.charAt(4).toLowerCase() : undefined;
  const promotion =
    promoChar === 'q' || promoChar === 'r' || promoChar === 'b' || promoChar === 'n'
      ? promoChar
      : undefined;

  return { from, to, promotion };
}

/**
 * Checks whether a proposed move is a pawn promotion move.
 */
export function isPawnPromotionMove(fen: string, from: Square, to: Square): boolean {
  try {
    const chess = new Chess(fen);
    const piece = chess.get(from as unknown as import('chess.js').Square);
    if (!piece || piece.type !== 'p') return false;
    const toRank = to.charAt(1);
    return (piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1');
  } catch {
    return false;
  }
}

/**
 * Returns legal target squares for a selected piece square in the current position.
 */
export function getLegalMovesForSquare(fen: string, square: Square): Square[] {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({
      square: square as unknown as import('chess.js').Square,
      verbose: true,
    });
    return moves.map((m) => m.to as Square);
  } catch {
    return [];
  }
}

/**
 * Checks if a square contains a piece belonging to the specified player color.
 */
export function isPieceOfColor(fen: string, square: Square, color: PieceColor): boolean {
  try {
    const chess = new Chess(fen);
    const piece = chess.get(square as unknown as import('chess.js').Square);
    return Boolean(piece && piece.color === color);
  } catch {
    return false;
  }
}

/**
 * Pure move validator evaluating player moves against puzzle solution plies.
 * Handles multi-ply solutions and automated opponent counter-responses.
 * Adheres to Rule 2 (Pure Business Logic — zero framework, zero I/O).
 *
 * @param puzzle - The active Puzzle entity
 * @param currentMoveIndex - Current solution ply index (0-indexed in puzzle.moves)
 * @param currentFen - Current board position FEN
 * @param playerMove - Proposed player move action
 * @returns MoveValidationOutcome with updated position, status, and bot counter-move if applicable
 */
export function validatePuzzleMove(
  puzzle: Puzzle,
  currentMoveIndex: number,
  currentFen: string,
  playerMove: PlayerMoveAction
): MoveValidationOutcome {
  if (!puzzle || !puzzle.moves || currentMoveIndex < 0 || currentMoveIndex >= puzzle.moves.length) {
    return {
      isCorrect: false,
      isPuzzleComplete: false,
      nextFen: currentFen,
      nextMoveIndex: currentMoveIndex,
      feedback: 'Puzzle session is invalid or already finished.',
    };
  }

  const expectedUci = puzzle.moves[currentMoveIndex]?.toLowerCase();
  if (!expectedUci) {
    return {
      isCorrect: false,
      isPuzzleComplete: false,
      nextFen: currentFen,
      nextMoveIndex: currentMoveIndex,
      feedback: 'Expected move could not be found.',
    };
  }

  const playerUci = formatPlayerMoveToUci(playerMove);
  const matchesExpected = playerUci === expectedUci;

  if (!matchesExpected) {
    const refutation = generateMistakeRefutation(currentFen, playerMove);
    const feedback = refutation
      ? `Not quite! ${refutation.kidFriendlyExplanation}`
      : 'Not quite! Look closer for the best tactical move.';
    return {
      isCorrect: false,
      isPuzzleComplete: false,
      nextFen: currentFen,
      nextMoveIndex: currentMoveIndex,
      feedback,
      refutation: refutation ?? undefined,
    };
  }

  // Move matches expected solution! Execute on chess engine to advance state
  let chess: Chess;
  try {
    chess = new Chess(currentFen);
  } catch {
    return {
      isCorrect: false,
      isPuzzleComplete: false,
      nextFen: currentFen,
      nextMoveIndex: currentMoveIndex,
      feedback: 'Corrupted board state.',
    };
  }

  const { from, to, promotion } = parseUciMove(expectedUci);
  let playerResult: any = null;
  try {
    playerResult = chess.move({
      from: from as unknown as import('chess.js').Square,
      to: to as unknown as import('chess.js').Square,
      promotion,
    });
  } catch {
    playerResult = null;
  }

  if (!playerResult) {
    return {
      isCorrect: false,
      isPuzzleComplete: false,
      nextFen: currentFen,
      nextMoveIndex: currentMoveIndex,
      feedback: 'Illegal move in current position.',
    };
  }

  const intermediateFen = chess.fen();
  const nextMoveIdx = currentMoveIndex + 1;

  // Step explanation for this ply
  const stepNarratives = puzzle.stepExplanations ?? generateStepBreakdowns(puzzle);
  const stepExplanation = stepNarratives[currentMoveIndex] ?? {
    plyIndex: currentMoveIndex,
    moveSan: playerResult.san,
    moveUci: expectedUci,
    actor: puzzle.playerColor,
    explanation: `Plays ${playerResult.san} accurately!`,
  };

  // Case 1: Player executed the final ply of the puzzle
  if (nextMoveIdx >= puzzle.moves.length) {
    const analysis = analyzePuzzleSolution(puzzle);
    return {
      isCorrect: true,
      isPuzzleComplete: true,
      intermediateFen,
      nextFen: intermediateFen,
      nextMoveIndex: nextMoveIdx,
      feedback: 'Brilliant! You solved the puzzle! 🎉',
      stepExplanation,
      analysis,
    };
  }

  // Case 2: Multi-ply puzzle! Automated opponent response needed
  const opponentUci = puzzle.moves[nextMoveIdx];
  if (!opponentUci) {
    const analysis = analyzePuzzleSolution(puzzle);
    return {
      isCorrect: true,
      isPuzzleComplete: true,
      intermediateFen,
      nextFen: intermediateFen,
      nextMoveIndex: nextMoveIdx,
      feedback: 'Brilliant! You solved the puzzle! 🎉',
      stepExplanation,
      analysis,
    };
  }

  const oppParsed = parseUciMove(opponentUci);
  let oppResult: any = null;
  try {
    oppResult = chess.move({
      from: oppParsed.from as unknown as import('chess.js').Square,
      to: oppParsed.to as unknown as import('chess.js').Square,
      promotion: oppParsed.promotion,
    });
  } catch {
    oppResult = null;
  }

  const botReplyMove = oppResult
    ? {
        from: oppParsed.from,
        to: oppParsed.to,
        promotion: oppParsed.promotion,
        san: oppResult.san,
        uci: opponentUci,
      }
    : undefined;

  const playerNextIdx = nextMoveIdx + 1;
  const isCompleteAfterBot = playerNextIdx >= puzzle.moves.length;
  const analysis = isCompleteAfterBot ? analyzePuzzleSolution(puzzle) : undefined;

  return {
    isCorrect: true,
    isPuzzleComplete: isCompleteAfterBot,
    intermediateFen,
    nextFen: chess.fen(),
    botReplyMove,
    nextMoveIndex: playerNextIdx,
    feedback: isCompleteAfterBot
      ? 'Brilliant! You solved the puzzle! 🎉'
      : 'Great move! Keep going...',
    stepExplanation,
    analysis,
  };
}
