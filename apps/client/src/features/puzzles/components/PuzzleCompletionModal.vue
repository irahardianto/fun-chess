<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, type ComponentPublicInstance } from 'vue';
import type { StarRating, Puzzle, PuzzleAttemptResult, PuzzleAnalysisResult } from '@fun-chess/shared';
import BaseModal from '../../../components/base/BaseModal.vue';
import BaseButton from '../../../components/base/BaseButton.vue';
import { useConfetti } from '../../../composables/useConfetti';

interface Props {
  modelValue?: boolean;
  puzzle?: Puzzle | null;
  analysis?: PuzzleAnalysisResult | null;
  stars?: StarRating;
  result?: PuzzleAttemptResult;
  solveTimeSeconds?: number;
  hintsUsed?: number;
  mistakesCount?: number;
  ratingDelta?: number | null;
  hasNextPuzzle?: boolean;
  initialMinimized?: boolean;
  currentReplayPly?: number;
  replayStepIndex?: number;
  totalReplaySteps?: number;
  currentReplaySan?: string;
  currentStepExplanation?: string;
  isInspectingBoard?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  puzzle: null,
  analysis: null,
  stars: 3,
  result: 'solved_first_try',
  solveTimeSeconds: 0,
  hintsUsed: 0,
  mistakesCount: 0,
  ratingDelta: null,
  hasNextPuzzle: true,
  initialMinimized: false,
  currentReplayPly: undefined,
  replayStepIndex: undefined,
  totalReplaySteps: undefined,
  currentReplaySan: undefined,
  currentStepExplanation: undefined,
  isInspectingBoard: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:minimized': [value: boolean];
  'update:isInspectingBoard': [value: boolean];
  'inspect-board': [isMinimized: boolean];
  'toggle-inspect': [value?: boolean];
  'replay-step': [plyIndex: number];
  'replay-start': [];
  'replay-prev': [];
  'replay-next': [];
  'replay-end': [];
  replayStart: [];
  replayPrev: [];
  replayNext: [];
  replayEnd: [];
  next: [];
  nextPuzzle: [];
  replay: [];
  retry: [];
  backToHub: [];
}>();

const { celebrate } = useConfetti();

const internalMinimized = ref<boolean>(props.initialMinimized || props.isInspectingBoard);

watch(
  () => props.initialMinimized,
  (val) => {
    internalMinimized.value = val;
  }
);

watch(
  () => props.isInspectingBoard,
  (val) => {
    internalMinimized.value = val;
  }
);

const isMinimized = computed({
  get: () => internalMinimized.value,
  set: (val: boolean) => {
    internalMinimized.value = val;
    emit('update:minimized', val);
    emit('update:isInspectingBoard', val);
    emit('inspect-board', val);
    emit('toggle-inspect', val);
  },
});

const totalPlies = computed(() => {
  if (props.totalReplaySteps !== undefined) return props.totalReplaySteps;
  return props.puzzle?.moves?.length || 0;
});

const currentPlyIndex = ref<number>(
  props.replayStepIndex !== undefined
    ? props.replayStepIndex
    : props.currentReplayPly !== undefined
      ? props.currentReplayPly
      : props.puzzle?.moves?.length || 0
);

watch(
  () => props.puzzle,
  (puz) => {
    currentPlyIndex.value = puz?.moves?.length || 0;
  }
);

watch(
  () => props.replayStepIndex,
  (idx) => {
    if (idx !== undefined) {
      currentPlyIndex.value = idx;
    }
  }
);

watch(
  () => props.currentReplayPly,
  (ply) => {
    if (ply !== undefined) {
      currentPlyIndex.value = ply;
    }
  }
);

const praiseHeading = computed(() => {
  if (props.stars === 3) return 'Flawless Masterpiece! 🌟';
  if (props.stars === 2) return 'Super Tactical Solve! 🎯';
  return 'Puzzle Completed! 👏';
});

const motifInfo = computed(() => {
  const theme = props.puzzle?.primaryTheme || props.analysis?.detectedTheme || 'fork';
  switch (theme) {
    case 'fork':
      return { icon: '🍴', name: 'Royal Fork', class: 'badge--fork' };
    case 'pin':
      return { icon: '📌', name: 'Sneaky Pin', class: 'badge--pin' };
    case 'skewer':
      return { icon: '⚡', name: 'Laser Skewer', class: 'badge--skewer' };
    case 'discovered_attack':
    case 'discovered_check':
    case 'double_check':
      return { icon: '💥', name: 'Discovered Attack', class: 'badge--discovered' };
    case 'deflection':
    case 'decoy':
      return { icon: '🎯', name: 'Decoy & Deflection', class: 'badge--decoy' };
    case 'greek_gift':
      return { icon: '🎁', name: 'Greek Gift', class: 'badge--gift' };
    case 'windmill':
      return { icon: '🌪️', name: 'Windmill Carousel', class: 'badge--wind' };
    case 'back_rank_mate':
    case 'smothered_mate':
    case 'anastasia_mate':
    case 'hook_mate':
    case 'mate_in_1':
    case 'mate_in_2':
    case 'mate_in_3':
      return { icon: '👑', name: 'Checkmate Pattern', class: 'badge--mate' };
    case 'pawn_endgame':
    case 'rook_endgame':
    case 'queen_endgame':
    case 'minor_piece_endgame':
      return { icon: '🏰', name: 'Endgame Technique', class: 'badge--endgame' };
    default:
      return { icon: '🎯', name: 'Tactical Motif', class: 'badge--fork' };
  }
});

const materialGainInfo = computed(() => {
  const advantageText =
    props.puzzle?.outcomeAdvantage ||
    props.analysis?.advantageSummary?.formattedAdvantage ||
    (props.puzzle?.tacticalReward === 'checkmate' ? 'Checkmate 👑' : '+5 Rook ♜');
  const lower = advantageText.toLowerCase();

  if (lower.includes('queen') || lower.includes('+9')) {
    return { icon: '♛', text: advantageText, class: 'pill--queen' };
  }
  if (lower.includes('rook') || lower.includes('+5')) {
    return { icon: '♜', text: advantageText, class: 'pill--rook' };
  }
  if (
    lower.includes('piece') ||
    lower.includes('bishop') ||
    lower.includes('knight') ||
    lower.includes('minor') ||
    lower.includes('+3')
  ) {
    return { icon: '⚔️', text: advantageText, class: 'pill--minor' };
  }
  if (lower.includes('checkmate') || lower.includes('mate') || lower.includes('👑')) {
    return { icon: '👑', text: advantageText, class: 'pill--mate' };
  }
  if (lower.includes('pawn') || lower.includes('+1')) {
    return { icon: '♟️', text: advantageText, class: 'pill--pawn' };
  }
  return { icon: '✨', text: advantageText, class: 'pill--minor' };
});

const coachExplanation = computed(() => {
  return (
    props.puzzle?.learningSummary ||
    props.analysis?.kidFriendlyExplanation ||
    'Outstanding vision! You calculated the winning tactical line perfectly! 🏆'
  );
});

const mascotTakeaway = computed(() => {
  return (
    props.puzzle?.keyTakeaway ||
    props.analysis?.ruleOfThumb ||
    'Knights are master forkers because they can leap over defenders!'
  );
});

const currentStepSan = computed(() => {
  if (currentPlyIndex.value === 0) return 'Start';
  if (props.currentReplaySan && currentPlyIndex.value === (props.replayStepIndex ?? currentPlyIndex.value)) {
    return props.currentReplaySan;
  }
  if (!props.puzzle?.moves?.length) return '';

  const plyIdx = currentPlyIndex.value - 1;
  if (props.puzzle.stepExplanations && props.puzzle.stepExplanations[plyIdx]) {
    return props.puzzle.stepExplanations[plyIdx].moveSan;
  }
  if (props.analysis?.stepNarratives && props.analysis.stepNarratives[plyIdx]) {
    return props.analysis.stepNarratives[plyIdx].moveSan;
  }
  return props.puzzle.moves[plyIdx] || '';
});

const currentStepExplanationText = computed(() => {
  if (currentPlyIndex.value === 0) {
    return 'Initial puzzle setup position';
  }
  if (props.currentStepExplanation && currentPlyIndex.value === (props.replayStepIndex ?? currentPlyIndex.value)) {
    return props.currentStepExplanation;
  }
  const plyIdx = currentPlyIndex.value - 1;
  if (props.puzzle?.stepExplanations?.[plyIdx]?.explanation) {
    return props.puzzle.stepExplanations[plyIdx].explanation;
  }
  if (props.analysis?.stepNarratives?.[plyIdx]?.explanation) {
    return props.analysis.stepNarratives[plyIdx].explanation;
  }
  return `Step ${currentPlyIndex.value}: ${currentStepSan.value}`;
});

const primaryCtaRef = ref<ComponentPublicInstance | HTMLButtonElement | null>(null);

function focusPrimaryCta() {
  nextTick(() => {
    if (!internalMinimized.value && props.modelValue) {
      if (primaryCtaRef.value) {
        if ('focus' in primaryCtaRef.value && typeof primaryCtaRef.value.focus === 'function') {
          primaryCtaRef.value.focus();
        } else if ('$el' in primaryCtaRef.value && primaryCtaRef.value.$el && typeof (primaryCtaRef.value.$el as HTMLElement).focus === 'function') {
          (primaryCtaRef.value.$el as HTMLElement).focus();
        }
      }
    }
  });
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      celebrate();
      internalMinimized.value = false;
      currentPlyIndex.value = props.replayStepIndex ?? props.puzzle?.moves?.length ?? 0;
      focusPrimaryCta();
    }
  }
);

watch(
  isMinimized,
  (min) => {
    if (!min && props.modelValue) {
      focusPrimaryCta();
    }
  }
);

function toggleInspectBoard(forceVal?: boolean) {
  isMinimized.value = forceVal !== undefined ? forceVal : !isMinimized.value;
}

function handleStepStart() {
  currentPlyIndex.value = 0;
  emit('replay-step', 0);
  emit('replay-start');
  emit('replayStart');
}

function handleStepPrev() {
  if (currentPlyIndex.value > 0) {
    currentPlyIndex.value -= 1;
    emit('replay-step', currentPlyIndex.value);
    emit('replay-prev');
    emit('replayPrev');
  }
}

function handleStepNext() {
  if (currentPlyIndex.value < totalPlies.value) {
    currentPlyIndex.value += 1;
    emit('replay-step', currentPlyIndex.value);
    emit('replay-next');
    emit('replayNext');
  }
}

function handleStepEnd() {
  currentPlyIndex.value = totalPlies.value;
  emit('replay-step', totalPlies.value);
  emit('replay-end');
  emit('replayEnd');
}

function handleNext() {
  emit('next');
  emit('nextPuzzle');
}

function handleReplay() {
  emit('replay');
  emit('retry');
}

// Keyboard shortcuts for inspect & replay stepping
function handleKeyDown(e: KeyboardEvent) {
  if (!props.modelValue) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    toggleInspectBoard();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    handleStepPrev();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    handleStepNext();
  } else if (e.key === 'Home') {
    e.preventDefault();
    handleStepStart();
  } else if (e.key === 'End') {
    e.preventDefault();
    handleStepEnd();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  if (props.modelValue && !internalMinimized.value) {
    focusPrimaryCta();
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <div>
    <!-- Full Modal View (when not minimized) -->
    <BaseModal
      v-if="!isMinimized"
      :model-value="props.modelValue"
      size="md"
      title="🎉 Puzzle Solved! 🎉"
      data-testid="puzzle-completion-modal"
      @close="emit('update:modelValue', false)"
    >
      <div class="completion-modal-body">
        <!-- 3-Star Celebration Banner -->
        <div class="stars-cluster" aria-label="Stars Earned">
          <span
            class="star-item"
            :class="{ 'is-earned': props.stars >= 1, 'is-filled': props.stars >= 1 }"
            style="animation-delay: 100ms"
          >
            ⭐
          </span>
          <span
            class="star-item star-center"
            :class="{ 'is-earned': props.stars >= 2, 'is-filled': props.stars >= 2 }"
            style="animation-delay: 260ms"
          >
            ⭐
          </span>
          <span
            class="star-item"
            :class="{ 'is-earned': props.stars >= 3, 'is-filled': props.stars >= 3 }"
            style="animation-delay: 420ms"
          >
            ⭐
          </span>
        </div>

        <div class="star-rating-summary">
          ({{ props.stars }} / 3 Stars Earned!)
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
          <h4 v-if="props.puzzle" class="puzzle-solved-title">
            {{ props.puzzle.title }}
          </h4>
        </div>

        <!-- Coach's Tactical Breakdown Card -->
        <div class="coach-breakdown-card" data-testid="coach-breakdown-card">
          <h4 class="breakdown-card-title">
            <span>🎓</span>
            Coach's Tactical Breakdown
          </h4>
          <p class="breakdown-explanation-text" data-testid="coach-explanation-text">
            {{ coachExplanation }}
          </p>

          <!-- Mascot Persona Coaching Bubble -->
          <div class="mascot-coaching-box" data-testid="mascot-coaching-box">
            <div class="mascot-avatar-circle" aria-hidden="true">
              🐿️
            </div>
            <div class="mascot-quote-content">
              <span class="mascot-speaker-name">Sparky's Takeaway Rule:</span>
              <p class="mascot-quote-text" data-testid="mascot-takeaway-text">
                "{{ mascotTakeaway }}"
              </p>
            </div>
          </div>
        </div>

        <!-- Interactive Move Replay Controller -->
        <div
          v-if="totalPlies > 0"
          class="move-replay-controller"
          data-testid="move-replay-controller"
        >
          <div class="replay-step-info">
            <span class="step-counter-tag" data-testid="replay-step-counter">
              {{ currentPlyIndex === 0 ? 'Initial Position' : `Step ${currentPlyIndex} of ${totalPlies}` }}
            </span>
            <span v-if="currentStepSan" class="step-san-badge" data-testid="replay-step-san">
              {{ currentStepSan }}
            </span>
          </div>

          <div class="replay-btn-group">
            <button
              type="button"
              class="replay-control-btn"
              data-testid="replay-start-btn"
              aria-label="First Move"
              :disabled="currentPlyIndex <= 0"
              @click="handleStepStart"
            >
              ⏮
            </button>
            <button
              type="button"
              class="replay-control-btn"
              data-testid="replay-prev-btn"
              aria-label="Previous Move"
              :disabled="currentPlyIndex <= 0"
              @click="handleStepPrev"
            >
              ◀
            </button>
            <button
              type="button"
              class="replay-control-btn"
              data-testid="replay-next-btn"
              aria-label="Next Move"
              :disabled="currentPlyIndex >= totalPlies"
              @click="handleStepNext"
            >
              ▶
            </button>
            <button
              type="button"
              class="replay-control-btn"
              data-testid="replay-end-btn"
              aria-label="Final Move"
              :disabled="currentPlyIndex >= totalPlies"
              @click="handleStepEnd"
            >
              ⏭
            </button>
          </div>
        </div>

        <!-- Step Explanation in Replay UI -->
        <div
          v-if="totalPlies > 0 && currentStepExplanationText"
          class="replay-step-explanation-box"
          data-testid="replay-step-explanation"
        >
          <span class="explanation-icon">💡</span>
          <p class="explanation-text">{{ currentStepExplanationText }}</p>
        </div>

        <!-- Solve Metrics Pill Grid -->
        <div class="metrics-grid">
          <div v-if="props.ratingDelta !== null && props.ratingDelta !== undefined" class="metric-chip">
            <span class="metric-icon">📈</span>
            <div class="metric-content">
              <span class="metric-val text-success">+{{ props.ratingDelta }} Elo Points</span>
              <span class="metric-lbl">Kid Elo</span>
            </div>
          </div>

          <div class="metric-chip">
            <span class="metric-icon">⏱️</span>
            <div class="metric-content">
              <span class="metric-val">{{ props.solveTimeSeconds }}s</span>
              <span class="metric-lbl">Solve Time</span>
            </div>
          </div>

          <div class="metric-chip">
            <span class="metric-icon">💡</span>
            <div class="metric-content">
              <span class="metric-val">{{ props.hintsUsed }}</span>
              <span class="metric-lbl">Hints</span>
            </div>
          </div>

          <div class="metric-chip">
            <span class="metric-icon">🎯</span>
            <div class="metric-content">
              <span class="metric-val">{{ props.mistakesCount === 0 ? '100%' : 'Clean' }}</span>
              <span class="metric-lbl">Accuracy</span>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="completion-footer-buttons">
          <BaseButton
            variant="ghost"
            size="md"
            data-testid="inspect-board-btn"
            @click="toggleInspectBoard(true)"
          >
            <template #icon-left>👁️</template>
            Inspect Board
          </BaseButton>

          <BaseButton
            variant="ghost"
            size="md"
            data-testid="puzzle-retry-btn"
            @click="handleReplay"
          >
            <template #icon-left>🔄</template>
            Replay
          </BaseButton>

          <BaseButton
            v-if="props.hasNextPuzzle"
            ref="primaryCtaRef"
            variant="primary"
            size="md"
            data-testid="puzzle-next-btn"
            @click="handleNext"
          >
            <template #icon-left>🚀</template>
            Next Puzzle
          </BaseButton>

          <BaseButton
            v-else
            ref="primaryCtaRef"
            variant="success"
            size="md"
            data-testid="puzzle-hub-btn"
            @click="emit('backToHub')"
          >
            <template #icon-left>🧩</template>
            Back to Hub
          </BaseButton>
        </div>
      </template>
    </BaseModal>

    <!-- Minimized Dock Bar (when Inspect Board is active) -->
    <div
      v-if="isMinimized && props.modelValue"
      class="docked-inspect-bar"
      data-testid="docked-inspect-bar"
    >
      <div class="docked-left">
        <span class="docked-motif-title" data-testid="docked-motif-title">
          {{ motifInfo.icon }} {{ motifInfo.name }} ({{ materialGainInfo.text }})
        </span>
        <span
          v-if="currentStepExplanationText"
          class="docked-step-explanation"
          data-testid="docked-step-explanation"
        >
          {{ currentStepSan && currentStepSan !== 'Start' ? `${currentStepSan}: ` : '' }}{{ currentStepExplanationText }}
        </span>
      </div>

      <div v-if="totalPlies > 0" class="replay-btn-group">
        <button
          type="button"
          class="replay-control-btn"
          data-testid="docked-replay-start-btn"
          aria-label="First Move"
          :disabled="currentPlyIndex <= 0"
          @click="handleStepStart"
        >
          ⏮
        </button>
        <button
          type="button"
          class="replay-control-btn"
          data-testid="docked-replay-prev-btn"
          aria-label="Previous Move"
          :disabled="currentPlyIndex <= 0"
          @click="handleStepPrev"
        >
          ◀
        </button>
        <span class="step-counter-tag" data-testid="docked-step-counter">
          {{ currentPlyIndex === 0 ? `Start (0/${totalPlies})` : `${currentPlyIndex}/${totalPlies}` }}
        </span>
        <button
          type="button"
          class="replay-control-btn"
          data-testid="docked-replay-next-btn"
          aria-label="Next Move"
          :disabled="currentPlyIndex >= totalPlies"
          @click="handleStepNext"
        >
          ▶
        </button>
        <button
          type="button"
          class="replay-control-btn"
          data-testid="docked-replay-end-btn"
          aria-label="Final Move"
          :disabled="currentPlyIndex >= totalPlies"
          @click="handleStepEnd"
        >
          ⏭
        </button>
      </div>

      <div class="docked-actions">
        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="expand-modal-btn"
          @click="toggleInspectBoard(false)"
        >
          <template #icon-left>🔼</template>
          Coach Report
        </BaseButton>

        <BaseButton
          v-if="props.hasNextPuzzle"
          variant="primary"
          size="sm"
          data-testid="docked-next-btn"
          @click="handleNext"
        >
          <template #icon-left>🚀</template>
          Next
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.completion-modal-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3-5, 14px);
  padding: var(--space-1, 4px) 0;
  max-width: 540px;
  margin: 0 auto;
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

/* Coach Breakdown Card */
.coach-breakdown-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5, 10px);
  background: var(--bg-surface-raised, #f8fafc);
  border: 2px solid var(--border-medium, #cbd5e1);
  border-radius: var(--radius-xl, 22px);
  padding: var(--space-4, 16px);
  width: 100%;
  text-align: start;
  box-sizing: border-box;
}

.breakdown-card-title {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-section-h4, 16px);
  font-weight: 800;
  color: var(--color-primary, #6c5ce7);
  margin: 0;
}

.breakdown-explanation-text {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-base, 15px);
  font-weight: 500;
  color: var(--text-main, #0f172a);
  line-height: var(--leading-relaxed, 1.6);
  margin: 0;
}

/* Mascot Coaching Box */
.mascot-coaching-box {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3, 12px);
  background: var(--mascot-sparky-bg, hsl(20, 95%, 94%));
  border: 2px solid var(--mascot-sparky-border, hsl(18, 85%, 75%));
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-2-5, 10px) var(--space-3-5, 14px);
  margin-top: var(--space-1, 4px);
}

[data-theme='dark'] .mascot-coaching-box {
  background: var(--mascot-sparky-bg, hsl(18, 40%, 18%));
  border-color: var(--mascot-sparky-border, hsl(18, 50%, 35%));
}

.mascot-avatar-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-pill, 9999px);
  background: #ffffff;
  border: 2px solid var(--mascot-sparky-primary, #ea580c);
  font-size: 1.4rem;
  flex-shrink: 0;
}

.mascot-quote-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mascot-speaker-name {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 800;
  color: var(--mascot-sparky-primary, #ea580c);
}

.mascot-quote-text {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 600;
  color: var(--mascot-sparky-text, #431407);
  line-height: var(--leading-normal, 1.5);
  margin: 0;
}

[data-theme='dark'] .mascot-quote-text {
  color: var(--mascot-sparky-text, hsl(18, 85%, 90%));
}

/* Move Replay Controller */
.move-replay-controller {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  width: 100%;
  background: var(--bg-surface, #ffffff);
  border: 1.5px solid var(--border-medium, #cbd5e1);
  border-radius: var(--radius-pill, 9999px);
  padding: var(--space-1-5, 6px) var(--space-3, 12px);
  box-sizing: border-box;
}

.replay-step-info {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.step-counter-tag {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  color: var(--text-muted, #64748b);
}

.step-san-badge {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-sm, 13px);
  font-weight: 800;
  color: var(--color-primary, #6c5ce7);
  padding: 2px 8px;
  background: var(--color-primary-subtle, rgba(108, 92, 231, 0.12));
  border-radius: var(--radius-sm, 6px);
}

.replay-btn-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.replay-control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-pill, 9999px);
  border: 1px solid var(--border-subtle, #e2e8f0);
  background: var(--bg-surface-raised, #f8fafc);
  color: var(--text-main, #0f172a);
  cursor: pointer;
  font-size: 0.9rem;
  transition: transform var(--duration-fast, 140ms) ease,
              background-color var(--duration-fast, 140ms) ease,
              border-color var(--duration-fast, 140ms) ease,
              color var(--duration-fast, 140ms) ease;
}

.replay-control-btn:hover:not(:disabled) {
  background: var(--color-primary-subtle, rgba(108, 92, 231, 0.12));
  border-color: var(--color-primary, #6c5ce7);
  color: var(--color-primary, #6c5ce7);
  transform: scale(1.08);
}

.replay-control-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.replay-step-explanation-box {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2, 8px);
  width: 100%;
  background: var(--bg-surface-raised, #f8fafc);
  border: 1.5px solid var(--color-primary-subtle, rgba(108, 92, 231, 0.25));
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  box-sizing: border-box;
  text-align: start;
}

.explanation-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.explanation-text {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-sm, 13px);
  font-weight: 600;
  color: var(--text-main, #0f172a);
  line-height: var(--leading-normal, 1.4);
  margin: 0;
}

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

.completion-footer-buttons {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  width: 100%;
  flex-wrap: wrap;
}

/* Docked Bottom Inspection Bar (When Modal is Minimized) */
.docked-inspect-bar {
  position: fixed;
  bottom: max(20px, calc(16px + env(safe-area-inset-bottom, 0px)));
  inset-inline-start: 50%;
  transform: translateX(-50%);
  z-index: var(--z-minimized-dock, 35);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  padding: var(--space-2, 8px) var(--space-4, 16px);
  background: var(--bg-surface-glass, rgba(255, 255, 255, 0.94));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 2px solid var(--color-primary, #6c5ce7);
  border-radius: var(--radius-pill, 9999px);
  box-shadow: 0 10px 30px rgba(108, 92, 231, 0.35);
  animation: dock-slide-up 320ms var(--ease-spring);
  max-width: 95vw;
  box-sizing: border-box;
}

.docked-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  max-width: 320px;
}

.docked-motif-title {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 800;
  color: var(--text-main, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.docked-step-explanation {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 600;
  color: var(--color-primary, #6c5ce7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.docked-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
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

@keyframes dock-slide-up {
  0% { transform: translate(-50%, 30px) scale(0.9); opacity: 0; }
  100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
}
</style>

