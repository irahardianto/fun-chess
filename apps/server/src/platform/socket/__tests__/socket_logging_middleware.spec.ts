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

    expect(logger.errorLogs).toHaveLength(1);
    expect(logger.errorLogs[0]?.message).toContain(
      "Operation failed: test:fail",
    );
  });
});
