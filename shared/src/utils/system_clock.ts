import type { IClock } from "../contracts/system.js";

export type { IClock };

/**
 * Production system clock adapter using Date.now().
 * Consolidated canonical implementation adhering to IClock interface contract per ENH-005.
 */
export class SystemClock implements IClock {
  /**
   * Returns current epoch timestamp in milliseconds.
   */
  public now(): number {
    return Date.now();
  }
}

/**
 * Shared singleton instance of SystemClock.
 */
export const systemClock = new SystemClock();

/**
 * Deterministic test clock for unit and integration testing.
 */
export class MockClock implements IClock {
  constructor(private currentTime = 0) {}

  public now(): number {
    return this.currentTime;
  }

  public advance(ms: number): void {
    this.currentTime += ms;
  }

  public setTime(ms: number): void {
    this.currentTime = ms;
  }
}
