<script setup lang="ts">
import { computed, watch, ref, nextTick, onMounted, type ComponentPublicInstance } from 'vue';
import type { GameOverPayload, MascotPersona } from '@fun-chess/shared';
import BaseModal from '../../../components/base/BaseModal.vue';
import BaseButton from '../../../components/base/BaseButton.vue';
import { useConfetti } from '../../../composables/useConfetti.js';

interface Props {
  modelValue?: boolean;
  isOpen?: boolean;
  payload?: GameOverPayload | null;
  mascot?: MascotPersona;
  isPlayerWinner?: boolean;
  isDraw?: boolean;
  takebackCount?: number;
  hintsCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  isOpen: undefined,
  payload: null,
  mascot: undefined,
  isPlayerWinner: false,
  isDraw: false,
  takebackCount: 0,
  hintsCount: 0,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  rematch: [];
  changeOpponent: [];
  lobby: [];
  close: [];
}>();

const { celebrate } = useConfetti();

const primaryCtaRef = ref<ComponentPublicInstance | HTMLButtonElement | null>(null);

function focusPrimaryCta() {
  nextTick(() => {
    const isVisible = props.modelValue || props.isOpen;
    if (isVisible && primaryCtaRef.value) {
      if ('focus' in primaryCtaRef.value && typeof primaryCtaRef.value.focus === 'function') {
        primaryCtaRef.value.focus();
      } else if ('$el' in primaryCtaRef.value && primaryCtaRef.value.$el && typeof (primaryCtaRef.value.$el as HTMLElement).focus === 'function') {
        (primaryCtaRef.value.$el as HTMLElement).focus();
      }
    }
  });
}

const bannerTitle = computed(() => {
  if (props.isPlayerWinner) return 'Victory! 🏆🎉';
  if (props.isDraw) return "It's a Draw! ⚖️";
  return 'Good Match! 👏';
});

const bannerSubtitle = computed(() => {
  if (props.isPlayerWinner) {
    return `Incredible! You outplayed ${props.mascot?.name || 'the AI'} with great tactics!`;
  }
  if (props.isDraw) {
    return `A balanced match against ${props.mascot?.name || 'the AI'}! Well defended!`;
  }
  return `Great effort against ${props.mascot?.name || 'the AI'}! Every game makes you stronger!`;
});

const durationFormatted = computed(() => {
  if (!props.payload) return '0s';
  const totalSecs = Math.round(props.payload.durationSeconds);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
});

const mascotPraiseDialogue = computed(() => {
  if (!props.mascot) return null;
  if (props.isPlayerWinner) {
    const lines = props.mascot.dialogues.player_win;
    return lines?.[0] ?? 'You played wonderfully! 🌟';
  }
  if (props.isDraw) {
    const lines = props.mascot.dialogues.draw;
    return lines?.[0] ?? 'A well-fought draw! 🤝';
  }
  const lines = props.mascot.dialogues.ai_win;
  return lines?.[0] ?? 'Good game! Want to try again? 🔄';
});

// Trigger confetti & auto-focus primary CTA
watch(
  () => [props.modelValue, props.isOpen, props.isPlayerWinner],
  () => {
    const isVisible = props.modelValue || props.isOpen;
    if (isVisible) {
      if (props.isPlayerWinner) {
        celebrate();
      }
      focusPrimaryCta();
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (props.modelValue || props.isOpen) {
    focusPrimaryCta();
  }
});

function handleRematch() {
  emit('rematch');
  emit('update:modelValue', false);
}

function handleChangeOpponent() {
  emit('changeOpponent');
  emit('update:modelValue', false);
}

function handleLobby() {
  emit('lobby');
  emit('update:modelValue', false);
}
</script>

<template>
  <BaseModal
    :model-value="props.modelValue || props.isOpen"
    title="Match Concluded"
    size="md"
    @update:model-value="(val) => emit('update:modelValue', val)"
    @close="emit('close')"
  >
    <div class="ai-game-over-content" role="region" aria-label="Game Over Summary">
      <!-- Mascot Avatar & Headline -->
      <div class="banner-header">
        <div class="mascot-avatar-circle" :style="{ borderColor: props.mascot?.themeColor }">
          <span class="mascot-avatar-emoji" aria-hidden="true">
            {{ props.isPlayerWinner ? '🏆' : (props.mascot?.avatar || '🐾') }}
          </span>
        </div>

        <h2 class="banner-headline" :class="{ 'is-victory': props.isPlayerWinner }">
          {{ bannerTitle }}
        </h2>
        <p class="banner-subtitle">{{ bannerSubtitle }}</p>
      </div>

      <!-- Mascot Encouragement Bubble -->
      <div v-if="mascotPraiseDialogue" class="mascot-praise-bubble">
        <span class="bubble-avatar-tag">{{ props.mascot?.avatar }} {{ props.mascot?.name }}:</span>
        <span class="bubble-speech-text">"{{ mascotPraiseDialogue }}"</span>
      </div>

      <!-- Match Stats Grid -->
      <div class="stats-card">
        <div class="stat-item">
          <span class="stat-label">Result</span>
          <span class="stat-value">
            {{ props.isPlayerWinner ? 'Won 🏆' : (props.isDraw ? 'Draw ⚖️' : 'Completed') }}
          </span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Total Moves</span>
          <span class="stat-value">{{ props.payload?.totalMoves || 0 }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Duration</span>
          <span class="stat-value">{{ durationFormatted }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Takebacks</span>
          <span class="stat-value">{{ props.takebackCount }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Hints Used</span>
          <span class="stat-value">{{ props.hintsCount }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Opponent</span>
          <span class="stat-value">{{ props.mascot?.name.split(' ')[0] || 'AI' }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="action-buttons-group">
        <BaseButton
          ref="primaryCtaRef"
          data-testid="ai-rematch-btn"
          variant="primary"
          size="lg"
          full-width
          @click="handleRematch"
        >
          <template #icon-left><span>🔄</span></template>
          Play Again with {{ props.mascot?.name.split(' ')[0] || 'AI' }}
        </BaseButton>

        <BaseButton
          data-testid="ai-change-opponent-btn"
          variant="ghost"
          size="md"
          full-width
          @click="handleChangeOpponent"
        >
          <template #icon-left><span>🐾</span></template>
          Choose Another Mascot
        </BaseButton>

        <BaseButton
          data-testid="ai-return-lobby-btn"
          variant="ghost"
          size="md"
          full-width
          @click="handleLobby"
        >
          <template #icon-left><span>🏠</span></template>
          Return to Main Menu
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.ai-game-over-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  text-align: center;
}

.banner-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.mascot-avatar-circle {
  width: 76px;
  height: 76px;
  border-radius: var(--radius-pill);
  background-color: var(--bg-app);
  border: 3.5px solid var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
  animation: float-bounce 2.5s infinite ease-in-out;
}

.mascot-avatar-emoji {
  font-size: 2.8rem;
  line-height: 1;
  user-select: none;
}

.banner-headline {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-heavy);
  color: var(--text-main);
  line-height: var(--leading-tight);
}

.banner-headline.is-victory {
  color: var(--color-accent-text);
  text-shadow: 0 2px 8px rgba(255, 179, 0, 0.4);
}

.banner-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--text-muted);
}

/* Mascot Praise Bubble */
.mascot-praise-bubble {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: var(--bg-surface-raised);
  border: 1.5px solid var(--border-medium);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  width: 100%;
  box-sizing: border-box;
}

.bubble-avatar-tag {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--color-primary);
}

.bubble-speech-text {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  line-height: var(--leading-snug);
}

/* Stats Card */
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

.action-buttons-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  margin-top: var(--space-1);
}
</style>
