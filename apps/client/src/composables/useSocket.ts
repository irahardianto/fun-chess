import { ref, shallowRef } from 'vue';
import type {
  CreateRoomRequest,
  GameOverPayload,
  GameState,
  JoinRoomRequest,
  MakeMoveRequest,
  MovePayload,
  MoveResult,
  OfferDrawRequest,
  PieceColor,
  Player,
  ReconnectRequest,
  RequestRematchRequest,
  ResignRequest,
  RespondDrawRequest,
  RespondRematchRequest,
  RoomState,
  RoomStatus,
  SocketErrorPayload,
  SavedSession,
} from '@fun-chess/shared';
import {
  DEFAULT_PLAYER_AVATAR,
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  ReconnectRequestSchema,
  LeaveRoomRequestSchema,
  MakeMoveRequestSchema,
  ResignRequestSchema,
  OfferDrawRequestSchema,
  RespondDrawRequestSchema,
  RequestRematchRequestSchema,
  RespondRematchRequestSchema,
} from '@fun-chess/shared';
import { createSocketClient, type TypedSocket } from '../platform/socket/socket_client';
import { safeSessionStorage, createSafeStorage, type KeyValueStorage, STORAGE_KEYS } from '../platform/storage';
import { generateCorrelationId, logger } from '../platform/telemetry';

/** Session storage key for persisting fun-chess multiplayer sessions */
export const SESSION_STORAGE_KEY = STORAGE_KEYS.SESSION_TOKEN;

// Re-export SavedSession for consumers
export type { SavedSession };

/**
 * Dynamically resolves session storage adapter (safe in browser & test environments).
 */
function getSessionStorage(): KeyValueStorage {
  if (safeSessionStorage.isAvailable()) {
    return safeSessionStorage;
  }
  const fresh = createSafeStorage('sessionStorage');
  if (fresh.isAvailable()) {
    return fresh;
  }
  return safeSessionStorage;
}

interface ZodValidationErrorLike {
  errors?: Array<{ path: Array<string | number>; message: string }>;
}

/**
 * Formats a Zod validation error into a readable message.
 */
function formatZodError(error: ZodValidationErrorLike): string {
  if (Array.isArray(error.errors)) {
    return error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
  }
  return 'Validation error';
}

/**
 * Creates a standard SocketErrorPayload for client validation rejections.
 */
function createValidationError(error: unknown): SocketErrorPayload {
  return {
    code: 'ERR_INVALID_PAYLOAD',
    message: formatZodError(error as ZodValidationErrorLike),
    correlationId: generateCorrelationId(),
  };
}

/**
 * Retrieves the saved session from sessionStorage if available.
 */
function getSavedSession(): SavedSession | null {
  const storage = getSessionStorage();
  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.roomCode === 'string' &&
      typeof parsed.playerId === 'string' &&
      typeof parsed.sessionToken === 'string'
    ) {
      return parsed as SavedSession;
    }
    return null;
  } catch (err) {
    console.warn('[useSocket] Failed to parse saved session from storage:', err);
    return null;
  }
}

/**
 * Persists active session credentials into sessionStorage.
 */
function saveSession(session: SavedSession): void {
  const storage = getSessionStorage();
  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('[useSocket] Failed to save session to storage:', err);
  }
}

/**
 * Removes the active session credentials from sessionStorage.
 */
function clearSession(): void {
  const storage = getSessionStorage();
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
  } catch (err) {
    console.warn('[useSocket] Failed to clear session from storage:', err);
  }
}

// ----------------------------------------------------------------------------
// Module-Singleton Reactive State (MAJ-013 Fix)
// ----------------------------------------------------------------------------
const socket = shallowRef<TypedSocket | null>(null);
const isConnected = ref(false);
const socketId = ref<string>('');
const currentRoom = ref<RoomState | null>(null);
const currentPlayer = ref<Player | null>(null);
const sessionToken = ref<string | null>(null);
const lastError = ref<SocketErrorPayload | null>(null);

// Additional reactive flags for UI
const drawOfferedBy = ref<{ fromPlayerId: string; fromPlayerName: string } | null>(null);
const rematchRequestedBy = ref<{ requestedBy: string; requesterName: string } | null>(null);
const lastGameOver = ref<GameOverPayload | null>(null);
const kingInCheck = ref<{ inCheck: PieceColor; kingSquare: string } | null>(null);

// Reactive last move event & domain event listener registration (MAJ-009 Fix)
export type OpponentMoveCallback = (data: { move: MoveResult; gameState: GameState }) => void;
const lastMoveEvent = shallowRef<{ move: MoveResult; gameState: GameState } | null>(null);
const opponentMoveListeners = new Set<OpponentMoveCallback>();

/**
 * Registers a subscriber for opponent moves (decoupled audio/visual triggers).
 * Returns an unsubscribe function.
 */
export function onOpponentMove(cb: OpponentMoveCallback): () => void {
  opponentMoveListeners.add(cb);
  return () => {
    opponentMoveListeners.delete(cb);
  };
}

/**
 * Resets the module-singleton state to clean initial values.
 */
export function resetSocketState(): void {
  currentRoom.value = null;
  currentPlayer.value = null;
  sessionToken.value = null;
  lastError.value = null;
  drawOfferedBy.value = null;
  rematchRequestedBy.value = null;
  lastGameOver.value = null;
  kingInCheck.value = null;
  isConnected.value = false;
  socketId.value = '';
  lastMoveEvent.value = null;
  opponentMoveListeners.clear();
}

/**
 * Attempts automatic reconnection if a valid saved session exists in sessionStorage
 * and the current state requires reconnection or synchronization.
 */
function checkAndAutoReconnect(): void {
  const saved = getSavedSession();
  if (!saved) return;

  const currentSockId = socket.value?.id || socketId.value;
  const needsSync =
    !currentRoom.value ||
    currentRoom.value.roomCode !== saved.roomCode ||
    !currentPlayer.value ||
    currentPlayer.value.id !== saved.playerId ||
    currentPlayer.value.socketId !== currentSockId ||
    !currentPlayer.value.isConnected ||
    currentRoom.value.status === 'paused_disconnect';

  if (needsSync) {
    reconnect(saved.roomCode, saved.playerId, saved.sessionToken).catch((err) => {
      console.warn('[useSocket] Auto-reconnect failed:', err);
    });
  }
}

// ----------------------------------------------------------------------------
// Event Handlers
// ----------------------------------------------------------------------------
function handleConnect() {
  isConnected.value = true;
  socketId.value = socket.value?.id || '';
  checkAndAutoReconnect();
}

function handleDisconnect() {
  isConnected.value = false;
}

function handleConnectError(err: Error) {
  isConnected.value = false;
  lastError.value = {
    code: 'ERR_SOCKET_TIMEOUT',
    message: err?.message || 'Connection error',
  };
}

function handleReconnectFailed() {
  isConnected.value = false;
  lastError.value = {
    code: 'ERR_SOCKET_TIMEOUT',
    message: 'Reconnection failed after maximum attempts',
  };
}

function handleRoomCreated(room: RoomState) {
  currentRoom.value = room;
}

function handleRoomJoined(room: RoomState) {
  currentRoom.value = room;
}

function handlePlayerJoined(data: { player: Player; room: RoomState }) {
  currentRoom.value = data.room;
}

function handlePlayerLeft(data?: { playerId?: string; playerName?: string; reason?: string }) {
  // [MAJ-021] Clear departed player from room state
  if (currentRoom.value && data?.playerId) {
    if (currentRoom.value.whitePlayer?.id === data.playerId) {
      currentRoom.value.whitePlayer = null;
    }
    if (currentRoom.value.blackPlayer?.id === data.playerId) {
      currentRoom.value.blackPlayer = null;
    }
    if (currentRoom.value.spectators) {
      currentRoom.value.spectators = currentRoom.value.spectators.filter(
        (s) => s.id !== data.playerId
      );
    }
    if (currentPlayer.value?.id === data.playerId) {
      currentPlayer.value = null;
    }
  }
}

function handlePlayerDisconnected(data: {
  playerId?: string;
  player?: Player;
  gracePeriodMs?: number;
  roomStatus?: string;
  disconnectedAt?: number;
}) {
  if (!currentRoom.value) return;

  const disconnectedId = data?.playerId ?? data?.player?.id;
  if (!disconnectedId) return;

  const isWhite = currentRoom.value.whitePlayer?.id === disconnectedId;
  const isBlack = currentRoom.value.blackPlayer?.id === disconnectedId;
  const isActivePlayer = isWhite || isBlack;

  // Guard the paused_disconnect mutation: only transition currentRoom.value.status to 'paused_disconnect'
  // IF isActivePlayer is true and currentRoom.value.status === 'playing'.
  // If a spectator drops (!isActivePlayer), do NOT transition status to 'paused_disconnect'.
  if (data?.roomStatus && (data.roomStatus as RoomStatus) !== 'paused_disconnect') {
    currentRoom.value = {
      ...currentRoom.value,
      status: data.roomStatus as RoomStatus,
    };
  } else if (isActivePlayer && currentRoom.value.status === 'playing') {
    currentRoom.value = {
      ...currentRoom.value,
      status: 'paused_disconnect',
    };
  }

  // Update connectivity flags accurately
  if (isWhite && currentRoom.value.whitePlayer) {
    currentRoom.value.whitePlayer.isConnected = false;
  }
  if (isBlack && currentRoom.value.blackPlayer) {
    currentRoom.value.blackPlayer.isConnected = false;
  }
  const spectator = currentRoom.value.spectators?.find((s) => s.id === disconnectedId);
  if (spectator) {
    spectator.isConnected = false;
  }
  if (currentPlayer.value?.id === disconnectedId) {
    currentPlayer.value.isConnected = false;
  }
}

function handlePlayerReconnected(data: {
  playerId: string;
  playerName: string;
  roomStatus?: string;
}) {
  if (!currentRoom.value) return;

  if (currentRoom.value.whitePlayer?.id === data.playerId) {
    currentRoom.value.whitePlayer.isConnected = true;
  }
  if (currentRoom.value.blackPlayer?.id === data.playerId) {
    currentRoom.value.blackPlayer.isConnected = true;
  }
  const spectator = currentRoom.value.spectators?.find((s) => s.id === data.playerId);
  if (spectator) {
    spectator.isConnected = true;
  }
  if (currentPlayer.value?.id === data.playerId) {
    currentPlayer.value.isConnected = true;
  }

  // If data.roomStatus is provided and authoritative, reconcile
  if (data.roomStatus) {
    currentRoom.value = {
      ...currentRoom.value,
      status: data.roomStatus as RoomStatus,
    };
  } else if (
    currentRoom.value.status === 'paused_disconnect' &&
    currentRoom.value.whitePlayer?.isConnected &&
    currentRoom.value.blackPlayer?.isConnected
  ) {
    // [MAJ-001] Only transition back to playing if it was paused_disconnect and both players connected
    currentRoom.value = {
      ...currentRoom.value,
      status: 'playing',
    };
  }
}

function handleRoomReconnected(data: {
  room: RoomState;
  player: Player;
  roomStatus?: string;
}) {
  if (data?.room) {
    currentRoom.value = data.room;
    if (data.roomStatus) {
      currentRoom.value = {
        ...currentRoom.value,
        status: data.roomStatus as RoomStatus,
      };
    }
  }
  if (data?.player) {
    currentPlayer.value = data.player;
  }

  // [CRIT-003] Re-hydrate draw offer and rematch request state upon reconnection
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

function handleGameStarted(gameState: GameState) {
  if (currentRoom.value) {
    currentRoom.value = {
      ...currentRoom.value,
      status: 'playing',
      game: gameState,
    };
  }
  lastGameOver.value = null;
  kingInCheck.value = null;
}

function handleGameMoved(data: { move: MoveResult; gameState: GameState }) {
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
        console.warn('[useSocket] Error in onOpponentMove listener:', err);
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
  if (currentRoom.value) {
    currentRoom.value = {
      ...currentRoom.value,
      status: 'game_over',
    };
  }
  // [CRIT-005] Retain session credentials throughout game_over and rematch_pending states.
  // clearSession() is NOT called here.
}

function handleDrawOffered(data: { fromPlayerId: string; fromPlayerName: string }) {
  drawOfferedBy.value = data;
}

function handleDrawDeclined(_data?: { byPlayerId?: string }) {
  drawOfferedBy.value = null;
}

function handleRematchRequested(data: { requestedBy: string; requesterName: string }) {
  rematchRequestedBy.value = data;
}

function handleRematchStarted(payload: unknown) {
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

  // [ENH-014] Ensure session is persisted for the rematch game without obsolete player cast
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

function handleRematchDeclined(_data?: { byPlayerId?: string }) {
  rematchRequestedBy.value = null;
}

function handleError(err: SocketErrorPayload) {
  lastError.value = err;
}

const eventHandlers: Record<string, (...args: any[]) => void> = {
  'connect': handleConnect,
  'disconnect': handleDisconnect,
  'connect_error': handleConnectError,
  'reconnect_failed': handleReconnectFailed,
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
  'error': handleError,
};

const attachedSockets = new WeakSet<object>();

function attachListeners(s: TypedSocket): void {
  if (attachedSockets.has(s)) {
    return;
  }
  attachedSockets.add(s);

  for (const [event, handler] of Object.entries(eventHandlers)) {
    (s as any).on(event, handler);
  }
}

function detachListeners(s: TypedSocket): void {
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
// Public Action Operations (Validated with shared Zod schemas per MIN-030)
// ----------------------------------------------------------------------------
function initSocket(url?: string, correlationId?: string): TypedSocket {
  if (!socket.value) {
    socket.value = createSocketClient({
      url,
      correlationId: correlationId || generateCorrelationId(),
    });
  }
  attachListeners(socket.value);
  return socket.value;
}

function connect(url?: string): void {
  const s = socket.value || initSocket(url);
  if (!s.connected) {
    s.connect();
  }
}

function disconnect(): void {
  if (socket.value) {
    socket.value.disconnect();
    isConnected.value = false;
  }
}

interface EmitWithTimeoutOptions<TRes extends { success: boolean; error?: SocketErrorPayload }> {
  timeoutMs?: number;
  timeoutMessage: string;
  operation: string;
  correlationId: string;
  callback?: (res: TRes) => void;
  onSuccess?: (res: Extract<TRes, { success: true }>) => void;
  onError?: (err: SocketErrorPayload) => void;
}

/**
 * Standard socket emit with timeout handling and 3-point structured logging.
 * Supports synchronous or asynchronous acknowledgments and invokes optional callbacks immediately.
 */
function emitWithTimeout<TReq, TRes extends { success: boolean; error?: SocketErrorPayload }>(
  s: TypedSocket,
  event: any,
  payload: TReq,
  options: EmitWithTimeoutOptions<TRes>
): Promise<TRes> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const startTime = Date.now();
  const { operation, correlationId, callback } = options;

  return new Promise<TRes>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const duration = Date.now() - startTime;
      const err: SocketErrorPayload = {
        code: 'ERR_SOCKET_TIMEOUT',
        message: options.timeoutMessage,
      };
      lastError.value = err;
      logger.warn(`${operation} failed: timeout`, {
        operation,
        correlationId,
        duration,
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

      if (res && res.success) {
        logger.info(`${operation} succeeded`, {
          operation,
          correlationId,
          duration,
        });
        options.onSuccess?.(res as Extract<TRes, { success: true }>);
      } else {
        const errPayload: SocketErrorPayload = res?.error ?? {
          code: 'ERR_INTERNAL_SERVER',
          message: `${operation} failed`,
          correlationId,
        };
        lastError.value = errPayload;
        logger.warn(`${operation} failed`, {
          operation,
          correlationId,
          duration,
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

async function createRoom(
  playerName: string,
  preferredColor: 'w' | 'b' | 'random' = 'random',
  avatar: string = DEFAULT_PLAYER_AVATAR
): Promise<{ success: true; room: RoomState; sessionToken: string } | { success: false; error: SocketErrorPayload }> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  logger.debug('Creating room', {
    operation: 'socket_room_create',
    correlationId,
    playerName,
  });

  // [MIN-030] Zod validation before transmission
  const validationResult = CreateRoomRequestSchema.safeParse({
    playerName,
    preferredColor: preferredColor || 'random',
    avatar: avatar || DEFAULT_PLAYER_AVATAR,
  });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    lastError.value = err;
    logger.warn('Create room validation failed', {
      operation: 'socket_room_create',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    return { success: false, error: err };
  }

  const s = socket.value || initSocket();
  if (!s.connected) s.connect();

  return emitWithTimeout<
    CreateRoomRequest,
    | { success: true; room: RoomState; sessionToken: string }
    | { success: false; error: SocketErrorPayload }
  >(s, 'room:create', validationResult.data, {
    timeoutMs: 8000,
    timeoutMessage: 'Connection timed out. Please ensure the server is running.',
    operation: 'socket_room_create',
    correlationId,
    onSuccess: (res) => {
      currentRoom.value = res.room;
      sessionToken.value = res.sessionToken;
      if (res.room.whitePlayer?.socketId === s.id) {
        currentPlayer.value = res.room.whitePlayer;
      } else if (res.room.blackPlayer?.socketId === s.id) {
        currentPlayer.value = res.room.blackPlayer;
      }
      const playerId = currentPlayer.value?.id || res.room.hostId;
      saveSession({
        roomCode: res.room.roomCode,
        playerId,
        sessionToken: res.sessionToken,
      });
    },
  });
}

async function joinRoom(
  roomCode: string,
  playerName: string,
  avatar: string = DEFAULT_PLAYER_AVATAR
): Promise<{ success: true; room: RoomState; player: Player; sessionToken: string } | { success: false; error: SocketErrorPayload }> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  logger.debug('Joining room', {
    operation: 'socket_room_join',
    correlationId,
    roomCode,
    playerName,
  });

  // [MIN-030] Zod validation before transmission
  const validationResult = JoinRoomRequestSchema.safeParse({
    roomCode,
    playerName,
    avatar: avatar || DEFAULT_PLAYER_AVATAR,
  });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    lastError.value = err;
    logger.warn('Join room validation failed', {
      operation: 'socket_room_join',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    return { success: false, error: err };
  }

  const s = socket.value || initSocket();
  if (!s.connected) s.connect();

  return emitWithTimeout<
    JoinRoomRequest,
    | { success: true; room: RoomState; player: Player; sessionToken: string }
    | { success: false; error: SocketErrorPayload }
  >(s, 'room:join', validationResult.data, {
    timeoutMs: 8000,
    timeoutMessage: 'Connection timed out. Please check the room code and try again.',
    operation: 'socket_room_join',
    correlationId,
    onSuccess: (res) => {
      currentRoom.value = res.room;
      currentPlayer.value = res.player;
      sessionToken.value = res.sessionToken;
      saveSession({
        roomCode: res.room.roomCode,
        playerId: res.player.id,
        sessionToken: res.sessionToken,
      });
    },
  });
}

async function makeMove(
  roomCode: string,
  move: MovePayload
): Promise<{ success: true; moveResult: MoveResult } | { success: false; error: SocketErrorPayload }> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  logger.debug('Making move', {
    operation: 'socket_game_move',
    correlationId,
    roomCode,
    move,
  });

  // [MIN-030] Zod validation before transmission
  const validationResult = MakeMoveRequestSchema.safeParse({ roomCode, move });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    lastError.value = err;
    logger.warn('Make move validation failed', {
      operation: 'socket_game_move',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    return { success: false, error: err };
  }

  const s = socket.value;
  if (!s || !s.connected) {
    const err: SocketErrorPayload = {
      code: 'ERR_INTERNAL_SERVER',
      message: 'Socket not connected',
      correlationId,
    };
    lastError.value = err;
    logger.warn('Make move failed: socket not connected', {
      operation: 'socket_game_move',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    return {
      success: false,
      error: err,
    };
  }

  return emitWithTimeout<
    MakeMoveRequest,
    { success: true; moveResult: MoveResult } | { success: false; error: SocketErrorPayload }
  >(s, 'game:move', validationResult.data, {
    timeoutMs: 8000,
    timeoutMessage: 'Move submission timed out.',
    operation: 'socket_game_move',
    correlationId,
  });
}

async function reconnect(
  roomCode: string,
  playerId: string,
  token: string
): Promise<{ success: true; room: RoomState; player: Player } | { success: false; error: SocketErrorPayload }> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  logger.debug('Reconnecting room', {
    operation: 'socket_room_reconnect',
    correlationId,
    roomCode,
    playerId,
  });

  // [MIN-030] Zod validation before transmission
  const validationResult = ReconnectRequestSchema.safeParse({
    roomCode,
    playerId,
    sessionToken: token,
  });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    lastError.value = err;
    logger.warn('Reconnect validation failed', {
      operation: 'socket_room_reconnect',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    return { success: false, error: err };
  }

  const s = socket.value || initSocket();
  if (!s.connected) s.connect();

  return emitWithTimeout<
    ReconnectRequest,
    { success: true; room: RoomState; player: Player } | { success: false; error: SocketErrorPayload }
  >(s, 'room:reconnect', validationResult.data, {
    timeoutMs: 8000,
    timeoutMessage: 'Reconnection timed out.',
    operation: 'socket_room_reconnect',
    correlationId,
    onSuccess: (res) => {
      currentRoom.value = res.room;
      currentPlayer.value = res.player;
      sessionToken.value = token;
      saveSession({
        roomCode: res.room.roomCode,
        playerId: res.player.id,
        sessionToken: token,
      });
    },
    onError: (err) => {
      if (
        err.code === 'ERR_ROOM_NOT_FOUND' ||
        err.code === 'ERR_UNAUTHORIZED'
      ) {
        clearSession();
      }
    },
  });
}

function resign(
  roomCode: string,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  logger.debug('Resigning game', {
    operation: 'socket_game_resign',
    correlationId,
    roomCode,
  });

  // [MIN-030] Zod validation before transmission
  const validationResult = ResignRequestSchema.safeParse({ roomCode });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    lastError.value = err;
    logger.warn('Resign validation failed', {
      operation: 'socket_game_resign',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    if (callback) callback({ success: false, error: err });
    return;
  }

  if (socket.value) {
    if (callback) {
      emitWithTimeout<
        ResignRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(socket.value, 'game:resign', validationResult.data, {
        timeoutMs: 8000,
        timeoutMessage: 'Resign timed out.',
        operation: 'socket_game_resign',
        correlationId,
        callback,
      });
    } else {
      socket.value.emit('game:resign', validationResult.data);
      logger.info('Resign dispatched', {
        operation: 'socket_game_resign',
        correlationId,
        duration: Date.now() - startTime,
      });
    }
  }
}

function offerDraw(
  roomCode: string,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  logger.debug('Offering draw', {
    operation: 'socket_game_offer_draw',
    correlationId,
    roomCode,
  });

  // [MIN-030] Zod validation before transmission
  const validationResult = OfferDrawRequestSchema.safeParse({ roomCode });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    lastError.value = err;
    logger.warn('Offer draw validation failed', {
      operation: 'socket_game_offer_draw',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    if (callback) callback({ success: false, error: err });
    return;
  }

  if (socket.value) {
    if (callback) {
      emitWithTimeout<
        OfferDrawRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(socket.value, 'game:offer_draw', validationResult.data, {
        timeoutMs: 8000,
        timeoutMessage: 'Draw offer timed out.',
        operation: 'socket_game_offer_draw',
        correlationId,
        callback,
      });
    } else {
      socket.value.emit('game:offer_draw', validationResult.data);
      logger.info('Offer draw dispatched', {
        operation: 'socket_game_offer_draw',
        correlationId,
        duration: Date.now() - startTime,
      });
    }
  }
}

function respondDraw(
  roomCode: string,
  accept: boolean,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  logger.debug('Responding to draw offer', {
    operation: 'socket_game_respond_draw',
    correlationId,
    roomCode,
    accept,
  });

  // [MIN-030] Zod validation before transmission
  const validationResult = RespondDrawRequestSchema.safeParse({ roomCode, accept });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    lastError.value = err;
    logger.warn('Respond draw validation failed', {
      operation: 'socket_game_respond_draw',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    if (callback) callback({ success: false, error: err });
    return;
  }

  if (socket.value) {
    if (callback) {
      emitWithTimeout<
        RespondDrawRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(socket.value, 'game:respond_draw', validationResult.data, {
        timeoutMs: 8000,
        timeoutMessage: 'Draw response timed out.',
        operation: 'socket_game_respond_draw',
        correlationId,
        callback,
      });
    } else {
      socket.value.emit('game:respond_draw', validationResult.data);
      logger.info('Respond draw dispatched', {
        operation: 'socket_game_respond_draw',
        correlationId,
        duration: Date.now() - startTime,
      });
    }
    drawOfferedBy.value = null;
  }
}

function requestRematch(
  roomCode: string,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  logger.debug('Requesting rematch', {
    operation: 'socket_game_request_rematch',
    correlationId,
    roomCode,
  });

  // [MIN-030] Zod validation before transmission
  const validationResult = RequestRematchRequestSchema.safeParse({ roomCode });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    lastError.value = err;
    logger.warn('Request rematch validation failed', {
      operation: 'socket_game_request_rematch',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    if (callback) callback({ success: false, error: err });
    return;
  }

  if (socket.value) {
    if (callback) {
      emitWithTimeout<
        RequestRematchRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(socket.value, 'game:request_rematch', validationResult.data, {
        timeoutMs: 8000,
        timeoutMessage: 'Rematch request timed out.',
        operation: 'socket_game_request_rematch',
        correlationId,
        callback,
      });
    } else {
      socket.value.emit('game:request_rematch', validationResult.data);
      logger.info('Request rematch dispatched', {
        operation: 'socket_game_request_rematch',
        correlationId,
        duration: Date.now() - startTime,
      });
    }
  }
}

function respondRematch(
  roomCode: string,
  accept: boolean,
  callback?: (res: { success: true } | { success: false; error: SocketErrorPayload }) => void
): void {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  logger.debug('Responding to rematch request', {
    operation: 'socket_game_respond_rematch',
    correlationId,
    roomCode,
    accept,
  });

  // [MIN-030] Zod validation before transmission
  const validationResult = RespondRematchRequestSchema.safeParse({ roomCode, accept });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    lastError.value = err;
    logger.warn('Respond rematch validation failed', {
      operation: 'socket_game_respond_rematch',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    if (callback) callback({ success: false, error: err });
    return;
  }

  if (socket.value) {
    if (callback) {
      emitWithTimeout<
        RespondRematchRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(socket.value, 'game:respond_rematch', validationResult.data, {
        timeoutMs: 8000,
        timeoutMessage: 'Rematch response timed out.',
        operation: 'socket_game_respond_rematch',
        correlationId,
        callback,
      });
    } else {
      socket.value.emit('game:respond_rematch', validationResult.data);
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
 * Leaves the active multiplayer room, emits room:leave with acknowledgment callback
 * and 2000ms timeout before clearing local session credentials (MAJ-025).
 */
async function leaveRoom(
  roomCode: string,
  callback?: (res: { success: boolean }) => void
): Promise<boolean> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  logger.debug('Leaving room', {
    operation: 'socket_room_leave',
    correlationId,
    roomCode,
  });

  // [MIN-030] Zod validation before transmission
  const validationResult = LeaveRoomRequestSchema.safeParse({ roomCode });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    lastError.value = err;
    logger.warn('Leave room validation failed', {
      operation: 'socket_room_leave',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    if (callback) callback({ success: false });
    return false;
  }

  const code = validationResult.data.roomCode;
  const s = socket.value;
  if (!s || !s.connected) {
    currentRoom.value = null;
    currentPlayer.value = null;
    sessionToken.value = null;
    clearSession();
    logger.info('Leave room succeeded (socket disconnected)', {
      operation: 'socket_room_leave',
      correlationId,
      duration: Date.now() - startTime,
    });
    if (callback) callback({ success: true });
    return true;
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finalize = (success: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      currentRoom.value = null;
      currentPlayer.value = null;
      sessionToken.value = null;
      clearSession();
      if (success) {
        logger.info('Leave room succeeded', {
          operation: 'socket_room_leave',
          correlationId,
          duration,
        });
      } else {
        logger.warn('Leave room failed', {
          operation: 'socket_room_leave',
          correlationId,
          duration,
          error: 'Server returned failure',
        });
      }
      if (callback) callback({ success });
      resolve(success);
    };

    const timer = setTimeout(() => {
      finalize(true);
    }, 2000);

    s.emit('room:leave', { roomCode: code }, (res?: { success?: boolean }) => {
      finalize(res?.success !== false);
    });
  });
}

/**
 * Primary Vue 3 composable for managing WebSocket connection, room lifecycle,
 * move synchronization, chat/draw/rematch offers, and session persistence.
 *
 * All instances share module-singleton reactive state (MAJ-013).
 *
 * @param injectedSocket - Optional pre-existing socket instance (primarily for testing)
 */
export function useSocket(injectedSocket?: TypedSocket) {
  if (injectedSocket) {
    if (socket.value && socket.value !== injectedSocket) {
      detachListeners(socket.value);
      resetSocketState();
    }
    socket.value = injectedSocket;
    attachListeners(injectedSocket);
    isConnected.value = injectedSocket.connected;
    socketId.value = injectedSocket.id || '';
    if (injectedSocket.connected) {
      checkAndAutoReconnect();
    }
  }

  return {
    socket,
    isConnected,
    socketId,
    currentRoom,
    currentPlayer,
    sessionToken,
    lastError,
    drawOfferedBy,
    rematchRequestedBy,
    lastGameOver,
    kingInCheck,
    lastMoveEvent,
    onOpponentMove,
    initSocket,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    makeMove,
    reconnect,
    resign,
    offerDraw,
    respondDraw,
    requestRematch,
    respondRematch,
    leaveRoom,
  };
}
