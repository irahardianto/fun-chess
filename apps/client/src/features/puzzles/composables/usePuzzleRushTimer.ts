import {
  ref,
  readonly,
  onScopeDispose,
  onUnmounted,
  getCurrentScope,
  getCurrentInstance,
  hasInjectionContext,
  inject,
  type InjectionKey,
} from 'vue';
import type { IClock, ITimerService, TimerHandle } from '@fun-chess/shared';
import { SystemClock } from '@fun-chess/shared';
import { calculateTimeTick } from '../engine/rush_engine';

export type { ITimerService, TimerHandle };

/**
 * Production timer service delegating to browser window timer APIs.
 */
export class SystemTimerService implements ITimerService {
  setInterval(callback: () => void | Promise<void>, intervalMs: number): TimerHandle {
    const timerId = setInterval(() => {
      void callback();
    }, intervalMs);
    return {
      id: timerId,
      unref: () => {
        clearInterval(timerId);
      },
    };
  }

  clearInterval(handle: TimerHandle | unknown): void {
    if (handle && typeof handle === 'object' && 'id' in handle) {
      clearInterval((handle as { id: unknown }).id as number);
    } else {
      clearInterval(handle as number);
    }
  }

  setTimeout(callback: () => void | Promise<void>, delayMs: number): TimerHandle {
    const timerId = setTimeout(() => {
      void callback();
    }, delayMs);
    return {
      id: timerId,
      unref: () => {
        clearTimeout(timerId);
      },
    };
  }

  clearTimeout(handle: TimerHandle | unknown): void {
    if (handle && typeof handle === 'object' && 'id' in handle) {
      clearTimeout((handle as { id: unknown }).id as number);
    } else {
      clearTimeout(handle as number);
    }
  }
}

/**
 * Deterministic mock timer service for synchronous, clock-independent unit tests (MAJ-014).
 */
export class MockTimerService implements ITimerService {
  private nextId = 1;
  private intervals = new Map<number, { handler: () => void | Promise<void>; timeoutMs: number }>();
  private timeouts = new Map<number, { handler: () => void | Promise<void>; timeoutMs: number }>();

  setInterval(callback: () => void | Promise<void>, intervalMs: number): TimerHandle {
    const id = this.nextId++;
    this.intervals.set(id, { handler: callback, timeoutMs: intervalMs });
    return { id };
  }

  clearInterval(handle: TimerHandle | unknown): void {
    const id = this.extractHandleId(handle);
    if (id !== undefined) {
      this.intervals.delete(id);
    }
  }

  setTimeout(callback: () => void | Promise<void>, delayMs: number): TimerHandle {
    const id = this.nextId++;
    this.timeouts.set(id, { handler: callback, timeoutMs: delayMs });
    return { id };
  }

  clearTimeout(handle: TimerHandle | unknown): void {
    const id = this.extractHandleId(handle);
    if (id !== undefined) {
      this.timeouts.delete(id);
    }
  }

  private extractHandleId(handle: TimerHandle | unknown): number | undefined {
    if (typeof handle === 'number') return handle;
    if (handle && typeof handle === 'object' && 'id' in handle && typeof (handle as { id: unknown }).id === 'number') {
      return (handle as { id: number }).id;
    }
    return undefined;
  }

  tickInterval(handle?: TimerHandle | unknown): void {
    if (handle !== undefined) {
      const id = this.extractHandleId(handle);
      if (id !== undefined) {
        void this.intervals.get(id)?.handler();
      }
    } else {
      for (const entry of Array.from(this.intervals.values())) {
        void entry.handler();
      }
    }
  }

  flushTimeouts(): void {
    const pending = Array.from(this.timeouts.entries());
    this.timeouts.clear();
    for (const [, entry] of pending) {
      void entry.handler();
    }
  }

  reset(): void {
    this.intervals.clear();
    this.timeouts.clear();
  }
}

export const TIMER_SERVICE_KEY: InjectionKey<ITimerService> = Symbol('TIMER_SERVICE_KEY');

export interface UsePuzzleRushTimerOptions {
  initialDurationSeconds?: number;
  clock?: IClock;
  timerService?: ITimerService;
  onExpire?: () => void;
}

/**
 * Sub-composable managing countdown intervals, time bonus additions,
 * and tracked timeouts for puzzle rush runs (MAJ-012, MAJ-014, MAJ-021).
 */
export function usePuzzleRushTimer(options: UsePuzzleRushTimerOptions = {}) {
  const clock = options.clock ?? new SystemClock();
  const diTimerService = hasInjectionContext()
    ? inject(TIMER_SERVICE_KEY, null)
    : null;
  const timerService = options.timerService ?? diTimerService ?? new SystemTimerService();
  const initialDuration = options.initialDurationSeconds ?? 180;

  const timeRemainingSeconds = ref<number>(initialDuration);
  const isTimerRunning = ref<boolean>(false);
  const lastTimeBonus = ref<number>(0);

  let timerInterval: TimerHandle | null = null;
  const pendingTimers = new Set<TimerHandle>();

  function clearTimer(): void {
    if (timerInterval !== null) {
      timerService.clearInterval(timerInterval);
      timerInterval = null;
    }
    isTimerRunning.value = false;
  }

  function clearAllTimers(): void {
    clearTimer();
    for (const timer of pendingTimers) {
      timerService.clearTimeout(timer);
    }
    pendingTimers.clear();
  }

  function setTrackedTimeout(fn: () => void, ms: number): TimerHandle {
    const timer = timerService.setTimeout(() => {
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

    timerInterval = timerService.setInterval(() => {
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
    timerService,
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
