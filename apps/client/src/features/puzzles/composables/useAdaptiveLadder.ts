import { ref, computed, readonly, onScopeDispose, getCurrentScope, onUnmounted, getCurrentInstance } from 'vue';
import type { Puzzle, StarRating, PuzzleProgressStore } from '@fun-chess/shared';
import {
  calculateAdaptiveRatingAdjustment,
  selectTargetPuzzleRating,
  getRankTierForElo,
  type RankTierInfo,
} from '../engine/adaptive_rating';
import { ALL_PUZZLES } from '../data/puzzle_catalog';
import { usePuzzleProgress } from './usePuzzleProgress';
import { usePuzzleRunner } from './usePuzzleRunner';
import { logger } from '@/platform/telemetry';

export function useAdaptiveLadder(customStore?: PuzzleProgressStore) {
  const progressModule = usePuzzleProgress(customStore);

  const currentStreak = ref<number>(0);
  const currentPuzzle = ref<Puzzle | null>(null);
  const ratingDeltaAnim = ref<number | null>(null);
  const lastRatingDelta = ref<number>(0);

  let ratingDeltaTimer: ReturnType<typeof setTimeout> | null = null;

  function clearRatingDeltaTimer(): void {
    if (ratingDeltaTimer) {
      clearTimeout(ratingDeltaTimer);
      ratingDeltaTimer = null;
    }
  }

  const currentElo = computed<number>(() => progressModule.currentElo.value);
  const playerRating = computed<number>(() => progressModule.currentElo.value);
  const rankTier = computed<RankTierInfo>(() => getRankTierForElo(currentElo.value));
  const currentTier = computed<RankTierInfo>(() => getRankTierForElo(currentElo.value));

  const targetRating = computed<number>(() => {
    return selectTargetPuzzleRating(currentElo.value, currentStreak.value);
  });

  const runner = usePuzzleRunner({
    onSolve: (puzzle, stars, hintsUsed, _mistakes) => {
      handleSolve(puzzle, stars, hintsUsed).catch((err: unknown) => {
        logger.warn('Failed to handle ladder solve', {
          operation: 'adaptive_ladder_solve',
          puzzleId: puzzle.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    },
  });

  function pickNextLadderPuzzle(): Puzzle {
    const target = targetRating.value;
    const pool = ALL_PUZZLES.length > 0 ? ALL_PUZZLES : [];
    const sorted = [...pool].sort(
      (a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target)
    );
    const chosen = sorted[0] || ALL_PUZZLES[0]!;
    currentPuzzle.value = chosen;
    runner.loadPuzzle(chosen);
    return chosen;
  }

  function startLadder() {
    pickNextLadderPuzzle();
  }

  async function handleSolve(puzzle: Puzzle, stars: StarRating, hintsUsed: number) {
    currentStreak.value = currentStreak.value >= 0 ? currentStreak.value + 1 : 1;

    const rd = progressModule.progress.value?.ratingProfile.ratingDeviation ?? 350;
    const adjustment = calculateAdaptiveRatingAdjustment({
      playerRating: currentElo.value,
      playerRd: rd,
      puzzleRating: puzzle.rating,
      isSuccess: true,
      hintsUsed,
      currentStreak: currentStreak.value,
    });

    ratingDeltaAnim.value = adjustment.delta;
    lastRatingDelta.value = adjustment.delta;
    clearRatingDeltaTimer();
    ratingDeltaTimer = setTimeout(() => {
      ratingDeltaAnim.value = null;
      ratingDeltaTimer = null;
    }, 1800);

    const oldProfile = progressModule.progress.value?.ratingProfile;
    const newProfile = {
      rating: adjustment.newRating,
      ratingDeviation: adjustment.newRd,
      peakRating: Math.max(oldProfile?.peakRating ?? 800, adjustment.newRating),
      totalAttempted: (oldProfile?.totalAttempted ?? 0) + 1,
      totalSolved: (oldProfile?.totalSolved ?? 0) + 1,
      bestStreak: Math.max(oldProfile?.bestStreak ?? 0, currentStreak.value),
      ratingHistory: [
        ...(oldProfile?.ratingHistory ?? []),
        {
          timestamp: Date.now(),
          rating: adjustment.newRating,
          puzzleId: puzzle.id,
          delta: adjustment.delta,
        },
      ].slice(-50),
    };

    await progressModule.updateRating(newProfile);
    await progressModule.recordAttempt(puzzle.id, puzzle.primaryTheme, 'solved_first_try', stars);
  }

  async function handleSkipOrFail(puzzle: Puzzle) {
    currentStreak.value = currentStreak.value <= 0 ? currentStreak.value - 1 : -1;

    const rd = progressModule.progress.value?.ratingProfile.ratingDeviation ?? 350;
    const adjustment = calculateAdaptiveRatingAdjustment({
      playerRating: currentElo.value,
      playerRd: rd,
      puzzleRating: puzzle.rating,
      isSuccess: false,
      hintsUsed: 0,
      currentStreak: currentStreak.value,
    });

    ratingDeltaAnim.value = adjustment.delta;
    lastRatingDelta.value = adjustment.delta;
    clearRatingDeltaTimer();
    ratingDeltaTimer = setTimeout(() => {
      ratingDeltaAnim.value = null;
      ratingDeltaTimer = null;
    }, 1800);

    const oldProfile = progressModule.progress.value?.ratingProfile;
    const newProfile = {
      rating: adjustment.newRating,
      ratingDeviation: adjustment.newRd,
      peakRating: oldProfile?.peakRating ?? 800,
      totalAttempted: (oldProfile?.totalAttempted ?? 0) + 1,
      totalSolved: oldProfile?.totalSolved ?? 0,
      bestStreak: oldProfile?.bestStreak ?? 0,
      ratingHistory: [
        ...(oldProfile?.ratingHistory ?? []),
        {
          timestamp: Date.now(),
          rating: adjustment.newRating,
          puzzleId: puzzle.id,
          delta: adjustment.delta,
        },
      ].slice(-50),
    };

    await progressModule.updateRating(newProfile);
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearRatingDeltaTimer();
    });
  } else if (getCurrentInstance()) {
    onUnmounted(() => {
      clearRatingDeltaTimer();
    });
  }

  // Pick initial puzzle
  pickNextLadderPuzzle();

  return {
    currentElo,
    playerRating,
    rankTier,
    currentTier,
    currentStreak: readonly(currentStreak),
    currentPuzzle: readonly(currentPuzzle),
    targetRating,
    ratingDeltaAnim: readonly(ratingDeltaAnim),
    lastRatingDelta: readonly(lastRatingDelta),
    runner,
    startLadder,
    pickNextLadderPuzzle,
    handleSolve,
    handleSolved: (puzzle: Puzzle, stars: StarRating, hints: number, _mistakes: number) =>
      handleSolve(puzzle, stars, hints),
    handleSkipOrFail,
    handleFailed: (puzzle: Puzzle) => handleSkipOrFail(puzzle),
  };
}
