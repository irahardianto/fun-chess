import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSocket, resetSocketState, SESSION_STORAGE_KEY } from '../useSocket';
import { audioSynthesizer } from '../../platform/audio/audio_synthesizer';
import type { GameState, MoveResult, Player, RoomState } from '@fun-chess/shared';

describe('useSocket composable', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, Function>;

  beforeEach(() => {
    resetSocketState();
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

  it('should handle connect() and disconnect() public action methods', () => {
    mockSocket.connected = false;
    const { connect, disconnect, isConnected } = useSocket(mockSocket);

    connect();
    expect(mockSocket.connect).toHaveBeenCalled();

    disconnect();
    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(isConnected.value).toBe(false);
  });

  it('should handle game:check and update kingInCheck ref', () => {
    const { kingInCheck } = useSocket(mockSocket);
    expect(kingInCheck.value).toBeNull();

    eventHandlers['game:check']({ inCheck: 'w', kingSquare: 'e1' });
    expect(kingInCheck.value).toEqual({ inCheck: 'w', kingSquare: 'e1' });
  });

  it('should handle room:player_left and room:player_joined events', () => {
    const { currentRoom } = useSocket(mockSocket);

    const dummyRoom: RoomState = {
      roomCode: 'JOIN1',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: { id: 'p1', socketId: 's1', name: 'P1', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
      blackPlayer: { id: 'p2', socketId: 's2', name: 'P2', color: 'b', isHost: false, isConnected: true, connectedAt: 1000 },
      spectators: [],
      game: {} as GameState,
      rematch: null,
      createdAt: 1000,
      lastActivityAt: 1000,
    };

    eventHandlers['room:player_joined']({
      player: dummyRoom.blackPlayer!,
      room: dummyRoom,
    });
    expect(currentRoom.value?.roomCode).toBe('JOIN1');

    // Player left
    eventHandlers['room:player_left']();
    expect(currentRoom.value).toBeDefined();
  });

  it('should handle resign fire-and-forget and with callback', () => {
    const { resign } = useSocket(mockSocket);

    // Fire-and-forget
    resign('TEST');
    expect(mockSocket.emit).toHaveBeenCalledWith('game:resign', { roomCode: 'TEST' });

    // With callback
    const callback = vi.fn();
    mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
      if (event === 'game:resign' && ack) {
        ack({ success: true });
      }
    });

    resign('TEST', callback);
    expect(callback).toHaveBeenCalledWith({ success: true });
  });

  it('should handle draw and rematch requests fire-and-forget without callback', () => {
    const { offerDraw, respondDraw, requestRematch, respondRematch, rematchRequestedBy, drawOfferedBy } = useSocket(mockSocket);

    offerDraw('TEST');
    expect(mockSocket.emit).toHaveBeenCalledWith('game:offer_draw', { roomCode: 'TEST' });

    drawOfferedBy.value = { fromPlayerId: 'p2', fromPlayerName: 'Bob' };
    respondDraw('TEST', false);
    expect(mockSocket.emit).toHaveBeenCalledWith('game:respond_draw', { roomCode: 'TEST', accept: false });
    expect(drawOfferedBy.value).toBeNull();

    requestRematch('TEST');
    expect(mockSocket.emit).toHaveBeenCalledWith('game:request_rematch', { roomCode: 'TEST' });

    rematchRequestedBy.value = { requestedBy: 'p2', requesterName: 'Bob' };
    respondRematch('TEST', true);
    expect(mockSocket.emit).toHaveBeenCalledWith('game:respond_rematch', { roomCode: 'TEST', accept: true });
    expect(rematchRequestedBy.value).toBeNull();
  });

  describe('8-second timeout failure path for socket requests', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set ERR_SOCKET_TIMEOUT in lastError and return error when createRoom times out after 8 seconds', async () => {
      const { createRoom, lastError } = useSocket(mockSocket);
      mockSocket.emit.mockImplementation(() => {});

      const createPromise = createRoom('Alice');
      vi.advanceTimersByTime(8500);

      const res = await createPromise;
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('ERR_SOCKET_TIMEOUT');
        expect(res.error.message).toContain('Connection timed out');
      }
      expect(lastError.value?.code).toBe('ERR_SOCKET_TIMEOUT');
    });

    it('should set ERR_SOCKET_TIMEOUT in lastError and return error when joinRoom times out after 8 seconds', async () => {
      const { joinRoom, lastError } = useSocket(mockSocket);
      mockSocket.emit.mockImplementation(() => {});

      const joinPromise = joinRoom('TEST', 'Bob');
      vi.advanceTimersByTime(8500);

      const res = await joinPromise;
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('ERR_SOCKET_TIMEOUT');
        expect(res.error.message).toContain('Connection timed out');
      }
      expect(lastError.value?.code).toBe('ERR_SOCKET_TIMEOUT');
    });

    it('should set ERR_SOCKET_TIMEOUT in lastError and return error when makeMove times out after 8 seconds', async () => {
      const { makeMove, lastError } = useSocket(mockSocket);
      mockSocket.emit.mockImplementation(() => {});

      const movePromise = makeMove('TEST', { from: 'e2', to: 'e4' });
      vi.advanceTimersByTime(8500);

      const res = await movePromise;
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('ERR_SOCKET_TIMEOUT');
        expect(res.error.message).toContain('Move submission timed out');
      }
      expect(lastError.value?.code).toBe('ERR_SOCKET_TIMEOUT');
    });

    it('should set ERR_SOCKET_TIMEOUT in lastError and return error when reconnect times out after 8 seconds', async () => {
      const { reconnect, lastError } = useSocket(mockSocket);
      mockSocket.emit.mockImplementation(() => {});

      const reconnectPromise = reconnect('TEST', 'p1', 'tok');
      vi.advanceTimersByTime(8500);

      const res = await reconnectPromise;
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('ERR_SOCKET_TIMEOUT');
        expect(res.error.message).toContain('Reconnection timed out');
      }
      expect(lastError.value?.code).toBe('ERR_SOCKET_TIMEOUT');
    });

    it('should invoke callback with ERR_SOCKET_TIMEOUT when offerDraw times out after 8 seconds', async () => {
      const { offerDraw } = useSocket(mockSocket);
      const callback = vi.fn();

      offerDraw('TEST', callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'ERR_SOCKET_TIMEOUT', message: 'Draw offer timed out.' },
      });
    });

    it('should invoke callback with ERR_SOCKET_TIMEOUT when respondDraw times out after 8 seconds', async () => {
      const { respondDraw } = useSocket(mockSocket);
      const callback = vi.fn();

      respondDraw('TEST', true, callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'ERR_SOCKET_TIMEOUT', message: 'Draw response timed out.' },
      });
    });

    it('should invoke callback with ERR_SOCKET_TIMEOUT when requestRematch times out after 8 seconds', async () => {
      const { requestRematch } = useSocket(mockSocket);
      const callback = vi.fn();

      requestRematch('TEST', callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'ERR_SOCKET_TIMEOUT', message: 'Rematch request timed out.' },
      });
    });

    it('should invoke callback with ERR_SOCKET_TIMEOUT when respondRematch times out after 8 seconds', async () => {
      const { respondRematch } = useSocket(mockSocket);
      const callback = vi.fn();

      respondRematch('TEST', true, callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'ERR_SOCKET_TIMEOUT', message: 'Rematch response timed out.' },
      });
    });

    it('should invoke callback with ERR_SOCKET_TIMEOUT when resign times out after 8 seconds', async () => {
      const { resign } = useSocket(mockSocket);
      const callback = vi.fn();

      resign('TEST', callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'ERR_SOCKET_TIMEOUT', message: 'Resign timed out.' },
      });
    });
  });

  describe('Late server acknowledgements discarded after 8-second timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should discard late createRoom server acknowledgement and not mutate currentRoom, sessionToken, or sessionStorage', async () => {
      const { createRoom, currentRoom, sessionToken, currentPlayer } = useSocket(mockSocket);
      let capturedAck: Function | undefined;

      mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
        if (event === 'room:create') {
          capturedAck = callback;
        }
      });

      const createPromise = createRoom('Alice');
      vi.advanceTimersByTime(8500);

      const res = await createPromise;
      expect(res.success).toBe(false);
      expect(currentRoom.value).toBeNull();
      expect(sessionToken.value).toBeNull();
      expect(currentPlayer.value).toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

      expect(capturedAck).toBeDefined();
      // Late ack arrives from server after timeout was reported
      capturedAck!({
        success: true,
        room: {
          roomCode: 'LATE',
          status: 'lobby',
          hostId: 'p1',
          whitePlayer: { id: 'p1', socketId: mockSocket.id, name: 'Alice', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
          blackPlayer: null,
          spectators: [],
          game: {} as GameState,
          rematch: null,
          createdAt: 1000,
          lastActivityAt: 1000,
        },
        sessionToken: 'late_session_token_123',
      });

      // Verify state was NOT mutated by the late server response
      expect(currentRoom.value).toBeNull();
      expect(sessionToken.value).toBeNull();
      expect(currentPlayer.value).toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });

    it('should discard late joinRoom server acknowledgement and not mutate currentRoom, sessionToken, or sessionStorage', async () => {
      const { joinRoom, currentRoom, sessionToken, currentPlayer } = useSocket(mockSocket);
      let capturedAck: Function | undefined;

      mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
        if (event === 'room:join') {
          capturedAck = callback;
        }
      });

      const joinPromise = joinRoom('LATE', 'Bob');
      vi.advanceTimersByTime(8500);

      const res = await joinPromise;
      expect(res.success).toBe(false);
      expect(currentRoom.value).toBeNull();
      expect(sessionToken.value).toBeNull();
      expect(currentPlayer.value).toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

      expect(capturedAck).toBeDefined();
      capturedAck!({
        success: true,
        room: {
          roomCode: 'LATE',
          status: 'playing',
          hostId: 'p1',
          whitePlayer: {} as Player,
          blackPlayer: { id: 'p2', socketId: mockSocket.id, name: 'Bob', color: 'b', isHost: false, isConnected: true, connectedAt: 1000 },
          spectators: [],
          game: {} as GameState,
          rematch: null,
          createdAt: 1000,
          lastActivityAt: 1000,
        },
        player: { id: 'p2', socketId: mockSocket.id, name: 'Bob', color: 'b', isHost: false, isConnected: true, connectedAt: 1000 },
        sessionToken: 'late_join_token',
      });

      expect(currentRoom.value).toBeNull();
      expect(sessionToken.value).toBeNull();
      expect(currentPlayer.value).toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });

    it('should discard late reconnect server acknowledgement and not mutate state', async () => {
      const { reconnect, currentRoom, sessionToken, currentPlayer } = useSocket(mockSocket);
      let capturedAck: Function | undefined;

      mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
        if (event === 'room:reconnect') {
          capturedAck = callback;
        }
      });

      const reconPromise = reconnect('LATE', 'p1', 'token_old');
      vi.advanceTimersByTime(8500);

      const res = await reconPromise;
      expect(res.success).toBe(false);

      expect(capturedAck).toBeDefined();
      capturedAck!({
        success: true,
        room: {
          roomCode: 'LATE',
          status: 'playing',
          hostId: 'p1',
          whitePlayer: { id: 'p1', socketId: mockSocket.id, name: 'Alice', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
          blackPlayer: null,
          spectators: [],
          game: {} as GameState,
          rematch: null,
          createdAt: 1000,
          lastActivityAt: 1000,
        },
        player: { id: 'p1', socketId: mockSocket.id, name: 'Alice', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
      });

      expect(currentRoom.value).toBeNull();
      expect(sessionToken.value).toBeNull();
      expect(currentPlayer.value).toBeNull();
    });

    it('should discard late makeMove server acknowledgement and not overwrite lastError', async () => {
      const { makeMove, lastError } = useSocket(mockSocket);
      let capturedAck: Function | undefined;

      mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
        if (event === 'game:move') {
          capturedAck = callback;
        }
      });

      const movePromise = makeMove('TEST', { from: 'e2', to: 'e4' });
      vi.advanceTimersByTime(8500);

      const res = await movePromise;
      expect(res.success).toBe(false);
      expect(lastError.value?.code).toBe('ERR_SOCKET_TIMEOUT');

      expect(capturedAck).toBeDefined();
      // Late ack arrives with a different error
      capturedAck!({
        success: false,
        error: { code: 'ERR_INVALID_MOVE', message: 'Late move error' },
      });

      // lastError should remain the timeout error, not overwritten by late ack
      expect(lastError.value?.code).toBe('ERR_SOCKET_TIMEOUT');
    });

    it('should discard late offerDraw server acknowledgement and not invoke callback twice', async () => {
      const { offerDraw } = useSocket(mockSocket);
      let capturedAck: Function | undefined;
      const callback = vi.fn();

      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'game:offer_draw') {
          capturedAck = ack;
        }
      });

      offerDraw('TEST', callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'ERR_SOCKET_TIMEOUT', message: 'Draw offer timed out.' },
      });

      // Late ack arrives
      expect(capturedAck).toBeDefined();
      capturedAck!({ success: true });

      // Callback must not be invoked again
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should discard late respondDraw server acknowledgement and not invoke callback twice', async () => {
      const { respondDraw } = useSocket(mockSocket);
      let capturedAck: Function | undefined;
      const callback = vi.fn();

      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'game:respond_draw') {
          capturedAck = ack;
        }
      });

      respondDraw('TEST', true, callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'ERR_SOCKET_TIMEOUT', message: 'Draw response timed out.' },
      });

      // Late ack arrives
      expect(capturedAck).toBeDefined();
      capturedAck!({ success: true });

      // Callback must not be invoked again
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should discard late requestRematch server acknowledgement and not invoke callback twice', async () => {
      const { requestRematch } = useSocket(mockSocket);
      let capturedAck: Function | undefined;
      const callback = vi.fn();

      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'game:request_rematch') {
          capturedAck = ack;
        }
      });

      requestRematch('TEST', callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'ERR_SOCKET_TIMEOUT', message: 'Rematch request timed out.' },
      });

      // Late ack arrives
      expect(capturedAck).toBeDefined();
      capturedAck!({ success: true });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should discard late respondRematch server acknowledgement and not invoke callback twice', async () => {
      const { respondRematch } = useSocket(mockSocket);
      let capturedAck: Function | undefined;
      const callback = vi.fn();

      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'game:respond_rematch') {
          capturedAck = ack;
        }
      });

      respondRematch('TEST', true, callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'ERR_SOCKET_TIMEOUT', message: 'Rematch response timed out.' },
      });

      // Late ack arrives
      expect(capturedAck).toBeDefined();
      capturedAck!({ success: true });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should discard late resign server acknowledgement and not invoke callback twice', async () => {
      const { resign } = useSocket(mockSocket);
      let capturedAck: Function | undefined;
      const callback = vi.fn();

      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'game:resign') {
          capturedAck = ack;
        }
      });

      resign('TEST', callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'ERR_SOCKET_TIMEOUT', message: 'Resign timed out.' },
      });

      // Late ack arrives
      expect(capturedAck).toBeDefined();
      capturedAck!({ success: true });

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Disconnect and reconnect state transitions', () => {
    it('should transition isConnected to false when disconnect event fires', () => {
      const { isConnected } = useSocket(mockSocket);
      expect(isConnected.value).toBe(true);

      eventHandlers['disconnect']();
      expect(isConnected.value).toBe(false);
    });

    it('should handle player:disconnected setting paused_disconnect and player disconnected state', () => {
      const { currentRoom } = useSocket(mockSocket);

      const whitePlayer: Player = {
        id: 'p1',
        socketId: 'sock_1',
        name: 'WhitePlayer',
        color: 'w',
        isHost: true,
        isConnected: true,
        connectedAt: 1000,
      };

      const blackPlayer: Player = {
        id: 'p2',
        socketId: 'sock_2',
        name: 'BlackPlayer',
        color: 'b',
        isHost: false,
        isConnected: true,
        connectedAt: 1000,
      };

      currentRoom.value = {
        roomCode: 'TEST',
        status: 'playing',
        hostId: 'p1',
        whitePlayer: { ...whitePlayer },
        blackPlayer: { ...blackPlayer },
        spectators: [],
        game: {} as GameState,
        rematch: null,
        createdAt: 1000,
        lastActivityAt: 1000,
      };

      // Black player disconnects
      eventHandlers['room:player_disconnected']({ playerId: 'p2', gracePeriodMs: 60000 });

      expect(currentRoom.value.status).toBe('paused_disconnect');
      expect(currentRoom.value.blackPlayer?.isConnected).toBe(false);
      expect(currentRoom.value.whitePlayer?.isConnected).toBe(true);

      // White player also disconnects
      eventHandlers['room:player_disconnected']({ playerId: 'p1', gracePeriodMs: 60000 });

      expect(currentRoom.value.status).toBe('paused_disconnect');
      expect(currentRoom.value.whitePlayer?.isConnected).toBe(false);
    });

    it('should handle player:reconnected restoring active player state and playing status when both connected', () => {
      const { currentRoom } = useSocket(mockSocket);

      currentRoom.value = {
        roomCode: 'TEST',
        status: 'paused_disconnect',
        hostId: 'p1',
        whitePlayer: {
          id: 'p1',
          socketId: 'sock_1',
          name: 'WhitePlayer',
          color: 'w',
          isHost: true,
          isConnected: false,
          connectedAt: 1000,
        },
        blackPlayer: {
          id: 'p2',
          socketId: 'sock_2',
          name: 'BlackPlayer',
          color: 'b',
          isHost: false,
          isConnected: false,
          connectedAt: 1000,
        },
        spectators: [],
        game: {} as GameState,
        rematch: null,
        createdAt: 1000,
        lastActivityAt: 1000,
      };

      // White player reconnects
      eventHandlers['room:player_reconnected']({ playerId: 'p1', playerName: 'WhitePlayer' });

      expect(currentRoom.value.whitePlayer?.isConnected).toBe(true);
      // Status remains paused_disconnect since blackPlayer is still disconnected
      expect(currentRoom.value.status).toBe('paused_disconnect');

      // Black player reconnects
      eventHandlers['room:player_reconnected']({ playerId: 'p2', playerName: 'BlackPlayer' });

      expect(currentRoom.value.blackPlayer?.isConnected).toBe(true);
      // Status returns to playing
      expect(currentRoom.value.status).toBe('playing');
    });
  });
});

