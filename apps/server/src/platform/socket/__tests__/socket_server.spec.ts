import { describe, it, expect } from "vitest";
import http from "node:http";
import { createSocketServer } from "../socket_server.js";

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
});
