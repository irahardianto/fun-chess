import { IncomingMessage, ServerResponse } from 'node:http';
import { LanService } from './lan.service.js';

/**
 * HTTP handler for GET /api/lan-info endpoint.
 */
export function handleLanInfo(
  _req: IncomingMessage,
  res: ServerResponse,
  lanService: LanService,
  port: number
): void {
  const info = lanService.getLanInfo(port);
  const json = JSON.stringify(info);

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}
