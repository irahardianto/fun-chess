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
  FUN_CHESS_PAYLOAD_MAGIC_PREFIX,
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
 * High-level coordinator composable for Progress Portability & Device Sync.
 * Manages loading, exporting (JSON / QR), importing, diff calculation,
 * and smart conflict resolution.
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
  const incomingPayload = ref<UnifiedProgressPayload | null>(null);
  const diffPreview = ref<ProgressDiffPreview | null>(null);
  const isConflictModalOpen = ref(false);
  const isSyncModalOpen = ref(false);

  function clearError(): void {
    syncError.value = null;
  }

  function openSyncModal(): void {
    isSyncModalOpen.value = true;
    clearError();
    loadCurrentProgress().catch((err: unknown) => {
      logger.warn('Failed to refresh current progress on open', {
        operation: 'progress_sync_open_modal',
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  function closeSyncModal(): void {
    isSyncModalOpen.value = false;
  }

  function openConflictModal(): void {
    isConflictModalOpen.value = true;
  }

  function closeConflictModal(): void {
    isConflictModalOpen.value = false;
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
      if (!rawStringOrJson || typeof rawStringOrJson !== 'string') {
        throw new Error('Select a valid save file (.json) or scan a QR code.');
      }

      if (rawStringOrJson.length > 2 * 1024 * 1024) {
        throw new Error('Save data exceeds maximum allowed size of 2MB.');
      }

      const trimmed = rawStringOrJson.trim();
      let decoded: UnifiedProgressPayload;

      if (trimmed.startsWith(FUN_CHESS_PAYLOAD_MAGIC_PREFIX)) {
        decoded = await codec.decodeFromQrString(trimmed);
      } else if (trimmed.startsWith('{') && trimmed.includes('FC_PROGRESS_V1')) {
        decoded = codec.decodeFromEnvelopeJson(trimmed);
      } else if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          decoded = validator.assertValid(parsed);
        } catch (parseErr: unknown) {
          logger.warn('JSON parse failed on import payload', {
            operation: 'progress_sync_import_parse',
            correlationId,
            error: parseErr instanceof Error ? parseErr.message : String(parseErr),
          });
          throw new Error('Invalid JSON format in save data.');
        }
      } else {
        throw new Error('Unrecognized save data format. Scan a Fun Chess QR code or select a funchess-save.json file.');
      }

      let local = currentProgress.value;
      if (!local) {
        local = await getStorage().getUnifiedProgress();
        currentProgress.value = local;
      }

      const rawLocal = unwrapPayload(local, logger);
      const rawDecoded = unwrapPayload(decoded, logger);

      const diff = mergeEngine.calculateDiff(rawLocal, rawDecoded);
      incomingPayload.value = rawDecoded;
      diffPreview.value = diff;

      const durationMs = Math.round(performance.now() - startTime);
      logger.info('Progress payload imported successfully', {
        operation: 'progress_sync_import',
        correlationId,
        duration: durationMs,
        durationMs,
        hasDifferences: diff.hasDifferences,
      });

      if (diff.hasDifferences) {
        isConflictModalOpen.value = true;
        return false;
      } else {
        // Automatically execute smart merge if no conflicts or identical
        await executeMerge('smart_merge');
        return true;
      }
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      // MIN-016: Log user validation rejections at WARN level instead of ERROR
      logger.warn('Import validation failed', {
        operation: 'progress_sync_import',
        correlationId,
        duration: durationMs,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      syncError.value = (err instanceof Error ? err.message : null) || 'Failed to import save data. Check your QR code or save file.';
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
      incomingPayload.value = null;
      diffPreview.value = null;
      isConflictModalOpen.value = false;

      // Celebrate successful sync if celebration handler provided
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
