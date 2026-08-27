import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Logger } from "../logger/logger.interface.js";
import { SocketErrorPayload } from "@fun-chess/shared";

export interface SocketOperationContext {
  correlationId: string;
  socketId: string;
}

/**
 * Deeply redacts sensitive fields (such as sessionToken) from payloads before logging.
 */
export function sanitizePayload<T>(data: T, seen = new WeakSet<object>()): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data !== "object") {
    return data;
  }
  if (seen.has(data as object)) {
    return "[CIRCULAR]" as unknown as T;
  }
  seen.add(data as object);

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayload(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (
      key === "sessionToken" ||
      key === "session_token" ||
      key.toLowerCase() === "sessiontoken"
    ) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizePayload(value, seen);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Higher-order interceptor providing 3-point automated structured logging
 * (start, success, failure) with correlation IDs, latency tracking, and structured error responses.
 */
export function wrapSocketHandler<TReq, TRes>(
  logger: Logger,
  operationName: string,
  socketId: string,
  handler: (req: TReq, context: SocketOperationContext) => Promise<TRes>,
) {
  return async (
    req: TReq,
    callback?: (res: TRes) => void,
  ): Promise<TRes | undefined> => {
    const correlationId = randomUUID();
    const startTime = performance.now();

    logger.info(`Operation started: ${operationName}`, {
      operation: operationName,
      correlationId,
      socketId,
      payload: sanitizePayload(req),
    });


    try {
      const result = await handler(req, { correlationId, socketId });
      const durationMs = Math.round(performance.now() - startTime);

      logger.info(`Operation succeeded: ${operationName}`, {
        operation: operationName,
        correlationId,
        socketId,
        durationMs,
        status: "success",
      });

      if (typeof callback === "function") {
        callback(result);
      }
      return result;
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorObj =
        err instanceof Error
          ? { message: err.message, stack: err.stack, name: err.name }
          : { raw: err };

      logger.error(`Operation failed: ${operationName}`, {
        operation: operationName,
        correlationId,
        socketId,
        durationMs,
        status: "failed",
        error: errorObj,
      });

      if (typeof callback === "function") {
        const errorRecord = err as {
          code?: string;
          message?: string;
          details?: Record<string, unknown>;
        };
        const code =
          (errorRecord?.code as SocketErrorPayload["code"]) ||
          "ERR_INTERNAL_SERVER";
        const message =
          (err instanceof Error ? err.message : undefined) ||
          "Internal server error";

        const errorPayload: SocketErrorPayload = {
          code,
          message,
          correlationId,
          ...(errorRecord?.details ? { details: errorRecord.details } : {}),
        };

        callback({
          success: false,
          error: errorPayload,
        } as unknown as TRes);
      }
      return undefined;
    }
  };
}
