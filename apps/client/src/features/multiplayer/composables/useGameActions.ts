/**
 * Game actions composable for Fun Chess multiplayer.
 * Encapsulates in-game state, chess move execution with monotonic sequence guard (MAJ-031),
 * draw offers, resignations, rematches, and domain move subscription (MAJ-009).
 *
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Findings MAJ-009, MAJ-031, MIN-030.
 */

import { ref, shallowRef, computed, getCurrentInstance, type ComputedRef } from 'vue';
import type { z } from 'zod';
import type {
  GameOverPayload,
  GameState,
  MakeMoveRequest,
  MovePayload,
  MoveResult,
  OfferDrawRequest,
  PieceColor,
  Player,
  RequestRematchRequest,
  ResignRequest,
  RespondDrawRequest,
  RespondRematchRequest,
  RoomState,
  SocketErrorPayload,
} from '@fun-chess/shared';
import {
  MakeMoveRequestSchema,
  ResignRequestSchema,
  OfferDrawRequestSchema,
  RespondDrawRequestSchema,
  RequestRematchRequestSchema,
  RespondRematchRequestSchema,
} from '@fun-chess/shared';
import { useInjectLogger } from '@/platform/di';
import { generateCorrelationId, logger as defaultLogger, type ILogger } from '@/platform/telemetry';

let customLogger: ILogger | null = null;
export function setGameActionsLogger(logger: ILogger | null): void {
  customLogger = logger;
}

function getActiveLogger(): ILogger {
  return customLogger ?? (getCurrentInstance() ? useInjectLogger() : defaultLogger);
}

const logger: ILogger = {
  debug: (msg, meta) => getActiveLogger().debug(msg, meta),
  info: (msg, meta) => getActiveLogger().info(msg, meta),
  warn: (msg, meta) => getActiveLogger().warn(msg, meta),
  error: (msg, meta) => getActiveLogger().error(msg, meta),
  fatal: (msg, meta) => getActiveLogger().fatal(msg, meta),
  child: (context) => getActiveLogger().child(context),
};

import {
  useSocketTransport,
  registerSocketEventListener,
} from './useSocketTransport';
import {
  useRoomSession,
  createValidationError,
  getSavedSession,
  saveSession,
} from './useRoomSession';

export type OpponentMoveCallback = (data: { move: MoveResult; gameState: GameState }) => void;

// ----------------------------------------------------------------------------
// Module-Singleton In-Game Reactive State (MAJ-013)
// ----------------------------------------------------------------------------
const drawOfferedBy = ref<{ fromPlayerId: string; fromPlayerName: string } | null>(null);
const rematchRequestedBy = ref<{ requestedBy: string; requesterName: string } | null>(null);
const lastGameOver = ref<GameOverPayload | null>(null);
const kingInCheck = ref<{ inCheck: PieceColor; kingSquare: string } | null>(null);
const lastMoveEvent = shallowRef<{ move: MoveResult; gameState: GameState } | null>(null);
const opponentMoveListeners = new Set<OpponentMoveCallback>();

/**
 * Derived reactive in-game states from RoomSession
 */
const { currentRoom, currentPlayer, sessionToken } = useRoomSession();

const gameState: ComputedRef<GameState | null> = computed(() => {
  return currentRoom.value?.game ?? null;
});

const turn: ComputedRef<PieceColor> = computed(() => {
  return gameState.value?.turn ?? 'w';
});

const isCheck: ComputedRef<boolean> = computed(() => {
  return gameState.value?.isCheck ?? false;
});

const isCheckmate: ComputedRef<boolean> = computed(() => {
  return gameState.value?.isCheckmate ?? false;
});

// ----------------------------------------------------------------------------
// Internal Event Listeners Registration
// ----------------------------------------------------------------------------
function handleGameStarted() {
  lastGameOver.value = null;
  kingInCheck.value = null;
  drawOfferedBy.value = null;
  rematchRequestedBy.value = null;
}

function handleGameMoved(data: { move: MoveResult; gameState: GameState }) {
  // [MAJ-031] Monotonic move sequence guard
  const localMoveCount = currentRoom.value?.game?.moveCount ?? 0;
  if (data.move && typeof data.move.moveNumber === 'number' && data.move.moveNumber < localMoveCount) {
    logger.debug('Stale out-of-order move packet ignored', {
      operation: 'socket_game_moved_guard',
      packetMoveNumber: data.move.moveNumber,
      localMoveCount,
    });
    return;
  }

  if (currentRoom.value) {
    currentRoom.value = {
      ...currentRoom.value,
      game: data.gameState,
    };
  }
  kingInCheck.value = null;
  drawOfferedBy.value = null;
  lastMoveEvent.value = data;

  // [MAJ-009] Decoupled: Dispatch to registered domain event listeners
  if (currentPlayer.value && data.move?.color && data.move.color !== currentPlayer.value.color) {
    opponentMoveListeners.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        logger.warn('Error in onOpponentMove listener', {
          operation: 'socket_opponent_move_listener',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }
}

function handleGameCheck(data: { inCheck: PieceColor; kingSquare: string }) {
  kingInCheck.value = data;
}

function handleGameOver(payload: GameOverPayload) {
  lastGameOver.value = payload;
  drawOfferedBy.value = null;
}

function handleGameDrawOffered(data: { fromPlayerId: string; fromPlayerName: string }) {
  drawOfferedBy.value = data;
}

function handleGameDrawDeclined() {
  drawOfferedBy.value = null;
}

function handleGameRematchRequested(data: { requestedBy: string; requesterName: string }) {
  rematchRequestedBy.value = data;
}

function handleGameRematchStarted(payload: unknown) {
  rematchRequestedBy.value = null;
  drawOfferedBy.value = null;
  lastGameOver.value = null;
  kingInCheck.value = null;

  const data = payload as GameState | { gameState: GameState; room: RoomState };
  if (data && typeof data === 'object' && 'room' in data && (data as { room: RoomState }).room) {
    const rematchPayload = data as { gameState: GameState; room: RoomState };
    currentRoom.value = rematchPayload.room;
    if (currentPlayer.value) {
      if (rematchPayload.room.whitePlayer?.id === currentPlayer.value.id) {
        currentPlayer.value = rematchPayload.room.whitePlayer;
      } else if (rematchPayload.room.blackPlayer?.id === currentPlayer.value.id) {
        currentPlayer.value = rematchPayload.room.blackPlayer;
      }
    }
  } else if (currentRoom.value) {
    currentRoom.value = {
      ...currentRoom.value,
      status: 'playing',
      game: data as GameState,
    };
  }

  // Ensure session is persisted for the rematch game
  const roomCode = currentRoom.value?.roomCode;
  const pId = currentPlayer.value?.id;
  const sToken = sessionToken.value || getSavedSession()?.sessionToken;

  if (roomCode && pId && sToken) {
    sessionToken.value = sToken;
    saveSession({
      roomCode,
      playerId: pId,
      sessionToken: sToken,
    });
  }
}

function handleGameRematchDeclined() {
  rematchRequestedBy.value = null;
}

function handleRoomReconnected(data: { room: RoomState; player: Player }) {
  // Re-hydrate draw offer and rematch request state upon reconnection
  if (data?.room && data?.player) {
    const opponent =
      data.room.whitePlayer?.id === data.player.id
        ? data.room.blackPlayer
        : data.room.whitePlayer;

    if (opponent && data.room.drawOffer && data.room.drawOffer.offeredBy === opponent.id) {
      drawOfferedBy.value = {
        fromPlayerId: opponent.id,
        fromPlayerName: opponent.name,
      };
    } else {
      drawOfferedBy.value = null;
    }

    if (
      opponent &&
      data.room.rematch &&
      data.room.rematch.requestedBy === opponent.id &&
      (data.room.rematch.status ?? 'pending') === 'pending'
    ) {
      rematchRequestedBy.value = {
        requestedBy: opponent.id,
        requesterName: opponent.name,
      };
    } else {
      rematchRequestedBy.value = null;
    }
  }
}

export function initGameActionsListeners(): void {
  registerSocketEventListener('game:started', handleGameStarted);
  registerSocketEventListener('game:moved', handleGameMoved);
  registerSocketEventListener('game:check', handleGameCheck);
  registerSocketEventListener('game:over', handleGameOver);
  registerSocketEventListener('game:draw_offered', handleGameDrawOffered);
  registerSocketEventListener('game:draw_declined', handleGameDrawDeclined);
  registerSocketEventListener('game:rematch_requested', handleGameRematchRequested);
  registerSocketEventListener('game:rematch_started', handleGameRematchStarted);
  registerSocketEventListener('game:rematch_declined', handleGameRematchDeclined);
  registerSocketEventListener('room:reconnected', handleRoomReconnected);
}

// Initial registration on module load
initGameActionsListeners();

// ----------------------------------------------------------------------------
// Public Game Operations
// ----------------------------------------------------------------------------

/**
 * Registers a subscriber for opponent moves (decoupled audio/visual triggers).
 * Returns an unsubscribe cleanup function.
 */
export function onOpponentMove(cb: OpponentMoveCallback): () => void {
  opponentMoveListeners.add(cb);
  return () => {
    opponentMoveListeners.delete(cb);
  };
}

export interface ExecuteSocketActionOptions<
  TReq,
  TRes extends { success: boolean; error?: SocketErrorPayload } = { success: boolean; error?: SocketErrorPayload }
> {
  operation: string;
  event: string;
  schema: z.ZodType<TReq>;
  rawPayload: unknown;
  timeoutMs?: number;
  timeoutMessage: string;
  startLogMessage: string;
  startLogContext?: Record<string, unknown>;
  validationErrorMessage: string;
  notConnectedErrorMessage?: string;
  dispatchedLogMessage?: string;
  alwaysAwaitAck?: boolean;
  callback?: (res: TRes) => void;
  onSuccess?: (res: Extract<TRes, { success: true }>) => void;
  onError?: (err: SocketErrorPayload) => void;
  onSettled?: () => void;
}

/**
 * Higher-order helper to eliminate duplicated action boilerplate across multiplayer actions (MAJ-033).
 */
export async function executeSocketAction<
  TReq,
  TRes extends { success: boolean; error?: SocketErrorPayload } = { success: boolean; error?: SocketErrorPayload }
>(options: ExecuteSocketActionOptions<TReq, TRes>): Promise<TRes> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();
  const {
    operation,
    event,
    schema,
    rawPayload,
    timeoutMs = 8000,
    timeoutMessage,
    startLogMessage,
    startLogContext,
    validationErrorMessage,
    notConnectedErrorMessage = 'Socket action failed: socket not connected',
    dispatchedLogMessage = 'Socket action dispatched',
    alwaysAwaitAck = false,
    callback,
    onSuccess,
    onError,
    onSettled,
  } = options;

  logger.debug(startLogMessage, {
    operation,
    correlationId,
    ...(startLogContext ?? (typeof rawPayload === 'object' && rawPayload !== null ? (rawPayload as Record<string, unknown>) : {})),
  });

  const validationResult = schema.safeParse(rawPayload);
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    transport.lastError.value = err;
    logger.warn(validationErrorMessage, {
      operation,
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    const failRes = { success: false as const, error: err } as unknown as TRes;
    if (callback) callback(failRes);
    onError?.(err);
    onSettled?.();
    return failRes;
  }

  const s = transport.socket.value;
  if (!s || !s.connected) {
    const err: SocketErrorPayload = {
      code: 'ERR_INTERNAL_SERVER',
      message: 'Socket not connected',
      correlationId,
    };
    transport.lastError.value = err;
    logger.warn(notConnectedErrorMessage, {
      operation,
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    const failRes = { success: false as const, error: err } as unknown as TRes;
    if (callback) callback(failRes);
    onError?.(err);
    onSettled?.();
    return failRes;
  }

  if (alwaysAwaitAck || callback) {
    const res = await transport.emitWithTimeout<TReq, TRes>(s, event, validationResult.data, {
      timeoutMs,
      timeoutMessage,
      operation,
      correlationId,
      callback,
      onSuccess,
      onError,
    });
    onSettled?.();
    return res;
  }

  (s as unknown as { emit: (event: string, data: unknown) => void }).emit(event, validationResult.data);
  logger.info(dispatchedLogMessage, {
    operation,
    correlationId,
    duration: Date.now() - startTime,
  });
  onSettled?.();
  return { success: true } as unknown as TRes;
}

/**
 * Executes a chess move with optional monotonic sequence validation and idempotency tokens.
 */
export async function makeMove(
  roomCode: string,
  move: MovePayload,
  expectedMoveNumber?: number,
  idempotencyKey?: string,
  callback?: (res: { success: true; moveResult: MoveResult } | { success: false; error: SocketErrorPayload }) => void
): Promise<{ success: true; moveResult: MoveResult } | { success: false; error: SocketErrorPayload }> {
  const payload: Record<string, unknown> = { roomCode, move };
  if (expectedMoveNumber !== undefined) {
    payload.expectedMoveNumber = expectedMoveNumber;
  }
  if (idempotencyKey !== undefined) {
    payload.idempotencyKey = idempotencyKey;
  }

  return executeSocketAction<
    MakeMoveRequest,
    { success: true; moveResult: MoveResult } | { success: false; error: SocketErrorPayload }
  >({
    operation: 'socket_game_move',
    event: 'game:move',
    schema: MakeMoveRequestSchema,
    rawPayload: payload,
    timeoutMs: 8000,
    timeoutMessage: 'Move submission timed out.',
    startLogMessage: 'Making move',
    startLogContext: { roomCode, move, expectedMoveNumber, idempotencyKey },
    validationErrorMessage: 'Make move validation failed',
    notConnectedErrorMessage: 'Make move failed: socket not connected',
    alwaysAwaitAck: true,
    callback,
  });
}

/**
 * Resigns from the active game.
 */
export function resign(
  roomCode: string,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  void executeSocketAction<ResignRequest, { success: true } | { success: false; error: SocketErrorPayload }>({
    operation: 'socket_game_resign',
    event: 'game:resign',
    schema: ResignRequestSchema,
    rawPayload: { roomCode },
    timeoutMs: 8000,
    timeoutMessage: 'Resign timed out.',
    startLogMessage: 'Resigning game',
    startLogContext: { roomCode },
    validationErrorMessage: 'Resign validation failed',
    dispatchedLogMessage: 'Resign dispatched',
    callback,
  });
}

/**
 * Offers a draw to the opponent.
 */
export function offerDraw(
  roomCode: string,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  void executeSocketAction<OfferDrawRequest, { success: true } | { success: false; error: SocketErrorPayload }>({
    operation: 'socket_game_offer_draw',
    event: 'game:offer_draw',
    schema: OfferDrawRequestSchema,
    rawPayload: { roomCode },
    timeoutMs: 8000,
    timeoutMessage: 'Draw offer timed out.',
    startLogMessage: 'Offering draw',
    startLogContext: { roomCode },
    validationErrorMessage: 'Offer draw validation failed',
    dispatchedLogMessage: 'Offer draw dispatched',
    callback,
  });
}

/**
 * Responds to an opponent's draw offer.
 */
export function respondDraw(
  roomCode: string,
  accept: boolean,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  drawOfferedBy.value = null;
  void executeSocketAction<RespondDrawRequest, { success: true } | { success: false; error: SocketErrorPayload }>({
    operation: 'socket_game_respond_draw',
    event: 'game:respond_draw',
    schema: RespondDrawRequestSchema,
    rawPayload: { roomCode, accept },
    timeoutMs: 8000,
    timeoutMessage: 'Draw response timed out.',
    startLogMessage: 'Responding to draw offer',
    startLogContext: { roomCode, accept },
    validationErrorMessage: 'Respond draw validation failed',
    dispatchedLogMessage: 'Respond draw dispatched',
    callback,
    onSettled: () => {
      drawOfferedBy.value = null;
    },
  });
}

/**
 * Accepts an incoming draw offer.
 */
export function acceptDraw(
  roomCode: string,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  respondDraw(roomCode, true, callback);
}

/**
 * Declines an incoming draw offer.
 */
export function declineDraw(
  roomCode: string,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  respondDraw(roomCode, false, callback);
}

/**
 * Requests a rematch after match conclusion.
 */
export function requestRematch(
  roomCode: string,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  void executeSocketAction<RequestRematchRequest, { success: true } | { success: false; error: SocketErrorPayload }>({
    operation: 'socket_game_request_rematch',
    event: 'game:request_rematch',
    schema: RequestRematchRequestSchema,
    rawPayload: { roomCode },
    timeoutMs: 8000,
    timeoutMessage: 'Rematch request timed out.',
    startLogMessage: 'Requesting rematch',
    startLogContext: { roomCode },
    validationErrorMessage: 'Request rematch validation failed',
    dispatchedLogMessage: 'Request rematch dispatched',
    callback,
  });
}

/**
 * Responds to a received rematch request.
 */
export function respondRematch(
  roomCode: string,
  accept: boolean,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  rematchRequestedBy.value = null;
  void executeSocketAction<RespondRematchRequest, { success: true } | { success: false; error: SocketErrorPayload }>({
    operation: 'socket_game_respond_rematch',
    event: 'game:respond_rematch',
    schema: RespondRematchRequestSchema,
    rawPayload: { roomCode, accept },
    timeoutMs: 8000,
    timeoutMessage: 'Rematch response timed out.',
    startLogMessage: 'Responding to rematch request',
    startLogContext: { roomCode, accept },
    validationErrorMessage: 'Respond rematch validation failed',
    dispatchedLogMessage: 'Respond rematch dispatched',
    callback,
    onSettled: () => {
      rematchRequestedBy.value = null;
    },
  });
}

/**
 * Accepts an incoming rematch request.
 */
export function acceptRematch(
  roomCode: string,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  respondRematch(roomCode, true, callback);
}

/**
 * Declines an incoming rematch request.
 */
export function declineRematch(
  roomCode: string,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  respondRematch(roomCode, false, callback);
}

/**
 * Leaves the active multiplayer room, delegating to useRoomSession.
 */
export async function leaveRoom(
  roomCode: string,
  callback?: (res: { success: boolean }) => void
): Promise<boolean> {
  const { leaveRoom: sessionLeaveRoom } = useRoomSession();
  return sessionLeaveRoom(roomCode, callback);
}

/**
 * Resets in-game reactive states and subscribers.
 */
export function resetGameActionsState(): void {
  drawOfferedBy.value = null;
  rematchRequestedBy.value = null;
  lastGameOver.value = null;
  kingInCheck.value = null;
  lastMoveEvent.value = null;
  opponentMoveListeners.clear();
  customLogger = null;
  initGameActionsListeners();
}

/**
 * Primary composable exposing game action controls and in-game state.
 */
export function useGameActions(options?: { logger?: ILogger }) {
  initGameActionsListeners();
  if (options?.logger) {
    customLogger = options.logger;
  }
  return {
    gameState,
    turn,
    isCheck,
    isCheckmate,
    drawOfferedBy,
    rematchRequestedBy,
    lastGameOver,
    kingInCheck,
    lastMoveEvent,
    onOpponentMove,
    makeMove,
    resign,
    offerDraw,
    respondDraw,
    acceptDraw,
    declineDraw,
    requestRematch,
    respondRematch,
    acceptRematch,
    declineRematch,
    leaveRoom,
    resetGameActionsState,
    initGameActionsListeners,
  };
}
