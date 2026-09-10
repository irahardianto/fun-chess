import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useMultiplayer,
  resetSocketState,
} from '../composables/useMultiplayer';
import { useSocketTransport } from '../composables/useSocketTransport';
import {
  SESSION_STORAGE_KEY,
  saveSession,
  getSavedSession,
} from '../composables/useRoomSession';
import type { GameState, GameOverPayload, MovePayload, MoveResult, Player, RoomState } from '@fun-chess/shared';

describe('useMultiplayer composable', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, Function>;

  const UUID_P1 = '11111111-1111-4111-8111-111111111111';
  const UUID_P2 = '22222222-2222-4222-8222-222222222222';

  function createMockSocket(overrides: Record<string, any> = {}) {
    eventHandlers = {};
    const s = {
      id: 'mock_sock_multi',
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

  function createTestPlayer(overrides: Partial<Player> = {}): Player {
    const now = Date.now();
    return {
      id: UUID_P1,
      socketId: 'mock_sock_multi',
      name: 'Alice',
      avatar: '🦁',
      color: 'w',
      isHost: true,
      isConnected: true,
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function createTestRoom(overrides: Partial<RoomState> = {}): RoomState {
    const whitePlayer = createTestPlayer({ id: UUID_P1, color: 'w', isHost: true });
    const blackPlayer = createTestPlayer({
      id: UUID_P2,
      socketId: 'mock_sock_multi_2',
      name: 'Bob',
      color: 'b',
      isHost: false,
    });
    return {
      roomCode: 'WXYZ',
      status: 'playing',
      hostId: UUID_P1,
      whitePlayer,
      blackPlayer,
      spectators: [],
      game: {
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
      } as GameState,
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      ...overrides,
    };
  }

  beforeEach(() => {
    resetSocketState();
    useSocketTransport().socket.value = null;
    sessionStorage.clear();
    vi.clearAllMocks();

    mockSocket = createMockSocket();
  });

  afterEach(() => {
    resetSocketState();
    useSocketTransport().socket.value = null;
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Unified Facade Aggregation
  // ==========================================================================
  describe('Unified Facade Aggregation', () => {
    it('cleanly aggregates all transport, room session, and game action methods and refs', () => {
      const multiplayer = useMultiplayer(mockSocket);

      // Transport members
      expect(multiplayer.socket).toBeDefined();
      expect(multiplayer.isConnected).toBeDefined();
      expect(multiplayer.socketId).toBeDefined();
      expect(multiplayer.isReconnecting).toBeDefined();
      expect(multiplayer.connectionError).toBeDefined();
      expect(multiplayer.lastError).toBeDefined();
      expect(multiplayer.latencyMs).toBeDefined();
      expect(typeof multiplayer.initSocket).toBe('function');
      expect(typeof multiplayer.connect).toBe('function');
      expect(typeof multiplayer.disconnect).toBe('function');

      // Room Session members
      expect(multiplayer.currentRoom).toBeDefined();
      expect(multiplayer.currentPlayer).toBeDefined();
      expect(multiplayer.sessionToken).toBeDefined();
      expect(multiplayer.isHost).toBeDefined();
      expect(multiplayer.isSpectator).toBeDefined();
      expect(typeof multiplayer.createRoom).toBe('function');
      expect(typeof multiplayer.joinRoom).toBe('function');
      expect(typeof multiplayer.leaveRoom).toBe('function');
      expect(typeof multiplayer.reconnect).toBe('function');
      expect(typeof multiplayer.getSavedSession).toBe('function');
      expect(typeof multiplayer.saveSession).toBe('function');
      expect(typeof multiplayer.clearSession).toBe('function');
      expect(typeof multiplayer.checkAndAutoReconnect).toBe('function');

      // Game Action members
      expect(multiplayer.gameState).toBeDefined();
      expect(multiplayer.turn).toBeDefined();
      expect(multiplayer.isCheck).toBeDefined();
      expect(multiplayer.isCheckmate).toBeDefined();
      expect(multiplayer.drawOfferedBy).toBeDefined();
      expect(multiplayer.rematchRequestedBy).toBeDefined();
      expect(multiplayer.lastGameOver).toBeDefined();
      expect(multiplayer.kingInCheck).toBeDefined();
      expect(multiplayer.lastMoveEvent).toBeDefined();
      expect(typeof multiplayer.onOpponentMove).toBe('function');
      expect(typeof multiplayer.makeMove).toBe('function');
      expect(typeof multiplayer.resign).toBe('function');
      expect(typeof multiplayer.offerDraw).toBe('function');
      expect(typeof multiplayer.respondDraw).toBe('function');
      expect(typeof multiplayer.requestRematch).toBe('function');
      expect(typeof multiplayer.respondRematch).toBe('function');
      expect(typeof multiplayer.resetSocketState).toBe('function');
    });

    it('executes room creation through the facade and updates shared session state', async () => {
      const multiplayer = useMultiplayer(mockSocket);
      const room = createTestRoom({ status: 'lobby', blackPlayer: null });

      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'room:create') {
          ack({
            success: true,
            room,
            sessionToken: 'token_facade_1',
          });
        }
      });

      const res = await multiplayer.createRoom('Alice', 'w');

      expect(res.success).toBe(true);
      expect(multiplayer.currentRoom.value?.roomCode).toBe('WXYZ');
      expect(multiplayer.sessionToken.value).toBe('token_facade_1');
      expect(multiplayer.isHost.value).toBe(true);
    });

    it('executes move through the facade', async () => {
      const multiplayer = useMultiplayer(mockSocket);
      const movePayload: MovePayload = { from: 'e2', to: 'e4' };
      const moveResult: MoveResult = {
        from: 'e2',
        to: 'e4',
        piece: 'p',
        san: 'e4',
        color: 'w',
        flags: 'n',
        fen: 'fen_after_move',
        moveNumber: 1,
        timestamp: Date.now(),
      };

      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'game:move') {
          ack({ success: true, moveResult });
        }
      });

      const res = await multiplayer.makeMove('WXYZ', movePayload);

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.moveResult).toEqual(moveResult);
      }
    });
  });

  // ==========================================================================
  // 2. Module-Singleton Reactive State (MAJ-013)
  // ==========================================================================
  describe('Module-Singleton Reactive State (MAJ-013)', () => {
    it('shares identical reactive refs across distinct useMultiplayer() invocations', () => {
      const instanceA = useMultiplayer(mockSocket);
      const instanceB = useMultiplayer();

      // Ensure identical ref instances
      expect(instanceA.isConnected).toBe(instanceB.isConnected);
      expect(instanceA.currentRoom).toBe(instanceB.currentRoom);
      expect(instanceA.currentPlayer).toBe(instanceB.currentPlayer);
      expect(instanceA.sessionToken).toBe(instanceB.sessionToken);
      expect(instanceA.drawOfferedBy).toBe(instanceB.drawOfferedBy);
      expect(instanceA.rematchRequestedBy).toBe(instanceB.rematchRequestedBy);
      expect(instanceA.lastGameOver).toBe(instanceB.lastGameOver);
      expect(instanceA.kingInCheck).toBe(instanceB.kingInCheck);
      expect(instanceA.gameState).toBe(instanceB.gameState);
    });

    it('synchronizes mutations made in one instance immediately across all instances', () => {
      const instanceA = useMultiplayer(mockSocket);
      const instanceB = useMultiplayer();

      const room = createTestRoom();
      instanceA.currentRoom.value = room;
      instanceA.sessionToken.value = 'token_shared_123';
      instanceA.drawOfferedBy.value = { fromPlayerId: UUID_P2, fromPlayerName: 'Bob' };

      expect(instanceB.currentRoom.value).toEqual(room);
      expect(instanceB.sessionToken.value).toBe('token_shared_123');
      expect(instanceB.drawOfferedBy.value).toEqual({
        fromPlayerId: UUID_P2,
        fromPlayerName: 'Bob',
      });
      expect(instanceB.gameState.value?.fen).toBe(room.game.fen);
    });
  });

  // ==========================================================================
  // 3. State Reset (resetSocketState)
  // ==========================================================================
  describe('State Reset (resetSocketState)', () => {
    it('completely resets all transport, room, in-game reactive refs and clears session storage', () => {
      const multiplayer = useMultiplayer(mockSocket);
      multiplayer.currentRoom.value = createTestRoom();
      multiplayer.currentPlayer.value = createTestPlayer();
      multiplayer.sessionToken.value = 'active_token';
      multiplayer.drawOfferedBy.value = { fromPlayerId: UUID_P2, fromPlayerName: 'Bob' };
      multiplayer.rematchRequestedBy.value = { requestedBy: UUID_P2, requesterName: 'Bob' };
      multiplayer.lastGameOver.value = { winner: 'w', reason: 'checkmate' } as GameOverPayload;
      multiplayer.kingInCheck.value = { inCheck: 'w', kingSquare: 'e1' };
      multiplayer.latencyMs.value = 85;

      saveSession({
        roomCode: 'WXYZ',
        playerId: UUID_P1,
        sessionToken: 'active_token',
      });
      expect(getSavedSession()).not.toBeNull();

      resetSocketState();

      expect(multiplayer.isConnected.value).toBe(false);
      expect(multiplayer.socketId.value).toBe('');
      expect(multiplayer.isReconnecting.value).toBe(false);
      expect(multiplayer.connectionError.value).toBeNull();
      expect(multiplayer.lastError.value).toBeNull();
      expect(multiplayer.latencyMs.value).toBe(0);

      expect(multiplayer.currentRoom.value).toBeNull();
      expect(multiplayer.currentPlayer.value).toBeNull();
      expect(multiplayer.sessionToken.value).toBeNull();

      expect(multiplayer.drawOfferedBy.value).toBeNull();
      expect(multiplayer.rematchRequestedBy.value).toBeNull();
      expect(multiplayer.lastGameOver.value).toBeNull();
      expect(multiplayer.kingInCheck.value).toBeNull();
      expect(multiplayer.lastMoveEvent.value).toBeNull();

      expect(getSavedSession()).toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });
  });

  // ==========================================================================
  // 4. Testing with injectedSocket
  // ==========================================================================
  describe('Testing with injectedSocket', () => {
    it('attaches listeners to injectedSocket and synchronizes connection state', () => {
      mockSocket.id = 'sock_injected_42';
      mockSocket.connected = true;

      const multiplayer = useMultiplayer(mockSocket);

      expect(multiplayer.isConnected.value).toBe(true);
      expect(multiplayer.socketId.value).toBe('sock_injected_42');
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('game:moved', expect.any(Function));
    });

    it('detaches previous socket and resets state when a new socket is injected', () => {
      const firstSocket = createMockSocket({ id: 'sock_first' });
      const multiplayer = useMultiplayer(firstSocket as any);

      multiplayer.currentRoom.value = createTestRoom();

      const secondSocket = createMockSocket({ id: 'sock_second', connected: true });
      useMultiplayer(secondSocket as any);

      expect(firstSocket.off).toHaveBeenCalled();
      expect(secondSocket.on).toHaveBeenCalled();
      expect(multiplayer.socketId.value).toBe('sock_second');
      expect(multiplayer.currentRoom.value).toBeNull(); // Reset on replacement
    });

    it('triggers checkAndAutoReconnect if injectedSocket is connected and valid session exists', () => {
      saveSession({
        roomCode: 'RECO',
        playerId: UUID_P1,
        sessionToken: 'tok_reco_123',
      });

      let reconnected = false;
      const connectedSocket = createMockSocket({
        id: 'sock_reco',
        connected: true,
        emit: vi.fn((event: string, _payload: any, ack: Function) => {
          if (event === 'room:reconnect') {
            reconnected = true;
            ack({
              success: true,
              room: createTestRoom({ roomCode: 'RECO' }),
              player: createTestPlayer({ id: UUID_P1 }),
            });
          }
        }),
      });

      useMultiplayer(connectedSocket as any);

      expect(reconnected).toBe(true);
    });
  });
});
