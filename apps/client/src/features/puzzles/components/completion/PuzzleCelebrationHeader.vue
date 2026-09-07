<script setup lang="ts">
import type { StarRating, Puzzle } from '@fun-chess/shared';

interface Props {
  stars?: StarRating;
  puzzle?: Puzzle | null;
  praiseHeading: string;
  motifInfo: { icon: string; name: string; class: string };
  materialGainInfo: { icon: string; text: string; class: string };
}

withDefaults(defineProps<Props>(), {
  stars: 3,
  puzzle: null,
});
</script>

<template>
  <div class="celebration-header">
    <!-- 3-Star Celebration Banner -->
    <div class="stars-cluster" aria-label="Stars Earned">
      <span
        class="star-item"
        :class="{ 'is-earned': stars >= 1, 'is-filled': stars >= 1 }"
        style="animation-delay: 100ms"
      >
        ⭐
      </span>
      <span
        class="star-item star-center"
        :class="{ 'is-earned': stars >= 2, 'is-filled': stars >= 2 }"
        style="animation-delay: 260ms"
      >
        ⭐
      </span>
      <span
        class="star-item"
        :class="{ 'is-earned': stars >= 3, 'is-filled': stars >= 3 }"
        style="animation-delay: 420ms"
      >
        ⭐
      </span>
    </div>

    <div class="star-rating-summary">
      ({{ stars }} / 3 Stars Earned!)
    </div>

    <!-- Tactical Outcome Badge & Material Gain Pill Row -->
    <div class="tactical-outcome-header" data-testid="tactical-outcome-header">
      <div class="motif-outcome-badge" :class="motifInfo.class" data-testid="motif-outcome-badge">
        <span class="motif-badge-icon">{{ motifInfo.icon }}</span>
        <span class="motif-badge-title">{{ motifInfo.name }}</span>
      </div>

      <div class="material-gain-pill" :class="materialGainInfo.class" data-testid="material-gain-pill">
        <span class="material-icon">{{ materialGainInfo.icon }}</span>
        <span class="material-text">{{ materialGainInfo.text }}</span>
      </div>
    </div>

    <!-- Puzzle Title & Praise Heading -->
    <div class="praise-section">
      <h3 class="puzzle-praise-heading">{{ praiseHeading }}</h3>
      <h4 v-if="puzzle" class="puzzle-solved-title">
        {{ puzzle.title }}
      </h4>
    </div>
  </div>
</template>

<style scoped>
.celebration-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3-5, 14px);
  width: 100%;
}

.stars-cluster {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-1, 4px);
}

.star-item {
  font-size: 2.6rem;
  line-height: 1;
  opacity: 0.25;
  filter: grayscale(1);
  transform: scale(0.9);
  transition: transform var(--duration-normal, 240ms) var(--ease-spring),
              opacity var(--duration-normal, 240ms) ease,
              filter var(--duration-normal, 240ms) ease;
}

.star-item.is-earned,
.star-item.is-filled {
  opacity: 1;
  filter: drop-shadow(0 0 12px var(--star-filled, #ffcc00));
  transform: scale(1);
  animation: star-pop 450ms var(--ease-spring) backwards;
}

.star-center.is-earned,
.star-center.is-filled {
  font-size: 3.4rem;
  transform: scale(1.15) translateY(-4px);
}

.star-rating-summary {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 700;
  color: var(--academy-gold, #ffb300);
}

/* Tactical Outcome Header & Pills */
.tactical-outcome-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3, 12px);
  width: 100%;
  flex-wrap: wrap;
  margin-top: var(--space-1, 4px);
}

.motif-outcome-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5, 6px);
  padding: 6px 14px;
  border-radius: var(--radius-pill, 9999px);
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 700;
  box-shadow: var(--shadow-xs, 0 1px 3px rgba(15, 23, 42, 0.08));
}

.badge--fork {
  background: var(--theme-fork-bg, hsl(45, 100%, 96%));
  border: 2px solid var(--theme-fork-border, hsl(42, 90%, 75%));
  color: var(--theme-fork-text, hsl(38, 90%, 22%));
}

.badge--pin {
  background: var(--theme-pin-bg, hsl(198, 90%, 96%));
  border: 2px solid var(--theme-pin-border, hsl(198, 80%, 75%));
  color: var(--theme-pin-text, hsl(198, 90%, 20%));
}

.badge--skewer {
  background: var(--theme-skewer-bg, hsl(271, 85%, 97%));
  border: 2px solid var(--theme-skewer-border, hsl(271, 70%, 82%));
  color: var(--theme-skewer-text, hsl(271, 80%, 22%));
}

.badge--discovered {
  background: var(--theme-disc-bg, hsl(25, 100%, 96%));
  border: 2px solid var(--theme-disc-border, hsl(25, 85%, 78%));
  color: var(--theme-disc-text, hsl(25, 90%, 22%));
}

.badge--mate {
  background: var(--theme-mate-bg, hsl(350, 85%, 96%));
  border: 2px solid var(--theme-mate-border, hsl(350, 75%, 80%));
  color: var(--theme-mate-text, hsl(350, 80%, 22%));
}

.badge--decoy {
  background: var(--theme-decoy-bg, hsl(160, 80%, 96%));
  border: 2px solid var(--theme-decoy-border, hsl(160, 70%, 78%));
  color: var(--theme-decoy-text, hsl(160, 85%, 18%));
}

.badge--gift {
  background: var(--theme-gift-bg, hsl(15, 95%, 96%));
  border: 2px solid var(--theme-gift-border, hsl(15, 80%, 80%));
  color: var(--theme-gift-text, hsl(12, 85%, 20%));
}

.badge--wind {
  background: var(--theme-wind-bg, hsl(185, 85%, 96%));
  border: 2px solid var(--theme-wind-border, hsl(185, 75%, 78%));
  color: var(--theme-wind-text, hsl(185, 90%, 18%));
}

.badge--endgame {
  background: var(--theme-endgame-bg, hsl(35, 95%, 96%));
  border: 2px solid var(--theme-endgame-border, hsl(35, 80%, 80%));
  color: var(--theme-endgame-text, hsl(32, 85%, 20%));
}

.material-gain-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-pill, 9999px);
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 700;
  box-shadow: var(--shadow-xs, 0 1px 3px rgba(15, 23, 42, 0.08));
  animation: advantage-pill-bounce 600ms var(--ease-spring);
}

.pill--queen {
  background: var(--advantage-queen-bg, hsl(280, 85%, 95%));
  border: 2px solid var(--advantage-queen-border, hsl(280, 80%, 75%));
  color: var(--advantage-queen-text, hsl(280, 85%, 25%));
}

.pill--rook {
  background: var(--advantage-rook-bg, hsl(215, 90%, 95%));
  border: 2px solid var(--advantage-rook-border, hsl(215, 80%, 75%));
  color: var(--advantage-rook-text, hsl(215, 85%, 24%));
}

.pill--minor {
  background: var(--advantage-minor-bg, hsl(150, 75%, 95%));
  border: 2px solid var(--advantage-minor-border, hsl(150, 65%, 75%));
  color: var(--advantage-minor-text, hsl(150, 80%, 20%));
}

.pill--mate {
  background: var(--advantage-mate-bg, hsl(350, 88%, 95%));
  border: 2px solid var(--advantage-mate-border, hsl(350, 80%, 78%));
  color: var(--advantage-mate-text, hsl(350, 85%, 25%));
}

.pill--pawn {
  background: var(--advantage-pawn-bg, hsl(45, 100%, 95%));
  border: 2px solid var(--advantage-pawn-border, hsl(45, 90%, 75%));
  color: var(--advantage-pawn-text, hsl(42, 90%, 22%));
}

.praise-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
}

.puzzle-praise-heading {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-lg, 18px);
  font-weight: 800;
  color: var(--color-primary, #6c5ce7);
  margin: 0;
}

.puzzle-solved-title {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-base, 16px);
  font-weight: 700;
  color: var(--text-main, #0f172a);
  margin: 0;
}

@keyframes star-pop {
  0% { transform: scale(0) rotate(-30deg); opacity: 0; }
  65% { transform: scale(1.35) rotate(10deg); opacity: 1; filter: drop-shadow(0 0 16px var(--star-filled, #ffcc00)); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; filter: drop-shadow(0 0 6px var(--star-filled, #ffcc00)); }
}

@keyframes advantage-pill-bounce {
  0% { transform: scale(0.7) translateY(10px); opacity: 0; }
  60% { transform: scale(1.12) translateY(-3px); opacity: 1; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
</style>
