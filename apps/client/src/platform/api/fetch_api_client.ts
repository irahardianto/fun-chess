import type { IApiClient, ApiRequestOptions, ApiResponse } from './api_client.interface';
import {
  LanInfoResponseSchema,
  HealthCheckResponseSchema,
  type LanInfoResponse,
  type HealthCheckResponse,
} from '@fun-chess/shared';
import { generateCorrelationId, logger as defaultLogger, type ILogger } from '../telemetry';

export class FetchApiClient implements IApiClient {
  constructor(
    private readonly baseUrl: string = '',
    private readonly logger: ILogger = defaultLogger
  ) {}

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

  private getSafeSignal(signal: AbortSignal): AbortSignal | undefined {
    const isMock =
      typeof (globalThis.fetch as unknown as { mock?: unknown })?.mock === 'object';
    if (isMock) {
      return signal;
    }

    try {
      new Request('http://localhost', { signal });
      return signal;
    } catch {
      return undefined;
    }
  }

  private resolveUrl(url: string): string {
    if (this.baseUrl) {
      return `${this.baseUrl}${url}`;
    }
    if (
      typeof window !== 'undefined' &&
      window.location?.origin &&
      window.location.origin !== 'null' &&
      url.startsWith('/')
    ) {
      return `${window.location.origin}${url}`;
    }
    return url;
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
    const startTime = Date.now();
    const fullUrl = this.resolveUrl(url);

    this.logger.info('HTTP request started', {
      operation: 'http_request',
      method: 'GET',
      url: fullUrl,
      correlationId,
    });

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Correlation-ID': correlationId,
          ...options.headers,
        },
        signal: this.getSafeSignal(signal),
      });
      const data = await this.parseResponseBody<T>(response);

      this.logger.info('HTTP request completed', {
        operation: 'http_request',
        method: 'GET',
        url: fullUrl,
        status: response?.status ?? 0,
        correlationId,
        duration: Date.now() - startTime,
      });

      return { data, status: response?.status ?? 0, ok: response?.ok ?? false };
    } catch (err) {
      this.logger.error('HTTP request failed', {
        operation: 'http_request',
        method: 'GET',
        url: fullUrl,
        correlationId,
        duration: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      cleanup();
    }
  }

  async post<T>(url: string, body?: unknown, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const { signal, cleanup } = this.createTimeoutSignal(options.timeoutMs ?? 3000, options.signal);
    const correlationId = options.correlationId ?? generateCorrelationId();
    const startTime = Date.now();
    const fullUrl = this.resolveUrl(url);

    this.logger.info('HTTP request started', {
      operation: 'http_request',
      method: 'POST',
      url: fullUrl,
      correlationId,
    });

    try {
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Correlation-ID': correlationId,
          ...options.headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: this.getSafeSignal(signal),
      });
      const data = await this.parseResponseBody<T>(response);

      this.logger.info('HTTP request completed', {
        operation: 'http_request',
        method: 'POST',
        url: fullUrl,
        status: response?.status ?? 0,
        correlationId,
        duration: Date.now() - startTime,
      });

      return { data, status: response?.status ?? 0, ok: response?.ok ?? false };
    } catch (err) {
      this.logger.error('HTTP request failed', {
        operation: 'http_request',
        method: 'POST',
        url: fullUrl,
        correlationId,
        duration: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
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
    const startTime = Date.now();

    this.logger.info('Connectivity probe started', {
      operation: 'check_connectivity',
      probeUrl,
      correlationId,
    });

    try {
      const fullUrl = this.resolveUrl(probeUrl);
      const res = await fetch(`${fullUrl}?_t=${Date.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
        headers: {
          'X-Correlation-ID': correlationId,
          ...options.headers,
        },
        signal: this.getSafeSignal(signal),
      });

      this.logger.info('Connectivity probe completed', {
        operation: 'check_connectivity',
        probeUrl,
        correlationId,
        ok: res.ok,
        duration: Date.now() - startTime,
      });

      return res.ok;
    } catch (err) {
      this.logger.warn('Connectivity probe failed', {
        operation: 'check_connectivity',
        probeUrl,
        correlationId,
        duration: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      cleanup();
    }
  }
}

