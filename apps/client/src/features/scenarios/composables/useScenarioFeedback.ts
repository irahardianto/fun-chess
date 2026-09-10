import { ref, readonly, onUnmounted, onScopeDispose, getCurrentScope, getCurrentInstance } from 'vue';

export interface UseScenarioFeedbackOptions {
  shakeDurationMs?: number;
}

/**
 * Sub-composable managing attempt counters, visual shake vibrations,
 * and user feedback messages for scenario tutorials (MAJ-021).
 */
export function useScenarioFeedback(options: UseScenarioFeedbackOptions = {}) {
  const mistakesCurrentAttempt = ref<number>(0);
  const feedbackMessage = ref<string | null>(null);
  const isStepSuccess = ref<boolean>(false);
  const isShaking = ref<boolean>(false);
  const lastMove = ref<{ from: string; to: string } | null>(null);

  let shakeTimer: ReturnType<typeof setTimeout> | null = null;

  function clearShakeTimer(): void {
    if (shakeTimer) {
      clearTimeout(shakeTimer);
      shakeTimer = null;
    }
  }

  function triggerShake(durationMs = options.shakeDurationMs ?? 400): void {
    clearShakeTimer();
    isShaking.value = true;
    shakeTimer = setTimeout(() => {
      isShaking.value = false;
      shakeTimer = null;
    }, durationMs);
  }

  function recordMistake(message = 'Not quite! Look for the goal square or tap 💡 Hint for a clue.'): void {
    mistakesCurrentAttempt.value++;
    feedbackMessage.value = message;
    isStepSuccess.value = false;
    triggerShake();
  }

  function recordSuccess(
    move: { from: string; to: string },
    message: string
  ): void {
    lastMove.value = move;
    isStepSuccess.value = true;
    feedbackMessage.value = message;
    isShaking.value = false;
    clearShakeTimer();
  }

  function resetStepFeedback(): void {
    feedbackMessage.value = null;
    isStepSuccess.value = false;
    isShaking.value = false;
    lastMove.value = null;
    clearShakeTimer();
  }

  function resetAttempt(): void {
    mistakesCurrentAttempt.value = 0;
    resetStepFeedback();
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearShakeTimer();
    });
  } else if (getCurrentInstance()) {
    onUnmounted(() => {
      clearShakeTimer();
    });
  }

  return {
    mistakesCurrentAttempt: readonly(mistakesCurrentAttempt),
    feedbackMessage: readonly(feedbackMessage),
    isStepSuccess: readonly(isStepSuccess),
    isShaking: readonly(isShaking),
    lastMove: readonly(lastMove),
    setLastMove: (m: { from: string; to: string } | null) => {
      lastMove.value = m;
    },
    setFeedbackMessage: (msg: string | null) => {
      feedbackMessage.value = msg;
    },
    setIsStepSuccess: (val: boolean) => {
      isStepSuccess.value = val;
    },
    recordMistake,
    recordSuccess,
    triggerShake,
    clearShakeTimer,
    resetStepFeedback,
    resetAttempt,
  };
}

export type UseScenarioFeedbackReturn = ReturnType<typeof useScenarioFeedback>;
