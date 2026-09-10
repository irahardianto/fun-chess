import { ref, computed, readonly } from 'vue';
import type {
  PuzzleProgress,
  PuzzleProgressStore,
  PuzzleTheme,
  StarRating,
  PuzzleAttemptResult,
  AdaptiveRatingState,
  ThemeMasteryProgress,
} from '@fun-chess/shared';
import { defaultLocalStoragePuzzleProgressStore } from '../store/local_storage_puzzle_progress.store';

/**
 * Reactive Pinia/Vue 3 composable for synchronizing with the PuzzleProgressStore.
 * Adheres to Rule 3 (Dependency Direction — UI depends on storage interface).
 */
export function usePuzzleProgress(customStore?: PuzzleProgressStore) {
  const store = customStore || defaultLocalStoragePuzzleProgressStore;

  const progress = ref<PuzzleProgress | null>(null);
  const isLoading = ref<boolean>(false);

  async function loadProgress(): Promise<void> {
    isLoading.value = true;
    try {
      progress.value = await store.getProgress();
    } finally {
      isLoading.value = false;
    }
  }

  const currentElo = computed<number>(
    () => progress.value?.ratingProfile.rating ?? 800
  );
  const peakElo = computed<number>(
    () => progress.value?.ratingProfile.peakRating ?? 800
  );
  const totalSolvedCount = computed<number>(
    () => Object.keys(progress.value?.solvedPuzzles ?? {}).length
  );
  const totalAttemptedCount = computed<number>(
    () => progress.value?.ratingProfile.totalAttempted ?? 0
  );
  const totalStarsEarned = computed<number>(() => {
    const solved = progress.value?.solvedPuzzles ?? {};
    return Object.values(solved).reduce((acc, p) => acc + (p.stars || 0), 0);
  });
  const maxStreak = computed<number>(
    () => progress.value?.ratingProfile.bestStreak ?? 0
  );
  const rushHighScore = computed<number>(
    () => progress.value?.arcadeStats.puzzleRushHighScore ?? 0
  );
  const rushBestStreak = computed<number>(
    () => progress.value?.arcadeStats.puzzleRushBestStreak ?? 0
  );
  const survivorHighScore = computed<number>(
    () => progress.value?.arcadeStats.streakSurvivorHighScore ?? 0
  );
  const totalRushRuns = computed<number>(
    () => progress.value?.arcadeStats.totalRushRuns ?? 0
  );

  function getThemeMastery(theme: PuzzleTheme): ThemeMasteryProgress | null {
    return progress.value?.themeMastery[theme] ?? null;
  }

  function isPuzzleSolved(puzzleId: string): boolean {
    return !!progress.value?.solvedPuzzles[puzzleId];
  }

  function getPuzzleStars(puzzleId: string): StarRating | 0 {
    return progress.value?.solvedPuzzles[puzzleId]?.stars ?? 0;
  }

  async function recordAttempt(
    puzzleId: string,
    theme: PuzzleTheme,
    result: PuzzleAttemptResult,
    stars: StarRating
  ): Promise<PuzzleProgress> {
    const updated = await store.recordPuzzleAttempt(puzzleId, theme, result, stars);
    progress.value = updated;
    return updated;
  }

  async function updateRating(newRatingState: AdaptiveRatingState): Promise<void> {
    await store.updateRating(newRatingState);
    await loadProgress();
  }

  async function saveArcadeResult(
    mode: 'puzzle_rush' | 'streak_survivor',
    score: number,
    streak: number
  ): Promise<PuzzleProgress> {
    const updated = await store.saveArcadeResult(mode, score, streak);
    progress.value = updated;
    return updated;
  }

  async function resetAll(): Promise<void> {
    await store.resetAll();
    await loadProgress();
  }

  // Auto-load on initialization
  loadProgress();

  return {
    progress: readonly(progress),
    isLoading: readonly(isLoading),
    currentElo,
    peakElo,
    totalSolvedCount,
    totalAttemptedCount,
    totalStarsEarned,
    maxStreak,
    rushHighScore,
    rushBestStreak,
    survivorHighScore,
    totalRushRuns,
    loadProgress,
    getThemeMastery,
    isPuzzleSolved,
    getPuzzleStars,
    recordAttempt,
    updateRating,
    saveArcadeResult,
    resetAll,
  };
}
