import { IncomingMessage, ServerResponse, RequestListener } from "node:http";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { Logger } from "../logger/logger.interface.js";
import { serveStaticFile } from "./static_handler.js";
import { IFileStorage } from "./file_storage.js";
import { RoomStore } from "../../features/rooms/room.store.js";
import { LanService } from "../../features/lan/lan.service.js";
import {
  RelayAddressService,
  IRelayAddressService,
} from "../../features/lan/relay_address.service.js";
import { HealthCheckResponse } from "@fun-chess/shared";
import { isOriginAllowed, resolveAllowedOrigins, type ServerEnv } from "../config/index.js";

export interface HttpServerConfig {
  roomStore: RoomStore;
  lanService?: LanService;
  relayAddressService?: IRelayAddressService;
  logger: Logger;
  port?: number;
  distPath?: string;
  allowedOrigins?: string[];
  env?: ServerEnv;
  fileStorage?: IFileStorage;
  getActiveSocketCount?: () => number;
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

async function handleHealthRequest(
  roomStore: RoomStore,
  addressService: IRelayAddressService,
  port: number,
  getActiveSocketCount: () => number,
): Promise<HealthCheckResponse> {
  const mem = process.memoryUsage();
  const activeRooms = await roomStore.count();
  const activeSockets = getActiveSocketCount();
  const isCloud = addressService.isCloudRelay
    ? addressService.isCloudRelay()
    : false;
  const addrInfo = addressService.getAddressingInfo(port);

  return {
    status: "ok",
    uptimeSeconds: Math.round((Date.now() - START_TIME) / 100) / 10,
    timestamp: new Date().toISOString(),
    activeRooms,
    activeSockets,
    memoryUsageMb: {
      rss: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
      heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
    },
    relay: {
      mode: isCloud ? "cloud" : "lan",
      ...(addrInfo.publicUrl ? { publicUrl: addrInfo.publicUrl } : {}),
    },
  };
}

/**
 * Creates the HTTP request listener for Fun Chess API endpoints and static SPA hosting.
 * Validates configuration via caller injection without direct process.env reads (MAJ-004).
 * Enforces valid matching CORS headers (MAJ-005) and Google Fonts CSP (MAJ-001).
 * Logs static asset deliveries at INFO level (MAJ-024).
 * Decomposed into modular helper handlers (MAJ-038).
 */
export function createHttpServer(config: HttpServerConfig): RequestListener {
  const {
    roomStore,
    lanService,
    relayAddressService = new RelayAddressService(
      config.env
        ? {
            publicUrl: config.env.PUBLIC_URL,
            host: config.env.HOST,
            port: config.env.PORT,
            lanIp: config.env.LAN_IP,
          }
        : undefined,
    ),
    logger,
    port = config.env?.PORT ?? 3000,
    distPath = path.resolve(process.cwd(), "../client/dist"),
    fileStorage,
    env = config.env,
    allowedOrigins: configuredAllowedOrigins,
    getActiveSocketCount = () => 0,
  } = config;

  const effectiveAllowedOrigins =
    configuredAllowedOrigins ??
    (config.env
      ? resolveAllowedOrigins(config.env)
      : resolveAllowedOrigins({}));

  const addressService: IRelayAddressService =
    config.relayAddressService ??
    (lanService
      ? (lanService as unknown as IRelayAddressService)
      : relayAddressService);

  const fallbackHtml = createFallbackHtml(port);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const correlationId =
      (req.headers["x-correlation-id"] as string) || randomUUID();
    const startTime = performance.now();
    const method = req.method?.toUpperCase() || "GET";
    const url = req.url || "/";
    const [pathname] = url.split("?");

    // 1. Security Headers (SEC-02, MAJ-001)
    applySecurityHeaders(res, correlationId);

    // 2. CORS Handling (MAJ-005)
    const { origin, isOriginPermitted } = applyCorsHeaders(
      req,
      res,
      effectiveAllowedOrigins,
    );

    // 3. Preflight OPTIONS
    if (method === "OPTIONS") {
      if (origin && !isOriginPermitted && !effectiveAllowedOrigins.includes("*")) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("CORS origin not allowed");
        return;
      }
      res.writeHead(204);
      res.end();
      return;
    }

    logger.info(`HTTP Request: ${method} ${pathname}`, {
      operation: "http_request",
      correlationId,
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
        method,
        path: pathname,
        statusCode,
        duration,
        durationMs: duration,
      });
    };

    try {
      // 4. GET / HEAD /healthz - Container Liveness & Readiness Probe
      if ((method === "GET" || method === "HEAD") && pathname === "/healthz") {
        sendTextResponse(200, "OK");
        return;
      }

      // 5. GET / HEAD /health & /api/health - Operational Telemetry Health Check
      const requestPort = port || req.socket?.localPort || 3000;

      if (
        (method === "GET" || method === "HEAD") &&
        (pathname === "/health" || pathname === "/api/health")
      ) {
        const health = await handleHealthRequest(
          roomStore,
          addressService,
          requestPort,
          getActiveSocketCount,
        );
        sendJsonResponse(200, health);
        return;
      }

      // 6. GET / HEAD /api/lan-info - Host Addressing & QR Discovery
      if ((method === "GET" || method === "HEAD") && pathname === "/api/lan-info") {
        const lanInfo = addressService.getAddressingInfo(requestPort);
        sendJsonResponse(200, lanInfo);
        return;
      }

      // 7. Static Assets / SPA Fallback (non-API routes)
      if ((method === "GET" || method === "HEAD") && !pathname.startsWith("/api/")) {
        const served = await serveStaticFile(
          req,
          res,
          { distPath, fallbackHtml, fileStorage, trustProxy: env?.TRUST_PROXY },
          logger,
        );

        if (served) {
          const duration = Math.round(performance.now() - startTime);
          // Log static file serving at INFO level (MAJ-024)
          logger.info(`HTTP Static served: ${pathname}`, {
            operation: "http_static",
            correlationId,
            path: pathname,
            duration,
            durationMs: duration,
          });
          return;
        }
      }

      // 8. Unhandled 404
      sendJsonResponse(404, {
        error: {
          code: "ERR_NOT_FOUND",
          message: `Cannot ${method} ${pathname}`,
          correlationId,
        },
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
        method,
        path: pathname,
        duration,
        durationMs: duration,
        error: errorObj,
      });

      if (!res.headersSent) {
        sendJsonResponse(500, {
          error: {
            code: "ERR_INTERNAL_SERVER",
            message: "Internal server error",
            correlationId,
          },
        });
      }
    }
  };
}
