import type { IClock } from "../contracts/system.js";

/**
 * Production system clock adapter using Date.now().
 * Consolidated implementation adhering to IClock interface contract per ENH-006.
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
