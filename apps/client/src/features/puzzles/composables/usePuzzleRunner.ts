import { ref, computed, readonly, onUnmounted, getCurrentInstance } from 'vue';
import { Chess, type Square as ChessSquare } from 'chess.js';
import type {
  Puzzle,
  Square,
  PieceColor,
  StarRating,
  PlayerMoveAction,
  MoveValidationOutcome,
  PlayerMistakeRefutation,
  PuzzleAttemptResult,
  PuzzleAnalysisResult,
} from '@fun-chess/shared';
import { validatePuzzleMove } from '../engine/puzzle_validator';
import { calculatePuzzleStars } from '../engine/star_calculator';
import { analyzePuzzleSolution } from '../engine/puzzle_analysis_engine';
import { usePuzzleHints } from './usePuzzleHints';
import { usePuzzleReplay, type ReplayStep } from './usePuzzleReplay';
import { useAudio } from '../../../composables/useAudio';
import { logger } from '../../../platform/telemetry/index.js';

export type { ReplayStep };

export interface UsePuzzleRunnerOptions {
  puzzle?: Puzzle | null;
  initialPuzzle?: Puzzle | null;
  autoPlayAudio?: boolean;
  onSolve?: (puzzle: Puzzle, stars: StarRating, hintsUsed: number, mistakes: number) => void;
  onSolved?: (puzzle: Puzzle, stars: StarRating, hintsUsed: number, mistakes: number) => void;
  onMistake?: (puzzle: Puzzle, mistakeCount: number) => void;
  onFailed?: (puzzle: Puzzle, mistakeCount: number) => void;
}

/**
 * Primary game loop orchestrator for puzzle gameplay sessions.
 * Decomposed and composed using `usePuzzleHints` and `usePuzzleReplay`.
 */
export function usePuzzleRunner(options: UsePuzzleRunnerOptions = {}) {
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
  const isWaitingForBot = ref<boolean>(false);
  const isShaking = ref<boolean>(false);

  const mistakesCount = ref<number>(0);
  const feedbackMessage = ref<string | null>(null);
  const lastMistakeRefutation = ref<PlayerMistakeRefutation | null>(null);
  const attemptResult = ref<PuzzleAttemptResult>('unsolved');

  // Timers
  let botTimer: ReturnType<typeof setTimeout> | null = null;
  let shakeTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimers(): void {
    if (botTimer) {
      clearTimeout(botTimer);
      botTimer = null;
    }
    if (shakeTimer) {
      clearTimeout(shakeTimer);
      shakeTimer = null;
    }
  }

  const playerColor = computed<PieceColor>(() => currentPuzzle.value?.playerColor || 'w');

  const isPlayerTurn = computed<boolean>(() => {
    return !isCompleted.value && !isWaitingForBot.value;
  });

  const analysis = computed<PuzzleAnalysisResult | null>(() => {
    if (!currentPuzzle.value) return null;
    return analyzePuzzleSolution(currentPuzzle.value);
  });

  // Composed: Progressive Hints Subsystem
  const hints = usePuzzleHints({
    puzzle: currentPuzzle,
    currentMoveIndex,
    currentFen,
  });

  // Composed: Move Replay & Board Inspection Subsystem
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

  function recalculateLegalMoves(fenStr: string, sq: Square | null): Square[] {
    if (!sq) return [];
    try {
      const chess = new Chess(fenStr);
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
    isWaitingForBot.value = false;
    isShaking.value = false;
    mistakesCount.value = 0;
    feedbackMessage.value = null;
    lastMistakeRefutation.value = null;
    attemptResult.value = 'unsolved';
    replay.resetReplay();
    hints.resetHints();
  }

  function selectSquare(sq: Square) {
    if (isCompleted.value || isWaitingForBot.value) return;

    if (selectedSquare.value === sq) {
      selectedSquare.value = null;
      legalMoves.value = [];
      return;
    }

    if (selectedSquare.value && legalMoves.value.includes(sq)) {
      applyPlayerMove({ from: selectedSquare.value, to: sq });
      return;
    }

    // Check if clicked square has player's piece
    try {
      const chess = new Chess(currentFen.value);
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

  function handleFailedPuzzleMove(outcome: MoveValidationOutcome): void {
    mistakesCount.value += 1;
    isShaking.value = true;
    feedbackMessage.value = outcome.feedback;
    lastMistakeRefutation.value = outcome.refutation ?? null;
    selectedSquare.value = null;
    legalMoves.value = [];
    if (autoAudio) audio.playError();

    if (shakeTimer) {
      clearTimeout(shakeTimer);
      shakeTimer = null;
    }
    shakeTimer = setTimeout(() => {
      isShaking.value = false;
      shakeTimer = null;
    }, 400);

    // Non-punitive: auto-reveal Tier 1 nudge if child makes 2 mistakes
    if (currentPuzzle.value) {
      hints.checkAutoNudge(
        mistakesCount.value,
        currentPuzzle.value,
        currentMoveIndex.value,
        currentFen.value
      );
      options.onMistake?.(currentPuzzle.value, mistakesCount.value);
      options.onFailed?.(currentPuzzle.value, mistakesCount.value);
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

    const callback = options.onSolved || options.onSolve;
    callback?.(
      currentPuzzle.value,
      calculatedStars.value,
      hintsUsed,
      mistakesCount.value
    );
  }

  function scheduleOpponentReply(outcome: MoveValidationOutcome): void {
    // Advance to interim FEN immediately so player sees their piece move without visual lag
    if (outcome.intermediateFen) {
      currentFen.value = outcome.intermediateFen;
    }
    isWaitingForBot.value = true;
    if (botTimer) {
      clearTimeout(botTimer);
      botTimer = null;
    }
    botTimer = setTimeout(() => {
      botTimer = null;
      if (!currentPuzzle.value) return;
      currentFen.value = outcome.nextFen;
      currentMoveIndex.value = outcome.nextMoveIndex;
      if (outcome.botReplyMove) {
        lastMove.value = { from: outcome.botReplyMove.from, to: outcome.botReplyMove.to };
        if (autoAudio) audio.playMove();
      }
      isWaitingForBot.value = false;

      // Reset progressive hint for next user ply
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
    if (!currentPuzzle.value || isCompleted.value || isWaitingForBot.value) return;

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
    isWaitingForBot.value = false;
    isShaking.value = false;
    mistakesCount.value = 0;
    feedbackMessage.value = null;
    lastMistakeRefutation.value = null;
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

  // Auto-load initial puzzle if supplied
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
    isWaitingForBot: readonly(isWaitingForBot),
    isPlayerTurn,
    isShaking: readonly(isShaking),
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

    clearTimers,
    loadPuzzle,
    selectSquare,
    applyPlayerMove,
    revealNextHint,
    revealHint: revealNextHint,
    resetCurrentPuzzle,
    resetCurrentAttempt,
    reset,
  };
}
