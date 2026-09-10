import { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Logger } from "../logger/logger.interface.js";
import { AppError, serializeError } from "@fun-chess/shared";
import { isOriginAllowed } from "../config/index.js";
import { HttpRateLimiter } from "./http_rate_limiter.js";
import {
  HealthController,
  LanInfoController,
  StaticController,
  isTelemetryAuthorized,
} from "./controllers/index.js";
import {
  HttpServerConfig,
  HttpErrorEnvelope,
} from "./http.interface.js";
import { IFileStorage, NodeFileStorage } from "./file_storage.js";
import type { HttpMetricsCollector } from "./http_metrics.js";

export const CORRELATION_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * Validates and sanitizes the x-correlation-id HTTP header against an allowlist pattern (MAJ-001).
 * Falls back to crypto randomUUID() if missing, invalid, or failing regex check.
 */
export function sanitizeCorrelationId(headerValue?: string | string[]): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof candidate === "string" && CORRELATION_ID_REGEX.test(candidate.trim())) {
    return candidate.trim();
  }
  return randomUUID();
}

export interface SecurityHeadersOptions {
  allowedOrigins?: string[];
  clientUrl?: string;
  publicUrl?: string;
  cspReportUri?: string;
}

/**
 * Constructs a strict Content Security Policy eliminating wildcard ws: and wss: (MAJ-003, ENH-002).
 * Restricts connect-src to 'self' and explicitly configured allowed origins.
 */
export function buildContentSecurityPolicy(options?: SecurityHeadersOptions): string {
  const connectSrcs = new Set<string>(["'self'"]);

  if (options?.allowedOrigins) {
    for (const origin of options.allowedOrigins) {
      if (origin && origin !== "*") {
        connectSrcs.add(origin);
        if (origin.startsWith("http://")) {
          // nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket
          connectSrcs.add(origin.replace(/^http:\/\//, "ws://"));
        } else if (origin.startsWith("https://")) {
          connectSrcs.add(origin.replace(/^https:\/\//, "wss://"));
        }
      }
    }
  }

  if (options?.clientUrl) {
    try {
      const parsed = new URL(options.clientUrl);
      connectSrcs.add(parsed.origin);
      if (parsed.protocol === "https:") {
        connectSrcs.add(`wss://${parsed.host}`);
      } else if (parsed.protocol === "http:") {
        // nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket
        connectSrcs.add(`ws://${parsed.host}`);
      }
    } catch (err: unknown) {
      void err; // Ignored if invalid
    }
  }

  if (options?.publicUrl) {
    try {
      const parsed = new URL(options.publicUrl);
      connectSrcs.add(parsed.origin);
      if (parsed.protocol === "https:") {
        connectSrcs.add(`wss://${parsed.host}`);
      } else if (parsed.protocol === "http:") {
        // nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket
        connectSrcs.add(`ws://${parsed.host}`);
      }
    } catch (err: unknown) {
      void err; // Ignored if invalid
    }
  }

  const connectSrcDirective = Array.from(connectSrcs).join(" ");
  let csp = [
    "default-src 'self'",
    "script-src 'self'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src ${connectSrcDirective}`,
    "font-src 'self' https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  if (options?.cspReportUri) {
    csp += `; report-uri ${options.cspReportUri}; report-to csp-endpoint`;
  }

  return csp;
}

/**
 * Security headers for native HTTP responses (SEC-02, MAJ-001, MIN-005).
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(self), microphone=(), geolocation=(), payment=()",
};

export function formatHttpError(
  statusCode: number,
  errorCode: string,
  message: string,
  correlationId?: string,
  details?: Record<string, unknown>,
): HttpErrorEnvelope {
  return {
    status: "error",
    code: statusCode,
    error: {
      code: errorCode,
      message,
      ...(details ? { details } : {}),
      ...(correlationId ? { correlationId } : {}),
    },
  };
}

export function formatHttpErrorFromException(
  err: unknown,
  correlationId?: string,
): { statusCode: number; payload: HttpErrorEnvelope } {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      payload: formatHttpError(
        err.statusCode,
        err.code,
        err.message,
        correlationId,
        err.details,
      ),
    };
  }

  const message = "Internal server error";
  return {
    statusCode: 500,
    payload: formatHttpError(
      500,
      "ERR_INTERNAL_SERVER_ERROR",
      message,
      correlationId,
    ),
  };
}

/**
 * Configures explicit timeout limits on a Node.js HTTP server (Slowloris resistance, ENH-003).
 */
export function configureServerTimeouts<
  T extends { requestTimeout?: number; headersTimeout?: number },
>(server: T): T {
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  return server;
}

/**
 * Resolves the client dist path by checking configuration and candidate locations (CRIT-003, MIN-001, MIN-009, MAJ-014, ENH-005).
 * Uses provided fileStorage without direct fs probes.
 */
export function resolveDistPath(
  config: HttpServerConfig,
  logger?: Logger,
  fileStorage?: IFileStorage,
): string {
  if (config.distPath) {
    return config.distPath;
  }
  if (config.env?.CLIENT_DIST_PATH) {
    return config.env.CLIENT_DIST_PATH;
  }

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "apps/client/dist"),
    path.resolve(process.cwd(), "../client/dist"),
    "/app/apps/client/dist",
    path.resolve(currentDir, "../../../../client/dist"),
  ];

  const log = logger ?? config.logger;
  const storage = fileStorage ?? config.fileStorage ?? new NodeFileStorage();

  if (typeof storage.existsSync === "function") {
    for (const candidate of candidates) {
      try {
        if (storage.existsSync(candidate)) {
          return candidate;
        }
      } catch (err) {
        log?.debug("Failed checking client dist directory candidate via fileStorage", {
          operation: "resolve_client_dist_dir",
          candidate,
          error: serializeError(err),
        });
      }
    }
  }

  return candidates[0] ?? path.resolve(process.cwd(), "apps/client/dist");
}

export function applySecurityHeaders(
  res: ServerResponse,
  correlationId: string,
  req?: IncomingMessage,
  trustProxy = false,
  options?: SecurityHeadersOptions,
): void {
  for (const [headerKey, headerVal] of Object.entries(SECURITY_HEADERS)) {
    if (headerKey === "Strict-Transport-Security") {
      let isHttps = Boolean(
        (req?.socket as { encrypted?: boolean } | undefined)?.encrypted,
      );
      if (!isHttps && trustProxy === true) {
        const protoHeader = req?.headers["x-forwarded-proto"];
        const protoCandidate = Array.isArray(protoHeader)
          ? protoHeader[0]
          : protoHeader;
        if (protoCandidate) {
          const firstProto = protoCandidate.split(",")[0]?.trim().toLowerCase();
          if (firstProto === "https") {
            isHttps = true;
          }
        }
      }
      if (!isHttps) {
        continue;
      }
    }
    res.setHeader(headerKey, headerVal);
  }

  const csp = buildContentSecurityPolicy(options);
  res.setHeader("Content-Security-Policy", csp);

  if (options?.cspReportUri) {
    res.setHeader(
      "Reporting-Endpoints",
      `csp-endpoint="${options.cspReportUri}"`,
    );
  }

  res.setHeader("x-correlation-id", correlationId);
}

/**
 * Applies CORS headers to incoming requests.
 * Restricts wildcard origins by reflecting validated origins with credentials (MIN-004, MAJ-005).
 */
export function applyCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: string[],
): { origin: string | undefined; isOriginPermitted: boolean } {
  const origin = req.headers["origin"] as string | undefined;
  let isOriginPermitted = false;

  if (origin) {
    isOriginPermitted = isOriginAllowed(origin, allowedOrigins);
    if (isOriginPermitted) {
      // nosemgrep: javascript.express.security.cors-misconfiguration.cors-misconfiguration
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Correlation-ID, X-User-ID, X-Player-ID",
  );

  return { origin, isOriginPermitted };
}

export function handleCorsPreflight(
  res: ServerResponse,
  method: string,
  pathname: string,
  correlationId: string,
  clientIp: string,
  startTime: number,
  effectiveAllowedOrigins: string[],
  isOriginPermitted: boolean,
  origin: string | undefined,
  logger: Logger,
): boolean {
  if (method !== "OPTIONS") {
    return false;
  }

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

    const errorBody = JSON.stringify(
      formatHttpError(
        403,
        "ERR_CORS_FORBIDDEN",
        "CORS origin not allowed",
        correlationId,
      ),
    );
    res.writeHead(403, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(errorBody),
    });
    res.end(errorBody);
    return true;
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
  return true;
}

export interface HealthRouteAuthContext {
  clientIp: string;
  headers: Record<string, string | string[] | undefined>;
  correlationId: string;
  metricsSecret?: string;
  isProduction?: boolean;
  directSocketIp?: string;
}

export async function handleHealthRoutes(
  method: string,
  pathname: string,
  healthController: HealthController,
  sendJsonResponse: (
    statusCode: number,
    data: unknown,
    options?: { skipLog?: boolean; operation?: string; route?: string },
  ) => void,
  sendTextResponse: (
    statusCode: number,
    text: string,
    options?: { skipLog?: boolean; operation?: string; route?: string },
  ) => void,
  authContext?: HealthRouteAuthContext,
): Promise<boolean> {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  if (pathname === "/healthz") {
    sendTextResponse(200, "OK", { operation: "health_readiness", route: "health_readiness" });
    return true;
  }

  if (pathname === "/ready") {
    const readiness = healthController.getReadiness();
    const statusCode = readiness.ready ? 200 : 503;
    sendJsonResponse(statusCode, readiness, {
      operation: "health_readiness",
      route: "ready",
    });
    return true;
  }

  if (pathname === "/api/v1/health") {
    const health = healthController.getApiV1Health();
    sendJsonResponse(200, health, {
      operation: "health_canonical",
      route: "health_v1",
    });
    return true;
  }

  if (pathname === "/health" || pathname === "/api/health") {
    const liveness = healthController.getLiveness();
    sendJsonResponse(200, liveness, {
      operation: "health_liveness",
      route: "health_liveness",
    });
    return true;
  }

  if (pathname === "/metrics" || pathname === "/health/detail") {
    if (authContext) {
      const authorized = isTelemetryAuthorized({
        clientIp: authContext.clientIp,
        directSocketIp: authContext.directSocketIp,
        headers: authContext.headers,
        metricsSecret: authContext.metricsSecret,
        isProduction: authContext.isProduction ?? false,
      });

      if (!authorized) {
        sendJsonResponse(
          403,
          formatHttpError(
            403,
            "ERR_UNAUTHORIZED",
            "Telemetry access restricted to authorized callers or loopback",
            authContext.correlationId,
          ),
          { operation: "health_telemetry", route: "health_telemetry" },
        );
        return true;
      }
    }

    if (pathname === "/metrics") {
      const rawAccept = authContext?.headers?.["accept"];
      const acceptHeader = Array.isArray(rawAccept) ? rawAccept[0] : rawAccept;
      const prefersPrometheus =
        Boolean(
          acceptHeader?.includes("text/plain") ||
          acceptHeader?.includes("openmetrics") ||
          acceptHeader?.includes("text/version"),
        );
      if (prefersPrometheus) {
        const metricsText = await healthController.getPrometheusMetrics();
        sendTextResponse(200, metricsText, {
          operation: "health_telemetry",
          route: "health_telemetry",
        });
        return true;
      }
    }

    const detailed = await healthController.getDetailedHealth();
    sendJsonResponse(200, detailed, {
      operation: "health_telemetry",
      route: "health_telemetry",
    });
    return true;
  }

  return false;
}

export async function handleStaticRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  staticController: StaticController,
  logger: Logger,
  correlationId: string,
  clientIp: string,
  startTime: number,
  metricsCollector?: HttpMetricsCollector,
): Promise<boolean> {
  if (
    (method === "GET" || method === "HEAD") &&
    !pathname.startsWith("/api/")
  ) {
    const served = await staticController.serve(
      req,
      res,
      logger,
      correlationId,
    );

    if (served) {
      const duration = Math.round(performance.now() - startTime);
      const statusCode = res.statusCode || 200;
      metricsCollector?.recordRequest({
        method,
        path: pathname,
        statusCode,
        durationMs: duration,
      });
      const logContext = {
        operation: "http_request",
        route: "static",
        correlationId,
        clientIp,
        path: pathname,
        statusCode,
        duration,
        durationMs: duration,
      };
      if (statusCode >= 500) {
        logger.error("HTTP Static error", logContext);
      } else if (statusCode >= 400) {
        logger.warn("HTTP Static rejected", logContext);
      } else {
        logger.info("HTTP Static served", logContext);
      }
      return true;
    }
  }
  return false;
}

/**
 * Extracts optional userId from incoming HTTP request headers or query parameters (ENH-008).
 * Checks `x-user-id` and `x-player-id` headers, as well as `userId` and `playerId` query parameters.
 * Does NOT extract session tokens to prevent credential leakage in logs (CRIT-002).
 */
export function extractHttpUserId(
  req: IncomingMessage,
  url: string = req.url || "/",
  logger?: Logger,
): string | undefined {
  const headerVal = req.headers["x-user-id"] ?? req.headers["x-player-id"];
  const headerCandidate = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (typeof headerCandidate === "string" && headerCandidate.trim().length > 0) {
    return headerCandidate.trim();
  }

  const queryIndex = url.indexOf("?");
  if (queryIndex !== -1) {
    try {
      const searchParams = new URLSearchParams(url.slice(queryIndex));
      const queryVal =
        searchParams.get("userId") ?? searchParams.get("playerId");
      if (queryVal && queryVal.trim().length > 0) {
        return queryVal.trim();
      }
    } catch (err) {
      logger?.debug("Failed to parse URL search params for userId extraction", {
        operation: "extract_http_user_id",
        url,
        error: serializeError(err),
      });
    }
  }

  return undefined;
}

/**
 * Detects obvious automated vulnerability and sensitive file path scanning attempts (ENH-001).
 * These probing paths MUST NOT bypass ingress rate limiting as static candidates.
 */
export function isProbingPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return (
    lower.includes("/.env") ||
    lower.includes("/.git") ||
    lower.endsWith(".php") ||
    lower.endsWith(".sql") ||
    lower.endsWith(".bak") ||
    lower.endsWith(".config") ||
    lower.includes("/wp-") ||
    lower.includes("/admin") ||
    lower.includes("/phpmyadmin") ||
    lower.includes("/actuator")
  );
}

export function handleRateLimitCheck(
  clientIp: string,
  pathname: string,
  method: string,
  correlationId: string,
  rateLimiter: HttpRateLimiter | undefined,
  config: HttpServerConfig,
  logger: Logger,
  sendJsonResponse: (
    statusCode: number,
    data: unknown,
    options?: { skipLog?: boolean; operation?: string; route?: string },
  ) => void,
  startTime?: number,
  userId?: string,
): boolean {
  if (pathname === "/healthz" || pathname === "/ready") {
    return false;
  }

  const isStaticCandidate =
    (method === "GET" || method === "HEAD") &&
    !pathname.startsWith("/api/") &&
    pathname !== "/health" &&
    pathname !== "/ready" &&
    pathname !== "/metrics" &&
    pathname !== "/health/detail" &&
    !isProbingPath(pathname);

  if (isStaticCandidate) {
    return false;
  }

  if (rateLimiter && !rateLimiter.consume(clientIp)) {
    const duration = startTime ? Math.round(performance.now() - startTime) : 0;
    logger.warn("HTTP rate limit exceeded", {
      operation: "http_rate_limited",
      correlationId,
      clientIp,
      path: pathname,
      method,
      duration,
      durationMs: duration,
      ...(userId ? { userId } : {}),
    });

    const maxReq = config.env?.RATE_LIMIT_MAX_REQUESTS ?? 100;
    const windowSec = Math.round(
      (config.env?.RATE_LIMIT_WINDOW_MS ?? 10_000) / 1000,
    );
    const rawDesc =
      rateLimiter.getLimitDescription?.() ||
      `Maximum ${maxReq} requests per ${windowSec} seconds allowed.`;
    const limitDesc = rawDesc.includes("Rate limit exceeded")
      ? rawDesc
      : `Rate limit exceeded. ${rawDesc}`;
    sendJsonResponse(
      429,
      formatHttpError(429, "ERR_RATE_LIMITED", limitDesc, correlationId),
      { operation: "http_rate_limited", route: "rate_limit" },
    );
    return true;
  }
  return false;
}

export function handleLanInfoRoute(
  req: IncomingMessage,
  method: string,
  pathname: string,
  port: number,
  lanInfoController: LanInfoController,
  sendJsonResponse: (
    statusCode: number,
    data: unknown,
    options?: { skipLog?: boolean; operation?: string; route?: string },
  ) => void,
  sendRedirect?: (
    statusCode: number,
    location: string,
    options?: { skipLog?: boolean; operation?: string; route?: string },
  ) => void,
): boolean {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  if (pathname === "/api/v1/lan-info") {
    const requestPort = port || req.socket?.localPort || 3000;
    const lanInfo = lanInfoController.getLanInfo(requestPort);
    sendJsonResponse(200, lanInfo, { operation: "lan_info", route: "lan_info" });
    return true;
  }

  if (pathname === "/api/lan-info") {
    if (sendRedirect) {
      sendRedirect(307, "/api/v1/lan-info", { operation: "lan_info_redirect", route: "lan_info_redirect" });
    } else {
      sendJsonResponse(307, null, { operation: "lan_info_redirect", route: "lan_info_redirect" });
    }
    return true;
  }

  return false;
}

/**
 * Rate limits 404 probing to mitigate automated vulnerability path scanning (ENH-001, MIN-003, CRIT-003).
 * When repeated 404s from the same IP exceed the threshold, returns 429 Too Many Requests.
 */
export function handleNotFoundRoute(
  clientIp: string,
  pathname: string,
  method: string,
  correlationId: string,
  sendJsonResponse: (
    statusCode: number,
    data: unknown,
    options?: { skipLog?: boolean; operation?: string; route?: string },
  ) => void,
  notFoundRateLimiter?: HttpRateLimiter,
  logger?: Logger,
  startTime?: number,
  userId?: string,
  rateLimiter?: HttpRateLimiter,
): void {
  // 1. Consume from global rate limiter if present so non-existent routes consume limit tokens (CRIT-003, MIN-003)
  if (rateLimiter && !rateLimiter.consume(clientIp)) {
    const duration = startTime ? Math.round(performance.now() - startTime) : 0;
    logger?.warn("HTTP rate limit exceeded on not found route", {
      operation: "http_rate_limited",
      correlationId,
      clientIp,
      path: pathname,
      method,
      duration,
      durationMs: duration,
      ...(userId ? { userId } : {}),
    });

    sendJsonResponse(
      429,
      formatHttpError(
        429,
        "ERR_RATE_LIMITED",
        "Rate limit exceeded.",
        correlationId,
      ),
      { operation: "http_rate_limited", route: "rate_limit" },
    );
    return;
  }

  // 2. Consume from specialized 404 probing rate limiter
  if (notFoundRateLimiter && !notFoundRateLimiter.consume(clientIp)) {
    const duration = startTime ? Math.round(performance.now() - startTime) : 0;
    logger?.warn("HTTP 404 probing rate limit exceeded", {
      operation: "http_rate_limited",
      correlationId,
      clientIp,
      path: pathname,
      method,
      duration,
      durationMs: duration,
      ...(userId ? { userId } : {}),
    });

    sendJsonResponse(
      429,
      formatHttpError(
        429,
        "ERR_RATE_LIMITED",
        "Too many non-existent path requests. Please slow down.",
        correlationId,
      ),
      { operation: "http_rate_limited", route: "rate_limit" },
    );
    return;
  }

  sendJsonResponse(
    404,
    formatHttpError(
      404,
      "ERR_NOT_FOUND",
      `Cannot ${method} ${pathname}`,
      correlationId,
    ),
    { operation: "http_request", route: "not_found" },
  );
}

export function createFallbackHtml(port: number): string {
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
    <p><a href="/api/v1/lan-info" style="color: #48dbfb;">/api/v1/lan-info</a> &bull; <a href="/health" style="color: #48dbfb;">/health</a> &bull; <a href="/healthz" style="color: #48dbfb;">/healthz</a></p>
    <p style="font-size: 0.9em; opacity: 0.8;">To view the web client, ensure client assets are built in <code>apps/client/dist</code> or run the client dev server.</p>
  </div>
</body>
</html>`;
}
