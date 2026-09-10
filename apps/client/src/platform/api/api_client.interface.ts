import type {
  LanInfoResponse,
  LivenessHealthResponse,
  DetailedHealthResponse,
} from '@fun-chess/shared';

export interface ApiRequestOptions {
  /** Request timeout in milliseconds. Defaults to 3000ms. */
  timeoutMs?: number;
  /** Optional custom AbortSignal to cancel requests from callers */
  signal?: AbortSignal;
  /** Custom request headers */
  headers?: Record<string, string>;
  /** Optional correlation ID for tracing across client and server */
  correlationId?: string;
  /** Optional bearer authentication token for protected endpoints (ENH-007) */
  authToken?: string;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  ok: boolean;
}

/**
 * Contract for the centralized HTTP API client used across client composables and features.
 * Provides typed REST ingress methods, networking discovery, and server health probes.
 *
 * NOTE ON TRANSPORT ARCHITECTURE (MAJ-008):
 * Fun Chess server uses HTTP strictly for queries, discovery, and health probes (GET/HEAD).
 * All game and room mutations (room creation, joins, moves, resignations) occur
 * exclusively via TypedSocket (Socket.IO).
 *
 * Note on health endpoints (ENH-016):
 * The server exposes `/api/health` and `/health` as equivalent endpoints serving
 * identical LivenessHealthResponse payloads.
 */
export interface IApiClient {
  /** Performs GET request with timeout and error handling */
  get<T>(url: string, options?: ApiRequestOptions): Promise<ApiResponse<T>>;

  /**
   * Discovers LAN networking information from server at /api/v1/lan-info (MAJ-009, MIN-010).
   */
  getLanInfo(options?: ApiRequestOptions): Promise<LanInfoResponse>;

  /**
   * Lightweight health probe targeting server liveness (CRIT-001, ENH-016).
   *
   * Note: The server exposes `/api/health` and `/health` as equivalent endpoints
   * returning identical {@link LivenessHealthResponse} payloads. Either path can be used
   * interchangeably for liveness probing and monitoring.
   *
   * @param options - Optional HTTP request options including timeoutMs, signal, headers, and correlationId.
   * @returns Promise resolving to the validated LivenessHealthResponse object.
   */
  checkHealth(options?: ApiRequestOptions): Promise<LivenessHealthResponse>;

  /** Deep telemetry probe targeting /health/detail (CRIT-001) */
  getDetailedHealth(options?: ApiRequestOptions): Promise<DetailedHealthResponse>;

  /** Verifies network connectivity via light probe HEAD request */
  checkConnectivity(probeUrl?: string, options?: ApiRequestOptions): Promise<boolean>;

  /**
   * Performs a POST request with an optional JSON-serializable body, timeout handling,
   * and correlation tracking.
   *
   * @deprecated Server exposes zero POST endpoints (MAJ-008). All mutations must use WebSocket events.
   * @template T - Expected type of the parsed response payload.
   * @param url - Target endpoint URL or path relative to baseUrl.
   * @param body - Optional JSON-serializable request payload sent in the HTTP request body.
   * @param options - Request options including timeoutMs, signal, headers, and correlationId.
   * @returns Promise resolving to an ApiResponse containing parsed data, HTTP status code, and ok flag.
   */
  post<T>(url: string, body?: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>>;
}
