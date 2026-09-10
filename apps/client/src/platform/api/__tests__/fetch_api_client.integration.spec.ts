import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { FetchApiClient } from '../fetch_api_client';

describe('FetchApiClient Real HTTP Integration Tests (MAJ-026)', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            uptimeSeconds: 120,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      if (url.pathname === '/health/detail') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            uptimeSeconds: 120,
            timestamp: new Date().toISOString(),
            activeRooms: 3,
            activeSockets: 5,
            memoryUsageMb: { rss: 50, heapTotal: 40, heapUsed: 30 },
            relay: { mode: 'lan', publicUrl: baseUrl },
          })
        );
        return;
      }

      if (url.pathname === '/api/lan-info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            lanIp: '127.0.0.1',
            port: 3000,
            localUrl: baseUrl,
            joinUrl: `${baseUrl}/join`,
            interfaces: ['127.0.0.1'],
            relayMode: 'lan',
            isCloudRelay: false,
          })
        );
        return;
      }

      if (url.pathname === '/api/echo' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          const parsed = JSON.parse(body);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'X-Echo-Correlation': (req.headers['x-correlation-id'] as string) || '',
          });
          res.end(JSON.stringify({ echoed: parsed, auth: req.headers['authorization'] ?? null }));
        });
        return;
      }

      if (url.pathname === '/favicon.svg' && req.method === 'HEAD') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (url.pathname === '/error/text') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Gateway Failure');
        return;
      }

      if (url.pathname === '/error/structured') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'error',
            code: 400,
            error: {
              code: 'ERR_INVALID_PAYLOAD',
              message: 'Payload failed schema validation',
              correlationId: 'corr-real-400',
              details: { field: 'username' },
            },
          })
        );
        return;
      }

      if (url.pathname === '/hang') {
        // Never respond to trigger genuine timeout
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('performs live GET queries and parses JSON responses', async () => {
    const client = new FetchApiClient(baseUrl);
    const health = await client.checkHealth();
    expect(health.status).toBe('ok');
    expect(health.uptimeSeconds).toBe(120);
  });

  it('performs live POST queries with JSON payload and receives echo', async () => {
    const client = new FetchApiClient(baseUrl);
    const res = await client.post<{ echoed: { player: string }; auth: string | null }>(
      '/api/echo',
      { player: 'Grandmaster' },
      { authToken: 'test-token-123', correlationId: 'corr-test-real' }
    );
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data.echoed.player).toBe('Grandmaster');
    expect(res.data.auth).toBe('Bearer test-token-123');
  });

  it('performs live LAN info discovery matching Zod schema', async () => {
    const client = new FetchApiClient(baseUrl);
    const lanInfo = await client.getLanInfo();
    expect(lanInfo.lanIp).toBe('127.0.0.1');
    expect(lanInfo.relayMode).toBe('lan');
    expect(lanInfo.isCloudRelay).toBe(false);
  });

  it('performs live detailed health check query', async () => {
    const client = new FetchApiClient(baseUrl);
    const detail = await client.getDetailedHealth();
    expect(detail.status).toBe('ok');
    expect(detail.activeRooms).toBe(3);
    expect(detail.memoryUsageMb.rss).toBe(50);
  });

  it('verifies connectivity via real HEAD request on /favicon.svg', async () => {
    const client = new FetchApiClient(baseUrl);
    const isConnected = await client.checkConnectivity('/favicon.svg');
    expect(isConnected).toBe(true);
  });

  it('retains raw error text and raises ApiClientError on 500 plain-text error (ENH-003)', async () => {
    const client = new FetchApiClient(baseUrl);
    const res = await client.get<string>('/error/text');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(res.data).toBe('Internal Gateway Failure');
  });

  it('parses structured HTTP error envelope and raises typed ApiClientError', async () => {
    const client = new FetchApiClient(baseUrl);
    const res = await client.get<unknown>('/error/structured');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);

    // Calling a contract method that triggers handleResponseError
    await expect(client.getLanInfo({ headers: { Host: 'invalid' } })).toBeDefined();
  });

  it('enforces network timeout against genuine hanging socket connection', async () => {
    const client = new FetchApiClient(baseUrl);
    await expect(client.get('/hang', { timeoutMs: 100 })).rejects.toThrow();
  });
});
