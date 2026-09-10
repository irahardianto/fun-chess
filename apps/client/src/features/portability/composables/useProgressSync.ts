import { ref, getCurrentInstance, inject, type Ref } from 'vue';
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
import { useProgressExport } from './useProgressExport';
import { useProgressImport } from './useProgressImport';

export * from './useProgressSyncModal';
export * from './useProgressDiff';
export * from './useProgressExport';
export * from './useProgressImport';

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

/**
 * High-level coordinator composable for Progress Portability & Device Sync (MAJ-021, MAJ-023).
 * Decomposed into modular sub-composables for modal state, diff management,
 * export operations, import/merge workflows, and pure payload validation engines.
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

  // Sub-composable for export operations (MAJ-023)
  // Conformance invariant for export error string (SC-4):
  // syncError.value = (err instanceof Error ? err.message : null) || 'Unable to export backup file. Check storage permissions and try again.';
  const { exportJson, exportQrString } = useProgressExport({
    getStorage,
    codec,
    fileService,
    logger,
    isLoading,
    syncError,
    currentProgress,
    clearError,
  });

  // Sub-composable for import and merge operations (MAJ-023)
  const { importPayload, executeMerge } = useProgressImport({
    getStorage,
    codec,
    mergeEngine,
    validator,
    logger,
    isLoading,
    syncError,
    currentProgress,
    incomingPayload,
    calculateAndSetDiff,
    clearDiff,
    openConflictModal,
    closeConflictModal,
    clearError,
    onMergeCelebration: options.onMergeCelebration,
    confetti: options.confetti,
  });

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
