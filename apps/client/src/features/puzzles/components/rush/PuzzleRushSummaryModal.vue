<script setup lang="ts">
import BaseButton from '../../../../components/base/BaseButton.vue';

interface Props {
  isOpen: boolean;
  title: string;
  score: number;
  bestStreak: number;
  comboMultiplier: number;
  rank: {
    name: string;
    icon: string;
  };
  isNewHighScore: boolean;
}

defineProps<Props>();

defineEmits<{
  (e: 'restart'): void;
  (e: 'exit'): void;
}>();
</script>

<template>
  <transition name="pop-fade">
    <div
      v-if="isOpen"
      class="rush-game-over-overlay"
      data-testid="rush-game-over"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
    >
      <div class="rush-game-over-card" data-testid="game-over-card">
        <h2 id="game-over-title" class="game-over-title">
          {{ title }}
        </h2>

        <div class="game-over-stats-grid">
          <div class="stat-pill" data-testid="final-score">
            <span class="stat-pill-icon" aria-hidden="true">🧩</span>
            <div class="stat-pill-info">
              <span class="stat-pill-label">Final Score</span>
              <span class="stat-pill-value">{{ score }} Solved</span>
            </div>
          </div>

          <div class="stat-pill" data-testid="highest-streak">
            <span class="stat-pill-icon" aria-hidden="true">🔥</span>
            <div class="stat-pill-info">
              <span class="stat-pill-label">Best Streak</span>
              <span class="stat-pill-value">{{ bestStreak }} (x{{ comboMultiplier }})</span>
            </div>
          </div>

          <div class="stat-pill rank-pill" data-testid="rank-achieved">
            <span class="stat-pill-icon" aria-hidden="true">{{ rank.icon }}</span>
            <div class="stat-pill-info">
              <span class="stat-pill-label">Rank Achieved</span>
              <span class="stat-pill-value">{{ rank.name }}</span>
            </div>
          </div>
        </div>

        <p v-if="isNewHighScore" class="new-high-score" data-testid="new-high-score-badge">
          🎉 New high score! 🏆
        </p>

        <div class="game-over-actions">
          <BaseButton
            variant="primary"
            size="lg"
            class="game-over-btn"
            data-testid="rush-restart-btn"
            @click="$emit('restart')"
          >
            <template #icon-left>🚀</template>
            Play Again
          </BaseButton>
          <BaseButton
            variant="ghost"
            size="lg"
            class="game-over-btn"
            data-testid="rush-game-over-exit-btn"
            @click="$emit('exit')"
          >
            Exit to Hub
          </BaseButton>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.rush-game-over-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  background: var(--bg-overlay, rgba(15, 23, 42, 0.7));
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-card, 22px);
  padding: var(--space-4, 16px);
  box-sizing: border-box;
}

.rush-game-over-card {
  background: var(--bg-surface, #ffffff);
  border: 3px solid var(--mode-rush-border, hsl(21, 85%, 80%));
  border-radius: var(--radius-card, 22px);
  padding: var(--space-6, 24px);
  text-align: center;
  box-shadow: var(--shadow-xl, 0 20px 48px rgba(15, 23, 42, 0.2));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4, 16px);
  max-width: 440px;
  width: 100%;
  animation: modal-pop-in 0.35s var(--ease-out-back);
}

.game-over-title {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-3xl, 26px);
  font-weight: 800;
  margin: 0;
  color: var(--mode-rush-primary, #ea580c);
}

.game-over-stats-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-2, 8px);
  width: 100%;
}

.stat-pill {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  background: var(--bg-surface-raised, #f8fafc);
  border: 1.5px solid var(--border-subtle, #e2e8f0);
  border-radius: var(--radius-md, 12px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  text-align: start;
}

.stat-pill-icon {
  font-size: 1.8rem;
  line-height: 1;
}

.stat-pill-info {
  display: flex;
  flex-direction: column;
}

.stat-pill-label {
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, #64748b);
  font-weight: 600;
}

.stat-pill-value {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-base, 16px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-main, #0f172a);
}

.rank-pill .stat-pill-value {
  color: var(--color-primary, #6c5ce7);
}

.new-high-score {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-base, 16px);
  font-weight: 800;
  color: var(--academy-gold, #ffc107);
  margin: 0;
  animation: float-bounce 2s infinite ease-in-out;
}

.game-over-actions {
  display: flex;
  gap: var(--space-3, 12px);
  width: 100%;
  justify-content: center;
}

.game-over-btn {
  flex: 1;
}

.pop-fade-enter-active {
  transition: opacity 0.25s ease;
}

.pop-fade-leave-active {
  transition: opacity 0.2s ease;
}

.pop-fade-enter-from,
.pop-fade-leave-to {
  opacity: 0;
}

@keyframes modal-pop-in {
  0% {
    transform: scale(0.85) translateY(15px);
    opacity: 0;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

@keyframes float-bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}
</style>
