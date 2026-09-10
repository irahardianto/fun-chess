import { ref, readonly, onScopeDispose, onUnmounted, getCurrentScope, getCurrentInstance } from 'vue';
import type { IClock } from '@fun-chess/shared';
import { SystemClock } from '@fun-chess/shared';
import { calculateTimeTick } from '../engine/rush_engine';

export interface UsePuzzleRushTimerOptions {
  initialDurationSeconds?: number;
  clock?: IClock;
  onExpire?: () => void;
}

/**
 * Sub-composable managing countdown intervals, time bonus additions,
 * and tracked timeouts for puzzle rush runs (MAJ-012, MAJ-021).
 */
export function usePuzzleRushTimer(options: UsePuzzleRushTimerOptions = {}) {
  const clock = options.clock ?? new SystemClock();
  const initialDuration = options.initialDurationSeconds ?? 180;

  const timeRemainingSeconds = ref<number>(initialDuration);
  const isTimerRunning = ref<boolean>(false);
  const lastTimeBonus = ref<number>(0);

  let timerInterval: ReturnType<typeof setInterval> | null = null;
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  function clearTimer(): void {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isTimerRunning.value = false;
  }

  function clearAllTimers(): void {
    clearTimer();
    for (const timer of pendingTimers) {
      clearTimeout(timer);
    }
    pendingTimers.clear();
  }

  function setTrackedTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      fn();
    }, ms);
    pendingTimers.add(timer);
    return timer;
  }

  function startTimer(durationSeconds: number = initialDuration): void {
    clearAllTimers();
    timeRemainingSeconds.value = durationSeconds;
    lastTimeBonus.value = 0;
    isTimerRunning.value = true;

    timerInterval = setInterval(() => {
      const tick = calculateTimeTick(timeRemainingSeconds.value, 1);
      timeRemainingSeconds.value = tick.timeRemainingSeconds;
      if (tick.isExpired) {
        clearTimer();
        options.onExpire?.();
      }
    }, 1000);
  }

  function addTimeBonus(bonusSeconds: number): void {
    lastTimeBonus.value = bonusSeconds;
    if (bonusSeconds > 0) {
      timeRemainingSeconds.value += bonusSeconds;
    }
  }

  function resetTimer(durationSeconds: number = initialDuration): void {
    clearAllTimers();
    timeRemainingSeconds.value = durationSeconds;
    lastTimeBonus.value = 0;
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearAllTimers();
    });
  } else if (getCurrentInstance()) {
    onUnmounted(() => {
      clearAllTimers();
    });
  }

  return {
    clock,
    timeRemainingSeconds: readonly(timeRemainingSeconds),
    isTimerRunning: readonly(isTimerRunning),
    lastTimeBonus: readonly(lastTimeBonus),
    startTimer,
    stopTimer: clearTimer,
    resetTimer,
    addTimeBonus,
    clearAllTimers,
    setTrackedTimeout,
  };
}

export type UsePuzzleRushTimerReturn = ReturnType<typeof usePuzzleRushTimer>;
