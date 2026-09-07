export const DISCONNECT_GRACE_PERIOD_MS = 60_000;

export interface IDisconnectTimerRegistry {
  set(roomCode: string, playerId: string, timer: NodeJS.Timeout): void;
  get(roomCode: string, playerId: string): NodeJS.Timeout | undefined;
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
  private readonly timers = new Map<string, NodeJS.Timeout>();

  private getKey(roomCode: string, playerId: string): string {
    return `${roomCode.toUpperCase()}:${playerId}`;
  }

  public set(roomCode: string, playerId: string, timer: NodeJS.Timeout): void {
    const key = this.getKey(roomCode, playerId);
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    this.timers.set(key, timer);
  }

  public get(roomCode: string, playerId: string): NodeJS.Timeout | undefined {
    return this.timers.get(this.getKey(roomCode, playerId));
  }

  public cancel(roomCode: string, playerId: string): boolean {
    const key = this.getKey(roomCode, playerId);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
      return true;
    }
    return false;
  }

  public cancelAllForRoom(roomCode: string): void {
    const prefix = `${roomCode.toUpperCase()}:`;
    for (const [key, timer] of this.timers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
    }
  }

  public clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  public size(): number {
    return this.timers.size;
  }
}

export const defaultDisconnectTimerRegistry = new DisconnectTimerRegistry();

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
