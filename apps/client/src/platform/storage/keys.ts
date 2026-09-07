import type { KeyValueStorage } from './key_value_storage';

/**
 * Centralized local and session storage keys used across Fun Chess client.
 * Adheres to Architectural Patterns Rule 1 and Finding MIN-034.
 */
export const STORAGE_KEYS = {
  SCENARIO_PROGRESS: 'fun_chess_scenario_progress_v1',
  PUZZLE_PROGRESS_V1: 'fun_chess_puzzle_progress_v1',
  PUZZLE_PROGRESS_LEGACY: 'fun_chess_puzzle_progress',
  PUZZLE_PROGRESS_V2: 'fun_chess_puzzle_progress_v2',
  PLAYER_AVATAR: 'fun_chess_player_avatar',
  THEME: 'fun_chess_theme',
  LAN_IP: 'fun_chess_lan_ip',
  SESSION_TOKEN: 'fun_chess_session_token',
  PWA_SNOOZE: 'fun_chess_pwa_install_snoozed_until',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Migrates stored puzzle and user progress from legacy v1 schema to canonical v2 schema.
 * Operates deterministically on KeyValueStorage abstraction.
 *
 * @param storage - Target KeyValueStorage implementation (safeLocalStorage or test double)
 */
export function migrateStorageV1ToV2(storage: KeyValueStorage): void {
  try {
    if (!storage.isAvailable()) return;

    // Check if target v2 already exists
    const v2Data = storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2);
    if (v2Data) {
      return;
    }

    // Check for legacy v1 formats
    const v1Raw =
      storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1) ||
      storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY);
    if (!v1Raw) return;

    try {
      const parsed = JSON.parse(v1Raw);
      if (parsed && typeof parsed === 'object') {
        storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2, JSON.stringify(parsed));
        storage.removeItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1);
        storage.removeItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY);
      }
    } catch {
      // Corrupted v1 data: safe no-op to avoid breaking initialization
    }
  } catch {
    // Storage access exceptions gracefully handled
  }
}
