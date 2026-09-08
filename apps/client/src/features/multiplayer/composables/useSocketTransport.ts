/**
 * Socket transport composable for Fun Chess multiplayer.
 * Encapsulates connection lifecycle, latency measurement, typed emissions,
 * and 3-point structured telemetry interceptors for all 21 incoming events.
 *
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Findings CRIT-005, MAJ-017, MAJ-020.
 */

import { ref, shallowRef } from 'vue';
import { z } from 'zod';
import {
  GameOverReasonSchema,
  RoomStatusSchema,
  PieceColorSchema,
  type RoomState,
  type GameState,
  type GameOverPayload,
  type SocketErrorPayload,
} from '@fun-chess/shared';
import { createSocketClient, type TypedSocket } from '@/platform/socket/socket_client';
import { generateCorrelationId, logger } from '@/platform/telemetry';

export interface EmitWithTimeoutOptions<TRes extends { success: boolean; error?: SocketErrorPayload }> {
  timeoutMs?: number;
  timeoutMessage: string;
  operation: string;
  correlationId?: string;
  callback?: (res: TRes) => void;
  onSuccess?: (res: Extract<TRes, { success: true }>) => void;
  onError?: (err: SocketErrorPayload) => void;
}

export type SocketEventHandler = (...args: any[]) => void;

// ----------------------------------------------------------------------------
// Module-Singleton Reactive Transport State (MAJ-013)
// ----------------------------------------------------------------------------
const socket = shallowRef<TypedSocket | null>(null);
const isConnected = ref(false);
const socketId = ref<string>('');
const isReconnecting = ref(false);
const connectionError = ref<string | null>(null);
const lastError = ref<SocketErrorPayload | null>(null);
const latencyMs = ref<number>(0);

// Subscriber registry for domain event listeners
const eventSubscribers = new Map<string, Set<SocketEventHandler>>();

/**
 * Registers an internal domain subscriber for a socket event.
 * Returns an unsubscribe cleanup function.
 */
export function registerSocketEventListener(event: string, handler: SocketEventHandler): () => void {
  let handlers = eventSubscribers.get(event);
  if (!handlers) {
    handlers = new Set<SocketEventHandler>();
    eventSubscribers.set(event, handlers);
  }
  handlers.add(handler);
  return () => {
    handlers?.delete(handler);
    if (handlers && handlers.size === 0) {
      eventSubscribers.delete(event);
    }
  };
}

function dispatchEvent(event: string, ...args: any[]): void {
  const handlers = eventSubscribers.get(event);
  if (handlers) {
    handlers.forEach((h) => {
      try {
        h(...args);
      } catch (err) {
        logger.warn('Error in socket event subscriber', {
          operation: 'socket_event_dispatch',
          event,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }
}

// ----------------------------------------------------------------------------
// Structured Telemetry Interceptors for All 21 Incoming Events (Dimension D)
// ----------------------------------------------------------------------------
function handleConnect() {
  isConnected.value = true;
  isReconnecting.value = false;
  connectionError.value = null;
  socketId.value = socket.value?.id || '';

  logger.info('Socket connection established', {
    operation: 'socket_connect',
    socketId: socketId.value,
  });

  dispatchEvent('connect');
}

function handleDisconnect(reason?: string) {
  isConnected.value = false;
  isReconnecting.value = false;

  logger.info('Socket disconnected', {
    operation: 'socket_disconnect',
    socketId: socketId.value,
    reason: reason || 'unknown',
  });

  dispatchEvent('disconnect', reason);
}

function handleConnectError(err: Error) {
  isConnected.value = false;
  isReconnecting.value = false;
  connectionError.value = err?.message || 'Connection error';
  const errPayload: SocketErrorPayload = {
    code: 'ERR_SOCKET_TIMEOUT',
    message: err?.message || 'Connection error',
  };
  lastError.value = errPayload;

  logger.warn('Socket connection error encountered', {
    operation: 'socket_connect_error',
    error: err?.message || String(err),
  });

  dispatchEvent('connect_error', err);
}

function handleReconnectFailed() {
  isConnected.value = false;
  isReconnecting.value = false;
  connectionError.value = 'Reconnection failed after maximum attempts';
  const errPayload: SocketErrorPayload = {
    code: 'ERR_SOCKET_TIMEOUT',
    message: 'Reconnection failed after maximum attempts',
  };
  lastError.value = errPayload;

  logger.warn('Socket reconnection attempts exhausted', {
    operation: 'socket_reconnect_failed',
  });

  dispatchEvent('reconnect_failed');
}

// ----------------------------------------------------------------------------
// Inbound Socket Payload Validation Schemas (MAJ-029)
// ----------------------------------------------------------------------------
export const InboundRoomSchema = z
  .object({
    roomCode: z.string().min(1),
    status: RoomStatusSchema.optional(),
  })
  .passthrough();

export const InboundPlayerJoinedSchema = z.object({
  player: z
    .object({
      id: z.string().min(1),
    })
    .passthrough(),
  room: z
    .object({
      roomCode: z.string().min(1),
    })
    .passthrough(),
});

export const InboundPlayerLeftSchema = z.object({
  playerId: z.string().min(1),
  playerName: z.string().optional(),
  reason: z.string().optional(),
});

export const InboundPlayerDisconnectedSchema = z.object({
  playerId: z.string().optional(),
  player: z
    .object({
      id: z.string().min(1),
    })
    .passthrough()
    .optional(),
  gracePeriodMs: z.number().optional(),
  roomStatus: RoomStatusSchema.optional(),
  disconnectedAt: z.number().optional(),
});

export const InboundPlayerReconnectedSchema = z.object({
  playerId: z.string().min(1),
  playerName: z.string().optional(),
  roomStatus: RoomStatusSchema.optional(),
});

export const InboundRoomReconnectedSchema = z.object({
  room: z
    .object({
      roomCode: z.string().min(1),
    })
    .passthrough(),
  player: z
    .object({
      id: z.string().min(1),
    })
    .passthrough(),
  roomStatus: RoomStatusSchema.optional(),
});

export const InboundGameMovedSchema = z.object({
  move: z
    .object({
      moveNumber: z.number().optional(),
      color: PieceColorSchema.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      san: z.string().optional(),
      fen: z.string().optional(),
    })
    .passthrough(),
  gameState: z.record(z.unknown()),
});

export const InboundGameCheckSchema = z.object({
  inCheck: PieceColorSchema,
  kingSquare: z.string().regex(/^[a-h][1-8]$/),
});

export const InboundDrawOfferedSchema = z.object({
  fromPlayerId: z.string().min(1),
  fromPlayerName: z.string().optional(),
});

export const InboundDrawDeclinedSchema = z
  .object({
    byPlayerId: z.string().optional(),
  })
  .optional()
  .default({});

export const InboundRematchRequestedSchema = z.object({
  requestedBy: z.string().min(1),
  requesterName: z.string().optional(),
});

export const InboundRematchStartedSchema = z.union([
  z
    .object({
      gameState: z.record(z.unknown()).optional(),
      room: z.record(z.unknown()).optional(),
    })
    .passthrough(),
  z
    .object({
      fen: z.string(),
    })
    .passthrough(),
]);

export const InboundRematchDeclinedSchema = z
  .object({
    byPlayerId: z.string().optional(),
  })
  .optional()
  .default({});

export const InboundGameOverSchema = z
  .object({
    winner: z.union([PieceColorSchema, z.literal('draw')]),
    reason: GameOverReasonSchema,
    winnerName: z.string().optional(),
    message: z.string().optional(),
    finalFen: z.string().optional(),
    totalMoves: z.number().optional(),
    durationSeconds: z.number().optional(),
  })
  .passthrough();

export const InboundGameStartedSchema = z
  .object({
    turn: PieceColorSchema.optional(),
  })
  .passthrough();

export const InboundErrorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  roomCode: z.string().optional(),
  correlationId: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

/**
 * Validates inbound websocket payload against schema at system boundary.
 * Logs structured telemetry warning on validation failure and rejects malformed events.
 */
export function validateInboundPayload<T>(
  event: string,
  schema: z.ZodType<T>,
  data: unknown
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    logger.warn(`Inbound socket payload validation failed for event "${event}"`, {
      operation: 'socket_payload_validation',
      event,
      issues: result.error.issues,
      payload: data,
    });
    return null;
  }
  return result.data;
}

function handleRoomCreated(raw: unknown) {
  const room = validateInboundPayload('room:created', InboundRoomSchema, raw);
  if (!room) return;

  logger.info('Room created event received', {
    operation: 'socket_event_room_created',
    roomCode: room.roomCode,
    hostId: (room as any).hostId,
  });
  dispatchEvent('room:created', room as unknown as RoomState);
}

function handleRoomJoined(raw: unknown) {
  const room = validateInboundPayload('room:joined', InboundRoomSchema, raw);
  if (!room) return;

  logger.info('Room joined event received', {
    operation: 'socket_event_room_joined',
    roomCode: room.roomCode,
  });
  dispatchEvent('room:joined', room as unknown as RoomState);
}

function handlePlayerJoined(raw: unknown) {
  const data = validateInboundPayload('room:player_joined', InboundPlayerJoinedSchema, raw);
  if (!data) return;

  logger.info('Player joined room event received', {
    operation: 'socket_event_player_joined',
    roomCode: data.room.roomCode,
    playerId: data.player.id,
  });
  dispatchEvent('room:player_joined', data);
}

function handlePlayerLeft(raw: unknown) {
  const data = validateInboundPayload('room:player_left', InboundPlayerLeftSchema, raw);
  if (!data) return;

  logger.info('Player left room event received', {
    operation: 'socket_event_player_left',
    playerId: data.playerId,
    playerName: data.playerName,
    reason: data.reason,
  });
  dispatchEvent('room:player_left', data);
}

function handlePlayerDisconnected(raw: unknown) {
  const data = validateInboundPayload('room:player_disconnected', InboundPlayerDisconnectedSchema, raw);
  if (!data) return;

  logger.info('Player disconnected event received', {
    operation: 'socket_event_player_disconnected',
    playerId: data.playerId ?? data.player?.id,
    gracePeriodMs: data.gracePeriodMs,
    roomStatus: data.roomStatus,
  });
  dispatchEvent('room:player_disconnected', data);
}

function handlePlayerReconnected(raw: unknown) {
  const data = validateInboundPayload('room:player_reconnected', InboundPlayerReconnectedSchema, raw);
  if (!data) return;

  logger.info('Player reconnected event received', {
    operation: 'socket_event_player_reconnected',
    playerId: data.playerId,
    playerName: data.playerName,
    roomStatus: data.roomStatus,
  });
  dispatchEvent('room:player_reconnected', data);
}

function handleRoomReconnected(raw: unknown) {
  const data = validateInboundPayload('room:reconnected', InboundRoomReconnectedSchema, raw);
  if (!data) return;

  logger.info('Room reconnected event received', {
    operation: 'socket_event_room_reconnected',
    roomCode: data.room.roomCode,
    playerId: data.player.id,
  });
  dispatchEvent('room:reconnected', data);
}

function handleGameStarted(raw: unknown) {
  const gameState = validateInboundPayload('game:started', InboundGameStartedSchema, raw);
  if (!gameState) return;

  logger.info('Game started event received', {
    operation: 'socket_event_game_started',
    turn: (gameState as any).turn,
  });
  dispatchEvent('game:started', gameState as unknown as GameState);
}

function handleGameMoved(raw: unknown) {
  const data = validateInboundPayload('game:moved', InboundGameMovedSchema, raw);
  if (!data) return;

  logger.info('Game moved event received', {
    operation: 'socket_event_game_moved',
    moveNumber: (data.move as any)?.moveNumber,
    san: (data.move as any)?.san,
    turn: (data.gameState as any)?.turn,
  });
  dispatchEvent('game:moved', data);
}

function handleGameCheck(raw: unknown) {
  const data = validateInboundPayload('game:check', InboundGameCheckSchema, raw);
  if (!data) return;

  logger.info('Game check event received', {
    operation: 'socket_event_game_check',
    inCheck: data.inCheck,
    kingSquare: data.kingSquare,
  });
  dispatchEvent('game:check', data);
}

function handleGameOver(raw: unknown) {
  const payload = validateInboundPayload('game:over', InboundGameOverSchema, raw);
  if (!payload) return;

  logger.info('Game over event received', {
    operation: 'socket_event_game_over',
    winner: payload.winner,
    reason: payload.reason,
    totalMoves: (payload as any).totalMoves,
  });
  dispatchEvent('game:over', payload as GameOverPayload);
}

function handleDrawOffered(raw: unknown) {
  const data = validateInboundPayload('game:draw_offered', InboundDrawOfferedSchema, raw);
  if (!data) return;

  logger.info('Draw offered event received', {
    operation: 'socket_event_draw_offered',
    fromPlayerId: data.fromPlayerId,
    fromPlayerName: data.fromPlayerName,
  });
  dispatchEvent('game:draw_offered', data);
}

function handleDrawDeclined(raw: unknown) {
  const data = validateInboundPayload('game:draw_declined', InboundDrawDeclinedSchema, raw);
  if (!data) return;

  logger.info('Draw declined event received', {
    operation: 'socket_event_draw_declined',
    byPlayerId: data.byPlayerId,
  });
  dispatchEvent('game:draw_declined', data);
}

function handleRematchRequested(raw: unknown) {
  const data = validateInboundPayload('game:rematch_requested', InboundRematchRequestedSchema, raw);
  if (!data) return;

  logger.info('Rematch requested event received', {
    operation: 'socket_event_rematch_requested',
    requestedBy: data.requestedBy,
    requesterName: data.requesterName,
  });
  dispatchEvent('game:rematch_requested', data);
}

function handleRematchStarted(raw: unknown) {
  const data = validateInboundPayload('game:rematch_started', InboundRematchStartedSchema, raw);
  if (!data) return;

  logger.info('Rematch started event received', {
    operation: 'socket_event_rematch_started',
  });
  dispatchEvent('game:rematch_started', data);
}

function handleRematchDeclined(raw: unknown) {
  const data = validateInboundPayload('game:rematch_declined', InboundRematchDeclinedSchema, raw);
  if (!data) return;

  logger.info('Rematch declined event received', {
    operation: 'socket_event_rematch_declined',
    byPlayerId: data.byPlayerId,
  });
  dispatchEvent('game:rematch_declined', data);
}

function handleError(raw: unknown) {
  const err = validateInboundPayload('error', InboundErrorPayloadSchema, raw);
  if (!err) return;

  const typedErr = err as unknown as SocketErrorPayload;
  lastError.value = typedErr;
  logger.warn('Socket error payload received', {
    operation: 'socket_event_error',
    errorCode: typedErr.code,
    errorMessage: typedErr.message,
  });
  dispatchEvent('error', typedErr);
}

const eventHandlers: Record<string, (...args: any[]) => void> = {
  connect: handleConnect,
  disconnect: handleDisconnect,
  connect_error: handleConnectError,
  reconnect_failed: handleReconnectFailed,
  'room:created': handleRoomCreated,
  'room:joined': handleRoomJoined,
  'room:player_joined': handlePlayerJoined,
  'room:player_left': handlePlayerLeft,
  'room:player_disconnected': handlePlayerDisconnected,
  'room:player_reconnected': handlePlayerReconnected,
  'room:reconnected': handleRoomReconnected,
  'game:started': handleGameStarted,
  'game:moved': handleGameMoved,
  'game:check': handleGameCheck,
  'game:over': handleGameOver,
  'game:draw_offered': handleDrawOffered,
  'game:draw_declined': handleDrawDeclined,
  'game:rematch_requested': handleRematchRequested,
  'game:rematch_started': handleRematchStarted,
  'game:rematch_declined': handleRematchDeclined,
  error: handleError,
};

const attachedSockets = new WeakSet<object>();

export function attachSocketListeners(s: TypedSocket): void {
  if (attachedSockets.has(s)) {
    return;
  }
  attachedSockets.add(s);

  for (const [event, handler] of Object.entries(eventHandlers)) {
    (s as any).on(event, handler);
  }
}

export function detachSocketListeners(s: TypedSocket): void {
  if (!attachedSockets.has(s)) {
    return;
  }
  attachedSockets.delete(s);

  if (typeof (s as any).off === 'function') {
    for (const [event, handler] of Object.entries(eventHandlers)) {
      (s as any).off(event, handler);
    }
  }
}

// ----------------------------------------------------------------------------
// Public Transport Operations
// ----------------------------------------------------------------------------

/**
 * Initializes the singleton socket instance if not already initialized,
 * attaching all 21 structured telemetry event listeners.
 */
export function initSocket(url?: string, correlationId?: string, client?: TypedSocket): TypedSocket {
  if (client) {
    if (socket.value && socket.value !== client) {
      detachSocketListeners(socket.value);
    }
    socket.value = client;
  } else if (!socket.value) {
    socket.value = createSocketClient({
      url,
      correlationId: correlationId || generateCorrelationId(),
    });
  }

  attachSocketListeners(socket.value);
  return socket.value;
}

/**
 * Establishes socket connection if currently disconnected.
 */
export function connect(url?: string): void {
  const s = socket.value || initSocket(url);
  if (!s.connected) {
    s.connect();
  }
}

/**
 * Disconnects socket connection and updates reactive state.
 */
export function disconnect(): void {
  if (socket.value) {
    socket.value.disconnect();
    isConnected.value = false;
    isReconnecting.value = false;
  }
}

/**
 * Standard socket emit with timeout handling, latency measurement, and 3-point structured logging.
 */
export function emitWithTimeout<TReq, TRes extends { success: boolean; error?: SocketErrorPayload }>(
  s: TypedSocket,
  event: string,
  payload: TReq,
  options: EmitWithTimeoutOptions<TRes>
): Promise<TRes> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const startTime = Date.now();
  const correlationId = options.correlationId || generateCorrelationId();
  const { operation, callback } = options;

  logger.debug('Socket emit dispatched', {
    operation,
    correlationId,
    event,
  });

  return new Promise<TRes>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const duration = Date.now() - startTime;
      latencyMs.value = duration;

      const err: SocketErrorPayload = {
        code: 'ERR_SOCKET_TIMEOUT',
        message: options.timeoutMessage,
        correlationId,
      };
      lastError.value = err;

      logger.warn(`${operation} failed: timed out (timeout)`, {
        operation,
        correlationId,
        duration,
        durationMs: duration,
        event,
        error: err,
      });

      options.onError?.(err);
      const res = { success: false, error: err } as unknown as TRes;
      if (callback) {
        callback(res);
      }
      resolve(res);
    }, timeoutMs);

    (s as any).emit(event, payload, (res: TRes) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      latencyMs.value = duration;

      if (res && res.success) {
        logger.info(`${operation} succeeded successfully`, {
          operation,
          correlationId,
          duration,
          durationMs: duration,
          event,
        });
        options.onSuccess?.(res as Extract<TRes, { success: true }>);
      } else {
        const errPayload: SocketErrorPayload = res?.error ?? {
          code: 'ERR_INTERNAL_SERVER',
          message: `${operation} failed`,
          correlationId,
        };
        lastError.value = errPayload;

        logger.warn(`${operation} failed with failure`, {
          operation,
          correlationId,
          duration,
          durationMs: duration,
          event,
          error: errPayload,
        });
        options.onError?.(errPayload);
      }

      if (callback) {
        callback(res);
      }
      resolve(res);
    });
  });
}

/**
 * Resets socket transport state to initial values.
 */
export function resetTransportState(): void {
  socket.value = null;
  isConnected.value = false;
  socketId.value = '';
  isReconnecting.value = false;
  connectionError.value = null;
  lastError.value = null;
  latencyMs.value = 0;
}

export const resetSocketTransportState = resetTransportState;

/**
 * Primary composable exposing socket transport state and lifecycle controls.
 */
export function useSocketTransport(injectedSocket?: TypedSocket) {
  if (injectedSocket) {
    if (socket.value && socket.value !== injectedSocket) {
      detachSocketListeners(socket.value);
      resetTransportState();
    }
    socket.value = injectedSocket;
    attachSocketListeners(injectedSocket);
    isConnected.value = injectedSocket.connected;
    socketId.value = injectedSocket.id || '';
  }

  return {
    socket,
    isConnected,
    socketId,
    isReconnecting,
    connectionError,
    lastError,
    latencyMs,
    connect,
    disconnect,
    initSocket,
    emitWithTimeout,
    resetTransportState,
    resetSocketTransportState,
    registerSocketEventListener,
  };
}
