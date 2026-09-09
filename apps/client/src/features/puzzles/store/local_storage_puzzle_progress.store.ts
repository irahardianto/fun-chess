import { toRaw } from 'vue';
import {
  sanitizeAndValidateProgress,
  type PuzzleProgress,
  type PuzzleProgressStore,
  type AdaptiveRatingState,
  type PuzzleTheme,
  type PuzzleAttemptResult,
  type StarRating,
  type IClock,
} from '@fun-chess/shared';
import {
  PUZZLE_PROGRESS_STORAGE_KEY,
  DEFAULT_ADAPTIVE_RATING,
  DEFAULT_PUZZLE_PROGRESS,
} from './puzzle_progress.store';
import { isQuotaExceededError, storageAlertDispatcher } from '@/platform/storage/storage_alert';
import { safeLocalStorage, type KeyValueStorage } from '@/platform/storage';
import { logger as defaultLogger, type ILogger } from '@/platform/telemetry';
import { SystemClock } from '@/platform/time';

export { PUZZLE_PROGRESS_STORAGE_KEY };

/**
 * Default system clock implementation using SystemClock.
 */
export const systemClock: IClock = new SystemClock();

/**
 * Robust LocalStorage implementation of PuzzleProgressStore.
 * Adheres to Rule 1 (I/O Isolation) and Rugged Software Mandates:
 * - Defensive JSON parsing with automatic recovery on corrupt storage
 * - Runtime type narrowing and sanitization of numerical and object properties
 * - Seamless fallback to in-memory state on quota errors or SSR environments
 * - Storage quota detection and reactive user alert notification
 * - Deterministic timestamping via injected IClock (MAJ-019)
 */
export class LocalStoragePuzzleProgressStore implements PuzzleProgressStore {
  private memoryCache: PuzzleProgress;
  private readonly storageKey: string;
  private readonly storage: KeyValueStorage;
  private readonly clock: IClock;
  private readonly logger: ILogger;

  constructor(
    storageKey: string = PUZZLE_PROGRESS_STORAGE_KEY,
    storage: KeyValueStorage = safeLocalStorage,
    clock: IClock = systemClock,
    logger: ILogger = defaultLogger
  ) {
    this.storageKey = storageKey;
    this.storage = storage;
    this.clock = clock;
    this.logger = logger;
    this.memoryCache = {
      ...DEFAULT_PUZZLE_PROGRESS,
      ratingProfile: { ...DEFAULT_ADAPTIVE_RATING },
      themeMastery: {},
      arcadeStats: { ...DEFAULT_PUZZLE_PROGRESS.arcadeStats },
      solvedPuzzles: {},
      createdAt: this.clock.now(),
      lastActiveAt: this.clock.now(),
    };
  }

  private sanitizeProgress(raw: unknown): PuzzleProgress {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ...DEFAULT_PUZZLE_PROGRESS };
    }

    const rawObj = raw as Record<string, unknown>;
    const hasPuzzles =
      'puzzles' in rawObj &&
      typeof rawObj.puzzles === 'object' &&
      rawObj.puzzles !== null &&
      !Array.isArray(rawObj.puzzles);

    const payload = hasPuzzles ? rawObj : { puzzles: raw };

    const validationResult = sanitizeAndValidateProgress(payload);
    if (validationResult.success && validationResult.data?.puzzles) {
      const sanitized = validationResult.data.puzzles;
      const puzzlesObj = (payload as Record<string, unknown>).puzzles;
      const rawThemes =
        puzzlesObj && typeof puzzlesObj === 'object' && 'themeMastery' in puzzlesObj
          ? (puzzlesObj as Record<string, unknown>).themeMastery
          : null;
      if (rawThemes && typeof rawThemes === 'object') {
        for (const [key, val] of Object.entries(rawThemes)) {
          if (val && typeof val === 'object' && 'masteryLevel' in val) {
            const ml = (val as { masteryLevel?: unknown }).masteryLevel;
            const existing = sanitized.themeMastery[key];
            if ((ml === 'master' || ml === 'apprentice' || ml === 'novice') && existing) {
              sanitized.themeMastery[key] = {
                ...existing,
                masteryLevel: ml,
              };
            }
          }
        }
      }
      return sanitized;
    }

    return { ...DEFAULT_PUZZLE_PROGRESS };
  }

  public async getProgress(): Promise<PuzzleProgress> {
    if (!this.storage.isAvailable()) {
      return structuredClone(toRaw(this.memoryCache));
    }

    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) {
        return structuredClone(toRaw(this.memoryCache));
      }
      const parsed = JSON.parse(raw);
      this.memoryCache = this.sanitizeProgress(parsed);
      return structuredClone(toRaw(this.memoryCache));
    } catch (err) {
      this.logger.warn('Failed to parse or deserialize puzzle progress from storage, using fallback cache', {
        operation: 'get_puzzle_progress',
        error: err instanceof Error ? err.message : String(err),
      });
      return structuredClone(toRaw(this.memoryCache));
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
      lastActiveAt: this.clock.now(),
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
    const now = this.clock.now();

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
    return structuredClone(toRaw(updated));
  }

  public async saveArcadeResult(
    mode: 'puzzle_rush' | 'streak_survivor',
    score: number,
    streak: number
  ): Promise<PuzzleProgress> {
    const current = await this.getProgress();
    const now = this.clock.now();

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
    return structuredClone(toRaw(updated));
  }

  public async restoreProgress(progress: PuzzleProgress): Promise<void> {
    const sanitized = this.sanitizeProgress(progress);
    await this.persist(sanitized, true);
  }

  public async resetAll(): Promise<void> {
    const now = this.clock.now();
    this.memoryCache = {
      ...DEFAULT_PUZZLE_PROGRESS,
      ratingProfile: { ...DEFAULT_ADAPTIVE_RATING },
      themeMastery: {},
      arcadeStats: { ...DEFAULT_PUZZLE_PROGRESS.arcadeStats },
      solvedPuzzles: {},
      createdAt: now,
      lastActiveAt: now,
    };

    if (this.storage.isAvailable()) {
      try {
        this.storage.removeItem(this.storageKey);
      } catch (err) {
        this.logger.warn('Failed to clear puzzle storage key', {
          operation: 'reset_puzzle_progress',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async persist(data: PuzzleProgress, throwOnQuota: boolean = false): Promise<void> {
    this.memoryCache = structuredClone(toRaw(data));
    if (this.storage.isAvailable()) {
      try {
        this.storage.setItem(this.storageKey, JSON.stringify(data));
      } catch (err) {
        if (isQuotaExceededError(err)) {
          storageAlertDispatcher.notify({
            type: 'STORAGE_QUOTA_EXCEEDED',
            store: 'puzzles',
            attemptedAction: 'save',
            timestamp: this.clock.now(),
            message: 'Storage quota exceeded while saving puzzle progress. Local state was preserved in memory.',
            suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
          });
          if (throwOnQuota) {
            throw err;
          }
          // Preserve in-memory without crashing the UI for regular gameplay
        } else {
          this.logger.warn('Failed to persist puzzle progress to storage', {
            operation: 'persist_puzzle_progress',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }
}

export const defaultLocalStoragePuzzleProgressStore = new LocalStoragePuzzleProgressStore();
export { LocalStoragePuzzleProgressStore as LocalStoragePuzzleStore };
