import { describe, it, expect } from "vitest";
import http from "node:http";
import { createSocketServer } from "../socket_server.js";
import { NullLogger } from "../../logger/null_logger.js";

describe("createSocketServer", () => {
  it("initializes Socket.io server with pingInterval of 25000ms and pingTimeout of 20000ms", () => {
    const httpServer = http.createServer();
    const io = createSocketServer(httpServer);

    expect(io.opts.pingInterval).toBe(25000);
    expect(io.opts.pingTimeout).toBe(20000);
    expect(io.opts.cors).toEqual({
      origin: "*",
      methods: ["GET", "POST"],
    });

    io.close();
  });

  it("allows overriding default socket options with customOptions", () => {
    const httpServer = http.createServer();
    const io = createSocketServer(httpServer, {
      pingInterval: 15000,
      pingTimeout: 8000,
    });

    expect(io.opts.pingInterval).toBe(15000);
    expect(io.opts.pingTimeout).toBe(8000);

    io.close();
  });

  it("respects process.env.CORS_ORIGIN when specified", () => {
    const originalCors = process.env.CORS_ORIGIN;
    try {
      process.env.CORS_ORIGIN = "https://fun-chess.example.com";
      const httpServer = http.createServer();
      const io = createSocketServer(httpServer);

      expect(io.opts.cors).toEqual({
        origin: "https://fun-chess.example.com",
        methods: ["GET", "POST"],
      });

      io.close();
    } finally {
      if (originalCors !== undefined) {
        process.env.CORS_ORIGIN = originalCors;
      } else {
        delete process.env.CORS_ORIGIN;
      }
    }
  });

  it("fails fast with clear diagnostics when config resolution fails in production (CRIT-006)", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalCors = process.env.CORS_ORIGIN;
    const originalPublicUrl = process.env.PUBLIC_URL;

    try {
      process.env.NODE_ENV = "production";
      delete process.env.CORS_ORIGIN;
      delete process.env.PUBLIC_URL;

      const httpServer = http.createServer();
      expect(() => createSocketServer(httpServer)).toThrowError(
        /FATAL: CORS_ORIGIN or PUBLIC_URL must be configured in production mode/,
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalCors !== undefined) process.env.CORS_ORIGIN = originalCors;
      else delete process.env.CORS_ORIGIN;
      if (originalPublicUrl !== undefined) process.env.PUBLIC_URL = originalPublicUrl;
      else delete process.env.PUBLIC_URL;
    }
  });

  it("registers engine connection_error listener with structured warning logging (MAJ-022)", () => {
    const logger = new NullLogger();
    const httpServer = http.createServer();
    const io = createSocketServer(httpServer, { logger });

    // Emit connection_error on io.engine
    io.engine.emit("connection_error", {
      code: 1,
      message: "Session ID unknown",
      context: { transport: "websocket" },
      req: {
        url: "/socket.io/?EIO=4&transport=websocket",
        headers: {
          origin: "https://unauthorized-origin.com",
        },
      },
    });

    const warnLog = logger.warnLogs.find(
      (l) => l.message === "Socket engine connection error",
    );
    expect(warnLog).toBeDefined();
    expect(warnLog?.context?.["operation"]).toBe("socket_engine_connection_error");
    expect(warnLog?.context?.["code"]).toBe(1);
    expect(warnLog?.context?.["message"]).toBe("Session ID unknown");
    expect(warnLog?.context?.["origin"]).toBe("https://unauthorized-origin.com");

    io.close();
  });
});
