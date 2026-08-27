import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Logger } from "../logger/logger.interface.js";
import { SocketErrorPayload } from "@fun-chess/shared";

export interface SocketOperationContext {
  correlationId: string;
  socketId: string;
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
      payload: req,
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
