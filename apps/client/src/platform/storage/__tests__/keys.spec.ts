import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STORAGE_KEYS, migrateStorageV1ToV2 } from '../keys';
import { InMemoryStorageAdapter } from '../in_memory_storage_adapter';
import type { KeyValueStorage } from '../key_value_storage';
import type { ILogger } from '@/platform/telemetry';

describe('Storage Keys & V1 to V2 Migration (CRIT-001 & MIN-006)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('defines centralized STORAGE_KEYS with consistent prefixing including migration timestamp', () => {
    expect(STORAGE_KEYS.PUZZLE_PROGRESS_V2).toBe('fun_chess_puzzle_progress_v2');
    expect(STORAGE_KEYS.PUZZLE_PROGRESS_V1).toBe('fun_chess_puzzle_progress_v1');
    expect(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY).toBe('fun_chess_puzzle_progress');
    expect(STORAGE_KEYS.SCENARIO_PROGRESS).toBe('fun_chess_scenario_progress_v1');
    expect(STORAGE_KEYS.PWA_SNOOZE).toBe('fun_chess_pwa_install_snoozed_until');
    expect(STORAGE_KEYS.THEME).toBe('fun_chess_theme');
    expect(STORAGE_KEYS.LAN_IP).toBe('fun_chess_lan_ip');
    expect(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP).toBe('fun_chess_puzzle_migration_v1_v2_timestamp');
  });

  it('migrates legacy puzzle progress from PUZZLE_PROGRESS_V1 and RETAINS legacy key with timestamp [CRIT-001]', () => {
    const storage = new InMemoryStorageAdapter();
    const now = 1700000000000;
    vi.setSystemTime(now);

    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, '{"solved":[1,2,3]}');

    migrateStorageV1ToV2(storage);

    // v2 data is written
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBe('{"solved":[1,2,3]}');
    // Legacy key is RETAINED for 30-day non-destructive retention window
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1)).toBe('{"solved":[1,2,3]}');
    // Migration timestamp is recorded
    expect(storage.getItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP)).toBe(now.toString());
  });

  it('migrates legacy puzzle progress from PUZZLE_PROGRESS_LEGACY and RETAINS legacy key with timestamp [CRIT-001]', () => {
    const storage = new InMemoryStorageAdapter();
    const now = 1700000000000;
    vi.setSystemTime(now);

    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY, '{"solved":[4,5]}');

    migrateStorageV1ToV2(storage);

    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBe('{"solved":[4,5]}');
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY)).toBe('{"solved":[4,5]}');
    expect(storage.getItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP)).toBe(now.toString());
  });

  it('retains legacy keys while migration timestamp is within 30 days', () => {
    const storage = new InMemoryStorageAdapter();
    const migrationTime = 1700000000000;
    vi.setSystemTime(migrationTime);

    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY, '{"solved":[1]}');
    migrateStorageV1ToV2(storage);

    // Advance time by 20 days (less than 30 days)
    vi.setSystemTime(migrationTime + 20 * 24 * 60 * 60 * 1000);

    // Re-running migration check should keep legacy keys
    migrateStorageV1ToV2(storage);

    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBe('{"solved":[1]}');
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY)).toBe('{"solved":[1]}');
    expect(storage.getItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP)).toBe(migrationTime.toString());
  });

  it('prunes legacy keys and migration timestamp after 30-day retention window expires [CRIT-001]', () => {
    const storage = new InMemoryStorageAdapter();
    const migrationTime = 1700000000000;
    vi.setSystemTime(migrationTime);

    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, '{"solved":[1,2]}');
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY, '{"solved":[1]}');
    migrateStorageV1ToV2(storage);

    // Verify initially retained
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1)).not.toBeNull();
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY)).not.toBeNull();

    // Advance time past 30 days (+ 31 days)
    vi.setSystemTime(migrationTime + 31 * 24 * 60 * 60 * 1000);

    // Trigger migration check/pruning
    migrateStorageV1ToV2(storage);

    // v2 remains intact, legacy keys and timestamp are pruned
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBe('{"solved":[1,2]}');
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP)).toBeNull();
  });

  it('logs warning via logger when legacy JSON is corrupted without silent swallow [MIN-006, MIN-015]', () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, '{invalid-json-corrupted');

    const mockLogger = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
      getLevel: vi.fn(),
      setLevel: vi.fn(),
    };

    migrateStorageV1ToV2(storage, mockLogger as unknown as ILogger);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Corrupted'),
      expect.objectContaining({
        operation: 'storage_migration_v1_v2',
        correlationId: expect.any(String),
        durationMs: expect.any(Number),
      })
    );
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBeNull();
  });

  it('logs info with correlation ID and duration tracking on successful migration [MIN-015]', () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, '{"solved":[1,2,3]}');

    const mockLogger = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
      getLevel: vi.fn(),
      setLevel: vi.fn(),
    };

    migrateStorageV1ToV2(storage, mockLogger as unknown as ILogger);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Migrated storage v1 to v2 successfully'),
      expect.objectContaining({
        operation: 'storage_migration_v1_v2',
        correlationId: expect.any(String),
        durationMs: expect.any(Number),
      })
    );
  });

  it('logs error via logger when storage throws exception without silent swallow [MIN-006, MIN-015]', () => {
    const throwingStorage: KeyValueStorage = {
      isAvailable: () => true,
      getItem: () => {
        throw new Error('QuotaExceededError: storage inaccessible');
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
      safeGetItem: vi.fn(),
      safeSetItem: vi.fn(),
    };

    const mockLogger = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
      getLevel: vi.fn(),
      setLevel: vi.fn(),
    };

    expect(() => migrateStorageV1ToV2(throwingStorage, mockLogger as unknown as ILogger)).not.toThrow();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Storage migration failed'),
      expect.objectContaining({
        operation: 'storage_migration_v1_v2',
        correlationId: expect.any(String),
        durationMs: expect.any(Number),
        error: expect.any(String),
      })
    );
  });

  it('does nothing when storage is not available or empty', () => {
    const storage = new InMemoryStorageAdapter();
    migrateStorageV1ToV2(storage);
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBeNull();
  });

  it('returns early when storage is not available', () => {
    const storage = new InMemoryStorageAdapter();
    storage.isAvailable = () => false;
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, '{"solved":[1]}');

    migrateStorageV1ToV2(storage);

    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBeNull();
  });

  it('logs error when storage throws a non-Error string during migration', () => {
    const throwingStorage: KeyValueStorage = {
      isAvailable: () => true,
      getItem: () => {
        throw 'Raw string error in storage';
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
      safeGetItem: vi.fn(),
      safeSetItem: vi.fn(),
    };

    const mockLogger = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
      getLevel: vi.fn(),
      setLevel: vi.fn(),
    };

    expect(() => migrateStorageV1ToV2(throwingStorage, mockLogger as unknown as ILogger)).not.toThrow();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Storage migration failed'),
      expect.objectContaining({
        error: 'Raw string error in storage',
      })
    );
  });

  it('handles invalid migration timestamp (NaN) gracefully without pruning', () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2, '{"solved":[1]}');
    storage.setItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP, 'not-a-number');
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, '{"solved":[1]}');

    migrateStorageV1ToV2(storage);

    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1)).not.toBeNull();
  });

  it('returns early when v2Data exists but migration timestamp is absent', () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2, '{"solved":[1]}');
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, '{"solved":[1]}');

    migrateStorageV1ToV2(storage);

    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1)).not.toBeNull();
  });

  it('does not set v2 when parsed json is not an object', () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, '"primitive-string"');

    migrateStorageV1ToV2(storage);

    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBeNull();
  });
});
