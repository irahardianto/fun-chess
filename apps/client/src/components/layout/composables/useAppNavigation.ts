/**
 * Navigation and view routing composable for Fun Chess app shell.
 * Encapsulates game modes, active sub-modes, solo AI configs, scenario state,
 * and lobby initializations.
 *
 * Adheres to Finding MAJ-022 (App.vue God Component Decomposition).
 */

import { ref } from 'vue';
import type {
  AppGameMode,
  SoloAiLaunchConfig,
  ChessScenario,
  PuzzleTheme,
  LanInfoResponse,
} from '@fun-chess/shared';
import { DEFAULT_PLAYER_AVATAR } from '@fun-chess/shared';
import { STORAGE_KEYS, type KeyValueStorage } from '@/platform/storage';
import type { IApiClient } from '@/platform/api';
import type { ILogger } from '@/platform/telemetry';

export interface AppNavigationOptions {
  storage: KeyValueStorage;
  apiClient: IApiClient;
  logger: ILogger;
  onLeaveRoom?: () => void;
  playStart?: () => void;
}

/**
 * Extracts and normalizes a room code from URL search query parameters (ENH-014).
 * Inspects both `join` and `room` query parameters, trimming whitespace and converting to uppercase.
 *
 * @param search - Optional query string (e.g. `?join=WXYZ`). If omitted, defaults to `window.location.search`.
 * @param logger - Optional logger instance for capturing debug diagnostics on malformed query strings.
 * @returns Normalized uppercase room code string, or empty string if not present.
 */
export function parseRoomCodeFromUrl(search?: string, logger?: ILogger): string {
  if (search === undefined && typeof window === 'undefined') {
    return '';
  }
  const queryString = search ?? (typeof window !== 'undefined' ? window.location?.search : '');
  if (!queryString) {
    return '';
  }

  try {
    const params = new URLSearchParams(queryString);
    const candidate = params.get('join') || params.get('room');
    return candidate ? candidate.trim().toUpperCase() : '';
  } catch (err) {
    logger?.debug('Failed to parse URL query params for initial room code', {
      operation: 'app_get_initial_room_code',
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

export function useAppNavigation(options: AppNavigationOptions) {
  const { storage, apiClient, logger, onLeaveRoom, playStart } = options;

  function getInitialLobbyMode(): AppGameMode {
    const roomParam = parseRoomCodeFromUrl(undefined, logger);
    if (roomParam) {
      return 'multiplayer_lan';
    }
    try {
      const raw = storage.getItem(STORAGE_KEYS.SCENARIO_PROGRESS);
      if (!raw) return 'academy';
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return 'academy';
      const completed = Object.values(parsed).filter((item: unknown) => {
        return Boolean(
          item &&
          typeof item === 'object' &&
          'starsEarned' in item &&
          typeof (item as { starsEarned: unknown }).starsEarned === 'number' &&
          (item as { starsEarned: number }).starsEarned > 0
        );
      }).length;
      return completed > 0 ? 'multiplayer_lan' : 'academy';
    } catch (err) {
      logger.warn('Failed to parse scenario progress for initial lobby mode', {
        operation: 'app_get_initial_lobby_mode',
        error: err instanceof Error ? err.message : String(err),
      });
      return 'academy';
    }
  }

  function getInitialRoomCode(): string {
    return parseRoomCodeFromUrl(undefined, logger);
  }

  function getInitialAvatar(): string {
    const saved = storage.getItem(STORAGE_KEYS.PLAYER_AVATAR);
    return saved || DEFAULT_PLAYER_AVATAR;
  }

  const currentAppMode = ref<AppGameMode>('lobby');
  const lobbyActiveMode = ref<AppGameMode>(getInitialLobbyMode());
  const soloAiConfig = ref<SoloAiLaunchConfig | null>(null);
  const activeScenario = ref<ChessScenario | null>(null);
  const puzzleSubMode = ref<'hub' | 'themed_drills' | 'adaptive_ladder' | 'puzzle_rush' | 'streak_survivor'>('hub');
  const puzzleDrillTheme = ref<PuzzleTheme>('fork');
  const initialRoomCode = ref(getInitialRoomCode());
  const lanInfo = ref<LanInfoResponse | null>(null);
  const isActionLoading = ref(false);
  const myPlayerAvatar = ref<string>(getInitialAvatar());

  function syncRoomCodeFromUrl(search?: string): string {
    const roomParam = parseRoomCodeFromUrl(search, logger);
    if (roomParam) {
      initialRoomCode.value = roomParam;
    }
    return roomParam;
  }

  async function loadLanInfo(): Promise<LanInfoResponse | null> {
    try {
      const info = await apiClient.getLanInfo();
      lanInfo.value = info;
      return info;
    } catch (err) {
      logger.warn('Failed to fetch server LAN info, using offline fallback', {
        operation: 'app_fetch_lan_info',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async function syncScenarioProgress(defaultProgressStore?: { getProgressMap: () => Promise<Record<string, { starsEarned?: number }>> }): Promise<void> {
    if (defaultProgressStore) {
      try {
        const progressMap = await defaultProgressStore.getProgressMap();
        const completedCount = Object.values(progressMap).filter((item) => Boolean(item && (item.starsEarned ?? 0) > 0)).length;
        if (completedCount > 0 && lobbyActiveMode.value === 'academy') {
          lobbyActiveMode.value = 'multiplayer_lan';
        }
      } catch (err) {
        logger.warn('Failed to load scenario progress map on mount', {
          operation: 'app_mount_scenario_progress',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async function loadInitialNetworkAndProgress(defaultProgressStore?: { getProgressMap: () => Promise<Record<string, { starsEarned?: number }>> }): Promise<void> {
    const roomParam = syncRoomCodeFromUrl();
    if (roomParam) {
      lobbyActiveMode.value = 'multiplayer_lan';
    }
    await loadLanInfo();
    await syncScenarioProgress(defaultProgressStore);
  }

  function handleNavbarBrandClick(isInRoom: boolean): void {
    if (isInRoom) {
      if (onLeaveRoom) {
        onLeaveRoom();
      }
    } else {
      currentAppMode.value = 'lobby';
      activeScenario.value = null;
      puzzleSubMode.value = 'hub';
    }
  }

  function startSoloAi(config: SoloAiLaunchConfig): void {
    soloAiConfig.value = config;
    if (config.playerAvatar) {
      myPlayerAvatar.value = config.playerAvatar;
    }
    currentAppMode.value = 'solo_ai';
    playStart?.();
  }

  function selectScenario(scenario: ChessScenario): void {
    activeScenario.value = scenario;
    currentAppMode.value = 'academy';
    playStart?.();
  }

  function launchDrills(theme?: PuzzleTheme): void {
    puzzleDrillTheme.value = theme || 'fork';
    puzzleSubMode.value = 'themed_drills';
    currentAppMode.value = 'puzzle_hub';
    playStart?.();
  }

  function launchLadder(): void {
    puzzleSubMode.value = 'adaptive_ladder';
    currentAppMode.value = 'puzzle_hub';
    playStart?.();
  }

  function launchRush(subMode?: 'puzzle_rush' | 'streak_survivor'): void {
    puzzleSubMode.value = subMode || 'puzzle_rush';
    currentAppMode.value = 'puzzle_hub';
    playStart?.();
  }

  function exitSoloAi(): void {
    currentAppMode.value = 'lobby';
    lobbyActiveMode.value = 'solo_ai';
  }

  function exitAcademy(): void {
    currentAppMode.value = 'lobby';
    activeScenario.value = null;
    lobbyActiveMode.value = 'academy';
  }

  function exitPuzzle(): void {
    currentAppMode.value = 'lobby';
    lobbyActiveMode.value = 'puzzle_hub';
    puzzleSubMode.value = 'hub';
  }

  return {
    currentAppMode,
    lobbyActiveMode,
    soloAiConfig,
    activeScenario,
    puzzleSubMode,
    puzzleDrillTheme,
    initialRoomCode,
    lanInfo,
    isActionLoading,
    myPlayerAvatar,
    loadInitialNetworkAndProgress,
    syncRoomCodeFromUrl,
    loadLanInfo,
    syncScenarioProgress,
    handleNavbarBrandClick,
    startSoloAi,
    selectScenario,
    launchDrills,
    launchLadder,
    launchRush,
    exitSoloAi,
    exitAcademy,
    exitPuzzle,
  };
}
