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
