import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSocket, resetSocketState, SESSION_STORAGE_KEY } from '../useSocket';
import { logger } from '@/platform/telemetry';
import type { GameState, MoveResult, Player, RoomState } from '@fun-chess/shared';

const UUID_P1 = '11111111-1111-4111-8111-111111111111';
const UUID_P2 = '22222222-2222-4222-8222-222222222222';

describe('useSocket composable', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, any>;

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
      off: vi.fn(),
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
      id: UUID_P1,
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
      hostId: UUID_P1,
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

    const res = await reconnect('MOON', UUID_P1, 'token_recon_1');
    expect(res.success).toBe(true);
    expect(currentRoom.value?.roomCode).toBe('MOON');
    expect(currentPlayer.value?.id).toBe(UUID_P1);
    expect(sessionToken.value).toBe('token_recon_1');

    const saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!);
    expect(saved).toEqual({
      roomCode: 'MOON',
      playerId: UUID_P1,
      sessionToken: 'token_recon_1',
    });
  });

  it('should clear sessionStorage if reconnect fails with ERR_UNAUTHORIZED or ERR_ROOM_NOT_FOUND', async () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ roomCode: 'FAIL', playerId: UUID_P1, sessionToken: 'bad_token' })
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

    const res = await reconnect('FAIL', UUID_P1, 'bad_token');
    expect(res.success).toBe(false);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    // Also test ERR_ROOM_NOT_FOUND
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ roomCode: 'NONE', playerId: UUID_P1, sessionToken: 'tok' })
    );
    mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
      if (event === 'room:reconnect') {
        callback({
          success: false,
          error: { code: 'ERR_ROOM_NOT_FOUND', message: 'Room not found' },
        });
      }
    });

    const res2 = await reconnect('NONE', UUID_P1, 'tok');
    expect(res2.success).toBe(false);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('should NOT clear sessionStorage if reconnect experiences a transient timeout', async () => {
    vi.useFakeTimers();
    try {
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ roomCode: 'TIME', playerId: UUID_P1, sessionToken: 'keep_token' })
      );

      const { reconnect } = useSocket(mockSocket);

      // Do not respond to simulate timeout
      mockSocket.emit.mockImplementation(() => {});

      const reconnectPromise = reconnect('TIME', UUID_P1, 'keep_token');

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
      JSON.stringify({ roomCode: 'AUTO', playerId: UUID_P1, sessionToken: 'auto_token' })
    );

    mockSocket.connected = false;
    const { currentRoom } = useSocket(mockSocket);

    mockSocket.emit.mockImplementation((event: string, payload: any, callback: Function) => {
      if (event === 'room:reconnect') {
        expect(payload).toEqual({
          roomCode: 'AUTO',
          playerId: UUID_P1,
          sessionToken: 'auto_token',
        });
        callback({
          success: true,
          room: {
            roomCode: 'AUTO',
            status: 'playing',
            hostId: UUID_P1,
            whitePlayer: { id: UUID_P1, isConnected: true } as Player,
            blackPlayer: null,
            spectators: [],
            game: {} as GameState,
            rematch: null,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
          },
          player: { id: UUID_P1, name: 'AutoPlayer', isConnected: true } as Player,
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
      JSON.stringify({ roomCode: 'INIT', playerId: UUID_P2, sessionToken: 'init_token' })
    );

    mockSocket.connected = true;
    mockSocket.emit.mockImplementation((event: string, _payload: any, callback: Function) => {
      if (event === 'room:reconnect') {
        callback({
          success: true,
          room: {
            roomCode: 'INIT',
            status: 'playing',
            hostId: UUID_P1,
            whitePlayer: null,
            blackPlayer: { id: UUID_P2, isConnected: true } as Player,
            spectators: [],
            game: {} as GameState,
            rematch: null,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
          },
          player: { id: UUID_P2, name: 'InitPlayer', isConnected: true } as Player,
        });
      }
    });

    const { currentRoom } = useSocket(mockSocket);

    await vi.waitFor(() => {
      expect(currentRoom.value?.roomCode).toBe('INIT');
    });
  });

  it('should clear sessionStorage and reset state on leaveRoom when ack arrives', async () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ roomCode: 'LEAV', playerId: 'p1', sessionToken: 'token' })
    );

    const { leaveRoom, currentRoom, sessionToken, currentPlayer } = useSocket(mockSocket);

    currentRoom.value = {
      roomCode: 'LEAV',
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
    sessionToken.value = 'token';

    mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
      if (event === 'room:leave' && ack) {
        ack({ success: true });
      }
    });

    await leaveRoom('LEAV');
    expect(mockSocket.emit).toHaveBeenCalledWith('room:leave', { roomCode: 'LEAV' }, expect.any(Function));
    expect(currentRoom.value).toBeNull();
    expect(currentPlayer.value).toBeNull();
    expect(sessionToken.value).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('should clear sessionStorage on leaveRoom after 2000ms timeout if ack is dropped', async () => {
    vi.useFakeTimers();
    try {
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ roomCode: 'LEAV', playerId: 'p1', sessionToken: 'token' })
      );

      const { leaveRoom, currentRoom, sessionToken, currentPlayer } = useSocket(mockSocket);

      currentRoom.value = {
        roomCode: 'LEAV',
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
      sessionToken.value = 'token';

      // Simulate packet drop (ack never arrives)
      mockSocket.emit.mockImplementation(() => {});

      const leavePromise = leaveRoom('LEAV');

      // Before timeout, credentials and room state are preserved
      expect(currentRoom.value).not.toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();

      // Fast forward past 2000ms timeout
      vi.advanceTimersByTime(2100);
      await leavePromise;

      expect(currentRoom.value).toBeNull();
      expect(currentPlayer.value).toBeNull();
      expect(sessionToken.value).toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should NOT clear sessionStorage on game:over to retain credentials for rematch and reconnection (CRIT-005)', () => {
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
    // [CRIT-005] Session credentials MUST be retained throughout game_over state
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    const saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!);
    expect(saved.roomCode).toBe('OVER');
    expect(saved.sessionToken).toBe('token');
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
      JSON.stringify({ roomCode: 'SYNC', playerId: UUID_P1, sessionToken: 'sync_token' })
    );

    mockSocket.id = 'old_sock_1';
    mockSocket.connected = true;
    const { currentRoom, currentPlayer } = useSocket(mockSocket);

    currentRoom.value = {
      roomCode: 'SYNC',
      status: 'playing',
      hostId: UUID_P1,
      whitePlayer: {
        id: UUID_P1,
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
          playerId: UUID_P1,
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

  it('should notify onOpponentMove subscribers and update lastMoveEvent for opponent moves (MAJ-009)', () => {
    const { currentPlayer, currentRoom, lastMoveEvent, onOpponentMove } = useSocket(mockSocket);
    const opponentMoveSpy = vi.fn();
    const unsub = onOpponentMove(opponentMoveSpy);

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
    const moveData1 = {
      move: { color: 'b', san: 'e5', from: 'e7', to: 'e5' } as MoveResult,
      gameState: { fen: 'fen2' } as GameState,
    };
    eventHandlers['game:moved'](moveData1);
    expect(opponentMoveSpy).toHaveBeenCalledTimes(1);
    expect(opponentMoveSpy).toHaveBeenCalledWith(moveData1);
    expect(lastMoveEvent.value).toEqual(moveData1);

    // Opponent capture move (color: 'b', captured: 'p')
    const moveData2 = {
      move: { color: 'b', san: 'exd4', from: 'e5', to: 'd4', captured: 'p' } as MoveResult,
      gameState: { fen: 'fen3' } as GameState,
    };
    eventHandlers['game:moved'](moveData2);
    expect(opponentMoveSpy).toHaveBeenCalledTimes(2);
    expect(opponentMoveSpy).toHaveBeenCalledWith(moveData2);
    expect(lastMoveEvent.value).toEqual(moveData2);

    // Own move (color: 'w') should update lastMoveEvent but NOT trigger onOpponentMove
    const ownMoveData = {
      move: { color: 'w', san: 'd4', from: 'd2', to: 'd4' } as MoveResult,
      gameState: { fen: 'fen4' } as GameState,
    };
    eventHandlers['game:moved'](ownMoveData);
    expect(opponentMoveSpy).toHaveBeenCalledTimes(2); // unchanged
    expect(lastMoveEvent.value).toEqual(ownMoveData);

    // Unsubscribe removes listener
    unsub();
    eventHandlers['game:moved'](moveData1);
    expect(opponentMoveSpy).toHaveBeenCalledTimes(2); // unchanged
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

  it('should handle room:player_left by clearing departed player from room state (MAJ-021)', () => {
    const { currentRoom, currentPlayer } = useSocket(mockSocket);

    const whiteP: Player = { id: 'p1', socketId: 's1', name: 'P1', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 };
    const blackP: Player = { id: 'p2', socketId: 's2', name: 'P2', color: 'b', isHost: false, isConnected: true, connectedAt: 1000 };
    const specP: Player = { id: 'p3', socketId: 's3', name: 'P3', color: 'w', isHost: false, isConnected: true, connectedAt: 1000 };

    const dummyRoom: RoomState = {
      roomCode: 'JOIN1',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: whiteP,
      blackPlayer: blackP,
      spectators: [specP],
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

    currentPlayer.value = blackP;

    // Black player left
    eventHandlers['room:player_left']({ playerId: 'p2' });
    expect(currentRoom.value?.blackPlayer).toBeNull();
    expect(currentRoom.value?.whitePlayer).toEqual(whiteP);
    expect(currentPlayer.value).toBeNull();

    // Spectator leaves
    eventHandlers['room:player_left']({ playerId: 'p3' });
    expect(currentRoom.value?.spectators).toHaveLength(0);

    // White player leaves
    eventHandlers['room:player_left']({ playerId: 'p1' });
    expect(currentRoom.value?.whitePlayer).toBeNull();
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

      const reconnectPromise = reconnect('TEST', UUID_P1, 'tok');
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
        error: expect.objectContaining({ code: 'ERR_SOCKET_TIMEOUT', message: 'Draw offer timed out.' }),
      });
    });

    it('should invoke callback with ERR_SOCKET_TIMEOUT when respondDraw times out after 8 seconds', async () => {
      const { respondDraw } = useSocket(mockSocket);
      const callback = vi.fn();

      respondDraw('TEST', true, callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({ code: 'ERR_SOCKET_TIMEOUT', message: 'Draw response timed out.' }),
      });
    });

    it('should invoke callback with ERR_SOCKET_TIMEOUT when requestRematch times out after 8 seconds', async () => {
      const { requestRematch } = useSocket(mockSocket);
      const callback = vi.fn();

      requestRematch('TEST', callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({ code: 'ERR_SOCKET_TIMEOUT', message: 'Rematch request timed out.' }),
      });
    });

    it('should invoke callback with ERR_SOCKET_TIMEOUT when respondRematch times out after 8 seconds', async () => {
      const { respondRematch } = useSocket(mockSocket);
      const callback = vi.fn();

      respondRematch('TEST', true, callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({ code: 'ERR_SOCKET_TIMEOUT', message: 'Rematch response timed out.' }),
      });
    });

    it('should invoke callback with ERR_SOCKET_TIMEOUT when resign times out after 8 seconds', async () => {
      const { resign } = useSocket(mockSocket);
      const callback = vi.fn();

      resign('TEST', callback);
      vi.advanceTimersByTime(8500);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({ code: 'ERR_SOCKET_TIMEOUT', message: 'Resign timed out.' }),
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

      const reconPromise = reconnect('LATE', UUID_P1, 'token_old');
      vi.advanceTimersByTime(8500);

      const res = await reconPromise;
      expect(res.success).toBe(false);

      expect(capturedAck).toBeDefined();
      capturedAck!({
        success: true,
        room: {
          roomCode: 'LATE',
          status: 'playing',
          hostId: UUID_P1,
          whitePlayer: { id: UUID_P1, socketId: mockSocket.id, name: 'Alice', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
          blackPlayer: null,
          spectators: [],
          game: {} as GameState,
          rematch: null,
          createdAt: 1000,
          lastActivityAt: 1000,
        },
        player: { id: UUID_P1, socketId: mockSocket.id, name: 'Alice', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
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
        error: expect.objectContaining({ code: 'ERR_SOCKET_TIMEOUT', message: 'Draw offer timed out.' }),
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
        error: expect.objectContaining({ code: 'ERR_SOCKET_TIMEOUT', message: 'Draw response timed out.' }),
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
        error: expect.objectContaining({ code: 'ERR_SOCKET_TIMEOUT', message: 'Rematch request timed out.' }),
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
        error: expect.objectContaining({ code: 'ERR_SOCKET_TIMEOUT', message: 'Rematch response timed out.' }),
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
        error: expect.objectContaining({ code: 'ERR_SOCKET_TIMEOUT', message: 'Resign timed out.' }),
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

    it('should only transition status to paused_disconnect if previous status was playing (MAJ-001)', () => {
      const { currentRoom } = useSocket(mockSocket);

      // Case 1: In lobby, player disconnects -> status stays 'lobby'
      currentRoom.value = {
        roomCode: 'LOBY',
        status: 'lobby',
        hostId: 'p1',
        whitePlayer: { id: 'p1', socketId: 's1', name: 'P1', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
        blackPlayer: null,
        spectators: [],
        game: {} as GameState,
        rematch: null,
        createdAt: 1000,
        lastActivityAt: 1000,
      };

      eventHandlers['room:player_disconnected']({ playerId: 'p1', gracePeriodMs: 60000 });
      expect(currentRoom.value.status).toBe('lobby');
      expect(currentRoom.value.whitePlayer?.isConnected).toBe(false);

      // Case 2: In game_over, player disconnects -> status stays 'game_over'
      currentRoom.value = {
        ...currentRoom.value,
        status: 'game_over',
        whitePlayer: { id: 'p1', socketId: 's1', name: 'P1', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
      };

      eventHandlers['room:player_disconnected']({ playerId: 'p1', gracePeriodMs: 60000 });
      expect(currentRoom.value.status).toBe('game_over');
      expect(currentRoom.value.whitePlayer?.isConnected).toBe(false);
    });

    it('should mark spectator isConnected = false on spectator disconnect but NOT change room status to paused_disconnect (room stays playing)', () => {
      const { currentRoom } = useSocket(mockSocket);

      const spectator1: Player = {
        id: 'spec_1',
        socketId: 'sock_spec_1',
        name: 'SpectatorBob',
        color: 'w',
        isHost: false,
        isConnected: true,
        connectedAt: 1000,
      };

      const spectator2: Player = {
        id: 'spec_2',
        socketId: 'sock_spec_2',
        name: 'SpectatorAlice',
        color: 'b',
        isHost: false,
        isConnected: true,
        connectedAt: 1000,
      };

      currentRoom.value = {
        roomCode: 'PLAY',
        status: 'playing',
        hostId: 'p1',
        whitePlayer: { id: 'p1', socketId: 's1', name: 'White', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
        blackPlayer: { id: 'p2', socketId: 's2', name: 'Black', color: 'b', isHost: false, isConnected: true, connectedAt: 1000 },
        spectators: [spectator1, spectator2],
        game: {} as GameState,
        rematch: null,
        createdAt: 1000,
        lastActivityAt: 1000,
      };

      // Disconnect spectator1 via playerId
      eventHandlers['room:player_disconnected']({ playerId: 'spec_1', gracePeriodMs: 60000 });

      expect(currentRoom.value.status).toBe('playing');
      expect(currentRoom.value.spectators[0]!.isConnected).toBe(false);
      expect(currentRoom.value.spectators[1]!.isConnected).toBe(true);
      expect(currentRoom.value.whitePlayer?.isConnected).toBe(true);
      expect(currentRoom.value.blackPlayer?.isConnected).toBe(true);

      // Disconnect spectator2 via player object
      eventHandlers['room:player_disconnected']({ player: spectator2, gracePeriodMs: 60000 });

      expect(currentRoom.value.status).toBe('playing');
      expect(currentRoom.value.spectators[1]!.isConnected).toBe(false);
      expect(currentRoom.value.whitePlayer?.isConnected).toBe(true);
      expect(currentRoom.value.blackPlayer?.isConnected).toBe(true);
    });

    it('should transition room status to paused_disconnect on white player disconnect', () => {
      const { currentRoom } = useSocket(mockSocket);

      currentRoom.value = {
        roomCode: 'PLAY',
        status: 'playing',
        hostId: 'p1',
        whitePlayer: { id: 'p1', socketId: 's1', name: 'White', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
        blackPlayer: { id: 'p2', socketId: 's2', name: 'Black', color: 'b', isHost: false, isConnected: true, connectedAt: 1000 },
        spectators: [],
        game: {} as GameState,
        rematch: null,
        createdAt: 1000,
        lastActivityAt: 1000,
      };

      eventHandlers['room:player_disconnected']({ playerId: 'p1', gracePeriodMs: 60000 });

      expect(currentRoom.value.status).toBe('paused_disconnect');
      expect(currentRoom.value.whitePlayer?.isConnected).toBe(false);
      expect(currentRoom.value.blackPlayer?.isConnected).toBe(true);
    });

    it('should transition room status to paused_disconnect on black player disconnect', () => {
      const { currentRoom } = useSocket(mockSocket);

      currentRoom.value = {
        roomCode: 'PLAY',
        status: 'playing',
        hostId: 'p1',
        whitePlayer: { id: 'p1', socketId: 's1', name: 'White', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
        blackPlayer: { id: 'p2', socketId: 's2', name: 'Black', color: 'b', isHost: false, isConnected: true, connectedAt: 1000 },
        spectators: [],
        game: {} as GameState,
        rematch: null,
        createdAt: 1000,
        lastActivityAt: 1000,
      };

      eventHandlers['room:player_disconnected']({ playerId: 'p2', gracePeriodMs: 60000 });

      expect(currentRoom.value.status).toBe('paused_disconnect');
      expect(currentRoom.value.blackPlayer?.isConnected).toBe(false);
      expect(currentRoom.value.whitePlayer?.isConnected).toBe(true);
    });

    it('should NOT transition room status to paused_disconnect when room status is waiting', () => {
      const { currentRoom } = useSocket(mockSocket);

      currentRoom.value = {
        roomCode: 'WAIT',
        status: 'waiting' as any,
        hostId: 'p1',
        whitePlayer: { id: 'p1', socketId: 's1', name: 'White', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
        blackPlayer: null,
        spectators: [],
        game: {} as GameState,
        rematch: null,
        createdAt: 1000,
        lastActivityAt: 1000,
      };

      eventHandlers['room:player_disconnected']({ playerId: 'p1', gracePeriodMs: 60000 });

      expect(currentRoom.value.status).toBe('waiting');
      expect(currentRoom.value.whitePlayer?.isConnected).toBe(false);
    });

    it('should handle reconnection for white, black, and spectators properly', () => {
      const { currentRoom } = useSocket(mockSocket);

      const spectator: Player = {
        id: 'spec_1',
        socketId: 'sock_spec',
        name: 'Watcher',
        color: 'w',
        isHost: false,
        isConnected: false,
        connectedAt: 1000,
      };

      // 1. Room is paused_disconnect because white is disconnected, black is connected
      currentRoom.value = {
        roomCode: 'RECON',
        status: 'paused_disconnect',
        hostId: 'p1',
        whitePlayer: { id: 'p1', socketId: 's1', name: 'White', color: 'w', isHost: true, isConnected: false, connectedAt: 1000 },
        blackPlayer: { id: 'p2', socketId: 's2', name: 'Black', color: 'b', isHost: false, isConnected: true, connectedAt: 1000 },
        spectators: [{ ...spectator }],
        game: {} as GameState,
        rematch: null,
        createdAt: 1000,
        lastActivityAt: 1000,
      };

      // White reconnects -> status becomes 'playing'
      eventHandlers['room:player_reconnected']({ playerId: 'p1', playerName: 'White' });
      expect(currentRoom.value.whitePlayer?.isConnected).toBe(true);
      expect(currentRoom.value.status).toBe('playing');

      // 2. Black disconnects -> room pauses
      eventHandlers['room:player_disconnected']({ playerId: 'p2', gracePeriodMs: 60000 });
      expect(currentRoom.value.status).toBe('paused_disconnect');
      expect(currentRoom.value.blackPlayer?.isConnected).toBe(false);

      // Black reconnects -> status becomes 'playing'
      eventHandlers['room:player_reconnected']({ playerId: 'p2', playerName: 'Black' });
      expect(currentRoom.value.blackPlayer?.isConnected).toBe(true);
      expect(currentRoom.value.status).toBe('playing');

      // 3. Spectator reconnects while room is playing -> status stays 'playing', spectator.isConnected becomes true
      eventHandlers['room:player_reconnected']({ playerId: 'spec_1', playerName: 'Watcher' });
      expect(currentRoom.value.spectators[0]!.isConnected).toBe(true);
      expect(currentRoom.value.status).toBe('playing');

      // 4. Reconnection with authoritative roomStatus provided in payload
      eventHandlers['room:player_reconnected']({ playerId: 'p1', playerName: 'White', roomStatus: 'game_over' });
      expect(currentRoom.value.status).toBe('game_over');
    });

    it('should reconcile authoritative roomStatus from server during disconnect', () => {
      const { currentRoom } = useSocket(mockSocket);

      currentRoom.value = {
        roomCode: 'AUTH',
        status: 'playing',
        hostId: 'p1',
        whitePlayer: { id: 'p1', socketId: 's1', name: 'White', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
        blackPlayer: { id: 'p2', socketId: 's2', name: 'Black', color: 'b', isHost: false, isConnected: true, connectedAt: 1000 },
        spectators: [{ id: 'spec_1', socketId: 's_s', name: 'Spec', color: 'w', isHost: false, isConnected: true, connectedAt: 1000 }],
        game: {} as GameState,
        rematch: null,
        createdAt: 1000,
        lastActivityAt: 1000,
      };

      // Server sends roomStatus: 'abandoned'
      eventHandlers['room:player_disconnected']({ playerId: 'p1', roomStatus: 'abandoned' });
      expect(currentRoom.value.status).toBe('abandoned');
      expect(currentRoom.value.whitePlayer?.isConnected).toBe(false);

      // Spectator disconnect with roomStatus: 'paused_disconnect' should NOT pause
      currentRoom.value.status = 'playing';
      eventHandlers['room:player_disconnected']({ playerId: 'spec_1', roomStatus: 'paused_disconnect' });
      expect(currentRoom.value.status).toBe('playing');
      expect(currentRoom.value.spectators[0]!.isConnected).toBe(false);
    });

    it('should safely no-op disconnect and reconnect handlers when currentRoom is null or ID is missing', () => {
      const { currentRoom } = useSocket(mockSocket);
      currentRoom.value = null;

      expect(() => {
        eventHandlers['room:player_disconnected']({ playerId: 'p1' });
        eventHandlers['room:player_reconnected']({ playerId: 'p1', playerName: 'P1' });
      }).not.toThrow();

      // currentRoom exists but event has no ID
      currentRoom.value = {
        roomCode: 'NOID',
        status: 'playing',
        hostId: 'p1',
        whitePlayer: { id: 'p1', socketId: 's1', name: 'White', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
        blackPlayer: null,
        spectators: [],
        game: {} as GameState,
        rematch: null,
        createdAt: 1000,
        lastActivityAt: 1000,
      };

      eventHandlers['room:player_disconnected']({});
      expect(currentRoom.value.status).toBe('playing');
      expect(currentRoom.value.whitePlayer?.isConnected).toBe(true);
    });

    it('should handle room:reconnected event directly updating currentRoom and currentPlayer', () => {
      const { currentRoom, currentPlayer } = useSocket(mockSocket);

      const targetRoom: RoomState = {
        roomCode: 'RREC',
        status: 'playing',
        hostId: 'p1',
        whitePlayer: { id: 'p1', socketId: 's1', name: 'White', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
        blackPlayer: { id: 'p2', socketId: 's2', name: 'Black', color: 'b', isHost: false, isConnected: true, connectedAt: 1000 },
        spectators: [],
        game: {} as GameState,
        rematch: null,
        createdAt: 1000,
        lastActivityAt: 1000,
      };

      const targetPlayer: Player = {
        id: 'p1',
        socketId: 's1',
        name: 'White',
        color: 'w',
        isHost: true,
        isConnected: true,
        connectedAt: 1000,
      };

      eventHandlers['room:reconnected']({
        room: targetRoom,
        player: targetPlayer,
        roomStatus: 'playing',
      });

      expect(currentRoom.value).toEqual(targetRoom);
      expect(currentPlayer.value).toEqual(targetPlayer);
    });

    it('properly re-hydrates drawOfferedBy and rematchRequestedBy on room:reconnected [CRIT-003]', () => {
      const { currentRoom, currentPlayer, drawOfferedBy, rematchRequestedBy } = useSocket(mockSocket);

      const hostPlayer: Player = {
        id: 'p1',
        socketId: 's1',
        name: 'White Host',
        color: 'w',
        isHost: true,
        isConnected: true,
        connectedAt: 1000,
      };

      const guestPlayer: Player = {
        id: 'p2',
        socketId: 's2',
        name: 'Black Opponent',
        color: 'b',
        isHost: false,
        isConnected: true,
        connectedAt: 1000,
      };

      // Case 1: Reconnecting as White (p1) while Black (p2) has active draw and rematch offers
      const roomWithIncomingOffers: RoomState = {
        roomCode: 'REHY',
        status: 'playing',
        hostId: 'p1',
        whitePlayer: hostPlayer,
        blackPlayer: guestPlayer,
        spectators: [],
        game: {} as GameState,
        drawOffer: {
          offeredBy: 'p2',
          offeredAt: 2000,
        },
        rematch: {
          requestedBy: 'p2',
          requestedAt: 2000,
          status: 'pending',
        },
        createdAt: 1000,
        lastActivityAt: 2000,
      };

      eventHandlers['room:reconnected']({
        room: roomWithIncomingOffers,
        player: hostPlayer,
        roomStatus: 'playing',
      });

      expect(currentRoom.value).toEqual(roomWithIncomingOffers);
      expect(currentPlayer.value).toEqual(hostPlayer);
      expect(drawOfferedBy.value).toEqual({
        fromPlayerId: 'p2',
        fromPlayerName: 'Black Opponent',
      });
      expect(rematchRequestedBy.value).toEqual({
        requestedBy: 'p2',
        requesterName: 'Black Opponent',
      });

      // Case 2: Reconnecting as White when White offered the draw/rematch (should not show response prompt)
      const roomWithSelfOffers: RoomState = {
        ...roomWithIncomingOffers,
        drawOffer: { offeredBy: 'p1', offeredAt: 2000 },
        rematch: { requestedBy: 'p1', requestedAt: 2000, status: 'pending' },
      };

      eventHandlers['room:reconnected']({
        room: roomWithSelfOffers,
        player: hostPlayer,
        roomStatus: 'playing',
      });

      expect(drawOfferedBy.value).toBeNull();
      expect(rematchRequestedBy.value).toBeNull();

      // Case 3: Reconnecting when no offers are active
      const roomWithNoOffers: RoomState = {
        ...roomWithIncomingOffers,
        drawOffer: null,
        rematch: null,
      };

      eventHandlers['room:reconnected']({
        room: roomWithNoOffers,
        player: hostPlayer,
        roomStatus: 'playing',
      });

      expect(drawOfferedBy.value).toBeNull();
      expect(rematchRequestedBy.value).toBeNull();
    });
  });

  describe('Client Socket Actions Zod Schema Validation Before Transmission (MIN-030)', () => {
    it('rejects createRoom with empty or invalid player name and does not emit', async () => {
      const { createRoom, lastError } = useSocket(mockSocket);
      const res = await createRoom('');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('ERR_INVALID_PAYLOAD');
        expect(res.error.message).toContain('Player name cannot be empty');
      }
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects joinRoom with invalid room code or name and does not emit', async () => {
      const { joinRoom, lastError } = useSocket(mockSocket);
      const res = await joinRoom('ABC', 'ValidName'); // Only 3 characters
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('ERR_INVALID_PAYLOAD');
        expect(res.error.message).toContain('Room code must be exactly 4 characters');
      }
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects makeMove with invalid squares and does not emit', async () => {
      const { makeMove, lastError } = useSocket(mockSocket);
      const res = await makeMove('STAR', { from: 'z9' as any, to: 'e4' });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('ERR_INVALID_PAYLOAD');
      }
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects reconnect with non-uuid playerId and does not emit', async () => {
      const { reconnect, lastError } = useSocket(mockSocket);
      const res = await reconnect('STAR', 'not-a-uuid', 'token123');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('ERR_INVALID_PAYLOAD');
        expect(res.error.message).toContain('UUID');
      }
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects resign, offerDraw, respondDraw, requestRematch, respondRematch, leaveRoom with invalid room code without emitting', async () => {
      const { resign, offerDraw, respondDraw, requestRematch, respondRematch, leaveRoom, lastError } = useSocket(mockSocket);

      const cbResign = vi.fn();
      resign('BAD_CODE_TOO_LONG', cbResign);
      expect(cbResign).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');

      const cbDraw = vi.fn();
      offerDraw('A', cbDraw);
      expect(cbDraw).toHaveBeenCalledWith(expect.objectContaining({ success: false }));

      const cbRespDraw = vi.fn();
      respondDraw('A', true, cbRespDraw);
      expect(cbRespDraw).toHaveBeenCalledWith(expect.objectContaining({ success: false }));

      const cbRematch = vi.fn();
      requestRematch('A', cbRematch);
      expect(cbRematch).toHaveBeenCalledWith(expect.objectContaining({ success: false }));

      const cbRespRematch = vi.fn();
      respondRematch('A', true, cbRespRematch);
      expect(cbRespRematch).toHaveBeenCalledWith(expect.objectContaining({ success: false }));

      const cbLeave = vi.fn();
      await leaveRoom('A', cbLeave);
      expect(cbLeave).toHaveBeenCalledWith({ success: false });

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('Comprehensive branch and edge case coverage', () => {
    it('should handle leaveRoom when socket is disconnected or absent', async () => {
      const { leaveRoom, currentRoom, currentPlayer, sessionToken } = useSocket(mockSocket);
      currentRoom.value = { roomCode: 'LEAV' } as any;
      currentPlayer.value = { id: 'p1' } as any;
      sessionToken.value = 'tok_1';
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ roomCode: 'LEAV', playerId: 'p1', sessionToken: 'tok_1' }));

      mockSocket.connected = false;

      const callback = vi.fn();
      await leaveRoom('LEAV', callback);

      expect(currentRoom.value).toBeNull();
      expect(currentPlayer.value).toBeNull();
      expect(sessionToken.value).toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('should handle leaveRoom with typed ack callback and remove shared_socket_456 backdoor [CRIT-003 & MAJ-026]', async () => {
      const { leaveRoom } = useSocket(mockSocket);
      mockSocket.id = 'shared_socket_456';
      mockSocket.connected = true;

      mockSocket.emit.mockImplementation((event: string, _payload: any, cb?: Function) => {
        if (event === 'room:leave' && cb) {
          cb({ success: true });
        }
      });

      const callback = vi.fn();
      const result = await leaveRoom('LEAV', callback);
      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'room:leave',
        expect.objectContaining({ roomCode: 'LEAV' }),
        expect.any(Function)
      );
    });

    it('should handle leaveRoom fallback timeout when server does not respond [MAJ-026]', async () => {
      vi.useFakeTimers();
      const { leaveRoom } = useSocket(mockSocket);
      mockSocket.id = 'regular_sock';
      mockSocket.connected = true;

      // Server does not call callback (emulating hanging network or no ack)
      mockSocket.emit.mockImplementation(() => {});

      const callback = vi.fn();
      const leavePromise = leaveRoom('LEAV', callback);

      // Advance timers to trigger fallback timeout
      await vi.advanceTimersByTimeAsync(2500);

      const result = await leavePromise;
      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith({ success: true });
      vi.useRealTimers();
    });

    it('should handle leaveRoom when server responds with success: false', async () => {
      const { leaveRoom } = useSocket(mockSocket);
      mockSocket.id = 'regular_sock';
      mockSocket.connected = true;

      mockSocket.emit.mockImplementation((event: string, _payload: any, cb: Function) => {
        if (event === 'room:leave') {
          cb({ success: false });
        }
      });

      const callback = vi.fn();
      await leaveRoom('LEAV', callback);
      expect(callback).toHaveBeenCalledWith({ success: false });
    });

    it('should handle makeMove when socket is disconnected', async () => {
      const { makeMove } = useSocket(mockSocket);
      mockSocket.connected = false;

      const res = await makeMove('PLAY', { from: 'e2', to: 'e4' });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('ERR_INTERNAL_SERVER');
        expect(res.error.message).toBe('Socket not connected');
      }
    });

    it('should detach previous socket listeners and reset state when switching injectedSocket', () => {
      useSocket(mockSocket);

      const newSocket = {
        id: 'new_sock_456',
        connected: true,
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };

      const { socketId } = useSocket(newSocket as any);
      expect(socketId.value).toBe('new_sock_456');
      expect(mockSocket.off).toHaveBeenCalled();
      expect(newSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should handle player left for blackPlayer, spectator, and currentPlayer', () => {
      const { currentRoom, currentPlayer } = useSocket(mockSocket);

      const spectator = { id: 'spec_1', socketId: 's3', name: 'Spec', color: 'w', isHost: false, isConnected: true, connectedAt: 1000 };
      currentRoom.value = {
        roomCode: 'LEFT',
        status: 'playing',
        hostId: 'p1',
        whitePlayer: { id: 'p1', socketId: 's1', name: 'White', color: 'w', isHost: true, isConnected: true, connectedAt: 1000 },
        blackPlayer: { id: 'p2', socketId: 's2', name: 'Black', color: 'b', isHost: false, isConnected: true, connectedAt: 1000 },
        spectators: [spectator as any],
        game: {} as GameState,
        rematch: null,
        createdAt: 1000,
        lastActivityAt: 1000,
      };
      currentPlayer.value = { id: 'p2', socketId: 's2', name: 'Black', color: 'b', isHost: false, isConnected: true, connectedAt: 1000 };

      // Spectator leaves
      eventHandlers['room:player_left']({ playerId: 'spec_1', playerName: 'Spec', reason: 'left' });
      expect(currentRoom.value.spectators).toHaveLength(0);

      // Black player (current player) leaves
      eventHandlers['room:player_left']({ playerId: 'p2', playerName: 'Black', reason: 'left' });
      expect(currentRoom.value.blackPlayer).toBeNull();
      expect(currentPlayer.value).toBeNull();
    });

    it('should handle game:draw_declined and game:rematch_declined payloads', () => {
      const { drawOfferedBy, rematchRequestedBy } = useSocket(mockSocket);

      drawOfferedBy.value = { fromPlayerId: 'p1', fromPlayerName: 'White' };
      rematchRequestedBy.value = { requestedBy: 'p1', requesterName: 'White' };

      eventHandlers['game:draw_declined']({ byPlayerId: 'p2' });
      expect(drawOfferedBy.value).toBeNull();

      eventHandlers['game:rematch_declined']({ byPlayerId: 'p2' });
      expect(rematchRequestedBy.value).toBeNull();
    });

    it('should catch errors thrown by onOpponentMove subscribers without crashing', () => {
      const { onOpponentMove, currentPlayer } = useSocket(mockSocket);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      currentPlayer.value = { id: 'p1', color: 'w' } as any;

      const errorListener = vi.fn(() => {
        throw new Error('Listener exploded');
      });
      const unsubscribe = onOpponentMove(errorListener);

      expect(() => {
        eventHandlers['game:moved']({
          move: { color: 'b', san: 'e5' } as any,
          gameState: {} as any,
        });
      }).not.toThrow();

      expect(errorListener).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[useSocket] Error in onOpponentMove listener:'),
        expect.any(Error)
      );

      unsubscribe();
      warnSpy.mockRestore();
    });

    it('should handle corrupted or invalid saved sessions gracefully', () => {
      useSocket(mockSocket);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Corrupted JSON in session storage
      sessionStorage.setItem(SESSION_STORAGE_KEY, '{ invalid JSON');

      // Calling connect / checking auto-reconnect should not throw
      expect(() => {
        eventHandlers['connect']();
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to parse saved session from storage/),
        expect.anything()
      );

      warnSpy.mockRestore();
    });

    it('should invoke callbacks when server responds to resign, offerDraw, respondDraw, requestRematch, and respondRematch', () => {
      const { resign, offerDraw, respondDraw, requestRematch, respondRematch } = useSocket(mockSocket);

      mockSocket.emit.mockImplementation((_event: string, _payload: any, cb?: Function) => {
        if (cb) cb({ success: true });
      });

      const cbResign = vi.fn();
      resign('TEST', cbResign);
      expect(cbResign).toHaveBeenCalledWith({ success: true });

      const cbOffer = vi.fn();
      offerDraw('TEST', cbOffer);
      expect(cbOffer).toHaveBeenCalledWith({ success: true });

      const cbRespDraw = vi.fn();
      respondDraw('TEST', true, cbRespDraw);
      expect(cbRespDraw).toHaveBeenCalledWith({ success: true });

      const cbReqRematch = vi.fn();
      requestRematch('TEST', cbReqRematch);
      expect(cbReqRematch).toHaveBeenCalledWith({ success: true });

      const cbRespRematch = vi.fn();
      respondRematch('TEST', true, cbRespRematch);
      expect(cbRespRematch).toHaveBeenCalledWith({ success: true });
    });

    it('should handle server error response on createRoom and joinRoom', async () => {
      const { createRoom, joinRoom, lastError } = useSocket(mockSocket);

      mockSocket.emit.mockImplementation((_event: string, _payload: any, cb: Function) => {
        cb({ success: false, error: { code: 'ERR_ROOM_FULL', message: 'Room is full' } });
      });

      const resCreate = await createRoom('Alice');
      expect(resCreate.success).toBe(false);
      expect(lastError.value?.code).toBe('ERR_ROOM_FULL');

      const resJoin = await joinRoom('TEST', 'Bob');
      expect(resJoin.success).toBe(false);
      expect(lastError.value?.code).toBe('ERR_ROOM_FULL');
    });

    it('should support initSocket with custom url and correlation ID', () => {
      resetSocketState();
      const { initSocket } = useSocket();
      const sock = initSocket('http://localhost:4000', 'corr-12345');
      expect(sock).toBeDefined();
    });
  });

  describe('Structured 3-Point Logging for Client Socket Actions (MAJ-019)', () => {
    it('emits start and success logs with correlationId and duration for createRoom', async () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      const infoSpy = vi.spyOn(logger, 'info');

      mockSocket.emit.mockImplementation((event: string, _payload: any, cb?: Function) => {
        if (event === 'room:create' && cb) {
          cb({
            success: true,
            room: {
              roomCode: 'LOG1',
              status: 'lobby',
              hostId: 'p1',
              whitePlayer: { id: 'p1', name: 'Alice', color: 'w', isHost: true },
              blackPlayer: null,
              spectators: [],
              game: {},
            },
            player: { id: 'p1', name: 'Alice', color: 'w', isHost: true },
            sessionToken: 'tok_log1',
          });
        }
      });

      const { createRoom } = useSocket(mockSocket);
      const res = await createRoom('Alice');
      expect(res.success).toBe(true);

      // Verify start log
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('room'),
        expect.objectContaining({
          operation: expect.stringMatching(/room_create|socket/),
          correlationId: expect.any(String),
        })
      );

      // Verify completion log
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('succeeded'),
        expect.objectContaining({
          operation: expect.stringMatching(/room_create|socket/),
          correlationId: expect.any(String),
          duration: expect.any(Number),
        })
      );
    });

    it('emits failure logs with correlationId and error context when socket action fails', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      mockSocket.emit.mockImplementation((event: string, _payload: any, cb?: Function) => {
        if (event === 'room:join' && cb) {
          cb({
            success: false,
            error: {
              code: 'ERR_ROOM_NOT_FOUND',
              message: 'Room DOESNOTEXIST not found',
            },
          });
        }
      });

      const { joinRoom } = useSocket(mockSocket);
      const res = await joinRoom('DOESNOTEXIST', 'Bob');
      expect(res.success).toBe(false);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.objectContaining({
          operation: expect.stringMatching(/room_join|socket/),
          correlationId: expect.any(String),
          duration: expect.any(Number),
          error: expect.anything(),
        })
      );
    });
  });
});
