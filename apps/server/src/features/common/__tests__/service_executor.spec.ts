import { describe, it, expect, vi } from "vitest";
import { AppError, type IClock } from "@fun-chess/shared";
import { executeServiceOperation } from "../service_executor.js";
import type { Logger } from "../../../platform/logger/index.js";

class CustomDomainError extends AppError {
  constructor(message = "Domain error") {
    super("ERR_ROOM_NOT_FOUND", message, 404, { detail: "missing" });
  }
}

class InternalDomainError extends AppError {
  constructor(message = "Internal failure") {
    super("ERR_INTERNAL_SERVER", message, 500);
  }
}

describe("executeServiceOperation (MAJ-012)", () => {
  const createMockLogger = (): Logger => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  });

  const createMockClock = (initialTime = 1000, increment = 50): IClock => {
    let currentTime = initialTime;
    return {
      now: () => {
        const t = currentTime;
        currentTime += increment;
        return t;
      },
    };
  };

  it("executes successful action, records duration, and emits completion log", async () => {
    const logger = createMockLogger();
    const clock = createMockClock(1000, 25);

    const result = await executeServiceOperation(
      {
        operation: "test_op",
        logger,
        clock,
        correlationId: "corr-123",
        metadata: { roomCode: "TEST" },
      },
      async () => "success_value",
    );

    expect(result).toBe("success_value");
    expect(logger.info).toHaveBeenCalledWith(
      "Operation completed: test_op",
      expect.objectContaining({
        operation: "test_op_success",
        duration: 25,
        durationMs: 25,
        correlationId: "corr-123",
        roomCode: "TEST",
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("emits start log when logStart is true", async () => {
    const logger = createMockLogger();
    const clock = createMockClock();

    await executeServiceOperation(
      {
        operation: "start_op",
        logger,
        clock,
        correlationId: "corr-456",
        metadata: { playerId: "p1" },
        logStart: true,
      },
      async () => 42,
    );

    expect(logger.info).toHaveBeenCalledWith(
      "Operation started: start_op",
      expect.objectContaining({
        operation: "start_op_started",
        correlationId: "corr-456",
        playerId: "p1",
      }),
    );
  });

  it("does not emit start log when logStart is false or omitted", async () => {
    const logger = createMockLogger();
    const clock = createMockClock();

    await executeServiceOperation(
      {
        operation: "quiet_start",
        logger,
        clock,
      },
      async () => "ok",
    );

    expect(logger.info).not.toHaveBeenCalledWith(
      "Operation started: quiet_start",
      expect.anything(),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Operation completed: quiet_start",
      expect.anything(),
    );
  });

  it("demotes AppError with statusCode < 500 to logger.warn and re-throws", async () => {
    const logger = createMockLogger();
    const clock = createMockClock(1000, 10);
    const domainErr = new CustomDomainError("Room not found");

    await expect(
      executeServiceOperation(
        {
          operation: "domain_check",
          logger,
          clock,
          correlationId: "corr-domain",
          metadata: { roomCode: "MISS" },
        },
        async () => {
          throw domainErr;
        },
      ),
    ).rejects.toThrow(domainErr);

    expect(logger.warn).toHaveBeenCalledWith(
      "Operation rejected by domain policy: domain_check",
      expect.objectContaining({
        operation: "domain_check_failed",
        duration: 10,
        durationMs: 10,
        correlationId: "corr-domain",
        roomCode: "MISS",
        statusCode: 404,
        errorCode: "ERR_ROOM_NOT_FOUND",
        error: expect.objectContaining({ message: "Room not found" }),
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs AppError with statusCode >= 500 at logger.error and re-throws", async () => {
    const logger = createMockLogger();
    const clock = createMockClock(1000, 30);
    const serverErr = new InternalDomainError("Internal crash");

    await expect(
      executeServiceOperation(
        {
          operation: "server_check",
          logger,
          clock,
          correlationId: "corr-server",
        },
        async () => {
          throw serverErr;
        },
      ),
    ).rejects.toThrow(serverErr);

    expect(logger.error).toHaveBeenCalledWith(
      "Operation failed with internal error: server_check",
      expect.objectContaining({
        operation: "server_check_failed",
        duration: 30,
        durationMs: 30,
        correlationId: "corr-server",
        statusCode: 500,
        errorCode: "ERR_INTERNAL_SERVER",
        error: expect.objectContaining({ message: "Internal crash" }),
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs unexpected non-AppError exceptions at logger.error and re-throws", async () => {
    const logger = createMockLogger();
    const clock = createMockClock(1000, 15);
    const genericErr = new TypeError("Cannot read properties of undefined");

    await expect(
      executeServiceOperation(
        {
          operation: "unexpected_check",
          logger,
          clock,
        },
        async () => {
          throw genericErr;
        },
      ),
    ).rejects.toThrow(genericErr);

    expect(logger.error).toHaveBeenCalledWith(
      "Operation failed with internal error: unexpected_check",
      expect.objectContaining({
        operation: "unexpected_check_failed",
        duration: 15,
        durationMs: 15,
        error: expect.objectContaining({
          message: "Cannot read properties of undefined",
        }),
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
