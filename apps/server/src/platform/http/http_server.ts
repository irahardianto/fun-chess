import { IncomingMessage, ServerResponse, RequestListener } from "node:http";
import { resolveAllowedOrigins } from "../config/index.js";
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
import {
  sanitizeCorrelationId,
  CORRELATION_ID_REGEX,
  formatHttpError,
  formatHttpErrorFromException,
  configureServerTimeouts,
  resolveDistPath,
  applySecurityHeaders,
  applyCorsHeaders,
  handleCorsPreflight,
  HealthRouteAuthContext,
  handleHealthRoutes,
  handleStaticRoutes,
  extractHttpUserId,
  handleRateLimitCheck,
  handleLanInfoRoute,
  createFallbackHtml,
} from "./http_helpers.js";
import { HttpRouter, HttpRouterOptions } from "./http_router.js";

export type {
  IRoomCountProvider,
  IAddressingInfoProvider,
  HttpServerConfig,
  HttpErrorEnvelope,
  HttpErrorBody,
  TelemetryAuthParams,
  HealthRouteAuthContext,
  HttpRouterOptions,
};

export {
  isTelemetryAuthorized,
  sanitizeCorrelationId,
  CORRELATION_ID_REGEX,
  formatHttpError,
  formatHttpErrorFromException,
  configureServerTimeouts,
  resolveDistPath,
  applySecurityHeaders,
  applyCorsHeaders,
  handleCorsPreflight,
  handleHealthRoutes,
  handleStaticRoutes,
  extractHttpUserId,
  handleRateLimitCheck,
  handleLanInfoRoute,
  createFallbackHtml,
  HttpRouter,
};

const START_TIME = Date.now();

/**
 * Creates the HTTP request listener for Fun Chess API endpoints and static SPA hosting.
 * Delegates routing and dispatch pipeline to HttpRouter (MIN-035, MAJ-020).
 * Conforms to single-purpose, CC < 10, functions 10-50 lines.
 */
export function createHttpServer(config: HttpServerConfig): RequestListener {
  const {
    roomStore,
    logger,
    port = config.env?.PORT ?? 3000,
    distPath = resolveDistPath(config, config.logger, config.fileStorage),
    fileStorage = config.fileStorage,
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
      { operation: "http_server_init" },
    );
  }

  const trustProxy = env?.TRUST_PROXY ?? false;
  const isProduction = env?.NODE_ENV === "production";

  const effectiveAllowedOrigins =
    configuredAllowedOrigins ??
    (config.env
      ? resolveAllowedOrigins(config.env)
      : resolveAllowedOrigins({}));

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

  const router = new HttpRouter({
    config,
    logger,
    port,
    effectiveAllowedOrigins,
    trustProxy,
    isProduction,
    healthController,
    lanInfoController,
    staticController,
    rateLimiter,
  });

  return (req: IncomingMessage, res: ServerResponse): Promise<void> =>
    router.handleRequest(req, res);
}
