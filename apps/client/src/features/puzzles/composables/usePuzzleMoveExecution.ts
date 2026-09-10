import type { Ref, ComputedRef } from 'vue';
import type { Square as ChessSquare } from 'chess.js';
import type {
  Puzzle,
  Square,
  PieceColor,
  StarRating,
  PlayerMoveAction,
  MoveValidationOutcome,
  PlayerMistakeRefutation,
  PuzzleAttemptResult,
} from '@fun-chess/shared';
import { createSafeChess } from '@fun-chess/shared';
import { validatePuzzleMove } from '../engine/puzzle_validator';
import type { usePuzzleHints } from './usePuzzleHints';
import type { usePuzzleReplay } from './usePuzzleReplay';
import type { usePuzzleAnimationState } from './usePuzzleAnimationState';
import type { useAudio } from '../../../composables/useAudio';
import { logger } from '@/platform/telemetry';

export interface UsePuzzleMoveExecutionOptions {
  currentPuzzle: Ref<Puzzle | null>;
  currentFen: Ref<string>;
  currentMoveIndex: Ref<number>;
  selectedSquare: Ref<Square | null>;
  legalMoves: Ref<Square[]>;
  lastMove: Ref<{ from: string; to: string } | null>;
  isCompleted: Ref<boolean>;
  isSolvedSuccessfully: Ref<boolean>;
  mistakesCount: Ref<number>;
  feedbackMessage: Ref<string | null>;
  lastMistakeRefutation: Ref<PlayerMistakeRefutation | null>;
  attemptResult: Ref<PuzzleAttemptResult>;
  playerColor: ComputedRef<PieceColor>;
  calculatedStars: ComputedRef<StarRating>;
  anim: ReturnType<typeof usePuzzleAnimationState>;
  hints: ReturnType<typeof usePuzzleHints>;
  replay: ReturnType<typeof usePuzzleReplay>;
  autoAudio: boolean;
  audio: ReturnType<typeof useAudio>;
  onSolve?: (puzzle: Puzzle, stars: StarRating, hintsUsed: number, mistakes: number) => void;
  onSolved?: (puzzle: Puzzle, stars: StarRating, hintsUsed: number, mistakes: number) => void;
  onMistake?: (puzzle: Puzzle, mistakeCount: number) => void;
  onFailed?: (puzzle: Puzzle, mistakeCount: number) => void;
}

export interface UsePuzzleMoveExecutionReturn {
  recalculateLegalMoves: (fenStr: string, sq: Square | null) => Square[];
  selectSquare: (sq: Square) => void;
  applyPlayerMove: (move: PlayerMoveAction) => void;
}

/**
 * Move execution and square selection sub-composable for puzzle gameplay (MAJ-024).
 * Encapsulates move validation, failure shaking, opponent scheduling, and success finalizing.
 */
export function usePuzzleMoveExecution(options: UsePuzzleMoveExecutionOptions): UsePuzzleMoveExecutionReturn {
  const {
    currentPuzzle,
    currentFen,
    currentMoveIndex,
    selectedSquare,
    legalMoves,
    lastMove,
    isCompleted,
    isSolvedSuccessfully,
    mistakesCount,
    feedbackMessage,
    lastMistakeRefutation,
    attemptResult,
    playerColor,
    calculatedStars,
    anim,
    hints,
    replay,
    autoAudio,
    audio,
    onSolve,
    onSolved,
    onMistake,
    onFailed,
  } = options;

  function recalculateLegalMoves(fenStr: string, sq: Square | null): Square[] {
    if (!sq) return [];
    try {
      const chess = createSafeChess(fenStr);
      const moves = chess.moves({ square: sq as ChessSquare, verbose: true });
      return moves.map((m) => m.to as Square);
    } catch (err) {
      logger.warn('Failed to calculate legal moves from FEN', {
        operation: 'puzzle_runner_recalculate_legal_moves',
        fenStr,
        square: sq,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  function handleFailedPuzzleMove(outcome: MoveValidationOutcome): void {
    mistakesCount.value += 1;
    feedbackMessage.value = outcome.feedback;
    lastMistakeRefutation.value = outcome.refutation ?? null;
    selectedSquare.value = null;
    legalMoves.value = [];
    if (autoAudio) audio.playError();
    anim.triggerShake(400);

    if (currentPuzzle.value) {
      hints.checkAutoNudge(
        mistakesCount.value,
        currentPuzzle.value,
        currentMoveIndex.value,
        currentFen.value
      );
      onMistake?.(currentPuzzle.value, mistakesCount.value);
      onFailed?.(currentPuzzle.value, mistakesCount.value);
    }
  }

  function finalizePuzzleSuccess(outcome: MoveValidationOutcome): void {
    if (!currentPuzzle.value) return;

    currentFen.value = outcome.nextFen;
    currentMoveIndex.value = outcome.nextMoveIndex;
    isCompleted.value = true;
    isSolvedSuccessfully.value = true;
    replay.completeReplay();

    const hintsUsed = hints.hintsUsedCount.value;
    if (hintsUsed === 0 && mistakesCount.value === 0) {
      attemptResult.value = 'solved_first_try';
    } else if (hintsUsed > 0) {
      attemptResult.value = 'solved_with_hints';
    } else {
      attemptResult.value = 'solved_with_retries';
    }

    if (autoAudio) audio.playVictory();

    const callback = onSolved || onSolve;
    callback?.(
      currentPuzzle.value,
      calculatedStars.value,
      hintsUsed,
      mistakesCount.value
    );
  }

  function scheduleOpponentReply(outcome: MoveValidationOutcome): void {
    if (outcome.intermediateFen) {
      currentFen.value = outcome.intermediateFen;
    }
    anim.scheduleBotReply(() => {
      if (!currentPuzzle.value) return;
      currentFen.value = outcome.nextFen;
      currentMoveIndex.value = outcome.nextMoveIndex;
      if (outcome.botReplyMove) {
        lastMove.value = { from: outcome.botReplyMove.from, to: outcome.botReplyMove.to };
        if (autoAudio) audio.playMove();
      }
      hints.resetHints();
    }, 450);
  }

  function handleSuccessfulPlayerMove(
    move: PlayerMoveAction,
    outcome: MoveValidationOutcome
  ): void {
    selectedSquare.value = null;
    legalMoves.value = [];
    lastMove.value = { from: move.from, to: move.to };
    feedbackMessage.value = outcome.feedback;
    lastMistakeRefutation.value = null;
    if (autoAudio) audio.playMove();

    if (outcome.isPuzzleComplete) {
      finalizePuzzleSuccess(outcome);
    } else if (outcome.botReplyMove) {
      scheduleOpponentReply(outcome);
    }
  }

  function applyPlayerMove(move: PlayerMoveAction): void {
    if (!currentPuzzle.value || isCompleted.value || anim.isWaitingForBot.value) return;

    const outcome = validatePuzzleMove(
      currentPuzzle.value,
      currentMoveIndex.value,
      currentFen.value,
      move
    );

    if (!outcome.isCorrect) {
      handleFailedPuzzleMove(outcome);
      return;
    }

    handleSuccessfulPlayerMove(move, outcome);
  }

  function selectSquare(sq: Square): void {
    if (isCompleted.value || anim.isWaitingForBot.value) return;

    if (selectedSquare.value === sq) {
      selectedSquare.value = null;
      legalMoves.value = [];
      return;
    }

    if (selectedSquare.value && legalMoves.value.includes(sq)) {
      applyPlayerMove({ from: selectedSquare.value, to: sq });
      return;
    }

    try {
      const chess = createSafeChess(currentFen.value);
      const piece = chess.get(sq as ChessSquare);
      if (piece && piece.color === playerColor.value) {
        selectedSquare.value = sq;
        legalMoves.value = recalculateLegalMoves(currentFen.value, sq);
        lastMistakeRefutation.value = null;
        if (autoAudio) audio.playPickup();
      } else {
        selectedSquare.value = null;
        legalMoves.value = [];
      }
    } catch (err) {
      logger.warn('Failed to inspect square on board', {
        operation: 'puzzle_runner_select_square',
        square: sq,
        error: err instanceof Error ? err.message : String(err),
      });
      selectedSquare.value = null;
      legalMoves.value = [];
    }
  }

  return {
    recalculateLegalMoves,
    selectSquare,
    applyPlayerMove,
  };
}
