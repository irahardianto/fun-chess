import type { LanInfoResponse, HealthCheckResponse } from '@fun-chess/shared';

export interface ApiRequestOptions {
  /** Request timeout in milliseconds. Defaults to 3000ms. */
  timeoutMs?: number;
  /** Optional custom AbortSignal to cancel requests from callers */
  signal?: AbortSignal;
  /** Custom request headers */
  headers?: Record<string, string>;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  ok: boolean;
}

export interface IApiClient {
  /** Performs GET request with timeout and error handling */
  get<T>(url: string, options?: ApiRequestOptions): Promise<ApiResponse<T>>;

  /** Performs POST request with JSON body and timeout */
  post<T>(url: string, body?: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>>;

  /** Discovers LAN networking information from server */
  getLanInfo(options?: ApiRequestOptions): Promise<LanInfoResponse>;

  /** Queries operational health telemetry */
  checkHealth(options?: ApiRequestOptions): Promise<HealthCheckResponse>;

  /** Verifies network connectivity via light probe HEAD request */
  checkConnectivity(probeUrl?: string, options?: ApiRequestOptions): Promise<boolean>;
}
