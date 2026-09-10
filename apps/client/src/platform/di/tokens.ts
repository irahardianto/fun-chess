import type { InjectionKey, Ref } from 'vue';
import type { IApiClient } from '../api/api_client.interface';
import type { KeyValueStorage } from '../storage/key_value_storage';
import type { IAudioService } from '../audio/audio.interface';
import type { ILogger } from '../telemetry';
import type { IFileDownloader, IHapticsService, IWebRtcDiscovery, IClipboardService, ICameraService, INetworkMonitor } from '../hardware';
import type { TypedSocket } from '../socket/socket_client';
import type { ScenarioProgressStore, PuzzleProgressStore, ProgressStorage, IClock } from '@fun-chess/shared';

export interface AudioContextValue {
  isMuted: Ref<boolean>;
  toggleMute: () => boolean;
  setMuted: (muted: boolean) => void;
  playMove: () => void;
  playCapture: () => void;
  playCheck: () => void;
  playVictory: () => void;
  playDraw: () => void;
  playStart: () => void;
  playError: () => void;
  playStarEarned: () => void;
  playClick: () => void;
}

export type {
  IApiClient,
  KeyValueStorage,
  IAudioService,
  ILogger,
  IFileDownloader,
  IHapticsService,
  IWebRtcDiscovery,
  IClipboardService,
  ICameraService,
  INetworkMonitor,
  TypedSocket,
  IClock,
};

export const API_CLIENT_KEY: InjectionKey<IApiClient> = Symbol('API_CLIENT');
export const STORAGE_KEY: InjectionKey<KeyValueStorage> = Symbol('STORAGE');
export const SESSION_STORAGE_KEY: InjectionKey<KeyValueStorage> = Symbol('SESSION_STORAGE');
export const AUDIO_SERVICE_KEY: InjectionKey<IAudioService> = Symbol('AUDIO_SERVICE');
export const AUDIO_CONTEXT_KEY: InjectionKey<AudioContextValue> = Symbol('AUDIO_CONTEXT');
export const LOGGER_KEY: InjectionKey<ILogger> = Symbol('LOGGER');
export const CLOCK_KEY: InjectionKey<IClock> = Symbol('CLOCK');
export const SCENARIO_STORE_KEY: InjectionKey<ScenarioProgressStore> = Symbol('SCENARIO_STORE');
export const PUZZLE_STORE_KEY: InjectionKey<PuzzleProgressStore> = Symbol('PUZZLE_STORE');
export const PROGRESS_STORAGE_KEY: InjectionKey<ProgressStorage> = Symbol('PROGRESS_STORAGE');

// Hardware & Browser API tokens (MAJ-012, MAJ-015)
export const FILE_DOWNLOADER_KEY: InjectionKey<IFileDownloader> = Symbol('FILE_DOWNLOADER');
export const HAPTICS_KEY: InjectionKey<IHapticsService> = Symbol('HAPTICS');
export const WEBRTC_DISCOVERY_KEY: InjectionKey<IWebRtcDiscovery> = Symbol('WEBRTC_DISCOVERY');
export const CLIPBOARD_SERVICE_KEY: InjectionKey<IClipboardService> = Symbol('CLIPBOARD_SERVICE');
export const CAMERA_SERVICE_KEY: InjectionKey<ICameraService> = Symbol('CAMERA_SERVICE');
export { NETWORK_MONITOR_KEY, LOCATION_PROVIDER_KEY } from '../browser/tokens';
export const SOCKET_CLIENT_KEY: InjectionKey<TypedSocket> = Symbol('SOCKET_CLIENT');

