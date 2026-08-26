import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  InMemoryProgressStore,
  InMemoryScenarioProgressStore,
} from '../in_memory_progress.store';
import type { ScenarioProgressMap, StarRating } from '@fun-chess/shared';

describe('InMemoryScenarioProgressStore', () => {
  let store: InMemoryScenarioProgressStore;

  beforeEach(() => {
    store = new InMemoryScenarioProgressStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State & Pre-population', () => {
    it('returns empty progress map when newly initialized without initial data', async () => {
      const map = await store.getProgressMap();
      expect(map).toEqual({});
      expect(Object.keys(map)).toHaveLength(0);
    });

    it('returns null when querying progress for an uncompleted scenario', async () => {
      const progress = await store.getProgress('unstarted-scenario-id');
      expect(progress).toBeNull();
    });

    it('initializes correctly with pre-populated progress data in constructor', async () => {
      const initialData: ScenarioProgressMap = {
        'pawn-journey': {
          scenarioId: 'pawn-journey',
          starsEarned: 3,
          attemptsCount: 1,
          hintsUsedTotal: 0,
          firstCompletedAt: 1000000,
          lastCompletedAt: 1000000,
        },
        'knight-jumps': {
          scenarioId: 'knight-jumps',
          starsEarned: 2,
          attemptsCount: 2,
          hintsUsedTotal: 1,
          firstCompletedAt: 1000500,
          lastCompletedAt: 1000600,
        },
      };

      const populatedStore = new InMemoryScenarioProgressStore(initialData);
      const map = await populatedStore.getProgressMap();

      expect(Object.keys(map)).toHaveLength(2);
      expect(map['pawn-journey']).toEqual(initialData['pawn-journey']);
      expect(map['knight-jumps']).toEqual(initialData['knight-jumps']);

      const single = await populatedStore.getProgress('pawn-journey');
      expect(single).toEqual(initialData['pawn-journey']);
    });

    it('creates deep copies of initial data to prevent external mutation leaks', async () => {
      const initialRecord = {
        scenarioId: 'bishop-diagonals',
        starsEarned: 3 as StarRating,
        attemptsCount: 1,
        hintsUsedTotal: 0,
        firstCompletedAt: 1000,
        lastCompletedAt: 1000,
      };
      const initialData: ScenarioProgressMap = {
        'bishop-diagonals': initialRecord,
      };

      const populatedStore = new InMemoryScenarioProgressStore(initialData);
      // Mutate original initial data
      initialRecord.starsEarned = 1 as StarRating;

      const retrieved = await populatedStore.getProgress('bishop-diagonals');
      expect(retrieved?.starsEarned).toBe(3);
    });
  });

  describe('Saving Scenario Progress', () => {
    it('saves a new scenario completion record with valid metadata', async () => {
      const fixedTime = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(fixedTime);

      const saved = await store.saveProgress('pawn-journey', 3, 0);

      expect(saved).toEqual({
        scenarioId: 'pawn-journey',
        starsEarned: 3,
        attemptsCount: 1,
        hintsUsedTotal: 0,
        firstCompletedAt: fixedTime,
        lastCompletedAt: fixedTime,
      });

      const retrieved = await store.getProgress('pawn-journey');
      expect(retrieved).toEqual(saved);
    });

    it('returns an isolated copy from saveProgress and getProgress to prevent external mutation', async () => {
      const saved = await store.saveProgress('rook-lines', 2, 1);
      // Mutate returned object
      (saved as { starsEarned: StarRating }).starsEarned = 1 as StarRating;

      const retrieved = await store.getProgress('rook-lines');
      expect(retrieved?.starsEarned).toBe(2);

      if (retrieved) {
        (retrieved as { attemptsCount: number }).attemptsCount = 99;
      }

      const freshFetch = await store.getProgress('rook-lines');
      expect(freshFetch?.attemptsCount).toBe(1);
    });
  });

  describe('Star Ratings & Upgrade Rules', () => {
    it('records and upgrades star rating when player improves (1 star -> 3 stars)', async () => {
      // First attempt: 1 star with 2 hints
      const first = await store.saveProgress('royal-fork', 1, 2);
      expect(first.starsEarned).toBe(1);
      expect(first.attemptsCount).toBe(1);
      expect(first.hintsUsedTotal).toBe(2);

      // Replay attempt: 3 stars with 0 hints
      const upgraded = await store.saveProgress('royal-fork', 3, 0);
      expect(upgraded.starsEarned).toBe(3);
      expect(upgraded.attemptsCount).toBe(2);
      expect(upgraded.hintsUsedTotal).toBe(2); // 2 + 0

      const check = await store.getProgress('royal-fork');
      expect(check?.starsEarned).toBe(3);
      expect(check?.attemptsCount).toBe(2);
    });

    it('preserves the highest star rating when replay achieves fewer stars (3 stars -> 1 star)', async () => {
      // First attempt: 3 stars
      await store.saveProgress('scholars-mate-attack', 3, 0);

      // Replay attempt: 1 star with 3 hints
      const result = await store.saveProgress('scholars-mate-attack', 1, 3);
      expect(result.starsEarned).toBe(3); // Max stars preserved
      expect(result.attemptsCount).toBe(2);
      expect(result.hintsUsedTotal).toBe(3); // Cumulative hints tracked

      const check = await store.getProgress('scholars-mate-attack');
      expect(check?.starsEarned).toBe(3);
    });

    it('handles equal star rating replay correctly', async () => {
      await store.saveProgress('queen-mastery', 2, 1);
      const second = await store.saveProgress('queen-mastery', 2, 0);

      expect(second.starsEarned).toBe(2);
      expect(second.attemptsCount).toBe(2);
      expect(second.hintsUsedTotal).toBe(1);
    });
  });

  describe('Attempt Counts & Timestamps', () => {
    it('increments attempt count sequentially on each completion', async () => {
      await store.saveProgress('pin-tactics', 1, 1);
      await store.saveProgress('pin-tactics', 2, 1);
      const third = await store.saveProgress('pin-tactics', 3, 0);

      expect(third.attemptsCount).toBe(3);
      expect(third.hintsUsedTotal).toBe(2); // 1 + 1 + 0
    });

    it('preserves firstCompletedAt and updates lastCompletedAt across attempts', async () => {
      const initialTimestamp = 1700000000000;
      const secondTimestamp = 1700000050000;

      vi.spyOn(Date, 'now').mockReturnValue(initialTimestamp);
      const first = await store.saveProgress('back-rank-mate', 2, 1);
      expect(first.firstCompletedAt).toBe(initialTimestamp);
      expect(first.lastCompletedAt).toBe(initialTimestamp);

      vi.spyOn(Date, 'now').mockReturnValue(secondTimestamp);
      const second = await store.saveProgress('back-rank-mate', 3, 0);
      expect(second.firstCompletedAt).toBe(initialTimestamp);
      expect(second.lastCompletedAt).toBe(secondTimestamp);
    });
  });

  describe('Reset Progress', () => {
    it('clears all scenario records from store on resetAllProgress', async () => {
      await store.saveProgress('scenario-1', 3, 0);
      await store.saveProgress('scenario-2', 2, 1);
      await store.saveProgress('scenario-3', 1, 2);

      let map = await store.getProgressMap();
      expect(Object.keys(map)).toHaveLength(3);

      await store.resetAllProgress();

      map = await store.getProgressMap();
      expect(map).toEqual({});
      expect(Object.keys(map)).toHaveLength(0);
      expect(await store.getProgress('scenario-1')).toBeNull();
    });
  });

  describe('Category Stats & Aggregations', () => {
    it('accurately aggregates category completion counts, total stars, and attempt stats', async () => {
      const fundamentalsCategoryScenarios = [
        'pawn-journey',
        'knight-jumps',
        'bishop-diagonals',
        'rook-lines',
        'queen-mastery',
        'king-safety',
      ];

      // Complete 3 out of 6 scenarios in fundamentals
      await store.saveProgress('pawn-journey', 3, 0);
      await store.saveProgress('knight-jumps', 2, 1);
      await store.saveProgress('bishop-diagonals', 3, 0);

      // Complete a scenario outside fundamentals category
      await store.saveProgress('back-rank-mate', 3, 0);

      const map = await store.getProgressMap();

      // Query category stats for fundamentals
      const categoryResults = fundamentalsCategoryScenarios.map((id) => map[id] ?? null);
      const completedScenarios = categoryResults.filter((rec) => rec !== null && rec.starsEarned > 0);
      const starsEarned = completedScenarios.reduce((sum, rec) => sum + (rec?.starsEarned ?? 0), 0);
      const totalAttempts = completedScenarios.reduce((sum, rec) => sum + (rec?.attemptsCount ?? 0), 0);
      const maxPossibleStars = fundamentalsCategoryScenarios.length * 3;

      expect(completedScenarios).toHaveLength(3);
      expect(starsEarned).toBe(8); // 3 + 2 + 3
      expect(totalAttempts).toBe(3);
      expect(maxPossibleStars).toBe(18);
    });

    it('computes empty category statistics when no scenarios in the category are completed', async () => {
      const endgameScenarios = ['king-rook-mate', 'king-queen-mate', 'lucena-bridge'];
      const map = await store.getProgressMap();

      const completed = endgameScenarios.filter((id) => map[id] !== undefined && map[id].starsEarned > 0);
      const totalStars = completed.reduce((sum, id) => sum + map[id].starsEarned, 0);

      expect(completed).toHaveLength(0);
      expect(totalStars).toBe(0);
    });
  });

  describe('Export Alias Identity', () => {
    it('exports InMemoryProgressStore as InMemoryScenarioProgressStore with identical constructor behavior', () => {
      expect(InMemoryProgressStore).toBe(InMemoryScenarioProgressStore);

      const instanceA = new InMemoryProgressStore();
      const instanceB = new InMemoryScenarioProgressStore();

      expect(instanceA).toBeInstanceOf(InMemoryProgressStore);
      expect(instanceB).toBeInstanceOf(InMemoryProgressStore);
    });
  });
});
