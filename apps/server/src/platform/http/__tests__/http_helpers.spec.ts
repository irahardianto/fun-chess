import { describe, it, expect, vi } from "vitest";
import { ServerResponse, IncomingMessage } from "node:http";
import {
  buildContentSecurityPolicy,
  applySecurityHeaders,
  applyCorsHeaders,
  resolveDistPath,
  handleRateLimitCheck,
  handleNotFoundRoute,
  extractHttpUserId,
  sanitizeCorrelationId,
  isProbingPath,
} from "../http_helpers.js";
import { HttpRateLimiter } from "../http_rate_limiter.js";
import { NullLogger } from "../../logger/null_logger.js";
import { IFileStorage } from "../file_storage.js";

describe("http_helpers", () => {
  describe("buildContentSecurityPolicy (MAJ-003, ENH-002)", () => {
    it("eliminates wildcard ws: and wss: schemes and defaults connect-src to 'self'", () => {
      const csp = buildContentSecurityPolicy();
      expect(csp).toContain("connect-src 'self'");
      expect(csp).not.toContain("ws:");
      expect(csp).not.toContain("wss:");
    });

    it("includes explicitly configured allowed origins and derives ws/wss counterparts", () => {
      const csp = buildContentSecurityPolicy({
        allowedOrigins: ["http://localhost:5173", "https://play.fun-chess.com"],
      });
      expect(csp).toContain("http://localhost:5173");
      expect(csp).toContain("ws://localhost:5173");
      expect(csp).toContain("https://play.fun-chess.com");
      expect(csp).toContain("wss://play.fun-chess.com");
    });

    it("appends report-uri and report-to directives when cspReportUri is provided (ENH-002)", () => {
      const csp = buildContentSecurityPolicy({
        cspReportUri: "https://reporting.fun-chess.com/csp-reports",
      });
      expect(csp).toContain("report-uri https://reporting.fun-chess.com/csp-reports");
      expect(csp).toContain("report-to csp-endpoint");
    });
  });

  describe("applySecurityHeaders (SEC-02, ENH-001, MAJ-003)", () => {
    it("applies strict transport security when socket is encrypted", () => {
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
      } as unknown as ServerResponse;

      const req = {
        socket: { encrypted: true },
        headers: {},
      } as unknown as IncomingMessage;

      applySecurityHeaders(res, "test-correlation-id-12345", req, false);

      expect(headers["Strict-Transport-Security"]).toBe(
        "max-age=31536000; includeSubDomains; preload",
      );
      expect(headers["x-correlation-id"]).toBe("test-correlation-id-12345");
      expect(headers["Content-Security-Policy"]).toBeDefined();
    });

    it("handles multi-valued x-forwarded-proto under trustProxy (ENH-001)", () => {
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
      } as unknown as ServerResponse;

      const req = {
        socket: { encrypted: false },
        headers: { "x-forwarded-proto": "https, http" },
      } as unknown as IncomingMessage;

      applySecurityHeaders(res, "test-correlation-id-12345", req, true);

      expect(headers["Strict-Transport-Security"]).toBeDefined();
    });

    it("omits strict transport security when forwarded proto is not https", () => {
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
      } as unknown as ServerResponse;

      const req = {
        socket: { encrypted: false },
        headers: { "x-forwarded-proto": "http" },
      } as unknown as IncomingMessage;

      applySecurityHeaders(res, "test-correlation-id-12345", req, true);

      expect(headers["Strict-Transport-Security"]).toBeUndefined();
    });
  });

  describe("applyCorsHeaders (MIN-022)", () => {
    it("includes X-User-ID and X-Player-ID in Access-Control-Allow-Headers", () => {
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
      } as unknown as ServerResponse;

      const req = {
        headers: { origin: "http://localhost:5173" },
      } as unknown as IncomingMessage;

      applyCorsHeaders(req, res, ["http://localhost:5173"]);

      expect(headers["Access-Control-Allow-Headers"]).toContain("X-User-ID");
      expect(headers["Access-Control-Allow-Headers"]).toContain("X-Player-ID");
      expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    });
  });

  describe("resolveDistPath (ENH-005)", () => {
    it("probes candidate directories using fileStorage without raw fs probes", () => {
      const mockStorage: IFileStorage = {
        existsSync: (p: string) => p.includes("apps/client/dist"),
        createReadStream: () => vi.fn() as any,
        stat: async () => ({} as any),
        statSync: () => ({} as any),
      };

      const resolved = resolveDistPath(
        { roomStore: { count: async () => 0 }, logger: new NullLogger() },
        new NullLogger(),
        mockStorage,
      );

      expect(resolved).toContain("apps/client/dist");
    });
  });

  describe("handleRateLimitCheck (CRIT-003)", () => {
    it("exempts /healthz and /ready from rate limiting", () => {
      const limiter = new HttpRateLimiter({ maxRequests: 0, windowMs: 10_000 });
      const sendJson = vi.fn();

      const healthzExempt = handleRateLimitCheck(
        "127.0.0.1",
        "/healthz",
        "GET",
        "corr-1",
        limiter,
        { roomStore: { count: async () => 0 }, logger: new NullLogger() },
        new NullLogger(),
        sendJson,
      );
      expect(healthzExempt).toBe(false);

      const readyExempt = handleRateLimitCheck(
        "127.0.0.1",
        "/ready",
        "GET",
        "corr-2",
        limiter,
        { roomStore: { count: async () => 0 }, logger: new NullLogger() },
        new NullLogger(),
        sendJson,
      );
      expect(readyExempt).toBe(false);
      expect(sendJson).not.toHaveBeenCalled();
    });
  });

  describe("handleNotFoundRoute (CRIT-003, MIN-003)", () => {
    it("consumes from primary rate limiter on non-existent routes", () => {
      const limiter = new HttpRateLimiter({ maxRequests: 1, windowMs: 10_000 });
      let status = 0;
      let body: any = null;
      const sendJson = (s: number, data: any) => {
        status = s;
        body = data;
      };

      // 1st request consumed
      handleNotFoundRoute(
        "10.0.0.1",
        "/nonexistent-1",
        "GET",
        "corr-1",
        sendJson,
        undefined,
        new NullLogger(),
        undefined,
        undefined,
        limiter,
      );
      expect(status).toBe(404);

      // 2nd request throttled by primary rate limiter
      handleNotFoundRoute(
        "10.0.0.1",
        "/nonexistent-2",
        "GET",
        "corr-2",
        sendJson,
        undefined,
        new NullLogger(),
        undefined,
        undefined,
        limiter,
      );
      expect(status).toBe(429);
      expect(body.error.code).toBe("ERR_RATE_LIMITED");
    });

    it("throttles when notFoundRateLimiter budget is exhausted", () => {
      const notFoundLimiter = new HttpRateLimiter({ maxRequests: 1, windowMs: 10_000 });
      let status = 0;
      let body: any = null;
      const sendJson = (s: number, data: any) => {
        status = s;
        body = data;
      };

      handleNotFoundRoute(
        "10.0.0.2",
        "/missing-a",
        "GET",
        "corr-1",
        sendJson,
        notFoundLimiter,
        new NullLogger(),
      );
      expect(status).toBe(404);

      handleNotFoundRoute(
        "10.0.0.2",
        "/missing-b",
        "GET",
        "corr-2",
        sendJson,
        notFoundLimiter,
        new NullLogger(),
      );
      expect(status).toBe(429);
      expect(body.error.code).toBe("ERR_RATE_LIMITED");
    });
  });

  describe("extractHttpUserId (ENH-008, CRIT-002)", () => {
    it("extracts from x-user-id header", () => {
      const req = {
        headers: { "x-user-id": "user-42" },
      } as unknown as IncomingMessage;
      expect(extractHttpUserId(req)).toBe("user-42");
    });

    it("extracts from x-player-id header", () => {
      const req = {
        headers: { "x-player-id": "player-99" },
      } as unknown as IncomingMessage;
      expect(extractHttpUserId(req)).toBe("player-99");
    });

    it("extracts from query parameter", () => {
      const req = {
        headers: {},
      } as unknown as IncomingMessage;
      expect(extractHttpUserId(req, "/lobby?playerId=query-user-1")).toBe("query-user-1");
    });
  });

  describe("sanitizeCorrelationId & isProbingPath", () => {
    it("validates correlation id format and generates fallback on invalid", () => {
      expect(sanitizeCorrelationId("valid-correlation-id-12345")).toBe(
        "valid-correlation-id-12345",
      );
      const generated = sanitizeCorrelationId("bad!id");
      expect(generated).toHaveLength(36); // standard UUID length
    });

    it("identifies malicious vulnerability scanning paths", () => {
      expect(isProbingPath("/.env")).toBe(true);
      expect(isProbingPath("/wp-admin")).toBe(true);
      expect(isProbingPath("/dump.sql")).toBe(true);
      expect(isProbingPath("/lobby")).toBe(false);
    });
  });
});
