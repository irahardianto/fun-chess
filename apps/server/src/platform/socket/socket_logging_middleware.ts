import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Logger } from "../logger/logger.interface.js";
import { SocketErrorPayload, ErrorCode } from "@fun-chess/shared";
import { extractClientIp, SocketRateLimiter } from "./socket_rate_limiter.js";
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

export interface WrapSocketHandlerOptions<TReq = unknown> {
  schema?: z.ZodSchema<TReq>;
  rateLimiter?: SocketRateLimiter;
  trustProxy?: boolean;
}

const SENSITIVE_EXACT_KEYS = new Set([
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

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_EXACT_KEYS.has(lower)) {
    return true;
  }
  const clean = lower.replace(/[-_]/g, "");
  return (
    clean.includes("sessiontoken") ||
    clean.includes("password") ||
    clean.includes("secret") ||
    clean.includes("authorization") ||
    clean.includes("cookie") ||
    clean.includes("credential") ||
    clean.includes("bearer") ||
    clean === "token" ||
    clean.endsWith("token") ||
    clean === "key" ||
    clean.endsWith("key")
  );
}

/**
 * Deeply redacts sensitive fields from payloads before logging (MIN-012).
 * Covers sessionToken, password, token, secret, authorization, cookie, key.
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
    if (isSensitiveKey(key)) {
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

// --- Helper Functions (MAJ-038) ---

function extractUserId(rawReq: unknown, socketObj?: SocketLike): string | undefined {
  const reqObj =
    typeof rawReq === "object" && rawReq !== null
      ? (rawReq as Record<string, unknown>)
      : undefined;
  return (
    (reqObj?.["playerId"] as string) ||
    (reqObj?.["userId"] as string) ||
    (socketObj?.data?.["userId"] as string) ||
    (socketObj?.handshake?.auth?.["userId"] as string) ||
    undefined
  );
}

interface ParsedOptions<TReq, TRes> {
  schema?: z.ZodSchema<TReq>;
  rateLimiter?: SocketRateLimiter;
  trustProxy?: boolean;
  handler: SocketHandlerFn<TReq, TRes>;
}

function parseHandlerArguments<TReq, TRes>(
  schemaOrOptionsOrHandler:
    | z.ZodSchema<TReq>
    | WrapSocketHandlerOptions<TReq>
    | SocketHandlerFn<TReq, TRes>,
  maybeHandler?: SocketHandlerFn<TReq, TRes>,
): ParsedOptions<TReq, TRes> {
  if (typeof schemaOrOptionsOrHandler === "function") {
    return { handler: schemaOrOptionsOrHandler as SocketHandlerFn<TReq, TRes> };
  }
  if (
    "safeParse" in schemaOrOptionsOrHandler &&
    typeof (schemaOrOptionsOrHandler as z.ZodSchema<TReq>).safeParse === "function"
  ) {
    return {
      schema: schemaOrOptionsOrHandler as z.ZodSchema<TReq>,
      handler: maybeHandler as SocketHandlerFn<TReq, TRes>,
    };
  }
  const opts = schemaOrOptionsOrHandler as WrapSocketHandlerOptions<TReq>;
  return {
    schema: opts.schema,
    rateLimiter: opts.rateLimiter,
    trustProxy: opts.trustProxy,
    handler: maybeHandler as SocketHandlerFn<TReq, TRes>,
  };
}

function buildErrorPayload(
  err: unknown,
  correlationId: string,
): {
  statusCode: number;
  code: ErrorCode;
  clientMessage: string;
  details?: Record<string, unknown>;
  rawError: unknown;
} {
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

  const clientMessage =
    statusCode < 500 && err instanceof Error
      ? err.message
      : "An internal server error occurred";

  return {
    statusCode,
    code,
    clientMessage,
    details: errorRecord?.details,
    rawError: err,
  };
}

function dispatchResponse<TRes>(
  callback: ((res: TRes) => void) | undefined,
  socketObj: SocketLike | undefined,
  success: boolean,
  dataOrError: unknown,
): void {
  if (typeof callback === "function") {
    if (success) {
      callback(dataOrError as TRes);
    } else {
      callback({
        success: false,
        error: dataOrError,
      } as unknown as TRes);
    }
  } else if (!success && socketObj && typeof socketObj.emit === "function") {
    socketObj.emit("error", dataOrError);
  }
}

/**
 * Higher-order interceptor providing 3-point automated structured logging
 * (start, success, failure) with correlation IDs, latency tracking, and structured error responses.
 *
 * Uses static operation names in log messages (MIN-011) and full sensitive payload redaction (MIN-012).
 * Integrates optional rate limiting with structured drops logging (CRIT-001).
 * Decomposed into focused helper functions (MAJ-038).
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
  options: WrapSocketHandlerOptions<TReq>,
  handler: SocketHandlerFn<TReq, TRes>,
): (req: unknown, callback?: (res: TRes) => void) => Promise<TRes | undefined>;
export function wrapSocketHandler<TReq, TRes>(
  logger: Logger,
  operationName: string,
  socket: SocketLike | string,
  schemaOrOptionsOrHandler:
    | z.ZodSchema<TReq>
    | WrapSocketHandlerOptions<TReq>
    | SocketHandlerFn<TReq, TRes>,
  maybeHandler?: SocketHandlerFn<TReq, TRes>,
) {
  const { schema, rateLimiter, trustProxy, handler } = parseHandlerArguments(
    schemaOrOptionsOrHandler,
    maybeHandler,
  );

  const socketId = typeof socket === "string" ? socket : socket.id;
  const socketObj = typeof socket === "object" ? socket : undefined;

  const effectiveTrustProxy =
    trustProxy ??
    (socketObj?.data?.["trustProxy"] as boolean | undefined) ??
    false;

  const effectiveRateLimiter =
    rateLimiter ??
    (socketObj?.data?.["rateLimiter"] as SocketRateLimiter | undefined);

  const clientIp = socketObj ? extractClientIp(socketObj, effectiveTrustProxy) : undefined;

  return async (
    rawReq: unknown,
    callback?: (res: TRes) => void,
  ): Promise<TRes | undefined> => {
    const correlationId = randomUUID();
    const startTime = performance.now();
    const userId = extractUserId(rawReq, socketObj);

    logger.info("Operation started", {
      operation: operationName,
      correlationId,
      socketId,
      ...(clientIp ? { clientIp } : {}),
      ...(userId ? { userId } : {}),
      payload: sanitizePayload(rawReq),
    });

    // 1. Rate Limiting Pre-check (CRIT-001, MAJ-001, MAJ-003)
    const rateLimitKey = clientIp || "127.0.0.1";
    if (effectiveRateLimiter && !effectiveRateLimiter.consume(rateLimitKey)) {
      const duration = Math.round(performance.now() - startTime);
      const limitDesc =
        (effectiveRateLimiter as any).getLimitDescription?.() ||
        "Rate limit exceeded. Please wait.";
      const errorPayload: SocketErrorPayload = {
        code: "ERR_RATE_LIMITED",
        message: limitDesc,
        correlationId,
      };

      logger.warn("Operation rate limit exceeded", {
        operation: operationName,
        correlationId,
        socketId,
        clientIp,
        ...(userId ? { userId } : {}),
        duration,
        durationMs: duration,
        status: "rate_limited",
        error: { code: errorPayload.code, message: errorPayload.message },
      });

      dispatchResponse(callback, socketObj, false, errorPayload);
      return undefined;
    }

    let validatedReq = rawReq as TReq;

    // 2. Ingress Schema Validation (if schema provided)
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

        logger.warn("Operation validation failed", {
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

        dispatchResponse(callback, socketObj, false, errorPayload);
        return undefined;
      }
      validatedReq = validation.data;
    }

    // 3. Execution & Result Dispatch
    try {
      const result = await handler(validatedReq, {
        correlationId,
        socketId,
        clientIp,
        userId,
      });
      const duration = Math.round(performance.now() - startTime);

      logger.info("Operation succeeded", {
        operation: operationName,
        correlationId,
        socketId,
        ...(clientIp ? { clientIp } : {}),
        ...(userId ? { userId } : {}),
        duration,
        durationMs: duration,
        status: "success",
      });

      dispatchResponse(callback, socketObj, true, result);
      return result;
    } catch (err: unknown) {
      const duration = Math.round(performance.now() - startTime);
      const { statusCode, code, clientMessage, details, rawError } = buildErrorPayload(
        err,
        correlationId,
      );

      const errorPayload: SocketErrorPayload = {
        code,
        message: clientMessage,
        correlationId,
        ...(details ? { details } : {}),
      };

      if (code === "ERR_RATE_LIMITED") {
        logger.warn("Operation rate limit exceeded", {
          operation: operationName,
          correlationId,
          socketId,
          ...(clientIp ? { clientIp } : {}),
          ...(userId ? { userId } : {}),
          duration,
          durationMs: duration,
          status: "rate_limited",
          error: { code, message: clientMessage },
        });
      } else if (statusCode < 500) {
        logger.warn("Operation rejected", {
          operation: operationName,
          correlationId,
          socketId,
          ...(clientIp ? { clientIp } : {}),
          ...(userId ? { userId } : {}),
          duration,
          durationMs: duration,
          status: "rejected",
          error: {
            code,
            message: rawError instanceof Error ? rawError.message : String(rawError),
          },
        });
      } else {
        logger.error("Operation failed", {
          operation: operationName,
          correlationId,
          socketId,
          ...(clientIp ? { clientIp } : {}),
          ...(userId ? { userId } : {}),
          duration,
          durationMs: duration,
          status: "failed",
          error:
            rawError instanceof Error
              ? { name: rawError.name, message: rawError.message, stack: rawError.stack }
              : { raw: rawError },
        });
      }

      dispatchResponse(callback, socketObj, false, errorPayload);
      return undefined;
    }
  };
}
