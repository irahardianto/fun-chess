<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { Square, PuzzleProgressStore } from '@fun-chess/shared';
import BaseButton from '../../../components/base/BaseButton.vue';
import PuzzleBoardWrapper from './PuzzleBoardWrapper.vue';
import { usePuzzleRush } from '../composables/usePuzzleRush';
import { getRankTierForElo } from '../engine/adaptive_rating';

interface Props {
  mode?: 'puzzle_rush' | 'streak_survivor';
  subMode?: 'puzzle_rush' | 'streak_survivor';
  customStore?: PuzzleProgressStore;
  initialDurationSeconds?: number;
  maxStrikes?: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'restart'): void;
  (e: 'exit'): void;
  (e: 'lobby'): void;
}>();

const effectiveSubMode = computed<'puzzle_rush' | 'streak_survivor'>(() => {
  return props.subMode || props.mode || 'puzzle_rush';
});

const rush = usePuzzleRush({
  subMode: effectiveSubMode.value,
  customStore: props.customStore,
  initialDurationSeconds: props.initialDurationSeconds,
  maxStrikes: props.maxStrikes,
});

const effectiveMode = computed(() => rush.mode.value || effectiveSubMode.value);
const currentScore = computed(() => rush.score.value);
const currentTimeRemaining = computed(() => rush.timeRemainingSeconds.value);
const currentStrikes = computed(() => rush.strikes.value);
const currentMaxStrikes = computed(() => props.maxStrikes ?? 3);
const activeStreak = computed(() => rush.currentStreak.value);
const currentBestStreak = computed(() => rush.bestStreak.value || activeStreak.value);
const currentComboMultiplier = computed(() => rush.comboMultiplier.value);
const isGameOverActive = computed(() => rush.isGameOver.value);
const currentHighScore = computed(() => rush.highScore.value);
const isNewHighScore = computed(() => rush.isNewHighScore.value || (currentScore.value > 0 && currentScore.value > currentHighScore.value));

const formattedTime = computed(() => {
  const m = Math.floor(currentTimeRemaining.value / 60);
  const s = Math.floor(currentTimeRemaining.value % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
});

const isTimeUrgent = computed(() => effectiveMode.value === 'puzzle_rush' && currentTimeRemaining.value <= 15);

const gameOverTitle = computed(() => {
  if (effectiveMode.value === 'puzzle_rush') {
    if (currentStrikes.value >= currentMaxStrikes.value) {
      return '💥 Run finished!';
    }
    return '⏰ Time is up!';
  }
  return '💥 Run finished!';
});

const rankAchieved = computed(() => {
  const estimatedElo = 600 + Math.min(1400, currentScore.value * 50);
  return getRankTierForElo(estimatedElo);
});

const showTimeBonus = ref(false);
let bonusTimeout: ReturnType<typeof setTimeout> | null = null;

watch(
  () => rush.lastTimeBonus.value,
  (bonus) => {
    if (bonus > 0) {
      showTimeBonus.value = true;
      if (bonusTimeout) clearTimeout(bonusTimeout);
      bonusTimeout = setTimeout(() => {
        showTimeBonus.value = false;
      }, 1500);
    }
  }
);

onMounted(() => {
  rush.startRun(effectiveSubMode.value);
});

watch(
  () => props.subMode || props.mode,
  (newMode) => {
    if (newMode) {
      rush.startRun(newMode);
    }
  }
);

function handleSelectSquare(square: Square) {
  if (isGameOverActive.value) return;
  rush.runner.selectSquare(square);
}

function handlePlayerMove(move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) {
  if (isGameOverActive.value) return;
  rush.runner.applyPlayerMove(move);
}

function handlePromotionRequired(payload: { from: Square; to: Square }) {
  if (isGameOverActive.value) return;
  rush.runner.applyPlayerMove({ from: payload.from, to: payload.to, promotion: 'q' });
}

function handleRestart() {
  rush.startRun(effectiveSubMode.value);
  emit('restart');
}

function handleExit() {
  rush.stopRun();
  emit('exit');
  emit('lobby');
}

defineExpose({
  rush,
  handleRestart,
  handleExit,
  handleSelectSquare,
  handlePlayerMove,
});
</script>

<template>
  <div class="puzzle-rush-arena" data-testid="puzzle-rush-arena">
    <!-- Top Rush HUD Bar -->
    <header
      class="rush-hud-bar"
      data-testid="rush-hud-bar"
      :aria-hidden="isGameOverActive"
      :inert="isGameOverActive"
    >
      <!-- Mode Badge -->
      <div class="rush-mode-badge" :data-mode="effectiveMode">
        {{ effectiveMode === 'puzzle_rush' ? '⚡ 3-Min Rush' : '🛡️ Streak Survivor' }}
      </div>

      <!-- Countdown Timer (Rush mode only) -->
      <div
        v-if="effectiveMode === 'puzzle_rush'"
        class="rush-timer-badge"
        :class="{ 'is-urgent': isTimeUrgent }"
        data-testid="rush-timer"
        data-test-section="timer"
      >
        <div data-testid="rush-timer-section" class="timer-inner-wrap">
          <span class="timer-icon" aria-hidden="true">⏳</span>
          <span class="timer-digits">{{ formattedTime }}</span>
        </div>

        <!-- Floating +5s Time Bonus Notification -->
        <transition name="bonus-pop">
          <span
            v-if="showTimeBonus"
            class="time-bonus-notification"
            data-testid="time-bonus-notification"
          >
            +5s ⚡
          </span>
        </transition>
      </div>

      <!-- Solved Score Counter -->
      <div class="rush-score-badge" data-testid="rush-score" data-test-badge="score">
        <div data-testid="rush-score-badge" class="score-inner-wrap">
          <span class="score-label">Solved:</span>
          <span class="score-value">{{ currentScore }}</span>
        </div>
      </div>

      <!-- Combo Multiplier Flame -->
      <div
        class="flame-combo-badge"
        :data-multiplier="currentComboMultiplier"
        :class="{ 'has-streak': activeStreak >= 2 }"
        data-testid="combo-badge"
      >
        <span class="flame-icon" aria-hidden="true">🔥</span>
        <span class="combo-text">x{{ currentComboMultiplier }}</span>
      </div>

      <!-- Strike Shields / Hearts -->
      <div class="rush-strikes-container" data-testid="rush-strikes">
        <div data-testid="strikes-life-row" class="strikes-inner-row">
          <span
            v-for="i in currentMaxStrikes"
            :key="i"
            class="strike-icon"
            :class="{ 'is-struck': i <= currentStrikes }"
            :data-struck="i <= currentStrikes"
          >
            {{ i <= currentStrikes ? '❌' : '💚' }}
          </span>
        </div>
      </div>

      <!-- Exit Button -->
      <BaseButton
        variant="ghost"
        size="sm"
        data-testid="rush-exit-btn"
        @click="handleExit"
      >
        ✕ Exit
      </BaseButton>
    </header>

    <!-- Main Board Area with Visual State Cues -->
    <main
      class="rush-board-container"
      :class="{ 'is-shaking': rush.runner.isShaking.value }"
      data-testid="rush-board-container"
      :aria-hidden="isGameOverActive"
      :inert="isGameOverActive"
    >
      <!-- Feedback message toast if any (e.g. error / nudge) -->
      <transition name="fade">
        <div
          v-if="rush.runner.feedbackMessage.value"
          class="rush-feedback-toast"
          :class="{ 'is-error': rush.runner.isShaking.value }"
          data-testid="rush-feedback-toast"
          role="status"
        >
          {{ rush.runner.feedbackMessage.value }}
        </div>
      </transition>

      <!-- Puzzle Chessboard -->
      <PuzzleBoardWrapper
        :fen="rush.runner.currentFen.value"
        :orientation="rush.runner.playerColor.value"
        :turn="rush.runner.playerColor.value"
        :my-color="rush.runner.playerColor.value"
        :selected-square="rush.runner.selectedSquare.value"
        :legal-moves="rush.runner.legalMoves.value"
        :last-move="rush.runner.lastMove.value"
        :interactive="!isGameOverActive && rush.runner.isPlayerTurn.value"
        :disabled="isGameOverActive"
        :show-hint-controls="false"
        @select="handleSelectSquare"
        @move="handlePlayerMove"
        @promotion-required="handlePromotionRequired"
      />
    </main>

    <!-- Game Over Overlay Dialog -->
    <transition name="pop-fade">
      <div
        v-if="isGameOverActive"
        class="rush-game-over-overlay"
        data-testid="rush-game-over"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-title"
      >
        <div class="rush-game-over-card" data-testid="game-over-card">
          <h2 id="game-over-title" class="game-over-title">
            {{ gameOverTitle }}
          </h2>

          <div class="game-over-stats-grid">
            <div class="stat-pill" data-testid="final-score">
              <span class="stat-pill-icon" aria-hidden="true">🧩</span>
              <div class="stat-pill-info">
                <span class="stat-pill-label">Final Score</span>
                <span class="stat-pill-value">{{ currentScore }} Solved</span>
              </div>
            </div>

            <div class="stat-pill" data-testid="highest-streak">
              <span class="stat-pill-icon" aria-hidden="true">🔥</span>
              <div class="stat-pill-info">
                <span class="stat-pill-label">Best Streak</span>
                <span class="stat-pill-value">{{ currentBestStreak }} (x{{ currentComboMultiplier }})</span>
              </div>
            </div>

            <div class="stat-pill rank-pill" data-testid="rank-achieved">
              <span class="stat-pill-icon" aria-hidden="true">{{ rankAchieved.icon }}</span>
              <div class="stat-pill-info">
                <span class="stat-pill-label">Rank Achieved</span>
                <span class="stat-pill-value">{{ rankAchieved.name }}</span>
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
              @click="handleRestart"
            >
              <template #icon-left>🚀</template>
              Play Again
            </BaseButton>
            <BaseButton
              variant="ghost"
              size="lg"
              class="game-over-btn"
              data-testid="rush-game-over-exit-btn"
              @click="handleExit"
            >
              Exit to Hub
            </BaseButton>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.puzzle-rush-arena {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3, 12px);
  position: relative;
  box-sizing: border-box;
  padding: 0;
}

.rush-hud-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  padding: var(--space-2, 8px) var(--space-4, 16px);
  background: var(--bg-surface, #ffffff);
  border: 2px solid var(--border-subtle, #e2e8f0);
  border-radius: var(--radius-pill, 9999px);
  box-shadow: var(--shadow-sm, 0 2px 6px rgba(15, 23, 42, 0.08));
  width: 100%;
  box-sizing: border-box;
  flex-wrap: wrap;
}

.timer-inner-wrap,
.score-inner-wrap,
.strikes-inner-row {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
}

.rush-mode-badge {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 700;
  color: var(--mode-rush-primary, #ea580c);
}

.rush-timer-badge {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
  font-family: var(--font-mono, monospace);
  font-size: var(--text-lg, 18px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  padding: 4px 12px;
  border-radius: var(--radius-pill, 9999px);
  background: rgba(15, 23, 42, 0.06);
  color: var(--text-main, #0f172a);
}

.timer-digits {
  font-variant-numeric: tabular-nums;
}

.rush-timer-badge.is-urgent {
  background: var(--color-danger, #ef4444);
  color: #ffffff;
  animation: timer-heartbeat 0.6s infinite ease-in-out;
}

.time-bonus-notification {
  position: absolute;
  top: -24px;
  right: 0;
  background: var(--color-success, #22c55e);
  color: var(--text-on-success, #ffffff);
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 9999px);
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.5);
  pointer-events: none;
  animation: float-delta 1.2s ease-out forwards;
}

.rush-score-badge {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
}

.score-label {
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, #64748b);
}

.score-value {
  font-size: var(--text-xl, 20px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--color-primary, #6c5ce7);
}

.flame-combo-badge {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 10px;
  border-radius: var(--radius-pill, 9999px);
  background: rgba(255, 179, 0, 0.18);
  color: var(--flame-blaze-start, #ffb300);
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  transition: background var(--duration-normal) ease, color var(--duration-normal) ease, transform var(--duration-normal) var(--ease-spring);
}

.flame-combo-badge.has-streak {
  background: linear-gradient(135deg, #ea580c, #f43f5e);
  color: #ffffff;
  animation: flame-flicker 0.65s infinite ease-in-out;
}

.rush-strikes-container {
  display: flex;
  gap: 4px;
}

.strike-icon {
  font-size: 1.1rem;
  transition: transform var(--duration-fast, 140ms) var(--ease-spring);
}

.strike-icon.is-struck {
  animation: shake-soft 0.3s ease-in-out;
}

/* Board Container & Effects */
.rush-board-container {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.rush-board-container.is-shaking {
  animation: shake-soft 0.4s ease-in-out;
}

.rush-feedback-toast {
  position: absolute;
  top: -12px;
  z-index: 10;
  background: var(--bg-surface, #ffffff);
  border: 2px solid var(--color-primary, #6c5ce7);
  border-radius: var(--radius-pill, 9999px);
  padding: 4px 16px;
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 700;
  color: var(--text-main, #0f172a);
  box-shadow: var(--shadow-md, 0 6px 16px rgba(15, 23, 42, 0.1));
}

.rush-feedback-toast.is-error {
  border-color: var(--color-danger, #ef4444);
  color: var(--color-danger, #ef4444);
}

/* Game Over Overlay */
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
  text-align: left;
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

/* Animations */
.bonus-pop-enter-active {
  animation: float-delta 1.2s ease-out;
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

@keyframes timer-heartbeat {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}

@keyframes flame-flicker {
  0%, 100% {
    transform: scale(1) rotate(-2deg);
  }
  50% {
    transform: scale(1.1) rotate(2deg);
  }
}

@keyframes shake-soft {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}

@keyframes float-delta {
  0% {
    transform: translateY(0) scale(0.8);
    opacity: 0;
  }
  30% {
    transform: translateY(-8px) scale(1.1);
    opacity: 1;
  }
  100% {
    transform: translateY(-24px) scale(0.9);
    opacity: 0;
  }
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

