import { describe, it, expect } from 'vitest';
import { STORAGE_KEYS, migrateStorageV1ToV2 } from '../keys';
import { InMemoryStorageAdapter } from '../in_memory_storage_adapter';

describe('Storage Keys & V1 to V2 Migration (MIN-034)', () => {
  it('defines centralized STORAGE_KEYS with consistent prefixing', () => {
    expect(STORAGE_KEYS.PUZZLE_PROGRESS_V2).toBe('fun_chess_puzzle_progress_v2');
    expect(STORAGE_KEYS.PUZZLE_PROGRESS_V1).toBe('fun_chess_puzzle_progress_v1');
    expect(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY).toBe('fun_chess_puzzle_progress');
    expect(STORAGE_KEYS.SCENARIO_PROGRESS).toBe('fun_chess_scenario_progress_v1');
    expect(STORAGE_KEYS.PWA_SNOOZE).toBe('fun_chess_pwa_install_snoozed_until');
    expect(STORAGE_KEYS.THEME).toBe('fun_chess_theme');
    expect(STORAGE_KEYS.LAN_IP).toBe('fun_chess_lan_ip');
  });

  it('migrates legacy puzzle progress from PUZZLE_PROGRESS_V1 to PUZZLE_PROGRESS_V2', () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1, '{"solved":[1,2,3]}');

    migrateStorageV1ToV2(storage);

    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBe('{"solved":[1,2,3]}');
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1)).toBeNull();
  });

  it('migrates legacy puzzle progress from PUZZLE_PROGRESS_LEGACY to PUZZLE_PROGRESS_V2', () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY, '{"solved":[4,5]}');

    migrateStorageV1ToV2(storage);

    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBe('{"solved":[4,5]}');
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY)).toBeNull();
  });

  it('does not overwrite existing PUZZLE_PROGRESS_V2 if legacy key is present', () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY, '{"legacy":true}');
    storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2, '{"modern":true}');

    migrateStorageV1ToV2(storage);

    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBe('{"modern":true}');
    // Legacy key left alone because migration was aborted early
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY)).toBe('{"legacy":true}');
  });

  it('does nothing when storage is not available or empty', () => {
    const storage = new InMemoryStorageAdapter();
    migrateStorageV1ToV2(storage);
    expect(storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2)).toBeNull();
  });
});
