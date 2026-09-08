import type { KeyValueStorage } from './key_value_storage';
import { logger as defaultLogger, type ILogger } from '../telemetry';

/**
 * Centralized local and session storage keys used across Fun Chess client.
 * Adheres to Architectural Patterns Rule 1 and Finding MIN-034.
 */
export const STORAGE_KEYS = {
  SCENARIO_PROGRESS: 'fun_chess_scenario_progress_v1',
  PUZZLE_PROGRESS_V1: 'fun_chess_puzzle_progress_v1',
  PUZZLE_PROGRESS_LEGACY: 'fun_chess_puzzle_progress',
  PUZZLE_PROGRESS_V2: 'fun_chess_puzzle_progress_v2',
  MIGRATION_V1_V2_TIMESTAMP: 'fun_chess_puzzle_migration_v1_v2_timestamp',
  PLAYER_AVATAR: 'fun_chess_player_avatar',
  THEME: 'fun_chess_theme',
  LAN_IP: 'fun_chess_lan_ip',
  SESSION_TOKEN: 'fun_chess_session_token',
  PWA_SNOOZE: 'fun_chess_pwa_install_snoozed_until',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Migrates stored puzzle and user progress from legacy v1 schema to canonical v2 schema.
 * Implements 30-day non-destructive retention window (CRIT-001) and structured logging (MIN-006).
 *
 * @param storage - Target KeyValueStorage implementation (safeLocalStorage or test double)
 * @param logger - Optional logger implementation (defaults to platform logger)
 */
export function migrateStorageV1ToV2(
  storage: KeyValueStorage,
  logger: ILogger = defaultLogger
): void {
  try {
    if (!storage.isAvailable()) return;

    // Check if target v2 already exists
    const v2Data = storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2);
    if (v2Data) {
      // Check 30-day retention pruning window
      const migrationTimestamp = storage.getItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP);
      if (migrationTimestamp) {
        const timestampNum = Number(migrationTimestamp);
        if (!isNaN(timestampNum) && Date.now() - timestampNum > THIRTY_DAYS_MS) {
          storage.removeItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1);
          storage.removeItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY);
          storage.removeItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP);
          logger.info('Pruned legacy v1 storage after 30-day retention window', {
            operation: 'storage_migration_v1_v2',
          });
        }
      }
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
        storage.setItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP, Date.now().toString());
        // CRIT-001: 30-day non-destructive retention window.
        // Legacy keys (PUZZLE_PROGRESS_V1, PUZZLE_PROGRESS_LEGACY) are RETAINED and not removed here.
        logger.info('Migrated storage v1 to v2 successfully with 30-day retention window', {
          operation: 'storage_migration_v1_v2',
        });
      }
    } catch (err) {
      logger.warn('Corrupted legacy v1 puzzle storage during migration', {
        operation: 'storage_migration_v1_v2',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (err) {
    logger.error('Storage migration failed unexpectedly', {
      operation: 'storage_migration_v1_v2',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
