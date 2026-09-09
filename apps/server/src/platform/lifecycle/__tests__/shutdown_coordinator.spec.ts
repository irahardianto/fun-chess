import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShutdownCoordinator } from "../shutdown_coordinator.js";
import { NullLogger } from "../../logger/null_logger.js";
import { Server as HttpServer } from "node:http";
import { TypedSocketServer } from "../../socket/socket_server.js";

describe("ShutdownCoordinator", () => {
  let mockServer: HttpServer;
  let mockIo: TypedSocketServer;
  let logger: NullLogger;
  let exitCalls: number[];

  beforeEach(() => {
    vi.useFakeTimers();
    exitCalls = [];
    logger = new NullLogger();

    mockServer = {
      close: vi.fn((cb?: (err?: Error) => void) => {
        if (cb) cb();
        return mockServer;
      }),
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as HttpServer;

    mockIo = {
      close: vi.fn((cb?: () => void) => {
        if (cb) cb();
      }),
      disconnectSockets: vi.fn(),
    } as unknown as TypedSocketServer;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gracefully shuts down servers, disconnects sockets, closes idle connections, and logs duration (MAJ-010, MIN-013)", async () => {
    let cleanupCalled = false;
    const additionalCleanup = async () => {
      cleanupCalled = true;
    };

    const interval = setInterval(() => {}, 1000);

    const coordinator = new ShutdownCoordinator({
      server: mockServer,
      io: mockIo,
      logger,
      cleanupInterval: interval,
      timeoutMs: 3000,
      onExit: (code) => exitCalls.push(code),
      additionalCleanups: [additionalCleanup],
    });

    await coordinator.shutdown("SIGTERM");

    expect(cleanupCalled).toBe(true);
    expect(mockIo.disconnectSockets).toHaveBeenCalledWith(true);
    const serverWithControl = mockServer as unknown as {
      closeIdleConnections: () => void;
      closeAllConnections: () => void;
    };
    expect(serverWithControl.closeIdleConnections).toHaveBeenCalledTimes(1);
    expect(serverWithControl.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(mockIo.close).toHaveBeenCalledTimes(1);
    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(exitCalls).toEqual([0]);

    expect(logger.infoLogs.some((l) => l.context?.["signal"] === "SIGTERM")).toBe(true);
    const completeLog = logger.infoLogs.find((l) =>
      l.message.includes("Fun Chess server closed successfully"),
    );
    expect(completeLog).toBeDefined();
    expect(completeLog?.context?.["duration"]).toBeTypeOf("number");
    expect(completeLog?.context?.["durationMs"]).toBeTypeOf("number");
  });

  it("handles duplicate shutdown calls idempotently", async () => {
    const coordinator = new ShutdownCoordinator({
      server: mockServer,
      io: mockIo,
      logger,
      onExit: (code) => exitCalls.push(code),
    });

    const first = coordinator.shutdown("SIGINT");
    const second = coordinator.shutdown("SIGINT");

    await Promise.all([first, second]);

    expect(mockIo.close).toHaveBeenCalledTimes(1);
    expect(exitCalls).toEqual([0]);
  });

  it("forces exit with code 1 if server.close hangs beyond timeout and records duration (MIN-013)", async () => {
    const hangingServer = {
      close: vi.fn(() => {
        // never calls callback
        return hangingServer as unknown as HttpServer;
      }),
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(),
      on: vi.fn(),
    };

    const coordinator = new ShutdownCoordinator({
      server: hangingServer as unknown as HttpServer,
      io: mockIo,
      logger,
      timeoutMs: 2000,
      onExit: (code) => exitCalls.push(code),
    });

    const shutdownPromise = coordinator.shutdown("SIGTERM");

    // Advance fake timer past timeoutMs
    vi.advanceTimersByTime(2500);

    await shutdownPromise.catch(() => {});

    expect(exitCalls).toContain(1);
    const fatalOrError = [...logger.fatalLogs, ...logger.errorLogs];
    const timeoutLog = fatalOrError.find((l) => l.message.includes("Forced shutdown due to timeout"));
    expect(timeoutLog).toBeDefined();
    expect(timeoutLog?.context?.["duration"]).toBeTypeOf("number");
  });

  it("passes correlationId in shutdown logs (MAJ-016, MAJ-024)", async () => {
    const coordinator = new ShutdownCoordinator({
      server: mockServer,
      io: mockIo,
      logger,
      onExit: (code) => exitCalls.push(code),
    });

    await coordinator.shutdown("SIGTERM", "custom-corr-id-123");

    const startLog = logger.infoLogs.find((l) => l.context?.["signal"] === "SIGTERM");
    expect(startLog?.context?.["correlationId"]).toBe("custom-corr-id-123");
    const completeLog = logger.infoLogs.find((l) => l.message.includes("Fun Chess server closed successfully"));
    expect(completeLog?.context?.["correlationId"]).toBe("custom-corr-id-123");
  });

  it("propagates correlationId in emergency handlers to shutdown (MAJ-016)", async () => {
    const coordinator = new ShutdownCoordinator({
      server: mockServer,
      io: mockIo,
      logger,
      onExit: (code) => exitCalls.push(code),
    });

    const shutdownSpy = vi.spyOn(coordinator, "shutdown").mockResolvedValue();
    coordinator.installProcessHandlers();

    const testError = new Error("Boom");
    const uncaughtHandler = (
      coordinator as unknown as { uncaughtExceptionHandler: (err: Error) => void }
    ).uncaughtExceptionHandler;
    uncaughtHandler(testError);

    expect(shutdownSpy).toHaveBeenCalledWith("uncaughtException", expect.any(String));
    const passedCorrId = shutdownSpy.mock.calls[0]?.[1];
    const fatalLog = logger.fatalLogs.find((l) => l.context?.["operation"] === "uncaught_exception");
    expect(fatalLog?.context?.["correlationId"]).toBe(passedCorrId);

    shutdownSpy.mockClear();
    const serverErrorHandler = (
      coordinator as unknown as { serverErrorHandler: (err: Error) => void }
    ).serverErrorHandler;
    serverErrorHandler(testError);

    expect(shutdownSpy).toHaveBeenCalledWith("serverError", expect.any(String));
    const passedServerCorrId = shutdownSpy.mock.calls[0]?.[1];
    const serverFatalLog = logger.fatalLogs.find((l) => l.context?.["operation"] === "server_error");
    expect(serverFatalLog?.context?.["correlationId"]).toBe(passedServerCorrId);

    coordinator.uninstallProcessHandlers();
  });

  it("exits with code 1 and logs error when server.close yields an error", async () => {
    const errorServer = {
      close: vi.fn((cb?: (err?: Error) => void) => {
        if (cb) cb(new Error("Failed to close HTTP server socket"));
        return errorServer as unknown as HttpServer;
      }),
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(),
      on: vi.fn(),
    };

    const coordinator = new ShutdownCoordinator({
      server: errorServer as unknown as HttpServer,
      io: mockIo,
      logger,
      onExit: (code) => exitCalls.push(code),
    });

    await coordinator.shutdown("SIGTERM");

    expect(exitCalls).toEqual([1]);
    const fatalOrError = [...logger.fatalLogs, ...logger.errorLogs];
    const errorLog = fatalOrError.find((l) =>
      l.message.includes("Error closing server during shutdown"),
    );
    expect(errorLog).toBeDefined();
  });

  it("installs and uninstalls process handlers and disposes intervals cleanly (MAJ-010)", () => {
    const removeListenerSpy = vi.spyOn(process, "removeListener");
    const addListenerSpy = vi.spyOn(process, "on");
    const interval = setInterval(() => {}, 10000);

    const coordinator = new ShutdownCoordinator({
      server: mockServer,
      io: mockIo,
      logger,
      cleanupInterval: interval,
    });

    coordinator.installProcessHandlers();
    expect(addListenerSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(addListenerSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));

    coordinator.dispose();
    expect(removeListenerSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(mockServer.removeListener).toHaveBeenCalledWith("error", expect.any(Function));
  });
});
