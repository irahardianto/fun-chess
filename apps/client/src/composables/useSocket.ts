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
} from '@fun-chess/shared';
import { createSocketClient, type TypedSocket } from '../platform/socket/socket_client';

export function useSocket(injectedSocket?: TypedSocket) {
  const socket = shallowRef<TypedSocket | null>(injectedSocket || null);
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

  function attachListeners(s: TypedSocket): void {
    s.on('connect', () => {
      isConnected.value = true;
      socketId.value = s.id || '';
    });

    s.on('disconnect', () => {
      isConnected.value = false;
    });

    s.on('room:created', (room: RoomState) => {
      currentRoom.value = room;
    });

    s.on('room:joined', (room: RoomState) => {
      currentRoom.value = room;
    });

    s.on('room:player_joined', (data: { player: Player; room: RoomState }) => {
      currentRoom.value = data.room;
    });

    s.on('room:player_left', () => {
      // Room state updated
    });

    s.on('game:started', (gameState: GameState) => {
      if (currentRoom.value) {
        currentRoom.value = {
          ...currentRoom.value,
          status: 'playing',
          game: gameState,
        };
      }
      lastGameOver.value = null;
      kingInCheck.value = null;
    });

    s.on('game:moved', (data: { move: MoveResult; gameState: GameState }) => {
      if (currentRoom.value) {
        currentRoom.value = {
          ...currentRoom.value,
          game: data.gameState,
        };
      }
      kingInCheck.value = null;
    });

    s.on('game:check', (data: { inCheck: PieceColor; kingSquare: string }) => {
      kingInCheck.value = data;
    });

    s.on('game:over', (payload: GameOverPayload) => {
      lastGameOver.value = payload;
      if (currentRoom.value) {
        currentRoom.value = {
          ...currentRoom.value,
          status: 'game_over',
        };
      }
    });

    s.on('game:draw_offered', (data: { fromPlayerId: string; fromPlayerName: string }) => {
      drawOfferedBy.value = data;
    });

    s.on('game:draw_declined', () => {
      drawOfferedBy.value = null;
    });

    s.on('game:rematch_requested', (data: { requestedBy: string; requesterName: string }) => {
      rematchRequestedBy.value = data;
    });

    s.on('game:rematch_started', (gameState: GameState) => {
      rematchRequestedBy.value = null;
      lastGameOver.value = null;
      kingInCheck.value = null;
      if (currentRoom.value) {
        currentRoom.value = {
          ...currentRoom.value,
          status: 'playing',
          game: gameState,
        };
      }
    });

    s.on('game:rematch_declined', () => {
      rematchRequestedBy.value = null;
    });

    s.on('error', (err: SocketErrorPayload) => {
      lastError.value = err;
    });
  }

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
    preferredColor: 'w' | 'b' | 'random' = 'random'
  ): Promise<{ success: true; room: RoomState; sessionToken: string } | { success: false; error: SocketErrorPayload }> {
    const s = socket.value || initSocket();
    if (!s.connected) s.connect();

    return new Promise((resolve) => {
      const payload: CreateRoomRequest = { playerName, preferredColor };
      s.emit('room:create', payload, (res) => {
        if (res.success) {
          currentRoom.value = res.room;
          sessionToken.value = res.sessionToken;
          if (res.room.whitePlayer?.socketId === s.id) {
            currentPlayer.value = res.room.whitePlayer;
          } else if (res.room.blackPlayer?.socketId === s.id) {
            currentPlayer.value = res.room.blackPlayer;
          }
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
    playerName: string
  ): Promise<{ success: true; room: RoomState; player: Player; sessionToken: string } | { success: false; error: SocketErrorPayload }> {
    const s = socket.value || initSocket();
    if (!s.connected) s.connect();

    return new Promise((resolve) => {
      const payload: JoinRoomRequest = { roomCode: roomCode.toUpperCase(), playerName };
      s.emit('room:join', payload, (res) => {
        if (res.success) {
          currentRoom.value = res.room;
          currentPlayer.value = res.player;
          sessionToken.value = res.sessionToken;
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
      s.emit('game:move', payload, (res) => {
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
      s.emit('room:reconnect', payload, (res) => {
        if (res.success) {
          currentRoom.value = res.room;
          currentPlayer.value = res.player;
          sessionToken.value = token;
          resolve(res);
        } else {
          lastError.value = res.error;
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
    }
  }

  if (injectedSocket) {
    attachListeners(injectedSocket);
    isConnected.value = injectedSocket.connected;
    socketId.value = injectedSocket.id || '';
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
