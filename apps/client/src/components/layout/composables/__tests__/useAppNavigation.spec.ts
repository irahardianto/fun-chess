import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppNavigation, parseRoomCodeFromUrl } from '../useAppNavigation';
import { STORAGE_KEYS, type KeyValueStorage } from '@/platform/storage';
import type { IApiClient } from '@/platform/api';
import type { ILogger } from '@/platform/telemetry';
import { DEFAULT_PLAYER_AVATAR, type SoloAiLaunchConfig, type ChessScenario, type MascotId } from '@fun-chess/shared';

describe('useAppNavigation composable', () => {
  let mockStorage: KeyValueStorage;
  let mockApiClient: IApiClient;
  let mockLogger: ILogger;
  let storageMap: Map<string, string>;

  beforeEach(() => {
    storageMap = new Map<string, string>();
    mockStorage = {
      getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
      setItem: vi.fn((key: string, val: string) => {
        storageMap.set(key, val);
      }),
      removeItem: vi.fn((key: string) => {
        storageMap.delete(key);
      }),
      clear: vi.fn(() => {
        storageMap.clear();
      }),
    } as unknown as KeyValueStorage;

    mockApiClient = {
      getLanInfo: vi.fn().mockResolvedValue({
        ip: '192.168.1.100',
        port: 3000,
        url: 'http://192.168.1.100:3000',
      }),
      checkConnectivity: vi.fn().mockResolvedValue(true),
    } as unknown as IApiClient;

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };
  });

  // ==========================================================================
  // 1. Initial State Hydration
  // ==========================================================================
  describe('Initial State Hydration', () => {
    it('defaults to academy lobby mode when no scenario progress is stored', () => {
      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
      });

      expect(nav.currentAppMode.value).toBe('lobby');
      expect(nav.lobbyActiveMode.value).toBe('academy');
    });

    it('defaults to multiplayer_lan when stored progress has completed scenarios', () => {
      storageMap.set(
        STORAGE_KEYS.SCENARIO_PROGRESS,
        JSON.stringify({
          'scen-1': { starsEarned: 3 },
        })
      );

      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
      });

      expect(nav.lobbyActiveMode.value).toBe('multiplayer_lan');
    });

    it('recovers safely to academy when stored scenario progress is invalid JSON', () => {
      storageMap.set(STORAGE_KEYS.SCENARIO_PROGRESS, 'invalid-json{{');

      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
      });

      expect(nav.lobbyActiveMode.value).toBe('academy');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse scenario progress'),
        expect.objectContaining({
          operation: 'app_get_initial_lobby_mode',
        })
      );
    });

    it('hydrates saved player avatar or defaults to DEFAULT_PLAYER_AVATAR', () => {
      const navDefault = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
      });
      expect(navDefault.myPlayerAvatar.value).toBe(DEFAULT_PLAYER_AVATAR);

      storageMap.set(STORAGE_KEYS.PLAYER_AVATAR, '🦊');
      const navCustom = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
      });
      expect(navCustom.myPlayerAvatar.value).toBe('🦊');
    });
  });

  // ==========================================================================
  // 2. Solo AI Launch & Exit
  // ==========================================================================
  describe('Solo AI Navigation', () => {
    it('starts solo AI with config, updates avatar, and calls playStart', () => {
      const playStart = vi.fn();
      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
        playStart,
      });

      const config: SoloAiLaunchConfig = {
        mascotId: 'friendly_frog' as MascotId,
        playerColor: 'w',
        playerName: 'Hero',
        playerAvatar: '🐯',
      };

      nav.startSoloAi(config);

      expect(nav.soloAiConfig.value).toEqual(config);
      expect(nav.myPlayerAvatar.value).toBe('🐯');
      expect(nav.currentAppMode.value).toBe('solo_ai');
      expect(playStart).toHaveBeenCalled();
    });

    it('exits solo AI back to lobby mode solo_ai', () => {
      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
      });

      nav.currentAppMode.value = 'solo_ai';
      nav.exitSoloAi();

      expect(nav.currentAppMode.value).toBe('lobby');
      expect(nav.lobbyActiveMode.value).toBe('solo_ai');
    });
  });

  // ==========================================================================
  // 3. Scenario Academy Navigation
  // ==========================================================================
  describe('Scenario Academy Navigation', () => {
    it('selects scenario, switches to academy mode, and calls playStart', () => {
      const playStart = vi.fn();
      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
        playStart,
      });

      const scenario = {
        id: 'scen-fork',
        title: 'Knight Fork',
        category: 'tactics',
        fen: '8/8/8/8/8/8/8/8 w - - 0 1',
      } as unknown as ChessScenario;

      nav.selectScenario(scenario);

      expect(nav.activeScenario.value).toEqual(scenario);
      expect(nav.currentAppMode.value).toBe('academy');
      expect(playStart).toHaveBeenCalled();
    });

    it('exits academy back to lobby mode academy and clears active scenario', () => {
      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
      });

      nav.activeScenario.value = { id: 'scen-1' } as unknown as ChessScenario;
      nav.currentAppMode.value = 'academy';

      nav.exitAcademy();

      expect(nav.currentAppMode.value).toBe('lobby');
      expect(nav.activeScenario.value).toBeNull();
      expect(nav.lobbyActiveMode.value).toBe('academy');
    });
  });

  // ==========================================================================
  // 4. Puzzle Hub & Sub-modes Navigation
  // ==========================================================================
  describe('Puzzle Hub Navigation', () => {
    it('launches themed drills with default or specified theme', () => {
      const playStart = vi.fn();
      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
        playStart,
      });

      nav.launchDrills('pin');
      expect(nav.puzzleDrillTheme.value).toBe('pin');
      expect(nav.puzzleSubMode.value).toBe('themed_drills');
      expect(nav.currentAppMode.value).toBe('puzzle_hub');
      expect(playStart).toHaveBeenCalled();

      nav.launchDrills();
      expect(nav.puzzleDrillTheme.value).toBe('fork');
    });

    it('launches adaptive ladder', () => {
      const playStart = vi.fn();
      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
        playStart,
      });

      nav.launchLadder();
      expect(nav.puzzleSubMode.value).toBe('adaptive_ladder');
      expect(nav.currentAppMode.value).toBe('puzzle_hub');
      expect(playStart).toHaveBeenCalled();
    });

    it('launches rush mode or streak survivor', () => {
      const playStart = vi.fn();
      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
        playStart,
      });

      nav.launchRush('streak_survivor');
      expect(nav.puzzleSubMode.value).toBe('streak_survivor');
      expect(nav.currentAppMode.value).toBe('puzzle_hub');
      expect(playStart).toHaveBeenCalled();

      nav.launchRush();
      expect(nav.puzzleSubMode.value).toBe('puzzle_rush');
    });

    it('exits puzzle back to lobby and resets puzzleSubMode to hub', () => {
      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
      });

      nav.puzzleSubMode.value = 'themed_drills';
      nav.currentAppMode.value = 'puzzle_hub';

      nav.exitPuzzle();

      expect(nav.currentAppMode.value).toBe('lobby');
      expect(nav.lobbyActiveMode.value).toBe('puzzle_hub');
      expect(nav.puzzleSubMode.value).toBe('hub');
    });
  });

  // ==========================================================================
  // 5. Navbar Brand Click
  // ==========================================================================
  describe('Navbar Brand Click', () => {
    it('triggers onLeaveRoom callback when player is currently in a room', () => {
      const onLeaveRoom = vi.fn();
      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
        onLeaveRoom,
      });

      nav.handleNavbarBrandClick(true);
      expect(onLeaveRoom).toHaveBeenCalled();
    });

    it('navigates back to lobby and clears active views when player is not in a room', () => {
      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
      });

      nav.currentAppMode.value = 'puzzle_hub';
      nav.activeScenario.value = { id: 'scen-1' } as unknown as ChessScenario;
      nav.puzzleSubMode.value = 'themed_drills';

      nav.handleNavbarBrandClick(false);

      expect(nav.currentAppMode.value).toBe('lobby');
      expect(nav.activeScenario.value).toBeNull();
      expect(nav.puzzleSubMode.value).toBe('hub');
    });
  });

  // ==========================================================================
  // 6. Network Discovery & Progress Store Integration
  // ==========================================================================
  describe('loadInitialNetworkAndProgress', () => {
    it('fetches and populates LAN info from apiClient', async () => {
      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
      });

      await nav.loadInitialNetworkAndProgress();

      expect(mockApiClient.getLanInfo).toHaveBeenCalled();
      expect(nav.lanInfo.value).toEqual({
        ip: '192.168.1.100',
        port: 3000,
        url: 'http://192.168.1.100:3000',
      });
    });

    it('logs warning gracefully if LAN info request fails', async () => {
      vi.mocked(mockApiClient.getLanInfo).mockRejectedValueOnce(new Error('Network error'));

      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
      });

      await nav.loadInitialNetworkAndProgress();

      expect(nav.lanInfo.value).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch server LAN info'),
        expect.objectContaining({
          operation: 'app_fetch_lan_info',
        })
      );
    });

    it('hydrates progress map and switches lobbyActiveMode to multiplayer_lan if scenarios completed', async () => {
      const mockProgressStore = {
        getProgressMap: vi.fn().mockResolvedValue({
          'scen-1': { starsEarned: 2 },
        }),
      };

      const nav = useAppNavigation({
        storage: mockStorage,
        apiClient: mockApiClient,
        logger: mockLogger,
      });

      expect(nav.lobbyActiveMode.value).toBe('academy');

      await nav.loadInitialNetworkAndProgress(mockProgressStore);

      expect(nav.lobbyActiveMode.value).toBe('multiplayer_lan');
    });

    it('hydrates initialRoomCode from window.location.search on loadInitialNetworkAndProgress', async () => {
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: {
          ...originalLocation,
          search: '?join=wxyz',
        },
        writable: true,
        configurable: true,
      });

      try {
        const nav = useAppNavigation({
          storage: mockStorage,
          apiClient: mockApiClient,
          logger: mockLogger,
        });

        await nav.loadInitialNetworkAndProgress();
        expect(nav.initialRoomCode.value).toBe('WXYZ');
      } finally {
        Object.defineProperty(window, 'location', {
          value: originalLocation,
          writable: true,
          configurable: true,
        });
      }
    });
  });

  // ==========================================================================
  // 7. URL Room Code Parsing Deduplication (ENH-014)
  // ==========================================================================
  describe('parseRoomCodeFromUrl (ENH-014)', () => {
    it('extracts and uppercase-normalizes code from join query parameter', () => {
      expect(parseRoomCodeFromUrl('?join=abcd')).toBe('ABCD');
      expect(parseRoomCodeFromUrl('?join=  wxyz  ')).toBe('WXYZ');
    });

    it('extracts and uppercase-normalizes code from room query parameter', () => {
      expect(parseRoomCodeFromUrl('?room=efgh')).toBe('EFGH');
    });

    it('prioritizes join over room when both are present', () => {
      expect(parseRoomCodeFromUrl('?join=first&room=second')).toBe('FIRST');
    });

    it('returns empty string when query string contains no room parameters', () => {
      expect(parseRoomCodeFromUrl('')).toBe('');
      expect(parseRoomCodeFromUrl('?other=123')).toBe('');
      expect(parseRoomCodeFromUrl('?join=')).toBe('');
    });

    it('reads from window.location.search when search parameter is not provided', () => {
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: {
          ...originalLocation,
          search: '?room=mars',
        },
        writable: true,
        configurable: true,
      });

      try {
        expect(parseRoomCodeFromUrl()).toBe('MARS');
      } finally {
        Object.defineProperty(window, 'location', {
          value: originalLocation,
          writable: true,
          configurable: true,
        });
      }
    });

    it('returns empty string safely when window is undefined in SSR contexts', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error test environment manipulation
      delete globalThis.window;
      try {
        expect(parseRoomCodeFromUrl()).toBe('');
      } finally {
        globalThis.window = originalWindow;
      }
    });
  });
});
