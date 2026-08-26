import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSocket } from '../useSocket';
import type { GameState, MoveResult, Player, RoomState } from '@fun-chess/shared';

describe('useSocket composable', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, Function>;

  beforeEach(() => {
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

  it('should initialize and attach listeners to socket', () => {
    const { isConnected, socketId } = useSocket(mockSocket);

    expect(isConnected.value).toBe(true);
    expect(socketId.value).toBe('test_socket_123');
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('game:moved', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('game:over', expect.any(Function));
  });

  it('should create a room and update reactive state on successful ack', async () => {
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
        sessionToken: 'token_1',
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
  });

  it('should join a room and update reactive state', async () => {
    const { joinRoom, currentRoom, currentPlayer, sessionToken } = useSocket(mockSocket);

    const mockJoinedPlayer: Player = {
      id: 'p2',
      socketId: 'test_socket_123',
      name: 'Maya',
      color: 'b',
      isHost: false,
      isConnected: true,
      sessionToken: 'token_2',
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
  });

  it('should handle game:moved and game:over events', () => {
    const { currentRoom, lastGameOver, kingInCheck } = useSocket(mockSocket);

    currentRoom.value = {
      roomCode: 'STAR',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: null,
      blackPlayer: null,
      spectators: [],
      game: { fen: 'start' } as GameState,
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    // Simulate game:moved
    eventHandlers['game:moved']({
      move: { san: 'e4' } as MoveResult,
      gameState: { fen: 'after_e4' } as GameState,
    });
    expect(currentRoom.value.game.fen).toBe('after_e4');

    // Simulate game:check
    eventHandlers['game:check']({ inCheck: 'b', kingSquare: 'e8' });
    expect(kingInCheck.value).toEqual({ inCheck: 'b', kingSquare: 'e8' });

    // Simulate game:over
    eventHandlers['game:over']({
      winner: 'w',
      reason: 'checkmate',
      message: 'Checkmate! White wins!',
    });
    expect(lastGameOver.value?.winner).toBe('w');
    expect(currentRoom.value.status).toBe('game_over');
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
      leaveRoom,
      currentRoom,
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

    eventHandlers['game:rematch_requested']({ requestedBy: 'p1', requesterName: 'Leo' });
    expect(rematchRequestedBy.value?.requesterName).toBe('Leo');

    leaveRoom('STAR');
    expect(mockSocket.emit).toHaveBeenCalledWith('room:leave', { roomCode: 'STAR' });
    expect(currentRoom.value).toBeNull();
  });
});
