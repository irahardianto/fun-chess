import { inject } from 'vue';
import {
  API_CLIENT_KEY,
  STORAGE_KEY,
  SESSION_STORAGE_KEY,
  AUDIO_SERVICE_KEY,
  LOGGER_KEY,
  SCENARIO_STORE_KEY,
  PUZZLE_STORE_KEY,
  PROGRESS_STORAGE_KEY,
  FILE_DOWNLOADER_KEY,
  HAPTICS_KEY,
  WEBRTC_DISCOVERY_KEY,
  CLIPBOARD_SERVICE_KEY,
  CAMERA_SERVICE_KEY,
} from './tokens';
import type { IApiClient } from '../api/api_client.interface';
import type { KeyValueStorage } from '../storage/key_value_storage';
import type { IAudioService } from '../audio/audio.interface';
import type { ILogger } from '../telemetry';
import type {
  IFileDownloader,
  IHapticsService,
  IWebRtcDiscovery,
  IClipboardService,
  ICameraService,
} from '../hardware';
import type { ScenarioProgressStore, PuzzleProgressStore, ProgressStorage } from '@fun-chess/shared';
import { apiClient as defaultApiClient } from '../api';
import { safeLocalStorage, safeSessionStorage } from '../storage';
import { audioSynthesizer as defaultAudioSynthesizer } from '../audio/audio_synthesizer';
import { logger as defaultLogger } from '../telemetry';
import {
  defaultFileDownloader,
  defaultHapticsService,
  defaultWebRtcDiscovery,
  defaultClipboardService,
  defaultCameraService,
} from '../hardware';

export * from './tokens';
export * from './helpers';

let defaultScenarioStore: ScenarioProgressStore | null = null;
let defaultPuzzleStore: PuzzleProgressStore | null = null;
let defaultProgressStorage: ProgressStorage | null = null;

export function registerDefaultDomainStores(stores: {
  scenarioStore?: ScenarioProgressStore;
  puzzleStore?: PuzzleProgressStore;
  progressStorage?: ProgressStorage;
}): void {
  if (stores.scenarioStore) defaultScenarioStore = stores.scenarioStore;
  if (stores.puzzleStore) defaultPuzzleStore = stores.puzzleStore;
  if (stores.progressStorage) defaultProgressStorage = stores.progressStorage;
}

export function useInjectApiClient(fallback?: IApiClient): IApiClient {
  return inject(API_CLIENT_KEY, fallback ?? defaultApiClient);
}

export function useInjectStorage(fallback?: KeyValueStorage): KeyValueStorage {
  return inject(STORAGE_KEY, fallback ?? safeLocalStorage);
}

export function useInjectSessionStorage(fallback?: KeyValueStorage): KeyValueStorage {
  return inject(SESSION_STORAGE_KEY, fallback ?? safeSessionStorage);
}

export function useInjectAudioService(fallback?: IAudioService): IAudioService {
  return inject(AUDIO_SERVICE_KEY, fallback ?? defaultAudioSynthesizer);
}

export function useInjectLogger(fallback?: ILogger): ILogger {
  return inject(LOGGER_KEY, fallback ?? defaultLogger);
}

export function useInjectScenarioStore(fallback?: ScenarioProgressStore): ScenarioProgressStore {
  const store = inject(SCENARIO_STORE_KEY, fallback ?? defaultScenarioStore);
  if (!store) {
    throw new Error('ScenarioProgressStore not provided and no default registered');
  }
  return store;
}

export function useInjectPuzzleStore(fallback?: PuzzleProgressStore): PuzzleProgressStore {
  const store = inject(PUZZLE_STORE_KEY, fallback ?? defaultPuzzleStore);
  if (!store) {
    throw new Error('PuzzleProgressStore not provided and no default registered');
  }
  return store;
}

export function useInjectProgressStorage(fallback?: ProgressStorage): ProgressStorage {
  const storage = inject(PROGRESS_STORAGE_KEY, fallback ?? defaultProgressStorage);
  if (!storage) {
    throw new Error('ProgressStorage not provided and no default registered');
  }
  return storage;
}

export function useInjectFileDownloader(fallback?: IFileDownloader): IFileDownloader {
  return inject(FILE_DOWNLOADER_KEY, fallback ?? defaultFileDownloader);
}

export function useInjectHaptics(fallback?: IHapticsService): IHapticsService {
  return inject(HAPTICS_KEY, fallback ?? defaultHapticsService);
}

export function useInjectWebRtcDiscovery(fallback?: IWebRtcDiscovery): IWebRtcDiscovery {
  return inject(WEBRTC_DISCOVERY_KEY, fallback ?? defaultWebRtcDiscovery);
}

export function useInjectClipboardService(fallback?: IClipboardService): IClipboardService {
  return inject(CLIPBOARD_SERVICE_KEY, fallback ?? defaultClipboardService);
}

export function useInjectCameraService(fallback?: ICameraService): ICameraService {
  return inject(CAMERA_SERVICE_KEY, fallback ?? defaultCameraService);
}

