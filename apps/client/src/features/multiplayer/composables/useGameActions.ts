/**
 * Game actions composable for Fun Chess multiplayer.
 * Encapsulates in-game state, chess move execution with monotonic sequence guard (MAJ-031),
 * draw offers, resignations, rematches, and domain move subscription (MAJ-009).
 *
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Findings MAJ-009, MAJ-031, MIN-030.
 */

import { ref, shallowRef, computed, type ComputedRef } from 'vue';
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
import { generateCorrelationId, logger } from '@/platform/telemetry';
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
registerSocketEventListener('game:started', () => {
  lastGameOver.value = null;
  kingInCheck.value = null;
  drawOfferedBy.value = null;
  rematchRequestedBy.value = null;
});

registerSocketEventListener('game:moved', (data: { move: MoveResult; gameState: GameState }) => {
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
        console.warn('[useSocket] Error in onOpponentMove listener:', err);
      }
    });
  }
});

registerSocketEventListener('game:check', (data: { inCheck: PieceColor; kingSquare: string }) => {
  kingInCheck.value = data;
});

registerSocketEventListener('game:over', (payload: GameOverPayload) => {
  lastGameOver.value = payload;
  drawOfferedBy.value = null;
});

registerSocketEventListener('game:draw_offered', (data: { fromPlayerId: string; fromPlayerName: string }) => {
  drawOfferedBy.value = data;
});

registerSocketEventListener('game:draw_declined', () => {
  drawOfferedBy.value = null;
});

registerSocketEventListener('game:rematch_requested', (data: { requestedBy: string; requesterName: string }) => {
  rematchRequestedBy.value = data;
});

registerSocketEventListener('game:rematch_started', (payload: unknown) => {
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
});

registerSocketEventListener('game:rematch_declined', () => {
  rematchRequestedBy.value = null;
});

registerSocketEventListener('room:reconnected', (data: { room: RoomState; player: Player }) => {
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
});

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
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();

  logger.debug('Making move', {
    operation: 'socket_game_move',
    correlationId,
    roomCode,
    move,
    expectedMoveNumber,
    idempotencyKey,
  });

  // Zod validation before transmission (MIN-030, MAJ-031)
  const validationPayload: Record<string, unknown> = { roomCode, move };
  if (expectedMoveNumber !== undefined) {
    validationPayload.expectedMoveNumber = expectedMoveNumber;
  }
  if (idempotencyKey !== undefined) {
    validationPayload.idempotencyKey = idempotencyKey;
  }

  let validationResult = MakeMoveRequestSchema.safeParse(validationPayload);
  if (!validationResult.success && typeof idempotencyKey === 'string') {
    const baseResult = MakeMoveRequestSchema.safeParse({
      roomCode,
      move,
      expectedMoveNumber,
    });
    if (baseResult.success) {
      validationResult = {
        success: true,
        data: {
          ...baseResult.data,
          idempotencyKey,
        },
      } as any;
    }
  }

  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    transport.lastError.value = err;
    logger.warn('Make move validation failed', {
      operation: 'socket_game_move',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    const failRes = { success: false as const, error: err };
    if (callback) callback(failRes);
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
    logger.warn('Make move failed: socket not connected', {
      operation: 'socket_game_move',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    const failRes = { success: false as const, error: err };
    if (callback) callback(failRes);
    return failRes;
  }

  return transport.emitWithTimeout<
    MakeMoveRequest,
    { success: true; moveResult: MoveResult } | { success: false; error: SocketErrorPayload }
  >(s, 'game:move', validationResult.data, {
    timeoutMs: 8000,
    timeoutMessage: 'Move submission timed out.',
    operation: 'socket_game_move',
    correlationId,
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
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();

  logger.debug('Resigning game', {
    operation: 'socket_game_resign',
    correlationId,
    roomCode,
  });

  // Zod validation before transmission (MIN-030)
  const validationResult = ResignRequestSchema.safeParse({ roomCode });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    transport.lastError.value = err;
    logger.warn('Resign validation failed', {
      operation: 'socket_game_resign',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    if (callback) callback({ success: false, error: err });
    return;
  }

  if (transport.socket.value) {
    if (callback) {
      transport.emitWithTimeout<
        ResignRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(transport.socket.value, 'game:resign', validationResult.data, {
        timeoutMs: 8000,
        timeoutMessage: 'Resign timed out.',
        operation: 'socket_game_resign',
        correlationId,
        callback,
      });
    } else {
      transport.socket.value.emit('game:resign', validationResult.data);
      logger.info('Resign dispatched', {
        operation: 'socket_game_resign',
        correlationId,
        duration: Date.now() - startTime,
      });
    }
  }
}

/**
 * Offers a draw to the opponent.
 */
export function offerDraw(
  roomCode: string,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();

  logger.debug('Offering draw', {
    operation: 'socket_game_offer_draw',
    correlationId,
    roomCode,
  });

  // Zod validation before transmission (MIN-030)
  const validationResult = OfferDrawRequestSchema.safeParse({ roomCode });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    transport.lastError.value = err;
    logger.warn('Offer draw validation failed', {
      operation: 'socket_game_offer_draw',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    if (callback) callback({ success: false, error: err });
    return;
  }

  if (transport.socket.value) {
    if (callback) {
      transport.emitWithTimeout<
        OfferDrawRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(transport.socket.value, 'game:offer_draw', validationResult.data, {
        timeoutMs: 8000,
        timeoutMessage: 'Draw offer timed out.',
        operation: 'socket_game_offer_draw',
        correlationId,
        callback,
      });
    } else {
      transport.socket.value.emit('game:offer_draw', validationResult.data);
      logger.info('Offer draw dispatched', {
        operation: 'socket_game_offer_draw',
        correlationId,
        duration: Date.now() - startTime,
      });
    }
  }
}

/**
 * Responds to an opponent's draw offer.
 */
export function respondDraw(
  roomCode: string,
  accept: boolean,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();

  logger.debug('Responding to draw offer', {
    operation: 'socket_game_respond_draw',
    correlationId,
    roomCode,
    accept,
  });

  // Zod validation before transmission (MIN-030)
  const validationResult = RespondDrawRequestSchema.safeParse({ roomCode, accept });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    transport.lastError.value = err;
    logger.warn('Respond draw validation failed', {
      operation: 'socket_game_respond_draw',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    if (callback) callback({ success: false, error: err });
    return;
  }

  if (transport.socket.value) {
    if (callback) {
      transport.emitWithTimeout<
        RespondDrawRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(transport.socket.value, 'game:respond_draw', validationResult.data, {
        timeoutMs: 8000,
        timeoutMessage: 'Draw response timed out.',
        operation: 'socket_game_respond_draw',
        correlationId,
        callback,
      });
    } else {
      transport.socket.value.emit('game:respond_draw', validationResult.data);
      logger.info('Respond draw dispatched', {
        operation: 'socket_game_respond_draw',
        correlationId,
        duration: Date.now() - startTime,
      });
    }
    drawOfferedBy.value = null;
  }
}

/**
 * Requests a rematch after match conclusion.
 */
export function requestRematch(
  roomCode: string,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();

  logger.debug('Requesting rematch', {
    operation: 'socket_game_request_rematch',
    correlationId,
    roomCode,
  });

  // Zod validation before transmission (MIN-030)
  const validationResult = RequestRematchRequestSchema.safeParse({ roomCode });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    transport.lastError.value = err;
    logger.warn('Request rematch validation failed', {
      operation: 'socket_game_request_rematch',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    if (callback) callback({ success: false, error: err });
    return;
  }

  if (transport.socket.value) {
    if (callback) {
      transport.emitWithTimeout<
        RequestRematchRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(transport.socket.value, 'game:request_rematch', validationResult.data, {
        timeoutMs: 8000,
        timeoutMessage: 'Rematch request timed out.',
        operation: 'socket_game_request_rematch',
        correlationId,
        callback,
      });
    } else {
      transport.socket.value.emit('game:request_rematch', validationResult.data);
      logger.info('Request rematch dispatched', {
        operation: 'socket_game_request_rematch',
        correlationId,
        duration: Date.now() - startTime,
      });
    }
  }
}

/**
 * Responds to a received rematch request.
 */
export function respondRematch(
  roomCode: string,
  accept: boolean,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();

  logger.debug('Responding to rematch request', {
    operation: 'socket_game_respond_rematch',
    correlationId,
    roomCode,
    accept,
  });

  // Zod validation before transmission (MIN-030)
  const validationResult = RespondRematchRequestSchema.safeParse({ roomCode, accept });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    transport.lastError.value = err;
    logger.warn('Respond rematch validation failed', {
      operation: 'socket_game_respond_rematch',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    if (callback) callback({ success: false, error: err });
    return;
  }

  if (transport.socket.value) {
    if (callback) {
      transport.emitWithTimeout<
        RespondRematchRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(transport.socket.value, 'game:respond_rematch', validationResult.data, {
        timeoutMs: 8000,
        timeoutMessage: 'Rematch response timed out.',
        operation: 'socket_game_respond_rematch',
        correlationId,
        callback,
      });
    } else {
      transport.socket.value.emit('game:respond_rematch', validationResult.data);
      logger.info('Respond rematch dispatched', {
        operation: 'socket_game_respond_rematch',
        correlationId,
        duration: Date.now() - startTime,
      });
    }
    rematchRequestedBy.value = null;
  }
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
}

/**
 * Primary composable exposing game action controls and in-game state.
 */
export function useGameActions() {
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
    requestRematch,
    respondRematch,
    resetGameActionsState,
  };
}
