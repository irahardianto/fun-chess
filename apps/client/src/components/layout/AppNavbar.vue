<script setup lang="ts">
import { computed } from 'vue';
import type { RoomState, Player, AppGameMode, ChessScenario } from '@fun-chess/shared';
import { BaseButton } from '@/components/base';

interface Props {
  isDarkMode?: boolean;
  isMuted?: boolean;
  canInstall?: boolean;
  currentRoom?: RoomState | null;
  currentPlayer?: Player | null;
  currentAppMode?: AppGameMode;
  isMyTurn?: boolean;
  activeScenario?: Partial<ChessScenario> | Record<string, unknown> | null;
  puzzleSubMode?: string;
}

const props = withDefaults(defineProps<Props>(), {
  isDarkMode: false,
  isMuted: false,
  canInstall: false,
  currentRoom: null,
  currentPlayer: null,
  currentAppMode: 'lobby',
  isMyTurn: undefined,
  activeScenario: null,
  puzzleSubMode: 'hub',
});

const emit = defineEmits<{
  'toggle-theme': [];
  'toggle-mute': [];
  'install-pwa': [];
  'prompt-install': [];
  install: [];
  'navigate-home': [];
  'open-qr': [];
  'leave-room': [];
  'exit-solo-ai': [];
  'exit-academy': [];
  'exit-puzzle': [];
  'open-sync': [];
}>();

const isMyTurnComputed = computed(() => {
  if (props.isMyTurn !== undefined) return props.isMyTurn;
  if (!props.currentRoom || props.currentRoom.status !== 'playing') return false;
  if (!props.currentPlayer || !props.currentRoom.game) return false;
  return props.currentRoom.game.turn === props.currentPlayer.color;
});

const exitAction = computed(() => {
  if (props.currentRoom) {
    return { testId: 'leave-room-btn', ariaLabel: 'Return to Lobby', emit: () => emit('leave-room') };
  }
  if (props.currentAppMode === 'solo_ai') {
    return { testId: 'exit-solo-ai-btn', ariaLabel: 'Return to Lobby', emit: () => emit('exit-solo-ai') };
  }
  if (props.currentAppMode === 'academy' && props.activeScenario) {
    return { testId: 'exit-academy-btn', ariaLabel: 'Return to Academy', emit: () => emit('exit-academy') };
  }
  if (props.currentAppMode === 'puzzle_hub' && props.puzzleSubMode && props.puzzleSubMode !== 'hub') {
    return { testId: 'exit-puzzle-btn', ariaLabel: 'Return to Puzzle Hub', emit: () => emit('exit-puzzle') };
  }
  return null;
});

function handleBrandClick() {
  emit('navigate-home');
}

function handleInstall() {
  emit('install-pwa');
  emit('prompt-install');
  emit('install');
}
</script>

<template>
  <header class="app-navbar" data-testid="app-navbar">
    <button
      type="button"
      class="navbar-brand"
      title="Fun Chess Home"
      aria-label="Fun Chess Home"
      @click="handleBrandClick"
    >
      <span class="brand-logo-icon" aria-hidden="true">♟️</span>
      <span class="brand-title">Fun Chess! ✨</span>
    </button>

    <div v-if="currentRoom" class="room-chip-group">
      <button
        type="button"
        class="room-code-chip"
        data-testid="room-code-chip"
        title="View QR code"
        :aria-label="'View QR code for room ' + (currentRoom.roomCode || '')"
        @click="emit('open-qr')"
      >
        <span class="room-chip-label">Room:</span>
        <span class="room-chip-code">{{ currentRoom.roomCode }}</span>
        <span class="room-chip-icon">📱</span>
      </button>

      <div
        v-if="currentRoom.status === 'playing'"
        class="turn-status-badge desktop-turn-badge"
        :class="{ 'is-my-turn': isMyTurnComputed }"
      >
        {{ isMyTurnComputed ? 'Your Turn! ✨' : 'Thinking... ⏳' }}
      </div>
    </div>

    <div class="navbar-actions">
      <BaseButton
        v-if="canInstall"
        variant="primary"
        size="sm"
        data-testid="pwa-install-btn"
        class="nav-install-btn"
        aria-label="Install App"
        @click="handleInstall"
      >
        <template #icon-left>📲</template>
        Install App
      </BaseButton>

      <BaseButton
        variant="ghost"
        size="sm"
        data-testid="save-sync-btn"
        class="nav-icon-btn"
        aria-label="Save & Sync Progress"
        title="Save & Sync Progress"
        @click="emit('open-sync')"
      >
        <template #icon>⚙️</template>
      </BaseButton>

      <BaseButton
        variant="ghost"
        size="sm"
        data-testid="mute-toggle-btn"
        :aria-label="isMuted ? 'Unmute audio' : 'Mute audio'"
        class="nav-icon-btn"
        @click="emit('toggle-mute')"
      >
        <template #icon>{{ isMuted ? '🔇' : '🔊' }}</template>
      </BaseButton>

      <BaseButton
        variant="ghost"
        size="sm"
        class="nav-icon-btn"
        data-testid="theme-toggle-btn"
        :aria-label="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="emit('toggle-theme')"
      >
        <template #icon>{{ isDarkMode ? '☀️' : '🌙' }}</template>
      </BaseButton>

      <BaseButton
        v-if="exitAction"
        variant="ghost"
        size="sm"
        class="nav-icon-btn nav-exit-btn"
        :data-testid="exitAction.testId"
        :aria-label="exitAction.ariaLabel"
        @click="exitAction.emit"
      >
        <template #icon>
          <span class="exit-icon">🚪</span>
          <span class="exit-text">Exit</span>
        </template>
      </BaseButton>
    </div>
  </header>
</template>

<style scoped>
.app-navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  padding: var(--space-2, 8px) var(--space-4, 16px);
  padding-block-start: max(var(--space-2, 8px), calc(var(--space-2, 8px) + env(safe-area-inset-top, 0px)));
  padding-inline-start: max(var(--space-4, 16px), calc(var(--space-4, 16px) + env(safe-area-inset-left, 0px)));
  padding-inline-end: max(var(--space-4, 16px), calc(var(--space-4, 16px) + env(safe-area-inset-right, 0px)));
  background-color: var(--bg-surface, #ffffff);
  border-bottom: 1px solid var(--border-subtle, #e2e8f0);
  box-shadow: var(--shadow-xs);
  position: sticky;
  top: 0;
  z-index: 50;
  box-sizing: border-box;
  width: 100%;
  max-width: 100vw;
}
.navbar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-1-5, 6px);
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
  background: transparent;
  border: none;
  min-height: 44px;
  min-width: 44px;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: start;
  box-sizing: border-box;
  transition: transform var(--duration-fast, 150ms) var(--ease-spring);
}
.navbar-brand:hover { transform: scale(1.02); }
.navbar-brand:active { transform: scale(0.96); }
.navbar-brand:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: var(--focus-ring, 0 0 0 3px hsl(var(--color-primary-h, 255) 85% 60% / 0.45));
  border-radius: var(--radius-sm, 8px);
}
.brand-logo-icon { font-size: 1.6rem; line-height: 1; }
.brand-title {
  font-family: var(--font-display);
  font-size: var(--text-xl, 20px);
  font-weight: var(--weight-heavy, 700);
  background: linear-gradient(135deg, var(--color-primary, #6c5ce7), var(--color-accent, #ffb300));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
}
.room-chip-group { display: flex; align-items: center; gap: var(--space-2, 8px); flex-shrink: 1; min-width: 0; }
.room-code-chip {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  min-height: 44px; min-width: 44px;
  background-color: var(--color-primary-subtle, rgba(108, 92, 231, 0.14));
  border: 1px dashed var(--color-primary, #6c5ce7);
  padding: 4px 12px; border-radius: var(--radius-pill, 9999px);
  cursor: pointer; white-space: nowrap; box-sizing: border-box;
  transition: transform var(--duration-fast, 140ms) var(--ease-spring);
}
.room-code-chip:hover { transform: scale(1.05); }
.room-code-chip:active { transform: scale(0.96); }
.room-code-chip:focus-visible {
  outline: 2px solid var(--color-primary, #6c5ce7);
  outline-offset: 2px;
  box-shadow: var(--focus-ring, 0 0 0 3px hsl(var(--color-primary-h, 255) 85% 60% / 0.45));
}
.room-chip-label { font-family: var(--font-body); font-size: var(--text-xs, 12px); font-weight: var(--weight-bold, 700); color: var(--color-primary, #6c5ce7); }
.room-chip-code { font-family: var(--font-mono); font-size: var(--text-sm, 14px); font-weight: var(--weight-heavy, 700); color: var(--color-primary, #6c5ce7); letter-spacing: 0.08em; }
.room-chip-icon { font-size: var(--text-sm, 14px); }
.turn-status-badge {
  font-family: var(--font-display); font-size: var(--text-xs, 12px); font-weight: var(--weight-bold, 700);
  padding: 4px 10px; border-radius: var(--radius-pill, 9999px);
  background-color: var(--turn-waiting-bg, rgba(100, 116, 139, 0.15)); color: var(--turn-waiting-text, #64748b);
  white-space: nowrap; display: inline-flex; align-items: center;
}
.turn-status-badge.is-my-turn {
  background-color: var(--turn-active-bg, rgba(34, 197, 94, 0.2));
  color: var(--turn-active-text, #15803d);
  animation: turn-bounce-glow 1.8s infinite ease-in-out;
}
.navbar-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.nav-install-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 44px; min-width: 44px; gap: 4px;
  font-family: var(--font-display); font-size: var(--text-xs, 12px); font-weight: var(--weight-bold, 700);
  border-radius: var(--radius-pill, 9999px); padding: 4px 12px; box-sizing: border-box;
  animation: float-bounce 3s infinite ease-in-out;
  transition: transform var(--duration-fast, 140ms) var(--ease-spring);
}
.nav-install-btn:active { transform: scale(0.96); }
.nav-icon-btn {
  padding: 4px 8px; min-width: 44px; min-height: 44px; height: 44px;
  display: inline-flex; align-items: center; justify-content: center;
  transition: transform var(--duration-fast, 150ms) var(--ease-spring);
}
.nav-icon-btn:active { transform: scale(0.96); }
.nav-exit-btn { display: inline-flex; align-items: center; gap: 3px; }
.exit-icon { font-size: var(--text-base, 16px); }
.exit-text { font-family: var(--font-body); font-size: var(--text-xs, 12px); font-weight: bold; }
@media (max-width: 640px) {
  .app-navbar { padding: 6px 10px; }
  .brand-title, .desktop-turn-badge, .room-chip-label, .nav-install-btn, .exit-text { display: none; }
  .brand-logo-icon { font-size: 1.4rem; }
  .room-code-chip { padding: 4px 10px; font-size: var(--text-xs, 12px); white-space: nowrap; flex-shrink: 0; min-height: 44px; min-width: 44px; box-sizing: border-box; }
  .nav-icon-btn { min-width: 44px; min-height: 44px; height: 44px; padding: 2px 6px; }
}
</style>
