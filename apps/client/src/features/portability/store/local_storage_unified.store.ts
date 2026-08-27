import type {
  ProgressStorage,
  UnifiedProgressPayload,
  ScenarioProgressStore,
  PuzzleProgressStore,
} from '@fun-chess/shared';
import {
  UNIFIED_PROGRESS_SCHEMA_VERSION,
} from '@fun-chess/shared';
import {
  LocalStorageProgressStore,
  SCENARIO_PROGRESS_STORAGE_KEY,
} from '@/features/scenarios/store/local_storage_progress.store';
import {
  LocalStoragePuzzleProgressStore,
  PUZZLE_PROGRESS_STORAGE_KEY,
} from '@/features/puzzles/store/local_storage_puzzle_store';

/**
 * Production unified progress store coordinating Academy and Puzzle progress.
 * Adheres to Rule 1 (I/O Isolation) and handles storage persistence safely.
 */
export class LocalStorageUnifiedStore implements ProgressStorage {
  constructor(
    private readonly scenarioStore: ScenarioProgressStore = new LocalStorageProgressStore(),
    private readonly puzzleStore: PuzzleProgressStore = new LocalStoragePuzzleProgressStore()
  ) {}

  public async getUnifiedProgress(): Promise<UnifiedProgressPayload> {
    const [scenarios, puzzles] = await Promise.all([
      this.scenarioStore.getProgressMap(),
      this.puzzleStore.getProgress(),
    ]);

    return {
      version: UNIFIED_PROGRESS_SCHEMA_VERSION,
      exportedAt: Date.now(),
      scenarios,
      puzzles,
    };
  }

  public async saveUnifiedProgress(payload: UnifiedProgressPayload): Promise<void> {
    // 1. Direct local storage write if available for lossless full state
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        if (payload.scenarios) {
          window.localStorage.setItem(
            SCENARIO_PROGRESS_STORAGE_KEY,
            JSON.stringify(payload.scenarios)
          );
        }
        if (payload.puzzles) {
          window.localStorage.setItem(
            PUZZLE_PROGRESS_STORAGE_KEY,
            JSON.stringify(payload.puzzles)
          );
        }
      } catch {
        // Fallback to store interface persistence below
      }
    }

    // 2. Reset and sync scenario store
    await this.scenarioStore.resetAllProgress();
    if (payload.scenarios) {
      for (const [id, sc] of Object.entries(payload.scenarios)) {
        await this.scenarioStore.saveProgress(id, sc.starsEarned, sc.hintsUsedTotal);
      }
    }

    // 3. Persist puzzle store state
    if (payload.puzzles?.ratingProfile) {
      await this.puzzleStore.updateRating(payload.puzzles.ratingProfile);
    }
  }
}

export const defaultLocalStorageUnifiedStore = new LocalStorageUnifiedStore();
