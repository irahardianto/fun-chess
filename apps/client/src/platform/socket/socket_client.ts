import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@fun-chess/shared';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Default maximum number of reconnection attempts before tripping the circuit breaker (ENH-006).
 * Stops continuous battery and network drain during prolonged outages.
 */
export const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
export const DEFAULT_RECONNECTION_ATTEMPTS = DEFAULT_MAX_RECONNECT_ATTEMPTS;

/**
 * Configuration options for creating a typed Socket.io client instance.
 */
export interface SocketClientOptions {
  /** Target server URL or origin. Defaults to window.location.origin in browser, or http://localhost:3000 */
  url?: string;
  /** Correlation ID for tracing across transport and socket connection handshakes */
  correlationId?: string;
  /** Maximum delay between reconnection attempts in milliseconds. Defaults to 10000ms */
  reconnectionDelayMax?: number;
  /**
   * Maximum reconnection attempts before stopping (reconnection circuit breaker) (ENH-006).
   * Prevents continuous battery and network drain during permanent server outages.
   * Defaults to DEFAULT_MAX_RECONNECT_ATTEMPTS (10).
   */
  reconnectionAttempts?: number;
}

/**
 * Factory function creating a strongly-typed Socket.io client instance configured with
 * exponential backoff, circuit breaker max reconnection limits, and connection timeouts.
 *
 * @param urlOrOptions - Target server URL string or comprehensive SocketClientOptions configuration
 * @returns TypedSocket instance ready for explicit connect() call
 */
export function createSocketClient(urlOrOptions?: string | SocketClientOptions): TypedSocket {
  const options = typeof urlOrOptions === 'string' ? { url: urlOrOptions } : (urlOrOptions ?? {});
  const targetUrl =
    options.url || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

  const auth = options.correlationId ? { correlationId: options.correlationId } : undefined;
  const query = options.correlationId ? { correlationId: options.correlationId } : undefined;
  const reconnectionDelayMax =
    options.reconnectionDelayMax ?? (typeof urlOrOptions === 'string' ? undefined : 10000);
  const reconnectionAttempts =
    options.reconnectionAttempts !== undefined
      ? options.reconnectionAttempts
      : DEFAULT_MAX_RECONNECT_ATTEMPTS;

  return io(targetUrl, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts,
    reconnectionDelay: 1000,
    ...(reconnectionDelayMax !== undefined ? { reconnectionDelayMax } : {}),
    timeout: 20000,
    transports: ['websocket', 'polling'],
    ...(auth ? { auth } : {}),
    ...(query ? { query } : {}),
  });
}

