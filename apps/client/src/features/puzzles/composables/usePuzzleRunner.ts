import { ref, computed, readonly, onUnmounted, getCurrentInstance } from 'vue';
import { Chess } from 'chess.js';
import type {
  Puzzle,
  Square,
  PieceColor,
  StarRating,
  PlayerMoveAction,
  PuzzleAttemptResult,
} from '@fun-chess/shared';
import { validatePuzzleMove } from '../engine/puzzle_validator';
import { calculatePuzzleStars } from '../engine/star_calculator';
import { useProgressiveHint } from './useProgressiveHint';
import { useAudio } from '../../../composables/useAudio';

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
  const attemptResult = ref<PuzzleAttemptResult>('unsolved');

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
    attemptResult.value = 'unsolved';
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
    if (autoAudio) audio.playMove();

    if (outcome.isPuzzleComplete) {
      currentFen.value = outcome.nextFen;
      currentMoveIndex.value = outcome.nextMoveIndex;
      isCompleted.value = true;
      isSolvedSuccessfully.value = true;

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
      // Advance to interim FEN before bot reply, then apply bot reply after realistic kid pacing
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
    progressiveHint.resetHints();
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
    currentMoveIndex: readonly(currentMoveIndex),
    selectedSquare: readonly(selectedSquare),
    legalMoves: readonly(legalMoves),
    lastMove: readonly(lastMove),
    isCompleted: readonly(isCompleted),
    isSolvedSuccessfully: readonly(isSolvedSuccessfully),
    isWaitingForBot: readonly(isWaitingForBot),
    isPlayerTurn,
    isShaking: readonly(isShaking),
    mistakesCount: readonly(mistakesCount),
    feedbackMessage: readonly(feedbackMessage),
    attemptResult: readonly(attemptResult),
    playerColor,
    calculatedStars,
    hintsCount: progressiveHint.hintsCount,
    progressiveHint,
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
