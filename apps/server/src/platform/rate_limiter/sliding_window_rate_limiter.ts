import { Logger, defaultLogger } from "../logger/index.js";
import { runLoggedJob } from "../logger/job_runner.js";

export interface RateLimiterOptions {
  /**
   * Maximum number of requests allowed within the sliding window.
   * Default: 60 requests.
   */
  maxRequests?: number;
  /**
   * Sliding window duration in milliseconds.
   * Default: 10,000ms (10 seconds).
   */
  windowMs?: number;
  /**
   * Interval in milliseconds for background pruning of expired keys.
   * Default: 60,000ms (1 minute). Set to 0 to disable automatic timer.
   */
  pruneIntervalMs?: number;
  /**
   * Maximum number of keys tracked in memory (bounded LRU eviction).
   * Default: 10,000 keys.
   */
  maxKeys?: number;
  /**
   * Optional logger instance for logging background pruning operations.
   * Defaults to defaultLogger.
   */
  logger?: Logger;
}

/**
 * In-memory sliding window rate limiter.
 * Generic transport-agnostic rate limiting mechanism with LRU bounded memory eviction
 * and periodic background pruning of expired entries.
 */
export class SlidingWindowRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly logger: Logger;
  private readonly timestamps = new Map<string, number[]>();
  private pruneTimer?: NodeJS.Timeout;

  constructor(options?: RateLimiterOptions) {
    this.maxRequests = options?.maxRequests ?? 60;
    this.windowMs = options?.windowMs ?? 10_000;
    this.maxKeys = options?.maxKeys ?? 10_000;
    this.logger = options?.logger ?? defaultLogger;
    const pruneIntervalMs = options?.pruneIntervalMs ?? 60_000;

    if (pruneIntervalMs > 0) {
      this.pruneTimer = setInterval(() => {
        void runLoggedJob(this.logger, "rate_limiter_prune", async () => {
          return this.prune(Date.now());
        }).catch(() => {
          // Standard 3-point failure logging is already handled by runLoggedJob
        });
      }, pruneIntervalMs);
      if (typeof this.pruneTimer.unref === "function") {
        this.pruneTimer.unref();
      }
    }
  }

  /**
   * Returns a human-readable limit description.
   */
  public getLimitDescription(): string {
    const windowSec = Math.round(this.windowMs / 1000);
    return `Maximum ${this.maxRequests} requests per ${windowSec} seconds allowed.`;
  }

  /**
   * Attempts to consume 1 request permit for the given key (e.g. client IP).
   * Returns true if allowed, or false if the rate limit has been exceeded.
   */
  public consume(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const existing = this.timestamps.get(key);

    if (!existing) {
      if (this.timestamps.size >= this.maxKeys) {
        // Evict oldest/least recently used entry before adding a new key
        const oldestKey = this.timestamps.keys().next().value;
        if (oldestKey !== undefined) {
          this.timestamps.delete(oldestKey);
        }
      }
      this.timestamps.set(key, [now]);
      return true;
    }

    // Refresh LRU order by removing and re-inserting
    this.timestamps.delete(key);

    // Filter to timestamps within current sliding window
    const valid = existing.filter((t) => t > cutoff);

    if (valid.length >= this.maxRequests) {
      // Limit exceeded — keep valid timestamps so subsequent calls within window continue to fail
      this.timestamps.set(key, valid);
      return false;
    }

    valid.push(now);
    this.timestamps.set(key, valid);
    return true;
  }

  /**
   * Checks whether the given key is currently within limit without consuming a permit.
   */
  public check(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const existing = this.timestamps.get(key);
    if (!existing) return true;
    const validCount = existing.filter((t) => t > cutoff).length;
    return validCount < this.maxRequests;
  }

  /**
   * Returns the number of remaining requests allowed for the key in the current window.
   */
  public getRemaining(key: string, now = Date.now()): number {
    const cutoff = now - this.windowMs;
    const existing = this.timestamps.get(key);
    if (!existing) return this.maxRequests;
    const validCount = existing.filter((t) => t > cutoff).length;
    return Math.max(0, this.maxRequests - validCount);
  }

  /**
   * Prunes expired timestamps for all keys, and removes keys that have no active timestamps.
   * Returns count of fully pruned keys.
   */
  public prune(now = Date.now()): number {
    const cutoff = now - this.windowMs;
    let deletedCount = 0;

    for (const [key, times] of this.timestamps.entries()) {
      const valid = times.filter((t) => t > cutoff);
      if (valid.length === 0) {
        this.timestamps.delete(key);
        deletedCount++;
      } else if (valid.length < times.length) {
        this.timestamps.set(key, valid);
      }
    }

    return deletedCount;
  }

  /**
   * Resets the rate limit record for a specific key.
   */
  public reset(key: string): void {
    this.timestamps.delete(key);
  }

  /**
   * Clears all tracked rate limit records.
   */
  public clear(): void {
    this.timestamps.clear();
  }

  /**
   * Returns current number of keys tracked in memory.
   */
  public size(): number {
    return this.timestamps.size;
  }

  /**
   * Stops the background pruning timer.
   */
  public destroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }
    this.timestamps.clear();
  }
}
