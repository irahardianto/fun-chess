import type {
  ProgressStorage,
  UnifiedProgressPayload,
  ScenarioProgressStore,
  PuzzleProgressStore,
  ScenarioProgressMap,
  PuzzleProgress,
} from '@fun-chess/shared';
import { UNIFIED_PROGRESS_SCHEMA_VERSION } from '@fun-chess/shared';
import { LocalStorageProgressStore } from '@/features/scenarios/store/local_storage_progress.store';
import { LocalStoragePuzzleProgressStore } from '@/features/puzzles/store/local_storage_puzzle_store';
import { isQuotaExceededError, storageAlertDispatcher } from '@/platform/storage/storage_alert';

export class StorageCommitError extends Error {
  public readonly rolledBack: boolean;
  constructor(message: string, options: { cause?: unknown; rolledBack: boolean }) {
    super(message, { cause: options.cause });
    this.name = 'StorageCommitError';
    this.rolledBack = options.rolledBack;
  }
}

interface StorageSnapshot {
  scenarios: ScenarioProgressMap;
  puzzles: PuzzleProgress;
}

/**
 * Production unified progress store coordinating Academy and Puzzle progress.
 * Adheres to Rule 1 (I/O Isolation) and CRIT-003 Two-Phase Commit with rollback.
 */
export class LocalStorageUnifiedStore implements ProgressStorage {
  constructor(
    private readonly scenarioStore: ScenarioProgressStore,
    private readonly puzzleStore: PuzzleProgressStore
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
    return this.overwriteAll(payload);
  }

  /**
   * Two-phase commit overwrite with pre-write snapshot and rollback on write failure.
   */
  public async overwriteAll(payload: UnifiedProgressPayload): Promise<void> {
    // Phase 0: Validate payload structure
    if (!payload || typeof payload !== 'object' || !payload.scenarios || !payload.puzzles) {
      throw new Error('Invalid payload: missing scenarios or puzzles data');
    }

    // Phase 1: Capture pre-write snapshot
    const snapshot: StorageSnapshot = {
      scenarios: structuredClone(await this.scenarioStore.getProgressMap()),
      puzzles: structuredClone(await this.puzzleStore.getProgress()),
    };

    // Phase 2: Staged write
    try {
      // 2a. Reset and write scenario records
      await this.scenarioStore.resetAllProgress();
      for (const [id, progress] of Object.entries(payload.scenarios)) {
        await this.scenarioStore.saveProgress(
          id,
          progress.starsEarned,
          progress.hintsUsedTotal
        );
      }

      // 2b. Write full puzzle state (including themeMastery & arcadeStats)
      await this.puzzleStore.restoreProgress(payload.puzzles);
    } catch (writeErr) {
      // Compensating Rollback: restore from snapshot
      let rollbackSucceeded = false;
      try {
        await this.scenarioStore.resetAllProgress();
        for (const [id, progress] of Object.entries(snapshot.scenarios)) {
          await this.scenarioStore.saveProgress(
            id,
            progress.starsEarned,
            progress.hintsUsedTotal
          );
        }
        await this.puzzleStore.restoreProgress(snapshot.puzzles);
        rollbackSucceeded = true;
      } catch (rollbackErr) {
        console.error('FATAL: Two-phase commit rollback failed:', rollbackErr);
        rollbackSucceeded = false;
      }

      // Check quota error & emit alert
      if (isQuotaExceededError(writeErr)) {
        storageAlertDispatcher.notify({
          type: 'STORAGE_QUOTA_EXCEEDED',
          store: 'unified',
          attemptedAction: 'overwrite',
          timestamp: Date.now(),
          message: 'Storage quota exceeded while importing progress. Local state was preserved.',
          suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
        });
      }

      throw new StorageCommitError(
        rollbackSucceeded
          ? 'Failed to save unified progress. Existing progress was safely restored.'
          : 'CRITICAL: Progress save failed and partial rollback failed.',
        { cause: writeErr, rolledBack: rollbackSucceeded }
      );
    }
  }
}

export function createDefaultLocalStorageUnifiedStore(): LocalStorageUnifiedStore {
  return new LocalStorageUnifiedStore(
    new LocalStorageProgressStore(),
    new LocalStoragePuzzleProgressStore()
  );
}

export const defaultLocalStorageUnifiedStore = createDefaultLocalStorageUnifiedStore();
