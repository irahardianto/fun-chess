import type { StarRating } from '@fun-chess/shared';

/**
 * Pure calculation logic for assigning a 1 to 3 star rating to a completed scenario attempt.
 * Adheres to Rule 2 (Pure Business Logic — zero framework, zero I/O).
 *
 * Scoring Rules:
 * - 3 Stars: 0 hints used AND 0 mistakes/retries.
 * - 2 Stars: <= 1 hint used AND <= 1 mistake/retry (with at least 1 hint or 1 mistake).
 * - 1 Star:  2+ hints used OR 2+ mistakes/retries (always awards at least 1 star for completion).
 *
 * @param hintsUsed - Number of hints requested during the attempt
 * @param mistakesOrRetries - Number of incorrect moves or step resets during the attempt
 * @returns StarRating (1, 2, or 3)
 */
export function calculateStars(hintsUsed: number, mistakesOrRetries: number = 0): StarRating {
  const safeHints = Math.max(0, hintsUsed);
  const safeMistakes = Math.max(0, mistakesOrRetries);

  if (safeHints === 0 && safeMistakes === 0) {
    return 3;
  }

  if (safeHints <= 1 && safeMistakes <= 1) {
    return 2;
  }

  return 1;
}

/**
 * Computes accuracy percentage for a completed scenario run.
 *
 * @param totalSteps - Total number of steps in the scenario
 * @param mistakesCount - Total incorrect moves played
 * @returns Accuracy percentage (0 - 100)
 */
export function calculateAccuracy(totalSteps: number, mistakesCount: number): number {
  const safeTotal = Math.max(1, totalSteps);
  const safeMistakes = Math.max(0, mistakesCount);

  if (safeMistakes === 0) return 100;

  const ratio = safeTotal / (safeTotal + safeMistakes);
  return Math.max(10, Math.min(100, Math.round(ratio * 100)));
}
