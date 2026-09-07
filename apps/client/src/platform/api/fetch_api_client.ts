import type { IApiClient, ApiRequestOptions, ApiResponse } from './api_client.interface';
import {
  LanInfoResponseSchema,
  HealthCheckResponseSchema,
  type LanInfoResponse,
  type HealthCheckResponse,
} from '@fun-chess/shared';
import { generateCorrelationId } from '../telemetry';

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

    let onAbort: (() => void) | undefined;

    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort(callerSignal.reason);
      } else {
        onAbort = () => controller.abort(callerSignal.reason);
        callerSignal.addEventListener('abort', onAbort, {
          once: true,
        });
      }
    }

    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timeoutId);
        if (callerSignal && onAbort) {
          callerSignal.removeEventListener('abort', onAbort);
        }
      },
    };
  }

  private async parseResponseBody<T>(response: Response): Promise<T> {
    if (!response) {
      return null as T;
    }
    if (response.status === 204) {
      return null as T;
    }

    const contentType = response.headers?.get?.('content-type') ?? '';
    const hasContentType = Boolean(contentType);
    const isJson = contentType.includes('json');

    if (hasContentType && !isJson) {
      const text = typeof response.text === 'function' ? await response.text() : null;
      return (text ? (text as unknown as T) : (null as T));
    }

    if (typeof response.json === 'function') {
      try {
        return await response.json();
      } catch {
        if (typeof response.text === 'function') {
          const text = await response.text();
          return (text ? (text as unknown as T) : (null as T));
        }
        return null as T;
      }
    }

    if (typeof response.text === 'function') {
      const text = await response.text();
      return (text ? (text as unknown as T) : (null as T));
    }

    return null as T;
  }

  async get<T>(url: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const { signal, cleanup } = this.createTimeoutSignal(options.timeoutMs ?? 3000, options.signal);
    const correlationId = options.correlationId ?? generateCorrelationId();
    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Correlation-ID': correlationId,
          ...options.headers,
        },
        signal,
      });
      const data = await this.parseResponseBody<T>(response);
      return { data, status: response?.status ?? 0, ok: response?.ok ?? false };
    } finally {
      cleanup();
    }
  }

  async post<T>(url: string, body?: unknown, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const { signal, cleanup } = this.createTimeoutSignal(options.timeoutMs ?? 3000, options.signal);
    const correlationId = options.correlationId ?? generateCorrelationId();
    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Correlation-ID': correlationId,
          ...options.headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
      const data = await this.parseResponseBody<T>(response);
      return { data, status: response?.status ?? 0, ok: response?.ok ?? false };
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
    const correlationId = options.correlationId ?? generateCorrelationId();
    try {
      const res = await fetch(`${probeUrl}?_t=${Date.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
        headers: {
          'X-Correlation-ID': correlationId,
          ...options.headers,
        },
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
