<script setup lang="ts">
import { computed } from 'vue';
import BaseCard from '../../../components/base/BaseCard.vue';
import BaseButton from '../../../components/base/BaseButton.vue';
import { getRankTierForElo, getRankProgress } from '../engine/adaptive_rating';

interface Props {
  elo?: number;
  streak?: number;
  bestStreak?: number;
  totalSolved?: number;
  targetRating?: number;
  isLocked?: boolean;
  requiredStarsToUnlock?: number;
  userStars?: number;
}

const props = withDefaults(defineProps<Props>(), {
  elo: 800,
  streak: 0,
  bestStreak: 0,
  totalSolved: 0,
  targetRating: 800,
  isLocked: false,
  requiredStarsToUnlock: 0,
  userStars: 0,
});

const emit = defineEmits<{
  (e: 'play'): void;
}>();

const rankTier = computed(() => getRankTierForElo(props.elo));
const tierProgress = computed(() => getRankProgress(props.elo));
const progressPercent = computed<number>(() => tierProgress.value.percent);
</script>

<template>
  <BaseCard
    variant="interactive"
    padding="md"
    class="adaptive-ladder-card"
    :class="{ 'is-locked': props.isLocked }"
    data-testid="adaptive-ladder-card"
  >
    <!-- Lock Overlay if locked -->
    <div v-if="props.isLocked" class="lock-overlay" data-testid="ladder-locked-overlay">
      <div class="lock-badge">
        <span>🔒 Unlocks at {{ props.requiredStarsToUnlock }} Stars ⭐</span>
      </div>
      <span class="lock-subtext">You have {{ props.userStars }} / {{ props.requiredStarsToUnlock }} Stars</span>
    </div>

    <!-- Header / Title -->
    <div class="card-top-row">
      <div class="title-group">
        <div class="mode-icon-badge" aria-hidden="true">📈</div>
        <div>
          <h2 class="mode-card-title">Adaptive Rating Ladder</h2>
          <p class="mode-card-subtitle">Climb from Pawn Novice to Queen Champion!</p>
        </div>
      </div>

      <!-- Live Elo Pill -->
      <div class="live-elo-pill" data-testid="live-elo-pill">
        <span class="elo-icon">{{ rankTier.icon }}</span>
        <span class="elo-number">{{ props.elo }}</span>
        <span class="elo-unit">Elo</span>
      </div>
    </div>

    <!-- Rank Tier Showcase & Progress Bar -->
    <div class="rank-tier-box">
      <div class="tier-name-row">
        <span class="tier-label">Current Rank:</span>
        <span class="tier-badge-pill" data-testid="rank-tier-badge">
          {{ rankTier.icon }} {{ rankTier.name }}
        </span>
      </div>

      <div class="tier-progress-track" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
        <div class="tier-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
      </div>

      <div class="tier-meta-row">
        <span v-if="tierProgress.nextTier" class="tier-next-goal">
          Next: {{ tierProgress.nextTier.name }} ({{ tierProgress.nextTier.minElo }} Elo)
        </span>
        <span v-else class="tier-next-goal">
          Max Rank Achieved! 👑
        </span>
        <span class="tier-percent-text">{{ progressPercent }}%</span>
      </div>
    </div>

    <!-- Stats & Target Challenge Row -->
    <div class="ladder-stats-row">
      <div class="stat-mini-pill">
        <span class="stat-icon">🔥</span>
        <span class="stat-val">{{ props.streak >= 0 ? `${props.streak} Win Streak` : '0 Streak' }}</span>
      </div>

      <div class="stat-mini-pill">
        <span class="stat-icon">🎯</span>
        <span class="stat-val">Target ~{{ props.targetRating }} Elo</span>
      </div>

      <div class="stat-mini-pill">
        <span class="stat-icon">🧩</span>
        <span class="stat-val">{{ props.totalSolved }} Solved</span>
      </div>
    </div>

    <!-- CTA Button -->
    <div class="card-action-footer">
      <BaseButton
        variant="primary"
        size="lg"
        class="ladder-cta-btn"
        data-testid="ladder-play-btn"
        :disabled="props.isLocked"
        @click="emit('play')"
      >
        <template #icon-left>⚔️</template>
        Play Next Challenge
      </BaseButton>
    </div>
  </BaseCard>
</template>

<style scoped>
.adaptive-ladder-card {
  position: relative;
  background: linear-gradient(135deg, var(--bg-surface, #ffffff) 0%, var(--mode-ladder-bg, hsl(271, 85%, 97%)) 100%);
  border: 2px solid var(--mode-ladder-border, hsl(271, 70%, 82%));
  border-radius: var(--radius-card, 22px);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  transition: transform var(--duration-fast, 140ms) var(--ease-spring);
}

.adaptive-ladder-card:hover:not(.is-locked) {
  transform: translateY(-3px);
  box-shadow: var(--mode-ladder-shadow, 0 8px 20px rgba(147, 51, 234, 0.25));
}

.card-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
}

.title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.mode-icon-badge {
  font-size: 2rem;
  line-height: 1;
}

.mode-card-title {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-lg, 18px);
  font-weight: 800;
  color: var(--text-main, #0f172a);
  margin: 0;
}

.mode-card-subtitle {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, #64748b);
  margin: 0;
}

.live-elo-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-surface, #ffffff);
  border: 2px solid var(--mode-ladder-primary, #9333ea);
  border-radius: var(--radius-pill, 9999px);
  padding: 4px 12px;
  box-shadow: var(--shadow-sm, 0 2px 6px rgba(15, 23, 42, 0.08));
}

.elo-icon {
  font-size: 1.2rem;
}

.elo-number {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-base, 16px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--mode-ladder-primary, #9333ea);
}

.elo-unit {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--text-muted, #64748b);
}

/* Rank Tier Box */
.rank-tier-box {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-3, 12px);
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.tier-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tier-label {
  font-size: var(--text-xs);
  font-weight: 800;
  color: var(--text-muted, #64748b);
  letter-spacing: 0.04em;
}

.tier-badge-pill {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 800;
  color: var(--mode-ladder-primary, #9333ea);
  background: var(--mode-ladder-bg, hsl(271, 85%, 95%));
  padding: 3px 10px;
  border-radius: var(--radius-pill, 9999px);
}

.tier-progress-track {
  width: 100%;
  height: 10px;
  background: var(--bg-surface-raised, #e2e8f0);
  border-radius: var(--radius-pill, 9999px);
  overflow: hidden;
}

.tier-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #9333ea, #c084fc);
  border-radius: inherit;
  transition: width 400ms var(--ease-spring);
}

.tier-meta-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, #64748b);
  font-weight: 600;
}

.ladder-stats-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}

.stat-mini-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: var(--radius-pill, 9999px);
  padding: 3px 10px;
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  color: var(--text-main, #0f172a);
}

.card-action-footer {
  width: 100%;
  margin-top: var(--space-1, 4px);
}

.ladder-cta-btn {
  width: 100%;
  background: var(--mode-ladder-primary, #9333ea) !important;
  color: var(--text-on-primary, #ffffff) !important;
  box-shadow: 0 5px 0 var(--mode-ladder-bevel, #6b21a8), 0 8px 18px rgba(147, 51, 234, 0.35) !important;
}

/* Locked Overlay */
.is-locked {
  filter: grayscale(0.65) opacity(0.85);
  pointer-events: none;
}

.lock-overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
  border-radius: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2, 8px);
  z-index: 10;
}

.lock-badge {
  background: var(--bg-surface, #ffffff);
  color: var(--text-main, #0f172a);
  border: 2px solid var(--academy-gold, #ffb300);
  border-radius: var(--radius-pill, 9999px);
  padding: 6px 16px;
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 700;
  box-shadow: var(--shadow-md, 0 6px 16px rgba(0, 0, 0, 0.2));
}

.lock-subtext {
  font-size: var(--text-xs, 12px);
  color: var(--text-on-primary, #ffffff);
  font-weight: 600;
}
</style>
