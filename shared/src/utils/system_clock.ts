import type { IClock } from "../contracts/system.js";

export type { IClock };

/**
 * Production system clock adapter using `Date.now()`.
 * Consolidated canonical implementation adhering to `IClock` interface contract per ENH-008.
 */
export class SystemClock implements IClock {
  /**
   * Returns current epoch timestamp in milliseconds.
   *
   * @returns Current time in milliseconds since Unix epoch
   */
  public now(): number {
    return Date.now();
  }
}

/**
 * Shared singleton instance of `SystemClock`.
 */
export const systemClock = new SystemClock();

/**
 * Deterministic test clock for unit and integration testing.
 * Allows fine-grained programmatic control and fast-forwarding of time in tests without real delays.
 */
export class MockClock implements IClock {
  /**
   * Initializes MockClock with an optional starting timestamp in milliseconds.
   *
   * @param currentTime - Initial time in milliseconds (defaults to 0)
   */
  constructor(private currentTime = 0) {}

  /**
   * Returns current mocked timestamp in milliseconds.
   *
   * @returns Current mock time in milliseconds
   */
  public now(): number {
    return this.currentTime;
  }

  /**
   * Advances the mocked time forward by the given duration in milliseconds.
   *
   * @param ms - Duration in milliseconds to advance
   */
  public advance(ms: number): void {
    this.currentTime += ms;
  }

  /**
   * Sets the mocked time to a specific absolute timestamp in milliseconds.
   *
   * @param ms - Target timestamp in milliseconds
   */
  public setTime(ms: number): void {
    this.currentTime = ms;
  }

  /**
   * Resets the mocked time to 0 or a specified timestamp in milliseconds.
   *
   * @param ms - Target reset timestamp in milliseconds (defaults to 0)
   */
  public reset(ms: number = 0): void {
    this.currentTime = ms;
  }
}
