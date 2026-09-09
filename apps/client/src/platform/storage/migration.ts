import type { KeyValueStorage } from './key_value_storage';
import { STORAGE_KEYS, LEGACY_STORAGE_DEPRECATION_WINDOW_MS } from './storage_keys';
import { logger as defaultLogger, generateCorrelationId, type ILogger } from '../telemetry';

export interface MigrationOutcome {
  status: 'migrated' | 'already_migrated' | 'pruned' | 'skipped' | 'corrupt' | 'error';
  legacyKeyFound?: string;
  deprecationTimestamp?: number;
  error?: string;
}

/**
 * Migrates stored puzzle progress from legacy v1 schema to canonical v2 schema.
 * Enforces non-destructive deprecation: retains legacy keys for 30 days before pruning (CRIT-001, MIN-016, MIN-018).
 *
 * @param storage - Target KeyValueStorage implementation
 * @param log - Optional structured logger (defaults to platform logger)
 * @param referenceNowMs - Optional timestamp for testing time travel (defaults to Date.now())
 * @returns MigrationOutcome summary
 */
export function migrateStorageV1ToV2(
  storage: KeyValueStorage,
  log: ILogger = defaultLogger,
  referenceNowMs: number = Date.now()
): MigrationOutcome {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();
  const operation = 'storage_migration_v1_v2';

  try {
    if (!storage.isAvailable()) {
      log.debug('Storage is unavailable; skipping v1->v2 puzzle progress migration', {
        operation,
        correlationId,
      });
      return { status: 'skipped' };
    }

    const v2Data = storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2);
    const v1Raw = storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1);
    const legacyRaw = storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY);
    const deprecatedAtRaw =
      storage.getItem(STORAGE_KEYS.PUZZLE_PROGRESS_DEPRECATED_AT) ||
      storage.getItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP);

    // Case 1: V2 already exists — handle deprecation lifecycle of legacy keys
    if (v2Data) {
      const hasLegacyKeys = Boolean(v1Raw || legacyRaw);

      if (!hasLegacyKeys) {
        // Legacy keys already purged; nothing to do
        return { status: 'already_migrated' };
      }

      // Check if deprecation timestamp is recorded
      if (!deprecatedAtRaw) {
        // Stamp deprecation timestamp now to begin 30-day countdown (MIN-018)
        storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_DEPRECATED_AT, String(referenceNowMs));
        storage.setItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP, String(referenceNowMs));
        const duration = Date.now() - startTime;
        log.info('PUZZLE_PROGRESS_V2 exists; stamped deprecation timer on legacy keys', {
          operation,
          correlationId,
          duration,
          durationMs: duration,
          deprecationTimestamp: referenceNowMs,
          graceWindowMs: LEGACY_STORAGE_DEPRECATION_WINDOW_MS,
        });
        return { status: 'already_migrated', deprecationTimestamp: referenceNowMs };
      }

      const deprecatedAt = Number(deprecatedAtRaw);
      if (!Number.isNaN(deprecatedAt) && referenceNowMs - deprecatedAt >= LEGACY_STORAGE_DEPRECATION_WINDOW_MS) {
        // 30 days elapsed: safe to prune legacy keys
        storage.removeItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1);
        storage.removeItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY);
        storage.removeItem(STORAGE_KEYS.PUZZLE_PROGRESS_DEPRECATED_AT);
        storage.removeItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP);

        const duration = Date.now() - startTime;
        log.info('Pruned legacy v1 storage after 30-day retention window', {
          operation,
          correlationId,
          duration,
          durationMs: duration,
          deprecatedAt,
          prunedAt: referenceNowMs,
          retentionDurationMs: referenceNowMs - deprecatedAt,
        });
        return { status: 'pruned', deprecationTimestamp: deprecatedAt };
      }

      // Within 30-day grace period: retain legacy keys
      const duration = Date.now() - startTime;
      log.debug('Legacy puzzle progress keys retained within 30-day deprecation grace window', {
        operation,
        correlationId,
        duration,
        durationMs: duration,
        deprecatedAt,
        remainingMs: Math.max(0, LEGACY_STORAGE_DEPRECATION_WINDOW_MS - (referenceNowMs - deprecatedAt)),
      });
      return { status: 'already_migrated', deprecationTimestamp: deprecatedAt };
    }

    // Case 2: V2 does not exist — migrate legacy data if present
    const legacyKeyFound = v1Raw
      ? STORAGE_KEYS.PUZZLE_PROGRESS_V1
      : legacyRaw
        ? STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY
        : null;

    const sourceRaw = v1Raw || legacyRaw;
    if (!sourceRaw || !legacyKeyFound) {
      log.debug('No legacy puzzle progress data found; migration not required', {
        operation,
        correlationId,
      });
      return { status: 'skipped' };
    }

    try {
      const parsed = JSON.parse(sourceRaw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        const duration = Date.now() - startTime;
        log.warn('Corrupted legacy v1 puzzle storage during migration', {
          operation,
          correlationId,
          duration,
          durationMs: duration,
          legacyKey: legacyKeyFound,
        });
        return { status: 'corrupt', legacyKeyFound };
      }

      // Write canonical v2 key
      storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_V2, JSON.stringify(parsed));

      // Non-destructive: DO NOT delete legacy keys! Stamp deprecation timestamp instead
      storage.setItem(STORAGE_KEYS.PUZZLE_PROGRESS_DEPRECATED_AT, String(referenceNowMs));
      storage.setItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP, String(referenceNowMs));

      const duration = Date.now() - startTime;
      log.info('Migrated storage v1 to v2 successfully with 30-day retention window', {
        operation,
        correlationId,
        duration,
        durationMs: duration,
        sourceKey: legacyKeyFound,
        targetKey: STORAGE_KEYS.PUZZLE_PROGRESS_V2,
        deprecationTimestamp: referenceNowMs,
      });

      return {
        status: 'migrated',
        legacyKeyFound,
        deprecationTimestamp: referenceNowMs,
      };
    } catch (parseErr) {
      const duration = Date.now() - startTime;
      log.warn('Corrupted legacy v1 puzzle storage during migration', {
        operation,
        correlationId,
        duration,
        durationMs: duration,
        legacyKey: legacyKeyFound,
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      return {
        status: 'corrupt',
        legacyKeyFound,
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      };
    }
  } catch (storageErr) {
    const duration = Date.now() - startTime;
    log.error('Storage migration failed unexpectedly', {
      operation,
      correlationId,
      duration,
      durationMs: duration,
      error: storageErr instanceof Error ? storageErr.message : String(storageErr),
    });
    return {
      status: 'error',
      error: storageErr instanceof Error ? storageErr.message : String(storageErr),
    };
  }
}
