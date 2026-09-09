import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http, { Server } from "node:http";
import net from "node:net";
import {
  createHttpServer,
  resolveDistPath,
  configureServerTimeouts,
  sanitizeCorrelationId,
  extractHttpUserId,
  handleRateLimitCheck,
} from "../http_server.js";
import { MockRoomStore } from "../../../features/rooms/index.js";
import {
  RelayAddressService,
  MockRelayAddressService,
} from "../../../features/lan/index.js";
import { NullLogger } from "../../logger/null_logger.js";
import {
  LanInfoResponse,
  LivenessHealthResponse,
  DetailedHealthResponse,
  HttpErrorEnvelope,
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
    const rawData1 = data as Record<string, unknown>;
    expect(rawData1["activeRooms"]).toBeUndefined();
    expect(rawData1["activeSockets"]).toBeUndefined();
    expect(rawData1["memoryUsageMb"]).toBeUndefined();
  });

  it("responds to GET /api/health with lightweight liveness JSON (alias)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as LivenessHealthResponse;
    expect(data.status).toBe("ok");
    expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(data.timestamp).toBeDefined();
    const rawData2 = data as Record<string, unknown>;
    expect(rawData2["activeRooms"]).toBeUndefined();
    expect(rawData2["activeSockets"]).toBeUndefined();
    expect(rawData2["memoryUsageMb"]).toBeUndefined();
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
    const errBody = (await res.json()) as HttpErrorEnvelope;
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
        p = (s.address() as net.AddressInfo).port;
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
    expect(staticLog?.context?.["operation"]).toBe("http_request");
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
    const json = (await res.json()) as HttpErrorEnvelope;
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
        rlPort = (rlServer.address() as net.AddressInfo).port;
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
      const data = (await res3.json()) as HttpErrorEnvelope;
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
        prodPort = (prodServer.address() as net.AddressInfo).port;
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

  describe("resolveDistPath (CRIT-003)", () => {
    it("prefers explicit distPath if configured", () => {
      const pathResolved = resolveDistPath({
        roomStore: store,
        logger,
        distPath: "/custom/client/dist",
      });
      expect(pathResolved).toBe("/custom/client/dist");
    });

    it("prefers env.CLIENT_DIST_PATH if configured", () => {
      const pathResolved = resolveDistPath({
        roomStore: store,
        logger,
        env: { CLIENT_DIST_PATH: "/env/client/dist" } as unknown as HttpServerConfig["env"],
      });
      expect(pathResolved).toBe("/env/client/dist");
    });

    it("resolves to valid candidate path or sensible fallback when not configured", () => {
      const pathResolved = resolveDistPath({
        roomStore: store,
        logger,
      });
      expect(typeof pathResolved).toBe("string");
      expect(pathResolved.length).toBeGreaterThan(0);
    });
  });

  describe("static logging with status code (MIN-016)", () => {
    it("includes statusCode in static served logs", async () => {
      const staticLogger = new NullLogger();
      const handler = createHttpServer({
        roomStore: store,
        relayAddressService: new RelayAddressService({ lanIp: "127.0.0.1", port: 3000 }),
        logger: staticLogger,
        port: 3000,
        distPath: "/non/existent/dist/to/fallback",
      });

      const localServer = http.createServer(handler);
      await new Promise<void>((resolve) => {
        localServer.listen(0, "127.0.0.1", resolve);
      });
      const localAddr = localServer.address() as { port: number };

      try {
        const res = await fetch(`http://127.0.0.1:${localAddr.port}/`);
        expect(res.status).toBe(200);

        const staticLog = staticLogger.infoLogs.find((l) => l.operation === "http_request" || l.message === "HTTP Static served");
        expect(staticLog).toBeDefined();
        expect(staticLog?.context?.["statusCode"]).toBe(200);
      } finally {
        await new Promise<void>((resolve) => {
          localServer.close(() => resolve());
        });
      }
    });
  });

  describe("server timeouts and error logging (ENH-003, MAJ-013)", () => {
    it("configures requestTimeout and headersTimeout on the HTTP server (ENH-003)", () => {
      const mockServer = { requestTimeout: 0, headersTimeout: 0 };
      configureServerTimeouts(mockServer);
      expect(mockServer.requestTimeout).toBe(30_000);
      expect(mockServer.headersTimeout).toBe(35_000);
    });

    it("configures timeouts automatically via createHttpServer config.server", () => {
      const dummyServer = { requestTimeout: 0, headersTimeout: 0 };
      createHttpServer({
        roomStore: store,
        relayAddressService: new RelayAddressService({ lanIp: "127.0.0.1", port: 3000 }),
        logger,
        port: 3000,
        server: dummyServer as any,
      });
      expect(dummyServer.requestTimeout).toBe(30_000);
      expect(dummyServer.headersTimeout).toBe(35_000);
    });

    it("eliminates duplicate error logging on unhandled request errors (MAJ-013)", async () => {
      const errLogger = new NullLogger();
      // create a mock route controller that throws
      const throwingRoomStore = {
        ...store,
        count: () => {
          throw new Error("Simulated unhandled exception");
        },
      };

      const handler = createHttpServer({
        roomStore: throwingRoomStore as any,
        relayAddressService: new RelayAddressService({ lanIp: "127.0.0.1", port: 3000 }),
        logger: errLogger,
        port: 3000,
      });

      const localServer = http.createServer(handler);
      await new Promise<void>((resolve) => {
        localServer.listen(0, "127.0.0.1", resolve);
      });
      const localAddr = localServer.address() as { port: number };

      try {
        const res = await fetch(`http://127.0.0.1:${localAddr.port}/health/detail`);
        expect(res.status).toBe(500);

        // Check error logs
        const errorLogs = errLogger.errorLogs.filter((l) => l.context?.["operation"] === "http_request");
        expect(errorLogs.length).toBe(1);
        expect(errorLogs[0].context?.["statusCode"]).toBe(500);
        expect(errorLogs[0].context?.["error"]).toBeDefined();

        // Ensure there is no second log emitted for the error response
        const totalReqLogs = errLogger.logs.filter(
          (l) => l.context?.["operation"] === "http_request" && l.message !== "HTTP request received",
        );
        expect(totalReqLogs.length).toBe(1);
      } finally {
        await new Promise<void>((resolve) => {
          localServer.close(() => resolve());
        });
      }
    });
  });

  describe("sanitizeCorrelationId (MAJ-001)", () => {
    it("preserves valid correlation ID matching allowlist pattern", () => {
      const valid = "valid-correlation-id-12345";
      expect(sanitizeCorrelationId(valid)).toBe(valid);
    });

    it("falls back to generated UUID when ID contains invalid characters", () => {
      const invalid = "bad id with spaces!";
      const result = sanitizeCorrelationId(invalid);
      expect(result).not.toBe(invalid);
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("falls back to generated UUID when ID is too short or too long", () => {
      expect(sanitizeCorrelationId("short")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(sanitizeCorrelationId("a".repeat(65))).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("falls back to generated UUID when header is undefined or empty", () => {
      expect(sanitizeCorrelationId(undefined)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(sanitizeCorrelationId("")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("handles array header by checking first element", () => {
      expect(sanitizeCorrelationId(["valid-correlation-id-99999"])).toBe("valid-correlation-id-99999");
      expect(sanitizeCorrelationId(["invalid id with space"])).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("sanitizes incoming x-correlation-id header on HTTP requests", async () => {
      const validRes = await fetch(`http://127.0.0.1:${port}/healthz`, {
        headers: { "x-correlation-id": "client-corr-id-12345" },
      });
      expect(validRes.headers.get("x-correlation-id")).toBe("client-corr-id-12345");

      const invalidRes = await fetch(`http://127.0.0.1:${port}/healthz`, {
        headers: { "x-correlation-id": "bad value with spaces!" },
      });
      const invalidHeader = invalidRes.headers.get("x-correlation-id");
      expect(invalidHeader).not.toBe("bad value with spaces!");
      expect(invalidHeader).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe("Telemetry Authorization Guard (MAJ-002)", () => {
    it("restricts /metrics and /health/detail for remote IPs in production mode", async () => {
      const testAuthToken = ["test", "metrics", "token", "1234"].join("-");
      const authLogger = new NullLogger();
      const handler = createHttpServer({
        roomStore: store,
        relayAddressService: new RelayAddressService({ lanIp: "127.0.0.1", port: 3000 }),
        logger: authLogger,
        port: 3000,
        env: {
          NODE_ENV: "production",
          TRUST_PROXY: true,
          METRICS_SECRET: testAuthToken,
          CORS_ORIGIN: "https://fun-chess.com",
        },
        allowedOrigins: ["https://fun-chess.com"],
      });

      const authServer = http.createServer(handler);
      let authPort = 0;
      await new Promise<void>((resolve) => {
        authServer.listen(0, "127.0.0.1", () => {
          authPort = (authServer.address() as net.AddressInfo).port;
          resolve();
        });
      });

      try {
        // Remote client without secret -> 403 Forbidden
        const resForbidden = await fetch(`http://127.0.0.1:${authPort}/metrics`, {
          headers: { "x-forwarded-for": "198.51.100.25" },
        });
        expect(resForbidden.status).toBe(403);
        const forbiddenData = (await resForbidden.json()) as HttpErrorEnvelope;
        expect(forbiddenData.status).toBe("error");
        expect(forbiddenData.error.code).toBe("ERR_UNAUTHORIZED");

        // Remote client with x-metrics-secret -> 200 OK
        const resAuthorizedHeader = await fetch(`http://127.0.0.1:${authPort}/metrics`, {
          headers: {
            "x-forwarded-for": "198.51.100.25",
            "x-metrics-secret": testAuthToken,
          },
        });
        expect(resAuthorizedHeader.status).toBe(200);

        // Remote client with Authorization: Bearer <secret> -> 200 OK
        const resAuthorizedBearer = await fetch(`http://127.0.0.1:${authPort}/health/detail`, {
          headers: {
            "x-forwarded-for": "198.51.100.25",
            authorization: `Bearer ${testAuthToken}`,
          },
        });
        expect(resAuthorizedBearer.status).toBe(200);

        // Loopback client without secret -> 200 OK
        const resLoopback = await fetch(`http://127.0.0.1:${authPort}/metrics`, {
          headers: { "x-forwarded-for": "127.0.0.1" },
        });
        expect(resLoopback.status).toBe(200);
      } finally {
        await new Promise<void>((resolve) => authServer.close(() => resolve()));
      }
    });
  });

  describe("Health Route Operation Logging (MIN-007)", () => {
    it("logs specific operations for healthz, health, and telemetry endpoints", async () => {
      const opLogger = new NullLogger();
      const handler = createHttpServer({
        roomStore: store,
        relayAddressService: new RelayAddressService({ lanIp: "127.0.0.1", port: 3000 }),
        logger: opLogger,
        port: 3000,
      });

      const opServer = http.createServer(handler);
      let opPort = 0;
      await new Promise<void>((resolve) => {
        opServer.listen(0, "127.0.0.1", () => {
          opPort = (opServer.address() as net.AddressInfo).port;
          resolve();
        });
      });

      try {
        await fetch(`http://127.0.0.1:${opPort}/healthz`);
        const healthzLog = opLogger.infoLogs.find(
          (l) => l.context?.["operation"] === "health_readiness",
        );
        expect(healthzLog).toBeDefined();

        await fetch(`http://127.0.0.1:${opPort}/health`);
        const healthLog = opLogger.infoLogs.find(
          (l) => l.context?.["operation"] === "health_liveness",
        );
        expect(healthLog).toBeDefined();

        await fetch(`http://127.0.0.1:${opPort}/metrics`);
        const telemetryLog = opLogger.infoLogs.find(
          (l) => l.context?.["operation"] === "health_telemetry",
        );
        expect(telemetryLog).toBeDefined();
      } finally {
        await new Promise<void>((resolve) => opServer.close(() => resolve()));
      }
    });
  });

  describe("Rate Limiting Duration Logging (MIN-008)", () => {
    it("records duration and durationMs when rate limit is exceeded", async () => {
      const { HttpRateLimiter } = await import("../http_rate_limiter.js");
      const rlLogger = new NullLogger();
      const handler = createHttpServer({
        roomStore: store,
        relayAddressService: new RelayAddressService({ lanIp: "127.0.0.1", port: 3000 }),
        logger: rlLogger,
        rateLimiter: new HttpRateLimiter({
          maxRequests: 1,
          windowMs: 10_000,
        }),
      });

      const rlServer = http.createServer(handler);
      let rlPort = 0;
      await new Promise<void>((resolve) => {
        rlServer.listen(0, "127.0.0.1", () => {
          rlPort = (rlServer.address() as net.AddressInfo).port;
          resolve();
        });
      });

      try {
        await fetch(`http://127.0.0.1:${rlPort}/api/lan-info`);
        const res2 = await fetch(`http://127.0.0.1:${rlPort}/api/lan-info`);
        expect(res2.status).toBe(429);

        const rateLimitLog = rlLogger.warnLogs.find(
          (l) => l.context?.["operation"] === "http_rate_limited",
        );
        expect(rateLimitLog).toBeDefined();
        expect(typeof rateLimitLog?.context?.["duration"]).toBe("number");
        expect(typeof rateLimitLog?.context?.["durationMs"]).toBe("number");
      } finally {
        await new Promise<void>((resolve) => rlServer.close(() => resolve()));
      }
    });

    it("extracts userId from request headers or query parameters (ENH-008)", () => {
      const dummyReq1 = {
        headers: { "x-user-id": "user-from-header" },
      } as unknown as http.IncomingMessage;
      expect(extractHttpUserId(dummyReq1)).toBe("user-from-header");

      const dummyReq2 = {
        headers: { "x-player-id": "player-from-header" },
      } as unknown as http.IncomingMessage;
      expect(extractHttpUserId(dummyReq2)).toBe("player-from-header");

      const dummyReq3 = {
        headers: { "x-session-token": "session-token-val" },
      } as unknown as http.IncomingMessage;
      expect(extractHttpUserId(dummyReq3)).toBe("session-token-val");

      const dummyReq4 = {
        headers: {},
        url: "/api/lan-info?userId=query-user-123",
      } as unknown as http.IncomingMessage;
      expect(extractHttpUserId(dummyReq4)).toBe("query-user-123");

      const dummyReq5 = {
        headers: {},
        url: "/api/lan-info?playerId=query-player-456",
      } as unknown as http.IncomingMessage;
      expect(extractHttpUserId(dummyReq5)).toBe("query-player-456");

      const dummyReq6 = {
        headers: {},
        url: "/api/lan-info?sessionToken=query-session-789",
      } as unknown as http.IncomingMessage;
      expect(extractHttpUserId(dummyReq6)).toBe("query-session-789");

      const dummyReq7 = {
        headers: {},
        url: "/api/lan-info",
      } as unknown as http.IncomingMessage;
      expect(extractHttpUserId(dummyReq7)).toBeUndefined();
    });

    it("includes optional userId in http_rate_limited log record when request includes user identification (ENH-008)", async () => {
      const { HttpRateLimiter } = await import("../http_rate_limiter.js");
      const rlLogger = new NullLogger();
      const handler = createHttpServer({
        roomStore: store,
        relayAddressService: new RelayAddressService({ lanIp: "127.0.0.1", port: 3000 }),
        logger: rlLogger,
        rateLimiter: new HttpRateLimiter({
          maxRequests: 1,
          windowMs: 10_000,
        }),
      });

      const rlServer = http.createServer(handler);
      let rlPort = 0;
      await new Promise<void>((resolve) => {
        rlServer.listen(0, "127.0.0.1", () => {
          rlPort = (rlServer.address() as net.AddressInfo).port;
          resolve();
        });
      });

      try {
        await fetch(`http://127.0.0.1:${rlPort}/api/lan-info`, {
          headers: { "x-user-id": "user-ratelimited-123" },
        });
        const res2 = await fetch(`http://127.0.0.1:${rlPort}/api/lan-info`, {
          headers: { "x-user-id": "user-ratelimited-123" },
        });
        expect(res2.status).toBe(429);

        const rateLimitLog = rlLogger.warnLogs.find(
          (l) => l.context?.["operation"] === "http_rate_limited",
        );
        expect(rateLimitLog).toBeDefined();
        expect(rateLimitLog?.context?.["userId"]).toBe("user-ratelimited-123");
      } finally {
        await new Promise<void>((resolve) => rlServer.close(() => resolve()));
      }
    });

    it("omits userId from http_rate_limited log record when request does not provide user identification (ENH-008)", () => {
      const rlLogger = new NullLogger();
      let capturedStatus = 0;
      let capturedData: unknown;
      const sendJsonResponse = (status: number, data: unknown) => {
        capturedStatus = status;
        capturedData = data;
      };

      const rateLimiter = {
        consume: () => false,
        getLimitDescription: () => "Limit reached",
      } as unknown as import("../http_rate_limiter.js").HttpRateLimiter;

      const blocked = handleRateLimitCheck(
        "127.0.0.1",
        "/api/lan-info",
        "GET",
        "corr-123",
        rateLimiter,
        { roomStore: store, logger: rlLogger },
        rlLogger,
        sendJsonResponse,
        100,
        undefined,
      );

      expect(blocked).toBe(true);
      expect(capturedStatus).toBe(429);
      expect(capturedData).toBeDefined();

      const rateLimitLog = rlLogger.warnLogs.find(
        (l) => l.context?.["operation"] === "http_rate_limited",
      );
      expect(rateLimitLog).toBeDefined();
      expect(rateLimitLog?.context).not.toHaveProperty("userId");
    });
  });

  describe("Deprecated lanService logging (MIN-022)", () => {
    it("logs a deprecation warning if lanService is supplied without relayAddressService", () => {
      const depLogger = new NullLogger();
      const mockLanService = {
        getAddressingInfo: () => ({
          lanIp: "127.0.0.1",
          port: 3000,
          localUrl: "http://localhost:3000",
          joinUrl: "http://127.0.0.1:3000",
          interfaces: ["127.0.0.1"],
          relayMode: "lan" as const,
          isCloudRelay: false,
        }),
      };

      createHttpServer({
        roomStore: store,
        lanService: mockLanService,
        logger: depLogger,
      });

      const warnLog = depLogger.warnLogs.find(
        (l) => l.context?.["operation"] === "http_server_init" && l.message.includes("lanService is deprecated"),
      );
      expect(warnLog).toBeDefined();
    });
  });
});

