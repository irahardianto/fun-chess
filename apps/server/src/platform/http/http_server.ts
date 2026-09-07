import { IncomingMessage, ServerResponse, RequestListener } from "node:http";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { Logger } from "../logger/logger.interface.js";
import { extractClientIp } from "./static_handler.js";
import { IFileStorage } from "./file_storage.js";
import { LanInfoResponse } from "@fun-chess/shared";
import { isOriginAllowed, resolveAllowedOrigins, type ServerEnv } from "../config/index.js";
import { HttpRateLimiter } from "./http_rate_limiter.js";
import {
  HealthController,
  LanInfoController,
  StaticController,
} from "./controllers/index.js";

/**
 * Storage count provider contract for health checks (MAJ-005).
 */
export interface IRoomCountProvider {
  count(): Promise<number>;
}

/**
 * Addressing provider contract for network info and relay status (MAJ-005).
 */
export interface IAddressingInfoProvider {
  getAddressingInfo(port: number): LanInfoResponse;
  isCloudRelay?(): boolean;
}

export interface HttpServerConfig {
  roomStore: IRoomCountProvider;
  relayAddressService?: IAddressingInfoProvider;
  /** @deprecated Use relayAddressService */
  lanService?: IAddressingInfoProvider;
  logger: Logger;
  port?: number;
  distPath?: string;
  allowedOrigins?: string[];
  env?: ServerEnv;
  fileStorage?: IFileStorage;
  getActiveSocketCount?: () => number;
  rateLimiter?: HttpRateLimiter;
}

const START_TIME = Date.now();

// CSP updated to allow Google Fonts (MAJ-001) and Web Workers from blobs (CONF-002)
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=()",
};

// --- Extracted HTTP Helpers (MAJ-038) ---

function applySecurityHeaders(res: ServerResponse, correlationId: string): void {
  for (const [headerKey, headerVal] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(headerKey, headerVal);
  }
  res.setHeader("X-Correlation-ID", correlationId);
}

/**
 * Applies CORS headers to incoming requests.
 * Only emits Access-Control-Allow-Origin when Origin header is present and validated (MAJ-005).
 */
function applyCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: string[],
): { origin: string | undefined; isOriginPermitted: boolean } {
  const origin = req.headers["origin"] as string | undefined;
  let isOriginPermitted = false;

  if (origin) {
    isOriginPermitted = isOriginAllowed(origin, allowedOrigins);
    if (isOriginPermitted) {
      if (allowedOrigins.includes("*")) {
        res.setHeader("Access-Control-Allow-Origin", "*");
      } else {
        // nosemgrep: javascript.express.security.cors-misconfiguration.cors-misconfiguration
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
    }
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Correlation-ID",
  );

  return { origin, isOriginPermitted };
}

function createFallbackHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fun Chess - Server</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #1a1a2e; color: #fff; text-align: center; padding: 50px 20px; }
    .card { max-width: 500px; margin: 0 auto; background: #16213e; padding: 30px; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
    h1 { color: #f39c12; margin-bottom: 10px; }
    p { color: #cbd5e1; line-height: 1.6; }
    .badge { display: inline-block; background: #0f3460; color: #00d2d3; padding: 6px 14px; border-radius: 20px; font-weight: bold; margin: 8px 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>♞ Fun Chess Server</h1>
    <div class="badge">Running on port ${port}</div>
    <p>API endpoints are active:</p>
    <p><a href="/api/lan-info" style="color: #48dbfb;">/api/lan-info</a> &bull; <a href="/health" style="color: #48dbfb;">/health</a> &bull; <a href="/healthz" style="color: #48dbfb;">/healthz</a></p>
    <p style="font-size: 0.9em; opacity: 0.8;">To view the web client, ensure client assets are built in <code>apps/client/dist</code> or run the client dev server.</p>
  </div>
</body>
</html>`;
}

/**
 * Creates the HTTP request listener for Fun Chess API endpoints and static SPA hosting.
 * Validates configuration via caller injection without concrete class defaults (MAJ-005).
 * Logs preflight OPTIONS requests with start, reject, and allow events (MAJ-014).
 * Extracts client IP in entry logs (ENH-008).
 * Provides IP-based rate limiting on native HTTP endpoints (MIN-002).
 * Formats standardized JSON error envelopes (MIN-032).
 * Decomposed into modular route controllers (MIN-029).
 */
export function createHttpServer(config: HttpServerConfig): RequestListener {
  const {
    roomStore,
    logger,
    port = config.env?.PORT ?? 3000,
    distPath = path.resolve(process.cwd(), "../client/dist"),
    fileStorage,
    env = config.env,
    allowedOrigins: configuredAllowedOrigins,
    getActiveSocketCount = () => 0,
    rateLimiter = new HttpRateLimiter({
      maxRequests: config.env?.RATE_LIMIT_MAX_REQUESTS ?? 100,
      windowMs: config.env?.RATE_LIMIT_WINDOW_MS ?? 10_000,
      pruneIntervalMs: 0,
    }),
  } = config;

  const effectiveAllowedOrigins =
    configuredAllowedOrigins ??
    (config.env
      ? resolveAllowedOrigins(config.env)
      : resolveAllowedOrigins({}));

  // Interface contract resolution without concrete class instantiation (MAJ-005)
  const addressService: IAddressingInfoProvider =
    config.relayAddressService ??
    config.lanService ?? {
      getAddressingInfo: (p: number) => ({
        lanIp: config.env?.LAN_IP ?? "127.0.0.1",
        port: p,
        localUrl: `http://localhost:${p}`,
        joinUrl: `http://${config.env?.LAN_IP ?? "127.0.0.1"}:${p}`,
        interfaces: [config.env?.LAN_IP ?? "127.0.0.1"],
        relayMode: "lan",
        isCloudRelay: false,
      }),
      isCloudRelay: () => false,
    };

  const fallbackHtml = createFallbackHtml(port);
  const isProduction = env?.NODE_ENV === "production";

  // Modular Route Controllers (MIN-029)
  const healthController = new HealthController({
    roomStore,
    addressService,
    port,
    getActiveSocketCount,
    isProduction,
    startTime: START_TIME,
  });

  const lanInfoController = new LanInfoController({
    addressService,
  });

  const staticController = new StaticController({
    distPath,
    fallbackHtml,
    fileStorage,
    trustProxy: env?.TRUST_PROXY,
  });

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const correlationId =
      (req.headers["x-correlation-id"] as string) || randomUUID();
    const startTime = performance.now();
    const method = req.method?.toUpperCase() || "GET";
    const url = req.url || "/";
    const [pathname = ""] = url.split("?");
    const clientIp = extractClientIp(req, env?.TRUST_PROXY);

    // 1. Security Headers (SEC-02, MAJ-001)
    applySecurityHeaders(res, correlationId);

    // 2. CORS Handling (MAJ-005)
    const { origin, isOriginPermitted } = applyCorsHeaders(
      req,
      res,
      effectiveAllowedOrigins,
    );

    // 3. Preflight OPTIONS Request Logging & Dispatch (MAJ-014)
    if (method === "OPTIONS") {
      logger.info("HTTP OPTIONS preflight started", {
        operation: "http_options_preflight",
        correlationId,
        clientIp,
        origin,
        path: pathname,
      });

      if (origin && !isOriginPermitted && !effectiveAllowedOrigins.includes("*")) {
        const duration = Math.round(performance.now() - startTime);
        logger.warn("HTTP OPTIONS preflight rejected", {
          operation: "http_options_preflight",
          correlationId,
          clientIp,
          duration,
          durationMs: duration,
          origin,
          path: pathname,
          status: "rejected",
        });

        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("CORS origin not allowed");
        return;
      }

      const duration = Math.round(performance.now() - startTime);
      logger.info("HTTP OPTIONS preflight allowed", {
        operation: "http_options_preflight",
        correlationId,
        clientIp,
        duration,
        durationMs: duration,
        origin,
        path: pathname,
        status: "success",
      });

      res.writeHead(204);
      res.end();
      return;
    }

    // 4. Request Entry Logging with Client IP (ENH-008)
    logger.info(`HTTP Request: ${method} ${pathname}`, {
      operation: "http_request",
      correlationId,
      clientIp,
      method,
      path: pathname,
      userAgent: req.headers["user-agent"],
    });

    const sendJsonResponse = (statusCode: number, data: unknown) => {
      const body = JSON.stringify(data);
      res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      });
      if (method === "HEAD") {
        res.end();
      } else {
        res.end(body);
      }

      const duration = Math.round(performance.now() - startTime);
      logger.info(`HTTP Response: ${method} ${pathname} [${statusCode}]`, {
        operation: "http_response",
        correlationId,
        clientIp,
        method,
        path: pathname,
        statusCode,
        duration,
        durationMs: duration,
      });
    };

    const sendTextResponse = (statusCode: number, text: string) => {
      res.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": Buffer.byteLength(text),
      });
      if (method === "HEAD") {
        res.end();
      } else {
        res.end(text);
      }

      const duration = Math.round(performance.now() - startTime);
      logger.info(`HTTP Response: ${method} ${pathname} [${statusCode}]`, {
        operation: "http_response",
        correlationId,
        clientIp,
        method,
        path: pathname,
        statusCode,
        duration,
        durationMs: duration,
      });
    };

    try {
      // 5. GET / HEAD /healthz - Container Liveness & Readiness Probe
      if ((method === "GET" || method === "HEAD") && pathname === "/healthz") {
        sendTextResponse(200, healthController.getLiveness());
        return;
      }

      // 6. Rate Limiting Check on non-healthz native endpoints (MIN-002)
      if (rateLimiter && !rateLimiter.consume(clientIp)) {
        logger.warn("HTTP rate limit exceeded", {
          operation: "http_rate_limited",
          correlationId,
          clientIp,
          path: pathname,
          method,
        });

        sendJsonResponse(429, {
          status: "error",
          error: {
            code: "ERR_RATE_LIMITED",
            message: "Rate limit exceeded. Please wait before retrying.",
          },
          correlationId,
        });
        return;
      }

      // 7. GET / HEAD /health & /api/health - Operational Telemetry Health Check
      if (
        (method === "GET" || method === "HEAD") &&
        (pathname === "/health" || pathname === "/api/health")
      ) {
        const health = await healthController.getHealth();
        sendJsonResponse(200, health);
        return;
      }

      // 8. GET / HEAD /api/lan-info - Host Addressing & QR Discovery
      if ((method === "GET" || method === "HEAD") && pathname === "/api/lan-info") {
        const requestPort = port || req.socket?.localPort || 3000;
        const lanInfo = lanInfoController.getLanInfo(requestPort);
        sendJsonResponse(200, lanInfo);
        return;
      }

      // 9. Static Assets / SPA Fallback (non-API routes)
      if ((method === "GET" || method === "HEAD") && !pathname.startsWith("/api/")) {
        const served = await staticController.serve(req, res, logger, correlationId);

        if (served) {
          const duration = Math.round(performance.now() - startTime);
          logger.info(`HTTP Static served: ${pathname}`, {
            operation: "http_static",
            correlationId,
            clientIp,
            path: pathname,
            duration,
            durationMs: duration,
          });
          return;
        }
      }

      // 10. Unhandled 404 with standardized error envelope (MIN-032)
      sendJsonResponse(404, {
        status: "error",
        error: {
          code: "ERR_NOT_FOUND",
          message: `Cannot ${method} ${pathname}`,
        },
        correlationId,
      });
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      const errorObj =
        err instanceof Error
          ? { message: err.message, stack: err.stack }
          : { raw: err };

      logger.error(`HTTP Request Error: ${method} ${pathname}`, {
        operation: "http_error",
        correlationId,
        clientIp,
        method,
        path: pathname,
        duration,
        durationMs: duration,
        error: errorObj,
      });

      if (!res.headersSent) {
        sendJsonResponse(500, {
          status: "error",
          error: {
            code: "ERR_INTERNAL_SERVER",
            message: "Internal server error",
            correlationId,
          },
          correlationId,
        });
      }
    }
  };
}
