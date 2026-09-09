import { ref, computed, onUnmounted, getCurrentInstance, onScopeDispose, getCurrentScope } from 'vue';
import type { PieceColor, TutorialStep, ChessScenario } from '@fun-chess/shared';

export interface ScenarioStepOutcomeEvent {
  type: 'scenario_step_completed';
  starsAwarded: number;
  isLessonComplete: boolean;
}

export interface UseScenarioStepNavigationOptions {
  scenario?: ChessScenario | null;
  onStepOutcome?: (event: ScenarioStepOutcomeEvent) => void;
  onStepLoaded?: (step: TutorialStep, stepIdx: number) => void;
  getStarsAwarded?: () => number;
  syncEngineFen?: (fen: string) => string | void;
}

/**
 * Sub-composable managing scenario step progression, loading, and navigation (MAJ-030).
 */
export function useScenarioStepNavigation(options: UseScenarioStepNavigationOptions = {}) {
  const initialScenario = options.scenario ?? null;

  const scenario = ref<ChessScenario | null>(initialScenario);
  const currentStepIndex = ref<number>(0);
  const currentFen = ref<string>(
    initialScenario?.steps[0]?.setupFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  );
  const isCompleted = ref<boolean>(false);
  const lastStepOutcome = ref<ScenarioStepOutcomeEvent | null>(null);

  let nextStepTimer: ReturnType<typeof setTimeout> | null = null;

  const totalSteps = computed(() => scenario.value?.steps.length ?? 0);

  const currentStep = computed<TutorialStep | null>(() => {
    if (!scenario.value || scenario.value.steps.length === 0) return null;
    return scenario.value.steps[currentStepIndex.value] ?? null;
  });

  const playerColor = computed<PieceColor>(() => {
    return currentStep.value?.playerColor ?? 'w';
  });

  function clearNavigationTimers(): void {
    if (nextStepTimer) {
      clearTimeout(nextStepTimer);
      nextStepTimer = null;
    }
  }

  /**
   * Loads a specific step by index within the active scenario.
   */
  function loadStep(stepIdx: number): void {
    clearNavigationTimers();
    if (!scenario.value || stepIdx < 0 || stepIdx >= scenario.value.steps.length) {
      return;
    }

    currentStepIndex.value = stepIdx;
    const step = scenario.value.steps[stepIdx];
    if (!step) return;

    const syncedFen = options.syncEngineFen?.(step.setupFen);
    currentFen.value = typeof syncedFen === 'string' ? syncedFen : step.setupFen;
    options.onStepLoaded?.(step, stepIdx);
  }

  /**
   * Loads a new scenario and initializes to the specified step (default: 0).
   */
  function loadScenario(newScenario: ChessScenario, initialStepIdx = 0): void {
    clearNavigationTimers();
    scenario.value = newScenario;
    isCompleted.value = false;
    lastStepOutcome.value = null;
    loadStep(initialStepIdx);
  }

  /**
   * Resets the current step back to its initial setup FEN.
   */
  function resetCurrentStep(): void {
    loadStep(currentStepIndex.value);
  }

  /**
   * Advances directly to the next step or marks scenario complete if on the last step.
   */
  function nextStep(): void {
    if (currentStepIndex.value + 1 < totalSteps.value) {
      loadStep(currentStepIndex.value + 1);
    } else {
      isCompleted.value = true;
    }
  }

  /**
   * Schedules advancing to the next step or marks the scenario complete after the transition delay.
   */
  function advanceOrCompleteStep(delayMs = 700): void {
    const isLastStep = currentStepIndex.value + 1 >= totalSteps.value;

    clearNavigationTimers();
    nextStepTimer = setTimeout(() => {
      nextStepTimer = null;
      const stars = options.getStarsAwarded ? options.getStarsAwarded() : 3;

      if (isLastStep) {
        isCompleted.value = true;
        const outcome: ScenarioStepOutcomeEvent = {
          type: 'scenario_step_completed',
          starsAwarded: stars,
          isLessonComplete: true,
        };
        lastStepOutcome.value = outcome;
        options.onStepOutcome?.(outcome);
      } else {
        const outcome: ScenarioStepOutcomeEvent = {
          type: 'scenario_step_completed',
          starsAwarded: stars,
          isLessonComplete: false,
        };
        lastStepOutcome.value = outcome;
        options.onStepOutcome?.(outcome);
        loadStep(currentStepIndex.value + 1);
      }
    }, delayMs);
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearNavigationTimers();
    });
  } else if (getCurrentInstance()) {
    onUnmounted(() => {
      clearNavigationTimers();
    });
  }

  if (initialScenario) {
    loadStep(0);
  }

  return {
    scenario,
    currentStepIndex,
    currentFen,
    isCompleted,
    lastStepOutcome,
    totalSteps,
    currentStep,
    playerColor,
    loadStep,
    loadScenario,
    resetCurrentStep,
    nextStep,
    advanceOrCompleteStep,
    clearNavigationTimers,
  };
}
