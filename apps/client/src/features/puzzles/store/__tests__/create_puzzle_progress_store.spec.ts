import { describe, it, expect } from 'vitest';
import type { IClock } from '@fun-chess/shared';
import { createPuzzleProgressStore } from '../index';
import { LocalStoragePuzzleProgressStore } from '../local_storage_puzzle_progress.store';
import { InMemoryPuzzleProgressStore } from '../in_memory_puzzle_progress.store';

describe('createPuzzleProgressStore Factory (MIN-027)', () => {
  const mockClock: IClock = {
    now: () => 1700000000000,
  };

  it('creates LocalStoragePuzzleProgressStore by default', () => {
    const store = createPuzzleProgressStore();
    expect(store).toBeInstanceOf(LocalStoragePuzzleProgressStore);
    expect(typeof store.getProgress).toBe('function');
    expect(typeof store.updateRating).toBe('function');
    expect(typeof store.saveArcadeResult).toBe('function');
  });

  it('creates LocalStoragePuzzleProgressStore when explicitly requested with custom clock', () => {
    const store = createPuzzleProgressStore('local', mockClock);
    expect(store).toBeInstanceOf(LocalStoragePuzzleProgressStore);
    expect(typeof store.recordPuzzleAttempt).toBe('function');
    expect(typeof store.saveArcadeResult).toBe('function');
  });

  it('creates InMemoryPuzzleProgressStore when memory type is requested', () => {
    const store = createPuzzleProgressStore('memory', mockClock);
    expect(store).toBeInstanceOf(InMemoryPuzzleProgressStore);
    expect(typeof store.getProgress).toBe('function');
    expect(typeof store.updateRating).toBe('function');
    expect(typeof store.recordPuzzleAttempt).toBe('function');
  });

  it('allows reading and updating rating on created in-memory store', async () => {
    const store = createPuzzleProgressStore('memory', mockClock);
    const initial = await store.getProgress();
    expect(initial.ratingProfile.rating).toBe(800);

    await store.updateRating({
      rating: 1250,
      ratingDeviation: 200,
      peakRating: 1250,
      totalAttempted: 5,
      totalSolved: 4,
      bestStreak: 3,
      ratingHistory: [],
    });

    const reloaded = await store.getProgress();
    expect(reloaded.ratingProfile.rating).toBe(1250);
    expect(reloaded.lastActiveAt).toBe(1700000000000);
  });
});
