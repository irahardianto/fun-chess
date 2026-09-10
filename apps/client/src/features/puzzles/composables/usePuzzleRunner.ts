import { ref, computed, readonly, onUnmounted, getCurrentInstance } from 'vue';
import type {
  Puzzle,
  Square,
  PieceColor,
  StarRating,
  PlayerMistakeRefutation,
  PuzzleAttemptResult,
  PuzzleAnalysisResult,
  IClock,
} from '@fun-chess/shared';
import { SystemClock } from '@fun-chess/shared';
import { calculatePuzzleStars } from '../engine/star_calculator';
import { analyzePuzzleSolution } from '../engine/puzzle_analysis_engine';
import { usePuzzleHints } from './usePuzzleHints';
import { usePuzzleReplay, type ReplayStep } from './usePuzzleReplay';
import { usePuzzleAnimationState } from './usePuzzleAnimationState';
import { usePuzzleMoveExecution } from './usePuzzleMoveExecution';
import { useAudio } from '../../../composables/useAudio';
import { useInjectClock } from '@/platform/di';

export type { ReplayStep };
export * from './usePuzzleMoveExecution';

export interface UsePuzzleRunnerOptions {
  puzzle?: Puzzle | null;
  initialPuzzle?: Puzzle | null;
  autoPlayAudio?: boolean;
  clock?: IClock;
  onSolve?: (puzzle: Puzzle, stars: StarRating, hintsUsed: number, mistakes: number) => void;
  onSolved?: (puzzle: Puzzle, stars: StarRating, hintsUsed: number, mistakes: number) => void;
  onMistake?: (puzzle: Puzzle, mistakeCount: number) => void;
  onFailed?: (puzzle: Puzzle, mistakeCount: number) => void;
}

/**
 * Primary game loop orchestrator for puzzle gameplay sessions.
 * Decomposed and composed using `usePuzzleHints`, `usePuzzleReplay`,
 * `usePuzzleAnimationState`, and `usePuzzleMoveExecution` (MAJ-021, MAJ-024).
 */
export function usePuzzleRunner(options: UsePuzzleRunnerOptions = {}) {
  const clock = options.clock ?? (getCurrentInstance() ? useInjectClock() : new SystemClock());
  const targetInitialPuzzle = options.puzzle || options.initialPuzzle || null;
  const autoAudio = options.autoPlayAudio ?? true;
  const audio = useAudio();

  const currentPuzzle = ref<Puzzle | null>(targetInitialPuzzle);
  const currentFen = ref<string>(
    targetInitialPuzzle?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  );
  const currentMoveIndex = ref<number>(0);
  const selectedSquare = ref<Square | null>(null);
  const legalMoves = ref<Square[]>([]);
  const lastMove = ref<{ from: string; to: string } | null>(null);

  const isCompleted = ref<boolean>(false);
  const isSolvedSuccessfully = ref<boolean>(false);

  const mistakesCount = ref<number>(0);
  const feedbackMessage = ref<string | null>(null);
  const lastMistakeRefutation = ref<PlayerMistakeRefutation | null>(null);
  const attemptResult = ref<PuzzleAttemptResult>('unsolved');

  // Composed Subsystems
  const anim = usePuzzleAnimationState();

  const playerColor = computed<PieceColor>(() => currentPuzzle.value?.playerColor || 'w');

  const isPlayerTurn = computed<boolean>(() => {
    return !isCompleted.value && !anim.isWaitingForBot.value;
  });

  const analysis = computed<PuzzleAnalysisResult | null>(() => {
    if (!currentPuzzle.value) return null;
    return analyzePuzzleSolution(currentPuzzle.value);
  });

  const hints = usePuzzleHints({
    puzzle: currentPuzzle,
    currentMoveIndex,
    currentFen,
  });

  const replay = usePuzzleReplay({
    puzzle: currentPuzzle,
    analysis,
    autoAudio,
    audio,
  });

  const calculatedStars = computed<StarRating>(() => {
    return calculatePuzzleStars(hints.hintsUsedCount.value, mistakesCount.value);
  });

  const displayedFen = computed<string>(() => {
    if (replay.isReplaying.value && replay.currentReplayStep.value) {
      return replay.currentReplayStep.value.fen;
    }
    return currentFen.value;
  });

  const displayedLastMove = computed<{ from: string; to: string } | null>(() => {
    if (replay.isReplaying.value && replay.currentReplayStep.value) {
      if (replay.currentReplayStep.value.from && replay.currentReplayStep.value.to) {
        return { from: replay.currentReplayStep.value.from, to: replay.currentReplayStep.value.to };
      }
      return null;
    }
    return lastMove.value;
  });

  function clearTimers(): void {
    anim.clearAnimationTimers();
  }

  // Composed Move Execution Subsystem (MAJ-024)
  const moveExec = usePuzzleMoveExecution({
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
    onSolve: options.onSolve,
    onSolved: options.onSolved,
    onMistake: options.onMistake,
    onFailed: options.onFailed,
  });

  function loadPuzzle(puzzle: Puzzle) {
    clearTimers();
    currentPuzzle.value = puzzle;
    currentFen.value = puzzle.fen;
    currentMoveIndex.value = 0;
    selectedSquare.value = null;
    legalMoves.value = [];
    lastMove.value = null;
    isCompleted.value = false;
    isSolvedSuccessfully.value = false;
    mistakesCount.value = 0;
    feedbackMessage.value = null;
    lastMistakeRefutation.value = null;
    attemptResult.value = 'unsolved';
    anim.resetAnimationState();
    replay.resetReplay();
    hints.resetHints();
  }

  function revealNextHint() {
    if (!currentPuzzle.value || isCompleted.value) return null;
    return hints.revealHint(
      currentPuzzle.value,
      currentMoveIndex.value,
      currentFen.value
    );
  }

  function resetCurrentPuzzle() {
    clearTimers();
    if (!currentPuzzle.value) return;
    currentFen.value = currentPuzzle.value.fen;
    currentMoveIndex.value = 0;
    selectedSquare.value = null;
    legalMoves.value = [];
    lastMove.value = null;
    isCompleted.value = false;
    isSolvedSuccessfully.value = false;
    mistakesCount.value = 0;
    feedbackMessage.value = null;
    lastMistakeRefutation.value = null;
    anim.resetAnimationState();
    replay.resetReplay();
    hints.resetHints();
  }

  function resetCurrentAttempt() {
    resetCurrentPuzzle();
  }

  function reset() {
    resetCurrentPuzzle();
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      clearTimers();
    });
  }

  if (targetInitialPuzzle) {
    loadPuzzle(targetInitialPuzzle);
  }

  return {
    puzzle: readonly(currentPuzzle),
    currentPuzzle: readonly(currentPuzzle),
    currentFen: readonly(currentFen),
    displayedFen: readonly(displayedFen),
    currentMoveIndex: readonly(currentMoveIndex),
    selectedSquare: readonly(selectedSquare),
    legalMoves: readonly(legalMoves),
    lastMove: readonly(lastMove),
    displayedLastMove: readonly(displayedLastMove),
    isCompleted: readonly(isCompleted),
    isSolvedSuccessfully: readonly(isSolvedSuccessfully),
    isWaitingForBot: anim.isWaitingForBot,
    isPlayerTurn,
    isShaking: anim.isShaking,
    mistakesCount: readonly(mistakesCount),
    feedbackMessage: readonly(feedbackMessage),
    lastMistakeRefutation: readonly(lastMistakeRefutation),
    attemptResult: readonly(attemptResult),
    playerColor,
    calculatedStars,
    analysis,

    // Composed Hints Subsystem
    hintsCount: hints.hintsCount,
    progressiveHint: hints,
    hints,

    // Composed Replay & Board Inspection Subsystem
    isReplaying: replay.isReplaying,
    isInspectingBoard: replay.isInspectingBoard,
    replayStepIndex: replay.replayStepIndex,
    replaySteps: replay.replaySteps,
    replayTotalSteps: replay.replayTotalSteps,
    currentReplayStep: replay.currentReplayStep,
    currentReplaySan: replay.currentReplaySan,
    currentStepExplanation: replay.currentStepExplanation,
    stepReplayStart: replay.stepReplayStart,
    stepReplayPrev: replay.stepReplayPrev,
    stepReplayNext: replay.stepReplayNext,
    stepReplayEnd: replay.stepReplayEnd,
    goToReplayStep: replay.goToReplayStep,
    setReplayStep: replay.goToReplayStep,
    toggleInspectBoard: replay.toggleInspectBoard,
    replay,
    animation: anim,
    clock,
    clearTimers,
    loadPuzzle,
    selectSquare: moveExec.selectSquare,
    applyPlayerMove: moveExec.applyPlayerMove,
    revealNextHint,
    revealHint: revealNextHint,
    resetCurrentPuzzle,
    resetCurrentAttempt,
    reset,
  };
}

export type UsePuzzleRunnerReturn = ReturnType<typeof usePuzzleRunner>;
