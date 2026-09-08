import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useRoomSession,
  resetRoomSessionState,
  getSavedSession,
  saveSession,
  clearSession,
  SESSION_STORAGE_KEY,
} from '../composables/useRoomSession';
import {
  useSocketTransport,
  resetTransportState,
} from '../composables/useSocketTransport';
import { STORAGE_KEYS } from '@/platform/storage';
import type { Player, RoomState, SavedSession, GameState } from '@fun-chess/shared';

describe('useRoomSession composable', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, Function>;

  const UUID_P1 = '11111111-1111-4111-8111-111111111111';
  const UUID_P2 = '22222222-2222-4222-8222-222222222222';
  const UUID_SPEC = '33333333-3333-4333-8333-333333333333';

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
        if (eventHandlers['connect']) eventHandlers['connect']!();
      }),
      disconnect: vi.fn(function (this: any) {
        this.connected = false;
        if (eventHandlers['disconnect']) eventHandlers['disconnect']!();
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
      roomCode: 'STAR',
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
    sessionStorage.clear();
    resetTransportState();
    resetRoomSessionState();
    vi.clearAllMocks();

    mockSocket = createMockSocket();
    useSocketTransport(mockSocket as any);
  });

  afterEach(() => {
    sessionStorage.clear();
    resetTransportState();
    resetRoomSessionState();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Session Persistence & Storage Integration
  // ==========================================================================
  describe('Session Persistence & Storage Keys', () => {
    it('SESSION_STORAGE_KEY matches STORAGE_KEYS.SESSION_TOKEN', () => {
      expect(SESSION_STORAGE_KEY).toBe(STORAGE_KEYS.SESSION_TOKEN);
    });

    it('persists and retrieves saved session via saveSession and getSavedSession', () => {
      const sessionData: SavedSession = {
        roomCode: 'MOON',
        playerId: UUID_P1,
        sessionToken: 'token_moon_123',
      };

      saveSession(sessionData);

      const retrieved = getSavedSession();
      expect(retrieved).toEqual(sessionData);

      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      expect(JSON.parse(raw!)).toEqual(sessionData);
    });

    it('removes session from storage on clearSession()', () => {
      saveSession({
        roomCode: 'MOON',
        playerId: UUID_P1,
        sessionToken: 'token_moon_123',
      });
      expect(getSavedSession()).not.toBeNull();

      clearSession();

      expect(getSavedSession()).toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });

    it('returns null and does not throw when sessionStorage contains malformed JSON', () => {
      sessionStorage.setItem(SESSION_STORAGE_KEY, '{ invalid json');

      const result = getSavedSession();

      expect(result).toBeNull();
    });

    it('returns null when saved session object lacks required fields', () => {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ roomCode: 'MOON' })); // missing playerId & sessionToken

      const result = getSavedSession();

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // 2. Validation Before Transmission (MIN-030)
  // ==========================================================================
  describe('Validation Before Transmission (MIN-030)', () => {
    it('rejects createRoom with empty or whitespace-only player name without emitting', async () => {
      const session = useRoomSession();
      const transport = useSocketTransport();

      const result = await session.createRoom('');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ERR_INVALID_PAYLOAD');
        expect(result.error.message).toContain('Player name cannot be empty');
      }
      expect(transport.lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects createRoom with player name exceeding 20 characters', async () => {
      const session = useRoomSession();

      const result = await session.createRoom('ThisNameIsWayTooLongForAUser');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ERR_INVALID_PAYLOAD');
      }
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects joinRoom with invalid room code (not 4 characters or special characters)', async () => {
      const session = useRoomSession();

      const res1 = await session.joinRoom('ABC', 'Bob'); // 3 chars
      expect(res1.success).toBe(false);
      expect(mockSocket.emit).not.toHaveBeenCalled();

      const res2 = await session.joinRoom('TOOLONG', 'Bob'); // 7 chars
      expect(res2.success).toBe(false);
      expect(mockSocket.emit).not.toHaveBeenCalled();

      const res3 = await session.joinRoom('st@r', 'Bob'); // invalid characters
      expect(res3.success).toBe(false);
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects joinRoom with empty player name', async () => {
      const session = useRoomSession();

      const res = await session.joinRoom('STAR', '');

      expect(res.success).toBe(false);
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects leaveRoom with invalid room code and does not emit', async () => {
      const session = useRoomSession();
      const cb = vi.fn();

      const success = await session.leaveRoom('INVALID_LONG_CODE', cb);

      expect(success).toBe(false);
      expect(cb).toHaveBeenCalledWith({ success: false });
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects reconnect with invalid room code or non-UUID playerId', async () => {
      const session = useRoomSession();

      const res1 = await session.reconnect('BAD', UUID_P1, 'token123');
      expect(res1.success).toBe(false);
      expect(mockSocket.emit).not.toHaveBeenCalled();

      const res2 = await session.reconnect('STAR', 'not-a-uuid', 'token123');
      expect(res2.success).toBe(false);
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 3. Room Lifecycle (Create, Join, Leave, Reconnect)
  // ==========================================================================
  describe('Room Lifecycle (Create, Join, Leave, Reconnect)', () => {
    it('creates room, updates state, and persists session to sessionStorage', async () => {
      const session = useRoomSession();
      const mockCreatedRoom = createTestRoom({ status: 'lobby', blackPlayer: null });

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'room:create') {
          expect(payload.playerName).toBe('Alice');
          expect(payload.preferredColor).toBe('w');
          ack({
            success: true,
            room: mockCreatedRoom,
            sessionToken: 'token_created_123',
          });
        }
      });

      const result = await session.createRoom('Alice', 'w');

      expect(result.success).toBe(true);
      expect(session.currentRoom.value?.roomCode).toBe('STAR');
      expect(session.sessionToken.value).toBe('token_created_123');
      expect(session.currentPlayer.value?.id).toBe(UUID_P1);
      expect(session.isHost.value).toBe(true);

      const saved = getSavedSession();
      expect(saved).toEqual({
        roomCode: 'STAR',
        playerId: UUID_P1,
        sessionToken: 'token_created_123',
      });
    });

    it('joins room, updates state, and persists session to sessionStorage', async () => {
      mockSocket.id = 'mock_sock_p2';
      const session = useRoomSession();
      const mockJoinedRoom = createTestRoom({ status: 'playing' });
      const mockJoinedPlayer = mockJoinedRoom.blackPlayer!;

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'room:join') {
          expect(payload.roomCode).toBe('STAR');
          expect(payload.playerName).toBe('Bob');
          ack({
            success: true,
            room: mockJoinedRoom,
            player: mockJoinedPlayer,
            sessionToken: 'token_joined_456',
          });
        }
      });

      const result = await session.joinRoom('STAR', 'Bob');

      expect(result.success).toBe(true);
      expect(session.currentRoom.value?.roomCode).toBe('STAR');
      expect(session.currentPlayer.value?.name).toBe('Bob');
      expect(session.sessionToken.value).toBe('token_joined_456');
      expect(session.isHost.value).toBe(false);

      const saved = getSavedSession();
      expect(saved).toEqual({
        roomCode: 'STAR',
        playerId: UUID_P2,
        sessionToken: 'token_joined_456',
      });
    });

    it('leaves room, clears state and sessionStorage upon server acknowledgment', async () => {
      const session = useRoomSession();
      session.currentRoom.value = createTestRoom();
      session.currentPlayer.value = createTestPlayer();
      session.sessionToken.value = 'token_to_clear';
      saveSession({
        roomCode: 'STAR',
        playerId: UUID_P1,
        sessionToken: 'token_to_clear',
      });

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'room:leave') {
          expect(payload.roomCode).toBe('STAR');
          ack({ success: true });
        }
      });

      const cb = vi.fn();
      const success = await session.leaveRoom('STAR', cb);

      expect(success).toBe(true);
      expect(cb).toHaveBeenCalledWith({ success: true });
      expect(session.currentRoom.value).toBeNull();
      expect(session.currentPlayer.value).toBeNull();
      expect(session.sessionToken.value).toBeNull();
      expect(getSavedSession()).toBeNull();
    });

    it('clears state and storage immediately if leaveRoom is called while socket disconnected', async () => {
      mockSocket.connected = false;
      const session = useRoomSession();
      session.currentRoom.value = createTestRoom();
      session.currentPlayer.value = createTestPlayer();
      session.sessionToken.value = 'token_disconnected';
      saveSession({
        roomCode: 'STAR',
        playerId: UUID_P1,
        sessionToken: 'token_disconnected',
      });

      const cb = vi.fn();
      const success = await session.leaveRoom('STAR', cb);

      expect(success).toBe(true);
      expect(cb).toHaveBeenCalledWith({ success: true });
      expect(session.currentRoom.value).toBeNull();
      expect(session.currentPlayer.value).toBeNull();
      expect(session.sessionToken.value).toBeNull();
      expect(getSavedSession()).toBeNull();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('reconnects room, updates state, and persists updated credentials', async () => {
      const session = useRoomSession();
      const mockReconnectedRoom = createTestRoom({ status: 'playing' });
      const mockPlayer = mockReconnectedRoom.whitePlayer!;

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'room:reconnect') {
          expect(payload.roomCode).toBe('STAR');
          expect(payload.playerId).toBe(UUID_P1);
          expect(payload.sessionToken).toBe('tok_reconn');
          ack({
            success: true,
            room: mockReconnectedRoom,
            player: mockPlayer,
          });
        }
      });

      const result = await session.reconnect('STAR', UUID_P1, 'tok_reconn');

      expect(result.success).toBe(true);
      expect(session.currentRoom.value?.roomCode).toBe('STAR');
      expect(session.currentPlayer.value?.id).toBe(UUID_P1);
      expect(session.sessionToken.value).toBe('tok_reconn');

      const saved = getSavedSession();
      expect(saved?.sessionToken).toBe('tok_reconn');
    });

    it('clears storage credentials when server rejects reconnect with ERR_ROOM_NOT_FOUND', async () => {
      const session = useRoomSession();
      saveSession({
        roomCode: 'STAR',
        playerId: UUID_P1,
        sessionToken: 'dead_token',
      });

      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'room:reconnect') {
          ack({
            success: false,
            error: {
              code: 'ERR_ROOM_NOT_FOUND',
              message: 'Room STAR expired or does not exist',
            },
          });
        }
      });

      const result = await session.reconnect('STAR', UUID_P1, 'dead_token');

      expect(result.success).toBe(false);
      expect(getSavedSession()).toBeNull();
    });
  });

  // ==========================================================================
  // 4. Auto-Reconnection Logic
  // ==========================================================================
  describe('Auto-Reconnection Logic', () => {
    it('triggers reconnect when valid session exists in storage and room is not in sync', async () => {
      const session = useRoomSession();
      saveSession({
        roomCode: 'AUTO',
        playerId: UUID_P1,
        sessionToken: 'auto_token_123',
      });

      let reconnectEmitted = false;
      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'room:reconnect') {
          reconnectEmitted = true;
          ack({
            success: true,
            room: createTestRoom({ roomCode: 'AUTO' }),
            player: createTestPlayer({ id: UUID_P1 }),
          });
        }
      });

      session.checkAndAutoReconnect();

      expect(reconnectEmitted).toBe(true);
    });

    it('does not trigger reconnect when no saved session exists', () => {
      const session = useRoomSession();
      session.checkAndAutoReconnect();

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('does not trigger reconnect when room and player are already connected and active', () => {
      const session = useRoomSession();
      const room = createTestRoom({ roomCode: 'AUTO', status: 'playing' });
      session.currentRoom.value = room;
      session.currentPlayer.value = room.whitePlayer;

      saveSession({
        roomCode: 'AUTO',
        playerId: UUID_P1,
        sessionToken: 'auto_token_123',
      });

      session.checkAndAutoReconnect();

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 5. Player and Room State Transitions
  // ==========================================================================
  describe('Player and Room State Transitions', () => {
    it('accurately identifies host and spectator status', () => {
      const session = useRoomSession();
      const room = createTestRoom();
      session.currentRoom.value = room;

      // Host (Alice)
      session.currentPlayer.value = room.whitePlayer;
      expect(session.isHost.value).toBe(true);
      expect(session.isSpectator.value).toBe(false);

      // Opponent (Bob)
      session.currentPlayer.value = room.blackPlayer;
      expect(session.isHost.value).toBe(false);
      expect(session.isSpectator.value).toBe(false);

      // Spectator
      const spectator: Player = {
        id: UUID_SPEC,
        socketId: 'mock_spec_1',
        name: 'Charlie',
        avatar: '👀',
        color: 'w',
        isHost: false,
        isConnected: true,
        connectedAt: Date.now(),
      };
      room.spectators.push(spectator);
      session.currentPlayer.value = spectator;

      expect(session.isHost.value).toBe(false);
      expect(session.isSpectator.value).toBe(true);
    });

    it('transitions room status to paused_disconnect when active player drops during playing', () => {
      const session = useRoomSession();
      const room = createTestRoom({ status: 'playing' });
      session.currentRoom.value = room;
      session.currentPlayer.value = room.whitePlayer;

      // Opponent (Bob) disconnects
      eventHandlers['room:player_disconnected']!({
        playerId: UUID_P2,
        gracePeriodMs: 30000,
        roomStatus: 'paused_disconnect',
      });

      expect(session.currentRoom.value?.status).toBe('paused_disconnect');
      expect(session.currentRoom.value?.blackPlayer?.isConnected).toBe(false);
    });

    it('does NOT transition room status to paused_disconnect when spectator drops', () => {
      const session = useRoomSession();
      const room = createTestRoom({ status: 'playing' });
      const spectator: Player = {
        id: UUID_SPEC,
        socketId: 'mock_spec_1',
        name: 'Charlie',
        avatar: '👀',
        color: 'w',
        isHost: false,
        isConnected: true,
        connectedAt: Date.now(),
      };
      room.spectators.push(spectator);
      session.currentRoom.value = room;
      session.currentPlayer.value = room.whitePlayer;

      // Spectator drops
      eventHandlers['room:player_disconnected']!({
        playerId: UUID_SPEC,
        gracePeriodMs: 30000,
      });

      expect(session.currentRoom.value?.status).toBe('playing');
      expect(session.currentRoom.value?.spectators[0]?.isConnected).toBe(false);
    });

    it('restores room status to playing when disconnected player reconnects', () => {
      const session = useRoomSession();
      const room = createTestRoom({ status: 'paused_disconnect' });
      room.blackPlayer!.isConnected = false;
      session.currentRoom.value = room;

      eventHandlers['room:player_reconnected']!({
        playerId: UUID_P2,
        playerName: 'Bob',
        roomStatus: 'playing',
      });

      expect(session.currentRoom.value?.status).toBe('playing');
      expect(session.currentRoom.value?.blackPlayer?.isConnected).toBe(true);
    });

    it('removes departing player from room state when room:player_left event arrives', () => {
      const session = useRoomSession();
      const room = createTestRoom();
      session.currentRoom.value = room;

      eventHandlers['room:player_left']!({
        playerId: UUID_P2,
        playerName: 'Bob',
        reason: 'left',
      });

      expect(session.currentRoom.value?.blackPlayer).toBeNull();
    });

    it('completely resets room session state on resetRoomSessionState()', () => {
      const session = useRoomSession();
      session.currentRoom.value = createTestRoom();
      session.currentPlayer.value = createTestPlayer();
      session.sessionToken.value = 'tok_active';
      saveSession({
        roomCode: 'STAR',
        playerId: UUID_P1,
        sessionToken: 'tok_active',
      });

      resetRoomSessionState();

      expect(session.currentRoom.value).toBeNull();
      expect(session.currentPlayer.value).toBeNull();
      expect(session.sessionToken.value).toBeNull();
      expect(getSavedSession()).toBeNull();
    });
  });
});
