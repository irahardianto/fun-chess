/**
 * Socket connection lifecycle and heartbeat latency manager for Fun Chess multiplayer.
 * Encapsulates connection lifecycle, reconnection backoff, socket instance management,
 * and 3-point structured telemetry for connection events with session correlationId (MIN-014).
 *
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Findings MAJ-017, MAJ-019, MIN-014.
 */

import { ref, shallowRef, hasInjectionContext, inject, type Ref, type ShallowRef } from 'vue';
import type { SocketErrorPayload } from '@fun-chess/shared';
import { createSocketClient, type TypedSocket } from '@/platform/socket/socket_client';
import { resolveLogger, SOCKET_CLIENT_KEY } from '@/platform/di';
import { generateCorrelationId, type ILogger } from '@/platform/telemetry';
import {
  dispatchEvent,
  clearEventSubscribers,
  attachSocketListeners as bindListeners,
  detachSocketListeners as unbindListeners,
  setInboundLastErrorCallback,
} from './socket_event_dispatcher';

export { SOCKET_CLIENT_KEY };
export type { TypedSocket };

function getActiveLogger(custom?: ILogger | null): ILogger {
  return resolveLogger(custom);
}

const logger: ILogger = {
  debug: (msg, meta) => getActiveLogger().debug(msg, meta),
  info: (msg, meta) => getActiveLogger().info(msg, meta),
  warn: (msg, meta) => getActiveLogger().warn(msg, meta),
  error: (msg, meta) => getActiveLogger().error(msg, meta),
  fatal: (msg, meta) => getActiveLogger().fatal(msg, meta),
  child: (context) => getActiveLogger().child(context),
};

// ----------------------------------------------------------------------------
// Module-Singleton Reactive Connection State (MAJ-013)
// ----------------------------------------------------------------------------
export const socket: ShallowRef<TypedSocket | null> = shallowRef<TypedSocket | null>(null);
export const isConnected: Ref<boolean> = ref(false);
export const socketId: Ref<string> = ref<string>('');
export const isReconnecting: Ref<boolean> = ref(false);
export const connectionError: Ref<string | null> = ref<string | null>(null);
export const lastError: Ref<SocketErrorPayload | null> = ref<SocketErrorPayload | null>(null);
export const latencyMs: Ref<number> = ref<number>(0);

// Session correlation ID for socket connection lifecycle events (MIN-014)
export const connectionCorrelationId: Ref<string> = ref<string>('');

// Wire inbound lastError callback
setInboundLastErrorCallback((err) => {
  lastError.value = err;
});

function ensureConnectionCorrelationId(): string {
  if (!connectionCorrelationId.value) {
    connectionCorrelationId.value = generateCorrelationId();
  }
  return connectionCorrelationId.value;
}

// ----------------------------------------------------------------------------
// Connection Lifecycle Interceptors with Session correlationId (MIN-014)
// ----------------------------------------------------------------------------
function handleConnect(): void {
  isConnected.value = true;
  isReconnecting.value = false;
  connectionError.value = null;
  socketId.value = socket.value?.id || '';
  const cid = ensureConnectionCorrelationId();

  logger.info('Socket connection established', {
    operation: 'socket_connect',
    correlationId: cid,
    socketId: socketId.value,
  });

  dispatchEvent('connect');
}

function handleDisconnect(reason?: unknown): void {
  isConnected.value = false;
  if (!isReconnecting.value) {
    isReconnecting.value = false;
  }

  const reasonStr = typeof reason === 'string' ? reason : reason ? String(reason) : 'unknown';
  const cid = ensureConnectionCorrelationId();

  logger.info('Socket disconnected', {
    operation: 'socket_disconnect',
    correlationId: cid,
    socketId: socketId.value,
    reason: reasonStr,
  });

  dispatchEvent('disconnect', reason);
}

function handleConnectError(err?: unknown): void {
  isConnected.value = false;
  isReconnecting.value = false;
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err || 'Connection error');
  connectionError.value = message;
  const errPayload: SocketErrorPayload = {
    code: 'ERR_SOCKET_TIMEOUT',
    message,
  };
  lastError.value = errPayload;
  const cid = ensureConnectionCorrelationId();

  logger.warn('Socket connection error encountered', {
    operation: 'socket_connect_error',
    correlationId: cid,
    error: message,
  });

  dispatchEvent('connect_error', err);
}

function handleReconnectAttempt(attempt?: unknown): void {
  isReconnecting.value = true;
  const attemptNumber = typeof attempt === 'number' ? attempt : 1;
  const cid = ensureConnectionCorrelationId();

  logger.info('Socket reconnection attempt started', {
    operation: 'socket_reconnect_attempt',
    correlationId: cid,
    attempt: attemptNumber,
  });

  dispatchEvent('reconnect_attempt', attempt);
}

function handleReconnectFailed(): void {
  isConnected.value = false;
  isReconnecting.value = false;
  connectionError.value = 'Reconnection failed after maximum attempts';
  const errPayload: SocketErrorPayload = {
    code: 'ERR_SOCKET_TIMEOUT',
    message: 'Reconnection failed after maximum attempts',
  };
  lastError.value = errPayload;
  const cid = ensureConnectionCorrelationId();

  logger.warn('Socket reconnection attempts exhausted', {
    operation: 'socket_reconnect_failed',
    correlationId: cid,
  });

  dispatchEvent('reconnect_failed');
  dispatchEvent('error', errPayload);
}

export const lifecycleHandlers: Record<string, (...args: unknown[]) => void> = {
  connect: handleConnect,
  disconnect: handleDisconnect,
  connect_error: handleConnectError,
};

export const managerHandlers: Record<string, (...args: unknown[]) => void> = {
  reconnect_attempt: handleReconnectAttempt,
  reconnect_failed: handleReconnectFailed,
};

export function attachSocketListeners(targetSocket: TypedSocket): void {
  bindListeners(targetSocket, lifecycleHandlers, managerHandlers);
}

export function detachSocketListeners(targetSocket: TypedSocket): void {
  unbindListeners(targetSocket, lifecycleHandlers, managerHandlers);
}

/**
 * Initializes the singleton socket instance if not already initialized,
 * attaching structured telemetry event listeners.
 */
export function initSocket(url?: string, correlationId?: string, client?: TypedSocket): TypedSocket {
  connectionCorrelationId.value = correlationId || generateCorrelationId();

  if (client) {
    if (socket.value && socket.value !== client) {
      detachSocketListeners(socket.value);
    }
    socket.value = client;
  } else if (!socket.value) {
    socket.value = createSocketClient({
      url,
      correlationId: connectionCorrelationId.value,
    });
  }

  attachSocketListeners(socket.value);
  return socket.value;
}

/**
 * Establishes socket connection if currently disconnected.
 */
export function connect(url?: string): void {
  if (!connectionCorrelationId.value) {
    connectionCorrelationId.value = generateCorrelationId();
  }
  const targetSocket = socket.value || initSocket(url, connectionCorrelationId.value);
  if (!targetSocket.connected) {
    targetSocket.connect();
  }
}

/**
 * Disconnects socket connection and updates reactive state.
 * @param reset - Optional flag to reset module-level transport state on clean disconnect (MIN-015).
 */
export function disconnect(reset = false): void {
  if (socket.value) {
    socket.value.disconnect();
    isConnected.value = false;
    isReconnecting.value = false;
    if (reset) {
      resetTransportState();
    }
  }
}

/**
 * Resets socket transport state to initial values.
 * Allows deterministic resetting of module-level socket transport state in test suites and clean disconnects (MIN-015).
 */
export function resetTransportState(): void {
  socket.value = null;
  isConnected.value = false;
  socketId.value = '';
  isReconnecting.value = false;
  connectionError.value = null;
  lastError.value = null;
  latencyMs.value = 0;
  connectionCorrelationId.value = '';
  clearEventSubscribers();
}

export const resetSocketTransportState = resetTransportState;

export interface UseSocketConnectionManagerOptions {
  logger?: ILogger;
}

/**
 * Composable exposing socket connection manager state and lifecycle controls.
 */
export function useSocketConnectionManager(
  injectedSocket?: TypedSocket,
  _options?: UseSocketConnectionManagerOptions
) {
  const diSocket = !injectedSocket && hasInjectionContext() ? inject(SOCKET_CLIENT_KEY, null) : null;
  const effectiveSocket = injectedSocket || diSocket;
  if (effectiveSocket) {
    if (socket.value && socket.value !== effectiveSocket) {
      detachSocketListeners(socket.value);
      resetTransportState();
    }
    socket.value = effectiveSocket;
    attachSocketListeners(effectiveSocket);
    isConnected.value = effectiveSocket.connected;
    socketId.value = effectiveSocket.id || '';
  }

  return {
    socket,
    isConnected,
    socketId,
    isReconnecting,
    connectionError,
    lastError,
    latencyMs,
    connectionCorrelationId,
    connect,
    disconnect,
    initSocket,
    resetTransportState,
    resetSocketTransportState,
    attachSocketListeners,
    detachSocketListeners,
  };
}
