import type { TimerHandle, ITimerService } from "./timer_service.js";

export const DISCONNECT_GRACE_PERIOD_MS = 60_000;

export type StoredTimer = NodeJS.Timeout | TimerHandle;

export interface IDisconnectTimerRegistry {
  set(roomCode: string, playerId: string, timer: StoredTimer): void;
  get(roomCode: string, playerId: string): StoredTimer | undefined;
  cancel(roomCode: string, playerId: string): boolean;
  cancelAllForRoom(roomCode: string): void;
  clear(): void;
  size(): number;
}

/**
 * In-memory registry of pending disconnect grace timers keyed by `${roomCode}:${playerId}`.
 * Encapsulates mutable timer state (MIN-007) and enables test isolation.
 */
export class DisconnectTimerRegistry implements IDisconnectTimerRegistry {
  private readonly timers = new Map<string, StoredTimer>();

  constructor(private readonly timerService?: ITimerService) {}

  private clearTimer(timer: StoredTimer): void {
    if (this.timerService) {
      this.timerService.clearTimeout(timer);
    } else if (timer && typeof timer === "object" && "id" in timer) {
      const id = (timer as TimerHandle).id;
      if (id && typeof id === "object") {
        clearTimeout(id as NodeJS.Timeout);
      } else if (typeof id === "number") {
        clearTimeout(id as unknown as NodeJS.Timeout);
      }
    } else {
      clearTimeout(timer as NodeJS.Timeout);
    }
  }

  private getKey(roomCode: string, playerId: string): string {
    return `${roomCode.toUpperCase()}:${playerId}`;
  }

  public set(roomCode: string, playerId: string, timer: StoredTimer): void {
    const key = this.getKey(roomCode, playerId);
    const existing = this.timers.get(key);
    if (existing) {
      this.clearTimer(existing);
    }
    this.timers.set(key, timer);
  }

  public get(roomCode: string, playerId: string): StoredTimer | undefined {
    return this.timers.get(this.getKey(roomCode, playerId));
  }

  public cancel(roomCode: string, playerId: string): boolean {
    const key = this.getKey(roomCode, playerId);
    const timer = this.timers.get(key);
    if (timer) {
      this.clearTimer(timer);
      this.timers.delete(key);
      return true;
    }
    return false;
  }

  public cancelAllForRoom(roomCode: string): void {
    const prefix = `${roomCode.toUpperCase()}:`;
    for (const [key, timer] of this.timers.entries()) {
      if (key.startsWith(prefix)) {
        this.clearTimer(timer);
        this.timers.delete(key);
      }
    }
  }

  public clear(): void {
    for (const timer of this.timers.values()) {
      this.clearTimer(timer);
    }
    this.timers.clear();
  }

  public size(): number {
    return this.timers.size;
  }
}


/**
 * Creates an isolated DisconnectTimerRegistry instance for test environments (ENH-001).
 */
export function createDisconnectTimerRegistry(): DisconnectTimerRegistry {
  return new DisconnectTimerRegistry();
}

export const defaultDisconnectTimerRegistry = createDisconnectTimerRegistry();

/**
 * Resets the default singleton registry and cancels all active timers (ENH-001).
 */
export function resetDefaultDisconnectTimerRegistry(): void {
  defaultDisconnectTimerRegistry.clear();
}

export function cancelDisconnectTimer(
  roomCode: string,
  playerId: string,
  registry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
): boolean {
  return registry.cancel(roomCode, playerId);
}

export function cancelAllDisconnectTimersForRoom(
  roomCode: string,
  registry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
): void {
  registry.cancelAllForRoom(roomCode);
}

export function clearAllDisconnectTimers(
  registry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
): void {
  registry.clear();
}
