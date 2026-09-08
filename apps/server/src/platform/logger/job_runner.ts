import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Logger } from "./logger.interface.js";

const SENSITIVE_KEYS = new Set([
  "sessiontoken",
  "session_token",
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "key",
  "apikey",
  "api_key",
  "bearer",
  "credential",
  "credentials",
]);

function sanitizeJobResult(data: unknown, seen = new WeakSet<object>()): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;
  if (seen.has(data as object)) return "[CIRCULAR]";
  seen.add(data as object);

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeJobResult(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lower = key.toLowerCase().replace(/[-_]/g, "");
    if (
      SENSITIVE_KEYS.has(key.toLowerCase()) ||
      lower.includes("secret") ||
      lower.includes("token") ||
      lower.includes("password") ||
      lower.includes("credential") ||
      lower.includes("bearer")
    ) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeJobResult(value, seen);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Runs a background operation with standardized 3-point structured logging:
 * 1. Start: operation name, correlationId, start timestamp
 * 2. Success: duration in integer milliseconds, status: "success", operation result summary
 * 3. Failure: duration in integer milliseconds, status: "failed", structured error diagnostics
 *
 * Uses static invariant log message templates (MIN-019).
 */
export async function runLoggedJob<T>(
  logger: Logger,
  operation: string,
  jobFn: (correlationId: string) => Promise<T>,
): Promise<T> {
  const correlationId = randomUUID();
  const startTime = performance.now();

  logger.info("Background job started", {
    operation,
    correlationId,
    status: "started",
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await jobFn(correlationId);
    const duration = Math.round(performance.now() - startTime);
    const sanitizedResult = sanitizeJobResult(result);

    logger.info("Background job succeeded", {
      operation,
      correlationId,
      duration,
      durationMs: duration,
      status: "success",
      result:
        typeof sanitizedResult === "object" && sanitizedResult !== null
          ? sanitizedResult
          : { count: sanitizedResult },
    });

    return result;
  } catch (err: unknown) {
    const duration = Math.round(performance.now() - startTime);

    logger.error("Background job failed", {
      operation,
      correlationId,
      duration,
      durationMs: duration,
      status: "failed",
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : { raw: err },
    });

    throw err;
  }
}
