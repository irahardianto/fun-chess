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
import { resolveLogger } from '@/platform/di';
import { generateCorrelationId, type ILogger } from '@/platform/telemetry';

let customLogger: ILogger | null = null;
export function setSocketTransportLogger(logger: ILogger | null): void {
  customLogger = logger;
}

function getActiveLogger(): ILogger {
  return resolveLogger(customLogger);
}

const logger: ILogger = {
  debug: (msg, meta) => getActiveLogger().debug(msg, meta),
  info: (msg, meta) => getActiveLogger().info(msg, meta),
  warn: (msg, meta) => getActiveLogger().warn(msg, meta),
  error: (msg, meta) => getActiveLogger().error(msg, meta),
  fatal: (msg, meta) => getActiveLogger().fatal(msg, meta),
  child: (context) => getActiveLogger().child(context),
};

export type { TypedSocket };

export interface EmitWithTimeoutOptions<TRes extends { success: boolean; error?: SocketErrorPayload }> {
  timeoutMs?: number;
  timeoutMessage: string;
  operation: string;
  correlationId?: string;
  rejectOnError?: boolean; // MIN-003: Optional flag allowing caller to reject promise
  callback?: (res: TRes) => void;
  onSuccess?: (res: Extract<TRes, { success: true }>) => void;
  onError?: (err: SocketErrorPayload) => void;
}

export type SocketEventHandler<T = unknown> = (payload: T, ...args: unknown[]) => void;

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
const eventSubscribers = new Map<string, Set<SocketEventHandler<unknown>>>();

/**
 * Registers an internal domain subscriber for a socket event.
 * Returns an unsubscribe cleanup function.
 */
export function registerSocketEventListener<T = unknown>(
  event: string,
  handler: (payload: T, ...args: unknown[]) => void
): () => void {
  let handlers = eventSubscribers.get(event);
  if (!handlers) {
    handlers = new Set<SocketEventHandler<unknown>>();
    eventSubscribers.set(event, handlers);
  }
  const genericHandler = handler as unknown as SocketEventHandler<unknown>;
  handlers.add(genericHandler);
  return () => {
    handlers?.delete(genericHandler);
    if (handlers && handlers.size === 0) {
      eventSubscribers.delete(event);
    }
  };
}

function dispatchEvent(event: string, ...args: unknown[]): void {
  const handlers = eventSubscribers.get(event);
  if (handlers) {
    handlers.forEach((handler) => {
      try {
        handler(args[0], ...args.slice(1));
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

function handleDisconnect(reason?: unknown) {
  isConnected.value = false;
  if (!isReconnecting.value) {
    isReconnecting.value = false;
  }

  const reasonStr = typeof reason === 'string' ? reason : reason ? String(reason) : 'unknown';

  logger.info('Socket disconnected', {
    operation: 'socket_disconnect',
    socketId: socketId.value,
    reason: reasonStr,
  });

  dispatchEvent('disconnect', reason);
}

function handleConnectError(err?: unknown) {
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

  logger.warn('Socket connection error encountered', {
    operation: 'socket_connect_error',
    error: message,
  });

  dispatchEvent('connect_error', err);
}

function handleReconnectAttempt(attempt?: unknown) {
  isReconnecting.value = true;
  const attemptNumber = typeof attempt === 'number' ? attempt : 1;

  logger.info('Socket reconnection attempt started', {
    operation: 'socket_reconnect_attempt',
    attempt: attemptNumber,
  });

  dispatchEvent('reconnect_attempt', attempt);
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
  dispatchEvent('error', errPayload);
}

// ----------------------------------------------------------------------------
// Inbound Socket Payload Validation Schemas (MAJ-029 / MIN-025)
//
// Architectural Rationale [MIN-025]:
// Inbound socket events on the client deliberately maintain flexible/passthrough validation
// rather than strictly requiring all fields from authoritative shared schemas (such as RoomStateSchema,
// PlayerSchema, RoomPlayerLeftPayloadSchema, GameOverPayloadSchema, GameStateSchema, MoveResultSchema).
// This design ensures that:
// 1. The client gracefully handles intermediate, optimistic, and transitional event payloads
//    during reconnection, spectator joins, and game-phase handshakes where optional fields might not yet be populated.
// 2. Permissive parsing on client boundaries protects the UI from unhandled runtime parse crashes
//    if the server emits backwards-compatible payload enhancements.
// 3. Strict schema validation is enforced at the server ingress boundary, while client inbound
//    schemas validate the structural presence of critical fields required by UI composables.
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

/**
 * Permissive Inbound Player Left Schema (MIN-024):
 *
 * In ServerToClientEvents, room:player_left payload specifies { playerId: string; playerName: string; reason?: ... }.
 * On the client ingress boundary, this schema intentionally marks `playerName` and `reason` as optional (.optional()).
 *
 * Architectural Rationale:
 * 1. Robustness: The client UI composables only strictly require `playerId` to perform active player/spectator
 *    eviction and UI teardown.
 * 2. Resilience against Partial Payloads: In transient disconnections, abrupt socket teardowns, or backward-compatible
 *    relay messages from older proxies/servers, `playerName` might be absent. Enforcing `playerName` here would reject
 *    the entire event via validateInboundPayload, leaving the disconnected player stuck in room state.
 */
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
      fen: z.string().optional(),
      turn: PieceColorSchema.optional(),
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
    logger.warn('Inbound socket payload validation failed', {
      operation: 'socket_payload_validation',
      event,
      issues: result.error.issues,
      payload: data,
    });
    return null;
  }
  return result.data;
}

export interface InboundHandlerConfig<T, TDispatched = T> {
  event: string;
  schema: z.ZodType<T>;
  logMessage: string;
  operation: string;
  logLevel?: 'info' | 'warn';
  getContext?: (data: T) => Record<string, unknown>;
  transform?: (data: T) => TDispatched;
  onValid?: (data: T) => void;
}

/**
 * Higher-order factory to deduplicate socket event ingress handlers (MAJ-034).
 */
export function createInboundHandler<T, TDispatched = T>(
  config: InboundHandlerConfig<T, TDispatched>
): (raw: unknown) => void {
  const { event, schema, logMessage, operation, logLevel = 'info', getContext, transform, onValid } = config;

  return (raw: unknown) => {
    const startTime = performance.now();
    const correlationId = generateCorrelationId();

    logger.debug('Inbound socket event received', {
      operation: `${operation}_received`,
      event,
      correlationId,
    });

    const data = validateInboundPayload(event, schema, raw);
    if (!data) {
      const durationMs = Math.round(performance.now() - startTime);
      logger.warn('Inbound socket event validation failed', {
        operation,
        event,
        correlationId,
        duration: durationMs,
        durationMs,
        payload: raw,
        error: 'Inbound payload validation failed',
      });
      return;
    }

    const durationMs = Math.round(performance.now() - startTime);
    const context: Record<string, unknown> = {
      operation,
      correlationId,
      durationMs,
      ...(getContext ? getContext(data) : {}),
    };

    if (logLevel === 'warn') {
      logger.warn(logMessage, context);
    } else {
      logger.info(logMessage, context);
    }

    if (onValid) {
      onValid(data);
    }

    const payloadToDispatch = transform ? transform(data) : data;
    dispatchEvent(event, payloadToDispatch);
  };
}

const handleRoomCreated = createInboundHandler({
  event: 'room:created',
  schema: InboundRoomSchema,
  logMessage: 'Room created event received',
  operation: 'socket_event_room_created',
  getContext: (room: Record<string, unknown>) => ({
    roomCode: String(room.roomCode ?? ''),
    hostId: room.hostId ? String(room.hostId) : undefined,
  }),
  transform: (room) => room as unknown as RoomState,
});

const handleRoomJoined = createInboundHandler({
  event: 'room:joined',
  schema: InboundRoomSchema,
  logMessage: 'Room joined event received',
  operation: 'socket_event_room_joined',
  getContext: (room) => ({
    roomCode: room.roomCode,
  }),
  transform: (room) => room as unknown as RoomState,
});

const handlePlayerJoined = createInboundHandler({
  event: 'room:player_joined',
  schema: InboundPlayerJoinedSchema,
  logMessage: 'Player joined room event received',
  operation: 'socket_event_player_joined',
  getContext: (data) => ({
    roomCode: data.room.roomCode,
    playerId: data.player.id,
  }),
});

const handlePlayerLeft = createInboundHandler({
  event: 'room:player_left',
  schema: InboundPlayerLeftSchema,
  logMessage: 'Player left room event received',
  operation: 'socket_event_player_left',
  getContext: (data) => ({
    playerId: data.playerId,
    playerName: data.playerName,
    reason: data.reason,
  }),
});

const handlePlayerDisconnected = createInboundHandler({
  event: 'room:player_disconnected',
  schema: InboundPlayerDisconnectedSchema,
  logMessage: 'Player disconnected event received',
  operation: 'socket_event_player_disconnected',
  getContext: (data) => ({
    playerId: data.playerId ?? data.player?.id,
    gracePeriodMs: data.gracePeriodMs,
    roomStatus: data.roomStatus,
  }),
  transform: (data) => ({
    playerId: (data.playerId ?? data.player?.id) as string,
    gracePeriodMs: data.gracePeriodMs,
    roomStatus: data.roomStatus,
  }),
});

const handlePlayerReconnected = createInboundHandler({
  event: 'room:player_reconnected',
  schema: InboundPlayerReconnectedSchema,
  logMessage: 'Player reconnected event received',
  operation: 'socket_event_player_reconnected',
  getContext: (data) => ({
    playerId: data.playerId,
    playerName: data.playerName,
    roomStatus: data.roomStatus,
  }),
});

const handleRoomReconnected = createInboundHandler({
  event: 'room:reconnected',
  schema: InboundRoomReconnectedSchema,
  logMessage: 'Room reconnected event received',
  operation: 'socket_event_room_reconnected',
  getContext: (data) => ({
    roomCode: data.room.roomCode,
    playerId: data.player.id,
  }),
});

const handleGameStarted = createInboundHandler({
  event: 'game:started',
  schema: InboundGameStartedSchema,
  logMessage: 'Game started event received',
  operation: 'socket_event_game_started',
  getContext: (gameState) => ({
    turn: gameState.turn,
  }),
  transform: (gameState) => gameState as unknown as GameState,
});

const handleGameMoved = createInboundHandler({
  event: 'game:moved',
  schema: InboundGameMovedSchema,
  logMessage: 'Game moved event received',
  operation: 'socket_event_game_moved',
  getContext: (data: { move?: { moveNumber?: number; san?: string }; gameState?: { turn?: string } }) => ({
    moveNumber: data.move?.moveNumber,
    san: data.move?.san,
    turn: data.gameState?.turn,
  }),
});

const handleGameCheck = createInboundHandler({
  event: 'game:check',
  schema: InboundGameCheckSchema,
  logMessage: 'Game check event received',
  operation: 'socket_event_game_check',
  getContext: (data) => ({
    inCheck: data.inCheck,
    kingSquare: data.kingSquare,
  }),
});

const handleGameOver = createInboundHandler({
  event: 'game:over',
  schema: InboundGameOverSchema,
  logMessage: 'Game over event received',
  operation: 'socket_event_game_over',
  getContext: (payload) => ({
    winner: payload.winner,
    reason: payload.reason,
    totalMoves: payload.totalMoves,
  }),
  transform: (payload) => payload as unknown as GameOverPayload,
});

const handleDrawOffered = createInboundHandler({
  event: 'game:draw_offered',
  schema: InboundDrawOfferedSchema,
  logMessage: 'Draw offered event received',
  operation: 'socket_event_draw_offered',
  getContext: (data) => ({
    fromPlayerId: data.fromPlayerId,
    fromPlayerName: data.fromPlayerName,
  }),
});

const handleDrawDeclined = createInboundHandler({
  event: 'game:draw_declined',
  schema: InboundDrawDeclinedSchema,
  logMessage: 'Draw declined event received',
  operation: 'socket_event_draw_declined',
  getContext: (data) => ({
    byPlayerId: data?.byPlayerId,
  }),
});

const handleRematchRequested = createInboundHandler({
  event: 'game:rematch_requested',
  schema: InboundRematchRequestedSchema,
  logMessage: 'Rematch requested event received',
  operation: 'socket_event_rematch_requested',
  getContext: (data) => ({
    requestedBy: data.requestedBy,
    requesterName: data.requesterName,
  }),
});

const handleRematchStarted = createInboundHandler({
  event: 'game:rematch_started',
  schema: InboundRematchStartedSchema,
  logMessage: 'Rematch started event received',
  operation: 'socket_event_rematch_started',
});

const handleRematchDeclined = createInboundHandler({
  event: 'game:rematch_declined',
  schema: InboundRematchDeclinedSchema,
  logMessage: 'Rematch declined event received',
  operation: 'socket_event_rematch_declined',
  getContext: (data) => ({
    byPlayerId: data?.byPlayerId,
  }),
});

const handleError = createInboundHandler({
  event: 'error',
  schema: InboundErrorPayloadSchema,
  logMessage: 'Socket error payload received',
  operation: 'socket_event_error',
  logLevel: 'warn',
  getContext: (err: { code: string; message: string }) => ({
    errorCode: err.code,
    errorMessage: err.message,
  }),
  onValid: (err) => {
    lastError.value = err as unknown as SocketErrorPayload;
  },
  transform: (err) => err as unknown as SocketErrorPayload,
});

const eventHandlers: Record<string, (...args: unknown[]) => void> = {
  connect: handleConnect,
  disconnect: handleDisconnect,
  connect_error: handleConnectError,
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

const managerHandlers: Record<string, (...args: unknown[]) => void> = {
  reconnect_attempt: handleReconnectAttempt,
  reconnect_failed: handleReconnectFailed,
};

interface SocketWithManager {
  on(event: string, fn: (...args: unknown[]) => void): void;
  off?(event: string, fn: (...args: unknown[]) => void): void;
  io?: {
    on?(event: string, fn: (...args: unknown[]) => void): void;
    off?(event: string, fn: (...args: unknown[]) => void): void;
  };
}

const attachedSockets = new WeakSet<object>();

export function attachSocketListeners(targetSocket: TypedSocket): void {
  if (attachedSockets.has(targetSocket)) {
    return;
  }
  attachedSockets.add(targetSocket);

  const sock = targetSocket as unknown as SocketWithManager;
  for (const [event, handler] of Object.entries(eventHandlers)) {
    sock.on(event, handler);
  }

  // Socket.IO client v4 manages reconnection on socket.io (Manager) [MAJ-004]
  const manager = sock.io;
  if (manager && typeof manager.on === 'function') {
    for (const [event, handler] of Object.entries(managerHandlers)) {
      manager.on(event, handler);
    }
  } else {
    for (const [event, handler] of Object.entries(managerHandlers)) {
      sock.on(event, handler);
    }
  }
}

export function detachSocketListeners(targetSocket: TypedSocket): void {
  if (!attachedSockets.has(targetSocket)) {
    return;
  }
  attachedSockets.delete(targetSocket);

  // Clean up Manager listeners [MAJ-004]
  const sock = targetSocket as unknown as SocketWithManager;
  const manager = sock.io;
  if (manager && typeof manager.off === 'function') {
    for (const [event, handler] of Object.entries(managerHandlers)) {
      manager.off(event, handler);
    }
  }

  if (typeof sock.off === 'function') {
    for (const [event, handler] of Object.entries(managerHandlers)) {
      sock.off(event, handler);
    }
    for (const [event, handler] of Object.entries(eventHandlers)) {
      sock.off(event, handler);
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
  const targetSocket = socket.value || initSocket(url);
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
 * Standard socket emit with timeout handling, latency measurement, and 3-point structured logging.
 */
export function emitWithTimeout<TReq, TRes extends { success: boolean; error?: SocketErrorPayload }>(
  targetSocket: TypedSocket,
  event: string,
  payload: TReq,
  options: EmitWithTimeoutOptions<TRes>
): Promise<TRes> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const startTime = Date.now();
  const correlationId = options.correlationId || generateCorrelationId();
  const { operation, callback } = options;

  logger.info('Socket emit dispatched', {
    operation,
    correlationId,
    event,
  });

  return new Promise<TRes>((resolve, reject) => {
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

      logger.warn('Socket operation timed out', {
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
      if (options.rejectOnError) {
        reject(err);
      } else {
        resolve(res);
      }
    }, timeoutMs);

    (targetSocket as unknown as { emit: (e: string, p: unknown, cb: (r: TRes) => void) => void }).emit(event, payload, (res: TRes) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      latencyMs.value = duration;

      if (res && res.success) {
        logger.info('Socket operation succeeded successfully', {
          operation,
          correlationId,
          duration,
          durationMs: duration,
          event,
        });
        options.onSuccess?.(res as Extract<TRes, { success: true }>);
        if (callback) {
          callback(res);
        }
        resolve(res);
      } else {
        const errPayload: SocketErrorPayload = res?.error ?? {
          code: 'ERR_INTERNAL_SERVER',
          message: 'Socket operation failed',
          correlationId,
        };
        lastError.value = errPayload;

        logger.warn('Socket operation failed with failure', {
          operation,
          correlationId,
          duration,
          durationMs: duration,
          event,
          error: errPayload,
        });
        options.onError?.(errPayload);
        if (callback) {
          callback(res);
        }
        if (options.rejectOnError) {
          reject(errPayload);
        } else {
          resolve(res);
        }
      }
    });
  });
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
  customLogger = null;
  eventSubscribers.clear();
}

export const resetSocketTransportState = resetTransportState;

/**
 * Primary composable exposing socket transport state and lifecycle controls.
 */
export function useSocketTransport(
  injectedSocket?: TypedSocket,
  options?: { logger?: ILogger }
) {
  if (options?.logger) {
    customLogger = options.logger;
  }
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
