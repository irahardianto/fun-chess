import { ref, computed, readonly, onUnmounted, getCurrentInstance } from 'vue';
import { Chess } from 'chess.js';
import type {
  Puzzle,
  Square,
  PieceColor,
  StarRating,
  PlayerMoveAction,
  PlayerMistakeRefutation,
  PuzzleAttemptResult,
  PuzzleAnalysisResult,
} from '@fun-chess/shared';
import { validatePuzzleMove, parseUciMove } from '../engine/puzzle_validator';
import { calculatePuzzleStars } from '../engine/star_calculator';
import { analyzePuzzleSolution } from '../engine/puzzle_analysis_engine';
import { useProgressiveHint } from './useProgressiveHint';
import { useAudio } from '../../../composables/useAudio';

export interface ReplayStep {
  readonly stepIndex: number;
  readonly plyIndex: number;
  readonly uci?: string;
  readonly san?: string;
  readonly from?: Square;
  readonly to?: Square;
  readonly actor?: PieceColor;
  readonly fen: string;
  readonly explanation?: string;
}

export interface UsePuzzleRunnerOptions {
  puzzle?: Puzzle | null;
  initialPuzzle?: Puzzle | null;
  autoPlayAudio?: boolean;
  onSolve?: (puzzle: Puzzle, stars: StarRating, hintsUsed: number, mistakes: number) => void;
  onSolved?: (puzzle: Puzzle, stars: StarRating, hintsUsed: number, mistakes: number) => void;
  onMistake?: (puzzle: Puzzle, mistakeCount: number) => void;
  onFailed?: (puzzle: Puzzle, mistakeCount: number) => void;
}

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

  // Interactive Replay & Board Inspection State
  const isReplaying = ref<boolean>(false);
  const isInspectingBoard = ref<boolean>(false);
  const replayStepIndex = ref<number>(0);

  const progressiveHint = useProgressiveHint();

  // Active timers
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

  const calculatedStars = computed<StarRating>(() => {
    return calculatePuzzleStars(progressiveHint.hintsUsedCount.value, mistakesCount.value);
  });

  const analysis = computed<PuzzleAnalysisResult | null>(() => {
    if (!currentPuzzle.value) return null;
    return analyzePuzzleSolution(currentPuzzle.value);
  });

  /**
   * Precomputes full step-by-step replay history from puzzle.fen and puzzle.moves
   */
  const replaySteps = computed<readonly ReplayStep[]>(() => {
    const p = currentPuzzle.value;
    if (!p) return [];

    const steps: ReplayStep[] = [
      {
        stepIndex: 0,
        plyIndex: -1,
        fen: p.fen,
        san: 'Start',
        explanation: 'Initial puzzle setup position',
      },
    ];

    let sim: Chess;
    try {
      sim = new Chess(p.fen);
    } catch {
      return steps;
    }

    for (let i = 0; i < p.moves.length; i++) {
      const uci = p.moves[i];
      if (!uci) continue;
      const { from, to, promotion } = parseUciMove(uci);
      const actor: PieceColor = sim.turn();

      let moveRes: any = null;
      try {
        moveRes = sim.move({
          from: from as unknown as import('chess.js').Square,
          to: to as unknown as import('chess.js').Square,
          promotion,
        });
      } catch {
        moveRes = null;
      }

      const san = moveRes ? moveRes.san : uci;
      const ana = analysis.value;
      const explanation =
        p.stepExplanations?.[i]?.explanation ||
        ana?.stepNarratives?.[i]?.explanation ||
        (moveRes ? `Move: ${san}` : uci);

      steps.push({
        stepIndex: i + 1,
        plyIndex: i,
        uci,
        san,
        from,
        to,
        actor,
        fen: sim.fen(),
        explanation,
      });
    }

    return steps;
  });

  const replayTotalSteps = computed<number>(() => {
    return Math.max(0, currentPuzzle.value?.moves.length ?? 0);
  });

  const currentReplayStep = computed<ReplayStep | null>(() => {
    return replaySteps.value[replayStepIndex.value] ?? null;
  });

  const currentReplaySan = computed<string>(() => {
    return currentReplayStep.value?.san || '';
  });

  const currentStepExplanation = computed<{
    plyIndex: number;
    moveSan: string;
    moveUci: string;
    actor: PieceColor;
    explanation: string;
  } | null>(() => {
    if (!currentReplayStep.value) return null;
    const idx = replayStepIndex.value - 1;
    if (idx < 0) {
      return {
        plyIndex: -1,
        moveSan: 'Start',
        moveUci: '',
        actor: currentPuzzle.value?.playerColor || 'w',
        explanation: 'Initial puzzle setup position',
      };
    }
    const ana = analysis.value;
    const p = currentPuzzle.value;
    const predefined = p?.stepExplanations?.[idx];
    const narrative = ana?.stepNarratives?.[idx];
    return (
      predefined ||
      narrative || {
        plyIndex: idx,
        moveSan: currentReplayStep.value.san || '',
        moveUci: currentReplayStep.value.uci || '',
        actor: currentReplayStep.value.actor || 'w',
        explanation: currentReplayStep.value.explanation || '',
      }
    );
  });

  const displayedFen = computed<string>(() => {
    if (isReplaying.value && currentReplayStep.value) {
      return currentReplayStep.value.fen;
    }
    return currentFen.value;
  });

  const displayedLastMove = computed<{ from: string; to: string } | null>(() => {
    if (isReplaying.value && currentReplayStep.value) {
      if (currentReplayStep.value.from && currentReplayStep.value.to) {
        return { from: currentReplayStep.value.from, to: currentReplayStep.value.to };
      }
      return null;
    }
    return lastMove.value;
  });

  function recalculateLegalMoves(fenStr: string, sq: Square | null): Square[] {
    if (!sq) return [];
    try {
      const chess = new Chess(fenStr);
      const moves = chess.moves({ square: sq as any, verbose: true });
      return moves.map((m) => m.to as Square);
    } catch {
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
    isReplaying.value = false;
    isInspectingBoard.value = false;
    replayStepIndex.value = 0;
    progressiveHint.resetHints();
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
      const piece = chess.get(sq as any);
      if (piece && piece.color === playerColor.value) {
        selectedSquare.value = sq;
        legalMoves.value = recalculateLegalMoves(currentFen.value, sq);
        lastMistakeRefutation.value = null;
        if (autoAudio) audio.playPickup();
      } else {
        selectedSquare.value = null;
        legalMoves.value = [];
      }
    } catch {
      selectedSquare.value = null;
      legalMoves.value = [];
    }
  }

  function applyPlayerMove(move: PlayerMoveAction) {
    if (!currentPuzzle.value || isCompleted.value || isWaitingForBot.value) return;

    const outcome = validatePuzzleMove(
      currentPuzzle.value,
      currentMoveIndex.value,
      currentFen.value,
      move
    );

    if (!outcome.isCorrect) {
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
      if (mistakesCount.value >= 2 && progressiveHint.currentHintLevel.value === 0) {
        progressiveHint.requestNextHint(
          currentPuzzle.value,
          currentMoveIndex.value,
          currentFen.value
        );
      }

      options.onMistake?.(currentPuzzle.value, mistakesCount.value);
      options.onFailed?.(currentPuzzle.value, mistakesCount.value);
      return;
    }

    // Move is correct!
    selectedSquare.value = null;
    legalMoves.value = [];
    lastMove.value = { from: move.from, to: move.to };
    feedbackMessage.value = outcome.feedback;
    lastMistakeRefutation.value = null;
    if (autoAudio) audio.playMove();

    if (outcome.isPuzzleComplete) {
      currentFen.value = outcome.nextFen;
      currentMoveIndex.value = outcome.nextMoveIndex;
      isCompleted.value = true;
      isSolvedSuccessfully.value = true;
      replayStepIndex.value = replayTotalSteps.value;

      const hintsUsed = progressiveHint.hintsUsedCount.value;
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
    } else if (outcome.botReplyMove) {
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
        progressiveHint.resetHints();
      }, 450);
    }
  }

  function revealNextHint() {
    if (!currentPuzzle.value || isCompleted.value) return null;
    return progressiveHint.requestNextHint(
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
    isReplaying.value = false;
    isInspectingBoard.value = false;
    replayStepIndex.value = 0;
    progressiveHint.resetHints();
  }

  function resetCurrentAttempt() {
    resetCurrentPuzzle();
  }

  function reset() {
    resetCurrentPuzzle();
  }

  // --- Move Replay Controller Methods ---
  function stepReplayStart() {
    isReplaying.value = true;
    replayStepIndex.value = 0;
    if (autoAudio) audio.playPickup();
  }

  function stepReplayPrev() {
    isReplaying.value = true;
    if (replayStepIndex.value > 0) {
      replayStepIndex.value -= 1;
      if (autoAudio) audio.playMove();
    }
  }

  function stepReplayNext() {
    isReplaying.value = true;
    if (replayStepIndex.value < replayTotalSteps.value) {
      replayStepIndex.value += 1;
      if (autoAudio) audio.playMove();
    }
  }

  function stepReplayEnd() {
    isReplaying.value = true;
    replayStepIndex.value = replayTotalSteps.value;
    if (autoAudio) audio.playMove();
  }

  function setReplayStep(step: number) {
    isReplaying.value = true;
    replayStepIndex.value = Math.max(0, Math.min(step, replayTotalSteps.value));
  }

  function toggleInspectBoard(inspecting?: boolean) {
    if (typeof inspecting === 'boolean') {
      isInspectingBoard.value = inspecting;
    } else {
      isInspectingBoard.value = !isInspectingBoard.value;
    }
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
    hintsCount: progressiveHint.hintsCount,
    progressiveHint,

    // Replay & Board Inspection
    isReplaying: readonly(isReplaying),
    isInspectingBoard: readonly(isInspectingBoard),
    replayStepIndex: readonly(replayStepIndex),
    replaySteps,
    replayTotalSteps,
    currentReplayStep,
    currentReplaySan,
    currentStepExplanation,
    stepReplayStart,
    stepReplayPrev,
    stepReplayNext,
    stepReplayEnd,
    setReplayStep,
    toggleInspectBoard,

    clearTimers,
    loadPuzzle,
    selectSquare,
    applyPlayerMove,
    revealNextHint,
    resetCurrentPuzzle,
    resetCurrentAttempt,
    reset,
  };
}
