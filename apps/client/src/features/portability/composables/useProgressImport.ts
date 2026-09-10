import type { Ref } from 'vue';
import type {
  UnifiedProgressPayload,
  ProgressDiffPreview,
  SyncMergeStrategy,
  ProgressStorage,
  ProgressCodec,
  ProgressMergeEngine,
  SchemaValidator,
} from '@fun-chess/shared';
import {
  defaultProgressCodec,
  defaultProgressMergeEngine,
  defaultSchemaValidator,
} from '@fun-chess/shared';
import { generateCorrelationId, logger as defaultLogger, type ILogger } from '@/platform/telemetry';
import { validateAndDecodePayload } from '../engine/sync_validator';
import { unwrapPayload } from './useProgressExport';

export interface UseProgressImportOptions {
  getStorage: () => ProgressStorage;
  codec?: ProgressCodec;
  mergeEngine?: ProgressMergeEngine;
  validator?: SchemaValidator;
  logger?: ILogger;
  isLoading: Ref<boolean>;
  syncError: Ref<string | null>;
  currentProgress: Ref<UnifiedProgressPayload | null>;
  incomingPayload: Ref<UnifiedProgressPayload | null>;
  calculateAndSetDiff: (
    local: UnifiedProgressPayload,
    incoming: UnifiedProgressPayload,
    engine: ProgressMergeEngine
  ) => ProgressDiffPreview;
  clearDiff: () => void;
  openConflictModal: () => void;
  closeConflictModal: () => void;
  clearError: () => void;
  onMergeCelebration?: () => void;
  confetti?: { celebrateVictory: () => void };
}

export interface UseProgressImportReturn {
  importPayload: (rawStringOrJson: string) => Promise<boolean>;
  executeMerge: (strategy: SyncMergeStrategy) => Promise<UnifiedProgressPayload>;
}

export function useProgressImport(options: UseProgressImportOptions): UseProgressImportReturn {
  const {
    getStorage,
    codec = defaultProgressCodec,
    mergeEngine = defaultProgressMergeEngine,
    validator = defaultSchemaValidator,
    logger = defaultLogger,
    isLoading,
    syncError,
    currentProgress,
    incomingPayload,
    calculateAndSetDiff,
    clearDiff,
    openConflictModal,
    closeConflictModal,
    clearError,
    onMergeCelebration,
    confetti,
  } = options;

  async function importPayload(rawStringOrJson: string): Promise<boolean> {
    const correlationId = generateCorrelationId();
    const startTime = performance.now();
    logger.info('Importing progress payload', {
      operation: 'progress_sync_import',
      correlationId,
    });

    isLoading.value = true;
    clearError();

    try {
      const decoded = await validateAndDecodePayload(rawStringOrJson, {
        codec,
        validator,
        onWarn: (msg, meta) => {
          logger.warn(msg, {
            operation: 'progress_sync_import_parse',
            correlationId,
            ...meta,
          });
        },
      });

      let local = currentProgress.value;
      if (!local) {
        local = await getStorage().getUnifiedProgress();
        currentProgress.value = local;
      }

      const rawLocal = unwrapPayload(local, logger);
      const rawDecoded = unwrapPayload(decoded, logger);

      const diff = calculateAndSetDiff(rawLocal, rawDecoded, mergeEngine);

      const durationMs = Math.round(performance.now() - startTime);
      logger.info('Progress payload imported successfully', {
        operation: 'progress_sync_import',
        correlationId,
        duration: durationMs,
        durationMs,
        hasDifferences: diff.hasDifferences,
      });

      if (diff.hasDifferences) {
        openConflictModal();
        return false;
      } else {
        await executeMerge('smart_merge');
        return true;
      }
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      logger.warn('Import validation failed', {
        operation: 'progress_sync_import',
        correlationId,
        duration: durationMs,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      syncError.value =
        (err instanceof Error ? err.message : null) ||
        'Failed to import save data. Check your QR code or save file.';
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function executeMerge(strategy: SyncMergeStrategy): Promise<UnifiedProgressPayload> {
    const correlationId = generateCorrelationId();
    const startTime = performance.now();
    logger.info('Executing merge strategy', {
      operation: 'progress_sync_merge',
      correlationId,
      strategy,
    });

    if (isLoading.value && currentProgress.value) {
      return currentProgress.value;
    }
    isLoading.value = true;
    clearError();

    try {
      let local = currentProgress.value;
      if (!local) {
        local = await getStorage().getUnifiedProgress();
        currentProgress.value = local;
      }

      const incoming = incomingPayload.value;
      if (!incoming && strategy !== 'keep_local') {
        if (local) {
          logger.warn('No incoming progress payload found; returning existing local progress', {
            operation: 'progress_sync_merge',
            correlationId,
            strategy,
          });
          return local;
        }
        throw new Error('No incoming progress data to merge.');
      }

      const resolvedIncoming = incoming || local;
      const rawLocal = unwrapPayload(local, logger);
      const rawIncoming = unwrapPayload(resolvedIncoming, logger);

      const merged = mergeEngine.merge(rawLocal, rawIncoming, strategy);

      await getStorage().saveUnifiedProgress(merged);
      currentProgress.value = merged;
      clearDiff();
      closeConflictModal();

      if (strategy !== 'keep_local') {
        try {
          if (onMergeCelebration) {
            onMergeCelebration();
          } else if (confetti) {
            confetti.celebrateVictory();
          }
        } catch (celebrationErr: unknown) {
          logger.warn('Celebration trigger failed', {
            operation: 'progress_sync_celebration',
            correlationId,
            error: celebrationErr instanceof Error ? celebrationErr.message : String(celebrationErr),
          });
        }
      }

      const durationMs = Math.round(performance.now() - startTime);
      logger.info('Merge strategy executed successfully', {
        operation: 'progress_sync_merge',
        correlationId,
        duration: durationMs,
        durationMs,
        strategy,
      });

      return merged;
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      logger.error('Failed to execute merge strategy', {
        operation: 'progress_sync_merge',
        correlationId,
        duration: durationMs,
        durationMs,
        strategy,
        error: err instanceof Error ? err.message : String(err),
      });
      syncError.value = (err instanceof Error ? err.message : null) || 'Failed to save merged progress.';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    importPayload,
    executeMerge,
  };
}
