import { toRaw, type Ref } from 'vue';
import type {
  UnifiedProgressPayload,
  ProgressStorage,
  ProgressCodec,
} from '@fun-chess/shared';
import { defaultProgressCodec } from '@fun-chess/shared';
import {
  type IProgressFileService,
  defaultProgressFileService,
} from '../services/progress_file.service';
import { generateCorrelationId, logger as defaultLogger, type ILogger } from '@/platform/telemetry';

export function unwrapPayload(val: UnifiedProgressPayload, log: ILogger = defaultLogger): UnifiedProgressPayload {
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

export interface UseProgressExportOptions {
  getStorage: () => ProgressStorage;
  codec?: ProgressCodec;
  fileService?: IProgressFileService;
  logger?: ILogger;
  isLoading: Ref<boolean>;
  syncError: Ref<string | null>;
  currentProgress: Ref<UnifiedProgressPayload | null>;
  clearError: () => void;
}

export interface UseProgressExportReturn {
  exportJson: (filename?: string) => Promise<string>;
  exportQrString: () => Promise<string>;
}

export function useProgressExport(options: UseProgressExportOptions): UseProgressExportReturn {
  const {
    getStorage,
    codec = defaultProgressCodec,
    fileService = defaultProgressFileService,
    logger = defaultLogger,
    isLoading,
    syncError,
    currentProgress,
    clearError,
  } = options;

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
      syncError.value =
        (err instanceof Error ? err.message : null) ||
        'Unable to export backup file. Check storage permissions and try again.';
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

  return {
    exportJson,
    exportQrString,
  };
}
