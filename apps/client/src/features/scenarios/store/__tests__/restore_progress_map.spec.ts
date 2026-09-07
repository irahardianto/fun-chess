import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemoryProgressStore } from '../in_memory_progress.store';
import { LocalStorageProgressStore } from '../local_storage_progress.store';
import { storageAlertDispatcher } from '@/platform/storage/storage_alert';
import type { ScenarioProgressMap } from '@fun-chess/shared';

describe('restoreProgressMap Preserves Historical Timestamps and Attempt Counts (CRIT-004)', () => {
  const HISTORICAL_FIRST_COMPLETED = 1680000000000;
  const HISTORICAL_LAST_COMPLETED = 1685000000000;
  const CURRENT_SYSTEM_TIME = 1725000000000;

  const historicalPayload: ScenarioProgressMap = {
    'pawn-journey': {
      scenarioId: 'pawn-journey',
      starsEarned: 3,
      attemptsCount: 7,
      hintsUsedTotal: 2,
      firstCompletedAt: HISTORICAL_FIRST_COMPLETED,
      lastCompletedAt: HISTORICAL_LAST_COMPLETED,
    },
    'knight-fork': {
      scenarioId: 'knight-fork',
      starsEarned: 2,
      attemptsCount: 15,
      hintsUsedTotal: 8,
      firstCompletedAt: HISTORICAL_FIRST_COMPLETED + 50000,
      lastCompletedAt: HISTORICAL_LAST_COMPLETED + 100000,
    },
  };

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(CURRENT_SYSTEM_TIME);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('InMemoryProgressStore', () => {
    let store: InMemoryProgressStore;

    beforeEach(() => {
      store = new InMemoryProgressStore();
    });

    it('restores historical payload accurately preserving attemptsCount, firstCompletedAt, and lastCompletedAt', async () => {
      // Pre-seed with unrelated old progress to verify full replacement
      await store.saveProgress('old-lesson', 1, 1);

      await store.restoreProgressMap(historicalPayload);

      const map = await store.getProgressMap();
      expect(Object.keys(map)).toHaveLength(2);
      expect(map['old-lesson']).toBeUndefined();

      const pawn = map['pawn-journey'];
      expect(pawn).toBeDefined();
      expect(pawn?.attemptsCount).toBe(7);
      expect(pawn?.firstCompletedAt).toBe(HISTORICAL_FIRST_COMPLETED);
      expect(pawn?.lastCompletedAt).toBe(HISTORICAL_LAST_COMPLETED);
      expect(pawn?.starsEarned).toBe(3);
      expect(pawn?.hintsUsedTotal).toBe(2);

      // Verify NOT overwritten by current Date.now()
      expect(pawn?.firstCompletedAt).not.toBe(CURRENT_SYSTEM_TIME);
      expect(pawn?.lastCompletedAt).not.toBe(CURRENT_SYSTEM_TIME);
      // Verify NOT reset to 1
      expect(pawn?.attemptsCount).not.toBe(1);

      const knight = await store.getProgress('knight-fork');
      expect(knight).toBeDefined();
      expect(knight?.attemptsCount).toBe(15);
      expect(knight?.firstCompletedAt).toBe(HISTORICAL_FIRST_COMPLETED + 50000);
      expect(knight?.lastCompletedAt).toBe(HISTORICAL_LAST_COMPLETED + 100000);
    });

    it('subsequent saveProgress increments restored attempt count and preserves original firstCompletedAt', async () => {
      await store.restoreProgressMap(historicalPayload);

      const SUBSEQUENT_TIME = CURRENT_SYSTEM_TIME + 60000;
      vi.spyOn(Date, 'now').mockReturnValue(SUBSEQUENT_TIME);

      // Replay pawn-journey with 3 stars and 1 additional hint
      const updated = await store.saveProgress('pawn-journey', 3, 1);

      expect(updated.attemptsCount).toBe(8); // 7 + 1
      expect(updated.hintsUsedTotal).toBe(3); // 2 + 1
      expect(updated.firstCompletedAt).toBe(HISTORICAL_FIRST_COMPLETED); // preserved!
      expect(updated.lastCompletedAt).toBe(SUBSEQUENT_TIME); // updated to current replay time
    });

    it('creates deep copies on restoreProgressMap to prevent external mutation leaks', async () => {
      const clonedInput = structuredClone(historicalPayload);
      await store.restoreProgressMap(clonedInput);

      // Mutate local object after restore to ensure stored copy is isolated
      const mutableRecord = clonedInput['pawn-journey'] as unknown as Record<string, unknown>;
      mutableRecord['attemptsCount'] = 999;
      mutableRecord['starsEarned'] = 1;

      const stored = await store.getProgress('pawn-journey');
      expect(stored?.attemptsCount).toBe(7);
      expect(stored?.starsEarned).toBe(3);
    });
  });

  describe('LocalStorageProgressStore', () => {
    const TEST_STORAGE_KEY = 'test_scenario_restore_progress';
    let store: LocalStorageProgressStore;
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
        clear: vi.fn(() => {
          mockStorage = {};
        }),
      });

      store = new LocalStorageProgressStore(TEST_STORAGE_KEY);
    });

    it('restores progress map into localStorage preserving original timestamps and attempt counts', async () => {
      await store.restoreProgressMap(historicalPayload);

      const map = await store.getProgressMap();
      expect(Object.keys(map)).toHaveLength(2);

      const pawn = map['pawn-journey'];
      expect(pawn).toBeDefined();
      expect(pawn?.attemptsCount).toBe(7);
      expect(pawn?.firstCompletedAt).toBe(HISTORICAL_FIRST_COMPLETED);
      expect(pawn?.lastCompletedAt).toBe(HISTORICAL_LAST_COMPLETED);
      expect(pawn?.hintsUsedTotal).toBe(2);

      // Verify timestamps NOT overwritten by current Date.now()
      expect(pawn?.firstCompletedAt).not.toBe(CURRENT_SYSTEM_TIME);
      expect(pawn?.lastCompletedAt).not.toBe(CURRENT_SYSTEM_TIME);

      // Verify persisted in localStorage JSON
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        TEST_STORAGE_KEY,
        expect.stringContaining('"pawn-journey"')
      );
      const rawStored = JSON.parse(mockStorage[TEST_STORAGE_KEY]!);
      expect(rawStored['pawn-journey'].attemptsCount).toBe(7);
      expect(rawStored['pawn-journey'].firstCompletedAt).toBe(HISTORICAL_FIRST_COMPLETED);
      expect(rawStored['pawn-journey'].lastCompletedAt).toBe(HISTORICAL_LAST_COMPLETED);
    });

    it('subsequent saveProgress after restore builds incrementally upon restored attempt count', async () => {
      await store.restoreProgressMap(historicalPayload);

      const NEXT_TIME = CURRENT_SYSTEM_TIME + 120000;
      vi.spyOn(Date, 'now').mockReturnValue(NEXT_TIME);

      const updated = await store.saveProgress('knight-fork', 3, 0);

      expect(updated.attemptsCount).toBe(16); // 15 + 1
      expect(updated.starsEarned).toBe(3); // upgraded from 2 to 3
      expect(updated.firstCompletedAt).toBe(HISTORICAL_FIRST_COMPLETED + 50000); // preserved!
      expect(updated.lastCompletedAt).toBe(NEXT_TIME);
    });

    it('sanitizes corrupt records and enforces valid defaults on malformed imported items', async () => {
      const corruptPayload: ScenarioProgressMap = {
        'valid-entry': {
          scenarioId: 'valid-entry',
          starsEarned: 3,
          attemptsCount: 5,
          hintsUsedTotal: 1,
          firstCompletedAt: 1670000000000,
          lastCompletedAt: 1675000000000,
        },
        'corrupt-no-id': {
          scenarioId: '' as any,
          starsEarned: 3,
          attemptsCount: 2,
          hintsUsedTotal: 0,
          firstCompletedAt: 1670000000000,
          lastCompletedAt: 1670000000000,
        },
        'corrupt-negative-attempts': {
          scenarioId: 'corrupt-negative-attempts',
          starsEarned: 1,
          attemptsCount: -10,
          hintsUsedTotal: -5,
          firstCompletedAt: 0,
          lastCompletedAt: 0,
        },
      };

      await store.restoreProgressMap(corruptPayload);

      const map = await store.getProgressMap();
      expect(map['valid-entry']).toBeDefined();
      expect(map['valid-entry']?.attemptsCount).toBe(5);

      // Missing scenarioId must be excluded
      expect(map['corrupt-no-id']).toBeUndefined();

      // Negative attempts clamped to minimum 1, timestamps defaulting to Date.now()
      expect(map['corrupt-negative-attempts']?.attemptsCount).toBe(1);
      expect(map['corrupt-negative-attempts']?.hintsUsedTotal).toBe(0);
      expect(map['corrupt-negative-attempts']?.firstCompletedAt).toBe(CURRENT_SYSTEM_TIME);
    });

    it('emits quota alert and rethrows when localStorage throws QuotaExceededError during restoreProgressMap', async () => {
      const quotaErr = new DOMException('QuotaExceeded', 'QuotaExceededError');
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw quotaErr;
      });

      const listener = vi.fn();
      const unsubscribe = storageAlertDispatcher.subscribe(listener);

      try {
        await expect(store.restoreProgressMap(historicalPayload)).rejects.toThrow();

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'STORAGE_QUOTA_EXCEEDED',
            store: 'scenarios',
            attemptedAction: 'save',
            suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
          })
        );
      } finally {
        unsubscribe();
      }
    });

    it('operates via memory fallback when storage is restricted or unavailable', async () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        }),
        setItem: vi.fn(() => {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
      });

      const fallbackStore = new LocalStorageProgressStore('safari_private_key');
      await fallbackStore.restoreProgressMap(historicalPayload);

      const retrieved = await fallbackStore.getProgress('pawn-journey');
      expect(retrieved).toBeDefined();
      expect(retrieved?.attemptsCount).toBe(7);
      expect(retrieved?.firstCompletedAt).toBe(HISTORICAL_FIRST_COMPLETED);
      expect(retrieved?.lastCompletedAt).toBe(HISTORICAL_LAST_COMPLETED);
    });
  });
});
