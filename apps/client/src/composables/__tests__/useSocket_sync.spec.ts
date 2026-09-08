import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSocket, resetSocketState } from '../useSocket';
import type { GameState, MoveResult, RoomState } from '@fun-chess/shared';

describe('useSocket reactive ref synchronization across multiple instances (MAJ-013)', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, Function>;

  beforeEach(() => {
    resetSocketState();
    sessionStorage.clear();
    vi.clearAllMocks();
    eventHandlers = {};
    mockSocket = {
      id: 'shared_socket_456',
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
    resetSocketState();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('shares identical reactive ref references between multiple useSocket calls', () => {
    const instanceA = useSocket(mockSocket);
    const instanceB = useSocket();

    // Verify referential equality of all reactive refs
    expect(instanceA.currentRoom).toBe(instanceB.currentRoom);
    expect(instanceA.currentPlayer).toBe(instanceB.currentPlayer);
    expect(instanceA.isConnected).toBe(instanceB.isConnected);
    expect(instanceA.socketId).toBe(instanceB.socketId);
    expect(instanceA.sessionToken).toBe(instanceB.sessionToken);
    expect(instanceA.lastError).toBe(instanceB.lastError);
    expect(instanceA.drawOfferedBy).toBe(instanceB.drawOfferedBy);
    expect(instanceA.rematchRequestedBy).toBe(instanceB.rematchRequestedBy);
    expect(instanceA.lastGameOver).toBe(instanceB.lastGameOver);
    expect(instanceA.kingInCheck).toBe(instanceB.kingInCheck);
  });

  it('synchronizes room:joined event across all instances', () => {
    const instanceA = useSocket(mockSocket);
    const instanceB = useSocket();

    const mockRoom: RoomState = {
      roomCode: 'SYNC',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: {
        id: 'p1',
        socketId: 'shared_socket_456',
        name: 'Player1',
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

    // Simulate incoming socket event
    eventHandlers['room:joined'](mockRoom);

    expect(instanceA.currentRoom.value?.roomCode).toBe('SYNC');
    expect(instanceB.currentRoom.value?.roomCode).toBe('SYNC');
    expect(instanceA.currentRoom.value).toBe(instanceB.currentRoom.value);
  });

  it('updates both instances when instanceA initiates createRoom', async () => {
    const instanceA = useSocket(mockSocket);
    const instanceB = useSocket();

    const mockCreatedRoom: RoomState = {
      roomCode: 'HOST',
      status: 'lobby',
      hostId: 'p_host',
      whitePlayer: {
        id: 'p_host',
        socketId: 'shared_socket_456',
        name: 'HostPlayer',
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
        callback({ success: true, room: mockCreatedRoom, sessionToken: 'secret_token_123' });
      }
    });

    const result = await instanceA.createRoom('HostPlayer', 'w', '🦁');
    expect(result.success).toBe(true);

    // Verify instanceB received the exact same synchronized state
    expect(instanceB.currentRoom.value?.roomCode).toBe('HOST');
    expect(instanceB.currentPlayer.value?.name).toBe('HostPlayer');
    expect(instanceB.sessionToken.value).toBe('secret_token_123');
  });

  it('resets state across all instances when instanceB calls leaveRoom', async () => {
    const instanceA = useSocket(mockSocket);
    const instanceB = useSocket();

    instanceA.currentRoom.value = {
      roomCode: 'QUIT',
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
    instanceA.sessionToken.value = 'token_to_clear';

    expect(instanceB.currentRoom.value?.roomCode).toBe('QUIT');

    mockSocket.emit.mockImplementation((event: string, _payload: any, ack?: Function) => {
      if (event === 'room:leave' && typeof ack === 'function') {
        ack({ success: true });
      }
    });

    await instanceB.leaveRoom('QUIT');

    expect(instanceA.currentRoom.value).toBeNull();
    expect(instanceB.currentRoom.value).toBeNull();
    expect(instanceA.sessionToken.value).toBeNull();
    expect(instanceB.sessionToken.value).toBeNull();
  });

  it('synchronizes game moves and check status across all instances', () => {
    const instanceA = useSocket(mockSocket);
    const instanceB = useSocket();

    instanceA.currentRoom.value = {
      roomCode: 'CHCK',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: null,
      blackPlayer: null,
      spectators: [],
      game: { fen: 'initial_fen' } as GameState,
      rematch: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    // Simulate move
    const newGameState = { fen: 'after_move_fen' } as GameState;
    eventHandlers['game:moved']({
      move: { color: 'w', san: 'e4', from: 'e2', to: 'e4' } as MoveResult,
      gameState: newGameState,
    });

    expect(instanceA.currentRoom.value?.game.fen).toBe('after_move_fen');
    expect(instanceB.currentRoom.value?.game.fen).toBe('after_move_fen');

    // Simulate check
    eventHandlers['game:check']({ inCheck: 'b', kingSquare: 'e8' });

    expect(instanceA.kingInCheck.value).toEqual({ inCheck: 'b', kingSquare: 'e8' });
    expect(instanceB.kingInCheck.value).toEqual({ inCheck: 'b', kingSquare: 'e8' });
  });

  it('synchronizes disconnect and reconnect across multiple instances', () => {
    const instanceA = useSocket(mockSocket);
    const instanceB = useSocket();

    expect(instanceA.isConnected.value).toBe(true);
    expect(instanceB.isConnected.value).toBe(true);

    // Disconnect
    eventHandlers['disconnect']();

    expect(instanceA.isConnected.value).toBe(false);
    expect(instanceB.isConnected.value).toBe(false);

    // Reconnect
    eventHandlers['connect']();

    expect(instanceA.isConnected.value).toBe(true);
    expect(instanceB.isConnected.value).toBe(true);
  });
});
