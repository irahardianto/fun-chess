import { Chess, type Move } from 'chess.js';
import type {
  Square,
  PieceColor,
  Puzzle,
  PlayerMoveAction,
  MoveValidationOutcome,
  PuzzleStepExplanation,
} from '@fun-chess/shared';
import {
  generateMistakeRefutation,
  analyzePuzzleSolution,
  generateStepBreakdowns,
} from './puzzle_analysis_engine';

import {
  formatPlayerMoveToUci,
  parseUciMove,
  createSafeChess,
  isValidFen,
} from '@fun-chess/shared';
import { logger } from '@/platform/telemetry';
export { formatPlayerMoveToUci, parseUciMove };

/**
 * Checks whether a proposed move is a pawn promotion move.
 */
export function isPawnPromotionMove(fen: string, from: Square, to: Square): boolean {
  if (!isValidFen(fen)) return false;
  try {
    const chess = createSafeChess(fen);
    const piece = chess.get(from as unknown as import('chess.js').Square);
    if (!piece || piece.type !== 'p') return false;
    const toRank = to.charAt(1);
    return (piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1');
  } catch (err) {
    logger.debug('Failed to check pawn promotion move', {
      operation: 'is_pawn_promotion_move',
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Returns legal target squares for a selected piece square in the current position.
 */
export function getLegalMovesForSquare(fen: string, square: Square): Square[] {
  if (!isValidFen(fen)) return [];
  try {
    const chess = createSafeChess(fen);
    const moves = chess.moves({
      square: square as unknown as import('chess.js').Square,
      verbose: true,
    });
    return moves.map((m) => m.to as Square);
  } catch (err) {
    logger.debug('Failed to get legal moves for square', {
      operation: 'get_legal_moves_for_square',
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Checks if a square contains a piece belonging to the specified player color.
 */
export function isPieceOfColor(fen: string, square: Square, color: PieceColor): boolean {
  if (!isValidFen(fen)) return false;
  try {
    const chess = createSafeChess(fen);
    const piece = chess.get(square as unknown as import('chess.js').Square);
    return Boolean(piece && piece.color === color);
  } catch (err) {
    logger.debug('Failed to check piece color', {
      operation: 'is_piece_of_color',
      error: err instanceof Error ? err.message : String(err),
    });
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

  if (!isValidFen(currentFen)) {
    logger.debug('Invalid currentFen in validatePuzzleMove', {
      operation: 'validate_puzzle_move',
      currentFen,
    });
    return {
      isCorrect: false,
      isPuzzleComplete: false,
      nextFen: currentFen,
      nextMoveIndex: currentMoveIndex,
      feedback: 'Corrupted board state.',
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

  let chess: Chess;
  try {
    chess = createSafeChess(currentFen);
  } catch (err) {
    logger.debug('Failed to initialize chess in validatePuzzleMove', {
      operation: 'validate_puzzle_move',
      currentFen,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      isCorrect: false,
      isPuzzleComplete: false,
      nextFen: currentFen,
      nextMoveIndex: currentMoveIndex,
      feedback: 'Corrupted board state.',
    };
  }

  let playerResult: Move | null;
  try {
    playerResult = chess.move({
      from: playerMove.from as unknown as import('chess.js').Square,
      to: playerMove.to as unknown as import('chess.js').Square,
      promotion: playerMove.promotion,
    });
  } catch {
    playerResult = null;
  }

  // Sound Checkmate Acceptance:
  // If the player proposes a legal move delivering immediate checkmate, accept it
  // as a valid checkmate completion even if it differs from the expected UCI line.
  if (playerResult && chess.isCheckmate() && (!matchesExpected || currentMoveIndex + 1 < puzzle.moves.length)) {
    return handleImmediateCheckmateSolution(puzzle, currentMoveIndex, playerResult, playerUci, chess);
  }

  if (!matchesExpected) {
    return handleUnexpectedMove(currentFen, currentMoveIndex, playerMove);
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

  // Case 1: Player executed the final ply of the puzzle
  if (nextMoveIdx >= puzzle.moves.length) {
    return handleFinalPlySolution(puzzle, currentMoveIndex, playerResult, expectedUci, intermediateFen);
  }

  // Step explanation for this ply
  const stepNarratives = puzzle.stepExplanations ?? generateStepBreakdowns(puzzle);
  const stepExplanation = stepNarratives[currentMoveIndex] ?? {
    plyIndex: currentMoveIndex,
    moveSan: playerResult.san,
    moveUci: expectedUci,
    actor: puzzle.playerColor,
    explanation: `Plays ${playerResult.san} accurately!`,
  };

  // Case 2: Multi-ply puzzle! Automated opponent response needed
  return handleOpponentCounterReply(puzzle, nextMoveIdx, chess, intermediateFen, stepExplanation);
}

/**
 * Handles sound checkmate acceptance where the player's legal move delivers immediate checkmate,
 * completing the puzzle even if differing from the expected solution line.
 */
export function handleImmediateCheckmateSolution(
  puzzle: Puzzle,
  currentMoveIndex: number,
  playerResult: Move,
  playerUci: string,
  chess: Chess
): MoveValidationOutcome {
  const finalFen = chess.fen();
  const stepNarratives = puzzle.stepExplanations ?? generateStepBreakdowns(puzzle);
  const stepExplanation = stepNarratives[currentMoveIndex] ?? {
    plyIndex: currentMoveIndex,
    moveSan: playerResult.san,
    moveUci: playerUci,
    actor: puzzle.playerColor,
    explanation: `Plays ${playerResult.san} delivering checkmate! 👑`,
  };
  const analysis = analyzePuzzleSolution(puzzle);

  return {
    isCorrect: true,
    isPuzzleComplete: true,
    intermediateFen: finalFen,
    nextFen: finalFen,
    nextMoveIndex: puzzle.moves.length,
    feedback: 'Brilliant! You found a checkmate! 🎉',
    stepExplanation,
    analysis,
  };
}

/**
 * Handles unexpected or incorrect player moves with tactical refutation feedback.
 */
export function handleUnexpectedMove(
  currentFen: string,
  currentMoveIndex: number,
  playerMove: PlayerMoveAction
): MoveValidationOutcome {
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

/**
 * Handles final ply completion when player executes the decisive move of the puzzle.
 */
export function handleFinalPlySolution(
  puzzle: Puzzle,
  currentMoveIndex: number,
  playerResult: Move,
  expectedUci: string,
  intermediateFen: string
): MoveValidationOutcome {
  const stepNarratives = puzzle.stepExplanations ?? generateStepBreakdowns(puzzle);
  const stepExplanation = stepNarratives[currentMoveIndex] ?? {
    plyIndex: currentMoveIndex,
    moveSan: playerResult.san,
    moveUci: expectedUci,
    actor: puzzle.playerColor,
    explanation: `Plays ${playerResult.san} accurately!`,
  };
  const analysis = analyzePuzzleSolution(puzzle);

  return {
    isCorrect: true,
    isPuzzleComplete: true,
    intermediateFen,
    nextFen: intermediateFen,
    nextMoveIndex: currentMoveIndex + 1,
    feedback: 'Brilliant! You solved the puzzle! 🎉',
    stepExplanation,
    analysis,
  };
}

/**
 * Handles multi-ply puzzle progression by executing the automated opponent counter-response.
 */
export function handleOpponentCounterReply(
  puzzle: Puzzle,
  nextMoveIdx: number,
  chess: Chess,
  intermediateFen: string,
  stepExplanation: PuzzleStepExplanation
): MoveValidationOutcome {
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
  let oppResult: Move | null;
  try {
    oppResult = chess.move({
      from: oppParsed.from as unknown as import('chess.js').Square,
      to: oppParsed.to as unknown as import('chess.js').Square,
      promotion: oppParsed.promotion,
    });
  } catch (err) {
    logger.debug('Failed to execute opponent counter move', {
      operation: 'handle_opponent_counter_reply',
      opponentUci,
      error: err instanceof Error ? err.message : String(err),
    });
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
