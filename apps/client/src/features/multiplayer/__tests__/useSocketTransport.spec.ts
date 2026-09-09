import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useSocketTransport,
  resetTransportState,
  resetSocketTransportState,
  initSocket,
  connect,
  disconnect,
  emitWithTimeout,
  registerSocketEventListener,
} from '../composables/useSocketTransport';
import { logger } from '@/platform/telemetry';
import type {
  SocketErrorPayload,
  Player,
  GameState,
  RoomState,
  MoveResult,
  GameOverPayload,
} from '@fun-chess/shared';

describe('useSocketTransport composable', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, any>;

  function createMockSocket(overrides: Record<string, any> = {}) {
    eventHandlers = {};
    const s = {
      id: 'mock_sock_001',
      connected: true,
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      }),
      off: vi.fn((event: string, handler: Function) => {
        if (eventHandlers[event] === handler) {
          delete eventHandlers[event];
        }
      }),
      emit: vi.fn(),
      connect: vi.fn(function (this: any) {
        this.connected = true;
        if (eventHandlers['connect']) eventHandlers['connect']();
      }),
      disconnect: vi.fn(function (this: any) {
        this.connected = false;
        if (eventHandlers['disconnect']) eventHandlers['disconnect']();
      }),
      ...overrides,
    };
    return s;
  }

  beforeEach(() => {
    resetTransportState();
    vi.clearAllMocks();
    mockSocket = createMockSocket();
  });

  afterEach(() => {
    resetTransportState();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Connection Lifecycle & Initialization
  // ==========================================================================
  describe('Connection Lifecycle & Initialization', () => {
    it('initializes socket and attaches event listeners', () => {
      const transport = useSocketTransport(mockSocket);

      expect(transport.socket.value).toBe(mockSocket);
      expect(transport.isConnected.value).toBe(true);
      expect(transport.socketId.value).toBe('mock_sock_001');
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('reconnect_failed', expect.any(Function));
    });

    it('connects when connect() is called on a disconnected socket', () => {
      mockSocket.connected = false;
      const transport = useSocketTransport(mockSocket);
      expect(transport.isConnected.value).toBe(false);

      connect();

      expect(mockSocket.connect).toHaveBeenCalled();
      expect(transport.isConnected.value).toBe(true);
    });

    it('does not invoke socket.connect() if already connected', () => {
      mockSocket.connected = true;
      useSocketTransport(mockSocket);

      connect();

      expect(mockSocket.connect).not.toHaveBeenCalled();
    });

    it('disconnects and updates reactive state when disconnect() is called', () => {
      const transport = useSocketTransport(mockSocket);
      expect(transport.isConnected.value).toBe(true);

      disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(transport.isConnected.value).toBe(false);
      expect(transport.isReconnecting.value).toBe(false);
    });

    it('supports custom client injection in initSocket', () => {
      const customSocket = createMockSocket({ id: 'custom_sock_999' });
      const sock = initSocket('http://localhost:3000', 'corr-custom-1', customSocket as any);

      expect(sock).toBe(customSocket);
      expect(sock.id).toBe('custom_sock_999');
      const transport = useSocketTransport();
      expect(transport.socket.value).toBe(customSocket);
    });

    it('detaches listeners from previous socket when a new socket is injected', () => {
      useSocketTransport(mockSocket);
      expect(mockSocket.on).toHaveBeenCalled();

      const newSocket = createMockSocket({ id: 'sock_replacement' });
      useSocketTransport(newSocket as any);

      expect(mockSocket.off).toHaveBeenCalled();
      expect(newSocket.on).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. Connection State Reactivity
  // ==========================================================================
  describe('Connection State Reactivity', () => {
    it('updates isConnected and socketId when connect event fires', () => {
      const unconnectedSocket = createMockSocket({ id: '', connected: false });
      const transport = useSocketTransport(unconnectedSocket as any);

      expect(transport.isConnected.value).toBe(false);
      expect(transport.socketId.value).toBe('');

      unconnectedSocket.id = 'assigned_socket_777';
      eventHandlers['connect']();

      expect(transport.isConnected.value).toBe(true);
      expect(transport.socketId.value).toBe('assigned_socket_777');
      expect(transport.isReconnecting.value).toBe(false);
      expect(transport.connectionError.value).toBeNull();
    });

    it('updates isConnected to false when disconnect event fires', () => {
      const transport = useSocketTransport(mockSocket);
      expect(transport.isConnected.value).toBe(true);

      eventHandlers['disconnect']('transport close');

      expect(transport.isConnected.value).toBe(false);
      expect(transport.isReconnecting.value).toBe(false);
    });

    it('resets all transport reactive state on resetTransportState()', () => {
      const transport = useSocketTransport(mockSocket);
      transport.latencyMs.value = 120;
      transport.connectionError.value = 'Failed';
      transport.lastError.value = { code: 'ERR_SOCKET_TIMEOUT', message: 'Timeout' };
      transport.isReconnecting.value = true;

      resetTransportState();

      expect(transport.isConnected.value).toBe(false);
      expect(transport.socketId.value).toBe('');
      expect(transport.isReconnecting.value).toBe(false);
      expect(transport.connectionError.value).toBeNull();
      expect(transport.lastError.value).toBeNull();
      expect(transport.latencyMs.value).toBe(0);
    });

    it('aliases resetSocketTransportState to resetTransportState', () => {
      expect(resetSocketTransportState).toBe(resetTransportState);
    });
  });

  // ==========================================================================
  // 3. Error Handling
  // ==========================================================================
  describe('Error Handling', () => {
    it('handles connect_error by setting isConnected to false and updating lastError', () => {
      const transport = useSocketTransport(mockSocket);
      const warnSpy = vi.spyOn(logger, 'warn');

      eventHandlers['connect_error'](new Error('Network unreachable'));

      expect(transport.isConnected.value).toBe(false);
      expect(transport.connectionError.value).toBe('Network unreachable');
      expect(transport.lastError.value).toEqual({
        code: 'ERR_SOCKET_TIMEOUT',
        message: 'Network unreachable',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('error'),
        expect.objectContaining({
          operation: 'socket_connect_error',
          error: 'Network unreachable',
        })
      );
    });

    it('handles reconnect_failed by updating reactive error state', () => {
      const transport = useSocketTransport(mockSocket);
      const warnSpy = vi.spyOn(logger, 'warn');

      eventHandlers['reconnect_failed']();

      expect(transport.isConnected.value).toBe(false);
      expect(transport.isReconnecting.value).toBe(false);
      expect(transport.connectionError.value).toContain('Reconnection failed');
      expect(transport.lastError.value).toEqual({
        code: 'ERR_SOCKET_TIMEOUT',
        message: 'Reconnection failed after maximum attempts',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('reconnection'),
        expect.objectContaining({
          operation: 'socket_reconnect_failed',
        })
      );
    });

    it('handles error event and updates lastError with received SocketErrorPayload', () => {
      const transport = useSocketTransport(mockSocket);
      const warnSpy = vi.spyOn(logger, 'warn');

      const serverError: SocketErrorPayload = {
        code: 'ERR_ROOM_NOT_FOUND',
        message: 'Room ABCD does not exist',
        correlationId: 'corr-err-1',
      };

      eventHandlers['error'](serverError);

      expect(transport.lastError.value).toEqual(serverError);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('error'),
        expect.objectContaining({
          operation: 'socket_event_error',
          errorCode: 'ERR_ROOM_NOT_FOUND',
          errorMessage: 'Room ABCD does not exist',
        })
      );
    });
  });

  // ==========================================================================
  // 3b. Socket.IO v4 Manager Reconnection Delegation (MAJ-004)
  // ==========================================================================
  describe('Socket.IO v4 Manager Reconnection Delegation (MAJ-004)', () => {
    let managerHandlers: Record<string, any>;
    let mockManager: any;
    let mockSocketWithManager: any;

    beforeEach(() => {
      managerHandlers = {};
      mockManager = {
        on: vi.fn((event: string, handler: Function) => {
          managerHandlers[event] = handler;
        }),
        off: vi.fn((event: string, handler: Function) => {
          if (managerHandlers[event] === handler) {
            delete managerHandlers[event];
          }
        }),
      };
      mockSocketWithManager = createMockSocket({
        io: mockManager,
      });
    });

    it('attaches reconnect_attempt and reconnect_failed to s.io Manager', () => {
      useSocketTransport(mockSocketWithManager);

      expect(mockManager.on).toHaveBeenCalledWith('reconnect_attempt', expect.any(Function));
      expect(mockManager.on).toHaveBeenCalledWith('reconnect_failed', expect.any(Function));
    });

    it('sets isReconnecting to true and dispatches event on reconnect_attempt', () => {
      const transport = useSocketTransport(mockSocketWithManager);
      const attemptSubscriber = vi.fn();
      registerSocketEventListener('reconnect_attempt', attemptSubscriber);

      managerHandlers['reconnect_attempt'](2);

      expect(transport.isReconnecting.value).toBe(true);
      expect(attemptSubscriber).toHaveBeenCalledWith(2);
    });

    it('resets isReconnecting and updates errors on reconnect_failed on Manager', () => {
      const transport = useSocketTransport(mockSocketWithManager);
      const failedSubscriber = vi.fn();
      const errorSubscriber = vi.fn();
      registerSocketEventListener('reconnect_failed', failedSubscriber);
      registerSocketEventListener('error', errorSubscriber);

      transport.isReconnecting.value = true;
      managerHandlers['reconnect_failed']();

      expect(transport.isReconnecting.value).toBe(false);
      expect(transport.connectionError.value).toContain('Reconnection failed');
      expect(transport.lastError.value?.code).toBe('ERR_SOCKET_TIMEOUT');
      expect(failedSubscriber).toHaveBeenCalled();
      expect(errorSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'ERR_SOCKET_TIMEOUT',
          message: 'Reconnection failed after maximum attempts',
        })
      );
    });

    it('resets isReconnecting to false when connect fires', () => {
      const transport = useSocketTransport(mockSocketWithManager);
      transport.isReconnecting.value = true;

      eventHandlers['connect']();

      expect(transport.isReconnecting.value).toBe(false);
    });

    it('preserves isReconnecting on disconnect if reconnecting is active', () => {
      const transport = useSocketTransport(mockSocketWithManager);
      transport.isReconnecting.value = true;

      eventHandlers['disconnect']('transport close');

      expect(transport.isReconnecting.value).toBe(true);
    });

    it('resets isReconnecting on disconnect if not reconnecting', () => {
      const transport = useSocketTransport(mockSocketWithManager);
      transport.isReconnecting.value = false;

      eventHandlers['disconnect']('io client disconnect');

      expect(transport.isReconnecting.value).toBe(false);
    });

    it('cleans up Manager listeners when socket is detached', () => {
      useSocketTransport(mockSocketWithManager);
      expect(mockManager.on).toHaveBeenCalled();

      const newSocket = createMockSocket({ id: 'sock_clean' });
      useSocketTransport(newSocket as any);

      expect(mockManager.off).toHaveBeenCalledWith('reconnect_attempt', expect.any(Function));
      expect(mockManager.off).toHaveBeenCalledWith('reconnect_failed', expect.any(Function));
    });
  });

  // ==========================================================================
  // 4. Structured Telemetry Interceptor Verification (All 21 Incoming Events)
  // ==========================================================================
  describe('Structured Telemetry Interceptor Verification (21 Events without Raw console.*)', () => {
    let consoleLogSpy: any;
    let consoleWarnSpy: any;
    let consoleErrorSpy: any;
    let consoleInfoSpy: any;
    let loggerInfoSpy: any;
    let loggerWarnSpy: any;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      loggerInfoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
      loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      useSocketTransport(mockSocket);
    });

    const validPlayer: Player = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      socketId: 'sock-1',
      name: 'Alice',
      avatar: '🦁',
      color: 'w',
      isHost: true,
      isConnected: true,
      connectedAt: 1000,
    };

    const validGameState: GameState = {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      isCheck: false,
      isCheckmate: false,
      isDraw: false,
      isStalemate: false,
      isThreefoldRepetition: false,
      isInsufficientMaterial: false,
      isFiftyMoveRule: false,
      moveHistory: [],
      capturedWhite: [],
      capturedBlack: [],
      materialAdvantage: { white: 0, black: 0 },
      lastMove: null,
      moveCount: 0,
    };

    const validRoom: RoomState = {
      roomCode: 'ABCD',
      status: 'playing',
      hostId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      whitePlayer: validPlayer,
      blackPlayer: null,
      spectators: [],
      game: validGameState,
      rematch: null,
      drawOffer: null,
      createdAt: 1000,
      lastActivityAt: 1000,
    };

    const validMoveResult: MoveResult = {
      from: 'e2',
      to: 'e4',
      san: 'e4',
      piece: 'p',
      color: 'w',
      flags: 'b',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      moveNumber: 1,
      timestamp: 1000,
    };

    const validGameOver: GameOverPayload = {
      winner: 'w',
      reason: 'checkmate',
      message: 'Checkmate',
      finalFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      totalMoves: 12,
      durationSeconds: 60,
    };

    const incomingEvents: Array<{
      event: string;
      payload?: any;
      expectedOperation: string;
      level: 'info' | 'warn';
    }> = [
      { event: 'connect', expectedOperation: 'socket_connect', level: 'info' },
      { event: 'disconnect', payload: 'io client disconnect', expectedOperation: 'socket_disconnect', level: 'info' },
      { event: 'connect_error', payload: new Error('connect fail'), expectedOperation: 'socket_connect_error', level: 'warn' },
      { event: 'reconnect_failed', expectedOperation: 'socket_reconnect_failed', level: 'warn' },
      { event: 'room:created', payload: validRoom, expectedOperation: 'socket_event_room_created', level: 'info' },
      { event: 'room:joined', payload: validRoom, expectedOperation: 'socket_event_room_joined', level: 'info' },
      { event: 'room:player_joined', payload: { player: validPlayer, room: validRoom }, expectedOperation: 'socket_event_player_joined', level: 'info' },
      { event: 'room:player_left', payload: { playerId: validPlayer.id, playerName: 'Bob', reason: 'quit' }, expectedOperation: 'socket_event_player_left', level: 'info' },
      { event: 'room:player_disconnected', payload: { playerId: validPlayer.id, gracePeriodMs: 30000, roomStatus: 'paused_disconnect' }, expectedOperation: 'socket_event_player_disconnected', level: 'info' },
      { event: 'room:player_reconnected', payload: { playerId: validPlayer.id, playerName: 'Bob', roomStatus: 'playing' }, expectedOperation: 'socket_event_player_reconnected', level: 'info' },
      { event: 'room:reconnected', payload: { room: validRoom, player: validPlayer }, expectedOperation: 'socket_event_room_reconnected', level: 'info' },
      { event: 'game:started', payload: validGameState, expectedOperation: 'socket_event_game_started', level: 'info' },
      { event: 'game:moved', payload: { move: validMoveResult, gameState: validGameState }, expectedOperation: 'socket_event_game_moved', level: 'info' },
      { event: 'game:check', payload: { inCheck: 'b', kingSquare: 'e8' }, expectedOperation: 'socket_event_game_check', level: 'info' },
      { event: 'game:over', payload: validGameOver, expectedOperation: 'socket_event_game_over', level: 'info' },
      { event: 'game:draw_offered', payload: { fromPlayerId: validPlayer.id, fromPlayerName: 'Bob' }, expectedOperation: 'socket_event_draw_offered', level: 'info' },
      { event: 'game:draw_declined', payload: { byPlayerId: validPlayer.id }, expectedOperation: 'socket_event_draw_declined', level: 'info' },
      { event: 'game:rematch_requested', payload: { requestedBy: validPlayer.id, requesterName: 'Bob' }, expectedOperation: 'socket_event_rematch_requested', level: 'info' },
      { event: 'game:rematch_started', payload: { room: validRoom, gameState: validGameState }, expectedOperation: 'socket_event_rematch_started', level: 'info' },
      { event: 'game:rematch_declined', payload: { byPlayerId: validPlayer.id }, expectedOperation: 'socket_event_rematch_declined', level: 'info' },
      { event: 'error', payload: { code: 'ERR_INVALID_MOVE', message: 'Illegal move' }, expectedOperation: 'socket_event_error', level: 'warn' },
    ];

    it('registers exactly 21 telemetry event interceptors', () => {
      expect(incomingEvents.length).toBe(21);
      incomingEvents.forEach(({ event }) => {
        expect(eventHandlers[event]).toBeDefined();
        expect(typeof eventHandlers[event]).toBe('function');
      });
    });

    incomingEvents.forEach(({ event, payload, expectedOperation, level }) => {
      it(`emits structured telemetry on "${event}" without calling console.*`, () => {
        consoleLogSpy.mockClear();
        consoleWarnSpy.mockClear();
        consoleErrorSpy.mockClear();
        consoleInfoSpy.mockClear();
        loggerInfoSpy.mockClear();
        loggerWarnSpy.mockClear();

        eventHandlers[event](payload);

        const targetSpy = level === 'info' ? loggerInfoSpy : loggerWarnSpy;
        expect(targetSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            operation: expectedOperation,
          })
        );

        // Verification: Zero raw console.* calls
        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(consoleWarnSpy).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(consoleInfoSpy).not.toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // 5. Typed Emissions with Timeout & Acknowledgments
  // ==========================================================================
  describe('Typed Emissions with Timeout and Acknowledgments', () => {
    it('emits payload and resolves on successful server acknowledgment', async () => {
      const transport = useSocketTransport(mockSocket);
      const infoSpy = vi.spyOn(logger, 'info');
      const onSuccess = vi.fn();
      const callback = vi.fn();

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        expect(event).toBe('custom:event');
        expect(payload).toEqual({ foo: 'bar' });
        ack({ success: true, data: 'ok' });
      });

      const promise = emitWithTimeout(mockSocket, 'custom:event', { foo: 'bar' }, {
        operation: 'test_emit_success',
        timeoutMessage: 'Custom timeout',
        onSuccess,
        callback,
      });

      const result = await promise;

      expect(result).toEqual({ success: true, data: 'ok' });
      expect(onSuccess).toHaveBeenCalledWith({ success: true, data: 'ok' });
      expect(callback).toHaveBeenCalledWith({ success: true, data: 'ok' });
      expect(transport.latencyMs.value).toBeGreaterThanOrEqual(0);
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('successfully'),
        expect.objectContaining({
          operation: 'test_emit_success',
          event: 'custom:event',
          durationMs: expect.any(Number),
        })
      );
    });

    it('handles server failure acknowledgment and populates lastError', async () => {
      const transport = useSocketTransport(mockSocket);
      const warnSpy = vi.spyOn(logger, 'warn');
      const onError = vi.fn();
      const callback = vi.fn();

      const serverError: SocketErrorPayload = {
        code: 'ERR_INVALID_MOVE',
        message: 'Piece cannot move to square',
        correlationId: 'corr-ack-err',
      };

      mockSocket.emit.mockImplementation((_event: string, _payload: any, ack: Function) => {
        ack({ success: false, error: serverError });
      });

      const result = await emitWithTimeout(mockSocket, 'game:move', { from: 'e2', to: 'e5' }, {
        operation: 'test_emit_failure',
        timeoutMessage: 'Timed out',
        onError,
        callback,
      });

      expect(result.success).toBe(false);
      expect(transport.lastError.value).toEqual(serverError);
      expect(onError).toHaveBeenCalledWith(serverError);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('failure'),
        expect.objectContaining({
          operation: 'test_emit_failure',
          error: serverError,
        })
      );
    });

    it('handles timeout when server does not respond within timeoutMs', async () => {
      vi.useFakeTimers();
      const transport = useSocketTransport(mockSocket);
      const warnSpy = vi.spyOn(logger, 'warn');
      const onError = vi.fn();
      const callback = vi.fn();

      // Emit does NOT trigger ack
      mockSocket.emit.mockImplementation(() => {});

      const promise = emitWithTimeout(mockSocket, 'slow:request', {}, {
        operation: 'test_emit_timeout',
        timeoutMs: 3000,
        timeoutMessage: 'Slow request timed out',
        onError,
        callback,
      });

      // Fast-forward time
      vi.advanceTimersByTime(3000);

      const result = await promise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ERR_SOCKET_TIMEOUT');
        expect(result.error.message).toBe('Slow request timed out');
      }
      expect(transport.lastError.value?.code).toBe('ERR_SOCKET_TIMEOUT');
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'ERR_SOCKET_TIMEOUT' }));
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('timed out'),
        expect.objectContaining({
          operation: 'test_emit_timeout',
        })
      );

      vi.useRealTimers();
    });

    it('falls back to ERR_INTERNAL_SERVER when server returns failure without error payload', async () => {
      const transport = useSocketTransport(mockSocket);

      mockSocket.emit.mockImplementation((_event: string, _payload: any, ack: Function) => {
        ack({ success: false });
      });

      const result = await emitWithTimeout(mockSocket, 'bad:call', {}, {
        operation: 'test_fallback_error',
        timeoutMessage: 'Timeout',
      });

      expect(result.success).toBe(false);
      expect(transport.lastError.value?.code).toBe('ERR_INTERNAL_SERVER');
    });

    it('logs operation start at INFO level with static template (MIN-014, MAJ-024)', async () => {
      const infoSpy = vi.spyOn(logger, 'info');

      mockSocket.emit.mockImplementation((_event: string, _payload: any, ack: Function) => {
        ack({ success: true });
      });

      await emitWithTimeout(mockSocket, 'test:event', {}, {
        operation: 'test_operation_start_log',
        timeoutMessage: 'Timed out',
      });

      expect(infoSpy).toHaveBeenCalledWith(
        'Socket emit dispatched',
        expect.objectContaining({
          operation: 'test_operation_start_log',
          event: 'test:event',
        })
      );
    });
  });

  // ==========================================================================
  // 6. Internal Event Subscriber Registry
  // ==========================================================================
  describe('Internal Event Subscriber Registry', () => {
    const validGameState: GameState = {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      isCheck: false,
      isCheckmate: false,
      isDraw: false,
      isStalemate: false,
      isThreefoldRepetition: false,
      isInsufficientMaterial: false,
      isFiftyMoveRule: false,
      moveHistory: [],
      capturedWhite: [],
      capturedBlack: [],
      materialAdvantage: { white: 0, black: 0 },
      lastMove: null,
      moveCount: 0,
    };

    const validGameOver: GameOverPayload = {
      winner: 'w',
      reason: 'checkmate',
      message: 'Checkmate',
      finalFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      totalMoves: 12,
      durationSeconds: 60,
    };

    it('dispatches events to registered subscribers', () => {
      useSocketTransport(mockSocket);
      const subscriber = vi.fn();

      const unsubscribe = registerSocketEventListener('game:started', subscriber);

      eventHandlers['game:started'](validGameState);

      expect(subscriber).toHaveBeenCalledWith(validGameState);

      // Unsubscribe prevents further calls
      unsubscribe();
      eventHandlers['game:started'](validGameState);

      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('safely catches errors thrown by subscribers without crashing dispatch', () => {
      useSocketTransport(mockSocket);
      const warnSpy = vi.spyOn(logger, 'warn');

      const faultySubscriber = vi.fn(() => {
        throw new Error('Subscriber crash');
      });
      const healthySubscriber = vi.fn();

      registerSocketEventListener('game:over', faultySubscriber);
      registerSocketEventListener('game:over', healthySubscriber);

      expect(() => {
        eventHandlers['game:over'](validGameOver);
      }).not.toThrow();

      expect(healthySubscriber).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('subscriber'),
        expect.objectContaining({
          operation: 'socket_event_dispatch',
          event: 'game:over',
        })
      );
    });
  });

  // ==========================================================================
  // 7. Inbound WebSocket Runtime Schema Validation (MAJ-029)
  // ==========================================================================
  describe('Inbound WebSocket Runtime Schema Validation (MAJ-029)', () => {
    it('rejects and logs warning on malformed room:created payload without dispatching event', () => {
      useSocketTransport(mockSocket);
      const warnSpy = vi.spyOn(logger, 'warn');
      const subscriber = vi.fn();
      registerSocketEventListener('room:created', subscriber);

      // Malformed room: missing required fields
      eventHandlers['room:created']({ roomCode: 12345 });

      expect(subscriber).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('validation failed'),
        expect.objectContaining({
          operation: 'socket_payload_validation',
          event: 'room:created',
        })
      );
    });

    it('rejects and logs warning on malformed game:moved payload without dispatching event', () => {
      useSocketTransport(mockSocket);
      const warnSpy = vi.spyOn(logger, 'warn');
      const subscriber = vi.fn();
      registerSocketEventListener('game:moved', subscriber);

      // Malformed move: invalid move structure
      eventHandlers['game:moved']({ move: { invalid: true } });

      expect(subscriber).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('validation failed'),
        expect.objectContaining({
          operation: 'socket_payload_validation',
          event: 'game:moved',
        })
      );
    });

    it('rejects and logs warning on malformed game:check payload without dispatching event', () => {
      useSocketTransport(mockSocket);
      const warnSpy = vi.spyOn(logger, 'warn');
      const subscriber = vi.fn();
      registerSocketEventListener('game:check', subscriber);

      // Malformed check: invalid color and square
      eventHandlers['game:check']({ inCheck: 'invalid_color', kingSquare: 'z9' });

      expect(subscriber).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('validation failed'),
        expect.objectContaining({
          operation: 'socket_payload_validation',
          event: 'game:check',
        })
      );
    });
  });
});
