<script setup lang="ts">
import { computed } from 'vue';
import type { TutorialStep } from '@fun-chess/shared';
import BaseButton from '../../../components/base/BaseButton.vue';

interface Props {
  step: TutorialStep;
  currentStepIndex: number;
  totalSteps: number;
  activeHint?: string | null;
  feedbackMessage?: string | null;
  isStepSuccess?: boolean;
  isShaking?: boolean;
  isWaitingForBot?: boolean;
  hintsUsed?: number;
}

const props = withDefaults(defineProps<Props>(), {
  activeHint: null,
  feedbackMessage: null,
  isStepSuccess: false,
  isShaking: false,
  isWaitingForBot: false,
  hintsUsed: 0,
});

const emit = defineEmits<{
  askHint: [];
  resetStep: [];
}>();

const stepProgressText = computed(() => {
  return `Step ${props.currentStepIndex + 1} of ${props.totalSteps}`;
});

function handleAskHint() {
  emit('askHint');
}

function handleResetStep() {
  emit('resetStep');
}
</script>

<template>
  <div
    class="scenario-guide-container"
    :class="{
      'is-shaking': props.isShaking,
      'is-success': props.isStepSuccess,
    }"
    role="region"
    aria-label="Scenario step instruction and guidance"
  >
    <!-- Step Header Bar: Pill, Objective & Action Controls -->
    <div class="guide-header-row">
      <div class="guide-meta-group">
        <span class="guide-step-pill">{{ stepProgressText }}</span>
        <span v-if="props.hintsUsed > 0" class="guide-hints-badge">
          💡 {{ props.hintsUsed }} {{ props.hintsUsed === 1 ? 'Hint Used' : 'Hints Used' }}
        </span>
      </div>

      <div class="guide-actions-group">
        <BaseButton
          size="sm"
          variant="ghost"
          aria-label="Reset current step"
          @click="handleResetStep"
        >
          <template #icon-left>🔄</template>
          Reset
        </BaseButton>

        <BaseButton
          size="sm"
          variant="accent"
          :disabled="props.isStepSuccess || props.isWaitingForBot"
          aria-label="Ask for hint"
          @click="handleAskHint"
        >
          <template #icon-left>💡</template>
          Hint
        </BaseButton>
      </div>
    </div>

    <!-- Main Instruction Goal -->
    <div class="guide-instruction-content">
      <div class="instruction-icon-wrapper" aria-hidden="true">
        <span v-if="props.isStepSuccess" class="icon-success">🎉</span>
        <span v-else-if="props.isWaitingForBot" class="icon-waiting">🤖</span>
        <span v-else class="icon-goal">🎯</span>
      </div>

      <div class="instruction-text-group">
        <h2 class="instruction-main-text">{{ props.step.instruction }}</h2>
        <p v-if="props.step.conceptExplanation" class="instruction-concept-text">
          <span class="concept-label">Why:</span> {{ props.step.conceptExplanation }}
        </p>
      </div>
    </div>

    <!-- Active Revealed Hint Bubble -->
    <Transition name="bubble-pop">
      <div v-if="props.activeHint" class="guide-hint-bubble" role="status">
        <div class="mascot-avatar-small" aria-hidden="true">🐶</div>
        <div class="bubble-content">
          <strong class="bubble-speaker">Peanut’s Hint:</strong>
          <p class="bubble-text">{{ props.activeHint }}</p>
        </div>
      </div>
    </Transition>

    <!-- Feedback / Success Message -->
    <Transition name="bubble-pop">
      <div
        v-if="props.feedbackMessage"
        class="guide-feedback-banner"
        :class="props.isStepSuccess ? 'is-positive' : 'is-warning'"
        role="alert"
      >
        <span class="feedback-icon">{{ props.isStepSuccess ? '✨' : '💡' }}</span>
        <span class="feedback-text">{{ props.feedbackMessage }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.scenario-guide-container {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background-color: var(--academy-step-bg);
  border: 2px solid var(--academy-step-border);
  border-radius: var(--radius-xl);
  padding: var(--space-4) var(--space-5);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--duration-fast) ease, background-color var(--duration-fast) ease;
  box-sizing: border-box;
}

.scenario-guide-container.is-shaking {
  animation: shake-soft 0.35s linear;
  border-color: var(--color-danger);
  background-color: var(--soft-error-bg);
}

.scenario-guide-container.is-success {
  border-color: var(--color-success);
  background-color: hsl(150, 75%, 96%);
}

[data-theme='dark'] .scenario-guide-container.is-success {
  background-color: hsl(150, 40%, 16%);
  border-color: hsl(150, 60%, 35%);
}

.guide-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.guide-meta-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.guide-step-pill {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-heavy);
  background-color: var(--academy-pill-bg);
  color: var(--academy-pill-text);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  letter-spacing: 0.5px;
}

.guide-hints-badge {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--academy-gold-bevel);
  background: var(--academy-gold-subtle);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}

.guide-actions-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.guide-instruction-content {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.instruction-icon-wrapper {
  font-size: 1.6rem;
  line-height: 1;
  padding-top: 2px;
}

.instruction-text-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex: 1;
}

.instruction-main-text {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--weight-bold);
  color: var(--academy-step-text);
  margin: 0;
  line-height: var(--leading-snug);
}

.instruction-concept-text {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin: 0;
  line-height: var(--leading-normal);
}

.concept-label {
  font-weight: var(--weight-bold);
  color: var(--color-primary);
}

/* HINT BUBBLE */
.guide-hint-bubble {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 24px);
  max-width: 540px;
  z-index: var(--z-overlay-dialogue, 20);
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  background: var(--hint-banner-glass, rgba(254, 249, 195, 0.94));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 2px solid var(--hint-banner-border, hsl(45, 95%, 55%));
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  color: var(--hint-banner-text, hsl(42, 90%, 22%));
  box-shadow: var(--glow-hint-banner, 0 0 20px 4px rgba(255, 193, 7, 0.38), var(--shadow-lg));
  box-sizing: border-box;
}

[data-theme='dark'] .guide-hint-bubble {
  background: var(--hint-banner-glass, rgba(40, 32, 20, 0.94));
  border-color: var(--hint-banner-border, hsl(45, 60%, 38%));
  color: var(--hint-banner-text, hsl(45, 85%, 90%));
}

.mascot-avatar-small {
  font-size: 1.5rem;
  line-height: 1;
}

.bubble-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bubble-speaker {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  color: var(--color-accent-bevel);
}

.bubble-text {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  margin: 0;
  line-height: var(--leading-normal);
}

/* FEEDBACK BANNER */
.guide-feedback-banner {
  position: absolute;
  bottom: -16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-overlay-guide, 15);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 18px;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  box-shadow: var(--shadow-md);
  white-space: nowrap;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  pointer-events: none;
}

.guide-feedback-banner.is-positive {
  background-color: var(--soft-success-glass, rgba(240, 253, 244, 0.94));
  color: var(--soft-success-text, hsl(145, 80%, 22%));
  border: 1.5px solid var(--soft-success-border, hsl(145, 68%, 60%));
}

.guide-feedback-banner.is-warning {
  background-color: var(--soft-error-glass, rgba(255, 241, 242, 0.94));
  color: var(--soft-error-text, hsl(350, 75%, 32%));
  border: 1.5px solid var(--soft-error-border, hsl(350, 80%, 75%));
}

[data-theme='dark'] .guide-feedback-banner.is-positive {
  background-color: var(--soft-success-glass, rgba(20, 45, 30, 0.94));
  color: var(--soft-success-text, hsl(145, 85%, 90%));
  border-color: var(--soft-success-border, hsl(145, 50%, 35%));
}

[data-theme='dark'] .guide-feedback-banner.is-warning {
  background-color: var(--soft-error-glass, rgba(45, 20, 25, 0.94));
  color: var(--soft-error-text, hsl(350, 85%, 90%));
  border-color: var(--soft-error-border, hsl(350, 50%, 35%));
}

/* ANIMATIONS */
@keyframes shake-soft {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-5px); }
  40%, 80% { transform: translateX(5px); }
}

.bubble-pop-enter-active {
  animation: bubble-pop 0.28s var(--ease-spring);
}

.bubble-pop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.bubble-pop-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.92) translateY(4px);
}

@keyframes bubble-pop {
  0% {
    transform: translateX(-50%) scale(0.85) translateY(8px);
    opacity: 0;
  }
  70% {
    transform: translateX(-50%) scale(1.04) translateY(-2px);
    opacity: 1;
  }
  100% {
    transform: translateX(-50%) scale(1) translateY(0);
    opacity: 1;
  }
}

/* RESPONSIVE */
@media (max-width: 480px) {
  .guide-feedback-banner {
    padding: 4px 14px;
    font-size: var(--text-xs);
  }

  .guide-hint-bubble {
    width: calc(100% - 16px);
    padding: var(--space-2) var(--space-3);
  }
}

@media (max-width: 320px) {
  .guide-feedback-banner {
    padding: 3px 10px;
    font-size: var(--text-xs);
  }

  .guide-hint-bubble {
    width: calc(100% - 12px);
    padding: var(--space-2) var(--space-2-5);
  }
}
</style>
