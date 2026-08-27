import type {
  RushTickResult,
  RushSolveResult,
  RushStrikeResult,
  PuzzleRushRules,
} from '@fun-chess/shared';

export const RUSH_DEFAULT_DURATION_SECONDS = 180;
export const RUSH_MAX_STRIKES = 3;

export interface SurvivorSolveResult {
  readonly newScore: number;
  readonly newStreak: number;
  readonly bestStreak: number;
  readonly isNewBestStreak: boolean;
}

export interface SurvivorStrikeResult {
  readonly livesRemaining: number;
  readonly isGameOver: boolean;
  readonly streakReset: boolean;
}

export type FlameStage = 'none' | 'spark' | 'blaze' | 'inferno';

export function getComboMultiplier(streak: number): number {
  if (streak >= 5) return 3;
  if (streak >= 2) return 2;
  return 1;
}

export function getFlameStage(streak: number): FlameStage {
  if (streak >= 6) return 'inferno';
  if (streak >= 4) return 'blaze';
  if (streak >= 2) return 'spark';
  return 'none';
}

export function getFlameLabel(streak: number): string {
  const stage = getFlameStage(streak);
  switch (stage) {
    case 'inferno':
      return '🔥 Inferno Streak (3x)';
    case 'blaze':
      return '⚡ On Fire (2x)';
    case 'spark':
      return '✨ Streak Active';
    default:
      return '';
  }
}

/**
 * Pure calculation logic for Puzzle Rush and Streak Survivor arcade game modes.
 * Adheres to Rule 2 (Pure Business Logic — zero framework, zero I/O).
 */
export class PurePuzzleRushRules implements PuzzleRushRules {
  /**
   * Advances the countdown timer tick.
   */
  public calculateTimeTick(currentSeconds: number, deltaSeconds: number): RushTickResult {
    const timeRemainingSeconds = Math.max(0, Math.round((currentSeconds - deltaSeconds) * 10) / 10);
    return {
      timeRemainingSeconds,
      isExpired: timeRemainingSeconds <= 0,
    };
  }

  /**
   * Evaluates a correct solve in Puzzle Rush mode:
   * - Calculates score & streak increment
   * - Multiplies combo bonus (1x at 1 streak, 2x at 2-4 streak, 3x at 5+ streak)
   * - Grants +5s speed bonus on fast solves under 5 seconds with an active streak
   */
  public applySolve(
    currentScore: number,
    currentStreak: number,
    highScore: number,
    solveTimeMs: number = 0
  ): RushSolveResult {
    const newScore = currentScore + 1;
    const newStreak = currentStreak + 1;
    const comboMultiplier = getComboMultiplier(newStreak);

    // Fast solve bonus: if solveTime is under 5s (or not specified / default 0)
    const isFastSolve = solveTimeMs === 0 || (solveTimeMs > 0 && solveTimeMs <= 5000);
    const timeBonusSeconds = isFastSolve ? 5 : 0;
    const isNewHighScore = newScore > highScore;

    return {
      newScore,
      newStreak,
      comboMultiplier,
      timeBonusSeconds,
      isNewHighScore,
    };
  }

  /**
   * Evaluates a strike in Puzzle Rush mode:
   * - Increments strike counter
   * - Checks game over threshold (default 3 strikes)
   * - Resets active streak multiplier
   */
  public applyStrike(currentStrikes: number, maxStrikes: number = 3): RushStrikeResult {
    const newStrikes = currentStrikes + 1;
    return {
      newStrikes,
      isGameOver: newStrikes >= maxStrikes,
      comboReset: true,
    };
  }

  /**
   * Evaluates a solve in Streak Survivor mode.
   */
  public applySurvivorSolve(
    currentScore: number,
    currentStreak: number,
    bestStreak: number
  ): SurvivorSolveResult {
    const newScore = currentScore + 1;
    const newStreak = currentStreak + 1;
    const isNewBestStreak = newStreak > bestStreak;
    return {
      newScore,
      newStreak,
      bestStreak: Math.max(bestStreak, newStreak),
      isNewBestStreak,
    };
  }

  /**
   * Evaluates a lost life in Streak Survivor mode.
   */
  public applySurvivorStrike(
    currentLives: number,
    _maxLives: number = 3
  ): SurvivorStrikeResult {
    const livesRemaining = Math.max(0, currentLives - 1);
    return {
      livesRemaining,
      isGameOver: livesRemaining <= 0,
      streakReset: true,
    };
  }
}

export const defaultRushRules = new PurePuzzleRushRules();

export function calculateTimeTick(currentSeconds: number, deltaSeconds: number): RushTickResult {
  return defaultRushRules.calculateTimeTick(currentSeconds, deltaSeconds);
}

export const calculateRushTimeTick = calculateTimeTick;

export function applyRushSolve(
  currentScore: number,
  currentStreak: number,
  highScore: number,
  solveTimeMs: number = 0
): RushSolveResult {
  return defaultRushRules.applySolve(currentScore, currentStreak, highScore, solveTimeMs);
}

export function applyRushStrike(
  currentStrikes: number,
  maxStrikes: number = 3
): RushStrikeResult {
  return defaultRushRules.applyStrike(currentStrikes, maxStrikes);
}

export function applySurvivorSolve(
  currentScore: number,
  currentStreak: number,
  bestStreak: number
): SurvivorSolveResult {
  return defaultRushRules.applySurvivorSolve(currentScore, currentStreak, bestStreak);
}

export function applySurvivorStrike(
  currentLives: number,
  maxLives: number = 3
): SurvivorStrikeResult {
  return defaultRushRules.applySurvivorStrike(currentLives, maxLives);
}
