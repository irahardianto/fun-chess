<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  currentRating: number;
  streak: number;
  bestStreak?: number;
  targetRating?: number;
}

const props = withDefaults(defineProps<Props>(), {
  bestStreak: 0,
  targetRating: 800,
});

const tierInfo = computed(() => {
  if (props.currentRating >= 1600) return { name: 'Queen Champion', icon: '👑', color: '#ffb300' };
  if (props.currentRating >= 1400) return { name: 'Rook Master', icon: '🏰', color: '#ea580c' };
  if (props.currentRating >= 1200) return { name: 'Bishop Tactician', icon: '♗', color: '#8b5cf6' };
  if (props.currentRating >= 1000) return { name: 'Knight Scout', icon: '♘', color: '#0ea5e9' };
  return { name: 'Pawn Novice', icon: '♙', color: '#22c55e' };
});
</script>

<template>
  <div class="rating-climb-hud" data-testid="rating-climb-hud">
    <!-- Rank Tier & Icon -->
    <div class="tier-pill" :style="{ borderColor: tierInfo.color }">
      <span class="tier-icon">{{ tierInfo.icon }}</span>
      <span class="tier-name">{{ tierInfo.name }}</span>
    </div>

    <!-- Elo Rating Live Counter -->
    <div class="rating-counter" data-testid="rating-display">
      <span class="rating-label">Kid Elo:</span>
      <strong class="rating-value">{{ props.currentRating }}</strong>
    </div>

    <!-- Streak Indicator -->
    <div
      class="streak-pill"
      :class="{ 'is-hot': props.streak >= 3, 'is-cold': props.streak < 0 }"
      data-testid="streak-display"
    >
      <span class="streak-icon">{{ props.streak >= 3 ? '🔥' : '⚡' }}</span>
      <span class="streak-text">
        {{ props.streak >= 0 ? `Streak: ${props.streak}` : `Recovery` }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.rating-climb-hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: var(--bg-surface);
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-sm);
  width: 100%;
  box-sizing: border-box;
}

.tier-pill {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  border: 2px solid;
}

.rating-counter {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  font-family: var(--font-mono);
}

.rating-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.rating-value {
  font-size: var(--text-xl);
  color: var(--color-primary);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.streak-pill {
  display: flex;
  align-items: center;
  gap: 2px;
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: rgba(15, 23, 42, 0.06);
}

.streak-pill.is-hot {
  background: linear-gradient(135deg, #ea580c, #f43f5e);
  color: #fff;
  animation: flame-flicker 0.65s infinite ease-in-out;
}
</style>
