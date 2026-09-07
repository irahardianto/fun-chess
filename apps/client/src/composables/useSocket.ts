import { ref, shallowRef } from 'vue';
import type {
  CreateRoomRequest,
  GameOverPayload,
  GameState,
  JoinRoomRequest,
  MakeMoveRequest,
  MovePayload,
  MoveResult,
  PieceColor,
  Player,
  ReconnectRequest,
  RoomState,
  SocketErrorPayload,
  SavedSession,
} from '@fun-chess/shared';
import { DEFAULT_PLAYER_AVATAR } from '@fun-chess/shared';
import { createSocketClient, type TypedSocket } from '../platform/socket/socket_client';
import { audioSynthesizer } from '../platform/audio/audio_synthesizer';
import { safeSessionStorage, createSafeStorage, type KeyValueStorage } from '../platform/storage';

/** Session storage key for persisting fun-chess multiplayer sessions */
export const SESSION_STORAGE_KEY = 'fun_chess_session_token';

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

function handlePlayerLeft() {
  // Room state updated
}

function handlePlayerDisconnected(data: { playerId: string; gracePeriodMs: number }) {
  if (currentRoom.value) {
    currentRoom.value = {
      ...currentRoom.value,
      status: 'paused_disconnect',
    };
    if (currentRoom.value.whitePlayer?.id === data.playerId) {
      currentRoom.value.whitePlayer.isConnected = false;
    } else if (currentRoom.value.blackPlayer?.id === data.playerId) {
      currentRoom.value.blackPlayer.isConnected = false;
    }
  }
}

function handlePlayerReconnected(data: { playerId: string; playerName: string }) {
  if (currentRoom.value) {
    if (currentRoom.value.whitePlayer?.id === data.playerId) {
      currentRoom.value.whitePlayer.isConnected = true;
    } else if (currentRoom.value.blackPlayer?.id === data.playerId) {
      currentRoom.value.blackPlayer.isConnected = true;
    }
    if (currentRoom.value.whitePlayer?.isConnected && currentRoom.value.blackPlayer?.isConnected) {
      currentRoom.value = {
        ...currentRoom.value,
        status: 'playing',
      };
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

  // Play audio feedback for opponent moves
  if (currentPlayer.value && data.move?.color && data.move.color !== currentPlayer.value.color) {
    if (data.move.captured) {
      audioSynthesizer.playCapture();
    } else {
      audioSynthesizer.playMove();
    }
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
  clearSession();
}

function handleDrawOffered(data: { fromPlayerId: string; fromPlayerName: string }) {
  drawOfferedBy.value = data;
}

function handleDrawDeclined() {
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

  // Ensure session is persisted for the rematch game so reconnection works if dropped
  const roomCode = currentRoom.value?.roomCode;
  const pId = currentPlayer.value?.id;
  const sToken = sessionToken.value || (currentPlayer.value as any)?.sessionToken;

  if (roomCode && pId && sToken) {
    sessionToken.value = sToken;
    saveSession({
      roomCode,
      playerId: pId,
      sessionToken: sToken,
    });
  }
}

function handleRematchDeclined() {
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
// Public Action Operations
// ----------------------------------------------------------------------------
function initSocket(url?: string): TypedSocket {
  if (!socket.value) {
    socket.value = createSocketClient(url);
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

async function createRoom(
  playerName: string,
  preferredColor: 'w' | 'b' | 'random' = 'random',
  avatar: string = DEFAULT_PLAYER_AVATAR
): Promise<{ success: true; room: RoomState; sessionToken: string } | { success: false; error: SocketErrorPayload }> {
  const s = socket.value || initSocket();
  if (!s.connected) s.connect();

  return new Promise((resolve) => {
    const payload: CreateRoomRequest = {
      playerName,
      preferredColor,
      avatar: avatar || DEFAULT_PLAYER_AVATAR,
    };
    const timer = setTimeout(() => {
      const err: SocketErrorPayload = {
        code: 'ERR_SOCKET_TIMEOUT',
        message: 'Connection timed out. Please ensure the server is running.',
      };
      lastError.value = err;
      resolve({ success: false, error: err });
    }, 8000);

    s.emit('room:create', payload, (res) => {
      clearTimeout(timer);
      if (res.success) {
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
        resolve(res);
      } else {
        lastError.value = res.error;
        resolve(res);
      }
    });
  });
}

async function joinRoom(
  roomCode: string,
  playerName: string,
  avatar: string = DEFAULT_PLAYER_AVATAR
): Promise<{ success: true; room: RoomState; player: Player; sessionToken: string } | { success: false; error: SocketErrorPayload }> {
  const s = socket.value || initSocket();
  if (!s.connected) s.connect();

  return new Promise((resolve) => {
    const payload: JoinRoomRequest = {
      roomCode: roomCode.toUpperCase(),
      playerName,
      avatar: avatar || DEFAULT_PLAYER_AVATAR,
    };
    const timer = setTimeout(() => {
      const err: SocketErrorPayload = {
        code: 'ERR_SOCKET_TIMEOUT',
        message: 'Connection timed out. Please check the room code and try again.',
      };
      lastError.value = err;
      resolve({ success: false, error: err });
    }, 8000);

    s.emit('room:join', payload, (res) => {
      clearTimeout(timer);
      if (res.success) {
        currentRoom.value = res.room;
        currentPlayer.value = res.player;
        sessionToken.value = res.sessionToken;
        saveSession({
          roomCode: res.room.roomCode,
          playerId: res.player.id,
          sessionToken: res.sessionToken,
        });
        resolve(res);
      } else {
        lastError.value = res.error;
        resolve(res);
      }
    });
  });
}

async function makeMove(
  roomCode: string,
  move: MovePayload
): Promise<{ success: true; moveResult: MoveResult } | { success: false; error: SocketErrorPayload }> {
  const s = socket.value;
  if (!s || !s.connected) {
    return {
      success: false,
      error: { code: 'ERR_INTERNAL_SERVER', message: 'Socket not connected' },
    };
  }

  return new Promise((resolve) => {
    const payload: MakeMoveRequest = { roomCode: roomCode.toUpperCase(), move };
    const timer = setTimeout(() => {
      const err: SocketErrorPayload = {
        code: 'ERR_SOCKET_TIMEOUT',
        message: 'Move submission timed out.',
      };
      lastError.value = err;
      resolve({ success: false, error: err });
    }, 8000);

    s.emit('game:move', payload, (res) => {
      clearTimeout(timer);
      if (!res.success) {
        lastError.value = res.error;
      }
      resolve(res);
    });
  });
}

async function reconnect(
  roomCode: string,
  playerId: string,
  token: string
): Promise<{ success: true; room: RoomState; player: Player } | { success: false; error: SocketErrorPayload }> {
  const s = socket.value || initSocket();
  if (!s.connected) s.connect();

  return new Promise((resolve) => {
    const payload: ReconnectRequest = {
      roomCode: roomCode.toUpperCase(),
      playerId,
      sessionToken: token,
    };
    const timer = setTimeout(() => {
      const err: SocketErrorPayload = {
        code: 'ERR_SOCKET_TIMEOUT',
        message: 'Reconnection timed out.',
      };
      lastError.value = err;
      resolve({ success: false, error: err });
    }, 8000);

    s.emit('room:reconnect', payload, (res) => {
      clearTimeout(timer);
      if (res.success) {
        currentRoom.value = res.room;
        currentPlayer.value = res.player;
        sessionToken.value = token;
        saveSession({
          roomCode: res.room.roomCode,
          playerId: res.player.id,
          sessionToken: token,
        });
        resolve(res);
      } else {
        lastError.value = res.error;
        if (
          res.error.code === 'ERR_ROOM_NOT_FOUND' ||
          res.error.code === 'ERR_UNAUTHORIZED'
        ) {
          clearSession();
        }
        resolve(res);
      }
    });
  });
}

function resign(roomCode: string): void {
  if (socket.value) {
    socket.value.emit('game:resign', { roomCode: roomCode.toUpperCase() });
  }
}

function offerDraw(roomCode: string): void {
  if (socket.value) {
    socket.value.emit('game:offer_draw', { roomCode: roomCode.toUpperCase() });
  }
}

function respondDraw(roomCode: string, accept: boolean): void {
  if (socket.value) {
    socket.value.emit('game:respond_draw', { roomCode: roomCode.toUpperCase(), accept });
    drawOfferedBy.value = null;
  }
}

function requestRematch(roomCode: string): void {
  if (socket.value) {
    socket.value.emit('game:request_rematch', { roomCode: roomCode.toUpperCase() });
  }
}

function respondRematch(roomCode: string, accept: boolean): void {
  if (socket.value) {
    socket.value.emit('game:respond_rematch', { roomCode: roomCode.toUpperCase(), accept });
    rematchRequestedBy.value = null;
  }
}

function leaveRoom(roomCode: string): void {
  if (socket.value) {
    socket.value.emit('room:leave', { roomCode: roomCode.toUpperCase() });
    currentRoom.value = null;
    currentPlayer.value = null;
    sessionToken.value = null;
    clearSession();
  }
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
