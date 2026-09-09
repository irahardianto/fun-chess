import { ref, computed, readonly, onUnmounted, getCurrentInstance, onScopeDispose, getCurrentScope } from 'vue';
import type {
  PuzzleProgressStore,
} from '@fun-chess/shared';
import { useInjectLogger } from '@/platform/di';
import { logger as defaultLogger, type ILogger } from '@/platform/telemetry';

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
  logger?: ILogger;
}


function isPuzzleProgressStore(obj: unknown): obj is PuzzleProgressStore {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'getProgress' in obj &&
    typeof (obj as { getProgress: unknown }).getProgress === 'function'
  );
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
  const fallbackLogger = options && !isPuzzleProgressStore(options) ? options.logger : undefined;
  const logger = fallbackLogger ?? (getCurrentInstance() ? useInjectLogger(fallbackLogger) : defaultLogger) ?? defaultLogger;

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
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  let puzzleStartTimeMs = Date.now();

  function setTrackedTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      fn();
    }, ms);
    pendingTimers.add(timer);
    return timer;
  }

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

  function clearAllTimers(): void {
    clearTimer();
    for (const timer of pendingTimers) {
      clearTimeout(timer);
    }
    pendingTimers.clear();
  }

  function startRun(selectedMode: 'puzzle_rush' | 'streak_survivor' = initialMode): void {
    clearAllTimers();
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

    logger.info('Starting puzzle rush run', {
      operation: 'puzzle_rush_start',
      mode: selectedMode,
      initialDuration,
      maxStrikes: maxStrikesLimit,
    });

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
      lastTimeBonus.value = solveResult.timeBonusSeconds;

      // Only grant bonus in blitz if solve was fast (<5s)
      if (solveResult.timeBonusSeconds > 0) {
        timeRemainingSeconds.value += solveResult.timeBonusSeconds;
      }

      if (solveResult.isNewHighScore) {
        isNewHighScore.value = true;
      }

      logger.info('Puzzle solved during rush run', {
        operation: 'puzzle_rush_solve',
        mode: 'puzzle_rush',
        score: score.value,
        streak: currentStreak.value,
        comboMultiplier: comboMultiplier.value,
        timeBonusSeconds: solveResult.timeBonusSeconds,
        solveDurationMs,
        isNewHighScore: isNewHighScore.value,
      });

      logger.info('Submitting arcade score for puzzle rush', {
        operation: 'puzzle_rush_submit_score',
        mode: 'puzzle_rush',
        score: score.value,
        streak: currentStreak.value,
      });
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

      logger.info('Puzzle solved during survivor run', {
        operation: 'puzzle_survivor_solve',
        mode: 'streak_survivor',
        score: score.value,
        streak: currentStreak.value,
        bestStreak: bestStreak.value,
        solveDurationMs,
        isNewHighScore: isNewHighScore.value,
      });

      logger.info('Submitting arcade score for streak survivor', {
        operation: 'puzzle_rush_submit_score',
        mode: 'streak_survivor',
        score: score.value,
        bestStreak: bestStreak.value,
      });
      await progressStore.saveArcadeResult('streak_survivor', score.value, bestStreak.value);
    }

    setTrackedTimeout(() => {
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

      logger.warn('Puzzle mistake during rush run', {
        operation: 'puzzle_rush_mistake',
        mode: 'puzzle_rush',
        strikes: strikes.value,
        maxStrikes: maxStrikesLimit,
        isGameOver: strikeResult.isGameOver,
      });

      if (strikeResult.isGameOver) {
        endGame();
      } else {
        setTrackedTimeout(() => {
          if (!isGameOver.value) loadNextPuzzle();
        }, 500);
      }
    } else {
      const strikeResult = applySurvivorStrike(livesRemaining.value, maxStrikesLimit);
      livesRemaining.value = strikeResult.livesRemaining;
      strikes.value += 1;
      currentStreak.value = 0;

      logger.warn('Puzzle mistake during survivor run', {
        operation: 'puzzle_survivor_mistake',
        mode: 'streak_survivor',
        livesRemaining: livesRemaining.value,
        strikes: strikes.value,
        maxStrikes: maxStrikesLimit,
        isGameOver: strikeResult.isGameOver || strikes.value >= maxStrikesLimit,
      });

      if (strikeResult.isGameOver || strikes.value >= maxStrikesLimit) {
        endGame();
      } else {
        setTrackedTimeout(() => {
          if (!isGameOver.value) loadNextPuzzle();
        }, 500);
      }
    }
  }

  function endGame(): void {
    clearAllTimers();
    isGameOver.value = true;
    logger.info('Ending puzzle rush run', {
      operation: 'puzzle_rush_end',
      mode: mode.value,
      finalScore: score.value,
      finalStreak: mode.value === 'puzzle_rush' ? currentStreak.value : bestStreak.value,
      isNewHighScore: isNewHighScore.value,
    });
  }

  function stopRun(): void {
    clearAllTimers();
    isGameOver.value = true;
    logger.info('Stopping puzzle rush run manually', {
      operation: 'puzzle_rush_stop',
      mode: mode.value,
      score: score.value,
    });
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearAllTimers();
    });
  } else if (getCurrentInstance()) {
    onUnmounted(() => {
      clearAllTimers();
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
