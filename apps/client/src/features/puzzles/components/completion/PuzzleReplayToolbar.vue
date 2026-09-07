<script setup lang="ts">
interface Props {
  totalPlies: number;
  currentPlyIndex: number;
  currentStepSan: string;
  currentStepExplanationText: string;
}

defineProps<Props>();

const emit = defineEmits<{
  'step-start': [];
  'step-prev': [];
  'step-next': [];
  'step-end': [];
}>();
</script>

<template>
  <div v-if="totalPlies > 0" class="replay-container">
    <!-- Interactive Move Replay Controller -->
    <div
      class="move-replay-controller"
      data-testid="move-replay-controller"
    >
      <div class="replay-step-info">
        <span class="step-counter-tag" data-testid="replay-step-counter">
          {{ currentPlyIndex === 0 ? 'Initial Position' : `Step ${currentPlyIndex} of ${totalPlies}` }}
        </span>
        <span v-if="currentStepSan" class="step-san-badge" data-testid="replay-step-san">
          {{ currentStepSan }}
        </span>
      </div>

      <div class="replay-btn-group">
        <button
          type="button"
          class="replay-control-btn"
          data-testid="replay-start-btn"
          aria-label="First Move"
          :disabled="currentPlyIndex <= 0"
          @click="emit('step-start')"
        >
          ⏮
        </button>
        <button
          type="button"
          class="replay-control-btn"
          data-testid="replay-prev-btn"
          aria-label="Previous Move"
          :disabled="currentPlyIndex <= 0"
          @click="emit('step-prev')"
        >
          ◀
        </button>
        <button
          type="button"
          class="replay-control-btn"
          data-testid="replay-next-btn"
          aria-label="Next Move"
          :disabled="currentPlyIndex >= totalPlies"
          @click="emit('step-next')"
        >
          ▶
        </button>
        <button
          type="button"
          class="replay-control-btn"
          data-testid="replay-end-btn"
          aria-label="Final Move"
          :disabled="currentPlyIndex >= totalPlies"
          @click="emit('step-end')"
        >
          ⏭
        </button>
      </div>
    </div>

    <!-- Step Explanation in Replay UI -->
    <div
      v-if="currentStepExplanationText"
      class="replay-step-explanation-box"
      data-testid="replay-step-explanation"
    >
      <span class="explanation-icon">💡</span>
      <p class="explanation-text">{{ currentStepExplanationText }}</p>
    </div>
  </div>
</template>

<style scoped>
.replay-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  width: 100%;
}

.move-replay-controller {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  width: 100%;
  background: var(--bg-surface, #ffffff);
  border: 1.5px solid var(--border-medium, #cbd5e1);
  border-radius: var(--radius-pill, 9999px);
  padding: var(--space-1-5, 6px) var(--space-3, 12px);
  box-sizing: border-box;
}

.replay-step-info {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.step-counter-tag {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  color: var(--text-muted, #64748b);
}

.step-san-badge {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-sm, 13px);
  font-weight: 800;
  color: var(--color-primary, #6c5ce7);
  padding: 2px 8px;
  background: var(--color-primary-subtle, rgba(108, 92, 231, 0.12));
  border-radius: var(--radius-sm, 6px);
}

.replay-btn-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.replay-control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-pill, 9999px);
  border: 1px solid var(--border-subtle, #e2e8f0);
  background: var(--bg-surface-raised, #f8fafc);
  color: var(--text-main, #0f172a);
  cursor: pointer;
  font-size: 0.9rem;
  transition: transform var(--duration-fast, 140ms) ease,
              background-color var(--duration-fast, 140ms) ease,
              border-color var(--duration-fast, 140ms) ease,
              color var(--duration-fast, 140ms) ease;
}

.replay-control-btn:hover:not(:disabled) {
  background: var(--color-primary-subtle, rgba(108, 92, 231, 0.12));
  border-color: var(--color-primary, #6c5ce7);
  color: var(--color-primary, #6c5ce7);
  transform: scale(1.08);
}

.replay-control-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.replay-step-explanation-box {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2, 8px);
  width: 100%;
  background: var(--bg-surface-raised, #f8fafc);
  border: 1.5px solid var(--color-primary-subtle, rgba(108, 92, 231, 0.25));
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  box-sizing: border-box;
  text-align: start;
}

.explanation-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.explanation-text {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-sm, 13px);
  font-weight: 600;
  color: var(--text-main, #0f172a);
  line-height: var(--leading-normal, 1.4);
  margin: 0;
}
</style>
