import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LocalStorageProgressStore } from '../local_storage_progress.store';

describe('LocalStorageProgressStore', () => {
  const TEST_STORAGE_KEY = 'test_fun_chess_scenario_progress';
  let store: LocalStorageProgressStore;
  let mockStorage: Record<string, string> = {};

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
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    });

    store = new LocalStorageProgressStore(TEST_STORAGE_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State & Basic Retrieval', () => {
    it('returns empty progress map when storage is empty', async () => {
      const map = await store.getProgressMap();
      expect(map).toEqual({});
    });

    it('returns null when querying an uncompleted scenario', async () => {
      const progress = await store.getProgress('knight-fork');
      expect(progress).toBeNull();
    });
  });

  describe('Progress Persistence & Upgrades', () => {
    it('saves a new scenario completion record and persists to localStorage', async () => {
      const saved = await store.saveProgress('pawn-journey', 3, 0);

      expect(saved.scenarioId).toBe('pawn-journey');
      expect(saved.starsEarned).toBe(3);
      expect(saved.attemptsCount).toBe(1);
      expect(saved.hintsUsedTotal).toBe(0);
      expect(saved.firstCompletedAt).toBeGreaterThan(0);
      expect(saved.lastCompletedAt).toBe(saved.firstCompletedAt);

      // Verify persisted JSON
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        TEST_STORAGE_KEY,
        expect.stringContaining('"pawn-journey"')
      );

      // Verify retrieval
      const retrieved = await store.getProgress('pawn-journey');
      expect(retrieved).toEqual(saved);
    });

    it('upgrades stars when player improves score (1 star -> 3 stars)', async () => {
      // First attempt: 1 star with 2 hints
      await store.saveProgress('royal-fork', 1, 2);
      const first = await store.getProgress('royal-fork');
      expect(first?.starsEarned).toBe(1);
      expect(first?.attemptsCount).toBe(1);
      expect(first?.hintsUsedTotal).toBe(2);

      // Second attempt: 3 stars with 0 hints
      const upgraded = await store.saveProgress('royal-fork', 3, 0);
      expect(upgraded.starsEarned).toBe(3);
      expect(upgraded.attemptsCount).toBe(2);
      expect(upgraded.hintsUsedTotal).toBe(2); // 2 + 0

      const finalCheck = await store.getProgress('royal-fork');
      expect(finalCheck?.starsEarned).toBe(3);
      expect(finalCheck?.attemptsCount).toBe(2);
    });

    it('does not downgrade highest star rating if replay has lower stars', async () => {
      // First attempt: 3 stars
      await store.saveProgress('scholars-mate-attack', 3, 0);

      // Replay attempt: 1 star
      const result = await store.saveProgress('scholars-mate-attack', 1, 3);

      expect(result.starsEarned).toBe(3); // Preserved best rating
      expect(result.attemptsCount).toBe(2);
      expect(result.hintsUsedTotal).toBe(3); // Cumulative hints tracked
    });

    it('preserves firstCompletedAt and updates lastCompletedAt across multiple attempts', async () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const first = await store.saveProgress('pin-tactics', 2, 1);
      expect(first.firstCompletedAt).toBe(now);
      expect(first.lastCompletedAt).toBe(now);

      const later = now + 5000;
      vi.spyOn(Date, 'now').mockReturnValue(later);

      const second = await store.saveProgress('pin-tactics', 3, 0);
      expect(second.firstCompletedAt).toBe(now);
      expect(second.lastCompletedAt).toBe(later);
    });
  });

  describe('Reset Progress', () => {
    it('resets and clears all progress in memory and localStorage', async () => {
      await store.saveProgress('lesson-1', 3, 0);
      await store.saveProgress('lesson-2', 2, 1);

      let map = await store.getProgressMap();
      expect(Object.keys(map).length).toBe(2);

      await store.resetAllProgress();

      map = await store.getProgressMap();
      expect(map).toEqual({});
      expect(window.localStorage.removeItem).toHaveBeenCalledWith(TEST_STORAGE_KEY);
    });
  });

  describe('Corruption Resilience & Defense in Depth', () => {
    it('handles corrupted invalid JSON in localStorage gracefully without throwing', async () => {
      mockStorage[TEST_STORAGE_KEY] = '{invalid-json-payload-###';

      const map = await store.getProgressMap();
      expect(map).toEqual({});
    });

    it('handles non-object JSON payloads (e.g. numbers or arrays) gracefully', async () => {
      mockStorage[TEST_STORAGE_KEY] = JSON.stringify(['not', 'an', 'object']);

      const map = await store.getProgressMap();
      expect(map).toEqual({});
    });

    it('sanitizes and filters out malformed individual records in storage', async () => {
      const corruptedData = {
        'valid-1': {
          scenarioId: 'valid-1',
          starsEarned: 3,
          attemptsCount: 1,
          hintsUsedTotal: 0,
          firstCompletedAt: 1000,
          lastCompletedAt: 1000,
        },
        'corrupt-missing-id': {
          starsEarned: 3,
        },
        'corrupt-invalid-stars': {
          scenarioId: 'corrupt-invalid-stars',
          starsEarned: 'not-a-star',
          attemptsCount: -5,
        },
      };

      mockStorage[TEST_STORAGE_KEY] = JSON.stringify(corruptedData);

      const map = await store.getProgressMap();
      expect(map['valid-1']).toBeDefined();
      expect(map['valid-1']?.starsEarned).toBe(3);

      // Corrupt missing ID should be discarded
      expect(map['corrupt-missing-id']).toBeUndefined();

      // Sanitized record should have valid defaults
      expect(map['corrupt-invalid-stars']).toBeDefined();
      expect(map['corrupt-invalid-stars']?.starsEarned).toBe(1); // default clamped
      expect(map['corrupt-invalid-stars']?.attemptsCount).toBe(1);
    });

    it('operates via in-memory fallback when localStorage is unavailable or throws errors', async () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => {
          throw new Error('QuotaExceededError');
        }),
        setItem: vi.fn(() => {
          throw new Error('SecurityError');
        }),
        removeItem: vi.fn(() => {
          throw new Error('SecurityError');
        }),
      });

      const fallbackStore = new LocalStorageProgressStore(TEST_STORAGE_KEY);

      const saved = await fallbackStore.saveProgress('offline-lesson', 3, 0);
      expect(saved.scenarioId).toBe('offline-lesson');
      expect(saved.starsEarned).toBe(3);

      const retrieved = await fallbackStore.getProgress('offline-lesson');
      expect(retrieved?.starsEarned).toBe(3);
    });
  });
});
