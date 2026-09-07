import { describe, it, expect } from "vitest";
import { wrapSocketHandler } from "../socket_logging_middleware.js";
import { NullLogger } from "../../logger/null_logger.js";
import { AppError } from "../../../features/rooms/room.errors.js";

class CustomTestError extends AppError {
  constructor() {
    super("ERR_INVALID_MOVE", "Test move error", 422, { square: "e4" });
  }
}

describe("wrapSocketHandler", () => {
  it("logs start and success when handler succeeds", async () => {
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
    expect(logger.infoLogs[0]?.message).toContain(
      "Operation started: test:event",
    );
    expect(logger.infoLogs[1]?.message).toContain(
      "Operation succeeded: test:event",
    );
    expect(logger.infoLogs[1]?.context?.["durationMs"]).toBeTypeOf("number");
  });

  it("logs failure and sends structured error response in callback on error", async () => {
    const logger = new NullLogger();
    const handler = async () => {
      throw new CustomTestError();
    };

    const wrapped = wrapSocketHandler(logger, "test:fail", "sock_1", handler);

    let callbackResult: any;
    const result = await wrapped({}, (res) => {
      callbackResult = res;
    });

    expect(result).toBeUndefined();
    expect(callbackResult).toBeDefined();
    expect(callbackResult.success).toBe(false);
    expect(callbackResult.error.code).toBe("ERR_INVALID_MOVE");
    expect(callbackResult.error.message).toBe("Test move error");
    expect(callbackResult.error.correlationId).toBeDefined();
    expect(callbackResult.error.details).toEqual({ square: "e4" });

    expect(logger.warnLogs).toHaveLength(1);
    expect(logger.warnLogs[0]?.message).toContain(
      "Operation rejected: test:fail",
    );
  });

  it("sanitizes 500 internal errors and logs to error level (MIN-015)", async () => {
    const logger = new NullLogger();
    const handler = async () => {
      throw new Error("Internal secret db connection timeout");
    };

    const wrapped = wrapSocketHandler(logger, "test:crash", "sock_1", handler);

    let callbackResult: any;
    await wrapped({}, (res) => {
      callbackResult = res;
    });

    expect(callbackResult).toBeDefined();
    expect(callbackResult.success).toBe(false);
    expect(callbackResult.error.code).toBe("ERR_INTERNAL_SERVER");
    expect(callbackResult.error.message).toBe("An internal server error occurred");

    expect(logger.errorLogs).toHaveLength(1);
    expect(logger.errorLogs[0]?.message).toContain("Operation failed: test:crash");
    expect(logger.errorLogs[0]?.context?.["duration"]).toBeTypeOf("number");
  });

  it("emits socket error event when no ack callback is provided (CRIT-005)", async () => {
    const logger = new NullLogger();
    const handler = async () => {
      throw new CustomTestError();
    };

    let emittedEvent = "";
    let emittedPayload: any;
    const mockSocket = {
      id: "sock_test",
      emit: (event: string, payload: any) => {
        emittedEvent = event;
        emittedPayload = payload;
      },
    };

    const wrapped = wrapSocketHandler(
      logger,
      "test:unacked",
      mockSocket as any,
      handler,
    );

    // Call without callback
    await wrapped({ foo: "bar" });

    expect(emittedEvent).toBe("error");
    expect(emittedPayload).toBeDefined();
    expect(emittedPayload.code).toBe("ERR_INVALID_MOVE");
    expect(emittedPayload.message).toBe("Test move error");
  });

  it("redacts sessionToken from logged request payloads (SEC-03)", async () => {
    const logger = new NullLogger();
    const handler = async (req: { roomCode: string; sessionToken: string }) => {
      return { success: true, roomCode: req.roomCode };
    };

    const wrapped = wrapSocketHandler(
      logger,
      "room:reconnect",
      "sock_reconn",
      handler,
    );

    await wrapped({
      roomCode: "ABCD",
      sessionToken: "secret_session_token_12345",
    });

    expect(logger.infoLogs).toHaveLength(2);
    const startLog = logger.infoLogs[0];
    expect(startLog?.message).toContain("Operation started: room:reconnect");
    expect(startLog?.context?.["payload"]).toEqual({
      roomCode: "ABCD",
      sessionToken: "[REDACTED]",
    });
  });

  it("deeply sanitizes nested objects and arrays containing sessionToken", async () => {
    const logger = new NullLogger();
    const handler = async (req: any) => {
      return { success: true };
    };

    const wrapped = wrapSocketHandler(
      logger,
      "complex:event",
      "sock_nested",
      handler,
    );

    await wrapped({
      user: {
        id: "u1",
        sessionToken: "super_secret_token",
      },
      tokens: [{ sessionToken: "token_in_array" }, { other: "safe_value" }],
    });

    const startLog = logger.infoLogs[0];
    expect(startLog?.context?.["payload"]).toEqual({
      user: {
        id: "u1",
        sessionToken: "[REDACTED]",
      },
      tokens: [{ sessionToken: "[REDACTED]" }, { other: "safe_value" }],
    });
  });
});

