/**
 * Time abstraction for isolating system clock I/O.
 * Enables deterministic testing of timeouts, TTLs, and timestamps.
 */
export interface IClock {
  /** Returns the current timestamp in milliseconds since Unix epoch */
  now(): number;
}

/**
 * ID and randomness abstraction for isolating non-deterministic generation.
 */
export interface IIdGenerator {
  /** Generates a unique string identifier (e.g. UUIDv4) */
  generateId(): string;
  /** Generates a pseudo-random integer between min (inclusive) and max (exclusive) */
  generateRandomInt(min: number, max: number): number;
}

/**
 * Opaque handle representing an active scheduled timer across environments (Node.js & browser).
 * Addresses MAJ-008: Centralized canonical timer abstraction.
 */
export interface TimerHandle {
  /** Prevents runtime event loop from exiting while timer is active (Node.js only, no-op in browser) */
  ref?(): void;
  /** Allows runtime event loop to exit even if timer is active (Node.js only, no-op in browser) */
  unref?(): void;
  /** Underlying runtime timer identifier */
  readonly id?: unknown;
}

/**
 * Interface contract isolating timer scheduling behind an abstract boundary.
 * Enables deterministic virtual-time advancement in unit tests without global clock pollution (MAJ-008).
 */
export interface ITimerService {
  /** Schedules a one-shot task to run after delayMs */
  setTimeout(
    callback: () => void | Promise<void>,
    delayMs: number,
  ): TimerHandle;

  /** Cancels an active one-shot timer */
  clearTimeout(handle: TimerHandle | unknown): void;

  /** Schedules a recurring periodic task every intervalMs */
  setInterval(
    callback: () => void | Promise<void>,
    intervalMs: number,
  ): TimerHandle;

  /** Cancels an active recurring periodic timer */
  clearInterval(handle: TimerHandle | unknown): void;
}
