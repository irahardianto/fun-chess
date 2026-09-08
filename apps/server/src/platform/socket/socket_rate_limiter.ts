import { Logger } from "../logger/logger.interface.js";
import { runLoggedJob } from "../logger/job_runner.js";

export interface SocketRateLimiterOptions {
  /**
   * Maximum number of requests allowed within the sliding window.
   * Default: 5 requests.
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
   * Optional logger instance for logging background pruning operations (MAJ-015).
   */
  logger?: Logger;
}

/**
 * Extracts a reliable client IP address from a Socket.io socket instance.
 * When trustProxy is true, evaluates x-forwarded-for header (proxies/Cloud Run)
 * taking the RIGHTMOST IP before proxy (CRIT-006) to prevent rate limiting bypass and spoofing.
 * When trustProxy is false, ignores x-forwarded-for to prevent spoofing (CRIT-001).
 */
export function extractClientIp(socket: unknown, trustProxy = false): string {
  if (!socket || typeof socket !== "object") return "127.0.0.1";
  const s = socket as {
    handshake?: {
      headers?: Record<string, string | string[] | undefined>;
      address?: string;
    };
    conn?: {
      remoteAddress?: string;
    };
  };

  if (trustProxy) {
    const rawForwarded = s.handshake?.headers?.["x-forwarded-for"];
    const forwarded = Array.isArray(rawForwarded) ? rawForwarded.join(",") : rawForwarded;
    if (typeof forwarded === "string" && forwarded.trim()) {
      const parts = forwarded.split(",");
      return parts[parts.length - 1]?.trim() || "127.0.0.1";
    }
  }

  return s.handshake?.address || s.conn?.remoteAddress || "127.0.0.1";
}

/**
 * Creates a configured SocketRateLimiter instance.
 */
export function createSocketRateLimiter(
  options?: SocketRateLimiterOptions,
): SocketRateLimiter {
  return new SocketRateLimiter({
    maxRequests: 60,
    windowMs: 10_000,
    maxKeys: 10_000,
    ...options,
  });
}

/**
 * In-memory sliding window rate limiter for Socket.io events.
 * Keyed by client IP to prevent disconnect evasion (MAJ-001) with bounded LRU memory cleanup (MAJ-003).
 * Logs background scheduled pruning tasks via runLoggedJob when logger is supplied (MAJ-015).
 */
export class SocketRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly logger?: Logger;
  private readonly timestamps = new Map<string, number[]>();
  private pruneTimer?: NodeJS.Timeout;

  constructor(options?: SocketRateLimiterOptions) {
    this.maxRequests = options?.maxRequests ?? 60;
    this.windowMs = options?.windowMs ?? 10_000;
    this.maxKeys = options?.maxKeys ?? 10_000;
    this.logger = options?.logger;
    const pruneIntervalMs = options?.pruneIntervalMs ?? 60_000;

    if (pruneIntervalMs > 0) {
      this.pruneTimer = setInterval(() => {
        if (this.logger) {
          void runLoggedJob(this.logger, "rate_limiter_prune", async () => {
            return this.prune();
          }).catch(() => {});
        } else {
          this.prune();
        }
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

    // Filter out timestamps older than the sliding window
    const valid = existing.filter((t) => t > cutoff);

    if (valid.length >= this.maxRequests) {
      this.timestamps.set(key, valid);
      return false;
    }

    valid.push(now);
    this.timestamps.set(key, valid);
    return true;
  }

  /**
   * Checks whether a request would be permitted without consuming a permit.
   */
  public check(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const existing = this.timestamps.get(key);
    if (!existing) return true;
    const valid = existing.filter((t) => t > cutoff);
    if (valid.length === 0) {
      this.timestamps.delete(key);
      return true;
    }
    this.timestamps.delete(key);
    this.timestamps.set(key, valid);
    return valid.length < this.maxRequests;
  }

  /**
   * Returns the remaining permit count for the given key in the current window.
   */
  public getRemaining(key: string, now = Date.now()): number {
    const cutoff = now - this.windowMs;
    const existing = this.timestamps.get(key);
    if (!existing) return this.maxRequests;
    const valid = existing.filter((t) => t > cutoff);
    if (valid.length === 0) {
      this.timestamps.delete(key);
      return this.maxRequests;
    }
    this.timestamps.delete(key);
    this.timestamps.set(key, valid);
    return Math.max(0, this.maxRequests - valid.length);
  }

  /**
   * Returns the current number of tracked keys in memory.
   */
  public size(): number {
    return this.timestamps.size;
  }

  /**
   * Prunes all expired timestamps and removes empty keys from memory.
   * Returns the count of deleted keys.
   */
  public prune(now = Date.now()): number {
    const cutoff = now - this.windowMs;
    let deletedCount = 0;

    for (const [key, list] of this.timestamps.entries()) {
      const valid = list.filter((t) => t > cutoff);
      if (valid.length === 0) {
        this.timestamps.delete(key);
        deletedCount++;
      } else if (valid.length < list.length) {
        this.timestamps.set(key, valid);
      }
    }

    return deletedCount;
  }

  /**
   * Resets rate limit history for a specific key.
   */
  public reset(key: string): void {
    this.timestamps.delete(key);
  }

  /**
   * Clears all rate limit tracking entries.
   */
  public clear(): void {
    this.timestamps.clear();
  }

  /**
   * Stops any background pruning timer and clears all state.
   */
  public destroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }
    this.clear();
  }
}
