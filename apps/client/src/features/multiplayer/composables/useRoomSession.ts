/**
 * Room session composable for Fun Chess multiplayer.
 * Manages room lifecycle (create, join, leave, reconnect),
 * Zod schema validation, sessionStorage persistence, and auto-reconnection.
 *
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Findings CRIT-005, MIN-030.
 */

import { ref, computed, getCurrentInstance, type ComputedRef } from 'vue';
import type {
  CreateRoomRequest,
  GameState,
  JoinRoomRequest,
  Player,
  ReconnectRequest,
  RoomState,
  RoomStatus,
  SavedSession,
  SocketErrorPayload,
} from '@fun-chess/shared';
import {
  DEFAULT_PLAYER_AVATAR,
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  LeaveRoomRequestSchema,
  ReconnectRequestSchema,
} from '@fun-chess/shared';
import { useInjectLogger, useInjectSessionStorage } from '@/platform/di';
import { safeSessionStorage, type KeyValueStorage, STORAGE_KEYS } from '@/platform/storage';
import { generateCorrelationId, logger as defaultLogger, type ILogger } from '@/platform/telemetry';
import {
  useSocketTransport,
  registerSocketEventListener,
} from './useSocketTransport';

/** Session storage key for persisting fun-chess multiplayer sessions */
export const SESSION_STORAGE_KEY = STORAGE_KEYS.SESSION_TOKEN;

export type { SavedSession };

let customSessionStorage: KeyValueStorage | null = null;
let customLogger: ILogger | null = null;

export function setRoomSessionStorage(storage: KeyValueStorage | null): void {
  customSessionStorage = storage;
}

export function setRoomSessionLogger(logger: ILogger | null): void {
  customLogger = logger;
}

/**
 * Dynamically resolves session storage adapter (safe in browser & test environments).
 */
function getSessionStorage(custom?: KeyValueStorage): KeyValueStorage {
  if (custom) return custom;
  if (customSessionStorage) return customSessionStorage;
  if (getCurrentInstance()) {
    return useInjectSessionStorage();
  }
  return safeSessionStorage;
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
export function createValidationError(error: unknown): SocketErrorPayload {
  return {
    code: 'ERR_INVALID_PAYLOAD',
    message: formatZodError(error as ZodValidationErrorLike),
    correlationId: generateCorrelationId(),
  };
}

/**
 * Retrieves the saved session from sessionStorage if available.
 */
export function getSavedSession(): SavedSession | null {
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
    logger.warn('Failed to parse saved session from storage', {
      operation: 'socket_get_saved_session',
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Persists active session credentials into sessionStorage.
 */
export function saveSession(session: SavedSession): void {
  const storage = getSessionStorage();
  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    logger.warn('Failed to save session to storage', {
      operation: 'socket_save_session',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Removes the active session credentials from sessionStorage.
 */
export function clearSession(): void {
  const storage = getSessionStorage();
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
  } catch (err) {
    logger.warn('Failed to clear session from storage', {
      operation: 'socket_clear_session',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ----------------------------------------------------------------------------
// Module-Singleton Reactive Room Session State (MAJ-013)
// ----------------------------------------------------------------------------
const currentRoom = ref<RoomState | null>(null);
const currentPlayer = ref<Player | null>(null);
const sessionToken = ref<string | null>(null);

const isHost: ComputedRef<boolean> = computed(() => {
  if (!currentRoom.value || !currentPlayer.value) return false;
  return currentRoom.value.hostId === currentPlayer.value.id;
});

const isSpectator: ComputedRef<boolean> = computed(() => {
  if (!currentRoom.value || !currentPlayer.value) return false;
  return currentRoom.value.spectators?.some((s) => s.id === currentPlayer.value?.id) ?? false;
});

// ----------------------------------------------------------------------------
// Internal Event Listeners Registration
// ----------------------------------------------------------------------------
registerSocketEventListener('connect', () => {
  checkAndAutoReconnect();
});

registerSocketEventListener('room:created', (room: RoomState) => {
  currentRoom.value = room;
});

registerSocketEventListener('room:joined', (room: RoomState) => {
  currentRoom.value = room;
});

registerSocketEventListener('room:player_joined', (data: { player: Player; room: RoomState }) => {
  currentRoom.value = data.room;
});

registerSocketEventListener('room:player_left', (data?: { playerId?: string; playerName?: string; reason?: string }) => {
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
});

registerSocketEventListener('room:player_disconnected', (data: {
  playerId?: string;
  player?: Player;
  gracePeriodMs?: number;
  roomStatus?: string;
  disconnectedAt?: number;
}) => {
  if (!currentRoom.value) return;

  const disconnectedId = data?.playerId ?? data?.player?.id;
  if (!disconnectedId) return;

  const isWhite = currentRoom.value.whitePlayer?.id === disconnectedId;
  const isBlack = currentRoom.value.blackPlayer?.id === disconnectedId;
  const isActivePlayer = isWhite || isBlack;

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
});

registerSocketEventListener('room:player_reconnected', (data: {
  playerId: string;
  playerName: string;
  roomStatus?: string;
}) => {
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
    currentRoom.value = {
      ...currentRoom.value,
      status: 'playing',
    };
  }
});

registerSocketEventListener('room:reconnected', (data: {
  room: RoomState;
  player: Player;
  roomStatus?: string;
}) => {
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
});

registerSocketEventListener('game:started', (gameState: GameState) => {
  if (currentRoom.value) {
    currentRoom.value = {
      ...currentRoom.value,
      status: 'playing',
      game: gameState,
    };
  }
});

registerSocketEventListener('game:over', () => {
  if (currentRoom.value) {
    currentRoom.value = {
      ...currentRoom.value,
      status: 'game_over',
    };
  }
});

// ----------------------------------------------------------------------------
// Public Room Operations
// ----------------------------------------------------------------------------

/**
 * Attempts automatic reconnection if a valid saved session exists in sessionStorage
 * and the current state requires reconnection or synchronization.
 */
export function checkAndAutoReconnect(): void {
  const saved = getSavedSession();
  if (!saved) return;

  const transport = useSocketTransport();
  const currentSockId = transport.socket.value?.id || transport.socketId.value;
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
      logger.warn('Auto-reconnect failed', {
        operation: 'socket_auto_reconnect',
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/**
 * Creates a new multiplayer room with player configuration and preferred color.
 */
export async function createRoom(
  playerName: string,
  preferredColor: 'w' | 'b' | 'random' = 'random',
  avatar: string = DEFAULT_PLAYER_AVATAR
): Promise<{ success: true; room: RoomState; sessionToken: string } | { success: false; error: SocketErrorPayload }> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();

  logger.debug('Creating room', {
    operation: 'socket_room_create',
    correlationId,
    playerName,
  });

  // Zod validation before transmission (MIN-030)
  const validationResult = CreateRoomRequestSchema.safeParse({
    playerName,
    preferredColor: preferredColor || 'random',
    avatar: avatar || DEFAULT_PLAYER_AVATAR,
  });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    transport.lastError.value = err;
    logger.warn('Create room validation failed', {
      operation: 'socket_room_create',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    return { success: false, error: err };
  }

  const s = transport.socket.value || transport.initSocket();
  if (!s.connected) s.connect();

  return transport.emitWithTimeout<
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

/**
 * Joins an existing multiplayer room using a 4-letter room code.
 */
export async function joinRoom(
  roomCode: string,
  playerName: string,
  avatar: string = DEFAULT_PLAYER_AVATAR
): Promise<{ success: true; room: RoomState; player: Player; sessionToken: string } | { success: false; error: SocketErrorPayload }> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();

  logger.debug('Joining room', {
    operation: 'socket_room_join',
    correlationId,
    roomCode,
    playerName,
  });

  // Zod validation before transmission (MIN-030)
  const validationResult = JoinRoomRequestSchema.safeParse({
    roomCode,
    playerName,
    avatar: avatar || DEFAULT_PLAYER_AVATAR,
  });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    transport.lastError.value = err;
    logger.warn('Join room validation failed', {
      operation: 'socket_room_join',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    return { success: false, error: err };
  }

  const s = transport.socket.value || transport.initSocket();
  if (!s.connected) s.connect();

  return transport.emitWithTimeout<
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

/**
 * Reconnects an existing player session to a room.
 */
export async function reconnect(
  roomCode: string,
  playerId: string,
  token: string
): Promise<{ success: true; room: RoomState; player: Player } | { success: false; error: SocketErrorPayload }> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();

  logger.debug('Reconnecting room', {
    operation: 'socket_room_reconnect',
    correlationId,
    roomCode,
    playerId,
  });

  // Zod validation before transmission (MIN-030)
  const validationResult = ReconnectRequestSchema.safeParse({
    roomCode,
    playerId,
    sessionToken: token,
  });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    transport.lastError.value = err;
    logger.warn('Reconnect validation failed', {
      operation: 'socket_room_reconnect',
      correlationId,
      duration: Date.now() - startTime,
      error: err,
    });
    return { success: false, error: err };
  }

  const s = transport.socket.value || transport.initSocket();
  if (!s.connected) s.connect();

  return transport.emitWithTimeout<
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

/**
 * Leaves the active multiplayer room, emits room:leave with acknowledgment callback
 * and 2000ms timeout before clearing local session credentials.
 */
export async function leaveRoom(
  roomCode: string,
  callback?: (res: { success: boolean }) => void
): Promise<boolean> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();

  logger.debug('Leaving room', {
    operation: 'socket_room_leave',
    correlationId,
    roomCode,
  });

  // Zod validation before transmission (MIN-030)
  const validationResult = LeaveRoomRequestSchema.safeParse({ roomCode });
  if (!validationResult.success) {
    const err = createValidationError(validationResult.error);
    transport.lastError.value = err;
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
  const s = transport.socket.value;
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
 * Resets the room session state and clears persisted sessionStorage credentials.
 */
export function resetRoomSessionState(clearStorage = true): void {
  currentRoom.value = null;
  currentPlayer.value = null;
  sessionToken.value = null;
  if (clearStorage) {
    clearSession();
  }
  customSessionStorage = null;
  customLogger = null;
}

/**
 * Primary composable exposing room session state and lifecycle controls.
 */
export function useRoomSession(options?: { storage?: KeyValueStorage; logger?: ILogger }) {
  if (options?.storage) {
    customSessionStorage = options.storage;
  }
  if (options?.logger) {
    customLogger = options.logger;
  }
  return {
    currentRoom,
    currentPlayer,
    sessionToken,
    isHost,
    isSpectator,
    createRoom,
    joinRoom,
    leaveRoom,
    reconnect,
    checkAndAutoReconnect,
    getSavedSession,
    saveSession,
    clearSession,
    resetRoomSessionState,
  };
}
