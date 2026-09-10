/**
 * Room session composable for Fun Chess multiplayer.
 * Manages room lifecycle (create, join, leave, reconnect),
 * Zod schema validation, sessionStorage persistence, and auto-reconnection.
 *
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Findings CRIT-005, MIN-030.
 */

import type {
  CreateRoomRequest,
  GameState,
  JoinRoomRequest,
  Player,
  ReconnectRequest,
  RoomState,
  RoomStatus,
  SocketErrorPayload,
  ReconnectAckPayload,
} from '@fun-chess/shared';
import {
  DEFAULT_PLAYER_AVATAR,
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  LeaveRoomRequestSchema,
  ReconnectRequestSchema,
} from '@fun-chess/shared';
import { generateCorrelationId } from '@/platform/telemetry';
import {
  useSocketTransport,
  registerSocketEventListener,
} from './useSocketTransport';
import {
  type UseRoomSessionOptions,
  setRoomSessionStorage,
  setRoomSessionLogger,
  setRoomSessionNavigation,
  getCustomNavigation,
  notifySessionReset,
  notifyRoomReconnected,
  logger,
  createValidationError,
  getSavedSession,
  saveSession,
  clearSession,
  currentRoom,
  currentPlayer,
  sessionToken,
  isHost,
  isSpectator,
} from './room_session_state';

export * from './room_session_state';

let customNavigation: {
  onRoomClosed?: () => void;
  navigate?: (path: string) => void;
} | null = null;

// ----------------------------------------------------------------------------
// Internal Event Listeners Registration
// ----------------------------------------------------------------------------
function handleConnect() {
  checkAndAutoReconnect();
}

// Note (MAJ-008): Room state for creator and joiner is received directly through
// acknowledgment callbacks in createRoom / joinRoom; fragile dependencies on
// deprecated room:created and room:joined socket events have been removed.

function handleRoomPlayerJoined(data: { player: Player; room: RoomState }) {
  currentRoom.value = data.room;
}

function getActiveNavigation() {
  return customNavigation || getCustomNavigation();
}

function handleRoomPlayerLeft(data?: { playerId?: string; playerName?: string; reason?: string }) {
  if (data?.reason === 'host_left' || data?.reason === 'room_closed') {
    currentRoom.value = null;
    currentPlayer.value = null;
    sessionToken.value = null;
    clearSession();
    notifySessionReset(true);
    const nav = getActiveNavigation();
    if (nav?.onRoomClosed) {
      try {
        nav.onRoomClosed();
      } catch (err) {
        logger.warn('Error executing onRoomClosed callback', {
          operation: 'socket_room_player_left',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else if (nav?.navigate) {
      try {
        nav.navigate('/multiplayer');
      } catch (err) {
        logger.warn('Error executing navigate callback', {
          operation: 'socket_room_player_left',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      logger.info('Room closed with no navigation callback provided; falling back safely', {
        operation: 'socket_room_player_left',
        reason: data.reason,
      });
    }
    return;
  }

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

function handleRoomPlayerDisconnected(data: {
  playerId: string;
  gracePeriodMs?: number;
  roomStatus?: RoomStatus;
}) {
  if (!currentRoom.value) return;

  const disconnectedId = data?.playerId;
  if (!disconnectedId) return;

  const isWhite = currentRoom.value.whitePlayer?.id === disconnectedId;
  const isBlack = currentRoom.value.blackPlayer?.id === disconnectedId;
  const isActivePlayer = isWhite || isBlack;

  // Authoritatively update room status per API contracts §2.1 (MAJ-008)
  if (data?.roomStatus) {
    // Spectator disconnect should not pause the active match
    if (data.roomStatus !== 'paused_disconnect' || isActivePlayer) {
      currentRoom.value = {
        ...currentRoom.value,
        status: data.roomStatus,
      };
    }
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
}

function handleRoomPlayerReconnected(data: {
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
  notifyRoomReconnected({
    room: data.room,
    player: data.player,
    roomStatus: data.roomStatus as RoomStatus | undefined,
  });
}

function handleGameStarted(gameState: GameState) {
  if (currentRoom.value) {
    currentRoom.value = {
      ...currentRoom.value,
      status: 'playing',
      game: gameState,
    };
  }
}

function handleGameOver() {
  if (currentRoom.value) {
    currentRoom.value = {
      ...currentRoom.value,
      status: 'game_over',
    };
  }
}

export function initRoomSessionListeners(): void {
  registerSocketEventListener('connect', handleConnect);
  registerSocketEventListener('room:player_joined', handleRoomPlayerJoined);
  registerSocketEventListener('room:player_left', handleRoomPlayerLeft);
  registerSocketEventListener('room:player_disconnected', handleRoomPlayerDisconnected);
  registerSocketEventListener('room:player_reconnected', handleRoomPlayerReconnected);
  registerSocketEventListener('room:reconnected', handleRoomReconnected);
  registerSocketEventListener('game:started', handleGameStarted);
  registerSocketEventListener('game:over', handleGameOver);
}

// Initial registration on module load
initRoomSessionListeners();

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
    reconnect(saved.roomCode, saved.playerId, saved.sessionToken)
      .then((res) => {
        if (!res.success) {
          if (
            res.error.code === 'ERR_ROOM_NOT_FOUND' ||
            res.error.code === 'ERR_UNAUTHORIZED'
          ) {
            resetRoomSessionState(true);
            const nav = getActiveNavigation();
            if (nav?.onRoomClosed) {
              try {
                nav.onRoomClosed();
              } catch (navErr) {
                logger.warn('Error executing onRoomClosed callback', {
                  operation: 'socket_auto_reconnect',
                  error: navErr instanceof Error ? navErr.message : String(navErr),
                });
              }
            }
          }
        }
      })
      .catch((err) => {
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
): Promise<{ success: true; room: RoomState; player: Player; sessionToken: string } | { success: false; error: SocketErrorPayload }> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();

  logger.info('Creating room', {
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
    | { success: true; room: RoomState; player: Player; sessionToken: string }
    | { success: false; error: SocketErrorPayload }
  >(s, 'room:create', validationResult.data, {
    timeoutMs: 8000,
    timeoutMessage: 'Connection timed out. Please ensure the server is running.',
    operation: 'socket_room_create',
    correlationId,
    onSuccess: (res) => {
      currentRoom.value = res.room;
      sessionToken.value = res.sessionToken;
      if (res.player) {
        currentPlayer.value = res.player;
      } else if (res.room.whitePlayer?.socketId === s.id) {
        currentPlayer.value = res.room.whitePlayer;
      } else if (res.room.blackPlayer?.socketId === s.id) {
        currentPlayer.value = res.room.blackPlayer;
      } else if (res.room.hostId) {
        currentPlayer.value =
          res.room.whitePlayer?.id === res.room.hostId
            ? res.room.whitePlayer
            : res.room.blackPlayer;
      }
      const playerId = currentPlayer.value?.id || res.player?.id || res.room.hostId;
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

  logger.info('Joining room', {
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
): Promise<ReconnectAckPayload> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  const transport = useSocketTransport();

  logger.info('Reconnecting room', {
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
    ReconnectAckPayload
  >(s, 'room:reconnect', validationResult.data, {
    timeoutMs: 8000,
    timeoutMessage: 'Reconnection timed out.',
    operation: 'socket_room_reconnect',
    correlationId,
    onSuccess: (res) => {
      currentRoom.value = res.room;
      currentPlayer.value = res.player;
      if (res.roomStatus) {
        currentRoom.value.status = res.roomStatus;
      }
      const effectiveToken = res.sessionToken || token;
      sessionToken.value = effectiveToken;
      saveSession({
        roomCode: res.room.roomCode,
        playerId: res.player.id,
        sessionToken: effectiveToken,
      });
      notifyRoomReconnected({
        room: res.room,
        player: res.player,
        roomStatus: res.roomStatus,
      });
    },
    onError: (err) => {
      if (
        err.code === 'ERR_ROOM_NOT_FOUND' ||
        err.code === 'ERR_UNAUTHORIZED'
      ) {
        resetRoomSessionState(true);
        const nav = getActiveNavigation();
        if (nav?.onRoomClosed) {
          try {
            nav.onRoomClosed();
          } catch (navErr) {
            logger.warn('Error executing onRoomClosed callback', {
              operation: 'socket_room_reconnect',
              error: navErr instanceof Error ? navErr.message : String(navErr),
            });
          }
        }
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

  logger.info('Leaving room', {
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
    notifySessionReset(true);
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
      notifySessionReset(true);
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
  notifySessionReset(clearStorage);
  setRoomSessionStorage(null);
  setRoomSessionLogger(null);
  setRoomSessionNavigation(null);
  customNavigation = null;
  initRoomSessionListeners();
}

/**
 * Primary composable exposing room session state and lifecycle controls.
 */
export function useRoomSession(options?: UseRoomSessionOptions) {
  initRoomSessionListeners();
  if (options?.storage) {
    setRoomSessionStorage(options.storage);
  }
  if (options?.logger) {
    setRoomSessionLogger(options.logger);
  }
  if (options?.onRoomClosed || options?.navigate) {
    customNavigation = {
      onRoomClosed: options.onRoomClosed,
      navigate: options.navigate,
    };
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
    initRoomSessionListeners,
    setRoomSessionNavigation,
  };
}
