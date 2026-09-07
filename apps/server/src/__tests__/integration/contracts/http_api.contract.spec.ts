import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer, TestServerInstance } from "../helpers/test_server.js";
import { fetchLanInfo, fetchHealth } from "../helpers/http_client_helper.js";
import { LanInfoResponse, HealthCheckResponse } from "@fun-chess/shared";
import { HttpRateLimiter } from "../../../platform/http/http_rate_limiter.js";

describe("HTTP API Contracts", () => {
  let serverInstance: TestServerInstance;

  beforeAll(async () => {
    serverInstance = await createTestServer();
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  describe("GET /api/lan-info", () => {
    it("should return 200 OK with valid LanInfoResponse schema when requested", async () => {
      // Arrange & Act
      const { status, data } = await fetchLanInfo(serverInstance.url);

      // Assert
      expect(status).toBe(200);
      expect(data).toBeDefined();

      // Contract assertions for LanInfoResponse
      expect(typeof data.lanIp).toBe("string");
      expect(data.lanIp.length).toBeGreaterThan(0);
      expect(typeof data.port).toBe("number");
      expect(data.port).toBe(serverInstance.port);
      expect(data.localUrl).toBe(`http://localhost:${serverInstance.port}`);
      expect(data.joinUrl).toBe(`http://${data.lanIp}:${serverInstance.port}`);
      expect(Array.isArray(data.interfaces)).toBe(true);
    });

    it("should include valid URL formats for localUrl and joinUrl when returned", async () => {
      // Arrange & Act
      const { data } = await fetchLanInfo(serverInstance.url);

      // Assert
      expect(() => new URL(data.localUrl)).not.toThrow();
      expect(() => new URL(data.joinUrl)).not.toThrow();
    });
  });

  describe("GET /health", () => {
    it("should return 200 OK with valid HealthCheckResponse schema at root /health", async () => {
      // Arrange & Act
      const res = await fetch(`${serverInstance.url}/health`);
      const data = (await res.json()) as HealthCheckResponse;

      // Assert
      expect(res.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.activeRooms).toBe(0);
      expect(data.activeSockets).toBe(0);
      expect(data.relay).toBeDefined();
    });

    it("should return 200 OK with valid HealthCheckResponse via fetchHealth helper", async () => {
      const { status, data } = await fetchHealth(serverInstance.url);
      expect(status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe("GET /healthz", () => {
    it('should return 200 OK with text/plain "OK" for container liveness/readiness probe', async () => {
      // Arrange & Act
      const res = await fetch(`${serverInstance.url}/healthz`);
      const body = await res.text();

      // Assert
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      expect(body).toBe("OK");
    });
  });

  describe("Security Headers (SEC-02)", () => {
    it("should return standard security headers on all HTTP endpoints", async () => {
      const res = await fetch(`${serverInstance.url}/healthz`);
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe(
        "strict-origin-when-cross-origin",
      );
    });
  });

  describe("HTTP HEAD Method Support (NET-02)", () => {
    it("should respond to HEAD /healthz with 200 OK, headers, and empty body", async () => {
      const res = await fetch(`${serverInstance.url}/healthz`, {
        method: "HEAD",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      expect(res.headers.get("content-length")).toBeDefined();
      const body = await res.text();
      expect(body).toBe("");
    });

    it("should respond to HEAD /api/lan-info with 200 OK, headers, and empty body", async () => {
      const res = await fetch(`${serverInstance.url}/api/lan-info`, {
        method: "HEAD",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(res.headers.get("content-length")).toBeDefined();
      const body = await res.text();
      expect(body).toBe("");
    });

    it("should respond to HEAD /health with 200 OK, headers, and empty body", async () => {
      const res = await fetch(`${serverInstance.url}/health`, {
        method: "HEAD",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.text();
      expect(body).toBe("");
    });
  });

  describe("OPTIONS Preflight & Standardized 404 Routing (MIN-032)", () => {
    it("should handle OPTIONS preflight request with 204 No Content", async () => {
      const res = await fetch(`${serverInstance.url}/api/lan-info`, {
        method: "OPTIONS",
      });
      expect(res.status).toBe(204);
    });

    it("should return 404 for unknown API endpoints with standardized error envelope (MIN-032)", async () => {
      const res = await fetch(`${serverInstance.url}/api/nonexistent-route`);
      expect(res.status).toBe(404);
      const data = (await res.json()) as {
        status: string;
        error: { code: string; message: string };
        correlationId: string;
      };
      expect(data.status).toBe("error");
      expect(data.error?.code).toBe("ERR_NOT_FOUND");
      expect(data.error?.message).toContain("Cannot GET /api/nonexistent-route");
      expect(data.correlationId).toBeDefined();
      expect(typeof data.correlationId).toBe("string");
      expect(res.headers.get("x-correlation-id")).toBe(data.correlationId);
    });
  });

  describe("GET /health Redaction in Production Mode (MIN-001)", () => {
    let prodServerInstance: TestServerInstance;

    beforeAll(async () => {
      prodServerInstance = await createTestServer({
        env: {
          NODE_ENV: "production",
          CORS_ORIGIN: "https://fun-chess.example.com",
        },
        allowedOrigins: ["https://fun-chess.example.com"],
      });
    });

    afterAll(async () => {
      await prodServerInstance.close();
    });

    it("should redact memoryUsageMb to zeros when NODE_ENV === 'production'", async () => {
      const res = await fetch(`${prodServerInstance.url}/health`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as HealthCheckResponse;

      expect(data.status).toBe("ok");
      expect(data.memoryUsageMb).toEqual({
        rss: 0,
        heapTotal: 0,
        heapUsed: 0,
      });
    });

    it("should also redact memoryUsageMb at /api/health when in production mode", async () => {
      const res = await fetch(`${prodServerInstance.url}/api/health`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as HealthCheckResponse;

      expect(data.status).toBe("ok");
      expect(data.memoryUsageMb).toEqual({
        rss: 0,
        heapTotal: 0,
        heapUsed: 0,
      });
    });
  });

  describe("OPTIONS Preflight Logging & Response (MAJ-014)", () => {
    let corsServerInstance: TestServerInstance;

    beforeAll(async () => {
      corsServerInstance = await createTestServer({
        allowedOrigins: ["https://fun-chess.example.com"],
      });
    });

    afterAll(async () => {
      await corsServerInstance.close();
    });

    it("should allow permitted origin and log preflight success", async () => {
      corsServerInstance.logger.clear();

      const res = await fetch(`${corsServerInstance.url}/api/lan-info`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://fun-chess.example.com",
          "Access-Control-Request-Method": "GET",
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe(
        "https://fun-chess.example.com",
      );

      const preflightLog = corsServerInstance.logger.infoLogs.find(
        (l) =>
          l.context?.operation === "http_options_preflight" &&
          l.context?.status === "success",
      );
      expect(preflightLog).toBeDefined();
      expect(preflightLog?.context?.origin).toBe("https://fun-chess.example.com");
      expect(preflightLog?.context?.clientIp).toBeDefined();
      expect(preflightLog?.context?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should reject unpermitted origin with 403 and log preflight rejection", async () => {
      corsServerInstance.logger.clear();

      const res = await fetch(`${corsServerInstance.url}/api/lan-info`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://unauthorized-domain.com",
          "Access-Control-Request-Method": "GET",
        },
      });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("CORS origin not allowed");

      const rejectLog = corsServerInstance.logger.warnLogs.find(
        (l) =>
          l.context?.operation === "http_options_preflight" &&
          l.context?.status === "rejected",
      );
      expect(rejectLog).toBeDefined();
      expect(rejectLog?.context?.origin).toBe("https://unauthorized-domain.com");
      expect(rejectLog?.context?.clientIp).toBeDefined();
      expect(rejectLog?.context?.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("HTTP Rate Limiting on API and Static Endpoints (MIN-002)", () => {
    let rateLimitedServerInstance: TestServerInstance;
    let testRateLimiter: HttpRateLimiter;

    beforeAll(async () => {
      testRateLimiter = new HttpRateLimiter({
        maxRequests: 3,
        windowMs: 60_000,
        pruneIntervalMs: 0,
      });
      rateLimitedServerInstance = await createTestServer({
        rateLimiter: testRateLimiter,
      });
    });

    afterAll(async () => {
      await rateLimitedServerInstance.close();
    });

    it("should allow requests up to the configured limit", async () => {
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${rateLimitedServerInstance.url}/api/lan-info`);
        expect(res.status).toBe(200);
      }
    });

    it("should return 429 with standardized error envelope once limit is exceeded", async () => {
      const res = await fetch(`${rateLimitedServerInstance.url}/api/lan-info`);
      expect(res.status).toBe(429);
      expect(res.headers.get("content-type")).toContain("application/json");

      const body = (await res.json()) as {
        status: string;
        error: { code: string; message: string };
        correlationId: string;
      };

      expect(body.status).toBe("error");
      expect(body.error.code).toBe("ERR_RATE_LIMITED");
      expect(body.error.message).toContain("Rate limit exceeded");
      expect(body.correlationId).toBeDefined();

      const rateLimitLog = rateLimitedServerInstance.logger.warnLogs.find(
        (l) => l.context?.operation === "http_rate_limited",
      );
      expect(rateLimitLog).toBeDefined();
      expect(rateLimitLog?.context?.clientIp).toBeDefined();
    });

    it("should also block static/SPA requests when rate limit is active", async () => {
      const res = await fetch(`${rateLimitedServerInstance.url}/some-page`);
      expect(res.status).toBe(429);
      const body = (await res.json()) as {
        status: string;
        error: { code: string };
      };
      expect(body.error.code).toBe("ERR_RATE_LIMITED");
    });

    it("should allow container probe /healthz even when rate limited", async () => {
      const res = await fetch(`${rateLimitedServerInstance.url}/healthz`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe("OK");
    });
  });
});
