import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FetchApiClient } from '../fetch_api_client';
import { MockApiClient } from '../mock_api_client';
import { apiClient } from '../index';

describe('FetchApiClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('performs GET request and parses response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'ok' }),
    });

    const client = new FetchApiClient('http://localhost:3000');
    const res = await client.get<{ message: string }>('/test');

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data.message).toBe('ok');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/test',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('performs POST request with JSON body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ created: true }),
    });

    const client = new FetchApiClient('http://localhost:3000');
    const res = await client.post<{ created: boolean }>('/api/create', { name: 'Alice' });

    expect(res.ok).toBe(true);
    expect(res.data.created).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/create',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Alice' }),
      })
    );
  });

  it('discovers LAN info and parses response with Zod schema', async () => {
    const mockLanInfo = {
      lanIp: '192.168.1.100',
      port: 3000,
      localUrl: 'http://localhost:3000',
      joinUrl: 'http://192.168.1.100:3000',
      interfaces: ['192.168.1.100'],
      relayMode: 'lan' as const,
      isCloudRelay: false,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockLanInfo,
    });

    const client = new FetchApiClient('http://localhost:3000');
    const result = await client.getLanInfo();

    expect(result.lanIp).toBe('192.168.1.100');
    expect(result.port).toBe(3000);
  });

  it('queries health telemetry and parses response with Zod schema', async () => {
    const mockHealth = {
      status: 'ok' as const,
      uptimeSeconds: 3600,
      timestamp: new Date().toISOString(),
      activeRooms: 2,
      activeSockets: 4,
      memoryUsageMb: { rss: 50, heapTotal: 40, heapUsed: 30 },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockHealth,
    });

    const client = new FetchApiClient('http://localhost:3000');
    const result = await client.checkHealth();

    expect(result.status).toBe('ok');
    expect(result.uptimeSeconds).toBe(3600);
  });

  it('verifies connectivity with checkConnectivity HEAD probe', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const client = new FetchApiClient();
    const isConnected = await client.checkConnectivity('/favicon.svg');
    expect(isConnected).toBe(true);

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const isConnectedFailed = await client.checkConnectivity('/favicon.svg');
    expect(isConnectedFailed).toBe(false);
  });

  it('enforces 3-second timeout and aborts hanging requests', async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('Request timed out', 'AbortError'));
        });
      });
    });

    const client = new FetchApiClient();

    // Use a very short timeoutMs for this test to verify signal aborts
    await expect(client.get('/hang', { timeoutMs: 20 })).rejects.toThrow();
  });

  it('attaches generated or custom X-Correlation-ID header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true }),
    });

    const client = new FetchApiClient('http://localhost:3000');

    // 1. Auto-generated correlation ID
    await client.get('/test');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Correlation-ID': expect.any(String),
        }),
      })
    );

    // 2. Custom correlation ID passed via options
    await client.post('/test-custom', { hello: 'world' }, { correlationId: 'custom-corr-123' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/test-custom',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Correlation-ID': 'custom-corr-123',
        }),
      })
    );
  });

  it('cleans up abort event listener from callerSignal on completion', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ done: true }),
    });

    const callerController = new AbortController();
    const removeEventListenerSpy = vi.spyOn(callerController.signal, 'removeEventListener');

    const client = new FetchApiClient();
    await client.get('/caller-signal-test', { signal: callerController.signal });

    expect(removeEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('handles HTML error pages and non-JSON responses safely without throwing SyntaxError', async () => {
    const htmlBody = '<html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers({ 'content-type': 'text/html; charset=UTF-8' }),
      text: async () => htmlBody,
    });

    const client = new FetchApiClient();
    const response = await client.get<string>('/proxy-error');

    expect(response.ok).toBe(false);
    expect(response.status).toBe(502);
    expect(response.data).toBe(htmlBody);
  });

  it('handles 204 No Content response returning null data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    });

    const client = new FetchApiClient();
    const response = await client.get('/no-content');

    expect(response.ok).toBe(true);
    expect(response.status).toBe(204);
    expect(response.data).toBeNull();
  });

  it('safely parses non-JSON response body without stream consumption errors [MIN-008]', async () => {
    const malformedBody = '<html>Internal Server Error</html>';
    const mockResponse = new Response(malformedBody, {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new FetchApiClient('http://localhost:3000');
    const result = await client.get<string>('/api/broken-endpoint');

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.data).toBe(malformedBody);
  });

  it('strips query strings from URLs in telemetry logging for GET requests [MAJ-021]', async () => {
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
      getLevel: vi.fn(),
      setLevel: vi.fn(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ success: true }),
      json: async () => ({ success: true }),
    });

    const client = new FetchApiClient('http://localhost:3000', mockLogger as any);
    await client.get('/api/rooms?status=waiting&token=superSecret123');

    expect(mockLogger.info).toHaveBeenCalledWith(
      'HTTP request started',
      expect.objectContaining({
        url: 'http://localhost:3000/api/rooms',
      })
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      'HTTP request completed',
      expect.objectContaining({
        url: 'http://localhost:3000/api/rooms',
      })
    );

    for (const call of mockLogger.info.mock.calls) {
      const meta = call[1];
      if (meta?.url) {
        expect(meta.url).not.toContain('superSecret123');
        expect(meta.url).not.toContain('?');
      }
    }
  });

  it('strips query strings from URLs in telemetry logging on HTTP failure [MAJ-021]', async () => {
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
      getLevel: vi.fn(),
      setLevel: vi.fn(),
    };

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const client = new FetchApiClient('http://localhost:3000', mockLogger as any);
    await expect(client.get('/api/users?apiKey=xyz789&filter=active')).rejects.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      'HTTP request failed',
      expect.objectContaining({
        url: 'http://localhost:3000/api/users',
      })
    );

    for (const call of mockLogger.error.mock.calls) {
      const meta = call[1];
      if (meta?.url) {
        expect(meta.url).not.toContain('xyz789');
        expect(meta.url).not.toContain('?');
      }
    }
  });

  it('strips query strings from URLs in telemetry logging for POST requests [MAJ-021]', async () => {
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
      getLevel: vi.fn(),
      setLevel: vi.fn(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ created: true }),
      json: async () => ({ created: true }),
    });

    const client = new FetchApiClient('http://localhost:3000', mockLogger as any);
    await client.post('/api/action?sensitiveToken=abc456', { test: true });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'HTTP request started',
      expect.objectContaining({
        url: 'http://localhost:3000/api/action',
      })
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      'HTTP request completed',
      expect.objectContaining({
        url: 'http://localhost:3000/api/action',
      })
    );
  });
});

describe('MockApiClient & Default Singleton', () => {
  it('provides default test double responses', async () => {
    const mock = new MockApiClient();
    const lan = await mock.getLanInfo();
    expect(lan.lanIp).toBe('192.168.1.50');

    const health = await mock.checkHealth();
    expect(health.status).toBe('ok');

    const online = await mock.checkConnectivity();
    expect(online).toBe(true);

    const getRes = await mock.get('/anything');
    expect(getRes.ok).toBe(true);

    const postRes = await mock.post('/anything');
    expect(postRes.ok).toBe(true);
  });

  it('exports apiClient singleton instance', () => {
    expect(apiClient).toBeDefined();
    expect(typeof apiClient.get).toBe('function');
  });
});
