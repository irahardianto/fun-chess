import { describe, it, expect, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";
import { HttpRouter } from "../http_router.js";
import { HealthController } from "../controllers/health.controller.js";
import { LanInfoController } from "../controllers/lan_info.controller.js";
import { StaticController } from "../controllers/static.controller.js";
import { HttpRateLimiter } from "../http_rate_limiter.js";
import { HttpMetricsCollector } from "../http_metrics.js";
import { NullLogger } from "../../logger/null_logger.js";
import { IFileStorage } from "../file_storage.js";

describe("HttpRouter (MIN-035, MAJ-020, MAJ-014, MIN-012)", () => {
  const mockFileStorage: IFileStorage = {
    existsSync: () => false,
    createReadStream: () => vi.fn() as any,
    stat: async () => ({} as any),
    statSync: () => ({} as any),
  };

  const createTestRouter = (options?: {
    metricsCollector?: HttpMetricsCollector;
    rateLimiter?: HttpRateLimiter;
    notFoundRateLimiter?: HttpRateLimiter;
  }) => {
    const logger = new NullLogger();
    const metricsCollector = options?.metricsCollector ?? new HttpMetricsCollector();

    const healthController = new HealthController({
      roomStore: { count: async () => 2 },
      addressService: {
        getAddressingInfo: (port) => ({
          lanIp: "127.0.0.1",
          port,
          localUrl: `http://localhost:${port}`,
          joinUrl: `http://127.0.0.1:${port}`,
          interfaces: ["127.0.0.1"],
          relayMode: "lan",
          isCloudRelay: false,
        }),
      },
      port: 3000,
      getActiveSocketCount: () => 4,
      metricsCollector,
    });

    const lanInfoController = new LanInfoController({
      addressService: {
        getAddressingInfo: (port) => ({
          lanIp: "127.0.0.1",
          port,
          localUrl: `http://localhost:${port}`,
          joinUrl: `http://127.0.0.1:${port}`,
          interfaces: ["127.0.0.1"],
          relayMode: "lan",
          isCloudRelay: false,
        }),
      },
    });

    const staticController = new StaticController({
      distPath: "/app/dist",
      fallbackHtml: "<html>Fallback</html>",
      fileStorage: mockFileStorage,
    });

    const router = new HttpRouter({
      config: {
        roomStore: { count: async () => 2 },
        logger,
        env: {
          NODE_ENV: "development",
          PORT: 3000,
          HOST: "0.0.0.0",
          LOG_LEVEL: "info",
          CORS_ORIGIN: "http://localhost:5173",
        },
      },
      logger,
      port: 3000,
      effectiveAllowedOrigins: ["http://localhost:5173"],
      trustProxy: false,
      isProduction: false,
      healthController,
      lanInfoController,
      staticController,
      rateLimiter: options?.rateLimiter,
      notFoundRateLimiter: options?.notFoundRateLimiter,
      metricsCollector,
    });

    return { router, metricsCollector };
  };

  const createMockReqRes = (url: string, method = "GET", headers: Record<string, string> = {}) => {
    const req = {
      url,
      method,
      headers: {
        host: "localhost:3000",
        ...headers,
      },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    let statusCode = 200;
    const responseHeaders: Record<string, string> = {};
    let responseBody = "";

    const res = {
      writeHead: (code: number, hdrs?: Record<string, string>) => {
        statusCode = code;
        if (hdrs) {
          Object.assign(responseHeaders, hdrs);
        }
      },
      setHeader: (k: string, v: string) => {
        responseHeaders[k] = v;
      },
      end: (chunk?: string) => {
        if (chunk) {
          responseBody += chunk;
        }
      },
      get statusCode() {
        return statusCode;
      },
      headersSent: false,
      writableEnded: false,
      destroy: vi.fn(),
    } as unknown as ServerResponse;

    return {
      req,
      res,
      getStatusCode: () => statusCode,
      getHeaders: () => responseHeaders,
      getBody: () => responseBody,
    };
  };

  it("dispatches GET /healthz and records metrics", async () => {
    const metricsCollector = new HttpMetricsCollector();
    const { router } = createTestRouter({ metricsCollector });
    const { req, res, getStatusCode, getBody } = createMockReqRes("/healthz");

    await router.handleRequest(req, res);

    expect(getStatusCode()).toBe(200);
    expect(getBody()).toBe("OK");
    expect(metricsCollector.totalRequests).toBe(1);
    const prom = metricsCollector.toPrometheusFormat({ activeRooms: 0, activeSockets: 0 });
    expect(prom).toContain('http_requests_total{method="GET",path="/healthz",status="200"} 1');
  });

  it("dispatches GET /ready and reflects readiness status (MAJ-013)", async () => {
    const { router } = createTestRouter();
    const { req, res, getStatusCode, getBody } = createMockReqRes("/ready");

    await router.handleRequest(req, res);

    expect(getStatusCode()).toBe(200);
    const body = JSON.parse(getBody());
    expect(body.ready).toBe(true);
    expect(body.status).toBe("ready");
  });

  it("degrades GET /ready to 503 Service Unavailable when shutdown coordinator is shutting down (BLK-01)", async () => {
    const { router } = createTestRouter();
    router.setShutdownCoordinator({ isShuttingDown: true });

    const { req, res, getStatusCode, getBody } = createMockReqRes("/ready");
    await router.handleRequest(req, res);

    expect(getStatusCode()).toBe(503);
    const body = JSON.parse(getBody());
    expect(body.ready).toBe(false);
    expect(body.status).toBe("terminating");
  });

  it("dispatches GET /api/v1/health with uniform versioned payload envelope (MIN-023)", async () => {
    const { router } = createTestRouter();
    const { req, res, getStatusCode, getBody } = createMockReqRes("/api/v1/health");

    await router.handleRequest(req, res);

    expect(getStatusCode()).toBe(200);
    const body = JSON.parse(getBody());
    expect(body.data).toBeDefined();
    expect(body.data.status).toBe("ok");
    expect(body.data.version).toBe("1.0.0");
  });

  it("handles OPTIONS preflight for allowed origin", async () => {
    const { router } = createTestRouter();
    const { req, res, getStatusCode, getHeaders } = createMockReqRes(
      "/api/v1/lan-info",
      "OPTIONS",
      { origin: "http://localhost:5173" },
    );

    await router.handleRequest(req, res);

    expect(getStatusCode()).toBe(204);
    expect(getHeaders()["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
  });

  it("enforces rate limiting and responds with 429", async () => {
    const rateLimiter = new HttpRateLimiter({ maxRequests: 1, windowMs: 10_000 });
    const { router } = createTestRouter({ rateLimiter });

    // Request 1 passes
    const req1 = createMockReqRes("/api/v1/lan-info");
    await router.handleRequest(req1.req, req1.res);
    expect(req1.getStatusCode()).toBe(200);

    // Request 2 blocked by rate limiter
    const req2 = createMockReqRes("/api/v1/lan-info");
    await router.handleRequest(req2.req, req2.res);
    expect(req2.getStatusCode()).toBe(429);
    const errBody = JSON.parse(req2.getBody());
    expect(errBody.error.code).toBe("ERR_RATE_LIMITED");
  });

  it("handles 404 route with JSON error envelope and tracks not found metrics", async () => {
    const metricsCollector = new HttpMetricsCollector();
    const { router } = createTestRouter({ metricsCollector });
    const { req, res, getStatusCode, getBody } = createMockReqRes("/api/v1/nonexistent");

    await router.handleRequest(req, res);

    expect(getStatusCode()).toBe(404);
    const body = JSON.parse(getBody());
    expect(body.status).toBe("error");
    expect(body.error.code).toBe("ERR_NOT_FOUND");
    const prom = metricsCollector.toPrometheusFormat({ activeRooms: 0, activeSockets: 0 });
    expect(prom).toContain('status="404"');
  });

  it("throttles brute-force static asset 404 scans with HTTP 429 when notFoundRateLimiter threshold is exceeded (WRN-01)", async () => {
    const notFoundRateLimiter = new HttpRateLimiter({ maxRequests: 2, windowMs: 10_000 });
    const { router } = createTestRouter({ notFoundRateLimiter });

    // Request 1: 404 (miss 1)
    const req1 = createMockReqRes("/assets/missing1.js");
    await router.handleRequest(req1.req, req1.res);
    expect(req1.getStatusCode()).toBe(404);

    // Request 2: 404 (miss 2 - quota exhausted)
    const req2 = createMockReqRes("/assets/missing2.js");
    await router.handleRequest(req2.req, req2.res);
    expect(req2.getStatusCode()).toBe(404);

    // Request 3: 429 Too Many Requests
    const req3 = createMockReqRes("/assets/missing3.js");
    await router.handleRequest(req3.req, req3.res);
    expect(req3.getStatusCode()).toBe(429);
    const body3 = JSON.parse(req3.getBody());
    expect(body3.status).toBe("error");
    expect(body3.error.code).toBe("ERR_RATE_LIMITED");
  });
});
