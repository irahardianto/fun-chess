import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { serializeError } from "@fun-chess/shared";
import {
  validateServerConfig,
  resolveAllowedOrigins,
  type ServerEnv,
} from "../platform/config/index.js";
import {
  PinoLogger,
  type Logger,
} from "../platform/logger/index.js";
import {
  createHttpServer,
  type HttpRateLimiter,
  type IFileStorage,
} from "../platform/http/index.js";
import type {
  TypedSocketServer,
  SocketRateLimiter,
} from "../platform/socket/index.js";
import type { ShutdownCoordinator } from "../platform/lifecycle/index.js";
import {
  clearAllDisconnectTimers,
  type IDisconnectTimerRegistry,
  type ITimerService,
  type TimerHandle,
} from "../features/rooms/index.js";
import type { IRelayAddressService } from "../features/lan/index.js";
import type {
  DomainServices,
  StartServerOptions,
} from "./domain_services.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerBootstrapConfig {
  env: ServerEnv;
  allowedOrigins: string[];
  logger: Logger;
  port: number;
  host: string;
  isProduction: boolean;
  distPath: string;
  bootstrapCorrelationId: string;
  startTime: number;
}

/**
 * Resolves and validates environment configuration for server bootstrapping (MAJ-015, SEC-RT-003).
 */
export function resolveServerBootstrapConfig(
  options: StartServerOptions,
): ServerBootstrapConfig {
  const rawMerged: Record<string, unknown> = {
    ...process.env,
    ...(options.config || {}),
  };

  if (options.port !== undefined) {
    rawMerged.PORT = options.port;
  }
  if (options.host !== undefined) {
    rawMerged.HOST = options.host;
  }

  const env: ServerEnv = validateServerConfig(rawMerged);
  const allowedOrigins = options.allowedOrigins ?? resolveAllowedOrigins(env);

  const logger =
    options.logger ??
    new PinoLogger({
      level: env.LOG_LEVEL,
    });

  const port = options.port ?? env.PORT;
  const host = options.host ?? env.HOST;
  const isProduction = env.NODE_ENV === "production";
  const distPath =
    options.distPath ?? env.CLIENT_DIST_PATH ?? path.resolve(__dirname, "../../../client/dist");

  const bootstrapCorrelationId = randomUUID();
  const startTime = performance.now();

  return {
    env,
    allowedOrigins,
    logger,
    port,
    host,
    isProduction,
    distPath,
    bootstrapCorrelationId,
    startTime,
  };
}

export interface HttpLayerSetupParams {
  domainServices: DomainServices;
  bootstrapConfig: ServerBootstrapConfig;
  fileStorage?: IFileStorage;
  httpRateLimiter?: HttpRateLimiter;
  getActiveSocketCount: () => number;
}

/**
 * Configures HTTP server with API routes, rate limiting, and SPA static handling (MAJ-003, MIN-005).
 */
export function setupHttpLayer(params: HttpLayerSetupParams): http.Server {
  const { domainServices, bootstrapConfig, fileStorage, httpRateLimiter, getActiveSocketCount } = params;
  const { env, allowedOrigins, logger, port, distPath } = bootstrapConfig;

  const httpHandler = createHttpServer({
    roomStore: domainServices.roomStore,
    relayAddressService: domainServices.relayAddressService,
    logger,
    port,
    distPath,
    fileStorage,
    allowedOrigins,
    env,
    metricsSecret: env.METRICS_SECRET,
    rateLimiter: httpRateLimiter,
    getActiveSocketCount,
  });

  const server = http.createServer(httpHandler);
  server.requestTimeout = 30_000;
  server.headersTimeout = 31_000;
  server.keepAliveTimeout = 5_000;

  return server;
}

export interface BindHttpServerParams {
  server: http.Server;
  host: string;
  port: number;
}

/**
 * Binds HTTP server to target port and host with error listener cleanup (MAJ-009).
 */
export async function bindHttpServer(
  params: BindHttpServerParams,
): Promise<{ boundPort: number; boundUrl: string }> {
  const { server, host, port } = params;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const addr = server.address();
  const boundPort = addr && typeof addr === "object" ? addr.port : port;
  const boundUrl = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${boundPort}`;

  return { boundPort, boundUrl };
}

export interface CloseHandlerParams {
  server: http.Server;
  io: TypedSocketServer;
  logger: Logger;
  cleanupInterval: NodeJS.Timeout | TimerHandle;
  timerService?: ITimerService;
  timerRegistry: IDisconnectTimerRegistry;
  shutdownCoordinator: ShutdownCoordinator;
  rateLimiter: SocketRateLimiter;
  roomCreateRateLimiter: SocketRateLimiter;
  httpRateLimiter?: HttpRateLimiter;
}

/**
 * Creates programmatic close handle with timeout race and guaranteed timer release (MAJ-008).
 */
export function createCloseHandler(
  params: CloseHandlerParams,
): () => Promise<void> {
  const { server, io, logger, cleanupInterval, timerService, timerRegistry, shutdownCoordinator, rateLimiter, roomCreateRateLimiter, httpRateLimiter } = params;

  return async (): Promise<void> => {
    const closeCorrelationId = randomUUID();
    const closeStartTime = performance.now();
    logger.info("Fun Chess server closing...", {
      operation: "server_close",
      correlationId: closeCorrelationId,
    });

    let timer: NodeJS.Timeout | undefined;
    try {
      const closePromise = (async () => {
        if (timerService) {
          timerService.clearInterval(cleanupInterval);
        } else if (typeof cleanupInterval === "object" && "id" in cleanupInterval) {
          clearInterval((cleanupInterval as TimerHandle).id as NodeJS.Timeout);
        } else {
          clearInterval(cleanupInterval as NodeJS.Timeout);
        }
        timerRegistry.clear();
        clearAllDisconnectTimers();
        httpRateLimiter?.destroy();
        rateLimiter.destroy();
        roomCreateRateLimiter.destroy();
        shutdownCoordinator.dispose();

        if (typeof io.disconnectSockets === "function") {
          io.disconnectSockets(true);
        }

        await new Promise<void>((resolve, reject) => {
          io.close((err) => (err ? reject(err) : resolve()));
        });

        if (server.listening) {
          const sWithConn = server as http.Server & {
            closeIdleConnections?: () => void;
            closeAllConnections?: () => void;
          };
          sWithConn.closeIdleConnections?.();
          sWithConn.closeAllConnections?.();

          await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
          });
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Server close timed out after 5000ms"));
        }, 5000);
        timer.unref?.();
      });

      await Promise.race([closePromise, timeoutPromise]);

      const closeDuration = Math.round(performance.now() - closeStartTime);
      logger.info("Fun Chess server closed successfully", {
        operation: "server_close",
        correlationId: closeCorrelationId,
        status: "success",
        duration: closeDuration,
        durationMs: closeDuration,
      });
    } catch (err) {
      const closeDuration = Math.round(performance.now() - closeStartTime);
      logger.error("Fun Chess server close error", {
        operation: "server_close",
        correlationId: closeCorrelationId,
        status: "failed",
        duration: closeDuration,
        durationMs: closeDuration,
        error: serializeError(err),
      });
      throw err;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };
}

/**
 * Emits structured logging upon successful server startup (MAJ-031).
 */
export function logBootstrapSuccess(
  bootstrapConfig: ServerBootstrapConfig,
  relayAddressService: IRelayAddressService,
  boundPort: number,
): void {
  const { logger, bootstrapCorrelationId, startTime, isProduction, env } = bootstrapConfig;
  const addrInfo = relayAddressService.getAddressingInfo(boundPort);
  const duration = Math.round(performance.now() - startTime);

  logger.info("Fun Chess server started successfully", {
    operation: "server_bootstrap",
    correlationId: bootstrapCorrelationId,
    status: "success",
    duration,
    durationMs: duration,
    port: boundPort,
    relayMode: addrInfo.relayMode,
    isCloudRelay: addrInfo.isCloudRelay,
    lanIp: addrInfo.lanIp,
    joinUrl: addrInfo.joinUrl,
    publicUrl: addrInfo.publicUrl,
    localUrl: addrInfo.localUrl,
  });

  if (!isProduction && env.NODE_ENV !== "test" && Boolean(process.stdout.isTTY)) {
    logger.info("Fun Chess server ready", {
      operation: "server_banner",
      correlationId: bootstrapCorrelationId,
      relayMode: addrInfo.relayMode,
      localUrl: addrInfo.localUrl,
      joinUrl: addrInfo.joinUrl,
      publicUrl: addrInfo.publicUrl,
    });
  }
}

export const FALLBACK_LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
] as const;

export type FallbackLogLevel = (typeof FALLBACK_LOG_LEVELS)[number];

/**
 * Safely parses and validates an unknown log level string against the allowed log levels.
 * Returns the matching FallbackLogLevel or defaults to "info" on invalid or missing values (ENH-001).
 */
export function parseFallbackLogLevel(rawLevel: unknown): FallbackLogLevel {
  if (typeof rawLevel !== "string") {
    return "info";
  }
  const normalized = rawLevel.trim().toLowerCase();
  return (FALLBACK_LOG_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as FallbackLogLevel)
    : "info";
}
