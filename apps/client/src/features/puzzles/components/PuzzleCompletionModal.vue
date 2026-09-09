<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, type ComponentPublicInstance } from 'vue';
import type { StarRating, Puzzle, PuzzleAttemptResult, PuzzleAnalysisResult } from '@fun-chess/shared';
import { BaseModal, BaseButton } from '@/components/base';
import { useConfetti } from '@/composables';
import {
  PuzzleCelebrationHeader,
  PuzzleCoachBreakdown,
  PuzzleReplayToolbar,
  PuzzleStatsDisplay,
  PuzzleDockedBar,
} from './completion/index.js';

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
  close: [];
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

function handleModalClose() {
  emit('update:modelValue', false);
  emit('close');
}

function handleModalUpdateModelValue(val: boolean) {
  emit('update:modelValue', val);
  if (!val) {
    emit('close');
  }
}
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
      @close="handleModalClose"
      @update:model-value="handleModalUpdateModelValue"
    >
      <div class="completion-modal-body">
        <PuzzleCelebrationHeader
          :stars="props.stars"
          :puzzle="props.puzzle"
          :praise-heading="praiseHeading"
          :motif-info="motifInfo"
          :material-gain-info="materialGainInfo"
        />

        <PuzzleCoachBreakdown
          :coach-explanation="coachExplanation"
          :mascot-takeaway="mascotTakeaway"
        />

        <PuzzleReplayToolbar
          :total-plies="totalPlies"
          :current-ply-index="currentPlyIndex"
          :current-step-san="currentStepSan"
          :current-step-explanation-text="currentStepExplanationText"
          @step-start="handleStepStart"
          @step-prev="handleStepPrev"
          @step-next="handleStepNext"
          @step-end="handleStepEnd"
        />

        <PuzzleStatsDisplay
          :rating-delta="props.ratingDelta"
          :solve-time-seconds="props.solveTimeSeconds"
          :hints-used="props.hintsUsed"
          :mistakes-count="props.mistakesCount"
        />
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
    <PuzzleDockedBar
      v-if="isMinimized && props.modelValue"
      :motif-info="motifInfo"
      :material-gain-info="materialGainInfo"
      :current-step-san="currentStepSan"
      :current-step-explanation-text="currentStepExplanationText"
      :total-plies="totalPlies"
      :current-ply-index="currentPlyIndex"
      :has-next-puzzle="props.hasNextPuzzle"
      @step-start="handleStepStart"
      @step-prev="handleStepPrev"
      @step-next="handleStepNext"
      @step-end="handleStepEnd"
      @expand="toggleInspectBoard(false)"
      @next="handleNext"
    />
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

.completion-footer-buttons {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  width: 100%;
  flex-wrap: wrap;
}
</style>
