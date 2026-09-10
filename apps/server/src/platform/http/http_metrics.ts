import { monitorEventLoopDelay } from "node:perf_hooks";

export const HISTOGRAM_BUCKETS = [
  0.005,
  0.01,
  0.025,
  0.05,
  0.1,
  0.25,
  0.5,
  1.0,
  2.5,
  5.0,
  10.0,
] as const;

let eventLoopLagHistogram: { enable: () => void; mean: number } | undefined;
try {
  if (typeof monitorEventLoopDelay === "function") {
    eventLoopLagHistogram = monitorEventLoopDelay({ resolution: 20 });
    eventLoopLagHistogram.enable();
  }
} catch (err: unknown) {
  void err; // Graceful fallback if unsupported in testing runtime
}

/**
 * Normalizes HTTP route paths to prevent high-cardinality label explosions in metrics (MAJ-014).
 */
export function normalizeMetricPath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";

  // Exact canonical endpoints
  if (
    pathname === "/ready" ||
    pathname === "/healthz" ||
    pathname === "/health" ||
    pathname === "/api/v1/health" ||
    pathname === "/api/health" ||
    pathname === "/metrics" ||
    pathname === "/health/detail" ||
    pathname === "/api/v1/lan-info" ||
    pathname === "/api/lan-info"
  ) {
    return pathname;
  }

  // Dynamic room paths
  if (pathname.startsWith("/api/v1/rooms/")) {
    return "/api/v1/rooms/:roomCode";
  }

  // Static assets
  if (
    pathname.startsWith("/assets/") ||
    /\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|mp3|wav|ogg|webmanifest|json)$/i.test(
      pathname,
    )
  ) {
    return "/assets/*";
  }

  return pathname;
}

export interface MetricObservation {
  method: string;
  path: string;
  statusCode: number;
  durationSeconds?: number;
  durationMs?: number;
  errorCode?: string;
}

/**
 * In-memory collector for RED (Rate, Errors, Duration) HTTP metrics (MAJ-014).
 * Formats metrics in standard Prometheus / OpenMetrics text exposition format.
 */
export class HttpMetricsCollector {
  private readonly requestCounts = new Map<string, number>();
  private readonly failedRequestCounts = new Map<string, number>();
  private readonly durationBuckets = new Map<string, Map<number, number>>();
  private readonly durationSums = new Map<string, number>();
  private readonly durationCounts = new Map<string, number>();

  private totalRequests = 0;
  private totalFailures = 0;

  /**
   * Records an HTTP request observation into the RED metrics store.
   */
  public recordRequest(observation: MetricObservation): void {
    const { method, path, statusCode, errorCode } = observation;
    const durationSeconds =
      observation.durationSeconds ??
      (observation.durationMs !== undefined ? observation.durationMs / 1000 : 0);
    const normalizedPath = normalizeMetricPath(path);

    this.totalRequests++;
    const isError = statusCode >= 400;
    if (isError) {
      this.totalFailures++;
    }

    // 1. Counter: http_requests_total{method,path,status}
    const requestKey = `${method}|${normalizedPath}|${statusCode}`;
    this.requestCounts.set(requestKey, (this.requestCounts.get(requestKey) ?? 0) + 1);

    // 2. Counter: http_requests_failed_total{method,path,error_code}
    if (isError) {
      const errCode = errorCode ?? (statusCode === 404 ? "ERR_NOT_FOUND" : `HTTP_${statusCode}`);
      const failedKey = `${method}|${normalizedPath}|${errCode}`;
      this.failedRequestCounts.set(
        failedKey,
        (this.failedRequestCounts.get(failedKey) ?? 0) + 1,
      );
    }

    // 3. Histogram: http_request_duration_seconds
    const histKey = `${method}|${normalizedPath}`;
    let buckets = this.durationBuckets.get(histKey);
    if (!buckets) {
      buckets = new Map<number, number>();
      for (const le of HISTOGRAM_BUCKETS) {
        buckets.set(le, 0);
      }
      this.durationBuckets.set(histKey, buckets);
    }

    for (const le of HISTOGRAM_BUCKETS) {
      if (durationSeconds <= le) {
        buckets.set(le, (buckets.get(le) ?? 0) + 1);
      }
    }

    this.durationSums.set(
      histKey,
      (this.durationSums.get(histKey) ?? 0) + durationSeconds,
    );
    this.durationCounts.set(
      histKey,
      (this.durationCounts.get(histKey) ?? 0) + 1,
    );
  }

  /**
   * Computes current rolling error rate percentage: (failures / total) * 100.
   */
  public getErrorRate(): number {
    if (this.totalRequests === 0) return 0;
    const rate = (this.totalFailures / this.totalRequests) * 100;
    return Math.round(rate * 100) / 100;
  }

  /**
   * Resets all metric counters and histograms (for testing).
   */
  public reset(): void {
    this.requestCounts.clear();
    this.failedRequestCounts.clear();
    this.durationBuckets.clear();
    this.durationSums.clear();
    this.durationCounts.clear();
    this.totalRequests = 0;
    this.totalFailures = 0;
  }

  /**
   * Serializes current metric state to standard Prometheus / OpenMetrics text exposition format.
   */
  public toPrometheusFormat(params: {
    activeRooms: number;
    activeSockets: number;
    eventLoopLagSeconds?: number;
  }): string {
    const lines: string[] = [];

    // http_requests_total
    lines.push("# HELP http_requests_total Total number of HTTP requests processed.");
    lines.push("# TYPE http_requests_total counter");
    for (const [key, count] of this.requestCounts.entries()) {
      const [m, p, s] = key.split("|");
      lines.push(`http_requests_total{method="${m}",path="${p}",status="${s}"} ${count}`);
    }

    // http_request_duration_seconds
    lines.push("");
    lines.push("# HELP http_request_duration_seconds HTTP request latency in seconds.");
    lines.push("# TYPE http_request_duration_seconds histogram");
    for (const [histKey, buckets] of this.durationBuckets.entries()) {
      const [m, p] = histKey.split("|");
      const count = this.durationCounts.get(histKey) ?? 0;
      const sum = this.durationSums.get(histKey) ?? 0;

      for (const le of HISTOGRAM_BUCKETS) {
        const bucketCount = buckets.get(le) ?? 0;
        lines.push(
          `http_request_duration_seconds_bucket{le="${le}",method="${m}",path="${p}"} ${bucketCount}`,
        );
      }
      lines.push(
        `http_request_duration_seconds_bucket{le="+Inf",method="${m}",path="${p}"} ${count}`,
      );
      lines.push(
        `http_request_duration_seconds_sum{method="${m}",path="${p}"} ${sum.toFixed(4)}`,
      );
      lines.push(
        `http_request_duration_seconds_count{method="${m}",path="${p}"} ${count}`,
      );
    }

    // http_requests_failed_total
    lines.push("");
    lines.push("# HELP http_requests_failed_total Total number of failed HTTP requests.");
    lines.push("# TYPE http_requests_failed_total counter");
    for (const [key, count] of this.failedRequestCounts.entries()) {
      const [m, p, errCode] = key.split("|");
      lines.push(
        `http_requests_failed_total{method="${m}",path="${p}",error_code="${errCode}"} ${count}`,
      );
    }

    // Gauges
    lines.push("");
    lines.push("# HELP active_rooms Number of currently active chess rooms in memory.");
    lines.push("# TYPE active_rooms gauge");
    lines.push(`active_rooms ${params.activeRooms}`);

    lines.push("");
    lines.push("# HELP active_connections Number of active client connections.");
    lines.push("# TYPE active_connections gauge");
    lines.push(`active_connections{transport="websocket"} ${params.activeSockets}`);

    lines.push("");
    lines.push("# HELP error_rate Rolling percentage of failed HTTP requests.");
    lines.push("# TYPE error_rate gauge");
    lines.push(`error_rate ${this.getErrorRate()}`);

    const lag =
      params.eventLoopLagSeconds ??
      (eventLoopLagHistogram ? eventLoopLagHistogram.mean / 1e9 : 0.001);
    const validLag = isNaN(lag) || lag < 0 ? 0.0 : lag;
    lines.push("");
    lines.push("# HELP nodejs_eventloop_lag_seconds Current event loop lag in seconds.");
    lines.push("# TYPE nodejs_eventloop_lag_seconds gauge");
    lines.push(`nodejs_eventloop_lag_seconds ${validLag.toFixed(6)}`);

    const mem = process.memoryUsage();
    lines.push("");
    lines.push("# HELP process_resident_memory_bytes Resident memory size in bytes.");
    lines.push("# TYPE process_resident_memory_bytes gauge");
    lines.push(`process_resident_memory_bytes ${mem.rss}`);

    lines.push("");
    lines.push("# HELP process_heap_bytes Heap memory usage in bytes.");
    lines.push("# TYPE process_heap_bytes gauge");
    lines.push(`process_heap_bytes{type="total"} ${mem.heapTotal}`);
    lines.push(`process_heap_bytes{type="used"} ${mem.heapUsed}`);

    return lines.join("\n") + "\n";
  }
}

export const globalMetricsCollector = new HttpMetricsCollector();
