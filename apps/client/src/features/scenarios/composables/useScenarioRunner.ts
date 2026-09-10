import { computed, readonly, getCurrentInstance } from 'vue';
import type {
  ChessScenario,
  StarRating,
} from '@fun-chess/shared';
import { createSafeChess, safeLoadFen } from '@fun-chess/shared';
import { calculateStars, calculateAccuracy } from '../engine/star_calculator';
import { useInjectLogger } from '@/platform/di';
import { logger as defaultLogger, type ILogger } from '@/platform/telemetry';
import {
  useScenarioStepNavigation,
  type ScenarioStepOutcomeEvent,
} from './useScenarioStepNavigation';
import { useScenarioBot } from './useScenarioBot';
import { useScenarioHints } from './useScenarioHints';
import { useScenarioFeedback } from './useScenarioFeedback';
import { useScenarioMoveExecution } from './useScenarioMoveExecution';

export type { ScenarioStepOutcomeEvent };
export * from './useScenarioMoveExecution';

export interface UseScenarioRunnerOptions {
  scenario?: ChessScenario | null;
  logger?: ILogger;
  onStepOutcome?: (event: ScenarioStepOutcomeEvent) => void;
}

/**
 * Orchestrator composable for interactive chess tutorial scenarios (MAJ-021, MAJ-026, MAJ-030).
 * Composes useScenarioStepNavigation, useScenarioBot, useScenarioHints, useScenarioFeedback,
 * and useScenarioMoveExecution (which encapsulates board selection and move validation).
 */
export function useScenarioRunner(options?: UseScenarioRunnerOptions | ChessScenario) {
  const optionsObj: UseScenarioRunnerOptions =
    options && 'steps' in options
      ? { scenario: options }
      : options ?? {};

  const logger = optionsObj.logger ?? (getCurrentInstance() ? useInjectLogger() : defaultLogger);

  const initialScenario = optionsObj.scenario ?? null;
  const initialFenStr =
    initialScenario?.steps[0]?.setupFen ??
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Internal chess.js engine instance
  const chess = createSafeChess(initialFenStr);

  // 1. Feedback & UI Animation Sub-Composable (MAJ-021)
  const feedback = useScenarioFeedback();

  function syncEngineFen(fenStr: string): string {
    try {
      safeLoadFen(chess, fenStr);
      return chess.fen();
    } catch (err) {
      logger.warn('Failed to load FEN into engine, using fallback string', {
        operation: 'scenario_sync_fen',
        fen: fenStr,
        error: err instanceof Error ? err.message : String(err),
      });
      return fenStr;
    }
  }

  // 2. Hints Sub-Composable (MAJ-030)
  const hints = useScenarioHints({
    currentStep: computed(() => nav.currentStep.value),
  });

  let clearBoardSelection = () => {};

  // 3. Navigation Sub-Composable (MAJ-030)
  const nav = useScenarioStepNavigation({
    scenario: initialScenario,
    onStepOutcome: (event) => optionsObj.onStepOutcome?.(event),
    onStepLoaded: () => {
      hints.resetStepHints();
      feedback.resetStepFeedback();
      clearBoardSelection();
    },
    getStarsAwarded: () => calculatedStars.value,
    syncEngineFen,
  });

  // 4. Bot Counter-Move Sub-Composable (MAJ-030)
  const bot = useScenarioBot({
    chess,
    logger,
    onBotMoveSuccess: (move, fen) => {
      nav.currentFen.value = fen;
      feedback.setLastMove(move);
    },
    onBotMoveComplete: (success) => {
      if (success) {
        nav.advanceOrCompleteStep();
      }
    },
  });

  // 5. Move Execution Sub-Composable (MAJ-026)
  const moveExec = useScenarioMoveExecution({
    chess,
    nav,
    bot,
    feedback,
    hints,
    logger,
  });

  clearBoardSelection = () => {
    moveExec.boardSelection.clearSelection();
  };

  // Derived Performance Metrics
  const calculatedStars = computed<StarRating>(() => {
    return calculateStars(hints.hintsUsedCurrentAttempt.value, feedback.mistakesCurrentAttempt.value);
  });

  const accuracy = computed<number>(() => {
    return calculateAccuracy(nav.totalSteps.value, feedback.mistakesCurrentAttempt.value);
  });

  const isMyTurn = computed<boolean>(() => {
    if (bot.isWaitingForBotResponse.value || nav.isCompleted.value) return false;
    return true;
  });

  function loadScenario(newScenario: ChessScenario, initialStepIdx = 0): void {
    bot.clearBotTimers();
    feedback.resetAttempt();
    hints.resetAllHints();
    nav.loadScenario(newScenario, initialStepIdx);
  }

  return {
    scenario: readonly(nav.scenario),
    currentStepIndex: readonly(nav.currentStepIndex),
    currentStep: nav.currentStep,
    currentFen: readonly(nav.currentFen),
    playerColor: nav.playerColor,
    isMyTurn,
    totalSteps: nav.totalSteps,
    isCompleted: readonly(nav.isCompleted),
    hintsUsedCurrentAttempt: readonly(hints.hintsUsedCurrentAttempt),
    mistakesCurrentAttempt: feedback.mistakesCurrentAttempt,
    activeHint: readonly(hints.activeHint),
    hintGlowSquare: readonly(hints.hintGlowSquare),
    hintTargetSquare: readonly(hints.hintTargetSquare),
    isWaitingForBotResponse: readonly(bot.isWaitingForBotResponse),
    feedbackMessage: feedback.feedbackMessage,
    isStepSuccess: feedback.isStepSuccess,
    isShaking: feedback.isShaking,
    calculatedStars,
    accuracy,
    lastStepOutcome: readonly(nav.lastStepOutcome),
    selectedSquare: computed(() => moveExec.boardSelection.selectedSquare.value),
    legalMoves: computed(() => moveExec.boardSelection.legalMovesForSelected.value),
    lastMove: feedback.lastMove,
    pendingPromotion: computed(() => moveExec.boardSelection.pendingPromotion.value),
    feedback,
    loadScenario,
    loadStep: nav.loadStep,
    selectSquare: moveExec.selectSquare,
    applyPlayerMove: moveExec.applyPlayerMove,
    completePromotion: moveExec.completePromotion,
    cancelPromotion: moveExec.cancelPromotion,
    revealHint: hints.revealHint,
    resetCurrentStep: nav.resetCurrentStep,
    nextStep: nav.nextStep,
  };
}

export type UseScenarioRunnerReturn = ReturnType<typeof useScenarioRunner>;
