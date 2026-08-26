import type {
  PuzzleProgress,
  PuzzleProgressStore,
  AdaptiveRatingState,
  PuzzleTheme,
  PuzzleAttemptResult,
  StarRating,
  SolvedPuzzleRecord,
} from '@fun-chess/shared';
import {
  PUZZLE_PROGRESS_STORAGE_KEY,
  DEFAULT_ADAPTIVE_RATING,
  DEFAULT_PUZZLE_PROGRESS,
} from './puzzle_progress.store';

export { PUZZLE_PROGRESS_STORAGE_KEY };

/**
 * Robust LocalStorage implementation of PuzzleProgressStore.
 * Adheres to Rule 1 (I/O Isolation) and Rugged Software Mandates:
 * - Defensive JSON parsing with automatic recovery on corrupt storage
 * - Runtime type narrowing and sanitization of numerical and object properties
 * - Seamless fallback to in-memory state on quota errors or SSR environments
 */
export class LocalStoragePuzzleProgressStore implements PuzzleProgressStore {
  private memoryCache: PuzzleProgress;
  private readonly storageKey: string;

  constructor(storageKey: string = PUZZLE_PROGRESS_STORAGE_KEY) {
    this.storageKey = storageKey;
    this.memoryCache = {
      ...DEFAULT_PUZZLE_PROGRESS,
      ratingProfile: { ...DEFAULT_ADAPTIVE_RATING },
      themeMastery: {},
      arcadeStats: { ...DEFAULT_PUZZLE_PROGRESS.arcadeStats },
      solvedPuzzles: {},
    };
  }

  private isStorageAvailable(): boolean {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return false;
    }
    try {
      const testKey = `__fc_puz_test_${Date.now()}__`;
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  private sanitizeProgress(raw: unknown): PuzzleProgress {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ...DEFAULT_PUZZLE_PROGRESS };
    }
    const data = raw as Record<string, any>;

    const rawProfile = data.ratingProfile;
    const ratingProfile: AdaptiveRatingState = {
      rating:
        typeof rawProfile?.rating === 'number' && !isNaN(rawProfile.rating)
          ? Math.max(500, Math.round(rawProfile.rating))
          : 800,
      ratingDeviation:
        typeof rawProfile?.ratingDeviation === 'number' && !isNaN(rawProfile.ratingDeviation)
          ? Math.max(50, Math.round(rawProfile.ratingDeviation))
          : 350,
      peakRating:
        typeof rawProfile?.peakRating === 'number' && !isNaN(rawProfile.peakRating)
          ? Math.max(500, Math.round(rawProfile.peakRating))
          : 800,
      totalAttempted:
        typeof rawProfile?.totalAttempted === 'number' && rawProfile.totalAttempted >= 0
          ? Math.round(rawProfile.totalAttempted)
          : 0,
      totalSolved:
        typeof rawProfile?.totalSolved === 'number' && rawProfile.totalSolved >= 0
          ? Math.round(rawProfile.totalSolved)
          : 0,
      bestStreak:
        typeof rawProfile?.bestStreak === 'number' && rawProfile.bestStreak >= 0
          ? Math.round(rawProfile.bestStreak)
          : 0,
      ratingHistory: Array.isArray(rawProfile?.ratingHistory) ? rawProfile.ratingHistory : [],
    };

    const rawThemeMastery = data.themeMastery;
    const themeMastery: Record<string, any> = {};
    if (typeof rawThemeMastery === 'object' && rawThemeMastery !== null && !Array.isArray(rawThemeMastery)) {
      for (const [key, val] of Object.entries(rawThemeMastery)) {
        if (val && typeof val === 'object') {
          const tVal = val as Record<string, any>;
          themeMastery[key] = {
            theme: key,
            attempted: typeof tVal.attempted === 'number' ? Math.max(0, tVal.attempted) : 0,
            solved: typeof tVal.solved === 'number' ? Math.max(0, tVal.solved) : 0,
            starsEarned: typeof tVal.starsEarned === 'number' ? Math.max(0, tVal.starsEarned) : 0,
            masteryLevel:
              tVal.masteryLevel === 'master' || tVal.masteryLevel === 'apprentice'
                ? tVal.masteryLevel
                : 'novice',
            lastPracticedAt:
              typeof tVal.lastPracticedAt === 'number' ? tVal.lastPracticedAt : Date.now(),
          };
        }
      }
    }

    const rawArcade = data.arcadeStats;
    const arcadeStats = {
      puzzleRushHighScore:
        typeof rawArcade?.puzzleRushHighScore === 'number'
          ? Math.max(0, Math.round(rawArcade.puzzleRushHighScore))
          : 0,
      puzzleRushBestStreak:
        typeof rawArcade?.puzzleRushBestStreak === 'number'
          ? Math.max(0, Math.round(rawArcade.puzzleRushBestStreak))
          : 0,
      streakSurvivorHighScore:
        typeof rawArcade?.streakSurvivorHighScore === 'number'
          ? Math.max(0, Math.round(rawArcade.streakSurvivorHighScore))
          : 0,
      totalRushRuns:
        typeof rawArcade?.totalRushRuns === 'number'
          ? Math.max(0, Math.round(rawArcade.totalRushRuns))
          : 0,
    };

    const rawSolved = data.solvedPuzzles;
    const solvedPuzzles: Record<string, SolvedPuzzleRecord> = {};
    if (typeof rawSolved === 'object' && rawSolved !== null && !Array.isArray(rawSolved)) {
      for (const [key, val] of Object.entries(rawSolved)) {
        if (val && typeof val === 'object') {
          const sVal = val as Record<string, any>;
          const stars = sVal.stars === 3 ? 3 : sVal.stars === 2 ? 2 : 1;
          solvedPuzzles[key] = {
            stars,
            solvedAt: typeof sVal.solvedAt === 'number' ? sVal.solvedAt : Date.now(),
          };
        }
      }
    }

    const now = Date.now();
    return {
      ratingProfile,
      themeMastery,
      arcadeStats,
      solvedPuzzles,
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : now,
      lastActiveAt: typeof data.lastActiveAt === 'number' ? data.lastActiveAt : now,
    };
  }

  public async getProgress(): Promise<PuzzleProgress> {
    if (!this.isStorageAvailable()) {
      return JSON.parse(JSON.stringify(this.memoryCache));
    }

    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        return JSON.parse(JSON.stringify(this.memoryCache));
      }
      const parsed = JSON.parse(raw);
      this.memoryCache = this.sanitizeProgress(parsed);
      return JSON.parse(JSON.stringify(this.memoryCache));
    } catch {
      return JSON.parse(JSON.stringify(this.memoryCache));
    }
  }

  public async updateRating(newRatingState: AdaptiveRatingState): Promise<void> {
    const current = await this.getProgress();
    const updated: PuzzleProgress = {
      ...current,
      ratingProfile: {
        ...newRatingState,
        peakRating: Math.max(current.ratingProfile.peakRating, newRatingState.rating),
      },
      lastActiveAt: Date.now(),
    };
    await this.persist(updated);
  }

  public async recordPuzzleAttempt(
    puzzleId: string,
    theme: PuzzleTheme,
    result: PuzzleAttemptResult,
    stars: StarRating
  ): Promise<PuzzleProgress> {
    const current = await this.getProgress();
    const isSuccess = result.startsWith('solved');
    const now = Date.now();

    const newSolvedPuzzles = { ...current.solvedPuzzles };
    if (isSuccess) {
      const existing = newSolvedPuzzles[puzzleId];
      newSolvedPuzzles[puzzleId] = {
        stars: existing ? (Math.max(existing.stars, stars) as StarRating) : stars,
        solvedAt: now,
      };
    }

    const newRatingProfile: AdaptiveRatingState = {
      ...current.ratingProfile,
      totalAttempted: current.ratingProfile.totalAttempted + 1,
      totalSolved: current.ratingProfile.totalSolved + (isSuccess ? 1 : 0),
    };

    const existingTheme = current.themeMastery[theme] || {
      theme,
      attempted: 0,
      solved: 0,
      starsEarned: 0,
      masteryLevel: 'novice' as const,
      lastPracticedAt: now,
    };

    const themeSolved = existingTheme.solved + (isSuccess ? 1 : 0);
    const themeAttempted = existingTheme.attempted + 1;
    const masteryLevel: 'novice' | 'apprentice' | 'master' =
      themeSolved >= 20 ? 'master' : themeSolved >= 8 ? 'apprentice' : 'novice';

    const newThemeMastery = {
      ...current.themeMastery,
      [theme]: {
        theme,
        attempted: themeAttempted,
        solved: themeSolved,
        starsEarned: existingTheme.starsEarned + (isSuccess ? stars : 0),
        masteryLevel,
        lastPracticedAt: now,
      },
    };

    const updated: PuzzleProgress = {
      ...current,
      solvedPuzzles: newSolvedPuzzles,
      ratingProfile: newRatingProfile,
      themeMastery: newThemeMastery,
      lastActiveAt: now,
    };

    await this.persist(updated);
    return JSON.parse(JSON.stringify(updated));
  }

  public async saveArcadeResult(
    mode: 'puzzle_rush' | 'streak_survivor',
    score: number,
    streak: number
  ): Promise<PuzzleProgress> {
    const current = await this.getProgress();
    const now = Date.now();

    const newArcade = { ...current.arcadeStats };
    if (mode === 'puzzle_rush') {
      newArcade.puzzleRushHighScore = Math.max(newArcade.puzzleRushHighScore, score);
      newArcade.puzzleRushBestStreak = Math.max(newArcade.puzzleRushBestStreak, streak);
      newArcade.totalRushRuns += 1;
    } else {
      newArcade.streakSurvivorHighScore = Math.max(newArcade.streakSurvivorHighScore, score);
    }

    const updated: PuzzleProgress = {
      ...current,
      arcadeStats: newArcade,
      lastActiveAt: now,
    };

    await this.persist(updated);
    return JSON.parse(JSON.stringify(updated));
  }

  public async resetAll(): Promise<void> {
    const now = Date.now();
    this.memoryCache = {
      ...DEFAULT_PUZZLE_PROGRESS,
      ratingProfile: { ...DEFAULT_ADAPTIVE_RATING },
      themeMastery: {},
      arcadeStats: { ...DEFAULT_PUZZLE_PROGRESS.arcadeStats },
      solvedPuzzles: {},
      createdAt: now,
      lastActiveAt: now,
    };

    if (this.isStorageAvailable()) {
      try {
        window.localStorage.removeItem(this.storageKey);
      } catch {
        // Safe ignore
      }
    }
  }

  private async persist(data: PuzzleProgress): Promise<void> {
    this.memoryCache = JSON.parse(JSON.stringify(data));
    if (this.isStorageAvailable()) {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(data));
      } catch {
        // Fallback gracefully to memoryCache
      }
    }
  }
}

export const defaultLocalStoragePuzzleProgressStore = new LocalStoragePuzzleProgressStore();
export { LocalStoragePuzzleProgressStore as LocalStoragePuzzleStore };
