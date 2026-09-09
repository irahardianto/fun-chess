import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryPuzzleProgressStore } from '../in_memory_puzzle_progress.store';


describe('InMemoryPuzzleProgressStore (Test Adapter)', () => {
  let store: InMemoryPuzzleProgressStore;

  beforeEach(() => {
    store = new InMemoryPuzzleProgressStore();
  });

  it('provides zero-dependency in-memory storage without accessing DOM or localStorage', async () => {
    const initial = await store.getProgress();
    expect(initial.ratingProfile.rating).toBe(800);
    expect(initial.ratingProfile.totalSolved).toBe(0);
  });

  it('records attempts and updates stats in memory', async () => {
    await store.recordPuzzleAttempt('puz_001', 'fork', 'solved_first_try', 3);
    const updated = await store.getProgress();

    expect(updated.solvedPuzzles['puz_001']).toBeDefined();
    expect(updated.solvedPuzzles['puz_001']?.stars).toBe(3);
    expect(updated.ratingProfile.totalSolved).toBe(1);
  });

  it('updates ratings and saves arcade scores', async () => {
    await store.updateRating({
      rating: 1200,
      ratingDeviation: 150,
      peakRating: 1200,
      totalAttempted: 5,
      totalSolved: 5,
      bestStreak: 5,
      ratingHistory: [],
    });

    await store.saveArcadeResult('puzzle_rush', 12, 5);

    const progress = await store.getProgress();
    expect(progress.ratingProfile.rating).toBe(1200);
    expect(progress.arcadeStats.puzzleRushHighScore).toBe(12);
  });

  it('resets in-memory state on resetAll', async () => {
    await store.recordPuzzleAttempt('puz_001', 'fork', 'solved_first_try', 3);
    await store.resetAll();

    const progress = await store.getProgress();
    expect(progress.ratingProfile.totalSolved).toBe(0);
    expect(Object.keys(progress.solvedPuzzles).length).toBe(0);
  });

  it('uses injected IClock for deterministic timestamping', async () => {
    const fixedTime = 1700000000000;
    const mockClock = { now: () => fixedTime };
    const timedStore = new InMemoryPuzzleProgressStore(undefined, mockClock);

    const res = await timedStore.recordPuzzleAttempt('puz_001', 'fork', 'solved_first_try', 3);
    expect(res.lastActiveAt).toBe(fixedTime);
    expect(res.solvedPuzzles['puz_001']?.solvedAt).toBe(fixedTime);
  });
});

