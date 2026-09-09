import {
  SlidingWindowRateLimiter,
  RateLimiterOptions,
} from "../rate_limiter/index.js";

export interface HttpRateLimiterOptions extends RateLimiterOptions {
  /**
   * Maximum allowed requests within windowMs.
   * Default: 100 requests per 10 seconds.
   */
  maxRequests?: number;
  /**
   * Sliding window duration in milliseconds.
   * Default: 10,000ms.
   */
  windowMs?: number;
}

/**
 * In-memory sliding window rate limiter for native HTTP endpoints (MIN-002).
 * Keyed by client IP address to prevent brute-force and resource exhaustion attacks.
 */
export class HttpRateLimiter {
  private readonly limiter: SlidingWindowRateLimiter;

  constructor(options?: HttpRateLimiterOptions) {
    this.limiter = new SlidingWindowRateLimiter({
      maxRequests: options?.maxRequests ?? 100,
      windowMs: options?.windowMs ?? 10_000,
      maxKeys: options?.maxKeys ?? 10_000,
      pruneIntervalMs: options?.pruneIntervalMs ?? 60_000,
      logger: options?.logger,
    });
  }

  public consume(clientIp: string, now = Date.now()): boolean {
    return this.limiter.consume(clientIp, now);
  }

  public check(clientIp: string, now = Date.now()): boolean {
    return this.limiter.check(clientIp, now);
  }

  public getRemaining(clientIp: string, now = Date.now()): number {
    return this.limiter.getRemaining(clientIp, now);
  }

  public getLimitDescription(): string {
    return this.limiter.getLimitDescription();
  }

  public reset(clientIp: string): void {
    this.limiter.reset(clientIp);
  }

  public clear(): void {
    this.limiter.clear();
  }

  public destroy(): void {
    this.limiter.destroy();
  }
}
