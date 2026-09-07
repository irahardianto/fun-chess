import { inject } from 'vue';
import {
  API_CLIENT_KEY,
  STORAGE_KEY,
  SESSION_STORAGE_KEY,
  AUDIO_SERVICE_KEY,
  LOGGER_KEY,
  SCENARIO_STORE_KEY,
  PUZZLE_STORE_KEY,
} from './tokens';
import type { IApiClient } from '../api/api_client.interface';
import type { KeyValueStorage } from '../storage/key_value_storage';
import type { IAudioService } from '../audio/audio.interface';
import type { ILogger } from '../telemetry';
import type { ScenarioProgressStore, PuzzleProgressStore } from '@fun-chess/shared';
import { apiClient as defaultApiClient } from '../api';
import { safeLocalStorage, safeSessionStorage } from '../storage';
import { audioSynthesizer as defaultAudioSynthesizer } from '../audio/audio_synthesizer';
import { logger as defaultLogger } from '../telemetry';
import { defaultLocalStorageProgressStore } from '../../features/scenarios/store/local_storage_progress.store';
import { defaultLocalStoragePuzzleProgressStore } from '../../features/puzzles/store/local_storage_puzzle_store';

export * from './tokens';

export function useInjectApiClient(): IApiClient {
  return inject(API_CLIENT_KEY, defaultApiClient);
}

export function useInjectStorage(): KeyValueStorage {
  return inject(STORAGE_KEY, safeLocalStorage);
}

export function useInjectSessionStorage(): KeyValueStorage {
  return inject(SESSION_STORAGE_KEY, safeSessionStorage);
}

export function useInjectAudioService(): IAudioService {
  return inject(AUDIO_SERVICE_KEY, defaultAudioSynthesizer);
}

export function useInjectLogger(): ILogger {
  return inject(LOGGER_KEY, defaultLogger);
}

export function useInjectScenarioStore(): ScenarioProgressStore {
  return inject(SCENARIO_STORE_KEY, defaultLocalStorageProgressStore);
}

export function useInjectPuzzleStore(): PuzzleProgressStore {
  return inject(PUZZLE_STORE_KEY, defaultLocalStoragePuzzleProgressStore);
}
