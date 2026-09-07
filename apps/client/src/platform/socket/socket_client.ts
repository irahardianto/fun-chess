import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@fun-chess/shared';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface SocketClientOptions {
  url?: string;
  correlationId?: string;
  reconnectionDelayMax?: number;
}

export function createSocketClient(urlOrOptions?: string | SocketClientOptions): TypedSocket {
  const options = typeof urlOrOptions === 'string' ? { url: urlOrOptions } : (urlOrOptions ?? {});
  const targetUrl =
    options.url || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

  const auth = options.correlationId ? { correlationId: options.correlationId } : undefined;
  const query = options.correlationId ? { correlationId: options.correlationId } : undefined;
  const reconnectionDelayMax =
    options.reconnectionDelayMax ?? (typeof urlOrOptions === 'string' ? undefined : 10000);

  return io(targetUrl, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    ...(reconnectionDelayMax !== undefined ? { reconnectionDelayMax } : {}),
    timeout: 20000,
    transports: ['websocket', 'polling'],
    ...(auth ? { auth } : {}),
    ...(query ? { query } : {}),
  });
}

