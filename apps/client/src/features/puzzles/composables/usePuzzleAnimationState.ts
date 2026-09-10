import { ref, readonly, onUnmounted, onScopeDispose, getCurrentScope, getCurrentInstance } from 'vue';

export interface UsePuzzleAnimationStateOptions {
  shakeDurationMs?: number;
  botReplyDelayMs?: number;
}

/**
 * Sub-composable managing visual vibration (shake on error) and bot turn delays (MAJ-021).
 */
export function usePuzzleAnimationState(options: UsePuzzleAnimationStateOptions = {}) {
  const isShaking = ref<boolean>(false);
  const isWaitingForBot = ref<boolean>(false);

  let shakeTimer: ReturnType<typeof setTimeout> | null = null;
  let botTimer: ReturnType<typeof setTimeout> | null = null;

  function clearShakeTimer(): void {
    if (shakeTimer) {
      clearTimeout(shakeTimer);
      shakeTimer = null;
    }
  }

  function clearBotTimer(): void {
    if (botTimer) {
      clearTimeout(botTimer);
      botTimer = null;
    }
  }

  function clearAnimationTimers(): void {
    clearShakeTimer();
    clearBotTimer();
  }

  function triggerShake(durationMs = options.shakeDurationMs ?? 400): void {
    clearShakeTimer();
    isShaking.value = true;
    shakeTimer = setTimeout(() => {
      isShaking.value = false;
      shakeTimer = null;
    }, durationMs);
  }

  function scheduleBotReply(callback: () => void, delayMs = options.botReplyDelayMs ?? 450): void {
    clearBotTimer();
    isWaitingForBot.value = true;
    botTimer = setTimeout(() => {
      botTimer = null;
      isWaitingForBot.value = false;
      callback();
    }, delayMs);
  }

  function resetAnimationState(): void {
    clearAnimationTimers();
    isShaking.value = false;
    isWaitingForBot.value = false;
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearAnimationTimers();
    });
  } else if (getCurrentInstance()) {
    onUnmounted(() => {
      clearAnimationTimers();
    });
  }

  return {
    isShaking: readonly(isShaking),
    isWaitingForBot: readonly(isWaitingForBot),
    triggerShake,
    scheduleBotReply,
    clearAnimationTimers,
    clearShakeTimer,
    clearBotTimer,
    resetAnimationState,
  };
}

export type UsePuzzleAnimationStateReturn = ReturnType<typeof usePuzzleAnimationState>;
