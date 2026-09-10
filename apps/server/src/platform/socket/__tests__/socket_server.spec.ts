import { describe, it, expect } from "vitest";
import http from "node:http";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import {
  createSocketServer,
  createConcurrentConnectionMiddleware,
  ConnectionTracker,
  HANDSHAKE_RATE_LIMIT_MAX_REQUESTS,
  MAX_CONCURRENT_SOCKETS_PER_IP,
} from "../socket_server.js";
import { createSocketRateLimiter } from "../socket_rate_limiter.js";
import { NullLogger } from "../../logger/null_logger.js";
import type { SocketErrorPayload } from "@fun-chess/shared";

describe("createSocketServer (CRIT-002, MAJ-002, MAJ-017)", () => {
  it("exports architectural contract default constants (MAJ-002)", () => {
    expect(HANDSHAKE_RATE_LIMIT_MAX_REQUESTS).toBe(30);
    expect(MAX_CONCURRENT_SOCKETS_PER_IP).toBe(10);
  });

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

  it("respects injected env.CORS_ORIGIN and enforces origin check on upgrades (CRIT-002, MAJ-002, SEC-RT-001)", () => {
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

    expect(io.opts.cors?.methods).toEqual(["GET", "POST"]);
    expect(typeof io.opts.cors?.origin).toBe("function");

    // Test CORS callback
    const corsValidator = io.opts.cors?.origin as (
      origin: string | undefined,
      callback: (err: Error | null, success?: boolean) => void,
    ) => void;

    let allowedSuccess = false;
    corsValidator("https://fun-chess.example.com", (err, success) => {
      if (!err && success) allowedSuccess = true;
    });
    expect(allowedSuccess).toBe(true);

    let rejectedErr: Error | null = null;
    corsValidator("https://evil.com", (err) => {
      rejectedErr = err;
    });
    expect(rejectedErr).toBeInstanceOf(Error);

    // Test allowRequest on ServerOptions (SEC-RT-001, CRIT-002)
    const allowRequest = io.opts.allowRequest!;
    expect(typeof allowRequest).toBe("function");

    let upgradeAllowed = false;
    allowRequest(
      { headers: { origin: "https://fun-chess.example.com" } } as unknown as http.IncomingMessage,
      (err, success) => {
        if (!err && success) upgradeAllowed = true;
      },
    );
    expect(upgradeAllowed).toBe(true);

    // CRIT-002: callback returns valid string "Unauthorized origin", not 3 as unknown as string
    let upgradeRejected = false;
    let rejectedMessage: string | null = null;
    allowRequest(
      { headers: { origin: "https://evil.com" } } as unknown as http.IncomingMessage,
      (err, success) => {
        if (err === "Unauthorized origin" && !success) {
          upgradeRejected = true;
          rejectedMessage = err;
        }
      },
    );
    expect(upgradeRejected).toBe(true);
    expect(rejectedMessage).toBe("Unauthorized origin");

    io.close();
  });

  it("emits structured warning log when allowRequest rejects an unpermitted origin (CRIT-002, MIN-012)", () => {
    const logger = new NullLogger();
    const httpServer = http.createServer();
    const io = createSocketServer(httpServer, {
      logger,
      allowedOrigins: ["https://fun-chess.example.com"],
    });

    const allowRequest = io.opts.allowRequest!;
    let rejected = false;
    allowRequest(
      {
        headers: { origin: "https://hacker.com" },
        url: "/socket.io/?token=secret",
      } as unknown as http.IncomingMessage,
      (err, success) => {
        if (err === "Unauthorized origin" && !success) rejected = true;
      },
    );
    expect(rejected).toBe(true);

    const warnLog = logger.warnLogs.find(
      (l) => l.message === "Socket connection rejected: origin not allowed",
    );
    expect(warnLog).toBeDefined();
    expect(warnLog?.context?.["operation"]).toBe("socket_cors_rejected");
    expect(warnLog?.context?.["origin"]).toBe("https://hacker.com");
    expect(warnLog?.context?.["url"]).toBe("/socket.io/");
    expect(warnLog?.context?.["correlationId"]).toBeDefined();

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
    ).toThrowError(/FATAL: CORS_ORIGIN, PUBLIC_URL, or CLIENT_URL must be configured in production mode/);
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

  describe("Handshake Rate Limiting (MAJ-002, api_contracts.md §6.3)", () => {
    it("allows handshakes within quota and rejects excess requests with HTTP 429", () => {
      const logger = new NullLogger();
      const httpServer = http.createServer();
      const rateLimiter = createSocketRateLimiter({
        windowMs: 10_000,
        maxRequests: 3, // Low quota for deterministic testing
      });

      const io = createSocketServer(httpServer, {
        logger,
        allowedOrigins: ["*"],
        handshakeRateLimiter: rateLimiter,
      });

      const allowRequest = io.opts.allowRequest!;

      const mockReq = {
        headers: {},
        socket: { remoteAddress: "192.168.1.100" },
        url: "/socket.io/?EIO=4&transport=polling",
      } as unknown as http.IncomingMessage;

      // First 3 handshakes should succeed
      for (let i = 0; i < 3; i++) {
        let allowed = false;
        allowRequest(mockReq, (err, success) => {
          if (!err && success) allowed = true;
        });
        expect(allowed).toBe(true);
      }

      // 4th handshake should be rejected with rate limit message and 429 response
      let rejected = false;
      let rejectedErr: string | null = null;

      let responseStatusCode = 0;
      const responseHeaders: Record<string, string> = {};
      let responseBody = "";

      const mockRes = {
        headersSent: false,
        setHeader(name: string, value: string) {
          responseHeaders[name] = value;
        },
        writeHead(status: number) {
          responseStatusCode = status;
          return this;
        },
        end(chunk: string) {
          responseBody = chunk;
          return this;
        },
      };

      const rateLimitedReq = {
        ...mockReq,
        res: mockRes,
      } as unknown as http.IncomingMessage;

      allowRequest(rateLimitedReq, (err, success) => {
        if (!success) {
          rejected = true;
          rejectedErr = err ?? null;
        }
      });

      expect(rejected).toBe(true);
      expect(rejectedErr).toBe("Handshake rate limit exceeded");

      // Simulate Engine.IO's abortRequest invoking writeHead & end on the response
      mockRes.writeHead(403);
      mockRes.end();

      // Verify HTTP 429 response details
      expect(responseStatusCode).toBe(429);
      expect(responseHeaders["Retry-After"]).toBe("10");
      expect(responseHeaders["Content-Type"]).toContain("application/json");
      expect(JSON.parse(responseBody)).toEqual({
        code: "ERR_RATE_LIMITED",
        message: "Too many connection attempts. Please wait before reconnecting.",
        retryAfter: 10,
      });

      // Verify structured warning log was recorded
      const warnLog = logger.warnLogs.find(
        (l) => l.message === "Socket connection rejected: handshake rate limit exceeded",
      );
      expect(warnLog).toBeDefined();
      expect(warnLog?.context?.["operation"]).toBe("socket_handshake_rate_limited");
      expect(warnLog?.context?.["clientIp"]).toBe("192.168.1.100");

      io.close();
    });

    it("isolates handshake rate limit quotas per IP address", () => {
      const httpServer = http.createServer();
      const rateLimiter = createSocketRateLimiter({
        windowMs: 10_000,
        maxRequests: 2,
      });

      const io = createSocketServer(httpServer, {
        allowedOrigins: ["*"],
        handshakeRateLimiter: rateLimiter,
      });

      const allowRequest = io.opts.allowRequest!;

      const reqA = {
        headers: {},
        socket: { remoteAddress: "10.0.0.1" },
      } as unknown as http.IncomingMessage;

      const reqB = {
        headers: {},
        socket: { remoteAddress: "10.0.0.2" },
      } as unknown as http.IncomingMessage;

      // Exhaust IP A
      allowRequest(reqA, () => {});
      allowRequest(reqA, () => {});

      let aAllowed = true;
      allowRequest(reqA, (err, success) => {
        aAllowed = Boolean(success);
      });
      expect(aAllowed).toBe(false);

      // IP B should still be allowed
      let bAllowed = false;
      allowRequest(reqB, (err, success) => {
        bAllowed = Boolean(success);
      });
      expect(bAllowed).toBe(true);

      io.close();
    });

    it("evaluates x-forwarded-for when trustProxy is enabled", () => {
      const httpServer = http.createServer();
      const rateLimiter = createSocketRateLimiter({
        windowMs: 10_000,
        maxRequests: 1,
      });

      const io = createSocketServer(httpServer, {
        allowedOrigins: ["*"],
        handshakeRateLimiter: rateLimiter,
        trustProxy: true,
      });

      const allowRequest = io.opts.allowRequest!;

      const reqProxyA = {
        headers: { "x-forwarded-for": "1.1.1.1, 203.0.113.195" },
        socket: { remoteAddress: "127.0.0.1" },
      } as unknown as http.IncomingMessage;

      const reqProxyB = {
        headers: { "x-forwarded-for": "1.1.1.1, 203.0.113.196" },
        socket: { remoteAddress: "127.0.0.1" },
      } as unknown as http.IncomingMessage;

      // Consume quota for 203.0.113.195
      let firstAllowed = false;
      allowRequest(reqProxyA, (err, success) => {
        firstAllowed = Boolean(success);
      });
      expect(firstAllowed).toBe(true);

      let secondAllowed = true;
      allowRequest(reqProxyA, (err, success) => {
        secondAllowed = Boolean(success);
      });
      expect(secondAllowed).toBe(false);

      // Distinct client IP 203.0.113.196 behind the same proxy should be allowed
      let otherAllowed = false;
      allowRequest(reqProxyB, (err, success) => {
        otherAllowed = Boolean(success);
      });
      expect(otherAllowed).toBe(true);

      io.close();
    });
  });

  describe("Concurrent Connection Capping (MAJ-002, api_contracts.md §6.4)", () => {
    it("enforces concurrent socket limits per IP and rejects excess connections", () => {
      const logger = new NullLogger();
      const tracker = new ConnectionTracker();

      const middleware = createConcurrentConnectionMiddleware(tracker, 2, false, logger);

      const fakeSocket1 = {
        id: "sock_1",
        handshake: { address: "192.168.1.5" },
        on: (_event: string, _cb: () => void) => {},
      };
      const fakeSocket2 = {
        id: "sock_2",
        handshake: { address: "192.168.1.5" },
        on: (_event: string, _cb: () => void) => {},
      };
      const fakeSocket3 = {
        id: "sock_3",
        handshake: { address: "192.168.1.5" },
        on: (_event: string, _cb: () => void) => {},
      };

      let err1: Error | undefined;
      middleware(fakeSocket1, (err?: Error) => {
        err1 = err;
      });
      expect(err1).toBeUndefined();
      expect(tracker.getActiveCount("192.168.1.5")).toBe(1);

      let err2: Error | undefined;
      middleware(fakeSocket2, (err?: Error) => {
        err2 = err;
      });
      expect(err2).toBeUndefined();
      expect(tracker.getActiveCount("192.168.1.5")).toBe(2);

      // 3rd socket from same IP exceeds cap of 2
      let err3: Error | undefined;
      middleware(fakeSocket3, (err?: Error) => {
        err3 = err;
      });
      expect(err3).toBeDefined();
      expect(err3?.message).toBe("Maximum concurrent connections exceeded");

      const payload = (err3 as unknown as { data: SocketErrorPayload }).data;
      expect(payload).toBeDefined();
      expect(payload.code).toBe("ERR_RATE_LIMITED");
      expect(payload.details?.["activeConnections"]).toBe(2);
      expect(payload.details?.["maxAllowed"]).toBe(2);

      // Warning log emitted
      const warnLog = logger.warnLogs.find(
        (l) => l.message === "Socket connection rejected: concurrent connection limit exceeded",
      );
      expect(warnLog).toBeDefined();
      expect(warnLog?.context?.["clientIp"]).toBe("192.168.1.5");
      expect(warnLog?.context?.["activeConnections"]).toBe(2);
    });

    it("decrements active count when socket disconnects and allows subsequent connection", () => {
      const tracker = new ConnectionTracker();
      const middleware = createConcurrentConnectionMiddleware(tracker, 1, false);

      let disconnectListener: (() => void) | undefined;
      const fakeSocket1 = {
        id: "sock_1",
        handshake: { address: "172.16.0.50" },
        on: (event: string, cb: () => void) => {
          if (event === "disconnect") {
            disconnectListener = cb;
          }
        },
      };

      // Connect socket 1
      let err1: Error | undefined;
      middleware(fakeSocket1, (err?: Error) => {
        err1 = err;
      });
      expect(err1).toBeUndefined();
      expect(tracker.getActiveCount("172.16.0.50")).toBe(1);

      // Socket 2 should be rejected
      const fakeSocket2 = {
        id: "sock_2",
        handshake: { address: "172.16.0.50" },
        on: () => {},
      };
      let err2: Error | undefined;
      middleware(fakeSocket2, (err?: Error) => {
        err2 = err;
      });
      expect(err2?.message).toBe("Maximum concurrent connections exceeded");

      // Disconnect socket 1
      expect(disconnectListener).toBeDefined();
      disconnectListener!();
      expect(tracker.getActiveCount("172.16.0.50")).toBe(0);

      // Socket 2 can now connect
      let retryErr: Error | undefined;
      middleware(fakeSocket2, (err?: Error) => {
        retryErr = err;
      });
      expect(retryErr).toBeUndefined();
      expect(tracker.getActiveCount("172.16.0.50")).toBe(1);
    });

    it("ConnectionTracker cleans up keys when connections drop to zero", () => {
      const tracker = new ConnectionTracker();
      expect(tracker.getActiveCount("1.2.3.4")).toBe(0);

      tracker.increment("1.2.3.4");
      expect(tracker.getActiveCount("1.2.3.4")).toBe(1);
      expect(tracker.getAllCounts().has("1.2.3.4")).toBe(true);

      tracker.decrement("1.2.3.4");
      expect(tracker.getActiveCount("1.2.3.4")).toBe(0);
      // Map entry should be deleted to prevent memory leaks
      expect(tracker.getAllCounts().has("1.2.3.4")).toBe(false);

      tracker.increment("1.2.3.4");
      tracker.reset();
      expect(tracker.getActiveCount("1.2.3.4")).toBe(0);
    });
  });

  describe("Live Loopback Integration (MAJ-002)", () => {
    it("throttles excess live socket connections with connect_error payload", async () => {
      const httpServer = http.createServer();
      const tracker = new ConnectionTracker();
      const io = createSocketServer(httpServer, {
        allowedOrigins: ["*"],
        connectionTracker: tracker,
        maxConcurrentSocketsPerIp: 2,
      });

      await new Promise<void>((resolve) => httpServer.listen(0, resolve));
      const port = (httpServer.address() as { port: number }).port;
      const url = `http://127.0.0.1:${port}`;

      const clients: ClientSocket[] = [];

      try {
        // Connect client 1
        const client1 = ioc(url, { transports: ["websocket"], reconnection: false });
        clients.push(client1);
        await new Promise<void>((resolve, reject) => {
          client1.on("connect", resolve);
          client1.on("connect_error", reject);
        });

        // Connect client 2
        const client2 = ioc(url, { transports: ["websocket"], reconnection: false });
        clients.push(client2);
        await new Promise<void>((resolve, reject) => {
          client2.on("connect", resolve);
          client2.on("connect_error", reject);
        });

        expect(tracker.getActiveCount("127.0.0.1")).toBe(2);

        // Connect client 3 - exceeds maxConcurrentSocketsPerIp of 2
        const client3 = ioc(url, { transports: ["websocket"], reconnection: false });
        clients.push(client3);

        const connectError = await new Promise<{ message: string; data: SocketErrorPayload }>(
          (resolve) => {
            client3.on("connect_error", (err: Error & { data?: SocketErrorPayload }) => {
              resolve({
                message: err.message,
                data: err.data!,
              });
            });
          },
        );

        expect(connectError.message).toBe("Maximum concurrent connections exceeded");
        expect(connectError.data.code).toBe("ERR_RATE_LIMITED");
        expect(connectError.data.details?.["maxAllowed"]).toBe(2);

        // Disconnect client 1
        client1.disconnect();
        // Wait for disconnect propagation
        await new Promise((r) => setTimeout(r, 50));
        expect(tracker.getActiveCount("127.0.0.1")).toBe(1);

        // Client 4 can now connect
        const client4 = ioc(url, { transports: ["websocket"], reconnection: false });
        clients.push(client4);
        await new Promise<void>((resolve, reject) => {
          client4.on("connect", resolve);
          client4.on("connect_error", reject);
        });
        expect(tracker.getActiveCount("127.0.0.1")).toBe(2);
      } finally {
        for (const client of clients) {
          client.disconnect();
        }
        io.close();
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    });

    it("rejects excess polling handshakes over live HTTP with status 429", async () => {
      const httpServer = http.createServer();
      const rateLimiter = createSocketRateLimiter({
        windowMs: 10_000,
        maxRequests: 2,
      });

      const io = createSocketServer(httpServer, {
        allowedOrigins: ["*"],
        handshakeRateLimiter: rateLimiter,
      });

      await new Promise<void>((resolve) => httpServer.listen(0, resolve));
      const port = (httpServer.address() as { port: number }).port;

      const makePollingHandshake = () =>
        new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }>(
          (resolve, reject) => {
            http
              .get(`http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`, (res) => {
                let data = "";
                res.on("data", (chunk) => {
                  data += chunk;
                });
                res.on("end", () => {
                  resolve({
                    statusCode: res.statusCode ?? 0,
                    headers: res.headers,
                    body: data,
                  });
                });
              })
              .on("error", reject);
          },
        );

      try {
        // Request 1 and 2 succeed (HTTP 200)
        const res1 = await makePollingHandshake();
        expect(res1.statusCode).toBe(200);

        const res2 = await makePollingHandshake();
        expect(res2.statusCode).toBe(200);

        // Request 3 exceeds handshake rate limit (HTTP 429)
        const res3 = await makePollingHandshake();
        expect(res3.statusCode).toBe(429);
        expect(res3.headers["retry-after"]).toBe("10");
        expect(res3.headers["content-type"]).toContain("application/json");

        const parsed = JSON.parse(res3.body);
        expect(parsed.code).toBe("ERR_RATE_LIMITED");
        expect(parsed.retryAfter).toBe(10);
      } finally {
        io.close();
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    });
  });
});
