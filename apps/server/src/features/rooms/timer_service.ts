import type {
  IClock,
  ITimerService,
  TimerHandle,
} from "@fun-chess/shared";

export type { ITimerService, TimerHandle };


/**
 * Production implementation backed by Node.js global timers.
 */
export class SystemTimerService implements ITimerService {
  public setTimeout(
    callback: () => void | Promise<void>,
    delayMs: number,
  ): TimerHandle {
    const timer = setTimeout(callback, delayMs);
    return {
      ref: () => timer.ref?.(),
      unref: () => timer.unref?.(),
      id: timer,
    };
  }

  public clearTimeout(handle: TimerHandle | unknown): void {
    const timer =
      handle && typeof handle === "object" && "id" in handle
        ? (handle as TimerHandle).id
        : handle;
    clearTimeout(timer as NodeJS.Timeout);
  }

  public setInterval(
    callback: () => void | Promise<void>,
    intervalMs: number,
  ): TimerHandle {
    const timer = setInterval(callback, intervalMs);
    return {
      ref: () => timer.ref?.(),
      unref: () => timer.unref?.(),
      id: timer,
    };
  }

  public clearInterval(handle: TimerHandle | unknown): void {
    const timer =
      handle && typeof handle === "object" && "id" in handle
        ? (handle as TimerHandle).id
        : handle;
    clearInterval(timer as NodeJS.Timeout);
  }
}

interface MockTimerEntry {
  id: number;
  callback: () => void | Promise<void>;
  delayMs: number;
  dueTime: number;
  recurring: boolean;
}

/**
 * Deterministic in-memory timer service for unit testing.
 * Allows synchronous or manual virtual time advancement via advance(ms).
 */
export class MockTimerService implements ITimerService {
  private nextId = 1;
  private readonly timers = new Map<number, MockTimerEntry>();
  private currentTime = 0;

  constructor(private readonly clock?: IClock) {}

  private getNow(): number {
    return this.clock ? this.clock.now() : this.currentTime;
  }

  public setTimeout(
    callback: () => void | Promise<void>,
    delayMs: number,
  ): TimerHandle {
    const id = this.nextId++;
    const dueTime = this.getNow() + delayMs;
    this.timers.set(id, {
      id,
      callback,
      delayMs,
      dueTime,
      recurring: false,
    });
    return {
      id,
      unref: () => {},
      ref: () => {},
    };
  }

  public clearTimeout(handle: TimerHandle | unknown): void {
    const id =
      handle && typeof handle === "object" && "id" in handle
        ? (handle as TimerHandle).id
        : handle;
    if (typeof id === "number") {
      this.timers.delete(id);
    }
  }

  public setInterval(
    callback: () => void | Promise<void>,
    intervalMs: number,
  ): TimerHandle {
    const id = this.nextId++;
    const dueTime = this.getNow() + intervalMs;
    this.timers.set(id, {
      id,
      callback,
      delayMs: intervalMs,
      dueTime,
      recurring: true,
    });
    return {
      id,
      unref: () => {},
      ref: () => {},
    };
  }

  public clearInterval(handle: TimerHandle | unknown): void {
    this.clearTimeout(handle);
  }

  /**
   * Advances virtual time by ms, executing all timers whose due time has passed.
   */
  public async advance(ms: number): Promise<void> {
    this.currentTime += ms;
    const now = this.getNow();

    // Snapshot due timers ordered by dueTime
    const due = Array.from(this.timers.values())
      .filter((t) => t.dueTime <= now)
      .sort((a, b) => a.dueTime - b.dueTime);

    for (const timer of due) {
      if (!this.timers.has(timer.id)) continue;

      if (!timer.recurring) {
        this.timers.delete(timer.id);
      } else {
        timer.dueTime = now + timer.delayMs;
      }

      await timer.callback();
    }
  }

  /**
   * Returns count of currently scheduled timers.
   */
  public getPendingCount(): number {
    return this.timers.size;
  }

  /**
   * Clears all pending timers.
   */
  public clear(): void {
    this.timers.clear();
  }
}
