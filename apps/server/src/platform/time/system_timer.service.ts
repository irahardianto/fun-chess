import type { ITimerService, TimerHandle } from "@fun-chess/shared";

/**
 * Production implementation of ITimerService backed by Node.js global timers (MAJ-008).
 * Isolates timer I/O and provides ref/unref handle lifecycle control.
 */
export class SystemTimerService implements ITimerService {
  public setTimeout(
    callback: () => void | Promise<void>,
    delayMs: number,
  ): TimerHandle {
    const timer = setTimeout(() => {
      void callback();
    }, delayMs);

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
    if (timer !== undefined && timer !== null) {
      clearTimeout(timer as NodeJS.Timeout);
    }
  }

  public setInterval(
    callback: () => void | Promise<void>,
    intervalMs: number,
  ): TimerHandle {
    const timer = setInterval(() => {
      void callback();
    }, intervalMs);

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
    if (timer !== undefined && timer !== null) {
      clearInterval(timer as NodeJS.Timeout);
    }
  }
}
