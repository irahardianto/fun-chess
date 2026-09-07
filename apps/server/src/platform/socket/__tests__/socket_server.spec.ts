import { describe, it, expect } from "vitest";
import http from "node:http";
import { createSocketServer } from "../socket_server.js";
import { NullLogger } from "../../logger/null_logger.js";

describe("createSocketServer (MAJ-002, MAJ-017)", () => {
  it("initializes Socket.io server with pingInterval of 25000ms and pingTimeout of 20000ms", () => {
    const httpServer = http.createServer();
    const io = createSocketServer(httpServer, {
      allowedOrigins: ["*"],
    });

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
      allowedOrigins: ["*"],
    });

    expect(io.opts.pingInterval).toBe(15000);
    expect(io.opts.pingTimeout).toBe(8000);

    io.close();
  });

  it("respects injected env.CORS_ORIGIN without direct process.env reads (MAJ-002)", () => {
    const httpServer = http.createServer();
    const io = createSocketServer(httpServer, {
      env: {
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        CORS_ORIGIN: "https://fun-chess.example.com",
      },
    });

    expect(io.opts.cors).toEqual({
      origin: "https://fun-chess.example.com",
      methods: ["GET", "POST"],
    });

    io.close();
  });

  it("fails fast with clear diagnostics when config resolution fails in production without direct process.env (MAJ-002, CRIT-006)", () => {
    const httpServer = http.createServer();
    expect(() =>
      createSocketServer(httpServer, {
        env: {
          NODE_ENV: "production",
          PORT: 8080,
          HOST: "0.0.0.0",
          LOG_LEVEL: "info",
        },
      }),
    ).toThrowError(/FATAL: CORS_ORIGIN or PUBLIC_URL must be configured in production mode/);
  });

  it("registers engine connection_error listener and strips query string from URL (MAJ-017, MAJ-022)", () => {
    const logger = new NullLogger();
    const httpServer = http.createServer();
    const io = createSocketServer(httpServer, { logger, allowedOrigins: ["*"] });

    // Emit connection_error on io.engine with sensitive token in query string
    io.engine.emit("connection_error", {
      code: 1,
      message: "Session ID unknown",
      context: { transport: "websocket" },
      req: {
        url: "/socket.io/?EIO=4&transport=websocket&token=super-secret-token-12345",
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
    // URL must be stripped of query string to prevent sensitive token exposure
    expect(warnLog?.context?.["url"]).toBe("/socket.io/");

    io.close();
  });
});
