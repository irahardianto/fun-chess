/**
 * Typed Vue injection helpers for platform infrastructure and domain stores.
 * Conforms to Architectural Patterns Rule 3 (Dependency Direction) and Finding MAJ-014.
 */

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
  type IApiClient,
  type KeyValueStorage,
  type IAudioService,
  type ILogger,
  type IFileDownloader,
  type IHapticsService,
  type IWebRtcDiscovery,
  type IClipboardService,
  type ICameraService,
} from './tokens';
import type { ScenarioProgressStore, PuzzleProgressStore, ProgressStorage } from '@fun-chess/shared';

function throwMissingDI(name: string): never {
  throw new Error(`Vue DI binding [${name}] not provided in current injection context`);
}

export function useApiClient(custom?: IApiClient): IApiClient {
  return custom ?? inject(API_CLIENT_KEY) ?? throwMissingDI('API_CLIENT');
}

export function useStorage(custom?: KeyValueStorage): KeyValueStorage {
  return custom ?? inject(STORAGE_KEY) ?? throwMissingDI('STORAGE');
}

export function useSessionStorage(custom?: KeyValueStorage): KeyValueStorage {
  return custom ?? inject(SESSION_STORAGE_KEY) ?? throwMissingDI('SESSION_STORAGE');
}

export function useAudioService(custom?: IAudioService): IAudioService {
  return custom ?? inject(AUDIO_SERVICE_KEY) ?? throwMissingDI('AUDIO_SERVICE');
}

export function useLogger(custom?: ILogger): ILogger {
  return custom ?? inject(LOGGER_KEY) ?? throwMissingDI('LOGGER');
}

export function useScenarioStore(custom?: ScenarioProgressStore): ScenarioProgressStore {
  return custom ?? inject(SCENARIO_STORE_KEY) ?? throwMissingDI('SCENARIO_STORE');
}

export function usePuzzleStore(custom?: PuzzleProgressStore): PuzzleProgressStore {
  return custom ?? inject(PUZZLE_STORE_KEY) ?? throwMissingDI('PUZZLE_STORE');
}

export function useProgressStorage(custom?: ProgressStorage): ProgressStorage {
  return custom ?? inject(PROGRESS_STORAGE_KEY) ?? throwMissingDI('PROGRESS_STORAGE');
}

export function useFileDownloader(custom?: IFileDownloader): IFileDownloader {
  return custom ?? inject(FILE_DOWNLOADER_KEY) ?? throwMissingDI('FILE_DOWNLOADER');
}

export function useHaptics(custom?: IHapticsService): IHapticsService {
  return custom ?? inject(HAPTICS_KEY) ?? throwMissingDI('HAPTICS');
}

export function useWebRtcDiscovery(custom?: IWebRtcDiscovery): IWebRtcDiscovery {
  return custom ?? inject(WEBRTC_DISCOVERY_KEY) ?? throwMissingDI('WEBRTC_DISCOVERY');
}

export function useClipboardService(custom?: IClipboardService): IClipboardService {
  return custom ?? inject(CLIPBOARD_SERVICE_KEY) ?? throwMissingDI('CLIPBOARD_SERVICE');
}

export function useCameraService(custom?: ICameraService): ICameraService {
  return custom ?? inject(CAMERA_SERVICE_KEY) ?? throwMissingDI('CAMERA_SERVICE');
}
