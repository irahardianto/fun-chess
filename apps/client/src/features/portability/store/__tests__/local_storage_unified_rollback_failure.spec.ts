import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LocalStorageUnifiedStore,
  StorageCommitError,
} from '../local_storage_unified.store';
import { InMemoryProgressStore } from '@/features/scenarios/store/in_memory_progress.store';
import { InMemoryPuzzleProgressStore } from '@/features/puzzles/store/in_memory_puzzle_progress.store';
import { storageAlertDispatcher } from '@/platform/storage/storage_alert';
import { logger } from '@/platform/telemetry';
import type { UnifiedProgressPayload, ScenarioProgressStore } from '@fun-chess/shared';

describe('LocalStorageUnifiedStore Rollback Failure (MAJ-035)', () => {
  let scenarioStore: InMemoryProgressStore;
  let puzzleStore: InMemoryPuzzleProgressStore;
  let unifiedStore: LocalStorageUnifiedStore;

  const validExistingPayload: UnifiedProgressPayload = {
    version: 1,
    exportedAt: 1000,
    scenarios: {
      'lesson-intro': {
        scenarioId: 'lesson-intro',
        starsEarned: 3,
        attemptsCount: 1,
        hintsUsedTotal: 0,
        firstCompletedAt: 1000,
        lastCompletedAt: 1000,
      },
    },
    puzzles: {
      ratingProfile: {
        rating: 1100,
        ratingDeviation: 150,
        peakRating: 1100,
        totalAttempted: 10,
        totalSolved: 8,
        bestStreak: 4,
        ratingHistory: [],
      },
      themeMastery: {},
      arcadeStats: {
        puzzleRushHighScore: 15,
        puzzleRushBestStreak: 6,
        streakSurvivorHighScore: 10,
        totalRushRuns: 4,
      },
      solvedPuzzles: {
        puz_001: { stars: 3, solvedAt: 1000 },
      },
      createdAt: 1000,
      lastActiveAt: 1000,
    },
  };

  const incomingPayload: UnifiedProgressPayload = {
    version: 1,
    exportedAt: 2000,
    scenarios: {
      'lesson-advanced': {
        scenarioId: 'lesson-advanced',
        starsEarned: 3,
        attemptsCount: 2,
        hintsUsedTotal: 0,
        firstCompletedAt: 2000,
        lastCompletedAt: 2000,
      },
    },
    puzzles: {
      ...validExistingPayload.puzzles,
      ratingProfile: {
        ...validExistingPayload.puzzles.ratingProfile,
        rating: 1400,
      },
    },
  };

  beforeEach(async () => {
    scenarioStore = new InMemoryProgressStore();
    await scenarioStore.saveProgress('lesson-intro', 3, 0);

    puzzleStore = new InMemoryPuzzleProgressStore(validExistingPayload.puzzles);
    unifiedStore = new LocalStorageUnifiedStore(scenarioStore, puzzleStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws StorageCommitError with rolledBack: false when puzzle write fails AND rollback restoreProgressMap fails', async () => {
    const primaryWriteError = new Error('Disk write error on puzzles');
    const rollbackError = new Error('Corrupted storage prevents scenario restoreProgressMap during rollback');

    // Make forward puzzle restore fail
    vi.spyOn(puzzleStore, 'restoreProgress').mockRejectedValueOnce(primaryWriteError);

    // Make compensating rollback's restoreProgressMap fail
    // 1st call is forward write (succeeds)
    // 2nd call is rollback restore (fails)
    const restoreMapSpy = vi.spyOn(scenarioStore, 'restoreProgressMap');
    restoreMapSpy
      .mockResolvedValueOnce() // forward write succeeds
      .mockRejectedValueOnce(rollbackError); // compensating rollback fails!

    const loggerFatalSpy = vi.spyOn(logger, 'fatal');

    let caught: StorageCommitError | null = null;
    try {
      await unifiedStore.overwriteAll(incomingPayload);
    } catch (err) {
      caught = err as StorageCommitError;
    }

    expect(caught).toBeInstanceOf(StorageCommitError);
    expect(caught?.rolledBack).toBe(false);
    expect(caught?.message).toContain('CRITICAL: Progress save failed and partial rollback failed.');
    expect(caught?.cause).toBe(primaryWriteError);

    // Verify fatal structured logger call
    expect(loggerFatalSpy).toHaveBeenCalledWith(
      expect.stringContaining('FATAL: Two-phase commit rollback failed'),
      expect.objectContaining({
        operation: 'unified_store_rollback',
        error: expect.objectContaining({
          message: rollbackError.message,
        }),
      })
    );
  });

  it('throws StorageCommitError with rolledBack: false when legacy store lacks restoreProgressMap AND rollback resetAllProgress fails', async () => {
    const primaryWriteError = new Error('Disk write failure on puzzles');
    const rollbackResetError = new Error('Storage locked, cannot resetAllProgress during rollback');

    // Create a scenario store without restoreProgressMap to exercise legacy fallback branch
    const legacyScenarioStore: ScenarioProgressStore = {
      getProgressMap: vi.fn().mockResolvedValue({}),
      getProgress: vi.fn().mockResolvedValue(null),
      saveProgress: vi.fn().mockResolvedValue({
        scenarioId: 'lesson-advanced',
        starsEarned: 3,
        attemptsCount: 1,
        hintsUsedTotal: 0,
        firstCompletedAt: 2000,
        lastCompletedAt: 2000,
      }),
      resetAllProgress: vi
        .fn()
        .mockResolvedValueOnce(undefined) // forward write reset succeeds
        .mockRejectedValueOnce(rollbackResetError), // rollback reset fails!
    };

    const legacyUnifiedStore = new LocalStorageUnifiedStore(legacyScenarioStore, puzzleStore);

    vi.spyOn(puzzleStore, 'restoreProgress').mockRejectedValueOnce(primaryWriteError);
    vi.spyOn(logger, 'fatal').mockImplementation(() => {});

    let caught: StorageCommitError | null = null;
    try {
      await legacyUnifiedStore.overwriteAll(incomingPayload);
    } catch (err) {
      caught = err as StorageCommitError;
    }

    expect(caught).toBeInstanceOf(StorageCommitError);
    expect(caught?.rolledBack).toBe(false);
    expect(caught?.message).toContain('CRITICAL: Progress save failed and partial rollback failed.');
    expect(caught?.cause).toBe(primaryWriteError);
  });

  it('throws StorageCommitError with rolledBack: false when puzzle write fails AND rollback puzzle restore fails', async () => {
    const primaryWriteError = new Error('Primary puzzle commit failed');
    const rollbackPuzzleError = new Error('Rollback puzzle restore failed');

    // 1st call (forward write) fails, 2nd call (rollback snapshot restore) fails!
    vi.spyOn(puzzleStore, 'restoreProgress')
      .mockRejectedValueOnce(primaryWriteError)
      .mockRejectedValueOnce(rollbackPuzzleError);

    vi.spyOn(logger, 'fatal').mockImplementation(() => {});

    let caught: StorageCommitError | null = null;
    try {
      await unifiedStore.overwriteAll(incomingPayload);
    } catch (err) {
      caught = err as StorageCommitError;
    }

    expect(caught).toBeInstanceOf(StorageCommitError);
    expect(caught?.rolledBack).toBe(false);
    expect(caught?.message).toContain('CRITICAL: Progress save failed and partial rollback failed.');
    expect(caught?.cause).toBe(primaryWriteError);
  });

  it('still emits storageAlertDispatcher quota alert when primary write failure is QuotaExceededError and rollback fails', async () => {
    const quotaError = new DOMException('QuotaExceeded', 'QuotaExceededError');
    const rollbackError = new Error('Hardware failure during rollback');

    vi.spyOn(puzzleStore, 'restoreProgress').mockRejectedValueOnce(quotaError);
    vi.spyOn(scenarioStore, 'restoreProgressMap')
      .mockResolvedValueOnce() // forward write succeeds
      .mockRejectedValueOnce(rollbackError); // rollback fails

    vi.spyOn(logger, 'fatal').mockImplementation(() => {});

    const alertListener = vi.fn();
    const unsubscribe = storageAlertDispatcher.subscribe(alertListener);

    try {
      let caught: StorageCommitError | null = null;
      try {
        await unifiedStore.overwriteAll(incomingPayload);
      } catch (err) {
        caught = err as StorageCommitError;
      }

      expect(caught).toBeInstanceOf(StorageCommitError);
      expect(caught?.rolledBack).toBe(false);
      expect(caught?.message).toContain('CRITICAL: Progress save failed and partial rollback failed.');
      expect(caught?.cause).toBe(quotaError);

      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STORAGE_QUOTA_EXCEEDED',
          store: 'unified',
          attemptedAction: 'overwrite',
        })
      );
    } finally {
      unsubscribe();
    }
  });
});
