import type { StarRating } from '@fun-chess/shared';

/**
 * Pure calculation logic for assigning a 1 to 3 star rating to a completed puzzle attempt.
 * Adheres to Rule 2 (Pure Business Logic — zero framework, zero I/O).
 *
 * Scoring Criteria:
 * - 3 Stars: Solved cleanly with 0 hints used AND 0 mistakes.
 * - 2 Stars: Solved using <= 1 hint AND <= 1 mistake (with at least 1 hint or 1 mistake).
 * - 1 Star:  Solved using 2+ hints OR 2+ mistakes (always awards at least 1 star for completion).
 *
 * @param hintsUsed - Number of hints requested during the attempt
 * @param mistakesCount - Number of incorrect moves played
 * @returns StarRating (1, 2, or 3)
 */
export function calculatePuzzleStars(hintsUsed: number, mistakesCount: number = 0): StarRating {
  const safeHints = Math.max(0, hintsUsed);
  const safeMistakes = Math.max(0, mistakesCount);

  if (safeHints === 0 && safeMistakes === 0) {
    return 3;
  }

  if (safeHints <= 1 && safeMistakes <= 1) {
    return 2;
  }

  return 1;
}

/**
 * Computes accuracy percentage for a drill session or run given mistakes.
 */
export function calculateAccuracy(totalPuzzles: number, mistakesCount: number): number {
  const safeTotal = Math.max(1, totalPuzzles);
  const safeMistakes = Math.max(0, mistakesCount);

  if (safeMistakes === 0) return 100;

  const ratio = safeTotal / (safeTotal + safeMistakes);
  return Math.max(10, Math.min(100, Math.round(ratio * 100)));
}

/**
 * Computes accuracy percentage given solved count and total attempts.
 */
export function calculateAccuracyPercent(solved: number, total: number): number {
  if (total <= 0) return 100;
  const safeSolved = Math.max(0, solved);
  return Math.max(0, Math.min(100, Math.round((safeSolved / total) * 100)));
}
