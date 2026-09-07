import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSocket, SESSION_STORAGE_KEY } from '../useSocket';
import { audioSynthesizer } from '../../platform/audio/audio_synthesizer';
import type { GameState, MoveResult, Player, RoomState } from '@fun-chess/shared';

describe('useSocket composable', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, Function>;

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    eventHandlers = {};
    mockSocket = {
      id: 'test_socket_123',
      connected: true,
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      }),
      emit: vi.fn(),
      connect: vi.fn(() => {
        mockSocket.connected = true;
        if (eventHandlers['connect']) eventHandlers['connect']();
      }),
      disconnect: vi.fn(() => {
        mockSocket.connected = false;
        if (eventHandlers['disconnect']) eventHandlers['disconnect']();
      }),
    };
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('should initialize and attach listeners to socket', () => {
    const { isConnected, socketId } = useSocket(mockSocket);

    expect(isConnected.value).toBe(true);
    expect(socketId.value).toBe('test_socket_123');
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('game:moved', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('game:over', expect.any(Function));
  });

  it('should create a room, update reactive state, and save session to sessionStorage', async () => {
    const { createRoom, currentRoom, sessionToken, currentPlayer } = useSocket(mockSocket);

    const mockCreatedRoom: RoomState = {
      roomCode: 'STAR',
      status: 'lobby',
      hostId: 'p1',
      whitePlayer: {
        id: 'p1',
        socketId: 'test_socket_123',
        name: 'Leo',
        color: 'w',
        isHost: true,
        isConnected: true,
        connectedAt: Date.now(),
      },
      blackPlayer: null,
      spectators: [],
      game: {} as GameState,
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
      if (event === 'room:create') {
        callback({ success: true, room: mockCreatedRoom, sessionToken: 'token_1' });
      }
    });

    const result = await createRoom('Leo', 'w');

    expect(result.success).toBe(true);
    expect(currentRoom.value?.roomCode).toBe('STAR');
    expect(sessionToken.value).toBe('token_1');
    expect(currentPlayer.value?.name).toBe('Leo');

    const savedRaw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    expect(savedRaw).not.toBeNull();
    const saved = JSON.parse(savedRaw!);
    expect(saved).toEqual({
      roomCode: 'STAR',
      playerId: 'p1',
      sessionToken: 'token_1',
    });
  });

  it('should join a room, update reactive state, and save session to sessionStorage', async () => {
    const { joinRoom, currentRoom, currentPlayer, sessionToken } = useSocket(mockSocket);

    const mockJoinedPlayer: Player = {
      id: 'p2',
      socketId: 'test_socket_123',
      name: 'Maya',
      color: 'b',
      isHost: false,
      isConnected: true,
      connectedAt: Date.now(),
    };

    const mockJoinedRoom: RoomState = {
      roomCode: 'STAR',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: {} as Player,
      blackPlayer: mockJoinedPlayer,
      spectators: [],
      game: {} as GameState,
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
      if (event === 'room:join') {
        callback({
          success: true,
          room: mockJoinedRoom,
          player: mockJoinedPlayer,
          sessionToken: 'token_2',
        });
      }
    });

    const result = await joinRoom('STAR', 'Maya');

    expect(result.success).toBe(true);
    expect(currentRoom.value?.status).toBe('playing');
    expect(currentPlayer.value?.name).toBe('Maya');
    expect(sessionToken.value).toBe('token_2');

    const saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!);
    expect(saved).toEqual({
      roomCode: 'STAR',
      playerId: 'p2',
      sessionToken: 'token_2',
    });
  });

  it('should reconnect successfully and update session storage', async () => {
    const { reconnect, currentRoom, currentPlayer, sessionToken } = useSocket(mockSocket);

    const mockReconnectedPlayer: Player = {
      id: 'p1',
      socketId: 'test_socket_123',
      name: 'Leo',
      color: 'w',
      isHost: true,
      isConnected: true,
      connectedAt: Date.now(),
    };

    const mockRoom: RoomState = {
      roomCode: 'MOON',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: mockReconnectedPlayer,
      blackPlayer: null,
      spectators: [],
      game: {} as GameState,
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
      if (event === 'room:reconnect') {
        callback({
          success: true,
          room: mockRoom,
          player: mockReconnectedPlayer,
        });
      }
    });

    const res = await reconnect('MOON', 'p1', 'token_recon_1');
    expect(res.success).toBe(true);
    expect(currentRoom.value?.roomCode).toBe('MOON');
    expect(currentPlayer.value?.id).toBe('p1');
    expect(sessionToken.value).toBe('token_recon_1');

    const saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!);
    expect(saved).toEqual({
      roomCode: 'MOON',
      playerId: 'p1',
      sessionToken: 'token_recon_1',
    });
  });

  it('should clear sessionStorage if reconnect fails with ERR_UNAUTHORIZED or ERR_ROOM_NOT_FOUND', async () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ roomCode: 'FAIL', playerId: 'p1', sessionToken: 'bad_token' })
    );

    const { reconnect } = useSocket(mockSocket);

    mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
      if (event === 'room:reconnect') {
        callback({
          success: false,
          error: { code: 'ERR_UNAUTHORIZED', message: 'Unauthorized' },
        });
      }
    });

    const res = await reconnect('FAIL', 'p1', 'bad_token');
    expect(res.success).toBe(false);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    // Also test ERR_ROOM_NOT_FOUND
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ roomCode: 'NONE', playerId: 'p1', sessionToken: 'tok' })
    );
    mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
      if (event === 'room:reconnect') {
        callback({
          success: false,
          error: { code: 'ERR_ROOM_NOT_FOUND', message: 'Room not found' },
        });
      }
    });

    const res2 = await reconnect('NONE', 'p1', 'tok');
    expect(res2.success).toBe(false);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('should NOT clear sessionStorage if reconnect experiences a transient timeout', async () => {
    vi.useFakeTimers();
    try {
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ roomCode: 'TIMEOUT_ROOM', playerId: 'p1', sessionToken: 'keep_token' })
      );

      const { reconnect } = useSocket(mockSocket);

      // Do not respond to simulate timeout
      mockSocket.emit.mockImplementation(() => {});

      const reconnectPromise = reconnect('TIMEOUT_ROOM', 'p1', 'keep_token');

      // Fast forward past 8s ack timeout
      vi.advanceTimersByTime(8500);

      const res = await reconnectPromise;
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('ERR_SOCKET_TIMEOUT');
      }
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
      const saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!);
      expect(saved.sessionToken).toBe('keep_token');
    } finally {
      vi.useRealTimers();
    }
  });

  it('should auto-reconnect on socket connect event if saved session exists and currentRoom is null', async () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ roomCode: 'AUTO', playerId: 'p1', sessionToken: 'auto_token' })
    );

    mockSocket.connected = false;
    const { currentRoom } = useSocket(mockSocket);

    mockSocket.emit.mockImplementation((event: string, payload: any, callback: Function) => {
      if (event === 'room:reconnect') {
        expect(payload).toEqual({
          roomCode: 'AUTO',
          playerId: 'p1',
          sessionToken: 'auto_token',
        });
        callback({
          success: true,
          room: {
            roomCode: 'AUTO',
            status: 'playing',
            hostId: 'p1',
            whitePlayer: { id: 'p1', isConnected: true } as Player,
            blackPlayer: null,
            spectators: [],
            game: {} as GameState,
            rematch: null,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
          },
          player: { id: 'p1', name: 'AutoPlayer', isConnected: true } as Player,
        });
      }
    });

    // Fire connect event
    eventHandlers['connect']();

    // Give microtasks time to resolve promise
    await vi.waitFor(() => {
      expect(currentRoom.value?.roomCode).toBe('AUTO');
    });
  });

  it('should auto-reconnect on initialization if socket is already connected and session exists', async () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ roomCode: 'INIT', playerId: 'p2', sessionToken: 'init_token' })
    );

    mockSocket.connected = true;
    mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
      if (event === 'room:reconnect') {
        callback({
          success: true,
          room: {
            roomCode: 'INIT',
            status: 'playing',
            hostId: 'p1',
            whitePlayer: null,
            blackPlayer: { id: 'p2', isConnected: true } as Player,
            spectators: [],
            game: {} as GameState,
            rematch: null,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
          },
          player: { id: 'p2', name: 'InitPlayer', isConnected: true } as Player,
        });
      }
    });

    const { currentRoom } = useSocket(mockSocket);

    await vi.waitFor(() => {
      expect(currentRoom.value?.roomCode).toBe('INIT');
    });
  });

  it('should clear sessionStorage on leaveRoom', () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ roomCode: 'LEAV', playerId: 'p1', sessionToken: 'token' })
    );

    const { leaveRoom, currentRoom, sessionToken, currentPlayer } = useSocket(mockSocket);

    leaveRoom('LEAV');
    expect(mockSocket.emit).toHaveBeenCalledWith('room:leave', { roomCode: 'LEAV' });
    expect(currentRoom.value).toBeNull();
    expect(currentPlayer.value).toBeNull();
    expect(sessionToken.value).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('should clear sessionStorage and reset drawOfferedBy on game:over', () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ roomCode: 'OVER', playerId: 'p1', sessionToken: 'token' })
    );

    const { currentRoom, lastGameOver, drawOfferedBy } = useSocket(mockSocket);

    currentRoom.value = {
      roomCode: 'OVER',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: null,
      blackPlayer: null,
      spectators: [],
      game: {} as GameState,
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    drawOfferedBy.value = { fromPlayerId: 'p2', fromPlayerName: 'Opponent' };

    eventHandlers['game:over']({
      winner: 'w',
      reason: 'checkmate',
      message: 'Checkmate! White wins!',
    });

    expect(lastGameOver.value?.winner).toBe('w');
    expect(currentRoom.value.status).toBe('game_over');
    expect(drawOfferedBy.value).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('should handle game:rematch_started with room object payload, updating room and swapping player color', () => {
    const { currentRoom, currentPlayer, rematchRequestedBy, drawOfferedBy, lastGameOver, kingInCheck, sessionToken } =
      useSocket(mockSocket);

    sessionToken.value = 'token_1';

    const initialWhitePlayer: Player = {
      id: 'p1',
      socketId: 'sock_1',
      name: 'Player1',
      color: 'w',
      isHost: true,
      isConnected: true,
      connectedAt: Date.now(),
    };

    const initialBlackPlayer: Player = {
      id: 'p2',
      socketId: 'sock_2',
      name: 'Player2',
      color: 'b',
      isHost: false,
      isConnected: true,
      connectedAt: Date.now(),
    };

    currentRoom.value = {
      roomCode: 'REMT',
      status: 'game_over',
      hostId: 'p1',
      whitePlayer: initialWhitePlayer,
      blackPlayer: initialBlackPlayer,
      spectators: [],
      game: {} as GameState,
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    currentPlayer.value = initialWhitePlayer;
    rematchRequestedBy.value = { requestedBy: 'p2', requesterName: 'Player2' };
    drawOfferedBy.value = { fromPlayerId: 'p2', fromPlayerName: 'Player2' };
    lastGameOver.value = {
      winner: 'w',
      reason: 'checkmate',
      message: 'Checkmate',
      finalFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      totalMoves: 10,
      durationSeconds: 60,
    };
    kingInCheck.value = { inCheck: 'b', kingSquare: 'e8' };

    // Inverted players after rematch acceptance
    const swappedWhitePlayer: Player = { ...initialBlackPlayer, color: 'w' };
    const swappedBlackPlayer: Player = { ...initialWhitePlayer, color: 'b' };

    const rematchRoom: RoomState = {
      roomCode: 'REMT',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: swappedWhitePlayer,
      blackPlayer: swappedBlackPlayer,
      spectators: [],
      game: { fen: 'rematch_start_fen' } as GameState,
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    eventHandlers['game:rematch_started']({
      gameState: rematchRoom.game,
      room: rematchRoom,
    });

    expect(rematchRequestedBy.value).toBeNull();
    expect(drawOfferedBy.value).toBeNull();
    expect(lastGameOver.value).toBeNull();
    expect(kingInCheck.value).toBeNull();

    expect(currentRoom.value).toEqual(rematchRoom);
    expect(currentPlayer.value?.id).toBe('p1');
    expect(currentPlayer.value?.color).toBe('b');

    const savedRaw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    expect(savedRaw).not.toBeNull();
    const saved = JSON.parse(savedRaw!);
    expect(saved).toEqual({
      roomCode: 'REMT',
      playerId: 'p1',
      sessionToken: 'token_1',
    });
  });

  it('should auto-reconnect on socket connect when session saved and match is active with old socket id', async () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ roomCode: 'SYNC', playerId: 'p1', sessionToken: 'sync_token' })
    );

    mockSocket.id = 'old_sock_1';
    mockSocket.connected = true;
    const { currentRoom, currentPlayer } = useSocket(mockSocket);

    currentRoom.value = {
      roomCode: 'SYNC',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: {
        id: 'p1',
        name: 'Player1',
        color: 'w',
        isHost: true,
        isConnected: true,
        socketId: 'old_sock_1',
        connectedAt: Date.now(),
      },
      blackPlayer: null,
      spectators: [],
      game: {} as GameState,
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    currentPlayer.value = currentRoom.value!.whitePlayer;

    // Simulate socket reconnecting with a new socket ID
    mockSocket.id = 'new_sock_2';

    mockSocket.emit.mockImplementation((event: string, payload: any, callback: Function) => {
      if (event === 'room:reconnect') {
        expect(payload).toEqual({
          roomCode: 'SYNC',
          playerId: 'p1',
          sessionToken: 'sync_token',
        });
        callback({
          success: true,
          room: {
            ...currentRoom.value!,
            whitePlayer: { ...currentPlayer.value!, socketId: 'new_sock_2' },
          },
          player: { ...currentPlayer.value!, socketId: 'new_sock_2' },
        });
      }
    });

    eventHandlers['connect']();

    await vi.waitFor(() => {
      expect(currentPlayer.value?.socketId).toBe('new_sock_2');
    });
  });

  it('should handle game:rematch_started with fallback GameState payload', () => {
    const { currentRoom } = useSocket(mockSocket);

    currentRoom.value = {
      roomCode: 'FALL',
      status: 'game_over',
      hostId: 'p1',
      whitePlayer: null,
      blackPlayer: null,
      spectators: [],
      game: { fen: 'old_fen' } as GameState,
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    eventHandlers['game:rematch_started']({ fen: 'new_start_fen' } as GameState);

    expect(currentRoom.value.status).toBe('playing');
    expect(currentRoom.value.game.fen).toBe('new_start_fen');
  });

  it('should play move and capture sounds for opponent moves only', () => {
    const playMoveSpy = vi.spyOn(audioSynthesizer, 'playMove').mockImplementation(() => {});
    const playCaptureSpy = vi.spyOn(audioSynthesizer, 'playCapture').mockImplementation(() => {});

    const { currentPlayer, currentRoom } = useSocket(mockSocket);

    currentPlayer.value = {
      id: 'p1',
      socketId: 'sock_1',
      name: 'Player1',
      color: 'w',
      isHost: true,
      isConnected: true,
      connectedAt: Date.now(),
    };

    currentRoom.value = {
      roomCode: 'SOUN',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: currentPlayer.value,
      blackPlayer: null,
      spectators: [],
      game: { fen: 'fen1' } as GameState,
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    // Opponent standard move (color: 'b', captured: undefined)
    eventHandlers['game:moved']({
      move: { color: 'b', san: 'e5', from: 'e7', to: 'e5' } as MoveResult,
      gameState: { fen: 'fen2' } as GameState,
    });
    expect(playMoveSpy).toHaveBeenCalledTimes(1);
    expect(playCaptureSpy).not.toHaveBeenCalled();

    // Opponent capture move (color: 'b', captured: 'p')
    eventHandlers['game:moved']({
      move: { color: 'b', san: 'exd4', from: 'e5', to: 'd4', captured: 'p' } as MoveResult,
      gameState: { fen: 'fen3' } as GameState,
    });
    expect(playCaptureSpy).toHaveBeenCalledTimes(1);

    // Own move (color: 'w') should NOT trigger sound in useSocket
    eventHandlers['game:moved']({
      move: { color: 'w', san: 'd4', from: 'd2', to: 'd4' } as MoveResult,
      gameState: { fen: 'fen4' } as GameState,
    });
    expect(playMoveSpy).toHaveBeenCalledTimes(1); // unchanged
    expect(playCaptureSpy).toHaveBeenCalledTimes(1); // unchanged
  });

  it('should handle makeMove successfully and handle errors', async () => {
    const { makeMove, lastError } = useSocket(mockSocket);

    mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
      if (event === 'game:move') {
        callback({ success: true, moveResult: { san: 'e4' } as MoveResult });
      }
    });

    const okRes = await makeMove('STAR', { from: 'e2', to: 'e4' });
    expect(okRes.success).toBe(true);

    mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
      if (event === 'game:move') {
        callback({
          success: false,
          error: { code: 'ERR_INVALID_MOVE', message: 'Illegal move' },
        });
      }
    });

    const errRes = await makeMove('STAR', { from: 'e2', to: 'e5' });
    expect(errRes.success).toBe(false);
    expect(lastError.value?.code).toBe('ERR_INVALID_MOVE');
  });

  it('should return error on makeMove when socket is disconnected', async () => {
    mockSocket.connected = false;
    const { makeMove } = useSocket(mockSocket);

    const res = await makeMove('STAR', { from: 'e2', to: 'e4' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.message).toBe('Socket not connected');
    }
  });

  it('should handle draw and rematch interactions', () => {
    const {
      drawOfferedBy,
      rematchRequestedBy,
      offerDraw,
      respondDraw,
      requestRematch,
      respondRematch,
      resign,
    } = useSocket(mockSocket);

    offerDraw('STAR');
    expect(mockSocket.emit).toHaveBeenCalledWith('game:offer_draw', { roomCode: 'STAR' });

    respondDraw('STAR', true);
    expect(mockSocket.emit).toHaveBeenCalledWith('game:respond_draw', { roomCode: 'STAR', accept: true });

    requestRematch('STAR');
    expect(mockSocket.emit).toHaveBeenCalledWith('game:request_rematch', { roomCode: 'STAR' });

    respondRematch('STAR', false);
    expect(mockSocket.emit).toHaveBeenCalledWith('game:respond_rematch', { roomCode: 'STAR', accept: false });

    resign('STAR');
    expect(mockSocket.emit).toHaveBeenCalledWith('game:resign', { roomCode: 'STAR' });

    // Incoming events
    eventHandlers['game:draw_offered']({ fromPlayerId: 'p1', fromPlayerName: 'Leo' });
    expect(drawOfferedBy.value?.fromPlayerName).toBe('Leo');

    eventHandlers['game:draw_declined']();
    expect(drawOfferedBy.value).toBeNull();

    eventHandlers['game:rematch_requested']({ requestedBy: 'p1', requesterName: 'Leo' });
    expect(rematchRequestedBy.value?.requesterName).toBe('Leo');

    eventHandlers['game:rematch_declined']();
    expect(rematchRequestedBy.value).toBeNull();
  });

  it('should handle connect_error and reconnect_failed events promptly', () => {
    const { isConnected, lastError } = useSocket(mockSocket);

    expect(isConnected.value).toBe(true);

    // Trigger connect_error
    eventHandlers['connect_error'](new Error('Connection refused'));
    expect(isConnected.value).toBe(false);
    expect(lastError.value?.code).toBe('ERR_SOCKET_TIMEOUT');
    expect(lastError.value?.message).toBe('Connection refused');

    // Trigger reconnect_failed
    eventHandlers['reconnect_failed']();
    expect(isConnected.value).toBe(false);
    expect(lastError.value?.code).toBe('ERR_SOCKET_TIMEOUT');
    expect(lastError.value?.message).toContain('Reconnection failed');
  });

  it('should prevent duplicate listener attachments when socket is re-initialized or re-attached', () => {
    // First initialization
    const { initSocket } = useSocket(mockSocket);
    const onCallCount = mockSocket.on.mock.calls.length;
    expect(onCallCount).toBeGreaterThan(0);

    // Subsequent initialization / attachment calls on the same socket instance
    initSocket();
    useSocket(mockSocket);

    // on() should not have been called additional times
    expect(mockSocket.on.mock.calls.length).toBe(onCallCount);
  });
});

