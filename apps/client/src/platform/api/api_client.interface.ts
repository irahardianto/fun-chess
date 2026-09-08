import type { LanInfoResponse, HealthCheckResponse } from '@fun-chess/shared';

export interface ApiRequestOptions {
  /** Request timeout in milliseconds. Defaults to 3000ms. */
  timeoutMs?: number;
  /** Optional custom AbortSignal to cancel requests from callers */
  signal?: AbortSignal;
  /** Custom request headers */
  headers?: Record<string, string>;
  /** Optional correlation ID for tracing across client and server */
  correlationId?: string;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  ok: boolean;
}

export interface IApiClient {
  /** Performs GET request with timeout and error handling */
  get<T>(url: string, options?: ApiRequestOptions): Promise<ApiResponse<T>>;

  /**
   * Performs a POST request with an optional JSON-serializable body, timeout handling,
   * and correlation tracking.
   *
   * @template T - Expected type of the parsed response payload.
   * @param url - Target endpoint URL or path relative to baseUrl.
   * @param body - Optional JSON-serializable request payload sent in the HTTP request body.
   * @param options - Request options including timeoutMs, signal, headers, and correlationId.
   * @returns Promise resolving to an ApiResponse containing parsed data, HTTP status code, and ok flag.
   */
  post<T>(url: string, body?: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>>;

  /** Discovers LAN networking information from server */
  getLanInfo(options?: ApiRequestOptions): Promise<LanInfoResponse>;

  /** Queries operational health telemetry */
  checkHealth(options?: ApiRequestOptions): Promise<HealthCheckResponse>;

  /** Verifies network connectivity via light probe HEAD request */
  checkConnectivity(probeUrl?: string, options?: ApiRequestOptions): Promise<boolean>;
}
