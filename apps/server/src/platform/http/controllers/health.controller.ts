import { createHash, timingSafeEqual } from "node:crypto";
import {
  LivenessHealthResponse,
  DetailedHealthResponse,
} from "@fun-chess/shared";
import { IRoomCountProvider, IAddressingInfoProvider } from "../http.interface.js";
import { normalizeIp } from "../ip_utils.js";
import {
  HttpMetricsCollector,
  globalMetricsCollector,
} from "../http_metrics.js";

export interface ReadinessResponse {
  readonly status: "ready" | "terminating" | "unhealthy";
  readonly ready: boolean;
  readonly reason?: string;
}

export interface HealthPayload {
  readonly status: "ok" | "degraded" | "terminating";
  readonly uptimeSeconds: number;
  readonly timestamp: string;
  readonly version?: string;
}

export interface HealthControllerOptions {
  roomStore: IRoomCountProvider;
  addressService: IAddressingInfoProvider;
  port: number;
  getActiveSocketCount: () => number;
  isProduction?: boolean;
  startTime?: number;
  shutdownCoordinator?: { isTerminating?: boolean; isShuttingDown?: boolean };
  metricsCollector?: HttpMetricsCollector;
}

export interface TelemetryAuthParams {
  clientIp: string;
  headers: Record<string, string | string[] | undefined>;
  metricsSecret?: string;
  isProduction: boolean;
  directSocketIp?: string;
}

/**
 * Compares two strings in constant time using SHA-256 digests to prevent timing attacks (MIN-001).
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function isLoopbackAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  const normalized = normalizeIp(ip);
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "localhost"
  );
}

/**
 * Validates whether an incoming HTTP request is authorized to access operational telemetry (/metrics, /health/detail).
 * Access requires direct loopback TCP connection, valid METRICS_SECRET via header, or non-production environment (MAJ-002, CRIT-001, MIN-001).
 *
 * Security requirements:
 * 1. Loopback access is only granted if the physical TCP connection (directSocketIp) is loopback
 *    AND untrusted forwarded headers (x-forwarded-for, x-real-ip) are absent (CRIT-001).
 * 2. Secret token matching uses constant-time crypto.timingSafeEqual (MIN-001).
 * 3. In non-production, access is open only when metricsSecret is not configured.
 */
export function isTelemetryAuthorized(params: TelemetryAuthParams): boolean {
  const { clientIp, headers, metricsSecret, isProduction, directSocketIp } = params;

  // 1. Direct Loopback check
  const isDirectSocketLoopback =
    directSocketIp !== undefined ? isLoopbackAddress(directSocketIp) : true;

  // Untrusted forwarded headers without direct socket verification cannot grant loopback access (CRIT-001)
  const isUntrustedForwarding =
    directSocketIp === undefined &&
    Boolean(headers["x-forwarded-for"] || headers["x-real-ip"]);

  const isLoopback =
    !isUntrustedForwarding &&
    isLoopbackAddress(clientIp) &&
    isDirectSocketLoopback;

  if (isLoopback) return true;

  // 2. Secret token match (constant-time comparison MIN-001)
  if (metricsSecret) {
    const rawSecretHeader = headers["x-metrics-secret"];
    const secretHeader = Array.isArray(rawSecretHeader)
      ? rawSecretHeader[0]
      : rawSecretHeader;
    if (typeof secretHeader === "string" && timingSafeStringEqual(secretHeader, metricsSecret)) {
      return true;
    }

    const rawAuth = headers["authorization"];
    const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (timingSafeStringEqual(token, metricsSecret)) {
        return true;
      }
    }
    return false;
  }

  // 3. Permitted in non-production if no secret configured
  return !isProduction;
}

/**
 * Controller for container health checks and operational telemetry (MIN-029).
 * Exposes /ready, /api/v1/health, and Prometheus format /metrics (MAJ-013, MAJ-014, MIN-023).
 * Redacts process memory metrics in production to prevent information disclosure (MIN-001).
 */
export class HealthController {
  private readonly roomStore: IRoomCountProvider;
  private readonly addressService: IAddressingInfoProvider;
  private readonly port: number;
  private readonly getActiveSocketCount: () => number;
  private readonly isProduction: boolean;
  private readonly startTime: number;
  private shutdownCoordinator?: { isTerminating?: boolean; isShuttingDown?: boolean };
  private readonly metricsCollector: HttpMetricsCollector;

  constructor(options: HealthControllerOptions) {
    this.roomStore = options.roomStore;
    this.addressService = options.addressService;
    this.port = options.port;
    this.getActiveSocketCount = options.getActiveSocketCount;
    this.isProduction = options.isProduction ?? false;
    this.startTime = options.startTime ?? Date.now();
    this.shutdownCoordinator = options.shutdownCoordinator;
    this.metricsCollector = options.metricsCollector ?? globalMetricsCollector;
  }

  /**
   * Updates or wires the shutdown coordinator handle dynamically (BLK-01).
   */
  public setShutdownCoordinator(
    coordinator?: { isTerminating?: boolean; isShuttingDown?: boolean },
  ): void {
    this.shutdownCoordinator = coordinator;
  }

  /**
   * Evaluates container readiness for Kubernetes / Cloud Run /ready probe (MAJ-013, BLK-01).
   * Degrades to 503 terminating when shutdown sequence is initiated.
   */
  public getReadiness(): ReadinessResponse {
    const isTerminating =
      this.shutdownCoordinator?.isShuttingDown === true ||
      this.shutdownCoordinator?.isTerminating === true;
    if (isTerminating) {
      return { status: "terminating", ready: false };
    }
    return { status: "ready", ready: true };
  }

  /**
   * Alias for getReadiness() matching standard /ready probe controller convention (BLK-01).
   */
  public getReady(): ReadinessResponse {
    return this.getReadiness();
  }

  /**
   * Returns canonical versioned application health inside uniform { data: HealthPayload } envelope (MIN-023).
   */
  public getApiV1Health(): { data: HealthPayload } {
    const isTerminating =
      this.shutdownCoordinator?.isShuttingDown === true ||
      this.shutdownCoordinator?.isTerminating === true;
    return {
      data: {
        status: isTerminating ? "terminating" : "ok",
        uptimeSeconds: Math.round((Date.now() - this.startTime) / 100) / 10,
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
    };
  }

  public getLiveness(): LivenessHealthResponse {
    return {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 100) / 10,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generates OpenMetrics / Prometheus text representation for GET /metrics (MAJ-014).
   */
  public async getPrometheusMetrics(): Promise<string> {
    const activeRooms = await this.roomStore.count();
    const activeSockets = this.getActiveSocketCount();
    return this.metricsCollector.toPrometheusFormat({
      activeRooms,
      activeSockets,
    });
  }

  public async getDetailedHealth(): Promise<DetailedHealthResponse> {
    const mem = process.memoryUsage();
    const activeRooms = await this.roomStore.count();
    const activeSockets = this.getActiveSocketCount();
    const isCloud = this.addressService.isCloudRelay
      ? this.addressService.isCloudRelay()
      : false;
    const addrInfo = this.addressService.getAddressingInfo(this.port);

    // Redact process memory internals on unauthenticated endpoint in production (MIN-001)
    const memoryUsageMb = this.isProduction
      ? { rss: 0, heapTotal: 0, heapUsed: 0 }
      : {
          rss: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
          heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
          heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
        };

    return {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 100) / 10,
      timestamp: new Date().toISOString(),
      activeRooms,
      activeSockets,
      memoryUsageMb,
      relay: {
        mode: isCloud ? "cloud" : "lan",
        ...(addrInfo.publicUrl ? { publicUrl: addrInfo.publicUrl } : {}),
      },
    };
  }

  public async getHealth(): Promise<DetailedHealthResponse> {
    return this.getDetailedHealth();
  }
}
