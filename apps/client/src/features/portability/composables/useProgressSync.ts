import { ref, toRaw, type Ref } from 'vue';
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
  defaultLocalStorageUnifiedStore,
} from '../store/local_storage_unified.store';
import {
  ProgressFileService,
  defaultProgressFileService,
} from '../services/progress_file.service';
import { logger } from '@/platform/telemetry';

export interface UseProgressSyncOptions {
  storage?: ProgressStorage;
  codec?: ProgressCodec;
  mergeEngine?: ProgressMergeEngine;
  schemaValidator?: SchemaValidator;
  fileService?: ProgressFileService;
  onMergeCelebration?: () => void;
  confetti?: { celebrateVictory: () => void };
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

function unwrapPayload(val: UnifiedProgressPayload): UnifiedProgressPayload {
  try {
    return JSON.parse(JSON.stringify(toRaw(val)));
  } catch (err) {
    logger.warn('Failed to deep-clone payload', {
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
  const storage = options.storage || defaultLocalStorageUnifiedStore;
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
    loadCurrentProgress().catch((err) => {
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
    isLoading.value = true;
    clearError();

    try {
      const payload = await storage.getUnifiedProgress();
      currentProgress.value = payload;
      return payload;
    } catch (err: any) {
      logger.error('Failed to load unified progress', {
        operation: 'progress_sync_load',
        error: err instanceof Error ? err.message : String(err),
      });
      syncError.value = 'Unable to load progress. Refresh the page to try again.';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function exportJson(filename: string = 'funchess-save.json'): Promise<string> {
    isLoading.value = true;
    clearError();

    try {
      let payload = currentProgress.value;
      if (!payload) {
        payload = await storage.getUnifiedProgress();
        currentProgress.value = payload;
      }

      const rawPayload = unwrapPayload(payload);
      const envelopeJson = codec.encodeToEnvelopeJson(rawPayload);
      fileService.downloadProgressFile(envelopeJson, filename);
      return envelopeJson;
    } catch (err: any) {
      logger.error('Failed to export JSON backup', {
        operation: 'progress_sync_export_json',
        error: err instanceof Error ? err.message : String(err),
      });
      syncError.value = err?.message || 'Unable to export backup file. Check storage permissions and try again.';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function exportQrString(): Promise<string> {
    isLoading.value = true;
    clearError();

    try {
      let payload = currentProgress.value;
      if (!payload) {
        payload = await storage.getUnifiedProgress();
        currentProgress.value = payload;
      }

      const rawPayload = unwrapPayload(payload);
      const qrString = await codec.encodeToQrString(rawPayload);
      return qrString;
    } catch (err: any) {
      logger.error('Failed to generate QR code payload', {
        operation: 'progress_sync_export_qr',
        error: err instanceof Error ? err.message : String(err),
      });
      syncError.value = err?.message || 'Failed to generate QR code.';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function importPayload(rawStringOrJson: string): Promise<boolean> {
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
        } catch (parseErr) {
          logger.warn('JSON parse failed on import payload', {
            operation: 'progress_sync_import_parse',
            error: parseErr instanceof Error ? parseErr.message : String(parseErr),
          });
          throw new Error('Invalid JSON format in save data.');
        }
      } else {
        throw new Error('Unrecognized save data format. Scan a Fun Chess QR code or select a funchess-save.json file.');
      }

      let local = currentProgress.value;
      if (!local) {
        local = await storage.getUnifiedProgress();
        currentProgress.value = local;
      }

      const rawLocal = unwrapPayload(local);
      const rawDecoded = unwrapPayload(decoded);

      const diff = mergeEngine.calculateDiff(rawLocal, rawDecoded);
      incomingPayload.value = rawDecoded;
      diffPreview.value = diff;

      if (diff.hasDifferences) {
        isConflictModalOpen.value = true;
        return false;
      } else {
        // Automatically execute smart merge if no conflicts or identical
        await executeMerge('smart_merge');
        return true;
      }
    } catch (err: any) {
      // MIN-016: Log user validation rejections at WARN level instead of ERROR
      logger.warn('Import validation failed', {
        operation: 'progress_sync_import',
        error: err instanceof Error ? err.message : String(err),
      });
      syncError.value = err?.message || 'Failed to import save data. Check your QR code or save file.';
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function executeMerge(strategy: SyncMergeStrategy): Promise<UnifiedProgressPayload> {
    if (isLoading.value && currentProgress.value) {
      return currentProgress.value;
    }
    isLoading.value = true;
    clearError();

    try {
      let local = currentProgress.value;
      if (!local) {
        local = await storage.getUnifiedProgress();
        currentProgress.value = local;
      }

      const incoming = incomingPayload.value;
      if (!incoming && strategy !== 'keep_local') {
        if (local) {
          logger.warn('No incoming progress payload found; returning existing local progress', {
            operation: 'progress_sync_merge',
            strategy,
          });
          return local;
        }
        throw new Error('No incoming progress data to merge.');
      }

      const resolvedIncoming = incoming || local;
      const rawLocal = unwrapPayload(local);
      const rawIncoming = unwrapPayload(resolvedIncoming);

      const merged = mergeEngine.merge(rawLocal, rawIncoming, strategy);

      await storage.saveUnifiedProgress(merged);
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
        } catch (celebrationErr) {
          logger.warn('Celebration trigger failed', {
            operation: 'progress_sync_celebration',
            error: celebrationErr instanceof Error ? celebrationErr.message : String(celebrationErr),
          });
        }
      }

      return merged;
    } catch (err: any) {
      logger.error('Failed to execute merge strategy', {
        operation: 'progress_sync_merge',
        error: err instanceof Error ? err.message : String(err),
      });
      syncError.value = err?.message || 'Failed to save merged progress.';
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
