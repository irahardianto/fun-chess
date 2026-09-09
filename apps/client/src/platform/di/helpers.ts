/**
 * Typed Vue injection helpers for platform infrastructure and domain stores.
 * Unified with canonical useInject* composables per MAJ-016 and ENH-003.
 */

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
import type { ScenarioProgressStore, PuzzleProgressStore, ProgressStorage, IClock } from '@fun-chess/shared';

import {
  useInjectApiClient,
  useInjectStorage,
  useInjectSessionStorage,
  useInjectAudioService,
  resolveLogger,
  useInjectClock,
  useInjectScenarioStore,
  useInjectPuzzleStore,
  useInjectProgressStorage,
  useInjectFileDownloader,
  useInjectHaptics,
  useInjectWebRtcDiscovery,
  useInjectClipboardService,
  useInjectCameraService,
} from './resolvers';

export function useApiClient(custom?: IApiClient): IApiClient {
  return custom ?? useInjectApiClient();
}

export function useStorage(custom?: KeyValueStorage): KeyValueStorage {
  return custom ?? useInjectStorage();
}

export function useSessionStorage(custom?: KeyValueStorage): KeyValueStorage {
  return custom ?? useInjectSessionStorage();
}

export function useAudioService(custom?: IAudioService): IAudioService {
  return custom ?? useInjectAudioService();
}

export function useLogger(custom?: ILogger | null): ILogger {
  return resolveLogger(custom);
}

export function useClock(custom?: IClock): IClock {
  return custom ?? useInjectClock();
}

export function useScenarioStore(custom?: ScenarioProgressStore): ScenarioProgressStore {
  return custom ?? useInjectScenarioStore();
}

export function usePuzzleStore(custom?: PuzzleProgressStore): PuzzleProgressStore {
  return custom ?? useInjectPuzzleStore();
}

export function useProgressStorage(custom?: ProgressStorage): ProgressStorage {
  return custom ?? useInjectProgressStorage();
}

export function useFileDownloader(custom?: IFileDownloader): IFileDownloader {
  return custom ?? useInjectFileDownloader();
}

export function useHaptics(custom?: IHapticsService): IHapticsService {
  return custom ?? useInjectHaptics();
}

export function useWebRtcDiscovery(custom?: IWebRtcDiscovery): IWebRtcDiscovery {
  return custom ?? useInjectWebRtcDiscovery();
}

export function useClipboardService(custom?: IClipboardService): IClipboardService {
  return custom ?? useInjectClipboardService();
}

export function useCameraService(custom?: ICameraService): ICameraService {
  return custom ?? useInjectCameraService();
}
