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

/**
 * Unified configuration options for wrapSocketHandler interceptor (ENH-011).
 * Can be provided either as a single consolidated options object, or as an options bag
 * alongside positional logger/socket arguments.
 */
export interface WrapSocketHandlerOptions<TPayload = unknown, TRes = unknown> {
  /** Logger instance for 3-point structured observability logs */
  logger?: Logger;
  /** Operation identifier (e.g. "room:create") */
  operationName?: string;
  /** Socket instance or identifier */
  socket?: SocketLike | string;
  /** Ingress payload validation schema */
  schema?: z.ZodType<TPayload>;
  /** Rate limiter instance */
  rateLimiter?: SocketRateLimiter;
  /** Trust proxy headers for IP resolution */
  trustProxy?: boolean;
  /**
   * Whether to include sanitized payload in the info-level "Operation started" log.
   * Default: false (ENH-004). Set to true if payload is explicitly required at info level.
   * Note: payload is always logged at debug level.
   */
  logPayload?: boolean;
  /** Core socket operation handler function */
  handler?: SocketHandlerFn<TPayload, TRes>;
  /** Optional custom rate limit error message or message formatter (ENH-006) */
  rateLimitErrorMessage?:
    | string
    | ((operationName: string, defaultLimitDesc: string) => string);
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

function extractUserId(
  rawReq: unknown,
  socketObj?: SocketLike,
): string | undefined {
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

interface ParsedOptions<TPayload, TRes> {
  schema?: z.ZodType<TPayload>;
  rateLimiter?: SocketRateLimiter;
  trustProxy?: boolean;
  logPayload?: boolean;
  handler: SocketHandlerFn<TPayload, TRes>;
  rateLimitErrorMessage?:
    | string
    | ((operationName: string, defaultLimitDesc: string) => string);
}

function parseHandlerArguments<TPayload, TRes>(
  schemaOrOptionsOrHandler?:
    | z.ZodType<TPayload>
    | WrapSocketHandlerOptions<TPayload, TRes>
    | SocketHandlerFn<TPayload, TRes>,
  maybeHandler?: SocketHandlerFn<TPayload, TRes>,
): ParsedOptions<TPayload, TRes> {
  if (typeof schemaOrOptionsOrHandler === "function") {
    return { handler: schemaOrOptionsOrHandler as SocketHandlerFn<TPayload, TRes> };
  }
  if (
    schemaOrOptionsOrHandler &&
    "safeParse" in schemaOrOptionsOrHandler &&
    typeof (schemaOrOptionsOrHandler as z.ZodType<TPayload>).safeParse === "function"
  ) {
    if (!maybeHandler) {
      throw new TypeError("wrapSocketHandler requires a handler function when schema is provided");
    }
    return {
      schema: schemaOrOptionsOrHandler as z.ZodType<TPayload>,
      handler: maybeHandler,
    };
  }
  const opts = (schemaOrOptionsOrHandler || {}) as WrapSocketHandlerOptions<TPayload, TRes>;
  const resolvedHandler = maybeHandler ?? opts.handler;
  if (!resolvedHandler) {
    throw new TypeError("wrapSocketHandler requires a handler function");
  }
  return {
    schema: opts.schema,
    rateLimiter: opts.rateLimiter,
    trustProxy: opts.trustProxy,
    logPayload: opts.logPayload,
    handler: resolvedHandler,
    rateLimitErrorMessage: opts.rateLimitErrorMessage,
  };
}

export function buildErrorPayload(err: unknown): {
  statusCode: number;
  code: ErrorCode;
  clientMessage: string;
  details?: Record<string, unknown>;
  rawError: unknown;
} {
  const errorRecord = err as {
    name?: string;
    code?: string;
    statusCode?: number;
    message?: string;
    details?: Record<string, unknown>;
  };

  const isRoomCapacity =
    errorRecord?.name === "RoomCapacityExceededError" ||
    errorRecord?.code === "ERR_ROOM_CAPACITY_EXCEEDED" ||
    errorRecord?.statusCode === 429;

  let statusCode =
    typeof errorRecord?.statusCode === "number" ? errorRecord.statusCode : 500;
  if (isRoomCapacity) {
    statusCode = 429;
  }

  const code: ErrorCode = isRoomCapacity
    ? (errorRecord?.code as ErrorCode) ||
      ("ERR_ROOM_CAPACITY_EXCEEDED" as ErrorCode)
    : (errorRecord?.code as ErrorCode) ||
      (statusCode >= 500 ? "ERR_INTERNAL_SERVER" : "ERR_INVALID_PAYLOAD");

  const clientMessage =
    (isRoomCapacity || statusCode < 500) && err instanceof Error
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

/**
 * Safely dispatches operation response to acknowledgement callback or emits socket error (ENH-010).
 * Wraps callback invocation in try/catch to protect the server process from faulty client callbacks.
 */
export function safeDispatchResponse<TRes>(
  callback: ((res: TRes) => void) | undefined,
  socketObj: SocketLike | undefined,
  success: boolean,
  dataOrError: unknown,
  logger?: Logger,
  context?: { operationName?: string; correlationId?: string; socketId?: string },
): void {
  try {
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
  } catch (dispatchErr: unknown) {
    if (logger) {
      logger.warn("Socket acknowledgment callback threw an error", {
        operation: context?.operationName,
        correlationId: context?.correlationId,
        socketId: context?.socketId,
        error:
          dispatchErr instanceof Error
            ? {
                name: dispatchErr.name,
                message: dispatchErr.message,
                stack: dispatchErr.stack,
              }
            : { raw: dispatchErr },
      });
    }
  }
}

export const dispatchResponse = safeDispatchResponse;

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

export interface ValidatePayloadParams<TReq> {
  rawReq: unknown;
  schema?: z.ZodSchema<TReq>;
  operationName: string;
  correlationId: string;
  socketId: string;
  clientIp?: string;
  userId?: string;
  startTime: number;
  logger: Logger;
}

export interface ValidatePayloadResult<TReq> {
  valid: boolean;
  data?: TReq;
  errorPayload?: SocketErrorPayload;
}

/**
 * Validates incoming socket payload against runtime Zod schema (MAJ-021).
 */
export function validateSocketPayload<TReq>(
  params: ValidatePayloadParams<TReq>,
): ValidatePayloadResult<TReq> {
  const {
    rawReq,
    schema,
    operationName,
    correlationId,
    socketId,
    clientIp,
    userId,
    startTime,
    logger,
  } = params;

  if (!schema) {
    return { valid: true, data: rawReq as TReq };
  }

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

    return { valid: false, errorPayload };
  }

  return { valid: true, data: validation.data };
}

export interface FormatSocketErrorParams {
  err: unknown;
  operationName: string;
  correlationId: string;
  socketId: string;
  clientIp?: string;
  userId?: string;
  startTime: number;
  logger: Logger;
}

export interface FormatSocketErrorResult {
  errorPayload: SocketErrorPayload;
  statusCode: number;
}

/**
 * Normalizes caught exceptions into wire-safe SocketErrorPayload and logs structured event (MAJ-021).
 */
export function formatSocketErrorResponse(
  params: FormatSocketErrorParams,
): FormatSocketErrorResult {
  const {
    err,
    operationName,
    correlationId,
    socketId,
    clientIp,
    userId,
    startTime,
    logger,
  } = params;
  const duration = Math.round(performance.now() - startTime);
  const { statusCode, code, clientMessage, details, rawError } =
    buildErrorPayload(err);

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
        message:
          rawError instanceof Error ? rawError.message : String(rawError),
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
          ? {
              name: rawError.name,
              message: rawError.message,
              stack: rawError.stack,
            }
          : { raw: rawError },
    });
  }

  return { errorPayload, statusCode };
}

export interface SocketPipelineContext extends SocketOperationContext {
  operationName: string;
  startTime: number;
  rawReq: unknown;
  sanitizedPayload: unknown;
  socketObj?: SocketLike;
  logPayload?: boolean;
}

/**
 * Establishes structured tracing context and payload sanitization for socket operations (MAJ-021).
 */
export function withCorrelation(
  socketParam: SocketLike | string,
  rawReq: unknown,
  operationName: string,
  trustProxy?: boolean,
  logPayload?: boolean,
): SocketPipelineContext {
  const socketId = typeof socketParam === "string" ? socketParam : socketParam.id;
  const socketObj = typeof socketParam === "object" ? socketParam : undefined;
  const correlationId = randomUUID();
  const startTime = performance.now();
  const userId = extractUserId(rawReq, socketObj);
  const sanitizedPayload = sanitizePayload(rawReq);

  const effectiveTrustProxy =
    trustProxy ??
    (socketObj?.data?.["trustProxy"] as boolean | undefined) ??
    false;

  const clientIp = socketObj
    ? extractClientIp(socketObj, effectiveTrustProxy)
    : undefined;

  return {
    correlationId,
    socketId,
    clientIp,
    userId,
    startTime,
    operationName,
    rawReq,
    sanitizedPayload,
    socketObj,
    logPayload,
  };
}

/**
 * Rate-limiting pipeline stage for socket operations (MAJ-021, ENH-006).
 */
export function withRateLimit(
  params: CheckRateLimitParams,
): CheckRateLimitResult {
  return checkSocketRateLimit(params);
}

/**
 * Ingress schema validation pipeline stage for socket operations (MAJ-021).
 */
export function withValidation<TReq>(
  params: ValidatePayloadParams<TReq>,
): ValidatePayloadResult<TReq> {
  return validateSocketPayload(params);
}

export function logOperationStart(
  logger: Logger,
  ctx: SocketPipelineContext,
): void {
  const startContext: Record<string, unknown> = {
    operation: ctx.operationName,
    correlationId: ctx.correlationId,
    socketId: ctx.socketId,
    ...(ctx.clientIp ? { clientIp: ctx.clientIp } : {}),
    ...(ctx.userId ? { userId: ctx.userId } : {}),
  };

  if (ctx.logPayload === true) {
    startContext["payload"] = ctx.sanitizedPayload;
  }

  logger.info("Operation started", startContext);
  logger.debug("Operation payload details", {
    operation: ctx.operationName,
    correlationId: ctx.correlationId,
    payload: ctx.sanitizedPayload,
  });
}

export function logOperationSuccess(
  logger: Logger,
  ctx: SocketPipelineContext,
  result: unknown,
): void {
  const duration = Math.round(performance.now() - ctx.startTime);
  const resultUserId =
    typeof result === "object" && result !== null
      ? (result as { player?: { id?: string } }).player?.id ||
        (result as { userId?: string }).userId
      : undefined;
  const resolvedUserId =
    (ctx.socketObj?.data?.["userId"] as string) || resultUserId || ctx.userId;

  logger.info("Operation succeeded", {
    operation: ctx.operationName,
    correlationId: ctx.correlationId,
    socketId: ctx.socketId,
    ...(ctx.clientIp ? { clientIp: ctx.clientIp } : {}),
    ...(resolvedUserId ? { userId: resolvedUserId } : {}),
    duration,
    durationMs: duration,
    status: "success",
  });
}

export interface SocketLoggingStage {
  logStart: () => void;
  logSuccess: (result: unknown) => void;
  logError: (err: unknown) => FormatSocketErrorResult;
}

/**
 * Structured logging pipeline stage providing start, success, and error logging (MAJ-021).
 */
export function withLogging(
  logger: Logger,
  ctx: SocketPipelineContext,
): SocketLoggingStage {
  return {
    logStart: () => logOperationStart(logger, ctx),
    logSuccess: (result: unknown) => logOperationSuccess(logger, ctx, result),
    logError: (err: unknown) =>
      formatSocketErrorResponse({
        err,
        operationName: ctx.operationName,
        correlationId: ctx.correlationId,
        socketId: ctx.socketId,
        clientIp: ctx.clientIp,
        userId: ctx.userId,
        startTime: ctx.startTime,
        logger,
      }),
  };
}

/**
 * Higher-order interceptor providing 3-point automated structured logging
 * (start, success, failure) with correlation IDs, latency tracking, and structured error responses.
 *
 * Uses static operation names in log messages (MIN-011) and full sensitive payload redaction (MIN-012).
 * Integrates optional rate limiting with structured drops logging (CRIT-001).
 * Decomposed into focused helper functions (MAJ-021).
 * Supports unified single-options configuration while maintaining full backward compatibility (ENH-011).
 */
export function wrapSocketHandler<TPayload = unknown, TRes = unknown>(
  options: WrapSocketHandlerOptions<TPayload, TRes> & {
    logger: Logger;
    operationName: string;
    socket: SocketLike | string;
    handler: SocketHandlerFn<TPayload, TRes>;
  },
): (req: unknown, callback?: (res: TRes) => void) => Promise<TRes | undefined>;
export function wrapSocketHandler<TPayload = unknown, TRes = unknown>(
  logger: Logger,
  operationName: string,
  socket: SocketLike | string,
  options: WrapSocketHandlerOptions<TPayload, TRes>,
  handler?: SocketHandlerFn<TPayload, TRes>,
): (req: unknown, callback?: (res: TRes) => void) => Promise<TRes | undefined>;
export function wrapSocketHandler<TPayload = unknown, TRes = unknown>(
  logger: Logger,
  operationName: string,
  socket: SocketLike | string,
  schema: z.ZodType<TPayload>,
  handler: SocketHandlerFn<TPayload, TRes>,
): (req: unknown, callback?: (res: TRes) => void) => Promise<TRes | undefined>;
export function wrapSocketHandler<TPayload = unknown, TRes = unknown>(
  logger: Logger,
  operationName: string,
  socket: SocketLike | string,
  handler: SocketHandlerFn<TPayload, TRes>,
): (req: TPayload, callback?: (res: TRes) => void) => Promise<TRes | undefined>;
export function wrapSocketHandler<TPayload = unknown, TRes = unknown>(
  loggerOrOptions:
    | Logger
    | (WrapSocketHandlerOptions<TPayload, TRes> & {
        logger: Logger;
        operationName: string;
        socket: SocketLike | string;
        handler: SocketHandlerFn<TPayload, TRes>;
      }),
  rawOperationName?: string,
  rawSocket?: SocketLike | string,
  schemaOrOptionsOrHandler?:
    | z.ZodType<TPayload>
    | WrapSocketHandlerOptions<TPayload, TRes>
    | SocketHandlerFn<TPayload, TRes>,
  maybeHandler?: SocketHandlerFn<TPayload, TRes>,
) {
  let logger: Logger;
  let operationName: string;
  let socketParam: SocketLike | string;
  let schema: z.ZodType<TPayload> | undefined;
  let rateLimiter: SocketRateLimiter | undefined;
  let trustProxy: boolean | undefined;
  let logPayload: boolean | undefined;
  let handler: SocketHandlerFn<TPayload, TRes>;
  let rateLimitErrorMessage:
    | string
    | ((operationName: string, defaultLimitDesc: string) => string)
    | undefined;

  const isUnifiedOptions =
    typeof loggerOrOptions === "object" &&
    loggerOrOptions !== null &&
    !("info" in loggerOrOptions);

  if (isUnifiedOptions) {
    const opts = loggerOrOptions as WrapSocketHandlerOptions<TPayload, TRes> & {
      logger: Logger;
      operationName: string;
      socket: SocketLike | string;
      handler: SocketHandlerFn<TPayload, TRes>;
    };
    if (!opts.logger || !opts.operationName || !opts.socket || !opts.handler) {
      throw new TypeError(
        "wrapSocketHandler unified options requires logger, operationName, socket, and handler",
      );
    }
    logger = opts.logger;
    operationName = opts.operationName;
    socketParam = opts.socket;
    schema = opts.schema;
    rateLimiter = opts.rateLimiter;
    trustProxy = opts.trustProxy;
    logPayload = opts.logPayload;
    handler = opts.handler;
    rateLimitErrorMessage = opts.rateLimitErrorMessage;
  } else {
    logger = loggerOrOptions as Logger;
    operationName = rawOperationName!;
    socketParam = rawSocket!;

    const parsed = parseHandlerArguments<TPayload, TRes>(
      schemaOrOptionsOrHandler,
      maybeHandler,
    );
    schema = parsed.schema;
    rateLimiter = parsed.rateLimiter;
    trustProxy = parsed.trustProxy;
    logPayload = parsed.logPayload;
    handler = parsed.handler;
    rateLimitErrorMessage = parsed.rateLimitErrorMessage;
  }

  return async (
    rawReq: unknown,
    callback?: (res: TRes) => void,
  ): Promise<TRes | undefined> => {
    const ctx = withCorrelation(
      socketParam,
      rawReq,
      operationName,
      trustProxy,
      logPayload,
    );

    const logging = withLogging(logger, ctx);
    logging.logStart();

    const dispatchContext = {
      operationName,
      correlationId: ctx.correlationId,
      socketId: ctx.socketId,
    };

    const effectiveRateLimiter =
      rateLimiter ??
      (ctx.socketObj?.data?.["rateLimiter"] as SocketRateLimiter | undefined);

    // 1. Rate Limiting Pre-check (CRIT-001, MAJ-001, MAJ-003, MAJ-021, ENH-006)
    const rateLimitResult = withRateLimit({
      rateLimiter: effectiveRateLimiter,
      clientIp: ctx.clientIp,
      socketId: ctx.socketId,
      operationName: ctx.operationName,
      correlationId: ctx.correlationId,
      userId: ctx.userId,
      startTime: ctx.startTime,
      logger,
      rateLimitErrorMessage,
    });
    if (!rateLimitResult.allowed) {
      safeDispatchResponse(
        callback,
        ctx.socketObj,
        false,
        rateLimitResult.errorPayload,
        logger,
        dispatchContext,
      );
      return undefined;
    }

    // 2. Ingress Schema Validation (MAJ-021)
    const validationResult = withValidation({
      rawReq,
      schema,
      operationName: ctx.operationName,
      correlationId: ctx.correlationId,
      socketId: ctx.socketId,
      clientIp: ctx.clientIp,
      userId: ctx.userId,
      startTime: ctx.startTime,
      logger,
    });
    if (!validationResult.valid) {
      safeDispatchResponse(
        callback,
        ctx.socketObj,
        false,
        validationResult.errorPayload,
        logger,
        dispatchContext,
      );
      return undefined;
    }

    // 3. Execution & Result Dispatch (MAJ-021, ENH-010)
    try {
      const result = await handler(validationResult.data as TPayload, {
        correlationId: ctx.correlationId,
        socketId: ctx.socketId,
        clientIp: ctx.clientIp,
        userId: ctx.userId,
      });

      logging.logSuccess(result);
      safeDispatchResponse(
        callback,
        ctx.socketObj,
        true,
        result,
        logger,
        dispatchContext,
      );
      return result;
    } catch (err: unknown) {
      const { errorPayload } = logging.logError(err);
      safeDispatchResponse(
        callback,
        ctx.socketObj,
        false,
        errorPayload,
        logger,
        dispatchContext,
      );
      return undefined;
    }
  };
}
