import type { IApiClient, ApiRequestOptions, ApiResponse } from './api_client.interface';
import {
  LanInfoResponseSchema,
  HealthCheckResponseSchema,
  type LanInfoResponse,
  type HealthCheckResponse,
} from '@fun-chess/shared';

export class FetchApiClient implements IApiClient {
  constructor(private readonly baseUrl: string = '') {}

  private createTimeoutSignal(
    timeoutMs: number = 3000,
    callerSignal?: AbortSignal
  ): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort(callerSignal.reason);
      } else {
        callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), {
          once: true,
        });
      }
    }

    return {
      signal: controller.signal,
      cleanup: () => clearTimeout(timeoutId),
    };
  }

  async get<T>(url: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const { signal, cleanup } = this.createTimeoutSignal(options.timeoutMs ?? 3000, options.signal);
    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        method: 'GET',
        headers: { Accept: 'application/json', ...options.headers },
        signal,
      });
      const data = response.status === 204 ? (null as T) : await response.json();
      return { data, status: response.status, ok: response.ok };
    } finally {
      cleanup();
    }
  }

  async post<T>(url: string, body?: unknown, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const { signal, cleanup } = this.createTimeoutSignal(options.timeoutMs ?? 3000, options.signal);
    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...options.headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
      const data = response.status === 204 ? (null as T) : await response.json();
      return { data, status: response.status, ok: response.ok };
    } finally {
      cleanup();
    }
  }

  async getLanInfo(options?: ApiRequestOptions): Promise<LanInfoResponse> {
    const res = await this.get<unknown>('/api/lan-info', options);
    if (!res.ok) throw new Error(`Failed to fetch LAN info: HTTP ${res.status}`);
    return LanInfoResponseSchema.parse(res.data);
  }

  async checkHealth(options?: ApiRequestOptions): Promise<HealthCheckResponse> {
    const res = await this.get<unknown>('/health', options);
    if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
    return HealthCheckResponseSchema.parse(res.data);
  }

  async checkConnectivity(
    probeUrl: string = '/favicon.svg',
    options: ApiRequestOptions = {}
  ): Promise<boolean> {
    const { signal, cleanup } = this.createTimeoutSignal(options.timeoutMs ?? 2000, options.signal);
    try {
      const res = await fetch(`${probeUrl}?_t=${Date.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
        signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      cleanup();
    }
  }
}
