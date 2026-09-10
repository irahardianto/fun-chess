import { toRaw } from 'vue';
import type {
  ProgressStorage,
  UnifiedProgressPayload,
  ScenarioProgressStore,
  PuzzleProgressStore,
  ScenarioProgressMap,
  PuzzleProgress,
  IClock,
} from '@fun-chess/shared';
import { UNIFIED_PROGRESS_SCHEMA_VERSION, assertValidProgress } from '@fun-chess/shared';
import { isQuotaExceededError, storageAlertDispatcher } from '@/platform/storage/storage_alert';
import { logger as defaultLogger, generateCorrelationId, type ILogger } from '@/platform/telemetry';
import { SystemClock } from '@/platform/time';

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
  private readonly clock: IClock;

  constructor(
    private readonly scenarioStore: ScenarioProgressStore,
    private readonly puzzleStore: PuzzleProgressStore,
    private readonly logger: ILogger = defaultLogger,
    clock?: IClock
  ) {
    this.clock = clock ?? new SystemClock();
  }

  public async getUnifiedProgress(): Promise<UnifiedProgressPayload> {
    const [scenarios, puzzles] = await Promise.all([
      this.scenarioStore.getProgressMap(),
      this.puzzleStore.getProgress(),
    ]);

    return {
      version: UNIFIED_PROGRESS_SCHEMA_VERSION,
      exportedAt: this.clock.now(),
      scenarios,
      puzzles,
    };
  }

  public async saveUnifiedProgress(payload: UnifiedProgressPayload): Promise<void> {
    return this.overwriteAll(payload);
  }

  /**
   * Two-phase commit overwrite with pre-write snapshot and rollback on write failure.
   * Remediates MAJ-020: 3-point structured logging on overwriteAll (start, success, failure) with correlationId and duration.
   */
  public async overwriteAll(payload: UnifiedProgressPayload): Promise<void> {
    const correlationId = generateCorrelationId();
    const startTime = performance.now();

    this.logger.info('Starting unified progress overwrite', {
      operation: 'unified_store_overwrite_all',
      correlationId,
    });

    try {
      // Phase 0: Validate payload structure against authoritative schema
      if (!payload || typeof payload !== 'object' || !payload.scenarios || !payload.puzzles) {
        throw new Error('Invalid payload: missing scenarios or puzzles data');
      }
      const validatedPayload = assertValidProgress(payload);

      // Phase 1: Capture pre-write snapshot
      const snapshot: StorageSnapshot = {
        scenarios: structuredClone(toRaw(await this.scenarioStore.getProgressMap())),
        puzzles: structuredClone(toRaw(await this.puzzleStore.getProgress())),
      };

      // Phase 2: Staged write
      try {
        // 2a. Reset and restore scenario records
        await this.applyScenarioProgress(validatedPayload.scenarios);

        // 2b. Write full puzzle state (including themeMastery & arcadeStats)
        await this.puzzleStore.restoreProgress(validatedPayload.puzzles);
      } catch (writeErr) {
        // Compensating Rollback: restore from snapshot
        let rollbackSucceeded = false;
        try {
          await this.applyScenarioProgress(snapshot.scenarios);
          await this.puzzleStore.restoreProgress(snapshot.puzzles);
          rollbackSucceeded = true;
        } catch (rollbackErr) {
          this.logger.fatal('FATAL: Two-phase commit rollback failed', {
            operation: 'unified_store_rollback',
            correlationId,
            error:
              rollbackErr instanceof Error
                ? { name: rollbackErr.name, message: rollbackErr.message, stack: rollbackErr.stack }
                : { raw: rollbackErr },
          });
          rollbackSucceeded = false;
        }

        // Check quota error & emit alert
        if (isQuotaExceededError(writeErr)) {
          storageAlertDispatcher.notify({
            type: 'STORAGE_QUOTA_EXCEEDED',
            store: 'unified',
            attemptedAction: 'overwrite',
            timestamp: this.clock.now(),
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

      const duration = Math.round(performance.now() - startTime);
      this.logger.info('Unified progress overwrite succeeded', {
        operation: 'unified_store_overwrite_all',
        correlationId,
        duration,
        durationMs: duration,
      });
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      this.logger.error('Unified progress overwrite failed', {
        operation: 'unified_store_overwrite_all',
        correlationId,
        duration,
        durationMs: duration,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
      throw err;
    }
  }

  /**
   * Helper to write scenario progress records, handling both bulk restore and individual item fallback (MIN-016).
   */
  private async applyScenarioProgress(scenarios: ScenarioProgressMap): Promise<void> {
    if (typeof this.scenarioStore.restoreProgressMap === 'function') {
      await this.scenarioStore.restoreProgressMap(scenarios);
    } else {
      await this.scenarioStore.resetAllProgress();
      for (const [id, progress] of Object.entries(scenarios)) {
        await this.scenarioStore.saveProgress(
          id,
          progress.starsEarned,
          progress.hintsUsedTotal
        );
      }
    }
  }
}
