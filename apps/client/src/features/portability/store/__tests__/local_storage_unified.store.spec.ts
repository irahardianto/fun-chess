import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalStorageUnifiedStore } from '../local_storage_unified.store';
import { InMemoryUnifiedStoreMock, createEmptyUnifiedProgress } from '../in_memory_unified.store.mock';
import type { UnifiedProgressPayload } from '@fun-chess/shared';

describe('LocalStorageUnifiedStore & InMemoryUnifiedStoreMock', () => {
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    });
  });

  it('reads progress from both scenario and puzzle stores', async () => {
    const store = new LocalStorageUnifiedStore();
    const progress = await store.getUnifiedProgress();

    expect(progress.version).toBe(1);
    expect(progress.scenarios).toBeDefined();
    expect(progress.puzzles).toBeDefined();
    expect(progress.puzzles.ratingProfile.rating).toBe(800);
  });

  it('saves unified progress to local storage and updates underlying stores', async () => {
    const store = new LocalStorageUnifiedStore();
    const payload: UnifiedProgressPayload = {
      version: 1,
      exportedAt: 123456789,
      scenarios: {
        'lesson-1': {
          scenarioId: 'lesson-1',
          starsEarned: 3,
          attemptsCount: 2,
          hintsUsedTotal: 0,
          firstCompletedAt: 1000,
          lastCompletedAt: 2000,
        },
      },
      puzzles: {
        ratingProfile: {
          rating: 1250,
          ratingDeviation: 120,
          peakRating: 1300,
          totalAttempted: 15,
          totalSolved: 12,
          bestStreak: 6,
          ratingHistory: [],
        },
        themeMastery: {},
        arcadeStats: {
          puzzleRushHighScore: 20,
          puzzleRushBestStreak: 8,
          streakSurvivorHighScore: 15,
          totalRushRuns: 5,
        },
        solvedPuzzles: {},
        createdAt: 1000,
        lastActiveAt: 2000,
      },
    };

    await store.saveUnifiedProgress(payload);

    const reloaded = await store.getUnifiedProgress();
    expect(reloaded.puzzles.ratingProfile.rating).toBe(1250);
    expect(reloaded.scenarios['lesson-1']).toBeDefined();
    expect(reloaded.scenarios['lesson-1']?.starsEarned).toBe(3);
  });

  describe('InMemoryUnifiedStoreMock', () => {
    it('manages progress in memory without local storage dependency', async () => {
      const initial = createEmptyUnifiedProgress();
      const mock = new InMemoryUnifiedStoreMock(initial);

      const progress = await mock.getUnifiedProgress();
      expect(progress.version).toBe(1);

      const updated: UnifiedProgressPayload = {
        ...progress,
        puzzles: {
          ...progress.puzzles,
          ratingProfile: {
            ...progress.puzzles.ratingProfile,
            rating: 1400,
          },
        },
      };

      await mock.saveUnifiedProgress(updated);
      const afterSave = await mock.getUnifiedProgress();
      expect(afterSave.puzzles.ratingProfile.rating).toBe(1400);
    });
  });
});
