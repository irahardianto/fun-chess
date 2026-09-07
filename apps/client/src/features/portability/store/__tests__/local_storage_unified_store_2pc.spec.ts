import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LocalStorageUnifiedStore,
  StorageCommitError,
} from '../local_storage_unified.store';
import { InMemoryProgressStore } from '@/features/scenarios/store/in_memory_progress.store';
import { InMemoryPuzzleProgressStore } from '@/features/puzzles/store/in_memory_puzzle_progress.store';
import { storageAlertDispatcher } from '@/platform/storage/storage_alert';
import type { UnifiedProgressPayload } from '@fun-chess/shared';

describe('LocalStorageUnifiedStore Two-Phase Commit with Rollback (CRIT-003 & ENH-009)', () => {
  let scenarioStore: InMemoryProgressStore;
  let puzzleStore: InMemoryPuzzleProgressStore;
  let unifiedStore: LocalStorageUnifiedStore;

  const initialPayload: UnifiedProgressPayload = {
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
      themeMastery: {
        fork: {
          theme: 'fork',
          attempted: 5,
          solved: 4,
          starsEarned: 10,
          masteryLevel: 'novice',
          lastPracticedAt: 1000,
        },
      },
      arcadeStats: {
        puzzleRushHighScore: 15,
        puzzleRushBestStreak: 6,
        streakSurvivorHighScore: 10,
        totalRushRuns: 4,
      },
      solvedPuzzles: {
        puz_fork_001: { stars: 3, solvedAt: 1000 },
      },
      createdAt: 1000,
      lastActiveAt: 1000,
    },
  };

  beforeEach(async () => {
    scenarioStore = new InMemoryProgressStore();
    await scenarioStore.saveProgress('lesson-intro', 3, 0);

    puzzleStore = new InMemoryPuzzleProgressStore(initialPayload.puzzles);
    unifiedStore = new LocalStorageUnifiedStore(scenarioStore, puzzleStore);
  });

  it('successfully commits full payload in happy path', async () => {
    const incoming: UnifiedProgressPayload = {
      version: 1,
      exportedAt: 2000,
      scenarios: {
        'lesson-advanced': {
          scenarioId: 'lesson-advanced',
          starsEarned: 2,
          attemptsCount: 2,
          hintsUsedTotal: 1,
          firstCompletedAt: 2000,
          lastCompletedAt: 2000,
        },
      },
      puzzles: {
        ...initialPayload.puzzles,
        ratingProfile: {
          ...initialPayload.puzzles.ratingProfile,
          rating: 1350,
        },
      },
    };

    await unifiedStore.overwriteAll(incoming);

    const saved = await unifiedStore.getUnifiedProgress();
    expect(saved.scenarios['lesson-advanced']?.starsEarned).toBe(2);
    expect(saved.scenarios['lesson-intro']).toBeUndefined();
    expect(saved.puzzles.ratingProfile.rating).toBe(1350);
  });

  it('rejects invalid payload during pre-flight assertion without altering state', async () => {
    await expect(
      unifiedStore.overwriteAll(null as any)
    ).rejects.toThrow('Invalid payload');

    const unchanged = await unifiedStore.getUnifiedProgress();
    expect(unchanged.scenarios['lesson-intro']).toBeDefined();
    expect(unchanged.puzzles.ratingProfile.rating).toBe(1100);
  });

  it('automatically rolls back scenarios when puzzle store write fails midway', async () => {
    // Force puzzleStore.restoreProgress to throw an unexpected write error
    vi.spyOn(puzzleStore, 'restoreProgress').mockRejectedValueOnce(
      new Error('Disk write failure')
    );

    const incoming: UnifiedProgressPayload = {
      version: 1,
      exportedAt: 3000,
      scenarios: {
        'lesson-corrupted': {
          scenarioId: 'lesson-corrupted',
          starsEarned: 1,
          attemptsCount: 1,
          hintsUsedTotal: 0,
          firstCompletedAt: 3000,
          lastCompletedAt: 3000,
        },
      },
      puzzles: {
        ...initialPayload.puzzles,
        ratingProfile: {
          ...initialPayload.puzzles.ratingProfile,
          rating: 1500,
        },
      },
    };

    let caughtError: StorageCommitError | null = null;
    try {
      await unifiedStore.overwriteAll(incoming);
    } catch (err) {
      caughtError = err as StorageCommitError;
    }

    expect(caughtError).toBeInstanceOf(StorageCommitError);
    expect(caughtError?.rolledBack).toBe(true);
    expect(caughtError?.message).toContain('safely restored');

    // Confirm rollback restored original state
    const afterRollback = await unifiedStore.getUnifiedProgress();
    expect(afterRollback.scenarios['lesson-intro']?.starsEarned).toBe(3);
    expect(afterRollback.scenarios['lesson-corrupted']).toBeUndefined();
    expect(afterRollback.puzzles.ratingProfile.rating).toBe(1100);
    expect(afterRollback.puzzles.themeMastery.fork?.attempted).toBe(5);
  });

  it('triggers storageAlertDispatcher and rolls back on QuotaExceededError', async () => {
    const quotaExceededErr = new DOMException(
      'The quota has been exceeded.',
      'QuotaExceededError'
    );
    vi.spyOn(puzzleStore, 'restoreProgress').mockRejectedValueOnce(quotaExceededErr);

    const alertListener = vi.fn();
    const unsubscribe = storageAlertDispatcher.subscribe(alertListener);

    try {
      await expect(unifiedStore.overwriteAll(initialPayload)).rejects.toThrow(
        StorageCommitError
      );

      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STORAGE_QUOTA_EXCEEDED',
          store: 'unified',
          attemptedAction: 'overwrite',
          suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
        })
      );

      // Verify state was safely rolled back
      const current = await unifiedStore.getUnifiedProgress();
      expect(current.scenarios['lesson-intro']).toBeDefined();
    } finally {
      unsubscribe();
    }
  });
});
