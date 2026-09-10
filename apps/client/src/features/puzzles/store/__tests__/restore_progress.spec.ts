import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryPuzzleProgressStore } from '../in_memory_puzzle_progress.store';
import { LocalStoragePuzzleProgressStore } from '../local_storage_puzzle_progress.store';
import { storageAlertDispatcher } from '@/platform/storage/storage_alert';
import type { PuzzleProgress, PuzzleProgressStore } from '@fun-chess/shared';

describe('Puzzle Store restoreProgress & Quota Alert (MIN-008 & ENH-009)', () => {
  const fullProgress: PuzzleProgress = {
    ratingProfile: {
      rating: 1420,
      ratingDeviation: 85,
      peakRating: 1450,
      totalAttempted: 50,
      totalSolved: 42,
      bestStreak: 12,
      ratingHistory: [
        { rating: 800, timestamp: 1000, puzzleId: 'p1', delta: 0 },
        { rating: 1420, timestamp: 2000, puzzleId: 'p2', delta: 620 },
      ],
    },
    themeMastery: {
      fork: {
        theme: 'fork',
        attempted: 20,
        solved: 18,
        starsEarned: 50,
        masteryLevel: 'master',
        lastPracticedAt: 2000,
      },
      pin: {
        theme: 'pin',
        attempted: 10,
        solved: 8,
        starsEarned: 22,
        masteryLevel: 'apprentice',
        lastPracticedAt: 1900,
      },
    },
    arcadeStats: {
      puzzleRushHighScore: 28,
      puzzleRushBestStreak: 14,
      streakSurvivorHighScore: 22,
      totalRushRuns: 15,
    },
    solvedPuzzles: {
      puz_fork_001: { stars: 3, solvedAt: 1500 },
      puz_pin_005: { stars: 2, solvedAt: 1600 },
    },
    createdAt: 1000,
    lastActiveAt: 2000,
  };

  describe('InMemoryPuzzleProgressStore', () => {
    it('implements restoreProgress for lossless restoration of all Hub progress fields', async () => {
      const store: PuzzleProgressStore = new InMemoryPuzzleProgressStore();

      await store.restoreProgress(fullProgress);
      const retrieved = await store.getProgress();

      expect(retrieved.ratingProfile.rating).toBe(1420);
      expect(retrieved.ratingProfile.peakRating).toBe(1450);
      expect(retrieved.ratingProfile.bestStreak).toBe(12);
      expect(retrieved.ratingProfile.ratingHistory.length).toBe(2);

      expect(retrieved.themeMastery.fork?.masteryLevel).toBe('master');
      expect(retrieved.themeMastery.fork?.starsEarned).toBe(50);
      expect(retrieved.themeMastery.pin?.masteryLevel).toBe('apprentice');

      expect(retrieved.arcadeStats.puzzleRushHighScore).toBe(28);
      expect(retrieved.arcadeStats.streakSurvivorHighScore).toBe(22);
      expect(retrieved.arcadeStats.totalRushRuns).toBe(15);

      expect(retrieved.solvedPuzzles.puz_fork_001?.stars).toBe(3);
      expect(retrieved.solvedPuzzles.puz_pin_005?.stars).toBe(2);
    });
  });

  describe('LocalStoragePuzzleProgressStore', () => {
    let mockStorage: Record<string, string>;

    beforeEach(() => {
      mockStorage = {};
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('implements restoreProgress with serialization and sanitization to local storage', async () => {
      const store: PuzzleProgressStore = new LocalStoragePuzzleProgressStore('test_puzzle_key');

      await store.restoreProgress(fullProgress);
      const retrieved = await store.getProgress();

      expect(retrieved.ratingProfile.rating).toBe(1420);
      expect(retrieved.themeMastery.fork?.masteryLevel).toBe('master');
      expect(retrieved.arcadeStats.puzzleRushHighScore).toBe(28);
      expect(retrieved.solvedPuzzles.puz_fork_001?.stars).toBe(3);

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'test_puzzle_key',
        expect.any(String)
      );
    });

    it('notifies storageAlertDispatcher and throws on QuotaExceededError (ENH-009)', async () => {
      const store = new LocalStoragePuzzleProgressStore('test_puzzle_quota_key');

      const quotaErr = new DOMException('Quota exceeded', 'QuotaExceededError');
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw quotaErr;
      });

      const listener = vi.fn();
      const unsubscribe = storageAlertDispatcher.subscribe(listener);

      try {
        await expect(store.restoreProgress(fullProgress)).rejects.toThrow();

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'STORAGE_QUOTA_EXCEEDED',
            store: 'puzzles',
            attemptedAction: 'save',
            suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
          })
        );
      } finally {
        unsubscribe();
      }
    });
  });
});
