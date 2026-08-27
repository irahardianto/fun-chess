<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type {
  LanInfoResponse,
  AppGameMode,
  SoloAiLaunchConfig,
  ChessScenario,
  ScenarioProgressMap,
  MascotId,
  PieceColor,
} from '@fun-chess/shared';
import { PLAYER_AVATARS, DEFAULT_PLAYER_AVATAR } from '@fun-chess/shared';
import HostCard from './HostCard.vue';
import JoinCard from './JoinCard.vue';
import LobbyModeSelector from './LobbyModeSelector.vue';
import { AiOpponentSelect } from '../ai/components';
import { ScenarioCategoryList } from '../scenarios/components';
import { PuzzleHubView } from '../puzzles/components';
import { useLanDiscovery } from '../../composables/useLanDiscovery';
import { useScenarioProgress } from '../scenarios/composables/useScenarioProgress';
import { useNetworkStatus } from '../pwa/composables/useNetworkStatus';
import { usePwaInstall } from '../pwa/composables/usePwaInstall';
import type { PuzzleTheme } from '@fun-chess/shared';

interface Props {
  initialRoomCode?: string;
  lanInfo?: LanInfoResponse | null;
  loading?: boolean;
  initialMode?: AppGameMode;
  progressMap?: ScenarioProgressMap;
}

const props = withDefaults(defineProps<Props>(), {
  initialRoomCode: '',
  lanInfo: null,
  loading: false,
  initialMode: 'multiplayer_lan',
  progressMap: undefined,
});

const emit = defineEmits<{
  createRoom: [payload: { playerName: string; avatar: string; preferredColor: 'w' | 'b' | 'random' }];
  'create-room': [payload: { playerName: string; avatar: string; preferredColor: 'w' | 'b' | 'random' }];
  host: [payload: { playerName: string; preferredColor: 'w' | 'b' | 'random' }];
  joinRoom: [payload: { roomCode: string; playerName: string; avatar: string }];
  'join-room': [payload: { roomCode: string; playerName: string; avatar: string }];
  join: [payload: { roomCode: string; playerName: string }];
  startSoloAi: [payload: SoloAiLaunchConfig];
  'start-solo-ai': [payload: SoloAiLaunchConfig];
  selectScenario: [scenario: ChessScenario];
  'select-scenario': [scenario: ChessScenario];
  modeChange: [mode: AppGameMode];
  'mode-change': [mode: AppGameMode];
  launchDrills: [theme?: PuzzleTheme];
  'launch-drills': [theme?: PuzzleTheme];
  launchLadder: [];
  'launch-ladder': [];
  launchRush: [subMode?: 'puzzle_rush' | 'streak_survivor'];
  'launch-rush': [subMode?: 'puzzle_rush' | 'streak_survivor'];
  openSync: [];
  'open-sync': [];
}>();

const STORAGE_KEY = 'fun_chess_player_avatar';

function getSavedAvatar(): string {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && (PLAYER_AVATARS as readonly string[]).includes(saved)) {
        return saved;
      }
    } catch {
      // Storage access error fallback
    }
  }
  return DEFAULT_PLAYER_AVATAR;
}

const selectedAvatar = ref<string>(getSavedAvatar());

function selectAvatar(avatar: string) {
  selectedAvatar.value = avatar;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, avatar);
    } catch {
      // Storage access error fallback
    }
  }
}

const activeMode = ref<AppGameMode>(
  props.initialMode === 'lobby' ? 'multiplayer_lan' : props.initialMode || 'multiplayer_lan'
);

watch(
  () => props.initialMode,
  (newMode) => {
    if (newMode) {
      activeMode.value = newMode === 'lobby' ? 'multiplayer_lan' : newMode;
    }
  }
);

const { serverLanInfo, activeLanIp } = useLanDiscovery();
const scenarioProgress = useScenarioProgress();
const { isOffline } = useNetworkStatus();
const { canInstall, isStandalone, promptInstall } = usePwaInstall();

const isCloudMode = computed(() => {
  const info = props.lanInfo || serverLanInfo.value;
  return (
    !!info?.isCloudRelay ||
    info?.relayMode === 'cloud' ||
    (typeof window !== 'undefined' && window.location.protocol === 'https:')
  );
});

const activeProgressMap = computed(() => {
  return props.progressMap ?? scenarioProgress.progressMap.value;
});

const effectiveJoinUrl = computed(() => {
  const info = props.lanInfo || serverLanInfo.value;
  const host =
    activeLanIp.value && activeLanIp.value !== '127.0.0.1' && activeLanIp.value !== 'localhost'
      ? activeLanIp.value
      : info?.lanIp && info.lanIp !== '127.0.0.1'
        ? info.lanIp
        : typeof window !== 'undefined'
          ? window.location.hostname
          : 'localhost';

  const port =
    typeof window !== 'undefined' && window.location.port
      ? window.location.port
      : info?.port
        ? String(info.port)
        : '3000';

  const protocol = typeof window !== 'undefined' && window.location.protocol ? window.location.protocol : 'http:';
  const portPart = port ? `:${port}` : '';
  return `${protocol}//${host}${portPart}`;
});

function handleModeChange(mode: AppGameMode) {
  activeMode.value = mode;
  emit('modeChange', mode);
  emit('mode-change', mode);
}

function onHost(payload: { playerName: string; preferredColor: 'w' | 'b' | 'random' }) {
  emit('host', payload);
  emit('createRoom', {
    playerName: payload.playerName,
    avatar: selectedAvatar.value,
    preferredColor: payload.preferredColor,
  });
  emit('create-room', {
    playerName: payload.playerName,
    avatar: selectedAvatar.value,
    preferredColor: payload.preferredColor,
  });
}

function onJoin(payload: { roomCode: string; playerName: string }) {
  emit('join', payload);
  emit('joinRoom', {
    roomCode: payload.roomCode,
    playerName: payload.playerName,
    avatar: selectedAvatar.value,
  });
  emit('join-room', {
    roomCode: payload.roomCode,
    playerName: payload.playerName,
    avatar: selectedAvatar.value,
  });
}

function handleStartSoloAi(payload: { mascotId: MascotId; playerColor: PieceColor | 'random'; avatar?: string }) {
  const avatar = payload.avatar || selectedAvatar.value;
  selectAvatar(avatar);
  const config = {
    mascotId: payload.mascotId,
    playerColor: payload.playerColor,
    playerName: 'You',
    playerAvatar: avatar,
  };
  emit('startSoloAi', config);
  emit('start-solo-ai', config);
}

function handleSelectScenario(scenario: ChessScenario) {
  emit('selectScenario', scenario);
  emit('select-scenario', scenario);
}

function handleLaunchDrills(theme?: PuzzleTheme) {
  emit('launchDrills', theme);
  emit('launch-drills', theme);
}

function handleLaunchLadder() {
  emit('launchLadder');
  emit('launch-ladder');
}

function handleLaunchRush(subMode?: 'puzzle_rush' | 'streak_survivor') {
  emit('launchRush', subMode);
  emit('launch-rush', subMode);
}
</script>

<template>
  <div class="lobby-view-container" data-testid="lobby-view">
    <!-- Header Banner -->
    <header class="lobby-header">
      <div class="logo-badge" aria-hidden="true">♟️✨</div>
      <h1 class="lobby-title">Fun Chess!</h1>
      <p class="lobby-subtitle">Play, Learn, and Master Chess with Friends & AI!</p>

      <div class="lobby-header-badges">
        <span v-if="isOffline" class="offline-badge-pill" data-testid="lobby-offline-badge">
          ✈️ 100% Offline Mode
        </span>
        <button
          v-if="canInstall && !isStandalone"
          type="button"
          class="quick-install-btn"
          data-testid="lobby-install-btn"
          title="Install App for Offline Play"
          @click="promptInstall"
        >
          <span aria-hidden="true">📲</span> Install App
        </button>
        <button
          type="button"
          class="quick-sync-btn"
          data-testid="lobby-quick-sync-btn"
          title="Sync & Backup Progress"
          @click="emit('openSync'); emit('open-sync')"
        >
          <span aria-hidden="true">🔄</span> Save & Sync
        </button>
      </div>
    </header>

    <!-- 4-Way Mode Switcher Tabs -->
    <LobbyModeSelector
      :model-value="activeMode"
      @update:model-value="handleModeChange"
    />

    <!-- Panel 1: LAN Multiplayer Mode -->
    <div
      v-if="activeMode === 'multiplayer_lan' || activeMode === 'lobby'"
      id="mode-panel-multiplayer_lan"
      role="tabpanel"
      aria-labelledby="mode-tab-multiplayer_lan"
      class="mode-panel lan-mode-panel"
      data-testid="lan-mode-panel"
    >
      <!-- Avatar Picker Control -->
      <div class="avatar-picker-control" role="group" aria-label="Select Player Avatar">
        <span class="picker-label">Your Avatar:</span>
        <div class="avatar-options" role="radiogroup" aria-label="Choose your avatar emoji">
          <button
            v-for="emoji in PLAYER_AVATARS"
            :key="emoji"
            type="button"
            class="avatar-option-btn"
            :class="{ 'is-selected': selectedAvatar === emoji }"
            :aria-checked="selectedAvatar === emoji"
            :aria-label="`Select ${emoji} avatar`"
            :data-testid="`lobby-avatar-option-${emoji}`"
            role="radio"
            @click="selectAvatar(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </div>

      <!-- Action Cards: Host or Join -->
      <div class="lobby-actions-grid">
        <HostCard
          :loading="props.loading"
          @host="onHost"
        />

        <JoinCard
          :initial-room-code="props.initialRoomCode"
          :loading="props.loading"
          @join="onJoin"
        />
      </div>

      <!-- Server Status Banner (Cloud or Local Wi-Fi) -->
      <div class="lan-host-banner" :class="{ 'is-cloud-relay': isCloudMode }" data-testid="lobby-server-banner">
        <span class="lan-icon">{{ isCloudMode ? '☁️' : '📡' }}</span>
        <div class="lan-details">
          <span class="lan-title">{{ isCloudMode ? '☁️ Cloud Server Online' : 'Local Wi-Fi Server Active' }}</span>
          <span class="lan-url">{{ isCloudMode ? 'Share via Cloud Link / QR Code' : `Join URL: ${effectiveJoinUrl}` }}</span>
        </div>
      </div>
    </div>

    <!-- Panel 2: Solo AI Mascots Mode -->
    <div
      v-else-if="activeMode === 'solo_ai'"
      id="mode-panel-solo_ai"
      role="tabpanel"
      aria-labelledby="mode-tab-solo_ai"
      class="mode-panel solo-ai-panel"
      data-testid="solo-ai-panel"
    >
      <AiOpponentSelect
        :initial-avatar="selectedAvatar"
        @start="handleStartSoloAi"
      />
    </div>

    <!-- Panel 3: Chess Academy Mode -->
    <div
      v-else-if="activeMode === 'academy'"
      id="mode-panel-academy"
      role="tabpanel"
      aria-labelledby="mode-tab-academy"
      class="mode-panel academy-panel"
      data-testid="academy-panel"
    >
      <ScenarioCategoryList
        :progress-map="activeProgressMap"
        :total-stars="scenarioProgress.totalStarsEarned.value"
        :completed-count="scenarioProgress.completedCount.value"
        :total-scenarios="scenarioProgress.totalScenarios.value"
        @select-scenario="handleSelectScenario"
      />
    </div>

    <!-- Panel 4: Puzzle Hub Mode -->
    <div
      v-else-if="activeMode === 'puzzle_hub'"
      id="mode-panel-puzzle_hub"
      role="tabpanel"
      aria-labelledby="mode-tab-puzzle_hub"
      class="mode-panel puzzle-hub-panel"
      data-testid="puzzle-hub-panel"
    >
      <PuzzleHubView
        @launch-drills="handleLaunchDrills"
        @launch-ladder="handleLaunchLadder"
        @launch-rush="handleLaunchRush"
      />
    </div>
  </div>
</template>

<style scoped>
.lobby-view-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 0;
  gap: var(--space-5);
  box-sizing: border-box;
}

.lobby-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-2);
}

.logo-badge {
  font-size: 3.25rem;
  line-height: 1;
  display: inline-block;
  user-select: none;
  animation: float-bounce 2.5s infinite ease-in-out;
  filter: drop-shadow(0 4px 10px rgba(108, 92, 231, 0.18));
}

.lobby-title {
  font-family: var(--font-display);
  font-size: var(--text-hero);
  font-weight: var(--weight-bold);
  color: var(--color-primary);
  line-height: var(--leading-none);
  text-shadow: var(--shadow-sm);
}

.lobby-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-lg);
  color: var(--text-muted);
  font-weight: var(--weight-semibold);
}

.lobby-header-badges {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-2);
  flex-wrap: wrap;
}

.offline-badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-pill, 9999px);
  background-color: var(--status-offline-bg, rgba(245, 158, 11, 0.16));
  border: 1.5px solid var(--status-offline, #f59e0b);
  color: var(--status-offline-text, #fef3c7);
  font-family: var(--font-display);
  font-size: var(--text-xs, 12px);
  font-weight: var(--weight-bold, 700);
}

.quick-install-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-pill, 9999px);
  background-color: var(--color-primary-subtle, rgba(108, 92, 231, 0.14));
  border: 1.5px solid var(--color-primary, #6c5ce7);
  color: var(--text-main);
  font-family: var(--font-display);
  font-size: var(--text-xs, 12px);
  font-weight: var(--weight-bold, 700);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-spring), background-color var(--duration-fast) ease, color var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
}

.quick-install-btn:hover {
  transform: translateY(-2px);
  background-color: var(--color-primary, #6c5ce7);
  color: #ffffff;
  box-shadow: 0 4px 12px var(--color-primary-subtle, rgba(108, 92, 231, 0.25));
}

.quick-install-btn:active {
  transform: translateY(0);
}

.quick-sync-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-pill, 9999px);
  background-color: var(--bg-surface-raised);
  border: 1.5px solid var(--border-medium);
  color: var(--text-main);
  font-family: var(--font-display);
  font-size: var(--text-xs, 12px);
  font-weight: var(--weight-bold, 700);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-spring), background-color var(--duration-fast) ease, border-color var(--duration-fast) ease, color var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
}

.quick-sync-btn:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary);
  box-shadow: 0 4px 12px var(--color-primary-subtle);
}

.quick-sync-btn:active {
  transform: translateY(0);
}

.mode-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: var(--space-5);
}

.lan-mode-panel {
  width: 100%;
  max-width: 100%;
}

.solo-ai-panel,
.academy-panel,
.puzzle-hub-panel {
  width: 100%;
  max-width: 100%;
}

/* Avatar Picker Control */
.avatar-picker-control {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  max-width: 100%;
  background-color: var(--bg-surface);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
  border: 1.5px solid var(--border-medium);
  box-shadow: var(--shadow-xs);
}

.picker-label {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--text-muted);
  white-space: nowrap;
}

.avatar-options {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.avatar-option-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  font-size: 1.5rem;
  background-color: var(--bg-app);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-spring),
              box-shadow var(--duration-fast) ease,
              border-color var(--duration-fast) ease,
              background-color var(--duration-fast) ease;
}

.avatar-option-btn:hover {
  transform: translateY(-2px) scale(1.08);
  border-color: var(--color-primary);
}

.avatar-option-btn:focus-visible {
  outline: 2px solid var(--border-focus, var(--color-primary));
  outline-offset: 2px;
  box-shadow: var(--focus-ring, 0 0 0 3px hsla(var(--color-primary-h, 255), 85%, 60%, 0.45));
}

.avatar-option-btn.is-selected {
  border-color: var(--color-accent);
  background-color: var(--color-accent-subtle);
  transform: translateY(-2px) scale(1.12);
  box-shadow: 0 0 0 2px var(--color-accent), var(--shadow-btn-accent, 0 3px 0 rgba(245, 130, 32, 0.45));
}

.lobby-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
  width: 100%;
  align-items: stretch;
}

@media (max-width: 600px) {
  .lobby-actions-grid {
    grid-template-columns: 1fr;
  }
}

/* LAN Banner */
.lan-host-banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  background-color: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-sizing: border-box;
}

.lan-icon {
  font-size: 1.5rem;
}

.lan-details {
  display: flex;
  flex-direction: column;
}

.lan-title {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--text-main);
}

.lan-url {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}
</style>

