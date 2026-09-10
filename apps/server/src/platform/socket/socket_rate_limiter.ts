import { performance } from "node:perf_hooks";
import type { SocketErrorPayload } from "@fun-chess/shared";
import type { Logger } from "../logger/logger.interface.js";
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

export interface CheckRateLimitParams {
  rateLimiter?: SocketRateLimiter;
  clientIp?: string;
  socketId: string;
  operationName: string;
  correlationId: string;
  userId?: string;
  startTime: number;
  logger: Logger;
  rateLimitErrorMessage?:
    | string
    | ((operationName: string, defaultLimitDesc: string) => string);
}

export interface CheckRateLimitResult {
  allowed: boolean;
  errorPayload?: SocketErrorPayload;
}

/**
 * Validates socket rate limit quota for client IP and emits warning if exceeded (MAJ-021).
 */
export function checkSocketRateLimit(
  params: CheckRateLimitParams,
): CheckRateLimitResult {
  const {
    rateLimiter,
    clientIp,
    socketId,
    operationName,
    correlationId,
    userId,
    startTime,
    logger,
    rateLimitErrorMessage,
  } = params;

  if (!rateLimiter || typeof rateLimiter.consume !== "function") {
    return { allowed: true };
  }

  const rateLimitKey = clientIp || "127.0.0.1";
  if (rateLimiter.consume(rateLimitKey)) {
    return { allowed: true };
  }

  const duration = Math.round(performance.now() - startTime);
  const defaultLimitDesc =
    typeof rateLimiter.getLimitDescription === "function"
      ? rateLimiter.getLimitDescription()
      : "Rate limit exceeded. Please wait.";

  let limitDesc = defaultLimitDesc;
  if (typeof rateLimitErrorMessage === "function") {
    limitDesc = rateLimitErrorMessage(operationName, defaultLimitDesc);
  } else if (typeof rateLimitErrorMessage === "string") {
    limitDesc = rateLimitErrorMessage;
  }

  const errorPayload: SocketErrorPayload = {
    code: "ERR_RATE_LIMITED",
    message: limitDesc,
    correlationId,
  };

  logger.warn("Operation rate limit exceeded", {
    operation: operationName,
    correlationId,
    socketId,
    ...(clientIp ? { clientIp } : {}),
    ...(userId ? { userId } : {}),
    duration,
    durationMs: duration,
    status: "rate_limited",
    error: { code: errorPayload.code, message: errorPayload.message },
  });

  return { allowed: false, errorPayload };
}
