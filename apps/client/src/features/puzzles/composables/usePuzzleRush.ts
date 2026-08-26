import { ref, computed, readonly, onUnmounted, getCurrentInstance } from 'vue';
import type {
  PuzzleProgressStore,
} from '@fun-chess/shared';
import {
  calculateTimeTick,
  applyRushSolve,
  applyRushStrike,
  applySurvivorSolve,
  applySurvivorStrike,
} from '../engine/rush_engine';
import { getRandomPuzzle } from '../data/puzzle_catalog';
import { usePuzzleRunner } from './usePuzzleRunner';
import { usePuzzleProgress } from './usePuzzleProgress';

export interface UsePuzzleRushOptions {
  mode?: 'puzzle_rush' | 'streak_survivor';
  subMode?: 'puzzle_rush' | 'streak_survivor';
  customStore?: PuzzleProgressStore;
  initialDurationSeconds?: number;
  maxStrikes?: number;
}

function isPuzzleProgressStore(obj: unknown): obj is PuzzleProgressStore {
  return obj !== null && typeof obj === 'object' && typeof (obj as any).getProgress === 'function';
}

export function usePuzzleRush(options?: UsePuzzleRushOptions | PuzzleProgressStore) {
  let customStore: PuzzleProgressStore | undefined;
  let initialMode: 'puzzle_rush' | 'streak_survivor' = 'puzzle_rush';
  let initialDuration = 180;
  let maxStrikesLimit = 3;

  if (isPuzzleProgressStore(options)) {
    customStore = options;
  } else if (options && typeof options === 'object') {
    customStore = options.customStore;
    initialMode = options.subMode ?? options.mode ?? 'puzzle_rush';
    initialDuration = typeof options.initialDurationSeconds === 'number' ? options.initialDurationSeconds : 180;
    maxStrikesLimit = typeof options.maxStrikes === 'number' ? options.maxStrikes : 3;
  }

  const progressStore = usePuzzleProgress(customStore);

  const mode = ref<'puzzle_rush' | 'streak_survivor'>(initialMode);
  const timeRemainingSeconds = ref<number>(initialDuration);
  const score = ref<number>(0);
  const strikes = ref<number>(0);
  const livesRemaining = ref<number>(maxStrikesLimit);
  const currentStreak = ref<number>(0);
  const bestStreak = ref<number>(0);
  const comboMultiplier = ref<number>(1);

  const isTimerRunning = ref<boolean>(false);
  const isGameOver = ref<boolean>(false);
  const isNewHighScore = ref<boolean>(false);
  const lastTimeBonus = ref<number>(0);

  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let puzzleStartTimeMs = Date.now();

  const runner = usePuzzleRunner({
    autoPlayAudio: true,
    onSolved: () => handleRunnerSolved(),
    onMistake: () => handleRunnerFailed(),
  });

  const highScore = computed<number>(() => {
    if (mode.value === 'puzzle_rush') {
      return progressStore.rushHighScore.value;
    }
    return progressStore.survivorHighScore.value;
  });

  function clearTimer(): void {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isTimerRunning.value = false;
  }

  function startRun(selectedMode: 'puzzle_rush' | 'streak_survivor' = initialMode): void {
    clearTimer();
    mode.value = selectedMode;
    timeRemainingSeconds.value = initialDuration;
    score.value = 0;
    strikes.value = 0;
    livesRemaining.value = maxStrikesLimit;
    currentStreak.value = 0;
    bestStreak.value = 0;
    comboMultiplier.value = 1;
    isGameOver.value = false;
    isNewHighScore.value = false;
    lastTimeBonus.value = 0;

    // Load first puzzle scaled to beginner/intermediate tier
    loadNextPuzzle();

    if (selectedMode === 'puzzle_rush') {
      isTimerRunning.value = true;
      timerInterval = setInterval(() => {
        const tick = calculateTimeTick(timeRemainingSeconds.value, 1);
        timeRemainingSeconds.value = tick.timeRemainingSeconds;
        if (tick.isExpired) {
          endGame();
        }
      }, 1000);
    }
  }

  function loadNextPuzzle(): void {
    const targetRating = 600 + Math.min(1000, score.value * 35);
    const puzzle = getRandomPuzzle(undefined, targetRating);
    puzzleStartTimeMs = Date.now();
    runner.loadPuzzle(puzzle);
  }

  async function handleRunnerSolved(): Promise<void> {
    if (isGameOver.value) return;
    const solveDurationMs = Date.now() - puzzleStartTimeMs;

    if (mode.value === 'puzzle_rush') {
      const solveResult = applyRushSolve(
        score.value,
        currentStreak.value,
        highScore.value,
        solveDurationMs
      );

      score.value = solveResult.newScore;
      currentStreak.value = solveResult.newStreak;
      comboMultiplier.value = solveResult.comboMultiplier;
      lastTimeBonus.value = 5;

      // Always grant +5s bonus in blitz on solve
      timeRemainingSeconds.value += 5;

      if (solveResult.isNewHighScore) {
        isNewHighScore.value = true;
      }

      await progressStore.saveArcadeResult('puzzle_rush', score.value, currentStreak.value);
    } else {
      const solveResult = applySurvivorSolve(
        score.value,
        currentStreak.value,
        bestStreak.value
      );

      score.value = solveResult.newScore;
      currentStreak.value = solveResult.newStreak;
      bestStreak.value = solveResult.bestStreak;

      if (solveResult.isNewBestStreak) {
        isNewHighScore.value = true;
      }

      await progressStore.saveArcadeResult('streak_survivor', score.value, bestStreak.value);
    }

    setTimeout(() => {
      if (!isGameOver.value) {
        loadNextPuzzle();
      }
    }, 400);
  }

  function handleRunnerFailed(): void {
    if (isGameOver.value) return;

    if (mode.value === 'puzzle_rush') {
      const strikeResult = applyRushStrike(strikes.value, maxStrikesLimit);
      strikes.value = strikeResult.newStrikes;
      currentStreak.value = 0;
      comboMultiplier.value = 1;

      if (strikeResult.isGameOver) {
        endGame();
      } else {
        setTimeout(() => {
          if (!isGameOver.value) loadNextPuzzle();
        }, 500);
      }
    } else {
      const strikeResult = applySurvivorStrike(livesRemaining.value, maxStrikesLimit);
      livesRemaining.value = strikeResult.livesRemaining;
      strikes.value += 1;
      currentStreak.value = 0;

      if (strikeResult.isGameOver || strikes.value >= maxStrikesLimit) {
        endGame();
      } else {
        setTimeout(() => {
          if (!isGameOver.value) loadNextPuzzle();
        }, 500);
      }
    }
  }

  function endGame(): void {
    clearTimer();
    isGameOver.value = true;
  }

  function stopRun(): void {
    clearTimer();
    isGameOver.value = true;
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      clearTimer();
    });
  }

  return {
    runner,
    mode: readonly(mode),
    timeRemainingSeconds: readonly(timeRemainingSeconds),
    score: readonly(score),
    strikes: readonly(strikes),
    livesRemaining: readonly(livesRemaining),
    currentStreak: readonly(currentStreak),
    bestStreak: readonly(bestStreak),
    comboMultiplier: readonly(comboMultiplier),
    isTimerRunning: readonly(isTimerRunning),
    isGameOver: readonly(isGameOver),
    isNewHighScore: readonly(isNewHighScore),
    lastTimeBonus: readonly(lastTimeBonus),
    highScore,
    startRun,
    startRush: startRun,
    stopRun,
    stopTimer: stopRun,
    applyMove: runner.applyPlayerMove,
    selectSquare: runner.selectSquare,
    handleSolve: handleRunnerSolved,
    handleStrike: handleRunnerFailed,
    recordSolve: handleRunnerSolved,
    recordStrike: handleRunnerFailed,
    handleRunnerSolved,
    handleRunnerFailed,
  };
}
