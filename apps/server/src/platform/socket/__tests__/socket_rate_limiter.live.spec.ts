import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import net from "node:net";
import { io as ClientIO, Socket as ClientSocket } from "socket.io-client";
import { createSocketServer } from "../socket_server.js";
import { createSocketRateLimiter } from "../socket_rate_limiter.js";
import { wrapSocketHandler } from "../socket_logging_middleware.js";
import { NullLogger } from "../../logger/null_logger.js";

describe("Live Socket Rate Limiting (MAJ-038, MAJ-001)", () => {
  let server: http.Server;
  let port: number;
  let client1: ClientSocket;
  let client2: ClientSocket;
  const logger = new NullLogger();

  beforeAll(async () => {
    server = http.createServer();
    const io = createSocketServer(server, {
      allowedOrigins: ["*"],
    });

    const rateLimiter = createSocketRateLimiter({
      maxRequests: 2,
      windowMs: 10_000,
      pruneIntervalMs: 0,
    });

    io.on("connection", (socket) => {
      socket.data = { rateLimiter };

      const pingHandler = wrapSocketHandler(
        logger,
        "test:ping",
        socket as any,
        { rateLimiter },
        async (req: { msg: string }) => {
          return { reply: req.msg, timestamp: Date.now() };
        },
      );

      socket.on("test:ping", pingHandler);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as net.AddressInfo;
        port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (client1?.connected) client1.disconnect();
    if (client2?.connected) client2.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("permits messages up to the limit and drops subsequent messages over live socket connection (MAJ-038)", async () => {
    client1 = ClientIO(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      forceNew: true,
    });

    await new Promise<void>((resolve) => {
      client1.on("connect", () => resolve());
    });

    // 1st request succeeds
    const res1 = await new Promise<any>((resolve) => {
      client1.emit("test:ping", { msg: "ping-1" }, resolve);
    });
    expect(res1.reply).toBe("ping-1");

    // 2nd request succeeds
    const res2 = await new Promise<any>((resolve) => {
      client1.emit("test:ping", { msg: "ping-2" }, resolve);
    });
    expect(res2.reply).toBe("ping-2");

    // 3rd request rate limited (exceeds 2 requests per 10s)
    const res3 = await new Promise<any>((resolve) => {
      client1.emit("test:ping", { msg: "ping-3" }, resolve);
    });
    expect(res3.success).toBe(false);
    expect(res3.error.code).toBe("ERR_RATE_LIMITED");
    expect(res3.error.message).toContain("Maximum 2 requests");
    expect(res3.error.correlationId).toBeDefined();
  });

  it("prevents disconnect evasion by enforcing rate limit across new socket connections from the same IP (MAJ-001)", async () => {
    // Connect client2 as a "new" socket from the same IP (127.0.0.1)
    client2 = ClientIO(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      forceNew: true,
    });

    await new Promise<void>((resolve) => {
      client2.on("connect", () => resolve());
    });

    // Rate limit must still apply because the IP already consumed all quota
    const res = await new Promise<any>((resolve) => {
      client2.emit("test:ping", { msg: "evasion-attempt" }, resolve);
    });

    expect(res.success).toBe(false);
    expect(res.error.code).toBe("ERR_RATE_LIMITED");
  });
});
