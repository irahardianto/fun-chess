import { ref, type Ref, type ComputedRef } from 'vue';
import type { Square, TutorialStep } from '@fun-chess/shared';

export interface UseScenarioHintsOptions {
  currentStep?: Ref<TutorialStep | null> | ComputedRef<TutorialStep | null>;
}

/**
 * Sub-composable managing scenario hints, visual square highlights, and auto-hint triggering (MAJ-030).
 */
export function useScenarioHints(options: UseScenarioHintsOptions = {}) {
  const hintsUsedCurrentAttempt = ref<number>(0);
  const activeHint = ref<string | null>(null);
  const hintGlowSquare = ref<Square | null>(null);
  const hintTargetSquare = ref<Square | null>(null);

  /**
   * Reveals a pedagogical hint for the step and determines target/source glow squares.
   */
  function revealHint(stepOverride?: TutorialStep | null): void {
    const step = stepOverride ?? options.currentStep?.value;
    if (!step) return;

    hintsUsedCurrentAttempt.value++;
    activeHint.value = step.hint;

    if (step.allowedMoves && step.allowedMoves.length > 0) {
      const firstMove = step.allowedMoves[0];
      hintGlowSquare.value = firstMove?.from ?? null;
      hintTargetSquare.value = firstMove?.to ?? null;
    } else if (step.highlightSquares && step.highlightSquares.length > 0) {
      hintGlowSquare.value = step.highlightSquares[0] ?? null;
      hintTargetSquare.value = step.highlightSquares[1] ?? null;
    }
  }

  /**
   * Resets active visual hints when moving to a new step or resetting the current step.
   */
  function resetStepHints(): void {
    activeHint.value = null;
    hintGlowSquare.value = null;
    hintTargetSquare.value = null;
  }

  /**
   * Resets all hints including attempt count (e.g. when loading a new scenario).
   */
  function resetAllHints(): void {
    resetStepHints();
    hintsUsedCurrentAttempt.value = 0;
  }

  /**
   * Checks if mistakes threshold is met (>= 2) to trigger auto-hint reveal.
   */
  function checkAutoHint(mistakesCount: number, stepOverride?: TutorialStep | null): void {
    if (mistakesCount >= 2 && !activeHint.value) {
      revealHint(stepOverride);
    }
  }

  return {
    hintsUsedCurrentAttempt,
    activeHint,
    hintGlowSquare,
    hintTargetSquare,
    revealHint,
    resetStepHints,
    resetAllHints,
    checkAutoHint,
  };
}
