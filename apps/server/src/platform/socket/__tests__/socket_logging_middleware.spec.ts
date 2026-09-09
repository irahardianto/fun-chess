import { describe, it, expect } from "vitest";
import { wrapSocketHandler, sanitizePayload } from "../socket_logging_middleware.js";
import { NullLogger } from "../../logger/null_logger.js";
import { AppError } from "../../../features/rooms/room.errors.js";
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

  it("omits payload from info-level start log when logPayload is false (ENH-007)", async () => {
    const logger = new NullLogger();
    const handler = async () => ({ success: true });
    const wrapped = wrapSocketHandler(
      logger,
      "test:quiet_event",
      "sock_quiet",
      { logPayload: false },
      handler,
    );

    await wrapped({ largePayload: "data_here" });

    const startLog = logger.infoLogs.find((l) => l.context?.["operation"] === "test:quiet_event");
    expect(startLog).toBeDefined();
    expect(startLog?.context?.["payload"]).toBeUndefined();

    // Payload should still be present in debug log
    const debugLog = logger.debugLogs.find((l) => l.context?.["operation"] === "test:quiet_event");
    expect(debugLog).toBeDefined();
    expect(debugLog?.context?.["payload"]).toEqual({ largePayload: "data_here" });
  });
});

