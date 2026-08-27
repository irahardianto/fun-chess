import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@fun-chess/shared';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocketClient(url?: string): TypedSocket {
  const targetUrl = url || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return io(targetUrl, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 20000,
    transports: ['websocket', 'polling'],
  });
}
