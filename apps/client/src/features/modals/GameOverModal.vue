<script setup lang="ts">
import { computed, watch } from 'vue';
import type { GameOverPayload } from '@fun-chess/shared';
import BaseModal from '../../components/base/BaseModal.vue';
import BaseButton from '../../components/base/BaseButton.vue';
import { useConfetti } from '../../composables/useConfetti';

interface Props {
  modelValue?: boolean;
  isOpen?: boolean;
  payload?: GameOverPayload | null;
  isWinner?: boolean;
  isDraw?: boolean;
  rematchRequested?: boolean;
  rematchPending?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  isOpen: undefined,
  payload: null,
  isWinner: false,
  isDraw: false,
  rematchRequested: false,
  rematchPending: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  rematch: [];
  lobby: [];
  returnToLobby: [];
  close: [];
}>();

const { celebrate } = useConfetti();

const titleEmoji = computed(() => {
  if (props.isWinner) return '🏆';
  if (props.isDraw) return '⚖️';
  return '🤝';
});

const bannerTitle = computed(() => {
  if (props.isWinner) return 'Victory! 🏆🎉';
  if (props.isDraw) return "It's a Draw! ⚖️";
  return 'Good Game! 🤝';
});

const reasonFormatted = computed(() => {
  if (!props.payload) return '';
  return props.payload.reason;
});

const durationFormatted = computed(() => {
  if (!props.payload) return '0s';
  const totalSecs = Math.round(props.payload.durationSeconds);
  return `${totalSecs}s`;
});

// Trigger confetti if winner
watch(
  () => [props.modelValue, props.isOpen, props.isWinner],
  () => {
    if ((props.modelValue || props.isOpen) && props.isWinner) {
      celebrate();
    }
  },
  { immediate: true }
);

function handleRematch() {
  emit('rematch');
}

function handleReturnToLobby() {
  emit('lobby');
  emit('returnToLobby');
  emit('update:modelValue', false);
}
</script>

<template>
  <BaseModal
    :model-value="props.modelValue || props.isOpen"
    title="Match Ended"
    size="md"
    @update:model-value="(val) => emit('update:modelValue', val)"
    @close="emit('close')"
  >
    <div class="game-over-content">
      <!-- Winner Banner -->
      <div class="banner-header">
        <span class="banner-emoji" aria-hidden="true">{{ titleEmoji }}</span>
        <h2 class="banner-headline" :class="{ 'is-victory': props.isWinner }">
          {{ bannerTitle }}
        </h2>
        <p
          v-if="props.payload"
          data-testid="game-over-message"
          class="banner-message"
        >
          {{ props.payload.message || `${props.payload.winnerName || 'Winner'} won by ${reasonFormatted}!` }}
        </p>
      </div>

      <!-- Match Statistics Table -->
      <div v-if="props.payload" class="stats-card">
        <div class="stat-item">
          <span class="stat-label">End Reason</span>
          <span class="stat-value">{{ reasonFormatted }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Total Moves</span>
          <span class="stat-value">{{ props.payload.totalMoves }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Match Duration</span>
          <span class="stat-value">{{ durationFormatted }}</span>
        </div>
      </div>

      <!-- Rematch Pending Notice -->
      <div v-if="props.rematchRequested" class="rematch-status-alert">
        <span>🔄 Rematch requested! Waiting for opponent to accept...</span>
      </div>

      <!-- Action Buttons -->
      <div class="game-over-actions">
        <BaseButton
          data-testid="request-rematch-btn"
          variant="primary"
          size="lg"
          full-width
          :disabled="props.rematchRequested"
          @click="handleRematch"
        >
          <template #icon-left><span>🔄</span></template>
          {{ props.rematchRequested ? 'Rematch Requested...' : 'Request Rematch' }}
        </BaseButton>

        <BaseButton
          data-testid="return-lobby-btn"
          variant="ghost"
          size="md"
          full-width
          @click="handleReturnToLobby"
        >
          <template #icon-left><span>🏠</span></template>
          Return to Lobby
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.game-over-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
  text-align: center;
}

.banner-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.banner-emoji {
  font-size: 3.5rem;
  line-height: 1;
  display: inline-block;
  user-select: none;
  animation: float-bounce 2.5s infinite ease-in-out;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.12));
}

.banner-headline {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  line-height: var(--leading-tight);
}

.banner-headline.is-victory {
  color: var(--color-accent-text);
  text-shadow: 0 2px 8px rgba(255, 179, 0, 0.4);
}

.banner-message {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--text-muted);
}

.stats-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  width: 100%;
  background-color: var(--bg-app);
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-sizing: border-box;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-faint);
}

.stat-value {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.rematch-status-alert {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--color-primary);
  background-color: var(--color-primary-subtle);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
}

.game-over-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}
</style>
