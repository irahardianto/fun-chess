<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type {
  PuzzleTheme,
  PuzzleProgressStore,
  StarRating,
  Square,
  Puzzle,
} from '@fun-chess/shared';
import BaseButton from '../../components/base/BaseButton.vue';
import { PromotionModal } from '@/features/modals/index.js';
import PuzzleBoardWrapper from './components/PuzzleBoardWrapper.vue';
import RatingClimbHud from './components/RatingClimbHud.vue';
import StreakHud from './components/StreakHud.vue';
import PuzzleCompletionModal from './components/PuzzleCompletionModal.vue';
import { useThemedDrills } from './composables/useThemedDrills';
import { useAdaptiveLadder } from './composables/useAdaptiveLadder';
import { usePuzzleRunner } from './composables/usePuzzleRunner';
import { getThemeDescriptor, getThemeVisualClues } from './data/puzzle_themes';

interface Props {
  mode?: 'themed_drills' | 'adaptive_ladder';
  initialTheme?: PuzzleTheme;
  customStore?: PuzzleProgressStore;
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'themed_drills',
  initialTheme: 'fork',
  customStore: undefined,
});

const emit = defineEmits<{
  back: [];
  exit: [];
  completed: [stars: StarRating];
}>();

// --- 1. Mode Composables Wiring ---
const themedDrills = useThemedDrills(props.initialTheme, props.customStore);
const drillsRunner = usePuzzleRunner({
  puzzle: themedDrills.currentPuzzle.value,
  onSolve: (puzzle, stars) => {
    themedDrills.handleSolve(puzzle, stars);
  },
});

const adaptiveLadder = useAdaptiveLadder(props.customStore);

// --- 2. Active Mode & Runner Resolution ---
const isLadderMode = computed(() => props.mode === 'adaptive_ladder');

const activeRunner = computed(() => {
  return isLadderMode.value ? adaptiveLadder.runner : drillsRunner;
});

const activePuzzle = computed<Puzzle | null>(() => {
  return isLadderMode.value
    ? adaptiveLadder.currentPuzzle.value
    : themedDrills.currentPuzzle.value;
});

const activeThemeDescriptor = computed(() => {
  return getThemeDescriptor(themedDrills.activeTheme.value);
});

// Thematic teaser clue displayed before move 1 (strictly avoiding solution spoilers)
const preMoveTeaser = computed<string>(() => {
  if (!activePuzzle.value) return '';
  if (activePuzzle.value.subtitle) {
    return activePuzzle.value.subtitle;
  }
  const descriptor =
    activeThemeDescriptor.value ||
    (activePuzzle.value.primaryTheme
      ? getThemeDescriptor(activePuzzle.value.primaryTheme)
      : undefined);
  if (descriptor?.kidFriendlyTip) {
    return descriptor.kidFriendlyTip;
  }
  if (activePuzzle.value.primaryTheme) {
    const clue = getThemeVisualClues(activePuzzle.value.primaryTheme);
    if (clue) return clue;
  }
  return 'Find the winning tactical sequence!';
});

// --- 3. Promotion Handling ---
const isPromotionModalOpen = ref<boolean>(false);
const promotionPendingMove = ref<{ from: Square; to: Square } | null>(null);

function handlePromotionRequired(payload: { from: Square; to: Square }) {
  promotionPendingMove.value = payload;
  isPromotionModalOpen.value = true;
}

function handlePromotionSelect(piece: 'q' | 'r' | 'b' | 'n') {
  isPromotionModalOpen.value = false;
  if (promotionPendingMove.value) {
    activeRunner.value.applyPlayerMove({
      from: promotionPendingMove.value.from,
      to: promotionPendingMove.value.to,
      promotion: piece,
    });
    promotionPendingMove.value = null;
  }
}

function handlePromotionCancel() {
  isPromotionModalOpen.value = false;
  promotionPendingMove.value = null;
}

// --- 4. Timer & Completion State ---
const solveStartTime = ref<number>(Date.now());
const elapsedSeconds = ref<number>(0);
const isCompletionDismissed = ref<boolean>(false);

onMounted(() => {
  solveStartTime.value = Date.now();
});

// Watch for active puzzle completion
watch(
  () => activeRunner.value.isCompleted.value,
  (completed) => {
    if (completed && activeRunner.value.isSolvedSuccessfully.value) {
      isCompletionDismissed.value = false;
      elapsedSeconds.value = Math.max(1, Math.round((Date.now() - solveStartTime.value) / 1000));
      const stars = activeRunner.value.calculatedStars.value;
      emit('completed', stars);
    }
  }
);

// Reset completion dismissal when active puzzle changes
watch(
  () => activePuzzle.value,
  () => {
    isCompletionDismissed.value = false;
  }
);

// Watch for initialTheme prop changes
watch(
  () => props.initialTheme,
  (newTheme) => {
    if (newTheme && props.mode === 'themed_drills') {
      isCompletionDismissed.value = false;
      themedDrills.setTheme(newTheme);
      if (themedDrills.currentPuzzle.value) {
        drillsRunner.loadPuzzle(themedDrills.currentPuzzle.value);
      }
      solveStartTime.value = Date.now();
      elapsedSeconds.value = 0;
    }
  }
);

// Watch for themed drill playlist / puzzle changes
watch(
  () => themedDrills.currentPuzzle.value,
  (newPuzzle) => {
    if (newPuzzle && props.mode === 'themed_drills') {
      isCompletionDismissed.value = false;
      drillsRunner.loadPuzzle(newPuzzle);
      solveStartTime.value = Date.now();
      elapsedSeconds.value = 0;
    }
  }
);

// --- 5. Interactive Board Actions ---
function handleBoardMove(move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) {
  activeRunner.value.applyPlayerMove(move);
}

function handleRequestHint() {
  activeRunner.value.revealNextHint();
}

function handleRetry() {
  isCompletionDismissed.value = false;
  activeRunner.value.resetCurrentPuzzle();
  solveStartTime.value = Date.now();
  elapsedSeconds.value = 0;
}

function handleNextPuzzle() {
  isCompletionDismissed.value = false;
  solveStartTime.value = Date.now();
  elapsedSeconds.value = 0;
  if (isLadderMode.value) {
    adaptiveLadder.pickNextLadderPuzzle();
  } else {
    themedDrills.nextPuzzle();
    if (themedDrills.currentPuzzle.value) {
      drillsRunner.loadPuzzle(themedDrills.currentPuzzle.value);
    }
  }
}

function handleSkip() {
  isCompletionDismissed.value = false;
  if (isLadderMode.value) {
    if (activePuzzle.value) {
      adaptiveLadder.handleSkipOrFail(activePuzzle.value);
    }
    adaptiveLadder.pickNextLadderPuzzle();
  } else {
    themedDrills.handleSkip();
    if (themedDrills.currentPuzzle.value) {
      drillsRunner.loadPuzzle(themedDrills.currentPuzzle.value);
    }
  }
  solveStartTime.value = Date.now();
  elapsedSeconds.value = 0;
}

function handleBack() {
  emit('back');
  emit('exit');
}
</script>

<template>
  <div class="puzzle-arena-layout" data-testid="puzzle-arena">
    <!-- Top Navigation Header -->
    <header class="arena-top-header">
      <div class="header-left">
        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="back-btn"
          aria-label="Back to Puzzle Hub"
          @click="handleBack"
        >
          <template #icon-left>⬅️</template>
          Puzzles
        </BaseButton>

        <div class="header-title-group">
          <span class="arena-icon-sm" aria-hidden="true">
            {{ isLadderMode ? '🏆' : (activeThemeDescriptor?.icon || '🎯') }}
          </span>
          <h1 class="arena-header-title">
            {{ isLadderMode ? 'Adaptive Rating Ladder' : (activeThemeDescriptor?.name || 'Tactical Drill') }}
          </h1>
        </div>
      </div>

      <div class="header-right">
        <!-- Adaptive Ladder Live Rating HUD -->
        <RatingClimbHud
          v-if="isLadderMode"
          :current-rating="adaptiveLadder.currentElo.value"
          :streak="adaptiveLadder.currentStreak.value"
          :target-rating="adaptiveLadder.targetRating.value"
        />

        <!-- Themed Drills Streak & Progress HUD -->
        <div v-else class="drills-hud-group">
          <StreakHud
            :streak="themedDrills.sessionSolvedCount.value"
            :label="`${themedDrills.sessionSolvedCount.value} Solved`"
          />
          <span class="drill-progress-tag" data-testid="drill-progress-tag">
            Drill {{ themedDrills.currentPuzzleIndex.value + 1 }} / {{ themedDrills.totalInTheme.value }}
          </span>
        </div>
      </div>
    </header>

    <!-- Main Game Arena Content -->
    <div class="arena-main-content">
      <!-- Puzzle Guide / Coaching Overlay Card -->
      <div v-if="activePuzzle" class="arena-guide-slot" data-testid="puzzle-guide-slot">
        <div class="puzzle-info-card" :class="{ 'is-shaking': activeRunner.isShaking.value }">
          <div class="puzzle-info-header">
            <div class="puzzle-title-wrap">
              <div class="puzzle-goal-tagline">
                <span class="goal-icon-badge">🎯</span>
                <span class="goal-heading-text">Tactical Objective</span>
              </div>
              <h2 class="puzzle-card-title">{{ activePuzzle.title }}</h2>
            </div>

            <div
              class="turn-indicator-pill"
              :class="activeRunner.playerColor.value === 'w' ? 'turn-white' : 'turn-black'"
            >
              {{ activeRunner.playerColor.value === 'w' ? '⚪ White to Move' : '⚫ Black to Move' }}
            </div>
          </div>

          <!-- Tactical Goal Banner Headline -->
          <h3
            v-if="activePuzzle.tacticalGoal"
            class="puzzle-goal-text"
            data-testid="puzzle-tactical-goal"
          >
            {{ activePuzzle.tacticalGoal }}
          </h3>

          <!-- Pedagogical Thematic Teaser Callout (Pre-Move, Zero Solution Spoilers) -->
          <div
            v-if="preMoveTeaser"
            class="puzzle-why-callout"
            data-testid="puzzle-why-callout"
          >
            <span class="why-label">💡 Why:</span>
            <span class="why-text">{{ preMoveTeaser }}</span>
          </div>

          <!-- Metadata Chips Footer -->
          <div class="puzzle-meta-chips">
            <span class="meta-chip puzzle-difficulty-tag">{{ activePuzzle.difficulty }}</span>
            <span class="meta-chip puzzle-rating-pill">~{{ activePuzzle.rating }} Elo</span>
            <span v-if="activePuzzle.primaryTheme" class="meta-chip meta-chip--theme">
              {{ activePuzzle.primaryTheme }}
            </span>
          </div>
        </div>
      </div>

      <!-- Chessboard Container with Integrated Progressive Hint Layer -->
      <div class="arena-board-slot">
        <!-- Floating feedback toast on mistake / feedback -->
        <transition name="fade">
          <div
            v-if="activeRunner.feedbackMessage.value"
            class="puzzle-feedback-banner"
            data-testid="puzzle-feedback-banner"
          >
            <span class="feedback-icon">💬</span>
            <span class="feedback-text">{{ activeRunner.feedbackMessage.value }}</span>
          </div>
        </transition>

        <PuzzleBoardWrapper
          :fen="activeRunner.displayedFen.value"
          :orientation="activeRunner.playerColor.value"
          :turn="activeRunner.playerColor.value"
          :my-color="activeRunner.playerColor.value"
          :selected-square="activeRunner.selectedSquare.value"
          :legal-moves="[...activeRunner.legalMoves.value]"
          :last-move="activeRunner.displayedLastMove.value"
          :threat-square="activeRunner.lastMistakeRefutation.value?.threatSquare"
          :interactive="!activeRunner.isWaitingForBot.value && !activeRunner.isCompleted.value && !activeRunner.isReplaying.value"
          :hint-level="activeRunner.progressiveHint.currentHintLevel.value"
          :hint-data="activeRunner.progressiveHint.activeHint.value"
          @select="activeRunner.selectSquare"
          @move="handleBoardMove"
          @promotion-required="handlePromotionRequired"
          @request-hint="handleRequestHint"
        />
      </div>

      <!-- Quick Action Toolbar -->
      <div class="arena-action-toolbar">
        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="puzzle-reset-btn"
          :disabled="activeRunner.isWaitingForBot.value"
          @click="handleRetry"
        >
          <template #icon-left>🔄</template>
          Reset Position
        </BaseButton>

        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="puzzle-skip-btn"
          :disabled="activeRunner.isWaitingForBot.value || activeRunner.isCompleted.value"
          @click="handleSkip"
        >
          <template #icon-left>⏭️</template>
          Skip Puzzle
        </BaseButton>
      </div>
    </div>

    <!-- Pawn Promotion Modal -->
    <PromotionModal
      v-model="isPromotionModalOpen"
      :color="activeRunner.playerColor.value"
      @select="handlePromotionSelect"
      @cancel="handlePromotionCancel"
    />

    <!-- Puzzle Completion Celebratory Modal & Replay Controller -->
    <PuzzleCompletionModal
      :model-value="!isCompletionDismissed && activeRunner.isCompleted.value && activeRunner.isSolvedSuccessfully.value"
      :puzzle="activePuzzle"
      :analysis="activeRunner.analysis.value"
      :stars="activeRunner.calculatedStars.value"
      :result="activeRunner.attemptResult.value"
      :solve-time-seconds="elapsedSeconds"
      :hints-used="activeRunner.progressiveHint.hintsUsedCount.value"
      :mistakes-count="activeRunner.mistakesCount.value"
      :rating-delta="isLadderMode ? adaptiveLadder.lastRatingDelta.value : null"
      :has-next-puzzle="true"
      :replay-step-index="activeRunner.replayStepIndex.value"
      :total-replay-steps="activeRunner.replayTotalSteps.value"
      :current-replay-san="activeRunner.currentReplaySan.value"
      :current-step-explanation="activeRunner.currentStepExplanation.value?.explanation || activeRunner.currentReplayStep.value?.explanation"
      :is-inspecting-board="activeRunner.isInspectingBoard.value"
      @update:model-value="(val: boolean) => { if (!val) isCompletionDismissed = true; }"
      @close="isCompletionDismissed = true"
      @replay-step="activeRunner.setReplayStep"
      @replay-start="activeRunner.stepReplayStart"
      @replay-prev="activeRunner.stepReplayPrev"
      @replay-next="activeRunner.stepReplayNext"
      @replay-end="activeRunner.stepReplayEnd"
      @inspect-board="activeRunner.toggleInspectBoard"
      @toggle-inspect="activeRunner.toggleInspectBoard"
      @retry="handleRetry"
      @replay="handleRetry"
      @next="handleNextPuzzle"
      @next-puzzle="handleNextPuzzle"
      @back-to-hub="handleBack"
    />
  </div>
</template>

<style scoped>
.puzzle-arena-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4, 16px);
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 0;
  box-sizing: border-box;
}

/* TOP HEADER */
.arena-top-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-bottom: var(--space-3, 12px);
  border-bottom: 1px solid var(--border-subtle, #e2e8f0);
  gap: var(--space-3, 12px);
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  flex-wrap: wrap;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.arena-icon-sm {
  font-size: 1.5rem;
  line-height: 1;
}

.arena-header-title {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xl, 20px);
  font-weight: 800;
  color: var(--text-main, #0f172a);
  margin: 0;
  line-height: 1.2;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.drills-hud-group {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}

.drill-progress-tag {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-pill, 9999px);
  background: var(--bg-surface-raised, #f8fafc);
  border: 1px solid var(--border-subtle, #e2e8f0);
  color: var(--text-muted, #64748b);
}

/* MAIN CONTENT */
.arena-main-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4, 16px);
  width: 100%;
}

.arena-guide-slot {
  width: 100%;
  max-width: 580px;
}

.puzzle-info-card {
  background: var(--bg-surface, #ffffff);
  border: 2px solid var(--border-subtle, #e2e8f0);
  border-radius: var(--radius-card, 16px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(15, 23, 42, 0.08));
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  box-sizing: border-box;
}

.puzzle-info-card.is-shaking {
  animation: shake 0.4s ease-in-out;
}

.puzzle-info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}

.puzzle-title-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}

.puzzle-card-title {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-base, 16px);
  font-weight: 800;
  color: var(--text-main, #0f172a);
  margin: 0;
}

.puzzle-difficulty-tag {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 9999px);
  background: var(--color-primary-subtle, rgba(108, 92, 231, 0.12));
  color: var(--color-primary, #6c5ce7);
  text-transform: capitalize;
}

.puzzle-rating-pill {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-sm, 6px);
  background: rgba(15, 23, 42, 0.06);
  color: var(--text-muted, #64748b);
}

.turn-indicator-pill {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--radius-pill, 9999px);
  border: 1.5px solid var(--border-medium, #cbd5e1);
}

.turn-white {
  background: var(--bg-surface, #ffffff);
  color: var(--text-main, #0f172a);
}

.turn-black {
  background: var(--text-main, #1e293b);
  color: var(--text-inverse, #ffffff);
  border-color: var(--border-medium, #334155);
}

.puzzle-goal-tagline {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5, 6px);
}

.goal-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-pill, 9999px);
  background: var(--color-primary-subtle, rgba(108, 92, 231, 0.12));
  color: var(--color-primary, #6c5ce7);
  font-size: 0.85rem;
}

.goal-heading-text {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-primary, #6c5ce7);
}

.puzzle-goal-text {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-base, 16px);
  font-weight: 800;
  color: var(--text-main, #0f172a);
  line-height: 1.35;
  margin: 0;
}

.puzzle-why-callout {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1-5, 6px);
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-sm, 14px);
  color: var(--text-muted, #64748b);
  line-height: 1.45;
  background: var(--bg-surface-raised, #f8fafc);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border-radius: var(--radius-md, 12px);
  border-left: 3px solid var(--color-accent, #ffb300);
}

.why-label {
  font-weight: 800;
  color: var(--color-accent-text, #92400e);
}

.puzzle-meta-chips {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
  padding-top: var(--space-0-5, 2px);
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono, monospace);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-sm, 6px);
  background: var(--bg-surface-raised, #f8fafc);
  border: 1px solid var(--border-subtle, #e2e8f0);
  color: var(--text-muted, #64748b);
}

.meta-chip--theme {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  background: var(--color-primary-subtle, rgba(108, 92, 231, 0.12));
  color: var(--color-primary, #6c5ce7);
  border-color: transparent;
  text-transform: capitalize;
}

.puzzle-feedback-banner {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-overlay-toast, 10);
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: 4px 16px;
  background-color: var(--bg-surface-glass, rgba(255, 255, 255, 0.92));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 2px solid var(--color-danger, #ef4444);
  border-radius: var(--radius-pill, 9999px);
  color: var(--color-danger, #ef4444);
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 700;
  box-shadow: var(--shadow-md, 0 6px 16px rgba(15, 23, 42, 0.1));
  white-space: nowrap;
  pointer-events: none;
}

.puzzle-feedback-banner .feedback-icon {
  font-size: var(--text-base);
}

.puzzle-feedback-banner .feedback-text {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 700;
}

.arena-board-slot {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}

.arena-action-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3, 12px);
  width: 100%;
  max-width: 580px;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s var(--ease-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275));
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px) scale(0.94);
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}
</style>
