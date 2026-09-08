import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http, { Server } from "node:http";
import { createHttpServer } from "../http_server.js";
import { MockRoomStore } from "../../../features/rooms/mock_room.store.js";
import {
  RelayAddressService,
  MockRelayAddressService,
} from "../../../features/lan/relay_address.service.js";
import { NullLogger } from "../../logger/null_logger.js";
import {
  LanInfoResponse,
  HealthCheckResponse,
  LivenessHealthResponse,
  DetailedHealthResponse,
} from "@fun-chess/shared";

describe("createHttpServer", () => {
  let server: Server;
  let port: number;
  let store: MockRoomStore;
  let logger: NullLogger;

  beforeAll(async () => {
    store = new MockRoomStore();
    logger = new NullLogger();
    const relayAddressService = new RelayAddressService({
      lanIp: "192.168.1.50",
      port: 3000,
    });

    const handler = createHttpServer({
      roomStore: store,
      relayAddressService,
      logger,
      port: 3000,
      allowedOrigins: ["http://localhost:5173", "http://localhost:3000"],
      getActiveSocketCount: () => 2,
    });

    server = http.createServer(handler);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('responds to GET /healthz with container probe "OK" and text/plain content type', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toBe("OK");
  });

  it("responds to GET /health with lightweight liveness probe (ENH-003)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = (await res.json()) as LivenessHealthResponse;
    expect(data.status).toBe("ok");
    expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(data.timestamp).toBeDefined();
    expect((data as any).activeRooms).toBeUndefined();
    expect((data as any).activeSockets).toBeUndefined();
    expect((data as any).memoryUsageMb).toBeUndefined();
  });

  it("responds to GET /api/health with lightweight liveness JSON (alias)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as LivenessHealthResponse;
    expect(data.status).toBe("ok");
    expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(data.timestamp).toBeDefined();
    expect((data as any).activeRooms).toBeUndefined();
    expect((data as any).activeSockets).toBeUndefined();
    expect((data as any).memoryUsageMb).toBeUndefined();
  });

  it("responds to GET /health/detail and /metrics with full operational telemetry (ENH-003)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health/detail`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = (await res.json()) as DetailedHealthResponse;
    expect(data.status).toBe("ok");
    expect(data.activeSockets).toBe(2);
    expect(data.activeRooms).toBe(0);
    expect(data.memoryUsageMb.heapUsed).toBeGreaterThan(0);
    expect(data.memoryUsageMb.heapTotal).toBeGreaterThan(0);
    expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(data.timestamp).toBeDefined();
    expect(data.relay).toBeDefined();
    expect(data.relay?.mode).toBe("lan");

    const metricsRes = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(metricsRes.status).toBe(200);
    const metricsData = (await metricsRes.json()) as DetailedHealthResponse;
    expect(metricsData.status).toBe("ok");
    expect(metricsData.activeSockets).toBe(2);
  });

  it("responds to GET /api/lan-info with valid LAN info JSON and relay mode metadata", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/lan-info`, {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");

    const data = (await res.json()) as LanInfoResponse;
    expect(data.port).toBe(3000);
    expect(data.localUrl).toBe("http://localhost:3000");
    expect(data.joinUrl).toBe("http://192.168.1.50:3000");
    expect(data.relayMode).toBe("lan");
    expect(data.isCloudRelay).toBe(false);
  });

  it("handles CORS OPTIONS preflight with 204 No Content for allowed origin and logs success (MAJ-014)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/lan-info`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");

    const preflightLog = logger.infoLogs.find(
      (l) => l.context?.["operation"] === "http_options_preflight" && l.context?.["status"] === "success",
    );
    expect(preflightLog).toBeDefined();
    expect(preflightLog?.context?.["origin"]).toBe("http://localhost:5173");
    expect(preflightLog?.context?.["correlationId"]).toBeDefined();
    expect(preflightLog?.context?.["duration"]).toBeTypeOf("number");
  });

  it("blocks CORS OPTIONS preflight with 403 for disallowed origin and logs rejection (MAJ-014)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/lan-info`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil-hacker.com" },
    });
    expect(res.status).toBe(403);
    const errBody = (await res.json()) as any;
    expect(errBody.status).toBe("error");
    expect(errBody.code).toBe(403);
    expect(errBody.error.code).toBe("ERR_CORS_FORBIDDEN");

    const rejectLog = logger.warnLogs.find(
      (l) => l.context?.["operation"] === "http_options_preflight" && l.context?.["status"] === "rejected",
    );
    expect(rejectLog).toBeDefined();
    expect(rejectLog?.context?.["origin"]).toBe("https://evil-hacker.com");
    expect(rejectLog?.context?.["correlationId"]).toBeDefined();
  });

  it("does not emit Access-Control-Allow-Origin when Origin header is missing (MAJ-005)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("only emits matching origin and never comma-separated origins (MAJ-005)", async () => {
    const customHandler = createHttpServer({
      roomStore: store,
      logger: new NullLogger(),
      allowedOrigins: ["https://fun-chess.com", "https://play.fun-chess.com"],
    });
    const s = http.createServer(customHandler);
    let p = 0;
    await new Promise<void>((resolve) =>
      s.listen(0, "127.0.0.1", () => {
        p = (s.address() as any).port;
        resolve();
      }),
    );

    try {
      const res = await fetch(`http://127.0.0.1:${p}/healthz`, {
        headers: { Origin: "https://play.fun-chess.com" },
      });
      expect(res.headers.get("access-control-allow-origin")).toBe(
        "https://play.fun-chess.com",
      );
      expect(res.headers.get("vary")).toBe("Origin");

      const disallowed = await fetch(`http://127.0.0.1:${p}/healthz`, {
        headers: { Origin: "https://evil.com" },
      });
      expect(disallowed.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
  });

  it("allows Google Fonts in Content-Security-Policy (MAJ-001)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    const csp = res.headers.get("content-security-policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("https://fonts.googleapis.com");
    expect(csp).toContain("https://fonts.gstatic.com");
  });

  it("allows web workers from blobs in Content-Security-Policy (CONF-002)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    const csp = res.headers.get("content-security-policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("worker-src 'self' blob:;");
  });

  it("attaches security headers to all responses (SEC-02)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  describe("HTTP HEAD Method Support (NET-02)", () => {
    it("responds to HEAD /healthz with 200, headers, and empty body", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`, {
        method: "HEAD",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      expect(res.headers.get("content-length")).toBeDefined();
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      const body = await res.text();
      expect(body).toBe("");
    });

    it("responds to HEAD /health with 200, headers, and empty body", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        method: "HEAD",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(res.headers.get("content-length")).toBeDefined();
      const body = await res.text();
      expect(body).toBe("");
    });

    it("responds to HEAD /api/lan-info with 200, headers, and empty body", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/lan-info`, {
        method: "HEAD",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(res.headers.get("content-length")).toBeDefined();
      const body = await res.text();
      expect(body).toBe("");
    });

    it("responds to HEAD /lobby (SPA route) with 200, headers, and empty body", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/lobby`, {
        method: "HEAD",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const body = await res.text();
      expect(body).toBe("");
    });

    it("responds to HEAD /api/unknown with 404, headers, and empty body", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/unknown`, {
        method: "HEAD",
      });
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.text();
      expect(body).toBe("");
    });
  });

  it("serves SPA fallback HTML for web routes and logs static file serving at INFO level (MAJ-024)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/lobby`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const body = await res.text();
    expect(body).toContain("Fun Chess");

    const staticLog = logger.infoLogs.find((l) =>
      l.message.includes("HTTP Static served"),
    );
    expect(staticLog).toBeDefined();
    expect(staticLog?.context?.["operation"]).toBe("http_static");
    expect(staticLog?.context?.["duration"]).toBeTypeOf("number");
  });

  it("logs client IP in HTTP request entry log (ENH-008)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.status).toBe(200);

    const entryLog = logger.infoLogs.find(
      (l) => l.context?.["operation"] === "http_request" && l.context?.["path"] === "/healthz",
    );
    expect(entryLog).toBeDefined();
    expect(entryLog?.context?.["clientIp"]).toBeDefined();
    expect(typeof entryLog?.context?.["clientIp"]).toBe("string");
  });

  it("responds with 404 JSON with standardized error envelope (MIN-032)", async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/non-existent-endpoint`,
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(404);
    const json = (await res.json()) as any;
    expect(json.status).toBe("error");
    expect(json.code).toBe(404);
    expect(json.error.code).toBe("ERR_NOT_FOUND");
    expect(json.error.message).toContain("Cannot POST /api/non-existent-endpoint");
    expect(json.error.correlationId).toBeDefined();
  });

  it("enforces rate limiting on native HTTP endpoints (MIN-002)", async () => {
    const { HttpRateLimiter } = await import("../http_rate_limiter.js");
    const rateLimitedHandler = createHttpServer({
      roomStore: store,
      logger: new NullLogger(),
      rateLimiter: new HttpRateLimiter({
        maxRequests: 2,
        windowMs: 10_000,
      }),
      allowedOrigins: ["*"],
    });

    const rlServer = http.createServer(rateLimitedHandler);
    let rlPort = 0;
    await new Promise<void>((resolve) =>
      rlServer.listen(0, "127.0.0.1", () => {
        rlPort = (rlServer.address() as any).port;
        resolve();
      }),
    );

    try {
      // 1st request succeeds
      const res1 = await fetch(`http://127.0.0.1:${rlPort}/api/lan-info`);
      expect(res1.status).toBe(200);

      // 2nd request succeeds
      const res2 = await fetch(`http://127.0.0.1:${rlPort}/api/lan-info`);
      expect(res2.status).toBe(200);

      // 3rd request rate limited (429)
      const res3 = await fetch(`http://127.0.0.1:${rlPort}/api/lan-info`);
      expect(res3.status).toBe(429);
      const data = (await res3.json()) as any;
      expect(data.status).toBe("error");
      expect(data.code).toBe(429);
      expect(data.error.code).toBe("ERR_RATE_LIMITED");
    } finally {
      await new Promise<void>((resolve) => rlServer.close(() => resolve()));
    }
  });

  it("redacts process memory telemetry on /health/detail in production mode (MIN-001)", async () => {
    const prodHandler = createHttpServer({
      roomStore: store,
      logger: new NullLogger(),
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        CORS_ORIGIN: "https://fun-chess.com",
      },
      allowedOrigins: ["https://fun-chess.com"],
    });

    const prodServer = http.createServer(prodHandler);
    let prodPort = 0;
    await new Promise<void>((resolve) =>
      prodServer.listen(0, "127.0.0.1", () => {
        prodPort = (prodServer.address() as any).port;
        resolve();
      }),
    );

    try {
      const res = await fetch(`http://127.0.0.1:${prodPort}/health/detail`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as DetailedHealthResponse;
      expect(data.status).toBe("ok");
      // Memory telemetry must be redacted in production
      expect(data.memoryUsageMb).toEqual({
        rss: 0,
        heapTotal: 0,
        heapUsed: 0,
      });
    } finally {
      await new Promise<void>((resolve) => prodServer.close(() => resolve()));
    }
  });

  describe("Cloud Relay Mode", () => {
    let cloudServer: Server;
    let cloudPort: number;

    beforeAll(async () => {
      const mockRelayService = new MockRelayAddressService(
        {
          joinUrl: "https://fun-chess-prod.a.run.app",
          publicUrl: "https://fun-chess-prod.a.run.app",
          relayMode: "cloud",
          isCloudRelay: true,
          lanIp: "fun-chess-prod.a.run.app",
        },
        true,
      );

      const handler = createHttpServer({
        roomStore: new MockRoomStore(),
        relayAddressService: mockRelayService,
        logger: new NullLogger(),
        port: 8080,
      });

      cloudServer = http.createServer(handler);
      await new Promise<void>((resolve) => {
        cloudServer.listen(0, "127.0.0.1", () => {
          const addr = cloudServer.address();
          if (typeof addr === "object" && addr) {
            cloudPort = addr.port;
          }
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        cloudServer.close(() => resolve());
      });
    });

    it("returns cloud relay mode in /health/detail endpoint", async () => {
      const res = await fetch(`http://127.0.0.1:${cloudPort}/health/detail`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as DetailedHealthResponse;
      expect(data.relay?.mode).toBe("cloud");
      expect(data.relay?.publicUrl).toBe("https://fun-chess-prod.a.run.app");
    });

    it("returns cloud relay joinUrl in /api/lan-info endpoint", async () => {
      const res = await fetch(`http://127.0.0.1:${cloudPort}/api/lan-info`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as LanInfoResponse;
      expect(data.relayMode).toBe("cloud");
      expect(data.isCloudRelay).toBe(true);
      expect(data.joinUrl).toBe("https://fun-chess-prod.a.run.app");
    });
  });
});
