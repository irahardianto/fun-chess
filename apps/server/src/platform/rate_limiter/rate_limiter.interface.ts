/**
 * Generic rate limiter interface for transport-agnostic traffic throttling.
 * Adheres to Architectural Patterns Rule 1: I/O Isolation (ENH-006).
 */
export interface IRateLimiter {
  /**
   * Attempts to consume 1 request permit for the given key (e.g. client IP or user ID).
   * Returns true if allowed, or false if the rate limit has been exceeded.
   */
  consume(key: string, now?: number): boolean;

  /**
   * Checks whether the given key is currently within limit without consuming a permit.
   */
  check(key: string, now?: number): boolean;

  /**
   * Returns the number of remaining requests allowed for the key in the current window.
   */
  getRemaining(key: string, now?: number): number;

  /**
   * Returns a human-readable limit description.
   */
  getLimitDescription(): string;

  /**
   * Prunes expired timestamps for all keys, and removes keys that have no active timestamps.
   * Returns count of fully pruned keys.
   */
  prune(now?: number): number;

  /**
   * Resets the rate limit record for a specific key.
   */
  reset(key: string): void;

  /**
   * Clears all tracked rate limit records.
   */
  clear(): void;

  /**
   * Returns current number of keys tracked in memory.
   */
  size(): number;

  /**
   * Stops background timers and disposes internal resources.
   */
  destroy(): void;
}
