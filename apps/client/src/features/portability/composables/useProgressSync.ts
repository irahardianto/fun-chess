import { ref, toRaw, getCurrentInstance, inject, type Ref } from 'vue';
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
import {
  type IProgressFileService,
  defaultProgressFileService,
} from '../services/progress_file.service';
import { LocalStorageUnifiedStore } from '../store/local_storage_unified.store';
import { defaultLocalStorageProgressStore } from '@/features/scenarios';
import { defaultLocalStoragePuzzleProgressStore } from '@/features/puzzles';
import { useInjectLogger, useInjectProgressStorage, PROGRESS_STORAGE_KEY } from '@/platform/di';
import { logger as defaultLogger, generateCorrelationId, type ILogger } from '@/platform/telemetry';
import { useProgressSyncModal } from './useProgressSyncModal';
import { useProgressDiff } from './useProgressDiff';
import { validateAndDecodePayload } from '../engine/sync_validator';

export * from './useProgressSyncModal';
export * from './useProgressDiff';

export interface UseProgressSyncOptions {
  storage?: ProgressStorage;
  codec?: ProgressCodec;
  mergeEngine?: ProgressMergeEngine;
  schemaValidator?: SchemaValidator;
  fileService?: IProgressFileService;
  onMergeCelebration?: () => void;
  confetti?: { celebrateVictory: () => void };
  logger?: ILogger;
}

export interface UseProgressSyncReturn {
  isLoading: Ref<boolean>;
  syncError: Ref<string | null>;
  currentProgress: Ref<UnifiedProgressPayload | null>;
  incomingPayload: Ref<UnifiedProgressPayload | null>;
  diffPreview: Ref<ProgressDiffPreview | null>;
  isConflictModalOpen: Ref<boolean>;
  isSyncModalOpen: Ref<boolean>;
  loadCurrentProgress: () => Promise<UnifiedProgressPayload>;
  exportJson: (filename?: string) => Promise<string>;
  exportQrString: () => Promise<string>;
  importPayload: (rawStringOrJson: string) => Promise<boolean>;
  executeMerge: (strategy: SyncMergeStrategy) => Promise<UnifiedProgressPayload>;
  openSyncModal: () => void;
  closeSyncModal: () => void;
  openConflictModal: () => void;
  closeConflictModal: () => void;
  clearError: () => void;
}

function unwrapPayload(val: UnifiedProgressPayload, log: ILogger = defaultLogger): UnifiedProgressPayload {
  try {
    return JSON.parse(JSON.stringify(toRaw(val)));
  } catch (err: unknown) {
    log.warn('Failed to deep-clone payload', {
      operation: 'progress_sync_unwrap',
      error: err instanceof Error ? err.message : String(err),
    });
    return val;
  }
}

/**
 * High-level coordinator composable for Progress Portability & Device Sync (MAJ-021).
 * Decomposed into modular sub-composables for presentation modal state and diff management,
 * and pure engine functions for payload validation.
 */
export function useProgressSync(options: UseProgressSyncOptions = {}): UseProgressSyncReturn {
  const logger = options.logger ?? (getCurrentInstance() ? useInjectLogger() : defaultLogger);

  function resolveFallbackStorage(): ProgressStorage {
    try {
      return useInjectProgressStorage();
    } catch (err: unknown) {
      logger.debug('Failed to inject progress storage, using LocalStorageUnifiedStore', {
        operation: 'progress_sync_resolve_storage',
        error: err instanceof Error ? err.message : String(err),
      });
      return new LocalStorageUnifiedStore(
        defaultLocalStorageProgressStore,
        defaultLocalStoragePuzzleProgressStore,
        logger
      );
    }
  }

  const storage: ProgressStorage =
    options.storage ??
    (getCurrentInstance() ? inject(PROGRESS_STORAGE_KEY, null) : null) ??
    resolveFallbackStorage();

  function getStorage(): ProgressStorage {
    return storage;
  }

  const codec = options.codec || defaultProgressCodec;
  const mergeEngine = options.mergeEngine || defaultProgressMergeEngine;
  const validator = options.schemaValidator || defaultSchemaValidator;
  const fileService = options.fileService || defaultProgressFileService;

  const isLoading = ref(false);
  const syncError = ref<string | null>(null);
  const currentProgress = ref<UnifiedProgressPayload | null>(null);

  // Sub-composable for diffing state (MAJ-021)
  const {
    incomingPayload,
    diffPreview,
    calculateAndSetDiff,
    clearDiff,
  } = useProgressDiff();

  function clearError(): void {
    syncError.value = null;
  }

  // Sub-composable for modal dialog presentation state (MAJ-021)
  const {
    isSyncModalOpen,
    isConflictModalOpen,
    openSyncModal: baseOpenSyncModal,
    closeSyncModal,
    openConflictModal,
    closeConflictModal,
  } = useProgressSyncModal({
    onOpenSyncModal: () => {
      clearError();
      loadCurrentProgress().catch((err: unknown) => {
        logger.warn('Failed to refresh current progress on open', {
          operation: 'progress_sync_open_modal',
          error: err instanceof Error ? err.message : String(err),
        });
      });
    },
  });

  function openSyncModal(): void {
    baseOpenSyncModal();
  }

  async function loadCurrentProgress(): Promise<UnifiedProgressPayload> {
    const correlationId = generateCorrelationId();
    const startTime = performance.now();
    logger.info('Loading unified progress', {
      operation: 'progress_sync_load',
      correlationId,
    });

    isLoading.value = true;
    clearError();

    try {
      const payload = await getStorage().getUnifiedProgress();
      currentProgress.value = payload;
      const durationMs = Math.round(performance.now() - startTime);
      logger.info('Unified progress loaded successfully', {
        operation: 'progress_sync_load',
        correlationId,
        duration: durationMs,
        durationMs,
      });
      return payload;
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      logger.error('Failed to load unified progress', {
        operation: 'progress_sync_load',
        correlationId,
        duration: durationMs,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      syncError.value = 'Unable to load progress. Refresh the page to try again.';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function exportJson(filename: string = 'funchess-save.json'): Promise<string> {
    const correlationId = generateCorrelationId();
    const startTime = performance.now();
    logger.info('Exporting unified progress to JSON', {
      operation: 'progress_sync_export_json',
      correlationId,
      filename,
    });

    isLoading.value = true;
    clearError();

    try {
      let payload = currentProgress.value;
      if (!payload) {
        payload = await getStorage().getUnifiedProgress();
        currentProgress.value = payload;
      }

      const rawPayload = unwrapPayload(payload, logger);
      const envelopeJson = codec.encodeToEnvelopeJson(rawPayload);
      fileService.downloadProgressFile(envelopeJson, filename);

      const durationMs = Math.round(performance.now() - startTime);
      logger.info('Unified progress exported to JSON successfully', {
        operation: 'progress_sync_export_json',
        correlationId,
        duration: durationMs,
        durationMs,
        filename,
      });
      return envelopeJson;
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      logger.error('Failed to export JSON backup', {
        operation: 'progress_sync_export_json',
        correlationId,
        duration: durationMs,
        durationMs,
        filename,
        error: err instanceof Error ? err.message : String(err),
      });
      syncError.value = (err instanceof Error ? err.message : null) || 'Unable to export backup file. Check storage permissions and try again.';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function exportQrString(): Promise<string> {
    const correlationId = generateCorrelationId();
    const startTime = performance.now();
    logger.info('Exporting unified progress to QR string', {
      operation: 'progress_sync_export_qr',
      correlationId,
    });

    isLoading.value = true;
    clearError();

    try {
      let payload = currentProgress.value;
      if (!payload) {
        payload = await getStorage().getUnifiedProgress();
        currentProgress.value = payload;
      }

      const rawPayload = unwrapPayload(payload, logger);
      const qrString = await codec.encodeToQrString(rawPayload);

      const durationMs = Math.round(performance.now() - startTime);
      logger.info('Unified progress exported to QR string successfully', {
        operation: 'progress_sync_export_qr',
        correlationId,
        duration: durationMs,
        durationMs,
      });
      return qrString;
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      logger.error('Failed to generate QR code payload', {
        operation: 'progress_sync_export_qr',
        correlationId,
        duration: durationMs,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      syncError.value = (err instanceof Error ? err.message : null) || 'Failed to generate QR code.';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

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
      // Pure validation & decoding delegation (MAJ-021)
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

      // Delegated diff comparison state management (MAJ-021)
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
          if (options.onMergeCelebration) {
            options.onMergeCelebration();
          } else if (options.confetti) {
            options.confetti.celebrateVictory();
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
    isLoading,
    syncError,
    currentProgress,
    incomingPayload,
    diffPreview,
    isConflictModalOpen,
    isSyncModalOpen,
    loadCurrentProgress,
    exportJson,
    exportQrString,
    importPayload,
    executeMerge,
    openSyncModal,
    closeSyncModal,
    openConflictModal,
    closeConflictModal,
    clearError,
  };
}
