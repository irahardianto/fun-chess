import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Logger } from "./logger.interface.js";

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

    logger.info("Background job succeeded", {
      operation,
      correlationId,
      duration,
      durationMs: duration,
      status: "success",
      result: typeof result === "object" && result !== null ? result : { count: result },
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
