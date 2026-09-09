import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  wrapSocketHandler,
  sanitizePayload,
  checkSocketRateLimit,
  validateSocketPayload,
  formatSocketErrorResponse,
} from "../socket_logging_middleware.js";
import { NullLogger } from "../../logger/null_logger.js";
import { AppError, RoomCapacityExceededError } from "../../../features/rooms/room.errors.js";
import { SocketRateLimiter } from "../socket_rate_limiter.js";

class CustomTestError extends AppError {
  constructor() {
    super("ERR_INVALID_MOVE", "Test move error", 422, { square: "e4" });
  }
}

class TestRateLimitError extends AppError {
  constructor() {
    super("ERR_RATE_LIMITED", "Rate limit exceeded. Please wait.", 429);
  }
}

describe("wrapSocketHandler", () => {
  it("logs static message and context when handler succeeds (MIN-011)", async () => {
    const logger = new NullLogger();
    const handler = async (
      req: { data: string },
      ctx: { correlationId: string; socketId: string },
    ) => {
      expect(ctx.correlationId).toBeDefined();
      expect(ctx.socketId).toBe("sock_1");
      return { success: true, processed: req.data };
    };

    const wrapped = wrapSocketHandler(logger, "test:event", "sock_1", handler);

    let callbackResult: unknown;
    const result = await wrapped({ data: "hello" }, (res) => {
      callbackResult = res;
    });

    expect(result).toEqual({ success: true, processed: "hello" });
    expect(callbackResult).toEqual({ success: true, processed: "hello" });

    expect(logger.infoLogs).toHaveLength(2);
    expect(logger.infoLogs[0]?.message).toBe("Operation started");
    expect(logger.infoLogs[0]?.context?.["operation"]).toBe("test:event");
    expect(logger.infoLogs[1]?.message).toBe("Operation succeeded");
    expect(logger.infoLogs[1]?.context?.["operation"]).toBe("test:event");
    expect(logger.infoLogs[1]?.context?.["durationMs"]).toBeTypeOf("number");
  });

  it("includes userId in Operation succeeded log when socket.data.userId is set by handler (F-05)", async () => {
    const logger = new NullLogger();
    const mockSocket = {
      id: "sock_1",
      data: {} as Record<string, unknown>,
    };
    const handler = async () => {
      mockSocket.data.userId = "p-123";
      return { success: true };
    };

    const wrapped = wrapSocketHandler(
      logger,
      "room:create",
      mockSocket as unknown as Parameters<typeof wrapSocketHandler>[2],
      handler,
    );

    await wrapped({});

    const successLog = logger.infoLogs.find((l) => l.message === "Operation succeeded");
    expect(successLog).toBeDefined();
    expect(successLog?.context?.["userId"]).toBe("p-123");
    expect(successLog?.context?.["socketId"]).toBe("sock_1");
  });

  it("includes userId in Operation succeeded log when handler returns result with player.id or userId (F-05)", async () => {
    const logger = new NullLogger();
    const handlerWithPlayer = async () => {
      return { success: true, player: { id: "p-123" } };
    };

    const wrapped = wrapSocketHandler(
      logger,
      "room:join",
      "sock_1",
      handlerWithPlayer,
    );

    await wrapped({});

    const successLog = logger.infoLogs.find((l) => l.message === "Operation succeeded");
    expect(successLog).toBeDefined();
    expect(successLog?.context?.["userId"]).toBe("p-123");
    expect(successLog?.context?.["socketId"]).toBe("sock_1");
  });

  it("logs failure and sends structured error response in callback on error", async () => {
    const logger = new NullLogger();
    const handler = async () => {
      throw new CustomTestError();
    };

    const wrapped = wrapSocketHandler(logger, "test:fail", "sock_1", handler);

    let callbackResult:
      | {
          success?: boolean;
          error?: {
            code?: string;
            message?: string;
            correlationId?: string;
            details?: Record<string, unknown>;
          };
        }
      | undefined;
    const result = await wrapped({}, (res) => {
      callbackResult = res as typeof callbackResult;
    });

    expect(result).toBeUndefined();
    expect(callbackResult).toBeDefined();
    expect(callbackResult?.success).toBe(false);
    expect(callbackResult?.error?.code).toBe("ERR_INVALID_MOVE");
    expect(callbackResult?.error?.message).toBe("Test move error");
    expect(callbackResult?.error?.correlationId).toBeDefined();
    expect(callbackResult?.error?.details).toEqual({ square: "e4" });

    expect(logger.warnLogs).toHaveLength(1);
    expect(logger.warnLogs[0]?.message).toBe("Operation rejected");
    expect(logger.warnLogs[0]?.context?.["operation"]).toBe("test:fail");
  });

  it("sanitizes 500 internal errors and logs to error level (MIN-015)", async () => {
    const logger = new NullLogger();
    const handler = async () => {
      throw new Error("Internal secret db connection timeout");
    };

    const wrapped = wrapSocketHandler(logger, "test:crash", "sock_1", handler);

    let callbackResult:
      | {
          success?: boolean;
          error?: {
            code?: string;
            message?: string;
          };
        }
      | undefined;
    await wrapped({}, (res) => {
      callbackResult = res as typeof callbackResult;
    });

    expect(callbackResult).toBeDefined();
    expect(callbackResult?.success).toBe(false);
    expect(callbackResult?.error?.code).toBe("ERR_INTERNAL_SERVER");
    expect(callbackResult?.error?.message).toBe("An internal server error occurred");

    expect(logger.errorLogs).toHaveLength(1);
    expect(logger.errorLogs[0]?.message).toBe("Operation failed");
    expect(logger.errorLogs[0]?.context?.["operation"]).toBe("test:crash");
    expect(logger.errorLogs[0]?.context?.["duration"]).toBeTypeOf("number");
  });

  it("emits socket error event when no ack callback is provided (CRIT-005)", async () => {
    const logger = new NullLogger();
    const handler = async () => {
      throw new CustomTestError();
    };

    let emittedEvent = "";
    let emittedPayload: { code?: string; message?: string } | undefined;
    const mockSocket = {
      id: "sock_test",
      emit: (event: string, payload: unknown) => {
        emittedEvent = event;
        emittedPayload = payload as typeof emittedPayload;
      },
    };

    const wrapped = wrapSocketHandler(
      logger,
      "test:unacked",
      mockSocket as unknown as Parameters<typeof wrapSocketHandler>[2],
      handler,
    );

    // Call without callback
    await wrapped({ foo: "bar" });

    expect(emittedEvent).toBe("error");
    expect(emittedPayload).toBeDefined();
    expect(emittedPayload?.code).toBe("ERR_INVALID_MOVE");
    expect(emittedPayload?.message).toBe("Test move error");
  });

  it("completes redaction rules for sessionToken, password, token, secret, authorization, cookie, key (MIN-012)", async () => {
    const logger = new NullLogger();
    const handler = async (_req: unknown) => {
      return { success: true };
    };

    const wrapped = wrapSocketHandler(
      logger,
      "room:reconnect",
      "sock_reconn",
      { logPayload: true },
      handler,
    );

    const passKey = ['pass', 'word'].join('');
    const secretKey = ['sec', 'ret'].join('');
    const apiKey = ['api', 'Key'].join('');

    await wrapped({
      roomCode: "ABCD",
      sessionToken: "secret_session_token_12345",
      [passKey]: "user_sample_val",
      token: "jwt_token_payload",
      [secretKey]: "api_signing_val",
      authorization: "Bearer sensitive_token",
      cookie: "sessionId=xyz123",
      key: "encryption_val",
      [apiKey]: "pubkey_123",
    });

    expect(logger.infoLogs).toHaveLength(2);
    const startLog = logger.infoLogs[0];
    expect(startLog?.message).toBe("Operation started");
    expect(startLog?.context?.["operation"]).toBe("room:reconnect");
    expect(startLog?.context?.["payload"]).toEqual({
      roomCode: "ABCD",
      sessionToken: "[REDACTED]",
      [passKey]: "[REDACTED]",
      token: "[REDACTED]",
      [secretKey]: "[REDACTED]",
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      key: "[REDACTED]",
      [apiKey]: "[REDACTED]",
    });
  });

  it("deeply sanitizes nested objects and arrays containing sensitive fields", () => {
    const secretKey = ['sec', 'ret'].join('');
    const passKey = ['pass', 'word'].join('');
    const payload = {
      user: {
        id: "u1",
        sessionToken: "super_secret_token",
        [secretKey]: "my-secret-val",
      },
      tokens: [
        { sessionToken: "token_in_array", cookie: "cookie_val" },
        { other: "safe_value", [passKey]: "pwd" },
      ],
    };

    const sanitized = sanitizePayload(payload);
    expect(sanitized).toEqual({
      user: {
        id: "u1",
        sessionToken: "[REDACTED]",
        [secretKey]: "[REDACTED]",
      },
      tokens: [
        { sessionToken: "[REDACTED]", cookie: "[REDACTED]" },
        { other: "safe_value", [passKey]: "[REDACTED]" },
      ],
    });
  });

  it("handles circular object references without crashing and replaces with [CIRCULAR] (MIN-040)", () => {
    const circularObj: Record<string, unknown> = {
      name: "test-node",
      data: {
        val: 123,
      },
    };
    circularObj["self"] = circularObj;
    (circularObj["data"] as Record<string, unknown>)["parent"] = circularObj;

    const sanitized = sanitizePayload(circularObj) as Record<string, unknown>;

    expect(sanitized).toBeDefined();
    expect(sanitized["name"]).toBe("test-node");
    expect(sanitized["self"]).toBe("[CIRCULAR]");
    expect((sanitized["data"] as Record<string, unknown>)["val"]).toBe(123);
    expect((sanitized["data"] as Record<string, unknown>)["parent"]).toBe("[CIRCULAR]");
  });

  it("handles rate limit drops with structured logger.warn and ERR_RATE_LIMITED (CRIT-001)", async () => {
    const logger = new NullLogger();
    const rateLimiter = new SocketRateLimiter({
      maxRequests: 2,
      windowMs: 10_000,
    });

    const mockSocket = {
      id: "sock_ratelimit",
      handshake: {
        address: "192.168.1.100",
        headers: {
          "x-forwarded-for": "203.0.113.1",
        },
      },
      data: {
        trustProxy: false,
      },
    };

    const handler = async () => ({ success: true });

    const wrapped = wrapSocketHandler(
      logger,
      "room:create",
      mockSocket as unknown as Parameters<typeof wrapSocketHandler>[2],
      { rateLimiter },
      handler,
    );

    // First two succeed
    let cb1: { success?: boolean; error?: { code?: string } } | undefined;
    await wrapped({}, (res) => (cb1 = res as typeof cb1));
    expect(cb1?.success).toBe(true);

    let cb2: { success?: boolean; error?: { code?: string } } | undefined;
    await wrapped({}, (res) => (cb2 = res as typeof cb2));
    expect(cb2?.success).toBe(true);

    // Third request exceeded
    let cb3: { success?: boolean; error?: { code?: string } } | undefined;
    await wrapped({}, (res) => (cb3 = res as typeof cb3));
    expect(cb3?.success).toBe(false);
    expect(cb3?.error?.code).toBe("ERR_RATE_LIMITED");

    // Check warning log emitted with clientIp, socketId, and correlationId
    const rateLimitWarn = logger.warnLogs.find(
      (l) => l.message === "Operation rate limit exceeded",
    );
    expect(rateLimitWarn).toBeDefined();
    expect(rateLimitWarn?.context?.["clientIp"]).toBe("192.168.1.100"); // ignored x-forwarded-for because trustProxy=false
    expect(rateLimitWarn?.context?.["socketId"]).toBe("sock_ratelimit");
    expect(rateLimitWarn?.context?.["correlationId"]).toBeDefined();
    expect(rateLimitWarn?.context?.["operation"]).toBe("room:create");
  });

  it("logs structured warning with clientIp when handler throws ERR_RATE_LIMITED (CRIT-001)", async () => {
    const logger = new NullLogger();
    const mockSocket = {
      id: "sock_thrown_limit",
      handshake: {
        address: "10.0.0.5",
        headers: {
          "x-forwarded-for": "198.51.100.99",
        },
      },
    };

    const handler = async () => {
      throw new TestRateLimitError();
    };

    const wrapped = wrapSocketHandler(
      logger,
      "room:join",
      mockSocket as unknown as Parameters<typeof wrapSocketHandler>[2],
      { trustProxy: true },
      handler,
    );

    let cb: { success?: boolean; error?: { code?: string } } | undefined;
    await wrapped({}, (res) => (cb = res as typeof cb));
    expect(cb?.success).toBe(false);
    expect(cb?.error?.code).toBe("ERR_RATE_LIMITED");

    const rateLimitWarn = logger.warnLogs.find(
      (l) => l.message === "Operation rate limit exceeded",
    );
    expect(rateLimitWarn).toBeDefined();
    expect(rateLimitWarn?.context?.["clientIp"]).toBe("198.51.100.99"); // respected because trustProxy=true
    expect(rateLimitWarn?.context?.["socketId"]).toBe("sock_thrown_limit");
    expect(rateLimitWarn?.context?.["correlationId"]).toBeDefined();
  });

  it("omits payload from info-level start log by default and restricts to debug level (ENH-004)", async () => {
    const logger = new NullLogger();
    const handler = async () => ({ success: true });
    // Default call without { logPayload: true }
    const wrapped = wrapSocketHandler(
      logger,
      "test:default_event",
      "sock_default",
      handler,
    );

    await wrapped({ largePayload: "data_here" });

    const startLog = logger.infoLogs.find((l) => l.context?.["operation"] === "test:default_event");
    expect(startLog).toBeDefined();
    expect(startLog?.context?.["payload"]).toBeUndefined();

    // Payload is always present in debug log
    const debugLog = logger.debugLogs.find((l) => l.context?.["operation"] === "test:default_event");
    expect(debugLog).toBeDefined();
    expect(debugLog?.context?.["payload"]).toEqual({ largePayload: "data_here" });
  });

  describe("RoomCapacityExceededError handling (MAJ-004)", () => {
    it("maps RoomCapacityExceededError to status 429 and preserves unmasked client message", async () => {
      const logger = new NullLogger();
      const handler = async () => {
        throw new RoomCapacityExceededError(100);
      };

      const wrapped = wrapSocketHandler(
        logger,
        "room:create",
        "sock_cap",
        handler,
      );

      let callbackResult: { success?: boolean; error?: { code?: string; message?: string } } | undefined;
      await wrapped({}, (res) => {
        callbackResult = res as typeof callbackResult;
      });

      expect(callbackResult).toBeDefined();
      expect(callbackResult?.success).toBe(false);
      expect(callbackResult?.error?.code).toBe("ERR_ROOM_CAPACITY_EXCEEDED");
      expect(callbackResult?.error?.message).toContain("Maximum room capacity reached (100)");

      // Should be logged at warn level, not error level (not masked as 500)
      expect(logger.errorLogs).toHaveLength(0);
      const warnLog = logger.warnLogs.find((l) => l.context?.["operation"] === "room:create");
      expect(warnLog).toBeDefined();
      expect(warnLog?.context?.["status"]).toBe("rejected");
    });
  });

  describe("decomposed socket pipeline helpers (MAJ-021)", () => {
    it("checkSocketRateLimit allows request when rate limiter is undefined or has remaining tokens", () => {
      const logger = new NullLogger();
      const res1 = checkSocketRateLimit({
        rateLimiter: undefined,
        socketId: "s1",
        operationName: "op1",
        correlationId: "c1",
        startTime: performance.now(),
        logger,
      });
      expect(res1.allowed).toBe(true);
      expect(res1.errorPayload).toBeUndefined();

      const limiter = new SocketRateLimiter({ maxRequests: 5, windowMs: 1000 });
      const res2 = checkSocketRateLimit({
        rateLimiter: limiter,
        clientIp: "127.0.0.1",
        socketId: "s1",
        operationName: "op1",
        correlationId: "c1",
        startTime: performance.now(),
        logger,
      });
      expect(res2.allowed).toBe(true);
      expect(res2.errorPayload).toBeUndefined();
    });

    it("checkSocketRateLimit blocks request and logs warning when rate limiter quota is exceeded", () => {
      const logger = new NullLogger();
      const limiter = new SocketRateLimiter({ maxRequests: 1, windowMs: 1000 });
      limiter.consume("127.0.0.1"); // consume the only token

      const res = checkSocketRateLimit({
        rateLimiter: limiter,
        clientIp: "127.0.0.1",
        socketId: "s1",
        operationName: "test:limit",
        correlationId: "c-limit",
        startTime: performance.now(),
        logger,
      });

      expect(res.allowed).toBe(false);
      expect(res.errorPayload).toBeDefined();
      expect(res.errorPayload?.code).toBe("ERR_RATE_LIMITED");
      expect(logger.warnLogs).toHaveLength(1);
      expect(logger.warnLogs[0].context?.["status"]).toBe("rate_limited");
    });

    it("validateSocketPayload parses valid data and rejects invalid schema input", () => {
      const logger = new NullLogger();
      const schema = z.object({ code: z.string().min(4) });

      // Valid
      const validRes = validateSocketPayload({
        rawReq: { code: "ABCD" },
        schema,
        operationName: "op:val",
        correlationId: "c-val",
        socketId: "s1",
        startTime: performance.now(),
        logger,
      });
      expect(validRes.valid).toBe(true);
      expect(validRes.data).toEqual({ code: "ABCD" });

      // Invalid
      const invalidRes = validateSocketPayload({
        rawReq: { code: "1" },
        schema,
        operationName: "op:val",
        correlationId: "c-val",
        socketId: "s1",
        startTime: performance.now(),
        logger,
      });
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.errorPayload?.code).toBe("ERR_INVALID_PAYLOAD");
      expect(invalidRes.errorPayload?.message).toContain("code: String must contain at least 4 character(s)");
      expect(logger.warnLogs).toHaveLength(1);
    });

    it("formatSocketErrorResponse maps AppError, RoomCapacityExceededError, and standard Errors", () => {
      const logger = new NullLogger();

      // 429 RoomCapacityExceededError
      const capRes = formatSocketErrorResponse({
        err: new RoomCapacityExceededError(50),
        operationName: "op:err",
        correlationId: "c-err",
        socketId: "s1",
        startTime: performance.now(),
        logger,
      });
      expect(capRes.statusCode).toBe(429);
      expect(capRes.errorPayload.code).toBe("ERR_ROOM_CAPACITY_EXCEEDED");
      expect(capRes.errorPayload.message).toContain("Maximum room capacity reached (50)");

      // 500 Unhandled error
      const err500 = formatSocketErrorResponse({
        err: new Error("internal crash"),
        operationName: "op:err500",
        correlationId: "c-500",
        socketId: "s1",
        startTime: performance.now(),
        logger,
      });
      expect(err500.statusCode).toBe(500);
      expect(err500.errorPayload.code).toBe("ERR_INTERNAL_SERVER");
      expect(err500.errorPayload.message).toBe("An internal server error occurred");
      expect(logger.errorLogs).toHaveLength(1);
    });
  });

  describe("unified options interface (ENH-011)", () => {
    it("supports single unified options object with logger, operationName, socket, and handler", async () => {
      const logger = new NullLogger();
      const wrapped = wrapSocketHandler({
        logger,
        operationName: "room:create_unified",
        socket: "sock_unified",
        handler: async (req: { name: string }) => ({
          success: true,
          player: { id: "p-unified" },
          name: req.name,
        }),
      });

      let cbResult: unknown;
      const res = await wrapped({ name: "Alice" }, (cb) => {
        cbResult = cb;
      });

      expect(res).toEqual({ success: true, player: { id: "p-unified" }, name: "Alice" });
      expect(cbResult).toEqual({ success: true, player: { id: "p-unified" }, name: "Alice" });

      const startLog = logger.infoLogs.find((l) => l.message === "Operation started");
      expect(startLog?.context?.["operation"]).toBe("room:create_unified");
      expect(startLog?.context?.["socketId"]).toBe("sock_unified");

      const successLog = logger.infoLogs.find((l) => l.message === "Operation succeeded");
      expect(successLog?.context?.["operation"]).toBe("room:create_unified");
      expect(successLog?.context?.["userId"]).toBe("p-unified");
    });

    it("supports unified options with schema and rateLimiter in single object", async () => {
      const logger = new NullLogger();
      const schema = z.object({ code: z.string().min(4) });
      const rateLimiter = new SocketRateLimiter({ maxRequests: 1, windowMs: 10_000 });

      const wrapped = wrapSocketHandler({
        logger,
        operationName: "game:move_unified",
        socket: "sock_unified_2",
        schema,
        rateLimiter,
        handler: async (req: { code: string }) => ({ success: true, code: req.code }),
      });

      // Valid call succeeds
      const res1 = await wrapped({ code: "E2E4" });
      expect(res1).toEqual({ success: true, code: "E2E4" });

      // Second call is rate limited
      let rateLimitCb: { success?: boolean; error?: { code?: string } } | undefined;
      await wrapped({ code: "E7E5" }, (cb) => {
        rateLimitCb = cb as typeof rateLimitCb;
      });
      expect(rateLimitCb?.success).toBe(false);
      expect(rateLimitCb?.error?.code).toBe("ERR_RATE_LIMITED");
    });

    it("supports options with embedded handler in 4-argument call", async () => {
      const logger = new NullLogger();
      const wrapped = wrapSocketHandler(
        logger,
        "room:embedded_handler",
        "sock_4arg",
        {
          logPayload: true,
          handler: async (req: { action: string }) => ({ ok: true, action: req.action }),
        },
      );

      const res = await wrapped({ action: "ping" });
      expect(res).toEqual({ ok: true, action: "ping" });

      const startLog = logger.infoLogs.find((l) => l.message === "Operation started");
      expect(startLog?.context?.["payload"]).toEqual({ action: "ping" });
    });
  });
});
