import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http, { Server } from 'node:http';
import { createHttpServer } from '../http_server.js';
import { MockRoomStore } from '../../../features/rooms/mock_room.store.js';
import { LanService } from '../../../features/lan/lan.service.js';
import { NullLogger } from '../../logger/null_logger.js';
import { LanInfoResponse, HealthCheckResponse } from '@fun-chess/shared';

describe('createHttpServer', () => {
  let server: Server;
  let port: number;
  let store: MockRoomStore;

  beforeAll(async () => {
    store = new MockRoomStore();
    const logger = new NullLogger();
    const lanService = new LanService();

    const handler = createHttpServer({
      roomStore: store,
      lanService,
      logger,
      port: 3000,
      getActiveSocketCount: () => 2,
    });

    server = http.createServer(handler);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr) {
          port = addr.port;
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

  it('responds to GET /api/lan-info with valid LAN info JSON', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/lan-info`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');

    const data = (await res.json()) as LanInfoResponse;
    expect(data.port).toBe(3000);
    expect(data.localUrl).toBe('http://localhost:3000');
    expect(data.joinUrl).toBeDefined();
  });

  it('responds to GET /api/health with health statistics JSON', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as HealthCheckResponse;
    expect(data.status).toBe('ok');
    expect(data.activeSockets).toBe(2);
    expect(data.memoryUsageMb.heapUsed).toBeGreaterThan(0);
    expect(data.timestamp).toBeDefined();
  });

  it('handles CORS OPTIONS preflight with 204 No Content', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/lan-info`, {
      method: 'OPTIONS',
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });

  it('serves SPA fallback HTML for web routes', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/lobby`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const body = await res.text();
    expect(body).toContain('Fun Chess');
  });
});
