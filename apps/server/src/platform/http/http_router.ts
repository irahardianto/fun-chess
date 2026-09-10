import { IncomingMessage, ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import { serializeError } from "@fun-chess/shared";
import { Logger } from "../logger/logger.interface.js";
import { extractClientIp } from "./ip_utils.js";
import {
  HealthController,
  LanInfoController,
  StaticController,
} from "./controllers/index.js";
import {
  HttpServerConfig,
} from "./http.interface.js";
import { HttpRateLimiter } from "./http_rate_limiter.js";
import {
  HttpMetricsCollector,
  globalMetricsCollector,
  normalizeMetricPath,
} from "./http_metrics.js";
import {
  sanitizeCorrelationId,
  applySecurityHeaders,
  applyCorsHeaders,
  handleCorsPreflight,
  extractHttpUserId,
  handleRateLimitCheck,
  handleHealthRoutes,
  handleStaticRoutes,
  handleLanInfoRoute,
  handleNotFoundRoute,
  formatHttpErrorFromException,
  HealthRouteAuthContext,
} from "./http_helpers.js";

export interface HttpRouterOptions {
  config: HttpServerConfig;
  logger: Logger;
  port: number;
  effectiveAllowedOrigins: string[];
  trustProxy: boolean;
  isProduction: boolean;
  healthController: HealthController;
  lanInfoController: LanInfoController;
  staticController: StaticController;
  rateLimiter?: HttpRateLimiter;
  notFoundRateLimiter?: HttpRateLimiter;
  metricsCollector?: HttpMetricsCollector;
}

/**
 * HttpRouter orchestrates HTTP request processing across security, CORS,
 * rate limiting, controller routing, and structured logging (MIN-035, MAJ-020).
 *
 * NOTE ON HTTP SCOPE (MAJ-008):
 * The server HTTP layer strictly exposes GET/HEAD for health probes, telemetry,
 * host addressing, and static SPA delivery, with zero POST endpoints. All game
 * and room mutations are dispatched exclusively via WebSockets (Socket.IO).
 *
 * Conforms to code-organization-principles: CC < 10, functions 10-50 lines.
 */
export class HttpRouter {
  private readonly config: HttpServerConfig;
  private readonly logger: Logger;
  private readonly port: number;
  private readonly effectiveAllowedOrigins: string[];
  private readonly trustProxy: boolean;
  private readonly isProduction: boolean;
  public readonly healthController: HealthController;
  public readonly lanInfoController: LanInfoController;
  public readonly staticController: StaticController;
  private readonly rateLimiter?: HttpRateLimiter;
  private readonly notFoundRateLimiter?: HttpRateLimiter;
  private readonly metricsCollector: HttpMetricsCollector;

  constructor(options: HttpRouterOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.port = options.port;
    this.effectiveAllowedOrigins = options.effectiveAllowedOrigins;
    this.trustProxy = options.trustProxy;
    this.isProduction = options.isProduction;
    this.healthController = options.healthController;
    this.lanInfoController = options.lanInfoController;
    this.staticController = options.staticController;
    this.rateLimiter = options.rateLimiter;
    this.notFoundRateLimiter = options.notFoundRateLimiter;
    this.metricsCollector =
      options.metricsCollector ??
      options.config.metricsCollector ??
      globalMetricsCollector;

    if (this.notFoundRateLimiter) {
      this.staticController.setNotFoundRateLimiter?.(this.notFoundRateLimiter);
    }
  }

  public setShutdownCoordinator(coordinator: { isTerminating?: boolean; isShuttingDown?: boolean }): void {
    this.healthController.setShutdownCoordinator(coordinator);
  }

  public async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const correlationId = sanitizeCorrelationId(
      req.headers["x-correlation-id"] as string | undefined,
    );
    const startTime = performance.now();
    const method = req.method?.toUpperCase() || "GET";
    const url = req.url || "/";
    const [pathname = ""] = url.split("?");
    const clientIp = extractClientIp(req, this.trustProxy);
    const userId = extractHttpUserId(req, url, this.logger);

    // 1. Security Headers (SEC-02, MAJ-001, MAJ-003, ENH-002)
    applySecurityHeaders(res, correlationId, req, this.trustProxy, {
      allowedOrigins: this.effectiveAllowedOrigins,
      clientUrl: this.config.env?.CLIENT_URL,
      publicUrl: this.config.env?.PUBLIC_URL,
      cspReportUri: this.config.cspReportUri ?? this.config.env?.CSP_REPORT_URI,
    });

    // 2. CORS Handling (MAJ-005)
    const { origin, isOriginPermitted } = applyCorsHeaders(
      req,
      res,
      this.effectiveAllowedOrigins,
    );

    // 3. Preflight OPTIONS Handling (MAJ-014, MAJ-033)
    if (
      handleCorsPreflight(
        res,
        method,
        pathname,
        correlationId,
        clientIp,
        startTime,
        this.effectiveAllowedOrigins,
        isOriginPermitted,
        origin,
        this.logger,
      )
    ) {
      return;
    }

    // 4. Request Entry Logging (ENH-008, MAJ-020)
    this.logRequestEntry(correlationId, clientIp, method, pathname, req, userId);

    const { sendJsonResponse, sendTextResponse, sendRedirect } = this.createResponders(
      res,
      correlationId,
      startTime,
      clientIp,
      pathname,
      method,
      userId,
    );

    try {
      await this.dispatchRoutes(
        req,
        res,
        method,
        pathname,
        correlationId,
        clientIp,
        startTime,
        userId,
        sendJsonResponse,
        sendTextResponse,
        sendRedirect,
      );
    } catch (err) {
      this.handleDispatchError(
        err,
        res,
        correlationId,
        clientIp,
        pathname,
        method,
        startTime,
        userId,
        sendJsonResponse,
      );
    }
  }

  private logRequestEntry(
    correlationId: string,
    clientIp: string,
    method: string,
    pathname: string,
    req: IncomingMessage,
    userId?: string,
  ): void {
    this.logger.info("HTTP request received", {
      operation: "http_request",
      correlationId,
      clientIp,
      method,
      path: pathname,
      userAgent: req.headers["user-agent"],
      ...(userId ? { userId } : {}),
    });
  }

  private createResponders(
    res: ServerResponse,
    correlationId: string,
    startTime: number,
    clientIp: string,
    pathname: string,
    method: string,
    userId?: string,
  ): {
    sendJsonResponse: (
      statusCode: number,
      data: unknown,
      options?: { skipLog?: boolean; operation?: string; route?: string },
    ) => void;
    sendTextResponse: (
      statusCode: number,
      text: string,
      options?: { skipLog?: boolean; operation?: string; route?: string },
    ) => void;
    sendRedirect: (
      statusCode: number,
      location: string,
      options?: { skipLog?: boolean; operation?: string; route?: string },
    ) => void;
  } {
    const sendJsonResponse = (
      statusCode: number,
      data: unknown,
      options?: { skipLog?: boolean; operation?: string; route?: string },
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
      if (!options?.skipLog) {
        this.logResponse(
          statusCode,
          correlationId,
          clientIp,
          method,
          pathname,
          startTime,
          userId,
          options?.route ?? options?.operation,
        );
      }
    };

    const sendTextResponse = (
      statusCode: number,
      text: string,
      options?: { skipLog?: boolean; operation?: string; route?: string },
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
      if (!options?.skipLog) {
        this.logResponse(
          statusCode,
          correlationId,
          clientIp,
          method,
          pathname,
          startTime,
          userId,
          options?.route ?? options?.operation,
        );
      }
    };

    const sendRedirect = (
      statusCode: number,
      location: string,
      options?: { skipLog?: boolean; operation?: string; route?: string },
    ) => {
      res.writeHead(statusCode, {
        Location: location,
      });
      res.end();
      if (!options?.skipLog) {
        this.logResponse(
          statusCode,
          correlationId,
          clientIp,
          method,
          pathname,
          startTime,
          userId,
          options?.route ?? options?.operation,
        );
      }
    };

    return { sendJsonResponse, sendTextResponse, sendRedirect };
  }

  private logResponse(
    statusCode: number,
    correlationId: string,
    clientIp: string,
    method: string,
    pathname: string,
    startTime: number,
    userId?: string,
    routeTag?: string,
  ): void {
    const duration = Math.round(performance.now() - startTime);
    const route = routeTag ?? normalizeMetricPath(pathname);
    this.metricsCollector.recordRequest({
      method,
      path: pathname,
      statusCode,
      durationMs: duration,
    });

    const logContext = {
      operation: "http_request",
      route,
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
      this.logger.error("HTTP request error", logContext);
    } else if (statusCode >= 400) {
      this.logger.warn("HTTP request rejected", logContext);
    } else {
      this.logger.info("HTTP response sent", logContext);
    }
  }

  private async dispatchRoutes(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    pathname: string,
    correlationId: string,
    clientIp: string,
    startTime: number,
    userId: string | undefined,
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
    sendRedirect: (
      statusCode: number,
      location: string,
      options?: { skipLog?: boolean; operation?: string; route?: string },
    ) => void,
  ): Promise<void> {
    // 5. Rate Limiting Check
    if (
      handleRateLimitCheck(
        clientIp,
        pathname,
        method,
        correlationId,
        this.rateLimiter,
        this.config,
        this.logger,
        sendJsonResponse,
        startTime,
        userId,
      )
    ) {
      return;
    }

    // 6. Health & Telemetry Routes
    const authContext: HealthRouteAuthContext = {
      clientIp,
      directSocketIp: req.socket?.remoteAddress,
      headers: req.headers,
      correlationId,
      metricsSecret:
        this.config.metricsSecret ?? this.config.env?.METRICS_SECRET,
      isProduction: this.isProduction,
    };

    if (
      await handleHealthRoutes(
        method,
        pathname,
        this.healthController,
        sendJsonResponse,
        sendTextResponse,
        authContext,
      )
    ) {
      return;
    }

    // 7. Static Assets / SPA Fallback
    if (
      await handleStaticRoutes(
        req,
        res,
        method,
        pathname,
        this.staticController,
        this.logger,
        correlationId,
        clientIp,
        startTime,
        this.metricsCollector,
      )
    ) {
      return;
    }

    // 8. Host Addressing & QR Discovery (MAJ-009)
    if (
      handleLanInfoRoute(
        req,
        method,
        pathname,
        this.port,
        this.lanInfoController,
        sendJsonResponse,
        sendRedirect,
      )
    ) {
      return;
    }

    // 9. Unhandled 404 Route (MIN-007, ENH-001, MIN-003, CRIT-003)
    handleNotFoundRoute(
      clientIp,
      pathname,
      method,
      correlationId,
      sendJsonResponse,
      this.notFoundRateLimiter,
      this.logger,
      startTime,
      userId,
      this.rateLimiter,
    );
  }

  private handleDispatchError(
    err: unknown,
    res: ServerResponse,
    correlationId: string,
    clientIp: string,
    pathname: string,
    method: string,
    startTime: number,
    userId: string | undefined,
    sendJsonResponse: (
      statusCode: number,
      data: unknown,
      options?: { skipLog?: boolean; operation?: string; route?: string },
    ) => void,
  ): void {
    const duration = Math.round(performance.now() - startTime);

    const { statusCode, payload } = formatHttpErrorFromException(
      err,
      correlationId,
    );

    const route = normalizeMetricPath(pathname);
    this.metricsCollector.recordRequest({
      method,
      path: pathname,
      statusCode,
      durationMs: duration,
    });

    const logContext = {
      operation: "http_request",
      route,
      correlationId,
      clientIp,
      method,
      path: pathname,
      duration,
      durationMs: duration,
      statusCode,
      error: serializeError(err),
      ...(userId ? { userId } : {}),
    };

    if (statusCode >= 500) {
      this.logger.error("HTTP request error", logContext);
    } else {
      this.logger.warn("HTTP request rejected", logContext);
    }

    if (!res.headersSent) {
      sendJsonResponse(statusCode, payload, { skipLog: true });
    } else if (!res.writableEnded) {
      // Fix hanging connection risk on mid-stream dispatch error (MIN-005)
      res.destroy();
    }
  }
}
