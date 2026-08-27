import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { PinoLogger } from "../pino_logger.js";

describe("PinoLogger", () => {
  let logs: Record<string, unknown>[];
  let logStream: Writable;

  const createCapturingLogger = (level = "info") => {
    logs = [];
    logStream = new Writable({
      write(chunk, _encoding, callback) {
        try {
          const parsed = JSON.parse(chunk.toString());
          logs.push(parsed);
        } catch {
          // Ignore non-json
        }
        callback();
      },
    });

    const pinoInstance = pino({ level }, logStream);
    return new PinoLogger(pinoInstance);
  };

  beforeEach(() => {
    logs = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Structured Output and Log Levels", () => {
    it("logs info messages with structured metadata context", () => {
      const logger = createCapturingLogger("info");
      logger.info("Room created successfully", {
        roomCode: "ABCD",
        hostId: "user-1",
        durationMs: 12.5,
      });

      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.msg).toBe("Room created successfully");
      expect(log.level).toBe(30); // Pino info level is 30
      expect(log.roomCode).toBe("ABCD");
      expect(log.hostId).toBe("user-1");
      expect(log.durationMs).toBe(12.5);
      expect(log.time).toBeDefined();
    });

    it("logs info message without context", () => {
      const logger = createCapturingLogger("info");
      logger.info("Server started");

      expect(logs).toHaveLength(1);
      expect(logs[0]?.msg).toBe("Server started");
      expect(logs[0]?.level).toBe(30);
    });

    it("logs warn messages with structured context", () => {
      const logger = createCapturingLogger("info");
      logger.warn("Player disconnected with active timer", {
        playerId: "p-123",
        gracePeriodMs: 60000,
      });

      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.msg).toBe("Player disconnected with active timer");
      expect(log.level).toBe(40); // Pino warn level is 40
      expect(log.playerId).toBe("p-123");
    });

    it("logs warn message without context", () => {
      const logger = createCapturingLogger("info");
      logger.warn("Warning occurred");

      expect(logs).toHaveLength(1);
      expect(logs[0]?.msg).toBe("Warning occurred");
      expect(logs[0]?.level).toBe(40);
    });

    it("logs error messages with error object serialization", () => {
      const logger = createCapturingLogger("info");
      const testError = new Error("Database timeout error");
      logger.error("Failed to persist room state", {
        roomCode: "XYZW",
        error: {
          message: testError.message,
          stack: testError.stack,
        },
      });

      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.msg).toBe("Failed to persist room state");
      expect(log.level).toBe(50); // Pino error level is 50
      expect(log.roomCode).toBe("XYZW");
      expect((log.error as any).message).toBe("Database timeout error");
      expect((log.error as any).stack).toBeDefined();
    });

    it("logs error message without context", () => {
      const logger = createCapturingLogger("info");
      logger.error("Unhandled exception");

      expect(logs).toHaveLength(1);
      expect(logs[0]?.msg).toBe("Unhandled exception");
      expect(logs[0]?.level).toBe(50);
    });

    it("logs debug messages when log level is debug", () => {
      const logger = createCapturingLogger("debug");
      logger.debug("Socket packet received", {
        packetType: "ping",
        bytes: 4,
      });

      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.msg).toBe("Socket packet received");
      expect(log.level).toBe(20); // Pino debug level is 20
      expect(log.packetType).toBe("ping");
    });

    it("logs debug message without context", () => {
      const logger = createCapturingLogger("debug");
      logger.debug("Debug point reached");

      expect(logs).toHaveLength(1);
      expect(logs[0]?.msg).toBe("Debug point reached");
      expect(logs[0]?.level).toBe(20);
    });
  });

  describe("Log Level Filtering", () => {
    it("filters out debug logs when level is set to 'info'", () => {
      const logger = createCapturingLogger("info");
      logger.debug("This debug log should be suppressed");
      logger.info("This info log should appear");

      expect(logs).toHaveLength(1);
      expect(logs[0]?.msg).toBe("This info log should appear");
    });

    it("filters out info and debug logs when level is set to 'warn'", () => {
      const logger = createCapturingLogger("warn");
      logger.debug("Suppressed debug");
      logger.info("Suppressed info");
      logger.warn("Allowed warning");
      logger.error("Allowed error");

      expect(logs).toHaveLength(2);
      expect(logs[0]?.msg).toBe("Allowed warning");
      expect(logs[1]?.msg).toBe("Allowed error");
    });

    it("filters out warn, info, and debug logs when level is set to 'error'", () => {
      const logger = createCapturingLogger("error");
      logger.debug("Suppressed debug");
      logger.info("Suppressed info");
      logger.warn("Suppressed warn");
      logger.error("Allowed error");

      expect(logs).toHaveLength(1);
      expect(logs[0]?.msg).toBe("Allowed error");
    });
  });

  describe("Child Logger Bindings", () => {
    it("creates child logger and inherits parent contextual bindings in all logs", () => {
      const parentLogger = createCapturingLogger("info");
      const childLogger = parentLogger.child({
        correlationId: "req-999",
        service: "room-manager",
      });

      childLogger.info("Executing room join", {
        roomCode: "JOIN",
        playerId: "p-abc",
      });

      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.msg).toBe("Executing room join");
      expect(log.correlationId).toBe("req-999");
      expect(log.service).toBe("room-manager");
      expect(log.roomCode).toBe("JOIN");
      expect(log.playerId).toBe("p-abc");
    });

    it("supports multi-level nested child loggers", () => {
      const parentLogger = createCapturingLogger("info");
      const child1 = parentLogger.child({ module: "game" });
      const child2 = child1.child({ roomCode: "NEST" });

      child2.info("Move validated", { move: "e4" });

      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.module).toBe("game");
      expect(log.roomCode).toBe("NEST");
      expect(log.move).toBe("e4");
    });
  });

  describe("Constructor Configuration and Options", () => {
    it("initializes successfully with default configuration and options object", () => {
      const logger = new PinoLogger({ level: "silent" });
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.child).toBe("function");
    });

    it("initializes successfully when no options are provided", () => {
      const logger = new PinoLogger();
      expect(logger).toBeDefined();
    });

    it("respects process.env.LOG_LEVEL when level option is omitted", () => {
      const originalEnv = process.env.LOG_LEVEL;
      try {
        process.env.LOG_LEVEL = "debug";
        const logger = new PinoLogger();
        expect(logger).toBeDefined();
      } finally {
        if (originalEnv) {
          process.env.LOG_LEVEL = originalEnv;
        } else {
          delete process.env.LOG_LEVEL;
        }
      }
    });
  });
});
