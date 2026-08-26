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
import BaseCard from '../../components/base/BaseCard.vue';
import HostCard from './HostCard.vue';
import JoinCard from './JoinCard.vue';
import LobbyModeSelector from './LobbyModeSelector.vue';
import { AiOpponentSelect } from '../ai/components';
import { ScenarioCategoryList } from '../scenarios/components';
import { PuzzleHubView } from '../puzzles/components';
import { useLanDiscovery } from '../../composables/useLanDiscovery';
import { useScenarioProgress } from '../scenarios/composables/useScenarioProgress';
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
}>();

const avatars = ['🦁', '🚀', '🦄', '⚡', '👑', '🐼'] as const;
const selectedAvatar = ref<string>('🦁');
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

function handleStartSoloAi(payload: { mascotId: MascotId; playerColor: PieceColor | 'random' }) {
  const config = {
    mascotId: payload.mascotId,
    playerColor: payload.playerColor,
    playerName: 'You',
    playerAvatar: selectedAvatar.value,
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
      <!-- Avatar Picker -->
      <BaseCard variant="flat" padding="sm" class="avatar-card">
        <div class="avatar-picker-group">
          <label class="section-label">Select Your Avatar Emoji:</label>
          <div class="avatar-options" role="radiogroup" aria-label="Choose your avatar emoji">
            <button
              v-for="emoji in avatars"
              :key="emoji"
              type="button"
              class="avatar-option-btn"
              :class="{ 'is-selected': selectedAvatar === emoji }"
              :aria-checked="selectedAvatar === emoji"
              role="radio"
              @click="selectedAvatar = emoji"
            >
              {{ emoji }}
            </button>
          </div>
        </div>
      </BaseCard>

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

      <!-- LAN IP Host Banner -->
      <div class="lan-host-banner">
        <span class="lan-icon">📡</span>
        <div class="lan-details">
          <span class="lan-title">Local Wi-Fi Server Active</span>
          <span class="lan-url">Join URL: {{ effectiveJoinUrl }}</span>
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
  max-width: 840px;
  margin: 0 auto;
  padding: var(--space-3) var(--space-4);
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

.mode-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: var(--space-5);
}

.lan-mode-panel {
  max-width: 680px;
}

.solo-ai-panel,
.academy-panel,
.puzzle-hub-panel {
  width: 100%;
}

.avatar-card {
  width: 100%;
}

.avatar-picker-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.section-label {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--text-muted);
}

.avatar-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.avatar-option-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  font-size: 1.6rem;
  background-color: var(--bg-app);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-spring);
}

.avatar-option-btn:hover {
  transform: translateY(-3px) scale(1.1);
  border-color: var(--color-primary);
}

.avatar-option-btn.is-selected {
  border-color: var(--color-accent);
  background-color: var(--color-accent-subtle);
  transform: translateY(-3px) scale(1.15);
  box-shadow: var(--shadow-btn-accent);
}

.lobby-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
  width: 100%;
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

