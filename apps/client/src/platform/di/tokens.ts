import type { InjectionKey } from 'vue';
import type { IApiClient } from '../api/api_client.interface';
import type { KeyValueStorage } from '../storage/key_value_storage';
import type { IAudioService } from '../audio/audio.interface';
import type { ILogger } from '../telemetry';
import type { IFileDownloader, IHapticsService, IWebRtcDiscovery } from '../hardware';
import type { ScenarioProgressStore, PuzzleProgressStore, ProgressStorage } from '@fun-chess/shared';

export type {
  IApiClient,
  KeyValueStorage,
  IAudioService,
  ILogger,
  IFileDownloader,
  IHapticsService,
  IWebRtcDiscovery,
};

export const API_CLIENT_KEY: InjectionKey<IApiClient> = Symbol('API_CLIENT');
export const STORAGE_KEY: InjectionKey<KeyValueStorage> = Symbol('STORAGE');
export const SESSION_STORAGE_KEY: InjectionKey<KeyValueStorage> = Symbol('SESSION_STORAGE');
export const AUDIO_SERVICE_KEY: InjectionKey<IAudioService> = Symbol('AUDIO_SERVICE');
export const LOGGER_KEY: InjectionKey<ILogger> = Symbol('LOGGER');
export const SCENARIO_STORE_KEY: InjectionKey<ScenarioProgressStore> = Symbol('SCENARIO_STORE');
export const PUZZLE_STORE_KEY: InjectionKey<PuzzleProgressStore> = Symbol('PUZZLE_STORE');
export const PROGRESS_STORAGE_KEY: InjectionKey<ProgressStorage> = Symbol('PROGRESS_STORAGE');

// Hardware & Browser API tokens (MAJ-012)
export const FILE_DOWNLOADER_KEY: InjectionKey<IFileDownloader> = Symbol('FILE_DOWNLOADER');
export const HAPTICS_KEY: InjectionKey<IHapticsService> = Symbol('HAPTICS');
export const WEBRTC_DISCOVERY_KEY: InjectionKey<IWebRtcDiscovery> = Symbol('WEBRTC_DISCOVERY');

