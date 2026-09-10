<script setup lang="ts">
import { computed } from 'vue';
import type { PieceColor } from '@fun-chess/shared';

interface Props {
  name?: string;
  playerName?: string;
  avatar?: string;
  color: PieceColor;
  isCurrentTurn?: boolean;
  isConnected?: boolean;
  isSelf?: boolean;
  isHost?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  name: undefined,
  playerName: undefined,
  avatar: '🦁',
  isCurrentTurn: false,
  isConnected: true,
  isSelf: false,
  isHost: false,
});

const displayName = computed(() => props.playerName || props.name || 'Player');

const statusLabel = computed(() => {
  if (!props.isConnected) return 'Reconnecting...';
  return 'Online';
});

const turnText = computed(() => {
  if (!props.isCurrentTurn) return '';
  return props.isSelf ? 'Your Turn! ✨' : 'Thinking... ⏳';
});
</script>

<template>
  <div
    class="player-badge"
    :class="{
      'is-active-turn': props.isCurrentTurn,
      'is-disconnected': !props.isConnected,
      'is-self': props.isSelf,
    }"
    role="region"
    :aria-label="`${displayName}, playing as ${props.color === 'w' ? 'White' : 'Black'}, ${statusLabel}`"
  >
    <!-- Avatar & Status Indicator -->
    <div class="avatar-container">
      <span data-testid="player-avatar" class="avatar-emoji" aria-hidden="true">{{ props.avatar }}</span>
      <span
        class="status-dot connection-dot"
        :class="props.isConnected ? 'status-online is-online' : 'status-reconnecting is-offline'"
        :title="statusLabel"
      />
    </div>

    <!-- Name & Details -->
    <div class="player-info">
      <div class="name-row">
        <span class="player-name" :title="displayName">{{ displayName }}</span>
        <span v-if="props.isSelf" class="self-tag">(You)</span>
        <span v-if="props.isHost" class="host-tag" title="Room Host">👑</span>
      </div>

      <div class="details-row">
        <span class="color-indicator" :class="props.color === 'w' ? 'color-white' : 'color-black'">
          <span class="color-icon">{{ props.color === 'w' ? '⚪' : '⚫' }}</span>
          <span class="color-text">{{ props.color === 'w' ? 'White' : 'Black' }}</span>
        </span>
        <span v-if="!props.isConnected" class="reconnecting-text">Reconnecting...</span>
      </div>
    </div>

    <!-- Active Turn Badge -->
    <span
      v-if="props.isCurrentTurn"
      data-testid="turn-badge-active"
      class="turn-badge--active"
      role="status"
      aria-live="polite"
    >
      {{ turnText }}
    </span>
  </div>
</template>

<style scoped>
.player-badge {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background-color: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
  box-sizing: border-box;
}

.player-badge.is-active-turn {
  border-color: var(--color-success);
  box-shadow: var(--glow-turn-active);
}

.avatar-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: var(--bg-app);
  border-radius: var(--radius-pill);
  border: 2px solid var(--border-medium);
  font-size: 1.4rem;
  user-select: none;
}

.status-dot {
  position: absolute;
  inset-block-end: -2px;
  inset-inline-end: -2px;
  width: 12px;
  height: 12px;
  border-radius: var(--radius-pill);
  border: 2px solid var(--bg-surface);
}

.status-online,
.is-online {
  background-color: var(--color-success);
}

.status-reconnecting,
.is-offline {
  background-color: var(--color-accent);
  animation: pulse-reconnect 1s infinite alternate;
}

@keyframes pulse-reconnect {
  from { opacity: 0.5; }
  to { opacity: 1; }
}

.player-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.player-name {
  font-family: var(--font-display);
  font-weight: var(--weight-bold);
  font-size: var(--text-base);
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.self-tag {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--color-primary-text, #ffffff);
  font-weight: var(--weight-bold);
}

[data-theme='dark'] .self-tag {
  color: var(--color-primary-text, #ffffff);
}

.host-tag {
  font-size: 0.9em;
}

.details-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.color-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--text-muted);
}

.reconnecting-text {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--color-accent-text, #92400e);
}

.turn-badge--active {
  background-color: var(--turn-active-bg);
  color: var(--turn-active-text);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  padding: var(--space-1-5) var(--space-3);
  border-radius: var(--radius-pill);
  animation: turn-bounce-glow 1.8s infinite ease-in-out;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin-inline-start: auto;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .player-badge {
    padding: 4px 8px;
    gap: 6px;
  }

  .avatar-container {
    width: 32px;
    height: 32px;
    font-size: 1.1rem;
  }

  .player-name {
    font-size: var(--text-sm);
    max-width: 95px;
  }

  .turn-badge--active {
    display: inline-flex;
    font-size: var(--text-xs);
    padding: 2px 6px;
  }
}
</style>
