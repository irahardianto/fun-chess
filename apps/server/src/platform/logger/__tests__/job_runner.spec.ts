import { describe, it, expect } from "vitest";
import { runLoggedJob } from "../job_runner.js";
import { NullLogger } from "../null_logger.js";

describe("runLoggedJob (MAJ-017, MIN-019)", () => {
  it("logs operation start and success with static messages, correlationId and duration", async () => {
    const logger = new NullLogger();

    const result = await runLoggedJob(logger, "test_job", async (correlationId) => {
      expect(correlationId).toBeDefined();
      return { itemsProcessed: 5 };
    });

    expect(result).toEqual({ itemsProcessed: 5 });

    expect(logger.infoLogs).toHaveLength(2);

    const startLog = logger.infoLogs[0];
    expect(startLog?.message).toBe("Background job started");
    expect(startLog?.context?.["operation"]).toBe("test_job");
    expect(startLog?.context?.["status"]).toBe("started");
    expect(startLog?.context?.["correlationId"]).toBeDefined();

    const successLog = logger.infoLogs[1];
    expect(successLog?.message).toBe("Background job succeeded");
    expect(successLog?.context?.["operation"]).toBe("test_job");
    expect(successLog?.context?.["status"]).toBe("success");
    expect(successLog?.context?.["correlationId"]).toBe(startLog?.context?.["correlationId"]);
    expect(successLog?.context?.["duration"]).toBeTypeOf("number");
    expect(successLog?.context?.["result"]).toEqual({ itemsProcessed: 5 });
  });

  it("logs operation failure with static message, duration, correlationId, error stack, and rethrows", async () => {
    const logger = new NullLogger();

    const testError = new Error("Database deadlock during cleanup");

    await expect(
      runLoggedJob(logger, "failing_cleanup", async () => {
        throw testError;
      }),
    ).rejects.toThrow("Database deadlock during cleanup");

    expect(logger.infoLogs).toHaveLength(1);
    expect(logger.infoLogs[0]?.message).toBe("Background job started");

    expect(logger.errorLogs).toHaveLength(1);
    const errorLog = logger.errorLogs[0];
    expect(errorLog?.message).toBe("Background job failed");
    expect(errorLog?.context?.["operation"]).toBe("failing_cleanup");
    expect(errorLog?.context?.["status"]).toBe("failed");
    expect(errorLog?.context?.["duration"]).toBeTypeOf("number");
    expect(errorLog?.context?.["correlationId"]).toBeDefined();
    expect(errorLog?.context?.["error"]).toEqual({
      name: "Error",
      message: "Database deadlock during cleanup",
      stack: expect.any(String),
    });
  });
});
