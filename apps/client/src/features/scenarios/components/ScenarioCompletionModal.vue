<script setup lang="ts">
import { watch, computed, ref, onBeforeUnmount } from 'vue';
import type { ChessScenario, StarRating } from '@fun-chess/shared';
import BaseModal from '../../../components/base/BaseModal.vue';
import BaseButton from '../../../components/base/BaseButton.vue';
import { useConfetti } from '../../../composables/useConfetti';

interface Props {
  modelValue?: boolean;
  isOpen?: boolean;
  scenario: ChessScenario;
  stars: StarRating;
  accuracy: number;
  hintsUsed: number;
  hasNextLesson?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: undefined,
  isOpen: undefined,
  hasNextLesson: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  nextLesson: [];
  retry: [];
  backToAcademy: [];
}>();

const { celebrateVictory } = useConfetti();
const activeStarCount = ref<number>(0);
const starTimeouts: ReturnType<typeof setTimeout>[] = [];

function clearStarTimeouts(): void {
  starTimeouts.forEach((t) => clearTimeout(t));
  starTimeouts.length = 0;
}

const isVisible = computed(() => {
  if (props.modelValue !== undefined) return props.modelValue;
  if (props.isOpen !== undefined) return props.isOpen;
  return false;
});

const praiseMessage = computed(() => {
  if (props.stars === 3) {
    return 'Flawless victory! You solved the puzzle cleanly with zero hints!';
  } else if (props.stars === 2) {
    return 'Great job! You mastered the concept with sharp chess instincts!';
  } else {
    return 'Lesson completed! Keep practicing to earn all 3 stars!';
  }
});

watch(
  isVisible,
  (visible) => {
    if (visible) {
      // Fire celebration confetti
      celebrateVictory();

      // Cascade star animation
      activeStarCount.value = 0;
      clearStarTimeouts();

      starTimeouts.push(
        setTimeout(() => {
          if (props.stars >= 1) activeStarCount.value = 1;
        }, 200)
      );
      starTimeouts.push(
        setTimeout(() => {
          if (props.stars >= 2) activeStarCount.value = 2;
        }, 400)
      );
      starTimeouts.push(
        setTimeout(() => {
          if (props.stars >= 3) activeStarCount.value = 3;
        }, 600)
      );
    } else {
      clearStarTimeouts();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearStarTimeouts();
});

function handleClose() {
  emit('update:modelValue', false);
  emit('backToAcademy');
}

function handleRetry() {
  emit('update:modelValue', false);
  emit('retry');
}

function handleNextLesson() {
  emit('update:modelValue', false);
  emit('nextLesson');
}

function handleBackToAcademy() {
  emit('update:modelValue', false);
  emit('backToAcademy');
}
</script>

<template>
  <BaseModal
    :model-value="isVisible"
    size="md"
    :title="'🎉 Lesson Complete! 🎉'"
    @update:model-value="emit('update:modelValue', $event)"
    @close="handleClose"
  >
    <div class="completion-modal-body">
      <!-- 3-Star Animated Cascade -->
      <div class="stars-celebration-container" role="img" :aria-label="`${props.stars} of 3 stars earned`">
        <div
          v-for="index in 3"
          :key="index"
          class="star-wrapper"
          :class="{
            'is-earned': index <= props.stars,
            'is-popped': index <= activeStarCount,
          }"
        >
          <span class="star-glyph">★</span>
        </div>
      </div>

      <div class="completion-stars-label">
        {{ props.stars }} / 3 Stars Earned!
      </div>

      <!-- Lesson Title & Praise -->
      <div class="completion-header-text">
        <h3 class="scenario-completed-title">{{ props.scenario.title }}</h3>
        <p class="scenario-praise-text">{{ praiseMessage }}</p>
      </div>

      <!-- Stats Grid -->
      <div class="completion-stats-grid">
        <div class="stat-card">
          <span class="stat-icon" aria-hidden="true">🎯</span>
          <span class="stat-value">{{ props.accuracy }}%</span>
          <span class="stat-label">Accuracy</span>
        </div>

        <div class="stat-card">
          <span class="stat-icon" aria-hidden="true">💡</span>
          <span class="stat-value">{{ props.hintsUsed }}</span>
          <span class="stat-label">Hints Used</span>
        </div>

        <div class="stat-card">
          <span class="stat-icon" aria-hidden="true">♟️</span>
          <span class="stat-value">{{ props.scenario.steps.length }}</span>
          <span class="stat-label">Steps Done</span>
        </div>
      </div>
    </div>

    <!-- Modal Footer Actions -->
    <template #footer>
      <div class="modal-footer-actions">
        <BaseButton variant="ghost" size="md" @click="handleBackToAcademy">
          <template #icon-left>🎓</template>
          Return to Academy
        </BaseButton>

        <BaseButton variant="ghost" size="md" @click="handleRetry">
          <template #icon-left>🔄</template>
          Try Again
        </BaseButton>

        <BaseButton
          v-if="props.hasNextLesson"
          variant="accent"
          size="md"
          @click="handleNextLesson"
        >
          <template #icon-right>➡️</template>
          Next Lesson
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
  gap: var(--space-4);
  padding: var(--space-2) 0;
}

/* STARS CELEBRATION */
.stars-celebration-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.star-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: var(--radius-pill);
  font-size: 2.8rem;
  color: var(--star-empty);
  transform: scale(0.8);
  opacity: 0.4;
  transition: opacity 0.3s ease, transform 0.3s ease, color 0.3s ease;
}

.star-wrapper.is-earned.is-popped {
  color: var(--star-filled);
  opacity: 1;
  animation: star-pop 0.42s var(--ease-out-back) forwards;
}

.completion-stars-label {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--weight-bold);
  color: var(--academy-gold-bevel);
  margin-top: -8px;
}

.completion-header-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.scenario-completed-title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: var(--weight-heavy);
  color: var(--text-main);
  margin: 0;
}

.scenario-praise-text {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--text-muted);
  max-width: 420px;
  margin: 0;
  line-height: var(--leading-relaxed);
}

/* STATS GRID */
.completion-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  width: 100%;
  margin-top: var(--space-2);
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background-color: var(--bg-surface-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
}

.stat-icon {
  font-size: 1.3rem;
  line-height: 1;
}

.stat-value {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--text-main);
}

.stat-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.modal-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space-2);
  width: 100%;
}

@keyframes star-pop {
  0% {
    transform: scale(0) rotate(-30deg);
    opacity: 0;
  }
  65% {
    transform: scale(1.35) rotate(10deg);
    opacity: 1;
    filter: drop-shadow(0 0 12px var(--star-filled));
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
    filter: drop-shadow(0 0 6px var(--star-filled));
  }
}
</style>
