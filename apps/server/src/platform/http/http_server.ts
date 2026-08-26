import { IncomingMessage, ServerResponse, RequestListener } from 'node:http';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { Logger } from '../logger/logger.interface.js';
import { serveStaticFile } from './static_handler.js';
import { RoomStore } from '../../features/rooms/room.store.js';
import { LanService } from '../../features/lan/lan.service.js';
import { HealthCheckResponse } from '@fun-chess/shared';

export interface HttpServerConfig {
  roomStore: RoomStore;
  lanService?: LanService;
  logger: Logger;
  port?: number;
  distPath?: string;
  getActiveSocketCount?: () => number;
}

const START_TIME = Date.now();

/**
 * Creates the HTTP request listener for Fun Chess API endpoints and static SPA hosting.
 */
export function createHttpServer(config: HttpServerConfig): RequestListener {
  const {
    roomStore,
    lanService = new LanService(),
    logger,
    port = Number(process.env.PORT) || 3000,
    distPath = path.resolve(process.cwd(), '../client/dist'),
    getActiveSocketCount = () => 0,
  } = config;

  const fallbackHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fun Chess - LAN Server</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #1a1a2e; color: #fff; text-align: center; padding: 50px 20px; }
    .card { max-width: 500px; margin: 0 auto; background: #16213e; padding: 30px; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
    h1 { color: #f39c12; margin-bottom: 10px; }
    p { color: #cbd5e1; line-height: 1.6; }
    .badge { display: inline-block; background: #0f3460; color: #00d2d3; padding: 6px 14px; border-radius: 20px; font-weight: bold; margin: 8px 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>♞ Fun Chess Server</h1>
    <div class="badge">Running on port ${port}</div>
    <p>API endpoints are active:</p>
    <p><a href="/api/lan-info" style="color: #48dbfb;">/api/lan-info</a> &bull; <a href="/api/health" style="color: #48dbfb;">/api/health</a></p>
    <p style="font-size: 0.9em; opacity: 0.8;">To view the web client, ensure client assets are built in <code>apps/client/dist</code> or run the client dev server.</p>
  </div>
</body>
</html>`;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
    const startTime = performance.now();
    const method = req.method?.toUpperCase() || 'GET';
    const url = req.url || '/';
    const [pathname] = url.split('?');

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-ID');
    res.setHeader('X-Correlation-ID', correlationId);

    // Handle preflight OPTIONS
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    logger.info(`HTTP Request: ${method} ${pathname}`, {
      operation: 'http_request',
      correlationId,
      method,
      path: pathname,
      userAgent: req.headers['user-agent'],
    });

    const sendJsonResponse = (statusCode: number, data: unknown) => {
      const body = JSON.stringify(data);
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);

      const durationMs = Math.round(performance.now() - startTime);
      logger.info(`HTTP Response: ${method} ${pathname} [${statusCode}]`, {
        operation: 'http_response',
        correlationId,
        method,
        path: pathname,
        statusCode,
        durationMs,
      });
    };

    try {
      // 1. GET /api/lan-info
      if (method === 'GET' && pathname === '/api/lan-info') {
        const lanInfo = lanService.getLanInfo(port);
        sendJsonResponse(200, lanInfo);
        return;
      }

      // 2. GET /api/health
      if (method === 'GET' && pathname === '/api/health') {
        const mem = process.memoryUsage();
        const activeRooms = await roomStore.count();
        const activeSockets = getActiveSocketCount();

        const health: HealthCheckResponse = {
          status: 'ok',
          uptimeSeconds: Math.round((Date.now() - START_TIME) / 100) / 10,
          timestamp: new Date().toISOString(),
          activeRooms,
          activeSockets,
          memoryUsageMb: {
            rss: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
            heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
            heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
          },
        };
        sendJsonResponse(200, health);
        return;
      }

      // 3. Static Assets / SPA Fallback
      if (method === 'GET') {
        const served = await serveStaticFile(req, res, { distPath, fallbackHtml }, logger);
        if (served) {
          const durationMs = Math.round(performance.now() - startTime);
          logger.debug(`HTTP Static served: ${pathname}`, {
            operation: 'http_static',
            correlationId,
            path: pathname,
            durationMs,
          });
          return;
        }
      }

      // 4. Unhandled 404
      sendJsonResponse(404, {
        error: {
          code: 'ERR_NOT_FOUND',
          message: `Cannot ${method} ${pathname}`,
          correlationId,
        },
      });
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorObj = err instanceof Error ? { message: err.message, stack: err.stack } : { raw: err };

      logger.error(`HTTP Request Error: ${method} ${pathname}`, {
        operation: 'http_error',
        correlationId,
        method,
        path: pathname,
        durationMs,
        error: errorObj,
      });

      sendJsonResponse(500, {
        error: {
          code: 'ERR_INTERNAL_SERVER',
          message: 'Internal server error',
          correlationId,
        },
      });
    }
  };
}
