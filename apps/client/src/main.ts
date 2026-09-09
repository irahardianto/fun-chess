import { createApp } from 'vue';
import App from './App.vue';
import './assets/design-tokens.css';
import {
  API_CLIENT_KEY,
  STORAGE_KEY,
  SESSION_STORAGE_KEY,
  AUDIO_SERVICE_KEY,
  LOGGER_KEY,
  CLOCK_KEY,
  SCENARIO_STORE_KEY,
  PUZZLE_STORE_KEY,
  PROGRESS_STORAGE_KEY,
  FILE_DOWNLOADER_KEY,
  HAPTICS_KEY,
  WEBRTC_DISCOVERY_KEY,
  CLIPBOARD_SERVICE_KEY,
  CAMERA_SERVICE_KEY,
  registerDefaultDomainStores,
} from './platform/di';
import { apiClient } from './platform/api';
import { safeLocalStorage, safeSessionStorage, migrateStorageV1ToV2 } from './platform/storage';
import { audioSynthesizer } from './platform/audio';
import { logger, generateCorrelationId } from './platform/telemetry';
import { SystemClock } from './platform/time';
import {
  defaultFileDownloader,
  defaultHapticsService,
  defaultWebRtcDiscovery,
  defaultClipboardService,
  defaultCameraService,
} from './platform/hardware';
import { defaultLocalStorageProgressStore } from './features/scenarios';
import { defaultLocalStoragePuzzleProgressStore } from './features/puzzles';
import { LocalStorageUnifiedStore } from './features/portability/store/local_storage_unified.store';

// Storage Migration: Execute V1 to V2 schema migration prior to store mounting (CRIT-001)
migrateStorageV1ToV2(safeLocalStorage);

export function createFunChessApp() {
  const app = createApp(App);

  const defaultClock = new SystemClock();
  const unifiedProgressStore = new LocalStorageUnifiedStore(
    defaultLocalStorageProgressStore,
    defaultLocalStoragePuzzleProgressStore,
    logger
  );

  registerDefaultDomainStores({
    scenarioStore: defaultLocalStorageProgressStore,
    puzzleStore: defaultLocalStoragePuzzleProgressStore,
    progressStorage: unifiedProgressStore,
  });

  // Composition Root: Wire Infrastructure & Stores via app.provide (MAJ-009, MAJ-012, MAJ-014, MAJ-015, MAJ-019)
  app.provide(API_CLIENT_KEY, apiClient);
  app.provide(STORAGE_KEY, safeLocalStorage);
  app.provide(SESSION_STORAGE_KEY, safeSessionStorage);
  app.provide(AUDIO_SERVICE_KEY, audioSynthesizer);
  app.provide(LOGGER_KEY, logger);
  app.provide(CLOCK_KEY, defaultClock);
  app.provide(SCENARIO_STORE_KEY, defaultLocalStorageProgressStore);
  app.provide(PUZZLE_STORE_KEY, defaultLocalStoragePuzzleProgressStore);
  app.provide(PROGRESS_STORAGE_KEY, unifiedProgressStore);
  app.provide(FILE_DOWNLOADER_KEY, defaultFileDownloader);
  app.provide(HAPTICS_KEY, defaultHapticsService);
  app.provide(WEBRTC_DISCOVERY_KEY, defaultWebRtcDiscovery);
  app.provide(CLIPBOARD_SERVICE_KEY, defaultClipboardService);
  app.provide(CAMERA_SERVICE_KEY, defaultCameraService);

  // Global Error Handler with Structured Telemetry Logging (MIN-014)
  app.config.errorHandler = (err, _instance, info) => {
    const correlationId = generateCorrelationId();
    logger.error('Unhandled Vue application error', {
      operation: 'vue_error_handler',
      correlationId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      componentInfo: info,
    });
  };

  return app;
}

// Global Window Error & Promise Rejection Handlers with Structured Telemetry (MAJ-005)
export function registerGlobalWindowErrorHandlers(
  targetWindow: Window = window,
  customLogger = logger
): () => void {
  const errorHandler = (event: ErrorEvent) => {
    const correlationId = generateCorrelationId();
    customLogger.error('Unhandled window error', {
      operation: 'window_error_handler',
      correlationId,
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error instanceof Error ? event.error.message : String(event.error ?? event.message),
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    const correlationId = generateCorrelationId();
    const reason = event.reason;
    customLogger.error('Unhandled promise rejection', {
      operation: 'window_unhandled_rejection',
      correlationId,
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  };

  targetWindow.addEventListener('error', errorHandler);
  targetWindow.addEventListener('unhandledrejection', rejectionHandler);

  return () => {
    targetWindow.removeEventListener('error', errorHandler);
    targetWindow.removeEventListener('unhandledrejection', rejectionHandler);
  };
}

if (typeof window !== 'undefined') {
  registerGlobalWindowErrorHandlers(window);
}

export const app = createFunChessApp();

if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app');
  if (mountTarget) {
    app.mount(mountTarget);
  }
}
