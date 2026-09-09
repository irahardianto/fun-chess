import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
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
  CLOCK_KEY,
  useInjectApiClient,
  useInjectStorage,
  useInjectSessionStorage,
  useInjectAudioService,
  useInjectLogger,
  resolveLogger,
  useInjectClock,
  useInjectScenarioStore,
  useInjectPuzzleStore,
  useInjectProgressStorage,
  useInjectFileDownloader,
  useInjectHaptics,
  useInjectWebRtcDiscovery,
  useInjectClipboardService,
  useInjectClipboard,
  useInjectCameraService,
  useApiClient,
  useStorage,
  useSessionStorage,
  useAudioService,
  useLogger,
  useClock,
  useScenarioStore,
  usePuzzleStore,
  useProgressStorage,
  useFileDownloader,
  useHaptics,
  useWebRtcDiscovery,
  useClipboardService,
  useCameraService,
  registerDefaultDomainStores,
} from '../index';
import type { IApiClient } from '../../api/api_client.interface';
import type { KeyValueStorage } from '../../storage/key_value_storage';
import type { IAudioService } from '../../audio/audio.interface';
import type { ILogger } from '../../telemetry';
import type {
  IFileDownloader,
  IHapticsService,
  IWebRtcDiscovery,
  IClipboardService,
  ICameraService,
} from '../../hardware';
import type { ScenarioProgressStore, PuzzleProgressStore, ProgressStorage, IClock } from '@fun-chess/shared';
import { apiClient } from '../../api';
import { safeLocalStorage, safeSessionStorage } from '../../storage';
import { audioSynthesizer } from '../../audio/audio_synthesizer';
import { logger } from '../../telemetry';
import { SystemClock } from '../../time';
import {
  defaultFileDownloader,
  defaultHapticsService,
  defaultWebRtcDiscovery,
  defaultClipboardService,
  defaultCameraService,
} from '../../hardware';

describe('DI Tokens & Inject Wrappers (MAJ-032)', () => {
  describe('Injection Keys Verification', () => {
    const tokens = [
      { name: 'API_CLIENT_KEY', key: API_CLIENT_KEY, expectedDesc: 'API_CLIENT' },
      { name: 'STORAGE_KEY', key: STORAGE_KEY, expectedDesc: 'STORAGE' },
      { name: 'SESSION_STORAGE_KEY', key: SESSION_STORAGE_KEY, expectedDesc: 'SESSION_STORAGE' },
      { name: 'AUDIO_SERVICE_KEY', key: AUDIO_SERVICE_KEY, expectedDesc: 'AUDIO_SERVICE' },
      { name: 'LOGGER_KEY', key: LOGGER_KEY, expectedDesc: 'LOGGER' },
      { name: 'SCENARIO_STORE_KEY', key: SCENARIO_STORE_KEY, expectedDesc: 'SCENARIO_STORE' },
      { name: 'PUZZLE_STORE_KEY', key: PUZZLE_STORE_KEY, expectedDesc: 'PUZZLE_STORE' },
      { name: 'PROGRESS_STORAGE_KEY', key: PROGRESS_STORAGE_KEY, expectedDesc: 'PROGRESS_STORAGE' },
      { name: 'FILE_DOWNLOADER_KEY', key: FILE_DOWNLOADER_KEY, expectedDesc: 'FILE_DOWNLOADER' },
      { name: 'HAPTICS_KEY', key: HAPTICS_KEY, expectedDesc: 'HAPTICS' },
      { name: 'WEBRTC_DISCOVERY_KEY', key: WEBRTC_DISCOVERY_KEY, expectedDesc: 'WEBRTC_DISCOVERY' },
      { name: 'CLIPBOARD_SERVICE_KEY', key: CLIPBOARD_SERVICE_KEY, expectedDesc: 'CLIPBOARD_SERVICE' },
      { name: 'CAMERA_SERVICE_KEY', key: CAMERA_SERVICE_KEY, expectedDesc: 'CAMERA_SERVICE' },
      { name: 'CLOCK_KEY', key: CLOCK_KEY, expectedDesc: 'CLOCK' },
    ];

    it.each(tokens)('$name is a valid Symbol with expected description "$expectedDesc"', ({ key, expectedDesc }) => {
      expect(typeof key).toBe('symbol');
      expect(key.description).toBe(expectedDesc);
    });

    it('all injection tokens are unique symbols', () => {
      const symbols = tokens.map((t) => t.key);
      const uniqueSymbols = new Set(symbols);
      expect(uniqueSymbols.size).toBe(tokens.length);
    });
  });

  describe('useInject* Composables with Provided Instances (App Context)', () => {
    it('returns provided instance for all tokens in createApp context', () => {
      const mockApiClient = { get: () => Promise.resolve() } as unknown as IApiClient;
      const mockStorage = { getItem: () => null } as unknown as KeyValueStorage;
      const mockSessionStorage = { getItem: () => null } as unknown as KeyValueStorage;
      const mockAudio = { playMove: () => {} } as unknown as IAudioService;
      const mockLogger = { info: () => {} } as unknown as ILogger;
      const mockScenarioStore = { getProgressMap: () => Promise.resolve({}) } as unknown as ScenarioProgressStore;
      const mockPuzzleStore = { getProgress: () => Promise.resolve({}) } as unknown as PuzzleProgressStore;
      const mockProgressStorage = { getUnifiedProgress: () => Promise.resolve({}) } as unknown as ProgressStorage;
      const mockFileDownloader = { download: () => {} } as unknown as IFileDownloader;
      const mockHaptics = { vibrate: () => true, isSupported: () => true } as unknown as IHapticsService;
      const mockWebRtcDiscovery = { discoverLocalIp: () => Promise.resolve('192.168.1.100') } as unknown as IWebRtcDiscovery;
      const mockClipboard = { copyText: () => Promise.resolve(true), readText: () => Promise.resolve(''), isSupported: () => true } as unknown as IClipboardService;
      const mockCamera = { getUserMedia: () => Promise.resolve({} as MediaStream), isSupported: () => true } as unknown as ICameraService;
      const mockClock = { now: () => 1700000000000 } as unknown as IClock;

      const app = createApp({});
      app.provide(API_CLIENT_KEY, mockApiClient);
      app.provide(STORAGE_KEY, mockStorage);
      app.provide(SESSION_STORAGE_KEY, mockSessionStorage);
      app.provide(AUDIO_SERVICE_KEY, mockAudio);
      app.provide(LOGGER_KEY, mockLogger);
      app.provide(CLOCK_KEY, mockClock);
      app.provide(SCENARIO_STORE_KEY, mockScenarioStore);
      app.provide(PUZZLE_STORE_KEY, mockPuzzleStore);
      app.provide(PROGRESS_STORAGE_KEY, mockProgressStorage);
      app.provide(FILE_DOWNLOADER_KEY, mockFileDownloader);
      app.provide(HAPTICS_KEY, mockHaptics);
      app.provide(WEBRTC_DISCOVERY_KEY, mockWebRtcDiscovery);
      app.provide(CLIPBOARD_SERVICE_KEY, mockClipboard);
      app.provide(CAMERA_SERVICE_KEY, mockCamera);

      app.runWithContext(() => {
        expect(useInjectApiClient()).toBe(mockApiClient);
        expect(useInjectStorage()).toBe(mockStorage);
        expect(useInjectSessionStorage()).toBe(mockSessionStorage);
        expect(useInjectAudioService()).toBe(mockAudio);
        expect(useInjectLogger()).toBe(mockLogger);
        expect(useInjectClock()).toBe(mockClock);
        expect(useInjectScenarioStore()).toBe(mockScenarioStore);
        expect(useInjectPuzzleStore()).toBe(mockPuzzleStore);
        expect(useInjectProgressStorage()).toBe(mockProgressStorage);
        expect(useInjectFileDownloader()).toBe(mockFileDownloader);
        expect(useInjectHaptics()).toBe(mockHaptics);
        expect(useInjectWebRtcDiscovery()).toBe(mockWebRtcDiscovery);
        expect(useInjectClipboardService()).toBe(mockClipboard);
        expect(useInjectClipboard()).toBe(mockClipboard);
        expect(useInjectCameraService()).toBe(mockCamera);
      });
    });

    it('returns provided instance when mounted in a Vue component context', () => {
      const mockStorage = { isAvailable: () => true } as unknown as KeyValueStorage;
      let injectedStorage: KeyValueStorage | undefined;

      const TestComponent = defineComponent({
        setup() {
          injectedStorage = useInjectStorage();
          return () => h('div');
        },
      });

      mount(TestComponent, {
        global: {
          provide: {
            [STORAGE_KEY as symbol]: mockStorage,
          },
        },
      });

      expect(injectedStorage).toBe(mockStorage);
    });
  });

  describe('useInject* Composables Defaults and Fallbacks', () => {
    it('returns standard singleton defaults when tokens are not provided', () => {
      const app = createApp({});

      app.runWithContext(() => {
        expect(useInjectApiClient()).toBe(apiClient);
        expect(useInjectStorage()).toBe(safeLocalStorage);
        expect(useInjectSessionStorage()).toBe(safeSessionStorage);
        expect(useInjectAudioService()).toBe(audioSynthesizer);
        expect(useInjectLogger()).toBe(logger);
        expect(useInjectClock()).toBeInstanceOf(SystemClock);
        expect(useInjectFileDownloader()).toBe(defaultFileDownloader);
        expect(useInjectHaptics()).toBe(defaultHapticsService);
        expect(useInjectWebRtcDiscovery()).toBe(defaultWebRtcDiscovery);
        expect(useInjectClipboardService()).toBe(defaultClipboardService);
        expect(useInjectCameraService()).toBe(defaultCameraService);
      });
    });

    it('prefers explicit fallback parameter when token is not provided', () => {
      const customApiClient = { checkHealth: () => Promise.resolve() } as unknown as IApiClient;
      const customStorage = { key: () => null } as unknown as KeyValueStorage;
      const customAudio = { isMuted: () => true } as unknown as IAudioService;
      const customLogger = { debug: () => {} } as unknown as ILogger;
      const customClock = { now: () => 12345 } as unknown as IClock;
      const customScenarioStore = { resetAllProgress: () => Promise.resolve() } as unknown as ScenarioProgressStore;
      const customPuzzleStore = { resetAll: () => Promise.resolve() } as unknown as PuzzleProgressStore;
      const customProgressStorage = { saveUnifiedProgress: () => Promise.resolve() } as unknown as ProgressStorage;
      const customFileDownloader = { download: () => {} } as unknown as IFileDownloader;
      const customHaptics = { vibrate: () => false, isSupported: () => false } as unknown as IHapticsService;
      const customWebRtcDiscovery = { discoverLocalIp: () => Promise.resolve(null) } as unknown as IWebRtcDiscovery;

      const app = createApp({});

      app.runWithContext(() => {
        expect(useInjectApiClient(customApiClient)).toBe(customApiClient);
        expect(useInjectStorage(customStorage)).toBe(customStorage);
        expect(useInjectSessionStorage(customStorage)).toBe(customStorage);
        expect(useInjectAudioService(customAudio)).toBe(customAudio);
        expect(useInjectLogger(customLogger)).toBe(customLogger);
        expect(useInjectClock(customClock)).toBe(customClock);
        expect(resolveLogger(customLogger)).toBe(customLogger);
        expect(resolveLogger()).toBe(logger);
        expect(useInjectScenarioStore(customScenarioStore)).toBe(customScenarioStore);
        expect(useInjectPuzzleStore(customPuzzleStore)).toBe(customPuzzleStore);
        expect(useInjectProgressStorage(customProgressStorage)).toBe(customProgressStorage);
        expect(useInjectFileDownloader(customFileDownloader)).toBe(customFileDownloader);
        expect(useInjectHaptics(customHaptics)).toBe(customHaptics);
        expect(useInjectWebRtcDiscovery(customWebRtcDiscovery)).toBe(customWebRtcDiscovery);
      });
    });

    it('throws descriptive errors when domain stores are not provided and no default is registered', () => {
      const app = createApp({});

      app.runWithContext(() => {
        expect(() => useInjectScenarioStore()).toThrow(
          'ScenarioProgressStore not provided and no default registered'
        );
        expect(() => useInjectPuzzleStore()).toThrow(
          'PuzzleProgressStore not provided and no default registered'
        );
        expect(() => useInjectProgressStorage()).toThrow(
          'ProgressStorage not provided and no default registered'
        );
      });
    });

    it('returns registered default domain stores after registerDefaultDomainStores is called', () => {
      const mockScenario = { saveProgress: () => Promise.resolve() } as unknown as ScenarioProgressStore;
      const mockPuzzle = { updateRating: () => Promise.resolve() } as unknown as PuzzleProgressStore;
      const mockProgress = { getUnifiedProgress: () => Promise.resolve() } as unknown as ProgressStorage;

      registerDefaultDomainStores({
        scenarioStore: mockScenario,
        puzzleStore: mockPuzzle,
        progressStorage: mockProgress,
      });

      const app = createApp({});
      app.runWithContext(() => {
        expect(useInjectScenarioStore()).toBe(mockScenario);
        expect(useInjectPuzzleStore()).toBe(mockPuzzle);
        expect(useInjectProgressStorage()).toBe(mockProgress);
      });
    });
  });

  describe('Typed Injection Helpers (helpers.ts) (MAJ-014)', () => {
    it('returns provided instances when available in Vue injection context', () => {
      const mockApiClient = { checkHealth: () => Promise.resolve() } as unknown as IApiClient;
      const mockStorage = { getItem: () => null } as unknown as KeyValueStorage;
      const mockSessionStorage = { setItem: () => {} } as unknown as KeyValueStorage;
      const mockAudio = { playMove: () => {} } as unknown as IAudioService;
      const mockLogger = { info: () => {} } as unknown as ILogger;
      const mockClock = { now: () => 1000 } as IClock;
      const mockScenarioStore = {} as ScenarioProgressStore;
      const mockPuzzleStore = {} as PuzzleProgressStore;
      const mockProgressStorage = {} as ProgressStorage;
      const mockFileDownloader = { download: () => {} } as unknown as IFileDownloader;
      const mockHaptics = { vibrate: () => true, isSupported: () => true } as unknown as IHapticsService;
      const mockWebRtc = { discoverLocalIp: () => Promise.resolve('10.0.0.1') } as unknown as IWebRtcDiscovery;
      const mockClipboard = { copyText: () => Promise.resolve(true), readText: () => Promise.resolve(''), isSupported: () => true } as unknown as IClipboardService;
      const mockCamera = { getUserMedia: () => Promise.resolve({} as MediaStream), isSupported: () => true } as unknown as ICameraService;

      const app = createApp({});
      app.provide(API_CLIENT_KEY, mockApiClient);
      app.provide(STORAGE_KEY, mockStorage);
      app.provide(SESSION_STORAGE_KEY, mockSessionStorage);
      app.provide(AUDIO_SERVICE_KEY, mockAudio);
      app.provide(LOGGER_KEY, mockLogger);
      app.provide(CLOCK_KEY, mockClock);
      app.provide(SCENARIO_STORE_KEY, mockScenarioStore);
      app.provide(PUZZLE_STORE_KEY, mockPuzzleStore);
      app.provide(PROGRESS_STORAGE_KEY, mockProgressStorage);
      app.provide(FILE_DOWNLOADER_KEY, mockFileDownloader);
      app.provide(HAPTICS_KEY, mockHaptics);
      app.provide(WEBRTC_DISCOVERY_KEY, mockWebRtc);
      app.provide(CLIPBOARD_SERVICE_KEY, mockClipboard);
      app.provide(CAMERA_SERVICE_KEY, mockCamera);

      app.runWithContext(() => {
        expect(useApiClient()).toBe(mockApiClient);
        expect(useStorage()).toBe(mockStorage);
        expect(useSessionStorage()).toBe(mockSessionStorage);
        expect(useAudioService()).toBe(mockAudio);
        expect(useLogger()).toBe(mockLogger);
        expect(useClock()).toBe(mockClock);
        expect(useScenarioStore()).toBe(mockScenarioStore);
        expect(usePuzzleStore()).toBe(mockPuzzleStore);
        expect(useProgressStorage()).toBe(mockProgressStorage);
        expect(useFileDownloader()).toBe(mockFileDownloader);
        expect(useHaptics()).toBe(mockHaptics);
        expect(useWebRtcDiscovery()).toBe(mockWebRtc);
        expect(useClipboardService()).toBe(mockClipboard);
        expect(useCameraService()).toBe(mockCamera);
      });
    });

    it('prefers custom instance when provided as parameter', () => {
      const customApi = {} as IApiClient;
      const customStorage = {} as KeyValueStorage;
      const customSessionStorage = {} as KeyValueStorage;
      const customAudio = {} as IAudioService;
      const customLogger = {} as ILogger;
      const customClock = {} as IClock;
      const customScenario = {} as ScenarioProgressStore;
      const customPuzzle = {} as PuzzleProgressStore;
      const customProgress = {} as ProgressStorage;
      const customDownloader = {} as IFileDownloader;
      const customHaptics = {} as IHapticsService;
      const customWebRtc = {} as IWebRtcDiscovery;
      const customClipboard = {} as IClipboardService;
      const customCamera = {} as ICameraService;

      expect(useApiClient(customApi)).toBe(customApi);
      expect(useStorage(customStorage)).toBe(customStorage);
      expect(useSessionStorage(customSessionStorage)).toBe(customSessionStorage);
      expect(useAudioService(customAudio)).toBe(customAudio);
      expect(useLogger(customLogger)).toBe(customLogger);
      expect(useClock(customClock)).toBe(customClock);
      expect(useScenarioStore(customScenario)).toBe(customScenario);
      expect(usePuzzleStore(customPuzzle)).toBe(customPuzzle);
      expect(useProgressStorage(customProgress)).toBe(customProgress);
      expect(useFileDownloader(customDownloader)).toBe(customDownloader);
      expect(useHaptics(customHaptics)).toBe(customHaptics);
      expect(useWebRtcDiscovery(customWebRtc)).toBe(customWebRtc);
      expect(useClipboardService(customClipboard)).toBe(customClipboard);
      expect(useCameraService(customCamera)).toBe(customCamera);
    });

    it('unified helpers fall back gracefully to default platform instances when tokens are not provided (ENH-003)', () => {
      const app = createApp({});

      app.runWithContext(() => {
        expect(useApiClient()).toBe(apiClient);
        expect(useStorage()).toBe(safeLocalStorage);
        expect(useSessionStorage()).toBe(safeSessionStorage);
        expect(useAudioService()).toBe(audioSynthesizer);
        expect(useLogger()).toBe(logger);
        expect(useClock()).toBeInstanceOf(SystemClock);
        expect(useFileDownloader()).toBe(defaultFileDownloader);
        expect(useHaptics()).toBe(defaultHapticsService);
        expect(useWebRtcDiscovery()).toBe(defaultWebRtcDiscovery);
        expect(useClipboardService()).toBe(defaultClipboardService);
        expect(useCameraService()).toBe(defaultCameraService);
      });
    });
  });
});
