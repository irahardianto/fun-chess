import { describe, it, expect } from "vitest";
import { runLoggedJob } from "../job_runner.js";
import { NullLogger } from "../null_logger.js";

describe("runLoggedJob (MAJ-017)", () => {
  it("logs operation start and success with correlationId and duration", async () => {
    const logger = new NullLogger();

    const result = await runLoggedJob(logger, "test_job", async (correlationId) => {
      expect(correlationId).toBeDefined();
      return { itemsProcessed: 5 };
    });

    expect(result).toEqual({ itemsProcessed: 5 });

    expect(logger.infoLogs).toHaveLength(2);

    const startLog = logger.infoLogs[0];
    expect(startLog?.message).toContain("Background job started: test_job");
    expect(startLog?.context?.["operation"]).toBe("test_job");
    expect(startLog?.context?.["status"]).toBe("started");
    expect(startLog?.context?.["correlationId"]).toBeDefined();

    const successLog = logger.infoLogs[1];
    expect(successLog?.message).toContain("Background job succeeded: test_job");
    expect(successLog?.context?.["operation"]).toBe("test_job");
    expect(successLog?.context?.["status"]).toBe("success");
    expect(successLog?.context?.["correlationId"]).toBe(startLog?.context?.["correlationId"]);
    expect(successLog?.context?.["duration"]).toBeTypeOf("number");
    expect(successLog?.context?.["result"]).toEqual({ itemsProcessed: 5 });
  });

  it("logs operation failure with duration, correlationId, error stack, and rethrows", async () => {
    const logger = new NullLogger();

    const testError = new Error("Database deadlock during cleanup");

    await expect(
      runLoggedJob(logger, "failing_cleanup", async () => {
        throw testError;
      }),
    ).rejects.toThrow("Database deadlock during cleanup");

    expect(logger.infoLogs).toHaveLength(1);
    expect(logger.infoLogs[0]?.message).toContain("Background job started: failing_cleanup");

    expect(logger.errorLogs).toHaveLength(1);
    const errorLog = logger.errorLogs[0];
    expect(errorLog?.message).toContain("Background job failed: failing_cleanup");
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
