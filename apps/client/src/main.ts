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
} from './platform/di';
import { apiClient } from './platform/api';
import { safeLocalStorage, safeSessionStorage } from './platform/storage';
import { audioSynthesizer } from './platform/audio/audio_synthesizer';
import { logger } from './platform/telemetry';
import { defaultLocalStorageProgressStore } from './features/scenarios/store/local_storage_progress.store';
import { defaultLocalStoragePuzzleProgressStore } from './features/puzzles/store/local_storage_puzzle_store';

const app = createApp(App);

// Composition Root: Wire Infrastructure & Stores via app.provide (MAJ-019)
app.provide(API_CLIENT_KEY, apiClient);
app.provide(STORAGE_KEY, safeLocalStorage);
app.provide(SESSION_STORAGE_KEY, safeSessionStorage);
app.provide(AUDIO_SERVICE_KEY, audioSynthesizer);
app.provide(LOGGER_KEY, logger);
app.provide(SCENARIO_STORE_KEY, defaultLocalStorageProgressStore);
app.provide(PUZZLE_STORE_KEY, defaultLocalStoragePuzzleProgressStore);

// Global Error Handler with Structured Telemetry Logging
app.config.errorHandler = (err, _instance, info) => {
  logger.error('Unhandled Vue application error', {
    operation: 'vue_error_handler',
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    componentInfo: info,
  });
};

app.mount('#app');
