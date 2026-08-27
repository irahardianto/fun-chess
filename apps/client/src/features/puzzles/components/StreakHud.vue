<script setup lang="ts">
import { computed } from 'vue';
import { getComboMultiplier, getFlameStage, getFlameLabel } from '../engine/rush_engine';

interface Props {
  streak: number;
  multiplier?: number;
  label?: string;
  showCombo?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  streak: 0,
  multiplier: undefined,
  label: undefined,
  showCombo: true,
});

const effectiveMultiplier = computed(() => {
  return props.multiplier ?? getComboMultiplier(props.streak);
});

const flameStage = computed(() => {
  return getFlameStage(props.streak);
});

const displayText = computed(() => {
  if (props.label) return props.label;
  if (props.streak === 0) return '0 Solved';
  return getFlameLabel(props.streak);
});
</script>

<template>
  <div
    class="streak-hud-container"
    :class="[
      `stage--${flameStage}`,
      { 'is-active': props.streak > 0 },
      { 'is-inferno': flameStage === 'inferno' },
    ]"
    role="status"
    aria-live="polite"
    data-testid="streak-hud"
  >
    <span class="streak-icon" aria-hidden="true">
      {{ flameStage === 'inferno' ? '⚡🔥' : flameStage === 'blaze' ? '🔥🔥' : flameStage === 'spark' ? '🔥' : '⭐' }}
    </span>
    <span class="streak-label" data-testid="streak-label">{{ displayText }}</span>
    <span v-if="props.streak >= 2 && showCombo" class="multiplier-pill">
      x{{ effectiveMultiplier }}
    </span>
  </div>
</template>

<style scoped>
.streak-hud-container {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5, 6px);
  padding: 6px 14px;
  border-radius: var(--radius-pill, 9999px);
  background: var(--bg-surface, #ffffff);
  border: 2px solid var(--border-medium, #cbd5e1);
  box-shadow: var(--shadow-xs, 0 1px 3px rgba(15, 23, 42, 0.08));
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 700;
  color: var(--text-main, #0f172a);
  user-select: none;
  transition: background var(--duration-normal, 240ms) ease, border-color var(--duration-normal, 240ms) ease, box-shadow var(--duration-normal, 240ms) ease, transform var(--duration-normal, 240ms) var(--ease-spring);
}

.streak-icon {
  font-size: 1.2rem;
  line-height: 1;
}

.streak-label {
  white-space: nowrap;
}

.multiplier-pill {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: var(--text-xs);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  padding: 2px 6px;
  border-radius: var(--radius-pill, 9999px);
  background: rgba(255, 255, 255, 0.35);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.score-value,
.stat-value {
  font-variant-numeric: tabular-nums;
}

/* Stage: Spark (2x) */
.stage--spark {
  background: linear-gradient(135deg, var(--flame-spark-start, #ffb300), var(--flame-spark-end, #f58220));
  color: var(--text-on-accent, #1e1b4b);
  border-color: var(--flame-spark-end, #f58220);
  box-shadow: var(--flame-spark-glow, 0 0 12px rgba(255, 179, 0, 0.55));
  animation: flame-pop-in 320ms var(--ease-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275));
}

/* Stage: Blaze (3-4x) */
.stage--blaze {
  background: linear-gradient(135deg, var(--flame-blaze-start, #f97316), var(--flame-blaze-end, #ef4422));
  color: var(--text-on-primary, #ffffff);
  border-color: var(--flame-blaze-end, #ef4422);
  box-shadow: var(--flame-blaze-glow, 0 0 20px 4px rgba(249, 115, 22, 0.7));
  animation: flame-flicker 650ms infinite ease-in-out;
}

/* Stage: Inferno (5x+) */
.stage--inferno {
  background: linear-gradient(135deg, var(--flame-inferno-start, #f43f5e), var(--flame-inferno-mid, #ea580c), var(--flame-inferno-end, #ffc107));
  color: var(--text-on-primary, #ffffff);
  border-color: var(--text-on-primary, #ffffff);
  box-shadow: var(--flame-inferno-glow, 0 0 28px 8px rgba(244, 63, 94, 0.8), 0 0 10px rgba(255, 193, 7, 0.9));
  animation: flame-flicker 650ms infinite ease-in-out;
  transform: scale(1.05);
}
</style>
