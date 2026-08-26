import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStoragePuzzleProgressStore } from '../store/local_storage_puzzle_progress.store';
import { InMemoryPuzzleProgressStore } from '../store/in_memory_puzzle_progress.store';

describe('Puzzle Progress Store (Production & Test Adapters)', () => {
  describe('InMemoryPuzzleProgressStore', () => {
    let store: InMemoryPuzzleProgressStore;

    beforeEach(() => {
      store = new InMemoryPuzzleProgressStore();
    });

    it('initializes with default values', async () => {
      const p = await store.getProgress();
      expect(p.ratingProfile.rating).toBe(800);
      expect(p.arcadeStats.puzzleRushHighScore).toBe(0);
      expect(Object.keys(p.solvedPuzzles).length).toBe(0);
    });

    it('records puzzle attempt and updates mastery', async () => {
      const updated = await store.recordPuzzleAttempt('puz_fork_001', 'fork', 'solved_first_try', 3);
      expect(updated.solvedPuzzles['puz_fork_001'].stars).toBe(3);
      expect(updated.themeMastery['fork'].solved).toBe(1);
      expect(updated.themeMastery['fork'].starsEarned).toBe(3);
    });

    it('saves arcade results', async () => {
      const updated = await store.saveArcadeResult('puzzle_rush', 12, 5);
      expect(updated.arcadeStats.puzzleRushHighScore).toBe(12);
      expect(updated.arcadeStats.puzzleRushBestStreak).toBe(5);
      expect(updated.arcadeStats.totalRushRuns).toBe(1);
    });
  });

  describe('LocalStoragePuzzleProgressStore', () => {
    let store: LocalStoragePuzzleProgressStore;

    beforeEach(() => {
      store = new LocalStoragePuzzleProgressStore('test_puz_storage_key');
    });

    it('saves and loads progress via adapter', async () => {
      await store.recordPuzzleAttempt('puz_pin_001', 'pin', 'solved_first_try', 2);
      const loaded = await store.getProgress();
      expect(loaded.solvedPuzzles['puz_pin_001'].stars).toBe(2);
      expect(loaded.themeMastery['pin'].solved).toBe(1);
    });
  });
});
