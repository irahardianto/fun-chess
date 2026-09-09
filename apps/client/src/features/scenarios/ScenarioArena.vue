<script setup lang="ts">
import { watch, ref, computed } from 'vue';
import type { ChessScenario, StarRating, Square } from '@fun-chess/shared';
import { ChessBoard } from '@/features/board';
import { PromotionModal } from '@/features/modals';
import BaseButton from '../../components/base/BaseButton.vue';
import ScenarioGuideOverlay from './components/ScenarioGuideOverlay.vue';
import ScenarioCompletionModal from './components/ScenarioCompletionModal.vue';
import { ProgressiveHintLayer } from '@/features/puzzles';
import { useScenarioRunner, type ScenarioStepOutcomeEvent } from './composables/useScenarioRunner';
import { useScenarioProgress } from './composables/useScenarioProgress';
import { getNextScenario } from './data';
import { useAudio } from '../../composables/useAudio';
import { logger } from '@/platform/telemetry';

interface Props {
  scenario: ChessScenario;
  nextScenario?: ChessScenario | null;
}

const props = withDefaults(defineProps<Props>(), {
  nextScenario: null,
});

const emit = defineEmits<{
  back: [];
  completed: [stars: StarRating];
  nextLesson: [scenario: ChessScenario];
}>();

const audio = useAudio();

function handleStepOutcome(event: ScenarioStepOutcomeEvent) {
  if (event.isLessonComplete) {
    audio.playVictory();
  } else {
    audio.playStepComplete();
  }
}

const runner = useScenarioRunner({
  scenario: props.scenario,
  onStepOutcome: handleStepOutcome,
});
const progress = useScenarioProgress();

const isPromotionModalOpen = ref<boolean>(false);
const promotionPendingMove = ref<{ from: Square; to: Square } | null>(null);

// Watch for scenario prop changes
watch(
  () => props.scenario,
  (newScenario) => {
    if (newScenario) {
      runner.loadScenario(newScenario);
    }
  }
);

// Auto-persist progress when scenario is completed
watch(
  () => runner.isCompleted.value,
  (completed) => {
    if (completed && props.scenario) {
      const stars = runner.calculatedStars.value;
      const hints = runner.hintsUsedCurrentAttempt.value;
      progress.saveProgress(props.scenario.id, stars, hints).catch((err: unknown) => {
        logger.warn('Failed to auto-save scenario progress on completion', {
          operation: 'scenario_auto_save_progress',
          scenarioId: props.scenario?.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      emit('completed', stars);
    }
  }
);

const resolvedNextScenario = computed<ChessScenario | null>(() => {
  if (props.nextScenario) return props.nextScenario;
  return getNextScenario(props.scenario.id);
});

const progressiveHintLevel = computed<0 | 1 | 2 | 3>(() => {
  if (!runner.activeHint.value) return 0;
  if (runner.hintGlowSquare.value && runner.hintTargetSquare.value) return 3;
  if (runner.hintGlowSquare.value) return 1;
  return 0;
});

function handleBoardMove(move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) {
  runner.applyPlayerMove(move);
}

function handlePromotionRequired(payload: { from: Square; to: Square }) {
  promotionPendingMove.value = payload;
  isPromotionModalOpen.value = true;
}

function handlePromotionSelect(piece: 'q' | 'r' | 'b' | 'n') {
  isPromotionModalOpen.value = false;
  if (promotionPendingMove.value) {
    runner.applyPlayerMove({
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
  runner.cancelPromotion();
}

function handleRetry() {
  runner.loadScenario(props.scenario);
}

function handleNextLesson() {
  if (resolvedNextScenario.value) {
    emit('nextLesson', resolvedNextScenario.value);
  } else {
    emit('back');
  }
}
</script>

<template>
  <div class="scenario-arena-layout">
    <!-- Top Navigation Header -->
    <header class="arena-top-header">
      <div class="header-left">
        <BaseButton
          variant="ghost"
          size="sm"
          aria-label="Return to Academy"
          @click="emit('back')"
        >
          <template #icon-left>⬅️</template>
          Return to Academy
        </BaseButton>

        <div class="scenario-header-title-group">
          <span class="scenario-icon-sm" aria-hidden="true">{{ scenario.icon }}</span>
          <h1 class="scenario-header-title">{{ scenario.title }}</h1>
        </div>
      </div>

      <div class="header-right">
        <span class="arena-difficulty-tag">
          {{ scenario.difficulty }}
        </span>
      </div>
    </header>

    <!-- Main Game Arena Content -->
    <div class="arena-main-content">
      <!-- Step Guide Banner & Helper Overlay -->
      <div v-if="runner.currentStep.value" class="arena-guide-slot">
        <ScenarioGuideOverlay
          :step="runner.currentStep.value"
          :current-step-index="runner.currentStepIndex.value"
          :total-steps="runner.totalSteps.value"
          :active-hint="runner.activeHint.value"
          :feedback-message="runner.feedbackMessage.value"
          :is-step-success="runner.isStepSuccess.value"
          :is-shaking="runner.isShaking.value"
          :is-waiting-for-bot="runner.isWaitingForBotResponse.value"
          :hints-used="runner.hintsUsedCurrentAttempt.value"
          @ask-hint="runner.revealHint"
          @reset-step="runner.resetCurrentStep"
        />
      </div>

      <!-- Chessboard Container with Progressive Hint Overlay -->
      <div class="arena-board-slot">
        <div class="scenario-board-relative-frame">
          <ProgressiveHintLayer
            :hint-level="progressiveHintLevel"
            :source-square="runner.hintGlowSquare.value"
            :target-square="runner.hintTargetSquare.value"
            :orientation="runner.playerColor.value"
            :fen="runner.currentFen.value"
            :show-controls="false"
          >
            <ChessBoard
              :fen="runner.currentFen.value"
              :orientation="runner.playerColor.value"
              :turn="runner.playerColor.value"
              :my-color="runner.playerColor.value"
              :selected-square="runner.selectedSquare.value"
              :legal-moves="[...runner.legalMoves.value]"
              :last-move="runner.lastMove.value"
              :interactive="!runner.isWaitingForBotResponse.value && !runner.isCompleted.value"
              @select="runner.selectSquare"
              @move="handleBoardMove"
              @promotion-required="handlePromotionRequired"
            />
          </ProgressiveHintLayer>
        </div>
      </div>
    </div>

    <!-- Promotion Picker Modal -->
    <PromotionModal
      v-model="isPromotionModalOpen"
      :color="runner.playerColor.value"
      @select="handlePromotionSelect"
      @cancel="handlePromotionCancel"
    />

    <!-- Scenario Completion Modal -->
    <ScenarioCompletionModal
      :model-value="runner.isCompleted.value"
      :scenario="scenario"
      :stars="runner.calculatedStars.value"
      :accuracy="runner.accuracy.value"
      :hints-used="runner.hintsUsedCurrentAttempt.value"
      :has-next-lesson="!!resolvedNextScenario"
      @retry="handleRetry"
      @next-lesson="handleNextLesson"
      @back-to-academy="emit('back')"
    />
  </div>
</template>

<style scoped>
.scenario-arena-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
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
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
  gap: var(--space-3);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.scenario-header-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.scenario-icon-sm {
  font-size: 1.5rem;
  line-height: 1;
}

.scenario-header-title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  margin: 0;
  line-height: var(--leading-tight);
}

.arena-difficulty-tag {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--bg-surface-raised);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  text-transform: capitalize;
}

/* MAIN ARENA */
.arena-main-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
}

.arena-guide-slot {
  width: 100%;
  max-width: 580px;
}

.arena-board-slot {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}

.scenario-board-relative-frame {
  position: relative;
  width: 100%;
  max-width: 580px;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
