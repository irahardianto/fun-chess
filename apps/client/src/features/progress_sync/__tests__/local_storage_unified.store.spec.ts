import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalStorageUnifiedStore } from '@/features/portability/store/local_storage_unified.store';
import { InMemoryUnifiedStoreMock } from '@/features/portability/store/in_memory_unified.store.mock';
import type { UnifiedProgressPayload } from '@fun-chess/shared';

describe('LocalStorageUnifiedStore & InMemoryUnifiedStoreMock', () => {
  let mockStorage: Record<string, string> = {};

  const createMockPayload = (elo: number = 1100): UnifiedProgressPayload => ({
    version: 1,
    exportedAt: 1700000000000,
    scenarios: {
      'lesson_pawn_1': {
        scenarioId: 'lesson_pawn_1',
        starsEarned: 3,
        attemptsCount: 1,
        hintsUsedTotal: 0,
        firstCompletedAt: 1700000000000,
        lastCompletedAt: 1700000000000,
      },
    },
    puzzles: {
      ratingProfile: {
        rating: elo,
        ratingDeviation: 100,
        peakRating: elo,
        totalAttempted: 15,
        totalSolved: 12,
        bestStreak: 6,
        ratingHistory: [],
      },
      themeMastery: {},
      arcadeStats: {
        puzzleRushHighScore: 14,
        puzzleRushBestStreak: 7,
        streakSurvivorHighScore: 9,
        totalRushRuns: 3,
      },
      solvedPuzzles: {},
      createdAt: 1699000000000,
      lastActiveAt: 1700000000000,
    },
  });

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };
    vi.stubGlobal('localStorage', storageMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aggregates scenario and puzzle progress into a complete UnifiedProgressPayload', async () => {
    // Arrange
    const store = new LocalStorageUnifiedStore();
    const payload = createMockPayload(1200);
    await store.saveUnifiedProgress(payload);

    // Act
    const result = await store.getUnifiedProgress();

    // Assert
    expect(result.version).toBe(1);
    expect(result.scenarios['lesson_pawn_1']?.starsEarned).toBe(3);
    expect(result.puzzles.ratingProfile.rating).toBe(1200);
  });

  it('overwrites and persists updated payload across single-player sub-stores', async () => {
    // Arrange
    const store = new LocalStorageUnifiedStore();
    const initial = createMockPayload(1000);
    await store.saveUnifiedProgress(initial);

    const updated = createMockPayload(1400);

    // Act
    await store.saveUnifiedProgress(updated);
    const result = await store.getUnifiedProgress();

    // Assert
    expect(result.puzzles.ratingProfile.rating).toBe(1400);
  });

  it('InMemoryUnifiedStoreMock provides isolated test double without localStorage dependency', async () => {
    // Arrange
    const initial = createMockPayload(1150);
    const mockStore = new InMemoryUnifiedStoreMock(initial);

    // Act
    const read = await mockStore.getUnifiedProgress();
    expect(read.puzzles.ratingProfile.rating).toBe(1150);

    const updated = createMockPayload(1500);
    await mockStore.saveUnifiedProgress(updated);
    const readAfterSave = await mockStore.getUnifiedProgress();

    // Assert
    expect(readAfterSave.puzzles.ratingProfile.rating).toBe(1500);
  });
});
