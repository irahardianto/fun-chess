import { IncomingMessage, ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
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
  sanitizeCorrelationId,
  applySecurityHeaders,
  applyCorsHeaders,
  handleCorsPreflight,
  extractHttpUserId,
  handleRateLimitCheck,
  handleHealthRoutes,
  handleStaticRoutes,
  handleLanInfoRoute,
  formatHttpError,
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
}

/**
 * HttpRouter orchestrates HTTP request processing across security, CORS,
 * rate limiting, controller routing, and structured logging (MIN-035, MAJ-020).
 * Conforms to code-organization-principles: CC < 10, functions 10-50 lines.
 */
export class HttpRouter {
  private readonly config: HttpServerConfig;
  private readonly logger: Logger;
  private readonly port: number;
  private readonly effectiveAllowedOrigins: string[];
  private readonly trustProxy: boolean;
  private readonly isProduction: boolean;
  private readonly healthController: HealthController;
  private readonly lanInfoController: LanInfoController;
  private readonly staticController: StaticController;
  private readonly rateLimiter?: HttpRateLimiter;

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

    // 1. Security Headers (SEC-02, MAJ-001)
    applySecurityHeaders(res, correlationId, req, this.trustProxy);

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

    const { sendJsonResponse, sendTextResponse } = this.createResponders(
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
      options?: { skipLog?: boolean; operation?: string },
    ) => void;
    sendTextResponse: (
      statusCode: number,
      text: string,
      options?: { skipLog?: boolean; operation?: string },
    ) => void;
  } {
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
      if (!options?.skipLog) {
        this.logResponse(
          statusCode,
          options?.operation || "http_request",
          correlationId,
          clientIp,
          method,
          pathname,
          startTime,
          userId,
        );
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
      if (!options?.skipLog) {
        this.logResponse(
          statusCode,
          options?.operation || "http_request",
          correlationId,
          clientIp,
          method,
          pathname,
          startTime,
          userId,
        );
      }
    };

    return { sendJsonResponse, sendTextResponse };
  }

  private logResponse(
    statusCode: number,
    operation: string,
    correlationId: string,
    clientIp: string,
    method: string,
    pathname: string,
    startTime: number,
    userId?: string,
  ): void {
    const duration = Math.round(performance.now() - startTime);
    const logContext = {
      operation,
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
      options?: { skipLog?: boolean; operation?: string },
    ) => void,
    sendTextResponse: (
      statusCode: number,
      text: string,
      options?: { skipLog?: boolean; operation?: string },
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
        this.port,
        this.lanInfoController,
        sendJsonResponse,
      )
    ) {
      return;
    }

    // 9. Unhandled 404 Route (MIN-007)
    sendJsonResponse(
      404,
      formatHttpError(
        404,
        "ERR_NOT_FOUND",
        `Cannot ${method} ${pathname}`,
        correlationId,
      ),
      { operation: "http_not_found" },
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
      options?: { skipLog?: boolean; operation?: string },
    ) => void,
  ): void {
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
      ...(userId ? { userId } : {}),
    };

    if (statusCode >= 500) {
      this.logger.error("HTTP request error", logContext);
    } else {
      this.logger.warn("HTTP request rejected", logContext);
    }

    if (!res.headersSent) {
      sendJsonResponse(statusCode, payload, { skipLog: true });
    }
  }
}
