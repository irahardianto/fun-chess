/**
 * Inbound event schemas, validation, and event dispatching for Fun Chess multiplayer.
 * Encapsulates Zod schema validation at system boundary and 3-point structured telemetry interceptors.
 *
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Findings MAJ-017, ENH-006.
 */

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
import type { TypedSocket } from '@/platform/socket/socket_client';
import { resolveLogger } from '@/platform/di';
import { generateCorrelationId, type ILogger } from '@/platform/telemetry';

function getActiveLogger(): ILogger {
  return resolveLogger();
}

const logger: ILogger = {
  debug: (msg, meta) => getActiveLogger().debug(msg, meta),
  info: (msg, meta) => getActiveLogger().info(msg, meta),
  warn: (msg, meta) => getActiveLogger().warn(msg, meta),
  error: (msg, meta) => getActiveLogger().error(msg, meta),
  fatal: (msg, meta) => getActiveLogger().fatal(msg, meta),
  child: (context) => getActiveLogger().child(context),
};

export type SocketEventHandler<T = unknown> = (payload: T, ...args: unknown[]) => void;

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

export function dispatchEvent(event: string, ...args: unknown[]): void {
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

export function clearEventSubscribers(): void {
  eventSubscribers.clear();
}

// ----------------------------------------------------------------------------
// Inbound Socket Payload Validation Schemas (MAJ-029 / MIN-025)
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
  logLevel?: 'info' | 'warn' | 'error' | ((data: T) => 'info' | 'warn' | 'error');
  getContext?: (data: T) => Record<string, unknown>;
  transform?: (data: T) => TDispatched;
  onValid?: (data: T) => void;
}

/**
 * Higher-order factory to deduplicate socket event ingress handlers (MAJ-034).
 * Standardizes duration and durationMs field aliases (ENH-006).
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
      duration: durationMs,
      durationMs,
      ...(getContext ? getContext(data) : {}),
    };

    const resolvedLogLevel = typeof logLevel === 'function' ? logLevel(data) : logLevel;
    if (resolvedLogLevel === 'error') {
      logger.error(logMessage, context);
    } else if (resolvedLogLevel === 'warn') {
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

// Hook for setting lastError on error event
let lastErrorCallback: ((err: SocketErrorPayload) => void) | null = null;
export function setInboundLastErrorCallback(cb: ((err: SocketErrorPayload) => void) | null): void {
  lastErrorCallback = cb;
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
  logLevel: (err: { code: string; message: string }) =>
    err.code === 'ERR_INTERNAL_SERVER' ? 'error' : 'warn',
  getContext: (err: { code: string; message: string }) => ({
    errorCode: err.code,
    errorMessage: err.message,
  }),
  onValid: (err) => {
    if (lastErrorCallback) {
      lastErrorCallback(err as unknown as SocketErrorPayload);
    }
  },
  transform: (err) => err as unknown as SocketErrorPayload,
});

export const inboundEventHandlers: Record<string, (...args: unknown[]) => void> = {
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

interface SocketWithManager {
  on(event: string, fn: (...args: unknown[]) => void): void;
  off?(event: string, fn: (...args: unknown[]) => void): void;
  io?: {
    on?(event: string, fn: (...args: unknown[]) => void): void;
    off?(event: string, fn: (...args: unknown[]) => void): void;
  };
}

const attachedSockets = new WeakSet<object>();

export function attachSocketListeners(
  targetSocket: TypedSocket,
  lifecycleHandlers: Record<string, (...args: unknown[]) => void> = {},
  managerHandlers: Record<string, (...args: unknown[]) => void> = {}
): void {
  if (attachedSockets.has(targetSocket)) {
    return;
  }
  attachedSockets.add(targetSocket);

  const sock = targetSocket as unknown as SocketWithManager;

  // Attach lifecycle handlers (connect, disconnect, connect_error)
  for (const [event, handler] of Object.entries(lifecycleHandlers)) {
    sock.on(event, handler);
  }

  // Attach inbound domain event handlers
  for (const [event, handler] of Object.entries(inboundEventHandlers)) {
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

export function detachSocketListeners(
  targetSocket: TypedSocket,
  lifecycleHandlers: Record<string, (...args: unknown[]) => void> = {},
  managerHandlers: Record<string, (...args: unknown[]) => void> = {}
): void {
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
    for (const [event, handler] of Object.entries(lifecycleHandlers)) {
      sock.off(event, handler);
    }
    for (const [event, handler] of Object.entries(inboundEventHandlers)) {
      sock.off(event, handler);
    }
  }
}
