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
}

/**
 * In-memory sliding window rate limiter for Socket.io events.
 * Tracks per-socket event timestamps to prevent flooding and resource exhaustion.
 */
export class SocketRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly timestamps = new Map<string, number[]>();

  constructor(options?: SocketRateLimiterOptions) {
    this.maxRequests = options?.maxRequests ?? 5;
    this.windowMs = options?.windowMs ?? 10_000;
  }

  /**
   * Attempts to consume 1 request permit for the given key (e.g. socket ID).
   * Returns true if allowed, or false if the rate limit has been exceeded.
   */
  public consume(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const existing = this.timestamps.get(key);

    if (!existing) {
      this.timestamps.set(key, [now]);
      return true;
    }

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
    const validCount = existing.filter((t) => t > cutoff).length;
    return validCount < this.maxRequests;
  }

  /**
   * Returns the remaining permit count for the given key in the current window.
   */
  public getRemaining(key: string, now = Date.now()): number {
    const cutoff = now - this.windowMs;
    const existing = this.timestamps.get(key);
    if (!existing) return this.maxRequests;
    const validCount = existing.filter((t) => t > cutoff).length;
    return Math.max(0, this.maxRequests - validCount);
  }

  /**
   * Resets rate limit history for a specific key (e.g., when a socket disconnects).
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
}
