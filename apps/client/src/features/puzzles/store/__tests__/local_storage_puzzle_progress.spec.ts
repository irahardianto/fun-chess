import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LocalStoragePuzzleProgressStore,
  PUZZLE_PROGRESS_STORAGE_KEY,
} from '../local_storage_puzzle_store';

describe('LocalStoragePuzzleProgressStore', () => {
  let store: LocalStoragePuzzleProgressStore;
  let mockStorage: Record<string, string> = {};

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
    if (typeof window !== 'undefined') {
      vi.stubGlobal('window', {
        ...window,
        localStorage: storageMock,
      });
    }
    store = new LocalStoragePuzzleProgressStore(PUZZLE_PROGRESS_STORAGE_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default progress when storage is empty', async () => {
    const progress = await store.getProgress();
    expect(progress.ratingProfile.rating).toBe(800);
    expect(progress.ratingProfile.totalSolved).toBe(0);
    expect(progress.arcadeStats.puzzleRushHighScore).toBe(0);
    expect(Object.keys(progress.solvedPuzzles).length).toBe(0);
  });

  it('records puzzle attempt and updates theme mastery & solved records', async () => {
    const updated = await store.recordPuzzleAttempt('puz_fork_001', 'fork', 'solved_first_try', 3);

    expect(updated.solvedPuzzles['puz_fork_001']).toBeDefined();
    expect(updated.solvedPuzzles['puz_fork_001']?.stars).toBe(3);
    expect(updated.ratingProfile.totalSolved).toBe(1);
    expect(updated.ratingProfile.totalAttempted).toBe(1);

    const forkMastery = updated.themeMastery['fork'];
    expect(forkMastery).toBeDefined();
    expect(forkMastery!.solved).toBe(1);
    expect(forkMastery!.starsEarned).toBe(3);
    expect(forkMastery!.masteryLevel).toBe('novice');

    // Check persistence across instances
    const newInstance = new LocalStoragePuzzleProgressStore(PUZZLE_PROGRESS_STORAGE_KEY);
    const persisted = await newInstance.getProgress();
    expect(persisted.solvedPuzzles['puz_fork_001']?.stars).toBe(3);
  });

  it('upgrades mastery level when solving many puzzles in a theme', async () => {
    for (let i = 0; i < 8; i++) {
      await store.recordPuzzleAttempt(`puz_fork_${i}`, 'fork', 'solved_first_try', 3);
    }

    const progress = await store.getProgress();
    expect(progress.themeMastery['fork']?.masteryLevel).toBe('apprentice');
  });

  it('updates adaptive rating state and tracks peak rating', async () => {
    await store.updateRating({
      rating: 1150,
      ratingDeviation: 200,
      peakRating: 1150,
      totalAttempted: 10,
      totalSolved: 8,
      bestStreak: 5,
      ratingHistory: [],
    });

    const progress = await store.getProgress();
    expect(progress.ratingProfile.rating).toBe(1150);
    expect(progress.ratingProfile.peakRating).toBe(1150);
  });

  it('saves arcade results for rush and survivor modes', async () => {
    await store.saveArcadeResult('puzzle_rush', 15, 6);
    await store.saveArcadeResult('streak_survivor', 22, 22);

    const progress = await store.getProgress();
    expect(progress.arcadeStats.puzzleRushHighScore).toBe(15);
    expect(progress.arcadeStats.puzzleRushBestStreak).toBe(6);
    expect(progress.arcadeStats.streakSurvivorHighScore).toBe(22);
    expect(progress.arcadeStats.totalRushRuns).toBe(1);
  });

  it('resets all user progress cleanly', async () => {
    await store.recordPuzzleAttempt('puz_001', 'fork', 'solved_first_try', 3);
    await store.resetAll();

    const progress = await store.getProgress();
    expect(progress.ratingProfile.totalSolved).toBe(0);
    expect(Object.keys(progress.solvedPuzzles).length).toBe(0);
  });

  it('recovers gracefully from corrupted JSON data in localStorage', async () => {
    window.localStorage.setItem(PUZZLE_PROGRESS_STORAGE_KEY, '{ invalid_json ::: "corrupt" }');

    const progress = await store.getProgress();
    expect(progress.ratingProfile.rating).toBe(800);
    expect(progress.ratingProfile.totalSolved).toBe(0);
  });

  it('falls back seamlessly to in-memory cache when localStorage throws quota exceeded error', async () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const res = await store.recordPuzzleAttempt('puz_quota_001', 'pin', 'solved_first_try', 3);
    expect(res.solvedPuzzles['puz_quota_001']).toBeDefined();
    expect(res.solvedPuzzles['puz_quota_001']?.stars).toBe(3);

    const progress = await store.getProgress();
    expect(progress.solvedPuzzles['puz_quota_001']).toBeDefined();
  });
});
