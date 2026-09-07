import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShutdownCoordinator } from "../shutdown_coordinator.js";
import { NullLogger } from "../../logger/null_logger.js";
import { Server as HttpServer } from "node:http";
import { TypedSocketServer } from "../../socket/socket_server.js";

describe("ShutdownCoordinator", () => {
  let mockServer: Partial<HttpServer>;
  let mockIo: Partial<TypedSocketServer>;
  let logger: NullLogger;
  let exitCalls: number[];

  beforeEach(() => {
    vi.useFakeTimers();
    exitCalls = [];
    logger = new NullLogger();

    mockServer = {
      close: vi.fn((cb?: (err?: Error) => void) => {
        if (cb) cb();
        return mockServer as HttpServer;
      }),
      on: vi.fn(),
    };

    mockIo = {
      close: vi.fn((cb?: () => void) => {
        if (cb) cb();
      }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gracefully shuts down servers, invokes additional cleanups, and exits with 0", async () => {
    let cleanupCalled = false;
    const additionalCleanup = async () => {
      cleanupCalled = true;
    };

    const interval = setInterval(() => {}, 1000);

    const coordinator = new ShutdownCoordinator({
      server: mockServer as HttpServer,
      io: mockIo as TypedSocketServer,
      logger,
      cleanupInterval: interval,
      timeoutMs: 3000,
      onExit: (code) => exitCalls.push(code),
      additionalCleanups: [additionalCleanup],
    });

    await coordinator.shutdown("SIGTERM");

    expect(cleanupCalled).toBe(true);
    expect(mockIo.close).toHaveBeenCalledTimes(1);
    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(exitCalls).toEqual([0]);

    expect(logger.infoLogs.some((l) => l.message.includes("Received SIGTERM"))).toBe(true);
    expect(logger.infoLogs.some((l) => l.message.includes("Fun Chess server closed successfully"))).toBe(true);
  });

  it("handles duplicate shutdown calls idempotently", async () => {
    const coordinator = new ShutdownCoordinator({
      server: mockServer as HttpServer,
      io: mockIo as TypedSocketServer,
      logger,
      onExit: (code) => exitCalls.push(code),
    });

    const first = coordinator.shutdown("SIGINT");
    const second = coordinator.shutdown("SIGINT");

    await Promise.all([first, second]);

    expect(mockIo.close).toHaveBeenCalledTimes(1);
    expect(exitCalls).toEqual([0]);
  });

  it("forces exit with code 1 if server.close hangs beyond timeout", async () => {
    const hangingServer = {
      close: vi.fn(() => {
        // never calls callback
        return hangingServer as unknown as HttpServer;
      }),
      on: vi.fn(),
    };

    const coordinator = new ShutdownCoordinator({
      server: hangingServer as unknown as HttpServer,
      io: mockIo as TypedSocketServer,
      logger,
      timeoutMs: 2000,
      onExit: (code) => exitCalls.push(code),
    });

    const shutdownPromise = coordinator.shutdown("SIGTERM");

    // Advance fake timer past timeoutMs
    vi.advanceTimersByTime(2500);

    await shutdownPromise.catch(() => {});

    expect(exitCalls).toContain(1);
    const fatalOrError = ((logger as any).fatalLogs ?? logger.errorLogs) as Array<{ message: string }>;
    expect(fatalOrError.some((l) => l.message.includes("Forced shutdown due to timeout"))).toBe(true);
  });
});
