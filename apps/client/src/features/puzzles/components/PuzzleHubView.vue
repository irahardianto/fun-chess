<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PuzzleTheme, PuzzleProgressStore } from '@fun-chess/shared';
import BaseCard from '../../../components/base/BaseCard.vue';
import BaseButton from '../../../components/base/BaseButton.vue';
import AdaptiveLadderCard from './AdaptiveLadderCard.vue';
import ThemeDrillSelector from './ThemeDrillSelector.vue';
import { usePuzzleProgress } from '../composables/usePuzzleProgress';
import { calculateAccuracyPercent } from '../engine/star_calculator';
import { getRankTierForElo } from '../engine/adaptive_rating';

interface Props {
  customStore?: PuzzleProgressStore;
}

const props = withDefaults(defineProps<Props>(), {
  customStore: undefined,
});

const emit = defineEmits<{
  launchDrills: [theme?: PuzzleTheme];
  launchLadder: [];
  launchRush: [subMode?: 'puzzle_rush' | 'streak_survivor'];
}>();

const progressModule = usePuzzleProgress(props.customStore);
const activeTab = ref<'hub' | 'drills_browser'>('hub');

const currentElo = computed(() => progressModule.currentElo.value);
const rankTier = computed(() => getRankTierForElo(currentElo.value));
const totalStars = computed(() => progressModule.totalStarsEarned.value);
const totalSolved = computed(() => progressModule.totalSolvedCount.value);
const rushHighScore = computed(() => progressModule.rushHighScore.value);
const maxStreak = computed(() => progressModule.maxStreak.value);

const totalAttempted = computed(() => {
  return progressModule.progress.value?.ratingProfile.totalAttempted ?? 0;
});

const accuracyPercent = computed<number>(() => {
  return calculateAccuracyPercent(totalSolved.value, totalAttempted.value);
});

function handleThemeSelected(theme: PuzzleTheme) {
  emit('launchDrills', theme);
}
</script>

<template>
  <div class="puzzle-hub-view" data-testid="puzzle-hub-view">
    <!-- Header Banner -->
    <header class="hub-header">
      <div class="hub-title-row">
        <span class="hub-icon-hero" aria-hidden="true">🧩</span>
        <div>
          <h1 class="hub-title">Puzzle Hub</h1>
          <p class="hub-subtitle">Master chess tactics with fun drills, rating challenges, and speed rush!</p>
        </div>
      </div>

      <!-- Overall Global Stats Pill Bar -->
      <div class="global-stats-bar" data-testid="global-stats-bar">
        <div class="stat-item" data-testid="stat-stars">
          <span class="stat-icon">⭐</span>
          <div class="stat-meta">
            <span class="stat-value">{{ totalStars }} Stars</span>
            <span class="stat-label">Collected</span>
          </div>
        </div>

        <div class="stat-item" data-testid="stat-elo">
          <span class="stat-icon">{{ rankTier.icon }}</span>
          <div class="stat-meta">
            <span class="stat-value">{{ currentElo }} Elo</span>
            <span class="stat-label">{{ rankTier.name }}</span>
          </div>
        </div>

        <div class="stat-item" data-testid="stat-streak">
          <span class="stat-icon">🔥</span>
          <div class="stat-meta">
            <span class="stat-value">{{ maxStreak }} Best</span>
            <span class="stat-label">Solve Streak</span>
          </div>
        </div>

        <div class="stat-item" data-testid="stat-accuracy">
          <span class="stat-icon">🎯</span>
          <div class="stat-meta">
            <span class="stat-value">{{ accuracyPercent }}%</span>
            <span class="stat-label">Accuracy</span>
          </div>
        </div>
      </div>
    </header>

    <!-- 1. Drills Theme Browser Subview (when opened) -->
    <div v-if="activeTab === 'drills_browser'" class="drills-browser-section" data-testid="drills-browser-section">
      <div class="section-nav-header">
        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="back-to-hub-btn"
          @click="activeTab = 'hub'"
        >
          <template #icon-left>⬅️</template>
          Back to Hub
        </BaseButton>
        <h2 class="section-title">Select Tactical Superpower Drill</h2>
      </div>

      <ThemeDrillSelector
        :theme-mastery-map="progressModule.progress.value?.themeMastery"
        @select-theme="handleThemeSelected"
      />
    </div>

    <!-- 2. Main Hub 3-Mode Showcase Cards -->
    <div v-else class="mode-cards-grid" data-testid="mode-cards-grid">
      <!-- Mode Card 1: Themed Skill Drills -->
      <BaseCard
        variant="interactive"
        padding="md"
        class="mode-card drills-card"
        data-testid="mode-card-drills"
      >
        <div class="card-header-row">
          <div class="card-title-group">
            <span class="mode-icon">🎯</span>
            <div>
              <h2 class="card-title">Themed Skill Drills</h2>
              <p class="card-subtitle">Master superpowers: Forks, Pins, Windmills, and Checkmates!</p>
            </div>
          </div>
          <span class="stars-badge">⭐ {{ totalStars }} Stars</span>
        </div>

        <!-- Sample Theme Pills -->
        <div class="theme-tags-row">
          <span class="theme-tag">🍴 Royal Forks</span>
          <span class="theme-tag">📌 Sneaky Pins</span>
          <span class="theme-tag">🌪️ Windmills</span>
          <span class="theme-tag">💨 Smothered Mate</span>
          <span class="theme-tag">👑 Mate in 1</span>
        </div>

        <div class="card-footer-action">
          <BaseButton
            variant="primary"
            size="lg"
            class="drills-cta-btn"
            data-testid="drills-explore-btn"
            @click="activeTab = 'drills_browser'"
          >
            <template #icon-left>🚀</template>
            Enter Skill Drills
          </BaseButton>
        </div>
      </BaseCard>

      <!-- Mode Card 2: Adaptive Rating Ladder -->
      <AdaptiveLadderCard
        :elo="currentElo"
        :streak="progressModule.progress.value?.ratingProfile.bestStreak ?? 0"
        :total-solved="totalSolved"
        :target-rating="currentElo + 20"
        @play="emit('launchLadder')"
      />

      <!-- Mode Card 3: Puzzle Rush / Streak Survivor -->
      <BaseCard
        variant="interactive"
        padding="md"
        class="mode-card rush-card"
        data-testid="mode-card-rush"
      >
        <div class="card-header-row">
          <div class="card-title-group">
            <span class="mode-icon">🔥</span>
            <div>
              <h2 class="card-title">Puzzle Rush & Survivor</h2>
              <p class="card-subtitle">Fast-paced arcade puzzles! Build combo streaks and beat the clock!</p>
            </div>
          </div>
          <span class="rush-best-badge">Best: {{ rushHighScore }} 🔥</span>
        </div>

        <!-- Dual Sub-Mode Options -->
        <div class="sub-modes-row">
          <div class="sub-mode-tile">
            <div class="sub-mode-header">
              <span class="sub-icon">⏱️</span>
              <span class="sub-title">3-Minute Blitz</span>
            </div>
            <p class="sub-desc">Race against the clock! +5s bonus on every solve!</p>
            <BaseButton
              variant="primary"
              size="md"
              class="rush-btn"
              data-testid="start-rush-blitz-btn"
              @click="emit('launchRush', 'puzzle_rush')"
            >
              Start Blitz ⏱️
            </BaseButton>
          </div>

          <div class="sub-mode-tile">
            <div class="sub-mode-header">
              <span class="sub-icon">❤️</span>
              <span class="sub-title">3-Strike Survivor</span>
            </div>
            <p class="sub-desc">No time limit! Keep solving until 3 mistakes!</p>
            <BaseButton
              variant="success"
              size="md"
              class="survivor-btn"
              data-testid="start-rush-survivor-btn"
              @click="emit('launchRush', 'streak_survivor')"
            >
              Start Survivor ❤️
            </BaseButton>
          </div>
        </div>
      </BaseCard>
    </div>
  </div>
</template>

<style scoped>
.puzzle-hub-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 0;
  gap: var(--space-4, 16px);
  box-sizing: border-box;
}

.hub-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3, 12px);
  width: 100%;
}

.hub-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.hub-icon-hero {
  font-size: 2.8rem;
  line-height: 1;
  animation: float-bounce 2.5s infinite ease-in-out;
}

.hub-title {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-hero, 34px);
  font-weight: 800;
  color: var(--color-primary, #6c5ce7);
  margin: 0;
  line-height: 1.1;
}

.hub-subtitle {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-sm, 14px);
  color: var(--text-muted, #64748b);
  margin: 0;
}

/* Global Stats Bar */
.global-stats-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: var(--bg-surface, #ffffff);
  border: 2px solid var(--border-medium, #cbd5e1);
  border-radius: var(--radius-pill, 9999px);
  padding: var(--space-2, 8px) var(--space-4, 16px);
  width: 100%;
  max-width: 760px;
  box-shadow: var(--shadow-sm, 0 2px 6px rgba(15, 23, 42, 0.08));
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: var(--space-1-5, 6px);
}

.stat-icon {
  font-size: 1.4rem;
}

.stat-meta {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.stat-value {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 800;
  color: var(--text-main, #0f172a);
}

.stat-label {
  font-size: var(--text-xs);
  color: var(--text-muted, #64748b);
  font-weight: 600;
}

/* Section Header */
.section-nav-header {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  width: 100%;
}

.section-title {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-lg, 18px);
  font-weight: 800;
  color: var(--text-main, #0f172a);
  margin: 0;
}

.drills-browser-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  width: 100%;
}

/* Mode Cards Grid */
.mode-cards-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
  width: 100%;
}

.mode-card {
  border-radius: var(--radius-card, 22px);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.drills-card {
  background: linear-gradient(135deg, var(--bg-surface, #ffffff) 0%, var(--mode-drills-bg, hsl(244, 85%, 97%)) 100%);
  border: 2px solid var(--mode-drills-border, hsl(244, 70%, 82%));
}

.rush-card {
  background: linear-gradient(135deg, var(--bg-surface, #ffffff) 0%, var(--mode-rush-bg, hsl(24, 100%, 97%)) 100%);
  border: 2px solid var(--mode-rush-border, hsl(21, 85%, 80%));
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
}

.card-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.mode-icon {
  font-size: 2rem;
  line-height: 1;
}

.card-title {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-lg, 18px);
  font-weight: 800;
  color: var(--text-main, #0f172a);
  margin: 0;
}

.card-subtitle {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, #64748b);
  margin: 0;
}

.stars-badge,
.rush-best-badge {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 800;
  padding: 4px 12px;
  border-radius: var(--radius-pill, 9999px);
  background: var(--bg-surface, #ffffff);
  border: 1.5px solid var(--border-medium, #cbd5e1);
  color: var(--text-main, #0f172a);
  white-space: nowrap;
}

.theme-tags-row {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
  margin-top: var(--space-1, 4px);
  margin-bottom: var(--space-3, 12px);
}

.theme-tag {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  background: var(--bg-surface, #ffffff);
  border: 1.5px solid var(--mode-drills-border, hsl(244, 70%, 82%));
  border-radius: var(--radius-pill, 9999px);
  padding: 6px 12px;
  color: var(--mode-drills-primary, #4f46e5);
  transition: transform var(--duration-fast, 140ms) var(--ease-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275));
}

.theme-tag:hover {
  transform: translateY(-1px);
}

.card-footer-action {
  margin-top: auto;
  width: 100%;
}

.drills-cta-btn {
  width: 100%;
  background: var(--mode-drills-primary, #4f46e5) !important;
  box-shadow: var(--mode-drills-shadow, 0 5px 0 hsl(244, 70%, 41%), 0 8px 20px rgba(79, 70, 229, 0.35)) !important;
  color: #ffffff !important;
}

/* Sub-modes Row */
.sub-modes-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3, 12px);
}

@media (max-width: 600px) {
  .sub-modes-row {
    grid-template-columns: 1fr;
  }
}

.sub-mode-tile {
  background: var(--bg-surface, #ffffff);
  border: 2px solid var(--mode-rush-border, hsl(21, 85%, 80%));
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-3, 12px);
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  text-align: center;
}

.sub-mode-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.sub-icon {
  font-size: 1.4rem;
}

.sub-title {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 800;
  color: var(--text-main, #0f172a);
}

.sub-desc {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, #64748b);
  margin: 0;
}

.rush-btn {
  width: 100%;
  background: var(--mode-rush-primary, #ea580c) !important;
  color: #ffffff !important;
  box-shadow: 0 5px 0 var(--mode-rush-bevel, #9a3412), 0 8px 18px rgba(234, 88, 12, 0.4) !important;
}

.survivor-btn {
  width: 100%;
  background: var(--color-success, #22c55e) !important;
  box-shadow: 0 5px 0 var(--color-success-bevel, hsl(145, 68%, 34%)), 0 8px 15px rgba(34, 197, 94, 0.35) !important;
}
</style>
