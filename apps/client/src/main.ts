import { createApp } from 'vue';
import App from './App.vue';
import './assets/design-tokens.css';
import {
  API_CLIENT_KEY,
  STORAGE_KEY,
  SESSION_STORAGE_KEY,
  AUDIO_SERVICE_KEY,
  LOGGER_KEY,
  SCENARIO_STORE_KEY,
  PUZZLE_STORE_KEY,
  FILE_DOWNLOADER_KEY,
  HAPTICS_KEY,
  WEBRTC_DISCOVERY_KEY,
} from './platform/di';
import { apiClient } from './platform/api';
import { safeLocalStorage, safeSessionStorage, migrateStorageV1ToV2 } from './platform/storage';
import { audioSynthesizer } from './platform/audio';
import { logger, generateCorrelationId } from './platform/telemetry';
import {
  defaultFileDownloader,
  defaultHapticsService,
  defaultWebRtcDiscovery,
} from './platform/hardware';
import { defaultLocalStorageProgressStore } from './features/scenarios';
import { defaultLocalStoragePuzzleProgressStore } from './features/puzzles';

// Storage Migration: Execute V1 to V2 schema migration prior to store mounting (CRIT-001)
migrateStorageV1ToV2(safeLocalStorage);

const app = createApp(App);

// Composition Root: Wire Infrastructure & Stores via app.provide (MAJ-009, MAJ-012, MAJ-019)
app.provide(API_CLIENT_KEY, apiClient);
app.provide(STORAGE_KEY, safeLocalStorage);
app.provide(SESSION_STORAGE_KEY, safeSessionStorage);
app.provide(AUDIO_SERVICE_KEY, audioSynthesizer);
app.provide(LOGGER_KEY, logger);
app.provide(SCENARIO_STORE_KEY, defaultLocalStorageProgressStore);
app.provide(PUZZLE_STORE_KEY, defaultLocalStoragePuzzleProgressStore);
app.provide(FILE_DOWNLOADER_KEY, defaultFileDownloader);
app.provide(HAPTICS_KEY, defaultHapticsService);
app.provide(WEBRTC_DISCOVERY_KEY, defaultWebRtcDiscovery);

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

app.mount('#app');
