<script setup lang="ts">
interface Props {
  ratingDelta?: number | null;
  solveTimeSeconds?: number;
  hintsUsed?: number;
  mistakesCount?: number;
}

withDefaults(defineProps<Props>(), {
  ratingDelta: null,
  solveTimeSeconds: 0,
  hintsUsed: 0,
  mistakesCount: 0,
});
</script>

<template>
  <div class="metrics-grid">
    <div v-if="ratingDelta !== null && ratingDelta !== undefined" class="metric-chip">
      <span class="metric-icon">📈</span>
      <div class="metric-content">
        <span class="metric-val text-success">+{{ ratingDelta }} Elo Points</span>
        <span class="metric-lbl">Kid Elo</span>
      </div>
    </div>

    <div class="metric-chip">
      <span class="metric-icon">⏱️</span>
      <div class="metric-content">
        <span class="metric-val">{{ solveTimeSeconds }}s</span>
        <span class="metric-lbl">Solve Time</span>
      </div>
    </div>

    <div class="metric-chip">
      <span class="metric-icon">💡</span>
      <div class="metric-content">
        <span class="metric-val">{{ hintsUsed }}</span>
        <span class="metric-lbl">Hints</span>
      </div>
    </div>

    <div class="metric-chip">
      <span class="metric-icon">🎯</span>
      <div class="metric-content">
        <span class="metric-val">{{ mistakesCount === 0 ? '100%' : 'Clean' }}</span>
        <span class="metric-lbl">Accuracy</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2, 8px);
  width: 100%;
  margin-top: var(--space-1, 4px);
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
  text-align: start;
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
  font-variant-numeric: tabular-nums;
}

.text-success {
  color: var(--color-success-text, #166534);
}

.metric-lbl {
  font-size: var(--text-xs);
  color: var(--text-muted, #64748b);
  font-weight: 600;
}
</style>
