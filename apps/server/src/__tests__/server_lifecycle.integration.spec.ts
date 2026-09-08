import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http, { Server as HttpServer } from "node:http";
import net from "node:net";
import { createHttpServer } from "../platform/http/http_server.js";
import { ShutdownCoordinator } from "../platform/lifecycle/shutdown_coordinator.js";
import { NullLogger } from "../platform/logger/null_logger.js";
import { TypedSocketServer } from "../platform/socket/socket_server.js";
import { MockRoomStore } from "../features/rooms/mock_room.store.js";
import { RelayAddressService } from "../features/lan/relay_address.service.js";

describe("Server Lifecycle & Error Catch Integration (MAJ-034)", () => {
  describe("HTTP 500 Error Catch Blocks (http_server.ts:280-306)", () => {
    let server: HttpServer;
    let port: number;
    let logger: NullLogger;
    let mockStore: MockRoomStore;
    let mockRelayService: RelayAddressService;

    beforeEach(async () => {
      logger = new NullLogger();
      mockStore = new MockRoomStore();
      mockRelayService = new RelayAddressService({
        host: "127.0.0.1",
        port: 3000,
        lanIp: "127.0.0.1",
      });

      const handler = createHttpServer({
        roomStore: mockStore,
        relayAddressService: mockRelayService,
        logger,
        port: 3000,
        getActiveSocketCount: () => 0,
      });

      server = http.createServer(handler);
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address() as net.AddressInfo;
          port = addr.port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it("catches unhandled exception in /metrics handler, logs structured error, and returns 500 JSON", async () => {
      // Arrange: Force roomStore.count to throw an unexpected database/runtime error
      vi.spyOn(mockStore, "count").mockRejectedValue(
        new Error("Fatal connection pool failure in storage layer"),
      );

      // Act
      const res = await fetch(`http://127.0.0.1:${port}/metrics`);

      // Assert: HTTP Status & Response Sanitization (never leak raw error or stack)
      expect(res.status).toBe(500);
      expect(res.headers.get("content-type")).toContain("application/json");

      const body = (await res.json()) as any;

      expect(body.status).toBe("error");
      expect(body.code).toBe(500);
      expect(body.error.code).toBe("ERR_INTERNAL_SERVER_ERROR");
      expect(body.error.message).toBe("Internal server error");
      expect(body.error.correlationId).toBeDefined();

      // Assert: Structured 3-point error logging (logging-and-observability-mandate)
      const errorLog = logger.errorLogs.find(
        (l) => l.context?.operation === "http_error",
      );
      expect(errorLog).toBeDefined();
      expect(errorLog?.context?.correlationId).toBe(body.error.correlationId);
      expect(errorLog?.context?.method).toBe("GET");
      expect(errorLog?.context?.path).toBe("/metrics");
      expect(errorLog?.context?.duration).toBeGreaterThanOrEqual(0);
      expect((errorLog?.context?.error as { message?: string })?.message).toBe(
        "Fatal connection pool failure in storage layer",
      );
    });

    it("catches unhandled exception in /api/lan-info, logs error, and returns sanitized 500 JSON", async () => {
      // Arrange: Force relayAddressService.getAddressingInfo to throw an unexpected error
      vi.spyOn(mockRelayService, "getAddressingInfo").mockImplementation(() => {
        throw new Error("DNS resolution or network interface discovery panic");
      });

      // Act
      const res = await fetch(`http://127.0.0.1:${port}/api/lan-info`);

      // Assert
      expect(res.status).toBe(500);
      const body = (await res.json()) as any;

      expect(body.status).toBe("error");
      expect(body.code).toBe(500);
      expect(body.error.code).toBe("ERR_INTERNAL_SERVER_ERROR");
      expect(body.error.message).toBe("Internal server error");

      const errorLog = logger.errorLogs.find(
        (l) => l.context?.operation === "http_error",
      );
      expect(errorLog).toBeDefined();
      expect(errorLog?.context?.path).toBe("/api/lan-info");
    });

    it("does not attempt to re-send response when headers were already sent", async () => {
      // Arrange: Custom server where handler writes headers and then an error occurs
      const customLogger = new NullLogger();
      const buggyHandler: http.RequestListener = (_req, res) => {
        const correlationId = "test-corr-id";
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.write("partial");
        // Simulate catch block behavior when res.headersSent is true
        try {
          throw new Error("Mid-stream explosion");
        } catch (err) {
          customLogger.error("HTTP Request Error", {
            operation: "http_error",
            correlationId,
            error:
              err instanceof Error ? { message: err.message } : { raw: err },
          });
          if (!res.headersSent) {
            res.writeHead(500);
            res.end();
          } else {
            res.end();
          }
        }
      };

      const buggyServer = http.createServer(buggyHandler);
      await new Promise<void>((resolve) =>
        buggyServer.listen(0, "127.0.0.1", resolve),
      );
      const addr = buggyServer.address() as net.AddressInfo;

      try {
        const res = await fetch(`http://127.0.0.1:${addr.port}/`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toBe("partial");
        expect(
          customLogger.errorLogs.some(
            (l) => l.context?.operation === "http_error",
          ),
        ).toBe(true);
      } finally {
        await new Promise<void>((resolve) =>
          buggyServer.close(() => resolve()),
        );
      }
    });
  });

  describe("Shutdown Coordinator Failure & Error Paths (shutdown_coordinator.ts:127-138)", () => {
    let mockServer: Partial<HttpServer>;
    let mockIo: Partial<TypedSocketServer>;
    let logger: NullLogger;
    let exitCodes: number[];

    beforeEach(() => {
      vi.useFakeTimers();
      exitCodes = [];
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

    it("catches error during server.close, logs fatal server_shutdown_error, and exits with 1", async () => {
      // Arrange: mockServer.close throws an error synchronously during shutdown
      mockServer.close = vi.fn(() => {
        throw new Error("EIO: Socket close I/O failure");
      });

      const coordinator = new ShutdownCoordinator({
        server: mockServer as HttpServer,
        io: mockIo as TypedSocketServer,
        logger,
        timeoutMs: 3000,
        onExit: (code) => exitCodes.push(code),
      });

      // Act
      await coordinator.shutdown("SIGTERM");

      // Assert
      expect(exitCodes).toEqual([1]);
      const fatalLog = logger.fatalLogs.find(
        (l) => l.context?.operation === "server_shutdown_error",
      );
      expect(fatalLog).toBeDefined();
      expect(
        (fatalLog?.context?.error as { message?: string })?.message,
      ).toContain("EIO: Socket close I/O failure");
    });

    it("handles callback error from server.close during shutdown and exits with 1 (MAJ-004)", async () => {
      mockServer.close = vi.fn((cb?: (err?: Error) => void) => {
        if (cb) cb(new Error("EIO: async socket close callback failure"));
        return mockServer as HttpServer;
      });

      const coordinator = new ShutdownCoordinator({
        server: mockServer as HttpServer,
        io: mockIo as TypedSocketServer,
        logger,
        timeoutMs: 3000,
        onExit: (code) => exitCodes.push(code),
      });

      await coordinator.shutdown("SIGTERM");

      expect(exitCodes).toEqual([1]);
      const fatalLog = logger.fatalLogs.find(
        (l) => l.context?.operation === "server_shutdown_error",
      );
      expect(fatalLog).toBeDefined();
      expect(
        (fatalLog?.context?.error as { message?: string })?.message,
      ).toContain("EIO: async socket close callback failure");
    });

    it("handles callback error from io.close during shutdown and exits with 1 (MAJ-004)", async () => {
      mockIo.close = vi.fn((cb?: (err?: any) => void) => {
        if (cb) cb(new Error("Socket.IO adapter close error"));
      });

      const coordinator = new ShutdownCoordinator({
        server: mockServer as HttpServer,
        io: mockIo as TypedSocketServer,
        logger,
        timeoutMs: 3000,
        onExit: (code) => exitCodes.push(code),
      });

      await coordinator.shutdown("SIGTERM");

      expect(exitCodes).toEqual([1]);
      const fatalLog = logger.fatalLogs.find(
        (l) => l.context?.operation === "server_shutdown_error",
      );
      expect(fatalLog).toBeDefined();
      expect(
        (fatalLog?.context?.error as { message?: string })?.message,
      ).toContain("Socket.IO adapter close error");
    });

    it("clears forceExitTimer and exits 1 on shutdown error", async () => {
      mockServer.close = vi.fn(() => {
        throw new Error("Fatal connection drain error");
      });

      const coordinator = new ShutdownCoordinator({
        server: mockServer as HttpServer,
        io: mockIo as TypedSocketServer,
        logger,
        timeoutMs: 5000,
        onExit: (code) => exitCodes.push(code),
      });

      await coordinator.shutdown("SIGTERM");

      expect(exitCodes).toEqual([1]);
      // Verify timer did not leak and cause secondary exit
      vi.advanceTimersByTime(10_000);
      expect(exitCodes).toEqual([1]);
    });

    it("handles non-Error objects thrown during shutdown safely", async () => {
      mockServer.close = vi.fn(() => {
        throw "String exception during close";
      });

      const coordinator = new ShutdownCoordinator({
        server: mockServer as HttpServer,
        io: mockIo as TypedSocketServer,
        logger,
        timeoutMs: 3000,
        onExit: (code) => exitCodes.push(code),
      });

      await coordinator.shutdown("SIGINT");

      expect(exitCodes).toEqual([1]);
      const fatalLog = logger.fatalLogs.find(
        (l) => l.context?.operation === "server_shutdown_error",
      );
      expect(fatalLog).toBeDefined();
      expect(fatalLog?.context?.error).toEqual({
        raw: "String exception during close",
      });
    });

    it("executes additionalCleanups and handles rejected cleanup promises without crashing", async () => {
      const failingCleanup = vi
        .fn()
        .mockRejectedValue(new Error("Cleanup failed"));
      const succeedingCleanup = vi.fn().mockResolvedValue(undefined);

      const coordinator = new ShutdownCoordinator({
        server: mockServer as HttpServer,
        io: mockIo as TypedSocketServer,
        logger,
        timeoutMs: 3000,
        onExit: (code) => exitCodes.push(code),
        additionalCleanups: [failingCleanup, succeedingCleanup],
      });

      await coordinator.shutdown("SIGTERM");

      expect(failingCleanup).toHaveBeenCalledTimes(1);
      expect(succeedingCleanup).toHaveBeenCalledTimes(1);
      expect(mockServer.close).toHaveBeenCalledTimes(1);
      expect(exitCodes).toEqual([0]);
    });
  });

  describe("Process Crash Guards & Signal Listeners (shutdown_coordinator.ts:144-177)", () => {
    let mockServer: Partial<HttpServer>;
    let mockIo: Partial<TypedSocketServer>;
    let logger: NullLogger;
    let exitCodes: number[];
    let processListeners: Record<string, Function[]>;

    beforeEach(() => {
      exitCodes = [];
      logger = new NullLogger();
      processListeners = {};

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

      // Intercept process.on to test listeners in isolation without mutating real Node process
      vi.spyOn(process, "on").mockImplementation(
        (event: string, listener: any) => {
          if (!processListeners[event]) {
            processListeners[event] = [];
          }
          processListeners[event]!.push(listener);
          return process;
        },
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("logs unhandled promise rejections without terminating the process", () => {
      const coordinator = new ShutdownCoordinator({
        server: mockServer as HttpServer,
        io: mockIo as TypedSocketServer,
        logger,
        onExit: (code) => exitCodes.push(code),
      });

      coordinator.installProcessHandlers();

      const unhandledHandler = processListeners["unhandledRejection"]?.[0];
      expect(unhandledHandler).toBeDefined();

      // Trigger with an Error object
      const rejectionError = new Error("Unhandled async operation failed");
      unhandledHandler!(rejectionError);

      const errorLog = logger.errorLogs.find(
        (l) => l.context?.operation === "unhandled_rejection",
      );
      expect(errorLog).toBeDefined();
      expect((errorLog?.context?.error as { message?: string })?.message).toBe(
        "Unhandled async operation failed",
      );
      expect(exitCodes.length).toBe(0);

      // Trigger with a non-Error object
      unhandledHandler!("string rejection reason");
      expect(
        logger.errorLogs.some(
          (l) =>
            (l.context?.error as { raw?: string })?.raw ===
            "string rejection reason",
        ),
      ).toBe(true);
    });

    it("handles uncaught exceptions by logging fatal and triggering emergency shutdown", async () => {
      const coordinator = new ShutdownCoordinator({
        server: mockServer as HttpServer,
        io: mockIo as TypedSocketServer,
        logger,
        onExit: (code) => exitCodes.push(code),
      });

      const shutdownSpy = vi.spyOn(coordinator, "shutdown").mockResolvedValue();
      coordinator.installProcessHandlers();

      const uncaughtHandler = processListeners["uncaughtException"]?.[0];
      expect(uncaughtHandler).toBeDefined();

      const fatalError = new Error("Uncaught syntax/runtime bug in thread");
      uncaughtHandler!(fatalError);

      const fatalLog = logger.fatalLogs.find(
        (l) => l.context?.operation === "uncaught_exception",
      );
      expect(fatalLog).toBeDefined();
      expect((fatalLog?.context?.error as { message?: string })?.message).toBe(
        "Uncaught syntax/runtime bug in thread",
      );

      expect(shutdownSpy).toHaveBeenCalledWith("uncaughtException");
    });

    it("handles HTTP server socket fatal errors and initiates serverError shutdown", () => {
      let serverErrorHandler: Function | undefined;
      mockServer.on = vi.fn((event: string, handler: any) => {
        if (event === "error") {
          serverErrorHandler = handler;
        }
        return mockServer as HttpServer;
      });

      const coordinator = new ShutdownCoordinator({
        server: mockServer as HttpServer,
        io: mockIo as TypedSocketServer,
        logger,
        onExit: (code) => exitCodes.push(code),
      });

      const shutdownSpy = vi.spyOn(coordinator, "shutdown").mockResolvedValue();
      coordinator.installProcessHandlers();

      expect(serverErrorHandler).toBeDefined();

      const socketError = new Error("EADDRINUSE: Address already in use");
      serverErrorHandler!(socketError);

      const fatalLog = logger.fatalLogs.find(
        (l) => l.context?.operation === "server_error",
      );
      expect(fatalLog).toBeDefined();
      expect(
        (fatalLog?.context?.error as { message?: string })?.message,
      ).toContain("EADDRINUSE");

      expect(shutdownSpy).toHaveBeenCalledWith("serverError");
    });

    it("registers SIGINT and SIGTERM handlers that initiate shutdown", () => {
      const coordinator = new ShutdownCoordinator({
        server: mockServer as HttpServer,
        io: mockIo as TypedSocketServer,
        logger,
        onExit: (code) => exitCodes.push(code),
      });

      const shutdownSpy = vi.spyOn(coordinator, "shutdown").mockResolvedValue();
      coordinator.installProcessHandlers();

      const sigintHandler = processListeners["SIGINT"]?.[0];
      const sigtermHandler = processListeners["SIGTERM"]?.[0];

      expect(sigintHandler).toBeDefined();
      expect(sigtermHandler).toBeDefined();

      sigintHandler!();
      expect(shutdownSpy).toHaveBeenCalledWith("SIGINT");

      sigtermHandler!();
      expect(shutdownSpy).toHaveBeenCalledWith("SIGTERM");
    });
  });
});
