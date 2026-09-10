import { ref, computed, readonly, getCurrentInstance } from 'vue';
import type { PuzzleProgressStore, IClock } from '@fun-chess/shared';
import { SystemClock } from '@fun-chess/shared';
import { useInjectLogger, useInjectClock } from '@/platform/di';
import { logger as defaultLogger, generateCorrelationId, type ILogger } from '@/platform/telemetry';

import {
  applyRushSolve,
  applyRushStrike,
  applySurvivorSolve,
  applySurvivorStrike,
} from '../engine/rush_engine';
import { getRandomPuzzle } from '../data/puzzle_catalog';
import { usePuzzleRunner } from './usePuzzleRunner';
import { usePuzzleProgress } from './usePuzzleProgress';
import { usePuzzleRushTimer } from './usePuzzleRushTimer';

export interface UsePuzzleRushOptions {
  mode?: 'puzzle_rush' | 'streak_survivor';
  subMode?: 'puzzle_rush' | 'streak_survivor';
  customStore?: PuzzleProgressStore;
  initialDurationSeconds?: number;
  maxStrikes?: number;
  clock?: IClock;
  logger?: ILogger;
  randomFn?: () => number;
}

function isPuzzleProgressStore(obj: unknown): obj is PuzzleProgressStore {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'getProgress' in obj &&
    typeof (obj as { getProgress: unknown }).getProgress === 'function'
  );
}

/**
 * Arcade session composable for Puzzle Rush and Streak Survivor modes (MAJ-012, MAJ-021).
 */
export function usePuzzleRush(options?: UsePuzzleRushOptions | PuzzleProgressStore) {
  let customStore: PuzzleProgressStore | undefined;
  let initialMode: 'puzzle_rush' | 'streak_survivor' = 'puzzle_rush';
  let initialDuration = 180;
  let maxStrikesLimit = 3;
  let explicitClock: IClock | undefined;
  let fallbackLogger: ILogger | undefined;
  let randomFn: (() => number) | undefined;

  if (isPuzzleProgressStore(options)) {
    customStore = options;
  } else if (options && typeof options === 'object') {
    customStore = options.customStore;
    initialMode = options.subMode ?? options.mode ?? 'puzzle_rush';
    initialDuration = typeof options.initialDurationSeconds === 'number' ? options.initialDurationSeconds : 180;
    maxStrikesLimit = typeof options.maxStrikes === 'number' ? options.maxStrikes : 3;
    explicitClock = options.clock;
    fallbackLogger = options.logger;
    randomFn = options.randomFn;
  }

  const progressStore = usePuzzleProgress(customStore);
  const logger = fallbackLogger ?? (getCurrentInstance() ? useInjectLogger(fallbackLogger) : defaultLogger) ?? defaultLogger;
  const clock = explicitClock ?? (getCurrentInstance() ? useInjectClock() : new SystemClock());

  const mode = ref<'puzzle_rush' | 'streak_survivor'>(initialMode);
  const score = ref<number>(0);
  const strikes = ref<number>(0);
  const livesRemaining = ref<number>(maxStrikesLimit);
  const currentStreak = ref<number>(0);
  const bestStreak = ref<number>(0);
  const comboMultiplier = ref<number>(1);
  const isGameOver = ref<boolean>(false);
  const isNewHighScore = ref<boolean>(false);

  let puzzleStartTimeMs = clock.now();
  let runCorrelationId = generateCorrelationId();
  let runStartTimeMs = clock.now();

  const timer = usePuzzleRushTimer({
    initialDurationSeconds: initialDuration,
    clock,
    onExpire: () => endGame(),
  });

  const runner = usePuzzleRunner({
    autoPlayAudio: true,
    clock,
    onSolved: () => handleRunnerSolved(),
    onMistake: () => handleRunnerFailed(),
  });

  const highScore = computed<number>(() => {
    return mode.value === 'puzzle_rush'
      ? progressStore.rushHighScore.value
      : progressStore.survivorHighScore.value;
  });

  function startRun(selectedMode: 'puzzle_rush' | 'streak_survivor' = initialMode): void {
    timer.clearAllTimers();
    runCorrelationId = generateCorrelationId();
    runStartTimeMs = clock.now();
    mode.value = selectedMode;
    score.value = 0;
    strikes.value = 0;
    livesRemaining.value = maxStrikesLimit;
    currentStreak.value = 0;
    bestStreak.value = 0;
    comboMultiplier.value = 1;
    isGameOver.value = false;
    isNewHighScore.value = false;

    logger.info('Starting puzzle rush run', {
      operation: 'puzzle_rush_start',
      correlationId: runCorrelationId,
      durationMs: 0,
      mode: selectedMode,
      initialDuration,
      maxStrikes: maxStrikesLimit,
    });

    loadNextPuzzle();

    if (selectedMode === 'puzzle_rush') {
      timer.startTimer(initialDuration);
    } else {
      timer.resetTimer(initialDuration);
    }
  }

  function loadNextPuzzle(): void {
    const targetRating = 600 + Math.min(1000, score.value * 35);
    const puzzle = getRandomPuzzle(undefined, targetRating, randomFn);
    puzzleStartTimeMs = clock.now();
    runner.loadPuzzle(puzzle);
  }

  async function handleRunnerSolved(): Promise<void> {
    if (isGameOver.value) return;
    const solveDurationMs = clock.now() - puzzleStartTimeMs;
    const runDurationMs = Math.round(clock.now() - runStartTimeMs);

    if (mode.value === 'puzzle_rush') {
      const solveResult = applyRushSolve(score.value, currentStreak.value, highScore.value, solveDurationMs);
      score.value = solveResult.newScore;
      currentStreak.value = solveResult.newStreak;
      comboMultiplier.value = solveResult.comboMultiplier;
      timer.addTimeBonus(solveResult.timeBonusSeconds);

      if (solveResult.isNewHighScore) isNewHighScore.value = true;

      logger.info('Puzzle solved during rush run', {
        operation: 'puzzle_rush_solve',
        correlationId: runCorrelationId,
        durationMs: runDurationMs,
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
        correlationId: runCorrelationId,
        durationMs: runDurationMs,
        mode: 'puzzle_rush',
        score: score.value,
        streak: currentStreak.value,
      });
      await progressStore.saveArcadeResult('puzzle_rush', score.value, currentStreak.value);
    } else {
      const solveResult = applySurvivorSolve(score.value, currentStreak.value, bestStreak.value);
      score.value = solveResult.newScore;
      currentStreak.value = solveResult.newStreak;
      bestStreak.value = solveResult.bestStreak;

      if (solveResult.isNewBestStreak) isNewHighScore.value = true;

      logger.info('Puzzle solved during survivor run', {
        operation: 'puzzle_survivor_solve',
        correlationId: runCorrelationId,
        durationMs: runDurationMs,
        mode: 'streak_survivor',
        score: score.value,
        streak: currentStreak.value,
        bestStreak: bestStreak.value,
        solveDurationMs,
        isNewHighScore: isNewHighScore.value,
      });

      logger.info('Submitting arcade score for streak survivor', {
        operation: 'puzzle_rush_submit_score',
        correlationId: runCorrelationId,
        durationMs: runDurationMs,
        mode: 'streak_survivor',
        score: score.value,
        bestStreak: bestStreak.value,
      });
      await progressStore.saveArcadeResult('streak_survivor', score.value, bestStreak.value);
    }

    timer.setTrackedTimeout(() => {
      if (!isGameOver.value) loadNextPuzzle();
    }, 400);
  }

  function handleRunnerFailed(): void {
    if (isGameOver.value) return;
    const runDurationMs = Math.round(clock.now() - runStartTimeMs);

    if (mode.value === 'puzzle_rush') {
      const strikeResult = applyRushStrike(strikes.value, maxStrikesLimit);
      strikes.value = strikeResult.newStrikes;
      currentStreak.value = 0;
      comboMultiplier.value = 1;

      logger.warn('Puzzle mistake during rush run', {
        operation: 'puzzle_rush_mistake',
        correlationId: runCorrelationId,
        durationMs: runDurationMs,
        mode: 'puzzle_rush',
        strikes: strikes.value,
        maxStrikes: maxStrikesLimit,
        isGameOver: strikeResult.isGameOver,
      });

      if (strikeResult.isGameOver) {
        endGame();
      } else {
        timer.setTrackedTimeout(() => {
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
        correlationId: runCorrelationId,
        durationMs: runDurationMs,
        mode: 'streak_survivor',
        livesRemaining: livesRemaining.value,
        strikes: strikes.value,
        maxStrikes: maxStrikesLimit,
        isGameOver: strikeResult.isGameOver || strikes.value >= maxStrikesLimit,
      });

      if (strikeResult.isGameOver || strikes.value >= maxStrikesLimit) {
        endGame();
      } else {
        timer.setTrackedTimeout(() => {
          if (!isGameOver.value) loadNextPuzzle();
        }, 500);
      }
    }
  }

  function endGame(): void {
    timer.clearAllTimers();
    isGameOver.value = true;
    const durationMs = Math.round(clock.now() - runStartTimeMs);
    logger.info('Ending puzzle rush run', {
      operation: 'puzzle_rush_end',
      correlationId: runCorrelationId,
      durationMs,
      mode: mode.value,
      finalScore: score.value,
      finalStreak: mode.value === 'puzzle_rush' ? currentStreak.value : bestStreak.value,
      isNewHighScore: isNewHighScore.value,
    });
  }

  function stopRun(): void {
    timer.clearAllTimers();
    isGameOver.value = true;
    const durationMs = Math.round(clock.now() - runStartTimeMs);
    logger.info('Stopping puzzle rush run manually', {
      operation: 'puzzle_rush_stop',
      correlationId: runCorrelationId,
      durationMs,
      mode: mode.value,
      score: score.value,
    });
  }

  return {
    runner,
    correlationId: computed(() => runCorrelationId),
    mode: readonly(mode),
    timeRemainingSeconds: timer.timeRemainingSeconds,
    score: readonly(score),
    strikes: readonly(strikes),
    livesRemaining: readonly(livesRemaining),
    currentStreak: readonly(currentStreak),
    bestStreak: readonly(bestStreak),
    comboMultiplier: readonly(comboMultiplier),
    isTimerRunning: timer.isTimerRunning,
    isGameOver: readonly(isGameOver),
    isNewHighScore: readonly(isNewHighScore),
    lastTimeBonus: timer.lastTimeBonus,
    highScore,
    startRun,
    startRush: startRun,
    stopRun,
    stopTimer: stopRun,
    endGame,
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

export type UsePuzzleRushReturn = ReturnType<typeof usePuzzleRush>;
