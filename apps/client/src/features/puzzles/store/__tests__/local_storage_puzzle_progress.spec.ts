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

  it('uses injected IClock for deterministic timestamping on lastActiveAt and recordPuzzleAttempt (MAJ-019)', async () => {
    const fixedTime = 1700000000000;
    const mockClock = { now: vi.fn(() => fixedTime) };
    const customStore = new LocalStoragePuzzleProgressStore(
      'test_clock_key',
      undefined,
      mockClock
    );

    await customStore.updateRating({
      rating: 900,
      ratingDeviation: 100,
      peakRating: 900,
      totalAttempted: 1,
      totalSolved: 1,
      bestStreak: 1,
      ratingHistory: [],
    });

    const progress = await customStore.getProgress();
    expect(progress.lastActiveAt).toBe(fixedTime);

    const attemptResult = await customStore.recordPuzzleAttempt('puz_fork_001', 'fork', 'solved_first_try', 3);
    expect(attemptResult.lastActiveAt).toBe(fixedTime);
    expect(attemptResult.solvedPuzzles['puz_fork_001']?.solvedAt).toBe(fixedTime);
    expect(attemptResult.themeMastery['fork']?.lastPracticedAt).toBe(fixedTime);
    expect(mockClock.now).toHaveBeenCalled();
  });

  it('handles failed attempts, star improvements, and master level progression', async () => {
    await store.resetAll();
    // 1. Failed attempt
    const failedResult = await store.recordPuzzleAttempt('puz_001', 'fork', 'failed', 0 as any);
    expect(failedResult.solvedPuzzles['puz_001']).toBeUndefined();
    expect(failedResult.ratingProfile.totalAttempted).toBe(1);
    expect(failedResult.ratingProfile.totalSolved).toBe(0);

    // 2. Solved with 1 star, then solved again with 3 stars
    await store.recordPuzzleAttempt('puz_001', 'fork', 'solved_with_hints', 1);
    expect((await store.getProgress()).solvedPuzzles['puz_001']?.stars).toBe(1);

    await store.recordPuzzleAttempt('puz_001', 'fork', 'solved_first_try', 3);
    expect((await store.getProgress()).solvedPuzzles['puz_001']?.stars).toBe(3);

    // 3. Solve 20 puzzles in a theme to achieve 'master' level
    for (let i = 2; i <= 20; i++) {
      await store.recordPuzzleAttempt(`puz_fork_${i}`, 'fork', 'solved_first_try', 3);
    }
    const finalProgress = await store.getProgress();
    expect(finalProgress.themeMastery['fork']?.masteryLevel).toBe('master');
  });

  it('restores progress and rethrows on quota exceeded during restoreProgress', async () => {
    const validProgress = await store.getProgress();
    await store.restoreProgress(validProgress);

    // Test quota error during restoreProgress (throwOnQuota = true)
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    });

    await expect(store.restoreProgress(validProgress)).rejects.toThrow('QuotaExceededError');
  });

  it('handles storage when storage is not available or throws generic error', async () => {
    const unavailableStorage = {
      isAvailable: () => false,
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };

    const memoryOnlyStore = new LocalStoragePuzzleProgressStore(
      'mem_key',
      unavailableStorage as any
    );

    const initial = await memoryOnlyStore.getProgress();
    expect(initial.ratingProfile.rating).toBe(800);

    await memoryOnlyStore.saveArcadeResult('streak_survivor', 10, 10);
    const updated = await memoryOnlyStore.getProgress();
    expect(updated.arcadeStats.streakSurvivorHighScore).toBe(10);

    await memoryOnlyStore.resetAll();
    expect((await memoryOnlyStore.getProgress()).arcadeStats.streakSurvivorHighScore).toBe(0);

    // Generic setItem error (non-quota)
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Disk IO error');
    });
    // Should log warning and update memoryCache without crashing
    await store.saveArcadeResult('puzzle_rush', 5, 2);
    expect((await store.getProgress()).arcadeStats.puzzleRushHighScore).toBe(5);

    // removeItem throwing during resetAll
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('Failed to remove');
    });
    await store.resetAll();
  });

  it('sanitizes null, array, and corrupted object structures gracefully', async () => {
    const testCases = [null, undefined, 'string', 123, [], { invalid: true }];
    for (const raw of testCases) {
      window.localStorage.setItem(PUZZLE_PROGRESS_STORAGE_KEY, JSON.stringify(raw));
      const p = await store.getProgress();
      expect(p.ratingProfile.rating).toBe(800);
    }
  });

  it('instantiates cleanly with default constructor arguments', async () => {
    const defaultInstance = new LocalStoragePuzzleProgressStore();
    expect(defaultInstance).toBeDefined();
    const p = await defaultInstance.getProgress();
    expect(p.ratingProfile.rating).toBe(800);
  });
});

