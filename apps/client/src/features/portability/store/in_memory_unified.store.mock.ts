import type {
  ProgressStorage,
  UnifiedProgressPayload,
} from '@fun-chess/shared';
import { UNIFIED_PROGRESS_SCHEMA_VERSION } from '@fun-chess/shared';

/**
 * Creates empty fallback unified progress payload.
 */
export function createEmptyUnifiedProgress(): UnifiedProgressPayload {
  return {
    version: UNIFIED_PROGRESS_SCHEMA_VERSION,
    exportedAt: Date.now(),
    scenarios: {},
    puzzles: {
      ratingProfile: {
        rating: 800,
        ratingDeviation: 350,
        peakRating: 800,
        totalAttempted: 0,
        totalSolved: 0,
        bestStreak: 0,
        ratingHistory: [],
      },
      themeMastery: {},
      arcadeStats: {
        puzzleRushHighScore: 0,
        puzzleRushBestStreak: 0,
        streakSurvivorHighScore: 0,
        totalRushRuns: 0,
      },
      solvedPuzzles: {},
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    },
  };
}

/**
 * In-memory test double for ProgressStorage.
 * Adheres to Rule 1 (I/O Isolation) for deterministic unit testing.
 */
export class InMemoryUnifiedStoreMock implements ProgressStorage {
  private data: UnifiedProgressPayload;

  constructor(initialData: Partial<UnifiedProgressPayload> = {}) {
    const empty = createEmptyUnifiedProgress();
    this.data = {
      ...empty,
      ...initialData,
      scenarios: initialData.scenarios ? { ...initialData.scenarios } : {},
      puzzles: initialData.puzzles
        ? {
            ...empty.puzzles,
            ...initialData.puzzles,
            ratingProfile: {
              ...empty.puzzles.ratingProfile,
              ...(initialData.puzzles.ratingProfile || {}),
            },
            themeMastery: { ...(initialData.puzzles.themeMastery || {}) },
            arcadeStats: {
              ...empty.puzzles.arcadeStats,
              ...(initialData.puzzles.arcadeStats || {}),
            },
            solvedPuzzles: { ...(initialData.puzzles.solvedPuzzles || {}) },
          }
        : empty.puzzles,
    };
  }

  public async getUnifiedProgress(): Promise<UnifiedProgressPayload> {
    return structuredClone(this.data);
  }

  public async saveUnifiedProgress(payload: UnifiedProgressPayload): Promise<void> {
    this.data = structuredClone(payload);
  }

  public setData(payload: UnifiedProgressPayload): void {
    this.data = structuredClone(payload);
  }

  public getData(): UnifiedProgressPayload {
    return structuredClone(this.data);
  }

  public reset(): void {
    this.data = createEmptyUnifiedProgress();
  }
}
