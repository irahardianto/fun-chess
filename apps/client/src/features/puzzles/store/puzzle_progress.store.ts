import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  PuzzleProgress,
  PuzzleProgressStore,
  AdaptiveRatingState,
  PuzzleTheme,
  PuzzleAttemptResult,
  StarRating,
  ThemeMasteryProgress,
  PuzzleArcadeStats,
  SolvedPuzzleRecord,
  IClock,
} from '@fun-chess/shared';
import { SystemClock } from '@fun-chess/shared';
import { STORAGE_KEYS } from '@/platform/storage';

export const PUZZLE_PROGRESS_STORAGE_KEY = STORAGE_KEYS.PUZZLE_PROGRESS_V2;

export const DEFAULT_ADAPTIVE_RATING: AdaptiveRatingState = {
  rating: 800,
  ratingDeviation: 350,
  peakRating: 800,
  totalAttempted: 0,
  totalSolved: 0,
  bestStreak: 0,
  ratingHistory: [],
};

/**
 * Factory creating deterministic initial puzzle progress state.
 * Accepts an optional IClock to guarantee test reproducibility (MIN-010).
 */
export function createDefaultPuzzleProgress(clock: IClock = new SystemClock()): PuzzleProgress {
  const timestamp = clock.now();
  return {
    ratingProfile: { ...DEFAULT_ADAPTIVE_RATING },
    themeMastery: {},
    arcadeStats: {
      puzzleRushHighScore: 0,
      puzzleRushBestStreak: 0,
      streakSurvivorHighScore: 0,
      totalRushRuns: 0,
    },
    solvedPuzzles: {},
    createdAt: timestamp,
    lastActiveAt: timestamp,
  };
}

/**
 * @deprecated Use createDefaultPuzzleProgress(clock) instead (MIN-010).
 * Preserved as an immutable frozen snapshot with deterministic timestamp 0 for backwards compatibility.
 */
export const DEFAULT_PUZZLE_PROGRESS: Readonly<PuzzleProgress> = Object.freeze(
  createDefaultPuzzleProgress({ now: () => 0 })
);

/**
 * Pinia Setup Store managing reactive client puzzle progress state (MAJ-018 & MIN-010).
 * Replaces uncoordinated repositories and module singletons with a standard Pinia setup store.
 */
export const usePuzzleProgressStore = defineStore('puzzle-progress', () => {
  const progress = ref<PuzzleProgress>(createDefaultPuzzleProgress());
  const isLoaded = ref<boolean>(false);
  const isSaving = ref<boolean>(false);

  // Getters (computed)
  const currentRating = computed<number>(() => progress.value.ratingProfile.rating);
  const peakRating = computed<number>(() => progress.value.ratingProfile.peakRating);
  const totalSolved = computed<number>(() => Object.keys(progress.value.solvedPuzzles).length);
  const totalAttempted = computed<number>(() => progress.value.ratingProfile.totalAttempted);
  const rushHighScore = computed<number>(() => progress.value.arcadeStats.puzzleRushHighScore);
  const rushBestStreak = computed<number>(() => progress.value.arcadeStats.puzzleRushBestStreak);
  const survivorHighScore = computed<number>(() => progress.value.arcadeStats.streakSurvivorHighScore);
  const totalRushRuns = computed<number>(() => progress.value.arcadeStats.totalRushRuns);

  // Actions
  function setProgress(newProgress: PuzzleProgress): void {
    progress.value = newProgress;
    isLoaded.value = true;
  }

  function updateRating(newRatingState: AdaptiveRatingState, clock: IClock = new SystemClock()): void {
    const now = clock.now();
    progress.value = {
      ...progress.value,
      ratingProfile: {
        ...newRatingState,
        peakRating: Math.max(progress.value.ratingProfile.peakRating, newRatingState.rating),
      },
      lastActiveAt: now,
    };
  }

  function recordAttempt(
    puzzleId: string,
    theme: PuzzleTheme,
    result: PuzzleAttemptResult,
    stars: StarRating,
    clock?: IClock
  ): PuzzleProgress;
  function recordAttempt(
    result: PuzzleAttemptResult,
    clock?: IClock
  ): void;
  function recordAttempt(
    arg1: string | PuzzleAttemptResult,
    arg2?: PuzzleTheme | IClock,
    arg3?: PuzzleAttemptResult,
    arg4?: StarRating,
    arg5: IClock = new SystemClock()
  ): PuzzleProgress | void {
    if (typeof arg4 === 'number') {
      const puzzleId = arg1 as string;
      const theme = arg2 as PuzzleTheme;
      const result = arg3 as PuzzleAttemptResult;
      const stars = arg4;
      const clock = arg5;

      const isSuccess = result.startsWith('solved');
      const now = clock.now();

      const newSolvedPuzzles = { ...progress.value.solvedPuzzles };
      if (isSuccess) {
        const existing = newSolvedPuzzles[puzzleId];
        newSolvedPuzzles[puzzleId] = {
          stars: existing ? (Math.max(existing.stars, stars) as StarRating) : stars,
          solvedAt: now,
        };
      }

      const newRatingProfile: AdaptiveRatingState = {
        ...progress.value.ratingProfile,
        totalAttempted: progress.value.ratingProfile.totalAttempted + 1,
        totalSolved: progress.value.ratingProfile.totalSolved + (isSuccess ? 1 : 0),
      };

      const existingTheme = progress.value.themeMastery[theme] || {
        theme,
        attempted: 0,
        solved: 0,
        starsEarned: 0,
        masteryLevel: 'novice' as const,
        lastPracticedAt: now,
      };

      const newSolved = existingTheme.solved + (isSuccess ? 1 : 0);
      const newAttempted = existingTheme.attempted + 1;
      const masteryLevel: 'novice' | 'apprentice' | 'master' =
        newSolved >= 20 ? 'master' : newSolved >= 8 ? 'apprentice' : 'novice';

      const newThemeMastery = {
        ...progress.value.themeMastery,
        [theme]: {
          theme,
          attempted: newAttempted,
          solved: newSolved,
          starsEarned: existingTheme.starsEarned + (isSuccess ? stars : 0),
          masteryLevel,
          lastPracticedAt: now,
        },
      };

      progress.value = {
        ...progress.value,
        solvedPuzzles: newSolvedPuzzles,
        ratingProfile: newRatingProfile,
        themeMastery: newThemeMastery,
        lastActiveAt: now,
      };

      return progress.value;
    }

    const result = arg1 as PuzzleAttemptResult;
    const clock = (arg2 && typeof arg2 === 'object' && 'now' in arg2 ? arg2 : new SystemClock()) as IClock;
    const now = clock.now();
    const isSuccess = typeof result === 'string' && result.startsWith('solved');
    progress.value = {
      ...progress.value,
      ratingProfile: {
        ...progress.value.ratingProfile,
        totalAttempted: progress.value.ratingProfile.totalAttempted + 1,
        totalSolved: progress.value.ratingProfile.totalSolved + (isSuccess ? 1 : 0),
      },
      lastActiveAt: now,
    };
  }

  function saveArcadeResult(
    mode: 'puzzle_rush' | 'streak_survivor',
    score: number,
    streak: number,
    clock: IClock = new SystemClock()
  ): PuzzleProgress {
    const now = clock.now();
    const newArcade = { ...progress.value.arcadeStats };

    if (mode === 'puzzle_rush') {
      newArcade.puzzleRushHighScore = Math.max(newArcade.puzzleRushHighScore, score);
      newArcade.puzzleRushBestStreak = Math.max(newArcade.puzzleRushBestStreak, streak);
      newArcade.totalRushRuns += 1;
    } else {
      newArcade.streakSurvivorHighScore = Math.max(newArcade.streakSurvivorHighScore, score);
    }

    progress.value = {
      ...progress.value,
      arcadeStats: newArcade,
      lastActiveAt: now,
    };

    return progress.value;
  }

  function restoreProgress(newProgress: PuzzleProgress, clock: IClock = new SystemClock()): void {
    const defaultProgress = createDefaultPuzzleProgress(clock);
    const now = clock.now();
    progress.value = {
      ...defaultProgress,
      ...newProgress,
      ratingProfile: {
        ...DEFAULT_ADAPTIVE_RATING,
        ...(newProgress?.ratingProfile || {}),
      },
      themeMastery: { ...(newProgress?.themeMastery || {}) },
      arcadeStats: {
        ...defaultProgress.arcadeStats,
        ...(newProgress?.arcadeStats || {}),
      },
      solvedPuzzles: { ...(newProgress?.solvedPuzzles || {}) },
      createdAt: typeof newProgress?.createdAt === 'number' ? newProgress.createdAt : now,
      lastActiveAt: typeof newProgress?.lastActiveAt === 'number' ? newProgress.lastActiveAt : now,
    };
    isLoaded.value = true;
  }

  function resetState(clock: IClock = new SystemClock()): void {
    progress.value = createDefaultPuzzleProgress(clock);
    isLoaded.value = false;
  }

  return {
    progress,
    isLoaded,
    isSaving,
    currentRating,
    peakRating,
    totalSolved,
    totalAttempted,
    rushHighScore,
    rushBestStreak,
    survivorHighScore,
    totalRushRuns,
    setProgress,
    updateRating,
    recordAttempt,
    recordPuzzleAttempt: recordAttempt,
    saveArcadeResult,
    restoreProgress,
    resetState,
    resetAll: resetState,
    $reset: resetState,
  };
});

export type {
  PuzzleProgress,
  PuzzleProgressStore,
  AdaptiveRatingState,
  PuzzleTheme,
  PuzzleAttemptResult,
  StarRating,
  ThemeMasteryProgress,
  PuzzleArcadeStats,
  SolvedPuzzleRecord,
};
