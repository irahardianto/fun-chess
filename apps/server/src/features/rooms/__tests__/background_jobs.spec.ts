import { describe, it, expect, vi } from "vitest";
import { setupBackgroundJobs } from "../../../bootstrap/lifecycle.js";
import { MockTimerService } from "../timer_service.js";
import type { IRoomService } from "../room.interface.js";
import type { Logger } from "../../../platform/logger/index.js";

describe("setupBackgroundJobs (MAJ-015)", () => {
  const createMockLogger = (): Logger => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  });

  it("executes room_cleanup on scheduled intervals and logs start/success with correlationId", async () => {
    const mockRoomService = {
      cleanupAbandonedRooms: vi.fn().mockResolvedValue(5),
    } as unknown as IRoomService;
    const logger = createMockLogger();
    const timerService = new MockTimerService();

    setupBackgroundJobs(mockRoomService, logger, timerService);

    // Fast-forward 5 minutes
    await timerService.advance(5 * 60 * 1000);

    expect(mockRoomService.cleanupAbandonedRooms).toHaveBeenCalledTimes(1);
    expect(mockRoomService.cleanupAbandonedRooms).toHaveBeenCalledWith(
      10 * 60 * 1000,
      expect.any(String),
    );

    const startedLog = vi.mocked(logger.info).mock.calls.find(
      (call) => call[0] === "Background job started",
    );
    const succeededLog = vi.mocked(logger.info).mock.calls.find(
      (call) => call[0] === "Background job succeeded",
    );

    expect(startedLog).toBeDefined();
    expect(succeededLog).toBeDefined();

    const jobCorrelationId = startedLog?.[1]?.correlationId;
    expect(jobCorrelationId).toBeDefined();
    expect(succeededLog?.[1]?.correlationId).toBe(jobCorrelationId);
    expect(succeededLog?.[1]?.result).toEqual({ cleanedCount: 5 });

    // No error logs on success
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs job failure with job correlationId and does not emit duplicate orphan error log on rejection", async () => {
    const cleanupError = new Error("Database timeout during room cleanup");
    const mockRoomService = {
      cleanupAbandonedRooms: vi.fn().mockRejectedValue(cleanupError),
    } as unknown as IRoomService;
    const logger = createMockLogger();
    const timerService = new MockTimerService();

    setupBackgroundJobs(mockRoomService, logger, timerService);

    // Fast-forward 5 minutes to trigger the failure
    await timerService.advance(5 * 60 * 1000);

    expect(mockRoomService.cleanupAbandonedRooms).toHaveBeenCalledTimes(1);

    // runLoggedJob logs "Background job failed" with full context
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Background job failed",
      expect.objectContaining({
        operation: "room_cleanup",
        status: "failed",
        correlationId: expect.any(String),
        error: expect.objectContaining({
          message: "Database timeout during room cleanup",
        }),
      }),
    );

    // Verify no second orphan error log was emitted (MAJ-015)
    const errorCalls = vi.mocked(logger.error).mock.calls;
    const duplicateLogs = errorCalls.filter((call) =>
      call[0]?.includes("caught rejection"),
    );
    expect(duplicateLogs).toHaveLength(0);
  });
});
