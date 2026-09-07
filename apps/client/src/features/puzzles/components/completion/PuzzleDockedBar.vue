<script setup lang="ts">
import BaseButton from '../../../../components/base/BaseButton.vue';

interface Props {
  motifInfo: { icon: string; name: string };
  materialGainInfo: { text: string };
  currentStepSan: string;
  currentStepExplanationText: string;
  totalPlies: number;
  currentPlyIndex: number;
  hasNextPuzzle?: boolean;
}

withDefaults(defineProps<Props>(), {
  hasNextPuzzle: true,
});

const emit = defineEmits<{
  'step-start': [];
  'step-prev': [];
  'step-next': [];
  'step-end': [];
  expand: [];
  next: [];
}>();
</script>

<template>
  <div
    class="docked-inspect-bar"
    data-testid="docked-inspect-bar"
  >
    <div class="docked-left">
      <span class="docked-motif-title" data-testid="docked-motif-title">
        {{ motifInfo.icon }} {{ motifInfo.name }} ({{ materialGainInfo.text }})
      </span>
      <span
        v-if="currentStepExplanationText"
        class="docked-step-explanation"
        data-testid="docked-step-explanation"
      >
        {{ currentStepSan && currentStepSan !== 'Start' ? `${currentStepSan}: ` : '' }}{{ currentStepExplanationText }}
      </span>
    </div>

    <div v-if="totalPlies > 0" class="replay-btn-group">
      <button
        type="button"
        class="replay-control-btn"
        data-testid="docked-replay-start-btn"
        aria-label="First Move"
        :disabled="currentPlyIndex <= 0"
        @click="emit('step-start')"
      >
        ⏮
      </button>
      <button
        type="button"
        class="replay-control-btn"
        data-testid="docked-replay-prev-btn"
        aria-label="Previous Move"
        :disabled="currentPlyIndex <= 0"
        @click="emit('step-prev')"
      >
        ◀
      </button>
      <span class="step-counter-tag" data-testid="docked-step-counter">
        {{ currentPlyIndex === 0 ? `Start (0/${totalPlies})` : `${currentPlyIndex}/${totalPlies}` }}
      </span>
      <button
        type="button"
        class="replay-control-btn"
        data-testid="docked-replay-next-btn"
        aria-label="Next Move"
        :disabled="currentPlyIndex >= totalPlies"
        @click="emit('step-next')"
      >
        ▶
      </button>
      <button
        type="button"
        class="replay-control-btn"
        data-testid="docked-replay-end-btn"
        aria-label="Final Move"
        :disabled="currentPlyIndex >= totalPlies"
        @click="emit('step-end')"
      >
        ⏭
      </button>
    </div>

    <div class="docked-actions">
      <BaseButton
        variant="ghost"
        size="sm"
        data-testid="expand-modal-btn"
        @click="emit('expand')"
      >
        <template #icon-left>🔼</template>
        Coach Report
      </BaseButton>

      <BaseButton
        v-if="hasNextPuzzle"
        variant="primary"
        size="sm"
        data-testid="docked-next-btn"
        @click="emit('next')"
      >
        <template #icon-left>🚀</template>
        Next
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.docked-inspect-bar {
  position: fixed;
  bottom: max(20px, calc(16px + env(safe-area-inset-bottom, 0px)));
  inset-inline-start: 50%;
  transform: translateX(-50%);
  z-index: var(--z-minimized-dock, 35);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  padding: var(--space-2, 8px) var(--space-4, 16px);
  background: var(--bg-surface-glass, rgba(255, 255, 255, 0.94));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 2px solid var(--color-primary, #6c5ce7);
  border-radius: var(--radius-pill, 9999px);
  box-shadow: 0 10px 30px rgba(108, 92, 231, 0.35);
  animation: dock-slide-up 320ms var(--ease-spring);
  max-width: 95vw;
  box-sizing: border-box;
}

.docked-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  max-width: 320px;
}

.docked-motif-title {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 800;
  color: var(--text-main, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.docked-step-explanation {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 600;
  color: var(--color-primary, #6c5ce7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
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

.step-counter-tag {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  color: var(--text-muted, #64748b);
}

.docked-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

@keyframes dock-slide-up {
  0% { transform: translate(-50%, 30px) scale(0.9); opacity: 0; }
  100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
}
</style>
