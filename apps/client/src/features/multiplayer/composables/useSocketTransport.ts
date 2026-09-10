/**
 * Socket transport facade composable for Fun Chess multiplayer.
 * Unites socket connection lifecycle manager, event dispatcher, and request client
 * into a cohesive facade under 200 lines.
 *
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Findings MAJ-017, MAJ-019.
 */

import type { ILogger } from '@/platform/telemetry';
import {
  SOCKET_CLIENT_KEY,
  type TypedSocket,
  socket,
  isConnected,
  socketId,
  isReconnecting,
  connectionError,
  lastError,
  latencyMs,
  connectionCorrelationId,
  initSocket,
  connect,
  disconnect,
  resetTransportState,
  resetSocketTransportState,
  attachSocketListeners,
  detachSocketListeners,
  useSocketConnectionManager,
  type UseSocketConnectionManagerOptions,
} from './socket_connection_manager';
import {
  registerSocketEventListener,
  dispatchEvent,
  validateInboundPayload,
  createInboundHandler,
  InboundRoomSchema,
  InboundPlayerJoinedSchema,
  InboundPlayerLeftSchema,
  InboundPlayerDisconnectedSchema,
  InboundPlayerReconnectedSchema,
  InboundRoomReconnectedSchema,
  InboundGameMovedSchema,
  InboundGameCheckSchema,
  InboundDrawOfferedSchema,
  InboundDrawDeclinedSchema,
  InboundRematchRequestedSchema,
  InboundRematchStartedSchema,
  InboundRematchDeclinedSchema,
  InboundGameOverSchema,
  InboundGameStartedSchema,
  InboundErrorPayloadSchema,
  type SocketEventHandler,
  type InboundHandlerConfig,
} from './socket_event_dispatcher';
import {
  emitWithTimeout,
  useSocketRequestClient,
  type EmitWithTimeoutOptions,
} from './socket_request_client';

export {
  SOCKET_CLIENT_KEY,
  type TypedSocket,
  type EmitWithTimeoutOptions,
  type SocketEventHandler,
  type InboundHandlerConfig,
  type UseSocketConnectionManagerOptions,
  // Connection reactive refs
  socket,
  isConnected,
  socketId,
  isReconnecting,
  connectionError,
  lastError,
  latencyMs,
  connectionCorrelationId,
  // Connection actions
  initSocket,
  connect,
  disconnect,
  resetTransportState,
  resetSocketTransportState,
  attachSocketListeners,
  detachSocketListeners,
  // Request actions
  emitWithTimeout,
  // Dispatcher actions & schemas
  registerSocketEventListener,
  dispatchEvent,
  validateInboundPayload,
  createInboundHandler,
  InboundRoomSchema,
  InboundPlayerJoinedSchema,
  InboundPlayerLeftSchema,
  InboundPlayerDisconnectedSchema,
  InboundPlayerReconnectedSchema,
  InboundRoomReconnectedSchema,
  InboundGameMovedSchema,
  InboundGameCheckSchema,
  InboundDrawOfferedSchema,
  InboundDrawDeclinedSchema,
  InboundRematchRequestedSchema,
  InboundRematchStartedSchema,
  InboundRematchDeclinedSchema,
  InboundGameOverSchema,
  InboundGameStartedSchema,
  InboundErrorPayloadSchema,
  // Sub-composables
  useSocketConnectionManager,
  useSocketRequestClient,
};

export interface UseSocketTransportOptions {
  logger?: ILogger;
}

/**
 * Primary composable exposing socket transport state and lifecycle controls.
 * Preserves full backward-compatible API across the client multiplayer domain.
 */
export function useSocketTransport(
  injectedSocket?: TypedSocket,
  options?: UseSocketTransportOptions
) {
  const manager = useSocketConnectionManager(injectedSocket, options);

  return {
    socket: manager.socket,
    isConnected: manager.isConnected,
    socketId: manager.socketId,
    isReconnecting: manager.isReconnecting,
    connectionError: manager.connectionError,
    lastError: manager.lastError,
    latencyMs: manager.latencyMs,
    connect: manager.connect,
    disconnect: manager.disconnect,
    initSocket: manager.initSocket,
    emitWithTimeout,
    resetTransportState: manager.resetTransportState,
    resetSocketTransportState: manager.resetSocketTransportState,
    registerSocketEventListener,
  };
}
