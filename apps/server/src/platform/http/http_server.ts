import { IncomingMessage, ServerResponse, RequestListener } from "node:http";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { Logger } from "../logger/logger.interface.js";
import { serveStaticFile } from "./static_handler.js";
import { RoomStore } from "../../features/rooms/room.store.js";
import { LanService } from "../../features/lan/lan.service.js";
import {
  RelayAddressService,
  IRelayAddressService,
} from "../../features/lan/relay_address.service.js";
import { HealthCheckResponse } from "@fun-chess/shared";
import { isOriginAllowed, resolveAllowedOrigins } from "../config/index.js";

export interface HttpServerConfig {
  roomStore: RoomStore;
  lanService?: LanService;
  relayAddressService?: IRelayAddressService;
  logger: Logger;
  port?: number;
  distPath?: string;
  allowedOrigins?: string[];
  getActiveSocketCount?: () => number;
}

const START_TIME = Date.now();

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=()",
};

/**
 * Creates the HTTP request listener for Fun Chess API endpoints and static SPA hosting.
 */
export function createHttpServer(config: HttpServerConfig): RequestListener {
  const {
    roomStore,
    lanService,
    relayAddressService = new RelayAddressService(),
    logger,
    port = Number(process.env.PORT) || 3000,
    distPath = path.resolve(process.cwd(), "../client/dist"),
    allowedOrigins: configuredAllowedOrigins,
    getActiveSocketCount = () => 0,
  } = config;

  // If a custom lanService was provided but not relayAddressService, adapt it
  const addressService: IRelayAddressService =
    config.relayAddressService ??
    (lanService
      ? (lanService as unknown as IRelayAddressService)
      : relayAddressService);

  const fallbackHtml = `<!DOCTYPE html>
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

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const correlationId =
      (req.headers["x-correlation-id"] as string) || randomUUID();
    const startTime = performance.now();
    const method = req.method?.toUpperCase() || "GET";
    const url = req.url || "/";
    const [pathname] = url.split("?");

    // Security Headers (SEC-02, ENH-004)
    for (const [headerKey, headerVal] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(headerKey, headerVal);
    }
    res.setHeader("X-Correlation-ID", correlationId);

    // Dynamic origin resolution if not passed statically in config
    const effectiveAllowedOrigins =
      configuredAllowedOrigins ?? resolveAllowedOrigins();
    const origin = req.headers["origin"] as string | undefined;

    let isOriginPermitted = false;
    if (origin) {
      isOriginPermitted = isOriginAllowed(origin, effectiveAllowedOrigins);
      if (isOriginPermitted) {
        if (effectiveAllowedOrigins.includes("*")) {
          res.setHeader("Access-Control-Allow-Origin", "*");
        } else {
          res.setHeader("Access-Control-Allow-Origin", origin); // nosemgrep: javascript.express.security.cors-misconfiguration.cors-misconfiguration
          res.setHeader("Vary", "Origin");
          res.setHeader("Access-Control-Allow-Credentials", "true");
        }
      }
    } else {
      // Direct / server-to-server / curl request without Origin header
      if (effectiveAllowedOrigins.includes("*")) {
        res.setHeader("Access-Control-Allow-Origin", "*");
      } else if (process.env.CORS_ORIGIN) {
        res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN);
      } else if (effectiveAllowedOrigins.length === 1) {
        res.setHeader("Access-Control-Allow-Origin", effectiveAllowedOrigins[0]);
      } else if (process.env.NODE_ENV !== "production") {
        res.setHeader("Access-Control-Allow-Origin", "*");
      }
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Correlation-ID",
    );

    // Handle preflight OPTIONS
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
      // 1. GET / HEAD /healthz - Container Liveness & Readiness Probe
      if ((method === "GET" || method === "HEAD") && pathname === "/healthz") {
        sendTextResponse(200, "OK");
        return;
      }

      // 2. GET / HEAD /health & GET / HEAD /api/health - Operational Telemetry Health Check
      if (
        (method === "GET" || method === "HEAD") &&
        (pathname === "/health" || pathname === "/api/health")
      ) {
        const mem = process.memoryUsage();
        const activeRooms = await roomStore.count();
        const activeSockets = getActiveSocketCount();
        const isCloud = addressService.isCloudRelay
          ? addressService.isCloudRelay()
          : false;
        const addrInfo = addressService.getAddressingInfo(port);

        const health: HealthCheckResponse = {
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
        sendJsonResponse(200, health);
        return;
      }

      // 3. GET / HEAD /api/lan-info - Host Addressing & QR Discovery
      if ((method === "GET" || method === "HEAD") && pathname === "/api/lan-info") {
        const lanInfo = addressService.getAddressingInfo(port);
        sendJsonResponse(200, lanInfo);
        return;
      }

      // 4. Static Assets / SPA Fallback (non-API routes)
      if ((method === "GET" || method === "HEAD") && !pathname.startsWith("/api/")) {
        const served = await serveStaticFile(
          req,
          res,
          { distPath, fallbackHtml },
          logger,
        );

        if (served) {
          const duration = Math.round(performance.now() - startTime);
          logger.debug(`HTTP Static served: ${pathname}`, {
            operation: "http_static",
            correlationId,
            path: pathname,
            duration,
            durationMs: duration,
          });
          return;
        }
      }

      // 5. Unhandled 404
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
