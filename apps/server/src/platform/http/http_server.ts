import { IncomingMessage, ServerResponse, RequestListener } from "node:http";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Logger } from "../logger/logger.interface.js";
import { extractClientIp } from "./ip_utils.js";
import { AppError } from "@fun-chess/shared";
import { isOriginAllowed, resolveAllowedOrigins } from "../config/index.js";
import { HttpRateLimiter } from "./http_rate_limiter.js";
import {
  HealthController,
  LanInfoController,
  StaticController,
  isTelemetryAuthorized,
  type TelemetryAuthParams,
} from "./controllers/index.js";
import {
  IRoomCountProvider,
  IAddressingInfoProvider,
  HttpServerConfig,
  HttpErrorEnvelope,
  HttpErrorBody,
} from "./http.interface.js";

export type {
  IRoomCountProvider,
  IAddressingInfoProvider,
  HttpServerConfig,
  HttpErrorEnvelope,
  HttpErrorBody,
  TelemetryAuthParams,
};

export { isTelemetryAuthorized };

const START_TIME = Date.now();

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

/**
 * Security headers for native HTTP responses (SEC-02, MAJ-001, MIN-005).
 *
 * Security Rationale for 'unsafe-inline' in style-src (MIN-005):
 * fun-chess client utilizes dynamic runtime styles for interactive theme toggling,
 * chessboard coordinates, and scoped CSS injected by the Vue runtime during client SPA navigation.
 * Script execution is strictly confined to 'self' (no 'unsafe-eval' or 'unsafe-inline' on script-src),
 * and object-src is 'none', mitigating cross-site scripting (XSS) vectors while preserving styling flexibility.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(self), microphone=(), geolocation=(), payment=()",
};

// --- Extracted HTTP Helpers (MAJ-038, MIN-009, MAJ-033) ---

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
 * Resolves the client dist path by checking configuration and candidate locations (CRIT-003, MIN-001, MIN-009).
 * Strictly relies on config.distPath and config.env.CLIENT_DIST_PATH without direct process.env reads.
 * Accepts optional logger parameter to avoid module-level defaultLogger usage (MIN-009).
 */
export function resolveDistPath(config: HttpServerConfig, logger?: Logger): string {
  if (config.distPath) {
    return config.distPath;
  }
  if (config.env?.CLIENT_DIST_PATH) {
    return config.env.CLIENT_DIST_PATH;
  }

  // Candidate locations in development, monorepo, and production containers
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "apps/client/dist"),
    path.resolve(process.cwd(), "../client/dist"),
    "/app/apps/client/dist",
    path.resolve(currentDir, "../../../../client/dist"),
  ];

  const log = logger ?? config.logger;

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch (err) {
      log?.debug("Failed checking client dist directory candidate", {
        operation: "resolve_client_dist_dir",
        candidate,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return path.resolve(process.cwd(), "../client/dist");
}

export function applySecurityHeaders(
  res: ServerResponse,
  correlationId: string,
  req?: IncomingMessage,
  trustProxy = false,
): void {
  for (const [headerKey, headerVal] of Object.entries(SECURITY_HEADERS)) {
    if (headerKey === "Strict-Transport-Security") {
      const isHttps =
        Boolean(
          (req?.socket as { encrypted?: boolean } | undefined)?.encrypted,
        ) ||
        (trustProxy === true && req?.headers["x-forwarded-proto"] === "https");
      if (!isHttps) {
        continue;
      }
    }
    res.setHeader(headerKey, headerVal);
  }
  res.setHeader("x-correlation-id", correlationId);
}

/**
 * Applies CORS headers to incoming requests.
 * Only emits Access-Control-Allow-Origin when Origin header is present and validated (MAJ-005).
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
}

export async function handleHealthRoutes(
  method: string,
  pathname: string,
  healthController: HealthController,
  sendJsonResponse: (
    statusCode: number,
    data: unknown,
    options?: { skipLog?: boolean; operation?: string },
  ) => void,
  sendTextResponse: (
    statusCode: number,
    text: string,
    options?: { skipLog?: boolean; operation?: string },
  ) => void,
  authContext?: HealthRouteAuthContext,
): Promise<boolean> {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  if (pathname === "/healthz") {
    sendTextResponse(200, "OK", { operation: "health_readiness" });
    return true;
  }

  if (pathname === "/health" || pathname === "/api/health") {
    const liveness = healthController.getLiveness();
    sendJsonResponse(200, liveness, { operation: "health_liveness" });
    return true;
  }

  if (pathname === "/metrics" || pathname === "/health/detail") {
    if (authContext) {
      const authorized = isTelemetryAuthorized({
        clientIp: authContext.clientIp,
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
          { operation: "health_telemetry" },
        );
        return true;
      }
    }

    const detailed = await healthController.getDetailedHealth();
    sendJsonResponse(200, detailed, { operation: "health_telemetry" });
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
      const logContext = {
        operation: "http_request",
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
 * Checks `x-user-id`, `x-player-id`, `x-session-token`, and `session-token` headers,
 * as well as `userId`, `playerId`, `sessionToken`, and `session_token` query parameters.
 */
export function extractHttpUserId(
  req: IncomingMessage,
  url: string = req.url || "/",
): string | undefined {
  const headerVal =
    req.headers["x-user-id"] ??
    req.headers["x-player-id"] ??
    req.headers["x-session-token"] ??
    req.headers["session-token"];
  const headerCandidate = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (typeof headerCandidate === "string" && headerCandidate.trim().length > 0) {
    return headerCandidate.trim();
  }

  const queryIndex = url.indexOf("?");
  if (queryIndex !== -1) {
    try {
      const searchParams = new URLSearchParams(url.slice(queryIndex));
      const queryVal =
        searchParams.get("userId") ??
        searchParams.get("playerId") ??
        searchParams.get("sessionToken") ??
        searchParams.get("session_token");
      if (queryVal && queryVal.trim().length > 0) {
        return queryVal.trim();
      }
    } catch (_err) {
      // Ignore malformed search parameters
      void _err;
    }
  }

  return undefined;
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
    options?: { skipLog?: boolean; operation?: string },
  ) => void,
  startTime?: number,
  userId?: string,
): boolean {
  // Container probe /healthz is exempt from rate limiting (ENH-003)
  if (pathname === "/healthz") {
    return false;
  }

  // Static assets and SPA routes are exempt from API rate limiting (ENH-003)
  const isStaticCandidate =
    (method === "GET" || method === "HEAD") &&
    !pathname.startsWith("/api/") &&
    pathname !== "/health" &&
    pathname !== "/metrics" &&
    pathname !== "/health/detail";

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
      { operation: "http_rate_limited" },
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
  sendJsonResponse: (statusCode: number, data: unknown) => void,
): boolean {
  if ((method === "GET" || method === "HEAD") && pathname === "/api/lan-info") {
    const requestPort = port || req.socket?.localPort || 3000;
    const lanInfo = lanInfoController.getLanInfo(requestPort);
    sendJsonResponse(200, lanInfo);
    return true;
  }
  return false;
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
 * Provides IP-based rate limiting on native HTTP API endpoints (MIN-002).
 * Formats standardized JSON error envelopes (MAJ-033).
 * Decomposed into modular route controllers and middleware helpers (MAJ-032, MIN-029).
 */
export function createHttpServer(config: HttpServerConfig): RequestListener {
  const {
    roomStore,
    logger,
    port = config.env?.PORT ?? 3000,
    distPath = resolveDistPath(config, config.logger),
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

  if (config.lanService && !config.relayAddressService) {
    logger.warn(
      "lanService is deprecated and will be removed in v2.0.0. Use relayAddressService instead.",
      {
        operation: "http_server_init",
      },
    );
  }

  const trustProxy = env?.TRUST_PROXY ?? false;

  const effectiveAllowedOrigins =
    configuredAllowedOrigins ??
    (config.env
      ? resolveAllowedOrigins(config.env)
      : resolveAllowedOrigins({}));

  // Interface contract resolution without concrete class instantiation (MAJ-005)
  const addressService: IAddressingInfoProvider = config.relayAddressService ??
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
    trustProxy,
  });

  if (config.server) {
    configureServerTimeouts(config.server);
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const correlationId = sanitizeCorrelationId(
      req.headers["x-correlation-id"] as string | undefined,
    );
    const startTime = performance.now();
    const method = req.method?.toUpperCase() || "GET";
    const url = req.url || "/";
    const [pathname = ""] = url.split("?");
    const clientIp = extractClientIp(req, trustProxy);
    const userId = extractHttpUserId(req, url);

    // 1. Security Headers (SEC-02, MAJ-001, MAJ-003)
    applySecurityHeaders(res, correlationId, req, trustProxy);

    // 2. CORS Handling (MAJ-005)
    const { origin, isOriginPermitted } = applyCorsHeaders(
      req,
      res,
      effectiveAllowedOrigins,
    );

    // 3. Preflight OPTIONS Request Logging & Dispatch (MAJ-014, MAJ-033)
    if (
      handleCorsPreflight(
        res,
        method,
        pathname,
        correlationId,
        clientIp,
        startTime,
        effectiveAllowedOrigins,
        isOriginPermitted,
        origin,
        logger,
      )
    ) {
      return;
    }

    // 4. Request Entry Logging with Client IP (ENH-008, MAJ-020)
    logger.info("HTTP request received", {
      operation: "http_request",
      correlationId,
      clientIp,
      method,
      path: pathname,
      userAgent: req.headers["user-agent"],
      ...(userId ? { userId } : {}),
    });

    const sendJsonResponse = (
      statusCode: number,
      data: unknown,
      options?: { skipLog?: boolean; operation?: string },
    ) => {
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

      if (options?.skipLog) {
        return;
      }

      const duration = Math.round(performance.now() - startTime);
      const logContext = {
        operation: options?.operation || "http_request",
        correlationId,
        clientIp,
        method,
        path: pathname,
        statusCode,
        duration,
        durationMs: duration,
        ...(userId ? { userId } : {}),
      };
      if (statusCode >= 500) {
        logger.error("HTTP request error", logContext);
      } else if (statusCode >= 400) {
        logger.warn("HTTP request rejected", logContext);
      } else {
        logger.info("HTTP response sent", logContext);
      }
    };

    const sendTextResponse = (
      statusCode: number,
      text: string,
      options?: { skipLog?: boolean; operation?: string },
    ) => {
      res.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": Buffer.byteLength(text),
      });
      if (method === "HEAD") {
        res.end();
      } else {
        res.end(text);
      }

      if (options?.skipLog) {
        return;
      }

      const duration = Math.round(performance.now() - startTime);
      const logContext = {
        operation: options?.operation || "http_request",
        correlationId,
        clientIp,
        method,
        path: pathname,
        statusCode,
        duration,
        durationMs: duration,
        ...(userId ? { userId } : {}),
      };
      if (statusCode >= 500) {
        logger.error("HTTP request error", logContext);
      } else if (statusCode >= 400) {
        logger.warn("HTTP request rejected", logContext);
      } else {
        logger.info("HTTP response sent", logContext);
      }
    };

    try {
      // 5. Rate Limiting Check on API & Dynamic Endpoints (MIN-002, ENH-003, MIN-008, ENH-008)
      if (
        handleRateLimitCheck(
          clientIp,
          pathname,
          method,
          correlationId,
          rateLimiter,
          config,
          logger,
          sendJsonResponse,
          startTime,
          userId,
        )
      ) {
        return;
      }

      // 6. Health & Telemetry Routes (MAJ-002, MIN-007)
      const authContext: HealthRouteAuthContext = {
        clientIp,
        headers: req.headers,
        correlationId,
        metricsSecret: config.metricsSecret ?? env?.METRICS_SECRET,
        isProduction,
      };

      if (
        await handleHealthRoutes(
          method,
          pathname,
          healthController,
          sendJsonResponse,
          sendTextResponse,
          authContext,
        )
      ) {
        return;
      }

      // 7. Static Assets / SPA Fallback (non-API routes) (ENH-003, MIN-016)
      if (
        await handleStaticRoutes(
          req,
          res,
          method,
          pathname,
          staticController,
          logger,
          correlationId,
          clientIp,
          startTime,
        )
      ) {
        return;
      }

      // 8. Host Addressing & QR Discovery
      if (
        handleLanInfoRoute(
          req,
          method,
          pathname,
          port,
          lanInfoController,
          sendJsonResponse,
        )
      ) {
        return;
      }

      // 9. Unhandled 404 with standardized error envelope (MIN-032, MAJ-033)
      sendJsonResponse(
        404,
        formatHttpError(
          404,
          "ERR_NOT_FOUND",
          `Cannot ${method} ${pathname}`,
          correlationId,
        ),
      );
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      const errorObj =
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : { raw: err };

      const { statusCode, payload } = formatHttpErrorFromException(
        err,
        correlationId,
      );

      const logContext = {
        operation: "http_request",
        correlationId,
        clientIp,
        method,
        path: pathname,
        duration,
        durationMs: duration,
        statusCode,
        error: errorObj,
      };

      if (statusCode >= 500) {
        logger.error("HTTP request error", logContext);
      } else {
        logger.warn("HTTP request rejected", logContext);
      }

      if (!res.headersSent) {
        sendJsonResponse(statusCode, payload, { skipLog: true });
      }
    }
  };
}
