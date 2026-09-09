import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useGameActions,
  resetGameActionsState,
  onOpponentMove,
} from '../composables/useGameActions';
import {
  useRoomSession,
  resetRoomSessionState,
} from '../composables/useRoomSession';
import {
  useSocketTransport,
  resetTransportState,
} from '../composables/useSocketTransport';
import { logger } from '@/platform/telemetry';
import type { GameState, MovePayload, MoveResult, Player, RoomState, GameOverPayload } from '@fun-chess/shared';

describe('useGameActions composable', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, any>;

  const UUID_P1 = '11111111-1111-4111-8111-111111111111';
  const UUID_P2 = '22222222-2222-4222-8222-222222222222';

  function createMockSocket(overrides: Record<string, any> = {}) {
    eventHandlers = {};
    const s = {
      id: 'mock_sock_p1',
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
    return {
      id: UUID_P1,
      socketId: 'mock_sock_p1',
      name: 'Alice',
      avatar: '🦁',
      color: 'w',
      isHost: true,
      isConnected: true,
      connectedAt: Date.now(),
      ...overrides,
    };
  }

  function createTestGameState(overrides: Partial<GameState> = {}): GameState {
    return {
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
      ...overrides,
    };
  }

  function createTestRoom(overrides: Partial<RoomState> = {}): RoomState {
    const whitePlayer = createTestPlayer({ id: UUID_P1, color: 'w', isHost: true });
    const blackPlayer = createTestPlayer({
      id: UUID_P2,
      socketId: 'mock_sock_p2',
      name: 'Bob',
      color: 'b',
      isHost: false,
    });
    return {
      roomCode: 'GAME',
      status: 'playing',
      hostId: UUID_P1,
      whitePlayer,
      blackPlayer,
      spectators: [],
      game: createTestGameState(),
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      ...overrides,
    };
  }

  beforeEach(() => {
    resetTransportState();
    resetRoomSessionState();
    resetGameActionsState();
    sessionStorage.clear();
    vi.clearAllMocks();

    mockSocket = createMockSocket();
    useSocketTransport(mockSocket as any);
  });

  afterEach(() => {
    resetTransportState();
    resetRoomSessionState();
    resetGameActionsState();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Move Execution & Idempotency (MAJ-031)
  // ==========================================================================
  describe('Move Execution & Idempotency (MAJ-031)', () => {
    it('submits valid move with expectedMoveNumber and idempotencyKey', async () => {
      const game = useGameActions();
      const movePayload: MovePayload = {
        from: 'e2',
        to: 'e4',
      };

      const mockMoveResult: MoveResult = {
        from: 'e2',
        to: 'e4',
        piece: 'p',
        san: 'e4',
        color: 'w',
        flags: 'n',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        moveNumber: 1,
        timestamp: Date.now(),
      };

      const validIdempotencyKey = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'game:move') {
          expect(payload.roomCode).toBe('GAME');
          expect(payload.move).toEqual(movePayload);
          expect(payload.expectedMoveNumber).toBe(1);
          expect(payload.idempotencyKey).toBe(validIdempotencyKey);
          ack({ success: true, moveResult: mockMoveResult });
        }
      });

      const cb = vi.fn();
      const res = await game.makeMove('GAME', movePayload, 1, validIdempotencyKey, cb);

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.moveResult).toEqual(mockMoveResult);
      }
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('rejects move submission with invalid schema and does not emit', async () => {
      const game = useGameActions();
      const transport = useSocketTransport();

      // Missing required move fields
      const badMove = { from: 'invalid_square' } as any;

      const res = await game.makeMove('GAME', badMove);

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('ERR_INVALID_PAYLOAD');
      }
      expect(transport.lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('returns ERR_INTERNAL_SERVER when socket is disconnected', async () => {
      mockSocket.connected = false;
      const game = useGameActions();
      const movePayload: MovePayload = {
        from: 'e2',
        to: 'e4',
      };

      const res = await game.makeMove('GAME', movePayload);

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('ERR_INTERNAL_SERVER');
        expect(res.error.message).toContain('Socket not connected');
      }
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. Monotonic Sequence Check (MAJ-031)
  // ==========================================================================
  describe('Monotonic Move Sequence Guard (MAJ-031)', () => {
    it('discards stale out-of-order move packets without rewinding local state', () => {
      const session = useRoomSession();
      const game = useGameActions();
      const debugSpy = vi.spyOn(logger, 'debug');

      // Local state is already at moveCount: 5
      const currentGameState = createTestGameState({
        moveCount: 5,
        fen: 'fen_at_move_5',
      });
      const room = createTestRoom({ game: currentGameState });
      session.currentRoom.value = room;

      // Stale move packet arrives with moveNumber: 3
      const staleMovePacket = {
        move: {
          from: 'e2',
          to: 'e4',
          piece: 'p',
          san: 'e4',
          color: 'w' as const,
          moveNumber: 3,
          fen: 'stale_fen_move_3',
        } as MoveResult,
        gameState: createTestGameState({
          moveCount: 3,
          fen: 'stale_fen_move_3',
        }),
      };

      eventHandlers['game:moved'](staleMovePacket);

      // Local game state must NOT be rewound
      expect(session.currentRoom.value?.game.moveCount).toBe(5);
      expect(session.currentRoom.value?.game.fen).toBe('fen_at_move_5');
      expect(game.lastMoveEvent.value).toBeNull();

      // Debug log was emitted
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stale out-of-order move packet ignored'),
        expect.objectContaining({
          operation: 'socket_game_moved_guard',
          packetMoveNumber: 3,
          localMoveCount: 5,
        })
      );
    });

    it('accepts and applies move packets with monotonic moveNumber >= localMoveCount', () => {
      const session = useRoomSession();
      const game = useGameActions();

      const currentGameState = createTestGameState({
        moveCount: 4,
        fen: 'fen_at_move_4',
      });
      const room = createTestRoom({ game: currentGameState });
      session.currentRoom.value = room;

      const nextMovePacket = {
        move: {
          from: 'e7',
          to: 'e5',
          piece: 'p',
          san: 'e5',
          color: 'b' as const,
          moveNumber: 5,
          fen: 'fen_at_move_5',
        } as MoveResult,
        gameState: createTestGameState({
          moveCount: 5,
          fen: 'fen_at_move_5',
          turn: 'w',
        }),
      };

      eventHandlers['game:moved'](nextMovePacket);

      expect(session.currentRoom.value?.game.moveCount).toBe(5);
      expect(session.currentRoom.value?.game.fen).toBe('fen_at_move_5');
      expect(game.lastMoveEvent.value).toEqual(nextMovePacket);
    });
  });

  // ==========================================================================
  // 3. Resignation
  // ==========================================================================
  describe('Resignation', () => {
    it('resigns active game and emits game:resign with callback', () => {
      const game = useGameActions();

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'game:resign') {
          expect(payload.roomCode).toBe('GAME');
          ack({ success: true });
        }
      });

      const cb = vi.fn();
      game.resign('GAME', cb);

      expect(cb).toHaveBeenCalledWith({ success: true });
    });

    it('dispatches game:resign without callback if callback is not provided', () => {
      const game = useGameActions();

      game.resign('GAME');

      expect(mockSocket.emit).toHaveBeenCalledWith('game:resign', { roomCode: 'GAME' });
    });

    it('rejects resign with invalid room code without emitting', () => {
      const game = useGameActions();
      const cb = vi.fn();

      game.resign('BAD_CODE_TOO_LONG', cb);

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 4. Draw Negotiation
  // ==========================================================================
  describe('Draw Negotiation', () => {
    it('offers draw and emits game:offer_draw with callback', () => {
      const game = useGameActions();

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'game:offer_draw') {
          expect(payload.roomCode).toBe('GAME');
          ack({ success: true });
        }
      });

      const cb = vi.fn();
      game.offerDraw('GAME', cb);

      expect(cb).toHaveBeenCalledWith({ success: true });
    });

    it('responds to draw offer and resets drawOfferedBy state', () => {
      const game = useGameActions();
      game.drawOfferedBy.value = { fromPlayerId: UUID_P2, fromPlayerName: 'Bob' };

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'game:respond_draw') {
          expect(payload.roomCode).toBe('GAME');
          expect(payload.accept).toBe(true);
          ack({ success: true });
        }
      });

      const cb = vi.fn();
      game.respondDraw('GAME', true, cb);

      expect(cb).toHaveBeenCalledWith({ success: true });
      expect(game.drawOfferedBy.value).toBeNull();
    });

    it('accepts draw via acceptDraw convenience method', () => {
      const game = useGameActions();
      game.drawOfferedBy.value = { fromPlayerId: UUID_P2, fromPlayerName: 'Bob' };

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'game:respond_draw') {
          expect(payload.roomCode).toBe('GAME');
          expect(payload.accept).toBe(true);
          ack({ success: true });
        }
      });

      const cb = vi.fn();
      game.acceptDraw('GAME', cb);

      expect(cb).toHaveBeenCalledWith({ success: true });
      expect(game.drawOfferedBy.value).toBeNull();
    });

    it('declines draw via declineDraw convenience method', () => {
      const game = useGameActions();
      game.drawOfferedBy.value = { fromPlayerId: UUID_P2, fromPlayerName: 'Bob' };

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'game:respond_draw') {
          expect(payload.roomCode).toBe('GAME');
          expect(payload.accept).toBe(false);
          ack({ success: true });
        }
      });

      const cb = vi.fn();
      game.declineDraw('GAME', cb);

      expect(cb).toHaveBeenCalledWith({ success: true });
      expect(game.drawOfferedBy.value).toBeNull();
    });

    it('updates reactive drawOfferedBy when game:draw_offered event arrives', () => {
      const game = useGameActions();

      eventHandlers['game:draw_offered']({
        fromPlayerId: UUID_P2,
        fromPlayerName: 'Bob',
      });

      expect(game.drawOfferedBy.value).toEqual({
        fromPlayerId: UUID_P2,
        fromPlayerName: 'Bob',
      });
    });

    it('clears drawOfferedBy when game:draw_declined event arrives', () => {
      const game = useGameActions();
      game.drawOfferedBy.value = { fromPlayerId: UUID_P2, fromPlayerName: 'Bob' };

      eventHandlers['game:draw_declined']({ byPlayerId: UUID_P1 });

      expect(game.drawOfferedBy.value).toBeNull();
    });
  });

  // ==========================================================================
  // 5. Rematch Negotiation
  // ==========================================================================
  describe('Rematch Negotiation', () => {
    it('requests rematch and emits game:request_rematch', () => {
      const game = useGameActions();

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'game:request_rematch') {
          expect(payload.roomCode).toBe('GAME');
          ack({ success: true });
        }
      });

      const cb = vi.fn();
      game.requestRematch('GAME', cb);

      expect(cb).toHaveBeenCalledWith({ success: true });
    });

    it('responds to rematch request and resets rematchRequestedBy state', () => {
      const game = useGameActions();
      game.rematchRequestedBy.value = { requestedBy: UUID_P2, requesterName: 'Bob' };

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'game:respond_rematch') {
          expect(payload.roomCode).toBe('GAME');
          expect(payload.accept).toBe(false);
          ack({ success: true });
        }
      });

      const cb = vi.fn();
      game.respondRematch('GAME', false, cb);

      expect(cb).toHaveBeenCalledWith({ success: true });
      expect(game.rematchRequestedBy.value).toBeNull();
    });

    it('accepts rematch via acceptRematch convenience method', () => {
      const game = useGameActions();
      game.rematchRequestedBy.value = { requestedBy: UUID_P2, requesterName: 'Bob' };

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'game:respond_rematch') {
          expect(payload.roomCode).toBe('GAME');
          expect(payload.accept).toBe(true);
          ack({ success: true });
        }
      });

      const cb = vi.fn();
      game.acceptRematch('GAME', cb);

      expect(cb).toHaveBeenCalledWith({ success: true });
      expect(game.rematchRequestedBy.value).toBeNull();
    });

    it('declines rematch via declineRematch convenience method', () => {
      const game = useGameActions();
      game.rematchRequestedBy.value = { requestedBy: UUID_P2, requesterName: 'Bob' };

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'game:respond_rematch') {
          expect(payload.roomCode).toBe('GAME');
          expect(payload.accept).toBe(false);
          ack({ success: true });
        }
      });

      const cb = vi.fn();
      game.declineRematch('GAME', cb);

      expect(cb).toHaveBeenCalledWith({ success: true });
      expect(game.rematchRequestedBy.value).toBeNull();
    });

    it('updates reactive rematchRequestedBy when game:rematch_requested event arrives', () => {
      const game = useGameActions();

      eventHandlers['game:rematch_requested']({
        requestedBy: UUID_P2,
        requesterName: 'Bob',
      });

      expect(game.rematchRequestedBy.value).toEqual({
        requestedBy: UUID_P2,
        requesterName: 'Bob',
      });
    });

    it('clears rematchRequestedBy when game:rematch_declined event arrives', () => {
      const game = useGameActions();
      game.rematchRequestedBy.value = { requestedBy: UUID_P2, requesterName: 'Bob' };

      eventHandlers['game:rematch_declined']();

      expect(game.rematchRequestedBy.value).toBeNull();
    });

    it('resets in-game alerts and applies rematch room state when game:rematch_started arrives', () => {
      const session = useRoomSession();
      const game = useGameActions();

      game.rematchRequestedBy.value = { requestedBy: UUID_P2, requesterName: 'Bob' };
      game.drawOfferedBy.value = { fromPlayerId: UUID_P2, fromPlayerName: 'Bob' };
      game.lastGameOver.value = { winner: 'w', reason: 'checkmate' } as GameOverPayload;
      game.kingInCheck.value = { inCheck: 'b', kingSquare: 'e8' };

      const newRematchRoom = createTestRoom({ roomCode: 'GAME' });
      const newGameState = createTestGameState();

      eventHandlers['game:rematch_started']({
        room: newRematchRoom,
        gameState: newGameState,
      });

      expect(game.rematchRequestedBy.value).toBeNull();
      expect(game.drawOfferedBy.value).toBeNull();
      expect(game.lastGameOver.value).toBeNull();
      expect(game.kingInCheck.value).toBeNull();
      expect(session.currentRoom.value?.roomCode).toBe('GAME');
    });
  });

  // ==========================================================================
  // 6. Check and Game Over Events
  // ==========================================================================
  describe('Check and Game Over Events', () => {
    it('updates kingInCheck reactive state on game:check', () => {
      const game = useGameActions();

      eventHandlers['game:check']({ inCheck: 'w', kingSquare: 'e1' });

      expect(game.kingInCheck.value).toEqual({ inCheck: 'w', kingSquare: 'e1' });
    });

    it('updates lastGameOver and clears drawOfferedBy on game:over', () => {
      const game = useGameActions();
      game.drawOfferedBy.value = { fromPlayerId: UUID_P2, fromPlayerName: 'Bob' };

      const payload: GameOverPayload = {
        winner: 'b',
        reason: 'resignation',
        message: 'White resigned',
        totalMoves: 25,
        finalFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        durationSeconds: 120,
      };

      eventHandlers['game:over'](payload);

      expect(game.lastGameOver.value).toEqual(payload);
      expect(game.drawOfferedBy.value).toBeNull();
    });
  });

  // ==========================================================================
  // 7. Domain Event Subscribers (onOpponentMove)
  // ==========================================================================
  describe('Domain Event Subscribers (onOpponentMove)', () => {
    it('notifies subscriber when opponent makes a move', () => {
      const session = useRoomSession();
      session.currentPlayer.value = createTestPlayer({ id: UUID_P1, color: 'w' });

      const subscriber = vi.fn();
      const unsubscribe = onOpponentMove(subscriber);

      const opponentMoveData = {
        move: {
          from: 'e7',
          to: 'e5',
          san: 'e5',
          color: 'b' as const,
          moveNumber: 2,
        } as MoveResult,
        gameState: createTestGameState({ moveCount: 2 }),
      };

      eventHandlers['game:moved'](opponentMoveData);

      expect(subscriber).toHaveBeenCalledWith(opponentMoveData);

      // Unsubscribe prevents subsequent invocations
      unsubscribe();
      eventHandlers['game:moved']({
        ...opponentMoveData,
        move: { ...opponentMoveData.move, moveNumber: 3 },
      });

      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('does NOT notify subscriber when player makes their own move', () => {
      const session = useRoomSession();
      session.currentPlayer.value = createTestPlayer({ id: UUID_P1, color: 'w' });

      const subscriber = vi.fn();
      onOpponentMove(subscriber);

      const myOwnMoveData = {
        move: {
          from: 'e2',
          to: 'e4',
          san: 'e4',
          color: 'w' as const,
          moveNumber: 1,
        } as MoveResult,
        gameState: createTestGameState({ moveCount: 1 }),
      };

      eventHandlers['game:moved'](myOwnMoveData);

      expect(subscriber).not.toHaveBeenCalled();
    });

    it('safely handles exceptions thrown in subscriber callback without crashing move processing', () => {
      const session = useRoomSession();
      session.currentPlayer.value = createTestPlayer({ id: UUID_P1, color: 'w' });
      session.currentRoom.value = createTestRoom();

      const warnSpy = vi.spyOn(logger, 'warn');
      const faultySubscriber = vi.fn(() => {
        throw new Error('Audio play failed');
      });
      const healthySubscriber = vi.fn();

      onOpponentMove(faultySubscriber);
      onOpponentMove(healthySubscriber);

      const opponentMoveData = {
        move: {
          from: 'e7',
          to: 'e5',
          san: 'e5',
          color: 'b' as const,
          moveNumber: 2,
        } as MoveResult,
        gameState: createTestGameState({ moveCount: 2 }),
      };

      expect(() => {
        eventHandlers['game:moved'](opponentMoveData);
      }).not.toThrow();

      expect(healthySubscriber).toHaveBeenCalledWith(opponentMoveData);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('listener'),
        expect.objectContaining({
          operation: 'socket_opponent_move_listener',
          error: 'Audio play failed',
        })
      );
    });
  });

  // ==========================================================================
  // 7b. Room Departure & Action Execution Validation (MAJ-033)
  // ==========================================================================
  describe('Room Departure & Action Execution Validation (MAJ-033)', () => {
    it('leaves room and emits room:leave with callback', async () => {
      const game = useGameActions();

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'room:leave') {
          expect(payload.roomCode).toBe('GAME');
          ack({ success: true });
        }
      });

      const cb = vi.fn();
      const success = await game.leaveRoom('GAME', cb);

      expect(success).toBe(true);
      expect(cb).toHaveBeenCalledWith({ success: true });
    });

    it('rejects leaveRoom with invalid room code without emitting', async () => {
      const game = useGameActions();
      const cb = vi.fn();

      const success = await game.leaveRoom('INVALID_LONG_CODE', cb);

      expect(success).toBe(false);
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('returns error and does not emit when socket is disconnected for any action', () => {
      mockSocket.connected = false;
      const game = useGameActions();
      const cb = vi.fn();

      game.offerDraw('GAME', cb);

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'ERR_INTERNAL_SERVER',
            message: 'Socket not connected',
          }),
        })
      );
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 8. State Reset
  // ==========================================================================
  describe('State Reset (resetGameActionsState)', () => {
    it('resets all in-game reactive states and subscribers', () => {
      const game = useGameActions();
      const subscriber = vi.fn();
      onOpponentMove(subscriber);

      game.drawOfferedBy.value = { fromPlayerId: UUID_P2, fromPlayerName: 'Bob' };
      game.rematchRequestedBy.value = { requestedBy: UUID_P2, requesterName: 'Bob' };
      game.lastGameOver.value = { winner: 'w', reason: 'checkmate' } as GameOverPayload;
      game.kingInCheck.value = { inCheck: 'w', kingSquare: 'e1' };
      game.lastMoveEvent.value = { move: {} as MoveResult, gameState: {} as GameState };

      resetGameActionsState();

      expect(game.drawOfferedBy.value).toBeNull();
      expect(game.rematchRequestedBy.value).toBeNull();
      expect(game.lastGameOver.value).toBeNull();
      expect(game.kingInCheck.value).toBeNull();
      expect(game.lastMoveEvent.value).toBeNull();

      // Subscriber set cleared
      const session = useRoomSession();
      session.currentPlayer.value = createTestPlayer({ color: 'w' });
      eventHandlers['game:moved']({
        move: { color: 'b', moveNumber: 1 } as MoveResult,
        gameState: {} as GameState,
      });

      expect(subscriber).not.toHaveBeenCalled();
    });
  });
});
