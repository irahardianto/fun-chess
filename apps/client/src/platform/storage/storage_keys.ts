/**
 * Centralized local and session storage keys used across Fun Chess client.
 * Adheres to Architectural Patterns Rule 1, db_contracts §2, and Finding MIN-034.
 */
export const STORAGE_KEYS = {
  SCENARIO_PROGRESS: 'fun_chess_scenario_progress_v1',
  PUZZLE_PROGRESS_V1: 'fun_chess_puzzle_progress_v1',
  PUZZLE_PROGRESS_LEGACY: 'fun_chess_puzzle_progress',
  PUZZLE_PROGRESS_V2: 'fun_chess_puzzle_progress_v2',
  PUZZLE_PROGRESS_DEPRECATED_AT: 'fun_chess_puzzle_progress_deprecated_at',
  MIGRATION_V1_V2_TIMESTAMP: 'fun_chess_puzzle_migration_v1_v2_timestamp',
  PLAYER_AVATAR: 'fun_chess_player_avatar',
  THEME: 'fun_chess_theme',
  LAN_IP: 'fun_chess_lan_ip',
  SESSION_TOKEN: 'fun_chess_session_token',
  PWA_SNOOZE: 'fun_chess_pwa_install_snoozed_until',
  AUDIO_MUTED: 'fun_chess_audio_muted',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** 30-day retention grace window in milliseconds (30 * 24 * 60 * 60 * 1000) */
export const LEGACY_STORAGE_DEPRECATION_WINDOW_MS = 2_592_000_000;
