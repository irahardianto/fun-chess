<script setup lang="ts">
import { computed } from 'vue';
import type { ChessScenario, ScenarioProgress } from '@fun-chess/shared';
import BaseCard from '../../../components/base/BaseCard.vue';
import BaseButton from '../../../components/base/BaseButton.vue';

interface Props {
  scenario: ChessScenario;
  progress?: ScenarioProgress | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  play: [scenario: ChessScenario];
}>();

const starsEarned = computed<number>(() => {
  return props.progress?.starsEarned ?? 0;
});

const isCompleted = computed<boolean>(() => starsEarned.value > 0);

const difficultyLabel = computed(() => {
  switch (props.scenario.difficulty) {
    case 'beginner':
      return 'Beginner';
    case 'intermediate':
      return 'Intermediate';
    case 'advanced':
      return 'Advanced';
    default:
      return 'Beginner';
  }
});

const difficultyClass = computed(() => `diff-pill--${props.scenario.difficulty}`);

function handlePlay() {
  emit('play', props.scenario);
}
</script>

<template>
  <BaseCard
    class="scenario-card"
    :class="{ 'is-completed': isCompleted }"
    variant="default"
    padding="md"
    role="article"
    :aria-label="`${scenario.title}, ${difficultyLabel} lesson, ${starsEarned} of 3 stars earned`"
  >
    <!-- Card Header: Icon, Title, Difficulty Pill -->
    <div class="scenario-card-header">
      <div class="scenario-icon-wrapper" aria-hidden="true">
        <span class="scenario-emoji">{{ scenario.icon }}</span>
      </div>

      <div class="scenario-title-group">
        <div class="scenario-meta-row">
          <span class="difficulty-pill" :class="difficultyClass">
            {{ difficultyLabel }}
          </span>
          <span class="scenario-steps-badge">
            {{ scenario.steps.length }} {{ scenario.steps.length === 1 ? 'Step' : 'Steps' }}
          </span>
        </div>
        <h3 class="scenario-title">{{ scenario.title }}</h3>
      </div>
    </div>

    <!-- Card Body: Subtitle & Description -->
    <p class="scenario-subtitle">{{ scenario.subtitle }}</p>

    <!-- Card Footer: Stars, Time, and Play Button -->
    <div class="scenario-card-footer">
      <!-- 3-Star Rating Indicator -->
      <div class="scenario-stars-row" role="img" :aria-label="`${starsEarned} out of 3 stars`">
        <span
          v-for="starIndex in 3"
          :key="starIndex"
          class="star-icon"
          :class="{ 'is-filled': starIndex <= starsEarned }"
          aria-hidden="true"
        >
          ★
        </span>
      </div>

      <div class="scenario-action-row">
        <span class="scenario-time-est">⏱️ {{ scenario.estimatedMinutes }}m</span>
        <BaseButton
          size="sm"
          :variant="isCompleted ? 'accent' : 'primary'"
          class="scenario-play-btn"
          @click="handlePlay"
        >
          <template #icon-right>➡️</template>
          {{ isCompleted ? 'Replay' : 'Play' }}
        </BaseButton>
      </div>
    </div>
  </BaseCard>
</template>

<style scoped>
.scenario-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-radius: var(--radius-card);
  border: 2px solid var(--border-subtle);
  background-color: var(--bg-surface);
  transition: transform var(--duration-fast) var(--ease-spring),
              box-shadow var(--duration-fast) ease,
              border-color var(--duration-fast) ease;
  position: relative;
  overflow: hidden;
}

.scenario-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary);
}

.scenario-card.is-completed {
  border-color: hsla(45, 100%, 51%, 0.35);
}

.scenario-card-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.scenario-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  min-width: 48px;
  border-radius: calc(var(--radius-card, 22px) - var(--space-3, 12px));
  background: var(--bg-surface-raised);
  border: 1px solid var(--border-subtle);
  font-size: 1.6rem;
  box-shadow: var(--shadow-xs);
}

.scenario-title-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex: 1;
}

.scenario-meta-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.difficulty-pill {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  line-height: 1.2;
  text-transform: capitalize;
}

.diff-pill--beginner {
  background-color: hsl(150, 75%, 92%);
  color: hsl(150, 80%, 25%);
}

.diff-pill--intermediate {
  background-color: hsl(45, 95%, 92%);
  color: hsl(45, 90%, 25%);
}

.diff-pill--advanced {
  background-color: hsl(265, 85%, 93%);
  color: hsl(265, 80%, 30%);
}

[data-theme='dark'] .diff-pill--beginner {
  background-color: hsl(150, 40%, 20%);
  color: hsl(150, 80%, 80%);
}

[data-theme='dark'] .diff-pill--intermediate {
  background-color: hsl(45, 50%, 20%);
  color: hsl(45, 90%, 80%);
}

[data-theme='dark'] .diff-pill--advanced {
  background-color: hsl(265, 45%, 22%);
  color: hsl(265, 85%, 85%);
}

.scenario-steps-badge {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.scenario-title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  line-height: var(--leading-snug);
  margin: 0;
}

.scenario-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-muted);
  line-height: var(--leading-normal);
  margin: var(--space-2) 0 var(--space-4) 0;
  flex: 1 1 auto;
}

.scenario-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-3);
  margin-top: auto;
  gap: var(--space-2);
}

.scenario-stars-row {
  display: flex;
  align-items: center;
  gap: 3px;
}

.star-icon {
  font-size: 1.25rem;
  color: var(--star-empty);
  transition: color var(--duration-fast) ease, transform var(--duration-fast) ease;
}

.star-icon.is-filled {
  color: var(--star-filled);
  filter: drop-shadow(0 0 4px rgba(255, 204, 0, 0.6));
}

.scenario-action-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.scenario-time-est {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

.scenario-play-btn {
  min-width: 80px;
}
</style>
