import { describe, it, expect, vi } from 'vitest';
import { migrateStorageV1ToV2 } from '../migration';
import { STORAGE_KEYS, LEGACY_STORAGE_DEPRECATION_WINDOW_MS } from '../keys';
import { InMemoryStorageAdapter } from '../in_memory_storage_adapter';
import type { ILogger } from '@/platform/telemetry';

describe('Storage Migration (MIN-016 & MIN-018)', () => {
  const createMockLogger = (): ILogger => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  });

  it('skips migration when storage is unavailable', () => {
    const storage = new InMemoryStorageAdapter();
    storage.isAvailable = () => false;
    const logger = createMockLogger();

    const outcome = migrateStorageV1ToV2(storage, logger);
    expect(outcome.status).toBe('skipped');
    expect(logger.debug).toHaveBeenCalledWith(
      'Storage is unavailable; skipping v1->v2 puzzle progress migration',
      expect.objectContaining({ operation: 'storage_migration_v1_v2' })
    );
  });

  it('stamps deprecation timestamp when v2Data exists and legacy keys exist without timestamp (MIN-018)', () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2, JSON.stringify({ solved: [1, 2] }));
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, JSON.stringify({ solved: [1] }));

    const now = 1700000000000;
    const outcome = migrateStorageV1ToV2(storage, undefined, now);

    expect(outcome.status).toBe('already_migrated');
    expect(outcome.deprecationTimestamp).toBe(now);
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_DEPRECATED_AT)).toBe(String(now));
    expect(storage.getItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP)).toBe(String(now));
    // Legacy data is preserved
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1)).not.toBeNull();
  });

  it('retains legacy keys within 30-day grace window when deprecation timestamp exists', () => {
    const storage = new InMemoryStorageAdapter();
    const stampedAt = 1700000000000;
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2, JSON.stringify({ solved: [1, 2] }));
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY, JSON.stringify({ solved: [1] }));
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_DEPRECATED_AT, String(stampedAt));

    // 10 days later
    const now = stampedAt + 10 * 24 * 60 * 60 * 1000;
    const outcome = migrateStorageV1ToV2(storage, undefined, now);

    expect(outcome.status).toBe('already_migrated');
    expect(outcome.deprecationTimestamp).toBe(stampedAt);
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY)).not.toBeNull();
  });

  it('prunes legacy keys when >= 30 days have elapsed since deprecation timestamp', () => {
    const storage = new InMemoryStorageAdapter();
    const stampedAt = 1700000000000;
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2, JSON.stringify({ solved: [1, 2] }));
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, JSON.stringify({ solved: [1] }));
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY, JSON.stringify({ solved: [1] }));
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_DEPRECATED_AT, String(stampedAt));

    // Exactly 30 days later
    const now = stampedAt + LEGACY_STORAGE_DEPRECATION_WINDOW_MS;
    const outcome = migrateStorageV1ToV2(storage, undefined, now);

    expect(outcome.status).toBe('pruned');
    expect(outcome.deprecationTimestamp).toBe(stampedAt);
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_DEPRECATED_AT)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).not.toBeNull();
  });

  it('returns already_migrated when v2 exists and no legacy keys exist', () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2, JSON.stringify({ solved: [1, 2] }));

    const outcome = migrateStorageV1ToV2(storage);
    expect(outcome.status).toBe('already_migrated');
  });

  it('returns skipped when neither v2 nor legacy keys exist', () => {
    const storage = new InMemoryStorageAdapter();

    const outcome = migrateStorageV1ToV2(storage);
    expect(outcome.status).toBe('skipped');
  });

  it('migrates PUZZLE_PROGRESS_V1 to PUZZLE_PROGRESS_V2 and stamps deprecation timestamp', () => {
    const storage = new InMemoryStorageAdapter();
    const v1Data = { solvedPuzzles: ['p1', 'p2'], streak: 5 };
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, JSON.stringify(v1Data));

    const now = 1700000000000;
    const outcome = migrateStorageV1ToV2(storage, undefined, now);

    expect(outcome.status).toBe('migrated');
    expect(outcome.legacyKeyFound).toBe(STORAGE_KEYS.PUZZLE_PROGRESS_V1);
    expect(outcome.deprecationTimestamp).toBe(now);

    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBe(JSON.stringify(v1Data));
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_DEPRECATED_AT)).toBe(String(now));
    expect(storage.getItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP)).toBe(String(now));
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1)).toBe(JSON.stringify(v1Data));
  });

  it('migrates PUZZLE_PROGRESS_LEGACY when PUZZLE_PROGRESS_V1 is not present', () => {
    const storage = new InMemoryStorageAdapter();
    const legacyData = { solvedPuzzles: ['p1'] };
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY, JSON.stringify(legacyData));

    const now = 1700000000000;
    const outcome = migrateStorageV1ToV2(storage, undefined, now);

    expect(outcome.status).toBe('migrated');
    expect(outcome.legacyKeyFound).toBe(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY);
    expect(outcome.deprecationTimestamp).toBe(now);
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBe(JSON.stringify(legacyData));
  });

  it('handles invalid JSON in legacy storage gracefully as corrupt', () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, '{invalid json');

    const outcome = migrateStorageV1ToV2(storage);
    expect(outcome.status).toBe('corrupt');
    expect(outcome.legacyKeyFound).toBe(STORAGE_KEYS.PUZZLE_PROGRESS_V1);
    expect(outcome.error).toBeDefined();
  });

  it('handles non-object/array JSON in legacy storage as corrupt', () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, JSON.stringify(['not', 'an', 'object']));

    const outcome = migrateStorageV1ToV2(storage);
    expect(outcome.status).toBe('corrupt');
    expect(outcome.legacyKeyFound).toBe(STORAGE_KEYS.PUZZLE_PROGRESS_V1);
  });

  it('uses MIGRATION_V1_V2_TIMESTAMP fallback when PUZZLE_PROGRESS_DEPRECATED_AT is missing', () => {
    const storage = new InMemoryStorageAdapter();
    const stampedAt = 1700000000000;
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2, JSON.stringify({ solved: [1, 2] }));
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, JSON.stringify({ solved: [1] }));
    storage.setItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP, String(stampedAt));

    const now = stampedAt + 5 * 24 * 60 * 60 * 1000;
    const outcome = migrateStorageV1ToV2(storage, undefined, now);

    expect(outcome.status).toBe('already_migrated');
    expect(outcome.deprecationTimestamp).toBe(stampedAt);
  });

  it('handles storage exceptions gracefully by returning error status', () => {
    const storage = new InMemoryStorageAdapter();
    storage.getItem = () => {
      throw new Error('Storage failure');
    };
    const logger = createMockLogger();

    const outcome = migrateStorageV1ToV2(storage, logger);
    expect(outcome.status).toBe('error');
    expect(outcome.error).toBe('Storage failure');
    expect(logger.error).toHaveBeenCalled();
  });
});
