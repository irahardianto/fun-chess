<script setup lang="ts">
import { computed, watch } from 'vue';
import type { StarRating, Puzzle, PuzzleAttemptResult } from '@fun-chess/shared';
import BaseModal from '../../../components/base/BaseModal.vue';
import BaseButton from '../../../components/base/BaseButton.vue';
import { useConfetti } from '../../../composables/useConfetti';

interface Props {
  modelValue?: boolean;
  puzzle?: Puzzle | null;
  stars?: StarRating;
  result?: PuzzleAttemptResult;
  solveTimeSeconds?: number;
  hintsUsed?: number;
  mistakesCount?: number;
  ratingDelta?: number | null;
  hasNextPuzzle?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  puzzle: null,
  stars: 3,
  result: 'solved_first_try',
  solveTimeSeconds: 0,
  hintsUsed: 0,
  mistakesCount: 0,
  ratingDelta: null,
  hasNextPuzzle: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  next: [];
  nextPuzzle: [];
  replay: [];
  retry: [];
  backToHub: [];
}>();

const { celebrate } = useConfetti();

const praiseHeading = computed(() => {
  if (props.stars === 3) return 'Flawless Masterpiece! 🌟';
  if (props.stars === 2) return 'Super Tactical Solve! 🎯';
  return 'Puzzle Completed! 👏';
});

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      celebrate();
    }
  }
);

function handleNext() {
  emit('next');
  emit('nextPuzzle');
}

function handleReplay() {
  emit('replay');
  emit('retry');
}
</script>

<template>
  <BaseModal
    :model-value="props.modelValue"
    size="md"
    title="🎉 PUZZLE CRUSHED! 🎉"
    data-testid="puzzle-completion-modal"
    @close="emit('update:modelValue', false)"
  >
    <div class="completion-modal-body">
      <!-- 3-Star Celebration Banner -->
      <div class="stars-cluster" aria-label="Stars Earned">
        <span
          class="star-item"
          :class="{ 'is-earned': props.stars >= 1, 'is-filled': props.stars >= 1 }"
          style="animation-delay: 100ms"
        >
          ⭐
        </span>
        <span
          class="star-item star-center"
          :class="{ 'is-earned': props.stars >= 2, 'is-filled': props.stars >= 2 }"
          style="animation-delay: 260ms"
        >
          ⭐
        </span>
        <span
          class="star-item"
          :class="{ 'is-earned': props.stars >= 3, 'is-filled': props.stars >= 3 }"
          style="animation-delay: 420ms"
        >
          ⭐
        </span>
      </div>

      <div class="star-rating-summary">
        ({{ props.stars }} / 3 Stars Earned!)
      </div>

      <!-- Puzzle Title & Coaching Praise -->
      <div class="praise-section">
        <h3 class="puzzle-praise-heading">{{ praiseHeading }}</h3>
        <h4 v-if="props.puzzle" class="puzzle-solved-title">
          {{ props.puzzle.title }}
        </h4>
        <p class="coach-praise-text">
          Outstanding vision! You calculated the winning tactical line perfectly! 🏆
        </p>
      </div>

      <!-- Solve Metrics Pill Grid -->
      <div class="metrics-grid">
        <div v-if="props.ratingDelta !== null && props.ratingDelta !== undefined" class="metric-chip">
          <span class="metric-icon">📈</span>
          <div class="metric-content">
            <span class="metric-val text-success">+{{ props.ratingDelta }} Elo Points</span>
            <span class="metric-lbl">Kid Elo</span>
          </div>
        </div>

        <div class="metric-chip">
          <span class="metric-icon">⏱️</span>
          <div class="metric-content">
            <span class="metric-val">{{ props.solveTimeSeconds }}s</span>
            <span class="metric-lbl">Solve Time</span>
          </div>
        </div>

        <div class="metric-chip">
          <span class="metric-icon">💡</span>
          <div class="metric-content">
            <span class="metric-val">{{ props.hintsUsed }}</span>
            <span class="metric-lbl">Hints</span>
          </div>
        </div>

        <div class="metric-chip">
          <span class="metric-icon">🎯</span>
          <div class="metric-content">
            <span class="metric-val">{{ props.mistakesCount === 0 ? '100%' : 'Clean' }}</span>
            <span class="metric-lbl">Accuracy</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="completion-footer-buttons">
        <BaseButton
          variant="ghost"
          size="md"
          data-testid="puzzle-retry-btn"
          @click="handleReplay"
        >
          <template #icon-left>🔄</template>
          Replay
        </BaseButton>

        <BaseButton
          v-if="props.hasNextPuzzle"
          variant="primary"
          size="md"
          data-testid="puzzle-next-btn"
          @click="handleNext"
        >
          <template #icon-left>🚀</template>
          Next Puzzle
        </BaseButton>

        <BaseButton
          v-else
          variant="success"
          size="md"
          data-testid="puzzle-hub-btn"
          @click="emit('backToHub')"
        >
          <template #icon-left>🧩</template>
          Back to Hub
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.completion-modal-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3, 12px);
  padding: var(--space-2, 8px) 0;
}

.stars-cluster {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-1, 4px);
}

.star-item {
  font-size: 2.5rem;
  line-height: 1;
  opacity: 0.25;
  filter: grayscale(1);
  transform: scale(0.9);
  transition: all var(--duration-normal, 240ms) var(--ease-spring);
}

.star-item.is-earned,
.star-item.is-filled {
  opacity: 1;
  filter: drop-shadow(0 0 10px var(--star-filled, #ffcc00));
  transform: scale(1);
  animation: star-pop 450ms var(--ease-spring) backwards;
}

.star-center.is-earned,
.star-center.is-filled {
  font-size: 3.2rem;
  transform: scale(1.15) translateY(-4px);
}

.star-rating-summary {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 700;
  color: var(--academy-gold, #ffb300);
}

.praise-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
}

.puzzle-praise-heading {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-lg, 18px);
  font-weight: 800;
  color: var(--color-primary, #6c5ce7);
  margin: 0;
}

.puzzle-solved-title {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-base, 16px);
  font-weight: 700;
  color: var(--text-main, #0f172a);
  margin: 0;
}

.coach-praise-text {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-sm, 14px);
  color: var(--text-muted, #64748b);
  margin: 0;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2, 8px);
  width: 100%;
  margin-top: var(--space-2, 8px);
}

@media (max-width: 520px) {
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.metric-chip {
  display: flex;
  align-items: center;
  gap: var(--space-1-5, 6px);
  background: var(--bg-surface-raised, #f8fafc);
  border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: var(--radius-md, 12px);
  padding: var(--space-2, 8px);
  text-align: left;
}

.metric-icon {
  font-size: 1.2rem;
  line-height: 1;
}

.metric-content {
  display: flex;
  flex-direction: column;
}

.metric-val {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-sm, 14px);
  font-weight: 800;
  color: var(--text-main, #0f172a);
}

.text-success {
  color: var(--color-success, #22c55e);
}

.metric-lbl {
  font-size: 0.7rem;
  color: var(--text-muted, #64748b);
  font-weight: 600;
}

.completion-footer-buttons {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  width: 100%;
}
</style>
