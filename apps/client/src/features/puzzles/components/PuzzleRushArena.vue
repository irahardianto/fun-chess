<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { Square, PuzzleProgressStore } from '@fun-chess/shared';
import PuzzleBoardWrapper from './PuzzleBoardWrapper.vue';
import PuzzleRushHeader from './rush/PuzzleRushHeader.vue';
import PuzzleRushSummaryModal from './rush/PuzzleRushSummaryModal.vue';
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

onUnmounted(() => {
  if (bonusTimeout) {
    clearTimeout(bonusTimeout);
    bonusTimeout = null;
  }
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
    <PuzzleRushHeader
      :mode="effectiveMode"
      :is-game-over-active="isGameOverActive"
      :formatted-time="formattedTime"
      :is-time-urgent="isTimeUrgent"
      :show-time-bonus="showTimeBonus"
      :score="currentScore"
      :combo-multiplier="currentComboMultiplier"
      :active-streak="activeStreak"
      :strikes="currentStrikes"
      :max-strikes="currentMaxStrikes"
      @exit="handleExit"
    />

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
    <PuzzleRushSummaryModal
      :is-open="isGameOverActive"
      :title="gameOverTitle"
      :score="currentScore"
      :best-streak="currentBestStreak"
      :combo-multiplier="currentComboMultiplier"
      :rank="rankAchieved"
      :is-new-high-score="isNewHighScore"
      @restart="handleRestart"
      @exit="handleExit"
    />
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

.time-bonus-notification {
  color: var(--text-on-success);
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes shake-soft {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}
</style>
