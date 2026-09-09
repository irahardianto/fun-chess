import type { IApiClient, ApiRequestOptions, ApiResponse } from './api_client.interface';
import {
  LanInfoResponseSchema,
  LivenessHealthResponseSchema,
  DetailedHealthResponseSchema,
  HttpErrorEnvelopeSchema,
  type LanInfoResponse,
  type LivenessHealthResponse,
  type DetailedHealthResponse,
  type IClock,
} from '@fun-chess/shared';
import { SystemClock } from '../time';
import { generateCorrelationId, logger as defaultLogger, type ILogger } from '../telemetry';

/**
 * Typed client API error carrying HTTP status, structured error code,
 * correlation ID, and optional diagnostic details (MAJ-022).
 */
export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly correlationId: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code: string,
    correlationId: string,
    details?: unknown
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
    this.details = details;

    Object.setPrototypeOf(this, ApiClientError.prototype);
  }
}

export class FetchApiClient implements IApiClient {
  private readonly clock: IClock;

  constructor(
    private readonly baseUrl: string = '',
    private readonly logger: ILogger = defaultLogger,
    clock?: IClock
  ) {
    this.clock = clock ?? new SystemClock();
  }

  private handleResponseError(
    res: ApiResponse<unknown>,
    defaultMessagePrefix: string,
    fallbackCorrelationId: string = ''
  ): never {
    const parseResult = HttpErrorEnvelopeSchema.safeParse(res.data);
    if (parseResult.success) {
      const envelope = parseResult.data;
      const correlationId = envelope.error.correlationId || fallbackCorrelationId;
      throw new ApiClientError(
        envelope.error.message,
        res.status,
        envelope.error.code,
        correlationId,
        envelope.error.details
      );
    }

    throw new ApiClientError(
      `${defaultMessagePrefix}: HTTP ${res.status}`,
      res.status,
      `HTTP_${res.status}`,
      fallbackCorrelationId,
      res.data
    );
  }

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
    } catch (error) {
      this.logger.debug('AbortSignal unsupported by Request', {
        operation: 'get_safe_signal',
        error: error instanceof Error ? error.message : String(error),
      });
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
    if (!response || response.status === 204) {
      return null as T;
    }

    const contentType = response.headers?.get?.('content-type') ?? '';
    const isJson = !contentType || contentType.includes('json');

    if (typeof response.text === 'function') {
      const text = await response.text();
      if (!text) {
        return null as T;
      }
      if (isJson) {
        try {
          return JSON.parse(text) as T;
        } catch (err) {
          this.logger.warn('Failed to parse JSON response body', {
            operation: 'http_parse_body',
            error: err instanceof Error ? err.message : String(err),
          });
          return text as unknown as T;
        }
      }
      return text as unknown as T;
    }

    if (typeof response.json === 'function') {
      try {
        return await response.json();
      } catch (err) {
        this.logger.warn('Failed to parse JSON response body', {
          operation: 'http_parse_body',
          error: err instanceof Error ? err.message : String(err),
        });
        return null as T;
      }
    }

    return null as T;
  }

  async get<T>(url: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const { signal, cleanup } = this.createTimeoutSignal(options.timeoutMs ?? 3000, options.signal);
    const correlationId = options.correlationId ?? generateCorrelationId();
    const startTime = this.clock.now();
    const fullUrl = this.resolveUrl(url);
    const sanitizedUrl = fullUrl.split('?')[0] ?? fullUrl;

    this.logger.info('HTTP request started', {
      operation: 'http_request',
      method: 'GET',
      url: sanitizedUrl,
      correlationId,
    });

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Correlation-ID': correlationId,
          ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
          ...options.headers,
        },
        signal: this.getSafeSignal(signal),
      });
      const data = await this.parseResponseBody<T>(response);

      const durationMs = this.clock.now() - startTime;
      this.logger.info('HTTP request completed', {
        operation: 'http_request',
        method: 'GET',
        url: sanitizedUrl,
        status: response?.status ?? 0,
        correlationId,
        duration: durationMs,
        durationMs,
      });

      return { data, status: response?.status ?? 0, ok: response?.ok ?? false };
    } catch (err) {
      const durationMs = this.clock.now() - startTime;
      this.logger.error('HTTP request failed', {
        operation: 'http_request',
        method: 'GET',
        url: sanitizedUrl,
        correlationId,
        duration: durationMs,
        durationMs,
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
    const startTime = this.clock.now();
    const fullUrl = this.resolveUrl(url);
    const sanitizedUrl = fullUrl.split('?')[0] ?? fullUrl;

    this.logger.info('HTTP request started', {
      operation: 'http_request',
      method: 'POST',
      url: sanitizedUrl,
      correlationId,
    });

    try {
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Correlation-ID': correlationId,
          ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
          ...options.headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: this.getSafeSignal(signal),
      });
      const data = await this.parseResponseBody<T>(response);

      const durationMs = this.clock.now() - startTime;
      this.logger.info('HTTP request completed', {
        operation: 'http_request',
        method: 'POST',
        url: sanitizedUrl,
        status: response?.status ?? 0,
        correlationId,
        duration: durationMs,
        durationMs,
      });

      return { data, status: response?.status ?? 0, ok: response?.ok ?? false };
    } catch (err) {
      const durationMs = this.clock.now() - startTime;
      this.logger.error('HTTP request failed', {
        operation: 'http_request',
        method: 'POST',
        url: sanitizedUrl,
        correlationId,
        duration: durationMs,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      cleanup();
    }
  }

  async getLanInfo(options?: ApiRequestOptions): Promise<LanInfoResponse> {
    const res = await this.get<unknown>('/api/lan-info', options);
    if (!res.ok) {
      this.handleResponseError(res, 'Failed to fetch LAN info', options?.correlationId ?? '');
    }
    return LanInfoResponseSchema.parse(res.data);
  }

  async checkHealth(options?: ApiRequestOptions): Promise<LivenessHealthResponse> {
    const res = await this.get<unknown>('/health', options);
    if (!res.ok) {
      this.handleResponseError(res, 'Health check failed', options?.correlationId ?? '');
    }
    return LivenessHealthResponseSchema.parse(res.data);
  }

  async getDetailedHealth(options?: ApiRequestOptions): Promise<DetailedHealthResponse> {
    const res = await this.get<unknown>('/health/detail', options);
    if (!res.ok) {
      this.handleResponseError(res, 'Detailed health check failed', options?.correlationId ?? '');
    }
    return DetailedHealthResponseSchema.parse(res.data);
  }

  async checkConnectivity(
    probeUrl: string = '/favicon.svg',
    options: ApiRequestOptions = {}
  ): Promise<boolean> {
    const { signal, cleanup } = this.createTimeoutSignal(options.timeoutMs ?? 2000, options.signal);
    const correlationId = options.correlationId ?? generateCorrelationId();
    const startTime = this.clock.now();
    const sanitizedProbeUrl = probeUrl.split('?')[0] ?? probeUrl;

    this.logger.info('Connectivity probe started', {
      operation: 'check_connectivity',
      probeUrl: sanitizedProbeUrl,
      correlationId,
    });

    try {
      const fullUrl = this.resolveUrl(probeUrl);
      const res = await fetch(`${fullUrl}?_t=${this.clock.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
        headers: {
          'X-Correlation-ID': correlationId,
          ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
          ...options.headers,
        },
        signal: this.getSafeSignal(signal),
      });

      const durationMs = this.clock.now() - startTime;
      this.logger.info('Connectivity probe completed', {
        operation: 'check_connectivity',
        probeUrl: sanitizedProbeUrl,
        correlationId,
        ok: res.ok,
        duration: durationMs,
        durationMs,
      });

      return res.ok;
    } catch (err) {
      const durationMs = this.clock.now() - startTime;
      this.logger.warn('Connectivity probe failed', {
        operation: 'check_connectivity',
        probeUrl: sanitizedProbeUrl,
        correlationId,
        duration: durationMs,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      cleanup();
    }
  }
}
