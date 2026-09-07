import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Logger } from "../logger/logger.interface.js";
import { SocketErrorPayload, ErrorCode } from "@fun-chess/shared";
import { extractClientIp } from "./socket_rate_limiter.js";
import type { z } from "zod";

export interface SocketOperationContext {
  correlationId: string;
  socketId: string;
  clientIp?: string;
  userId?: string;
}

export interface SocketLike {
  id: string;
  emit?: (event: string, ...args: unknown[]) => unknown;
  handshake?: {
    headers?: Record<string, string | string[] | undefined>;
    address?: string;
    auth?: Record<string, unknown>;
  };
  data?: Record<string, unknown>;
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
      key.toLowerCase() === "sessiontoken" ||
      key === "password" ||
      key.toLowerCase() === "password"
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

export type SocketHandlerFn<TReq, TRes> = (
  req: TReq,
  context: SocketOperationContext,
) => Promise<TRes>;

/**
 * Higher-order interceptor providing 3-point automated structured logging
 * (start, success, failure) with correlation IDs, latency tracking, and structured error responses.
 *
 * Supports both standard handler signatures and optional Zod schema validation.
 * Emits contracted "error" events on unacknowledged socket operations (CRIT-005).
 */
export function wrapSocketHandler<TReq, TRes>(
  logger: Logger,
  operationName: string,
  socket: SocketLike | string,
  handler: SocketHandlerFn<TReq, TRes>,
): (req: TReq, callback?: (res: TRes) => void) => Promise<TRes | undefined>;
export function wrapSocketHandler<TReq, TRes>(
  logger: Logger,
  operationName: string,
  socket: SocketLike | string,
  schema: z.ZodSchema<TReq>,
  handler: SocketHandlerFn<TReq, TRes>,
): (req: unknown, callback?: (res: TRes) => void) => Promise<TRes | undefined>;
export function wrapSocketHandler<TReq, TRes>(
  logger: Logger,
  operationName: string,
  socket: SocketLike | string,
  schemaOrHandler: z.ZodSchema<TReq> | SocketHandlerFn<TReq, TRes>,
  maybeHandler?: SocketHandlerFn<TReq, TRes>,
) {
  const isSchemaPassed =
    schemaOrHandler &&
    typeof (schemaOrHandler as z.ZodSchema<TReq>).safeParse === "function";

  const schema = isSchemaPassed
    ? (schemaOrHandler as z.ZodSchema<TReq>)
    : undefined;
  const handler = isSchemaPassed
    ? (maybeHandler as SocketHandlerFn<TReq, TRes>)
    : (schemaOrHandler as SocketHandlerFn<TReq, TRes>);

  const socketId = typeof socket === "string" ? socket : socket.id;
  const socketObj = typeof socket === "object" ? socket : undefined;
  const clientIp = socketObj ? extractClientIp(socketObj) : undefined;

  return async (
    rawReq: unknown,
    callback?: (res: TRes) => void,
  ): Promise<TRes | undefined> => {
    const correlationId = randomUUID();
    const startTime = performance.now();

    // Extract potential user identity from request payload or socket
    const reqObj = typeof rawReq === "object" && rawReq !== null ? (rawReq as Record<string, unknown>) : undefined;
    const userId =
      (reqObj?.["playerId"] as string) ||
      (reqObj?.["userId"] as string) ||
      (socketObj?.data?.["userId"] as string) ||
      (socketObj?.handshake?.auth?.["userId"] as string) ||
      undefined;

    logger.info(`Operation started: ${operationName}`, {
      operation: operationName,
      correlationId,
      socketId,
      ...(clientIp ? { clientIp } : {}),
      ...(userId ? { userId } : {}),
      payload: sanitizePayload(rawReq),
    });

    let validatedReq = rawReq as TReq;

    // 1. Ingress Schema Validation (if schema provided)
    if (schema) {
      const validation = schema.safeParse(rawReq);
      if (!validation.success) {
        const duration = Math.round(performance.now() - startTime);
        const errorMessage = validation.error.errors
          .map((e) => `${e.path.join(".") || "root"}: ${e.message}`)
          .join(", ");

        const errorPayload: SocketErrorPayload = {
          code: "ERR_INVALID_PAYLOAD",
          message: errorMessage,
          correlationId,
        };

        logger.warn(`Operation validation failed: ${operationName}`, {
          operation: operationName,
          correlationId,
          socketId,
          ...(clientIp ? { clientIp } : {}),
          ...(userId ? { userId } : {}),
          duration,
          durationMs: duration,
          status: "rejected",
          error: { code: "ERR_INVALID_PAYLOAD", message: errorMessage },
        });

        if (typeof callback === "function") {
          callback({
            success: false,
            error: errorPayload,
          } as unknown as TRes);
        } else if (socketObj && typeof socketObj.emit === "function") {
          socketObj.emit("error", errorPayload);
        }
        return undefined;
      }
      validatedReq = validation.data;
    }

    // 2. Execution & Result Dispatch
    try {
      const result = await handler(validatedReq, {
        correlationId,
        socketId,
        clientIp,
        userId,
      });
      const duration = Math.round(performance.now() - startTime);

      logger.info(`Operation succeeded: ${operationName}`, {
        operation: operationName,
        correlationId,
        socketId,
        ...(clientIp ? { clientIp } : {}),
        ...(userId ? { userId } : {}),
        duration,
        durationMs: duration,
        status: "success",
      });

      if (typeof callback === "function") {
        callback(result);
      }
      return result;
    } catch (err: unknown) {
      const duration = Math.round(performance.now() - startTime);
      const errorRecord = err as {
        code?: string;
        statusCode?: number;
        message?: string;
        details?: Record<string, unknown>;
      };

      const statusCode =
        typeof errorRecord?.statusCode === "number" ? errorRecord.statusCode : 500;

      const code: ErrorCode =
        (errorRecord?.code as ErrorCode) ||
        (statusCode >= 500 ? "ERR_INTERNAL_SERVER" : "ERR_INVALID_PAYLOAD");

      // Sanitize 500 error messages (never leak internal runtime exceptions or stack traces to client)
      const clientMessage =
        statusCode < 500 && err instanceof Error
          ? err.message
          : "An internal server error occurred";

      const errorPayload: SocketErrorPayload = {
        code,
        message: clientMessage,
        correlationId,
        ...(errorRecord?.details ? { details: errorRecord.details } : {}),
      };

      if (statusCode < 500) {
        logger.warn(`Operation rejected: ${operationName}`, {
          operation: operationName,
          correlationId,
          socketId,
          ...(clientIp ? { clientIp } : {}),
          ...(userId ? { userId } : {}),
          duration,
          durationMs: duration,
          status: "rejected",
          error: { code, message: err instanceof Error ? err.message : String(err) },
        });
      } else {
        logger.error(`Operation failed: ${operationName}`, {
          operation: operationName,
          correlationId,
          socketId,
          ...(clientIp ? { clientIp } : {}),
          ...(userId ? { userId } : {}),
          duration,
          durationMs: duration,
          status: "failed",
          error:
            err instanceof Error
              ? { name: err.name, message: err.message, stack: err.stack }
              : { raw: err },
        });
      }

      // Dual-channel error dispatch: callback if present, contracted "error" event if unacknowledged (CRIT-005)
      if (typeof callback === "function") {
        callback({
          success: false,
          error: errorPayload,
        } as unknown as TRes);
      } else if (socketObj && typeof socketObj.emit === "function") {
        socketObj.emit("error", errorPayload);
      }
      return undefined;
    }
  };
}
