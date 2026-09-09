import {
  SlidingWindowRateLimiter,
  type RateLimiterOptions,
} from "../rate_limiter/index.js";

export type SocketRateLimiterOptions = RateLimiterOptions;

export { extractClientIp } from "../http/ip_utils.js";

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
 * Extends the transport-agnostic SlidingWindowRateLimiter (F-02).
 */
export class SocketRateLimiter extends SlidingWindowRateLimiter {
  constructor(options?: SocketRateLimiterOptions) {
    super({
      maxRequests: 60,
      windowMs: 10_000,
      maxKeys: 10_000,
      ...options,
    });
  }
}
