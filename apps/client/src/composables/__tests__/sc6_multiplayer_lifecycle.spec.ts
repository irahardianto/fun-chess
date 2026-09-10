import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSocket, resetSocketState, onOpponentMove, SESSION_STORAGE_KEY } from '../useSocket';
import { audioSynthesizer } from '../../platform/audio/audio_synthesizer';
import type { MoveResult, Player, RoomState, GameOverPayload, PieceColor } from '@fun-chess/shared';

describe('Scope Card SC-6: Client Multiplayer Connection, Lifecycle & Contract Verification', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, any>;

  function createTestPlayer(overrides: Partial<Player> = {}): Player {
    return {
      id: '11111111-1111-4111-a111-111111111111',
      socketId: 'sock_player_1',
      name: 'Alice',
      avatar: '🦁',
      color: 'w',
      isHost: true,
      isConnected: true,
      connectedAt: 1700000000000,
      createdAt: 1000,
      updatedAt: 1000,
      ...overrides,
    };
  }

  function createTestRoom(overrides: Partial<RoomState> = {}): RoomState {
    const whitePlayer = createTestPlayer({ id: '11111111-1111-4111-a111-111111111111', color: 'w', isHost: true });
    const blackPlayer = createTestPlayer({ id: '22222222-2222-4222-a222-222222222222', name: 'Bob', color: 'b', isHost: false, socketId: 'sock_player_2' });
    return {
      roomCode: 'WXYZ',
      status: 'playing',
      hostId: whitePlayer.id,
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
      },
      rematch: null,
      createdAt: 1700000000000,
      lastActivityAt: 1700000000000,
      ...overrides,
    };
  }

  beforeEach(() => {
    resetSocketState();
    sessionStorage.clear();
    vi.clearAllMocks();
    eventHandlers = {};

    mockSocket = {
      id: 'sock_player_1',
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
    };
  });

  afterEach(() => {
    resetSocketState();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. [CRIT-005] Session Retention on Game Over
  // ==========================================================================
  describe('1. [CRIT-005] Session Retention on Game Over', () => {
    it('does NOT remove sessionStorage credentials upon receiving game:over event', () => {
      const { currentRoom, currentPlayer, sessionToken, lastGameOver } = useSocket(mockSocket);

      const room = createTestRoom({ status: 'playing' });
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;
      sessionToken.value = 'secret_session_token_123';

      const sessionData = {
        roomCode: 'WXYZ',
        playerId: room.whitePlayer!.id,
        sessionToken: 'secret_session_token_123',
      };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));

      const gameOverPayload: GameOverPayload = {
        winner: 'w',
        reason: 'checkmate',
        message: 'Checkmate',
        finalFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        totalMoves: 10,
        durationSeconds: 60,
      };

      // Trigger game:over event
      eventHandlers['game:over'](gameOverPayload);

      // Verify room status and game over payload
      expect(currentRoom.value?.status).toBe('game_over');
      expect(lastGameOver.value).toEqual(gameOverPayload);

      // CRITICAL ASSERTION: sessionStorage MUST NOT be cleared
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual(sessionData);
    });

    it('keeps credentials intact across disconnect and reconnect cycles during game_over', async () => {
      const { currentRoom, currentPlayer, sessionToken } = useSocket(mockSocket);

      const room = createTestRoom({ status: 'playing' });
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;
      sessionToken.value = 'secret_session_token_123';

      const sessionData = {
        roomCode: 'WXYZ',
        playerId: room.whitePlayer!.id,
        sessionToken: 'secret_session_token_123',
      };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));

      // 1. Match concludes -> game_over
      eventHandlers['game:over']({ winner: 'b', reason: 'resignation' });
      expect(currentRoom.value?.status).toBe('game_over');
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();

      // 2. Player temporarily disconnects (e.g. WiFi hiccup or reload)
      eventHandlers['disconnect']();

      // Credentials MUST still exist in sessionStorage
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();

      // 3. Socket reconnects with a new socket id (standard WebSocket reconnection)
      mockSocket.id = 'sock_player_1_reconnected';
      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'room:reconnect') {
          ack({
            success: true,
            room: { ...room, status: 'game_over' },
            player: { ...room.whitePlayer!, socketId: 'sock_player_1_reconnected' },
          });
        }
      });

      eventHandlers['connect']();

      // Wait for auto-reconnect to execute using stored credentials
      await vi.waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith(
          'room:reconnect',
          expect.objectContaining({
            roomCode: 'WXYZ',
            playerId: room.whitePlayer!.id,
            sessionToken: 'secret_session_token_123',
          }),
          expect.any(Function)
        );
      });

      // Session still preserved
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
      expect(sessionToken.value).toBe('secret_session_token_123');
    });

    it('clears session credentials on explicit leaveRoom departure', async () => {
      const { currentRoom, currentPlayer, sessionToken, leaveRoom } = useSocket(mockSocket);

      const room = createTestRoom({ status: 'game_over' });
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;
      sessionToken.value = 'token_to_clear';

      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          roomCode: 'WXYZ',
          playerId: room.whitePlayer!.id,
          sessionToken: 'token_to_clear',
        })
      );

      // Server acknowledges room departure
      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'room:leave' && ack) {
          ack({ success: true });
        }
      });

      await leaveRoom('WXYZ');

      // Credentials and state MUST be wiped
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
      expect(currentRoom.value).toBeNull();
      expect(currentPlayer.value).toBeNull();
      expect(sessionToken.value).toBeNull();
    });

    it('clears session credentials on reconnect error ERR_ROOM_NOT_FOUND', async () => {
      const { reconnect } = useSocket(mockSocket);

      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          roomCode: 'WXYZ',
          playerId: '11111111-1111-4111-a111-111111111111',
          sessionToken: 'orphan_token',
        })
      );

      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'room:reconnect') {
          ack({
            success: false,
            error: { code: 'ERR_ROOM_NOT_FOUND', message: 'Room has expired' },
          });
        }
      });

      const res = await reconnect('WXYZ', '11111111-1111-4111-a111-111111111111', 'orphan_token');

      expect(res.success).toBe(false);
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });

    it('clears session credentials on reconnect error ERR_UNAUTHORIZED', async () => {
      const { reconnect } = useSocket(mockSocket);

      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          roomCode: 'WXYZ',
          playerId: '11111111-1111-4111-a111-111111111111',
          sessionToken: 'stale_token',
        })
      );

      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'room:reconnect') {
          ack({
            success: false,
            error: { code: 'ERR_UNAUTHORIZED', message: 'Invalid session token' },
          });
        }
      });

      const res = await reconnect('WXYZ', '11111111-1111-4111-a111-111111111111', 'stale_token');

      expect(res.success).toBe(false);
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });
  });

  // ==========================================================================
  // 2. [MAJ-001] Room Status Desynchronization Guard
  // ==========================================================================
  describe('2. [MAJ-001] Room Status Desynchronization Guard', () => {
    it('transitions room status to paused_disconnect when previous status was playing', () => {
      const { currentRoom } = useSocket(mockSocket);

      const room = createTestRoom({ status: 'playing' });
      currentRoom.value = room;

      eventHandlers['room:player_disconnected']({
        playerId: room.blackPlayer!.id,
        gracePeriodMs: 30000,
      });

      expect(currentRoom.value?.status).toBe('paused_disconnect');
      expect(currentRoom.value?.blackPlayer?.isConnected).toBe(false);
    });

    it('preserves lobby status when player disconnects during lobby state', () => {
      const { currentRoom } = useSocket(mockSocket);

      const room = createTestRoom({ status: 'lobby' });
      currentRoom.value = room;

      eventHandlers['room:player_disconnected']({
        playerId: room.blackPlayer!.id,
        gracePeriodMs: 30000,
      });

      // Status MUST remain 'lobby', NOT 'paused_disconnect'
      expect(currentRoom.value?.status).toBe('lobby');
      expect(currentRoom.value?.blackPlayer?.isConnected).toBe(false);
    });

    it('preserves game_over status when player disconnects during game_over state', () => {
      const { currentRoom } = useSocket(mockSocket);

      const room = createTestRoom({ status: 'game_over' });
      currentRoom.value = room;

      eventHandlers['room:player_disconnected']({
        playerId: room.blackPlayer!.id,
        gracePeriodMs: 30000,
      });

      // Status MUST remain 'game_over', NOT 'paused_disconnect'
      expect(currentRoom.value?.status).toBe('game_over');
      expect(currentRoom.value?.blackPlayer?.isConnected).toBe(false);
    });

    it('only transitions back to playing on reconnect if previous status was paused_disconnect', () => {
      const { currentRoom } = useSocket(mockSocket);

      // Case A: Reconnecting from paused_disconnect
      const room = createTestRoom({ status: 'paused_disconnect' });
      room.blackPlayer!.isConnected = false;
      currentRoom.value = room;

      eventHandlers['room:player_reconnected']({
        playerId: room.blackPlayer!.id,
        playerName: 'Bob',
      });

      expect(currentRoom.value?.status).toBe('playing');
      expect(currentRoom.value?.blackPlayer?.isConnected).toBe(true);

      // Case B: Reconnecting during lobby must NOT jump to playing
      const lobbyRoom = createTestRoom({ status: 'lobby' });
      lobbyRoom.blackPlayer!.isConnected = false;
      currentRoom.value = lobbyRoom;

      eventHandlers['room:player_reconnected']({
        playerId: lobbyRoom.blackPlayer!.id,
        playerName: 'Bob',
      });

      expect(currentRoom.value?.status).toBe('lobby');
      expect(currentRoom.value?.blackPlayer?.isConnected).toBe(true);
    });
  });

  // ==========================================================================
  // 3. [MAJ-009] Audio Decoupling
  // ==========================================================================
  describe('3. [MAJ-009] Audio Decoupling', () => {
    it('does NOT invoke audioSynthesizer on game:moved events', () => {
      const { currentRoom, currentPlayer } = useSocket(mockSocket);

      const room = createTestRoom({ status: 'playing' });
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;

      const playMoveSpy = vi.spyOn(audioSynthesizer, 'playMove');
      const playCaptureSpy = vi.spyOn(audioSynthesizer, 'playCapture');

      // Opponent moves without capture
      const nonCaptureMove: MoveResult = {
        san: 'e5',
        from: 'e7',
        to: 'e5',
        color: 'b',
        piece: 'p',
        captured: undefined,
        flags: 'n',
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
        moveNumber: 1,
        timestamp: 1700000001000,
      };
      eventHandlers['game:moved']({
        move: nonCaptureMove,
        gameState: { ...room.game, fen: 'after_move_fen' },
      });

      // Opponent moves with capture
      const captureMove: MoveResult = {
        san: 'exd4',
        from: 'e5',
        to: 'd4',
        color: 'b',
        piece: 'p',
        captured: 'p',
        flags: 'c',
        fen: 'rnbqkbnr/pppp1ppp/8/8/3P4/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3',
        moveNumber: 2,
        timestamp: 1700000002000,
      };
      eventHandlers['game:moved']({
        move: captureMove,
        gameState: { ...room.game, fen: 'after_capture_fen' },
      });

      // AUDIO DECOUPLING INVARIANT: useSocket MUST NOT directly call audioSynthesizer
      expect(playMoveSpy).not.toHaveBeenCalled();
      expect(playCaptureSpy).not.toHaveBeenCalled();
    });

    it('updates reactive lastMoveEvent and dispatches to onOpponentMove listeners', () => {
      const { currentRoom, currentPlayer, lastMoveEvent } = useSocket(mockSocket);

      const room = createTestRoom({ status: 'playing' });
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;

      const receivedMoves: any[] = [];
      const unsubscribe = onOpponentMove((data) => {
        receivedMoves.push(data);
      });

      const movePayload = {
        move: {
          san: 'Nf6',
          from: 'g8',
          to: 'f6',
          color: 'b' as PieceColor,
          piece: 'n',
        } as MoveResult,
        gameState: { ...room.game, fen: 'fen_after_nf6' },
      };

      eventHandlers['game:moved'](movePayload);

      // 1. Reactive state is updated
      expect(lastMoveEvent.value).toEqual(movePayload);

      // 2. Registered listener received opponent move
      expect(receivedMoves).toHaveLength(1);
      expect(receivedMoves[0]).toEqual(movePayload);

      // 3. Moves by the current player do not trigger onOpponentMove listener
      const selfMovePayload = {
        move: {
          san: 'd4',
          from: 'd2',
          to: 'd4',
          color: 'w' as PieceColor,
          piece: 'p',
        } as MoveResult,
        gameState: { ...room.game, fen: 'fen_after_d4' },
      };
      eventHandlers['game:moved'](selfMovePayload);
      expect(receivedMoves).toHaveLength(1); // Not increased

      // 4. Unsubscribe works properly
      unsubscribe();
      eventHandlers['game:moved'](movePayload);
      expect(receivedMoves).toHaveLength(1); // Not called after unsubscribe
    });
  });

  // ==========================================================================
  // 4. [MAJ-021] Player Left Slot Clearing
  // ==========================================================================
  describe('4. [MAJ-021] Player Left Slot Clearing', () => {
    it('sets whitePlayer or blackPlayer in currentRoom to null when opponent leaves', () => {
      const { currentRoom, currentPlayer } = useSocket(mockSocket);

      const room = createTestRoom({ status: 'lobby' });
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;

      const opponentBobId = room.blackPlayer!.id;

      // Bob leaves the room
      eventHandlers['room:player_left']({
        playerId: opponentBobId,
        playerName: 'Bob',
      });

      // blackPlayer slot is cleared
      expect(currentRoom.value?.blackPlayer).toBeNull();
      // whitePlayer remains untouched
      expect(currentRoom.value?.whitePlayer?.id).toBe(room.whitePlayer!.id);
      // currentPlayer remains unchanged
      expect(currentPlayer.value?.id).toBe(room.whitePlayer!.id);
    });

    it('removes departing spectator from spectators list', () => {
      const { currentRoom } = useSocket(mockSocket);

      const room = createTestRoom();
      const spectator1 = createTestPlayer({ id: '33333333-3333-4333-a333-333333333333', name: 'Spec1' });
      const spectator2 = createTestPlayer({ id: '44444444-4444-4444-a444-444444444444', name: 'Spec2' });
      room.spectators = [spectator1, spectator2];
      currentRoom.value = room;

      eventHandlers['room:player_left']({
        playerId: spectator1.id,
      });

      expect(currentRoom.value?.spectators).toHaveLength(1);
      expect(currentRoom.value?.spectators[0]?.id).toBe(spectator2.id);
    });

    it('sets currentPlayer to null if room:player_left is for current player', () => {
      const { currentRoom, currentPlayer } = useSocket(mockSocket);

      const room = createTestRoom();
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;

      eventHandlers['room:player_left']({
        playerId: room.whitePlayer!.id,
      });

      expect(currentPlayer.value).toBeNull();
      expect(currentRoom.value?.whitePlayer).toBeNull();
    });
  });

  // ==========================================================================
  // 5. [MAJ-025] Acknowledged leaveRoom with Timeout
  // ==========================================================================
  describe('5. [MAJ-025] Acknowledged leaveRoom with Timeout', () => {
    it('sends room:leave with acknowledgment callback and cleans up upon server ack', async () => {
      const { currentRoom, currentPlayer, sessionToken, leaveRoom } = useSocket(mockSocket);

      const room = createTestRoom();
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;
      sessionToken.value = 'token_ack_test';

      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          roomCode: 'WXYZ',
          playerId: room.whitePlayer!.id,
          sessionToken: 'token_ack_test',
        })
      );

      let serverAckCallback: Function | null = null;
      mockSocket.emit.mockImplementation((event: string, _payload: any, ack: Function) => {
        if (event === 'room:leave') {
          serverAckCallback = ack;
        }
      });

      const leavePromise = leaveRoom('WXYZ');

      // Verify socket emit was called with payload AND acknowledgment callback
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'room:leave',
        { roomCode: 'WXYZ' },
        expect.any(Function)
      );

      // Before server acks, state and sessionStorage remain intact
      expect(currentRoom.value).not.toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();

      // Server acknowledges departure
      expect(serverAckCallback).not.toBeNull();
      serverAckCallback!({ success: true });

      await leavePromise;

      // After server ack, session credentials and room state are cleared
      expect(currentRoom.value).toBeNull();
      expect(currentPlayer.value).toBeNull();
      expect(sessionToken.value).toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });

    it('clears session and state after 2000ms timeout if server drops room:leave acknowledgment', async () => {
      vi.useFakeTimers();
      try {
        const { currentRoom, currentPlayer, sessionToken, leaveRoom } = useSocket(mockSocket);

        const room = createTestRoom();
        currentRoom.value = room;
        currentPlayer.value = room.whitePlayer;
        sessionToken.value = 'token_timeout_test';

        sessionStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({
            roomCode: 'WXYZ',
            playerId: room.whitePlayer!.id,
            sessionToken: 'token_timeout_test',
          })
        );

        // Server never invokes ack (dropped packet)
        mockSocket.emit.mockImplementation(() => {});

        const leavePromise = leaveRoom('WXYZ');

        // At 1900ms, timeout has not fired yet
        await vi.advanceTimersByTimeAsync(1900);
        expect(currentRoom.value).not.toBeNull();
        expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();

        // At 2000ms, timeout fires and enforces client teardown
        await vi.advanceTimersByTimeAsync(150);
        await leavePromise;

        expect(currentRoom.value).toBeNull();
        expect(currentPlayer.value).toBeNull();
        expect(sessionToken.value).toBeNull();
        expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ==========================================================================
  // 6. [MIN-030] Client Zod Schema Ingress Validation
  // ==========================================================================
  describe('6. [MIN-030] Client Zod Schema Ingress Validation', () => {
    it('rejects createRoom with invalid payload immediately without emitting to socket', async () => {
      const { createRoom, lastError } = useSocket(mockSocket);

      // Empty player name
      const res1 = await createRoom('');
      expect(res1.success).toBe(false);
      if (!res1.success) {
        expect(res1.error.code).toBe('ERR_INVALID_PAYLOAD');
      }
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();

      // Overlong player name (> 20 characters)
      const res2 = await createRoom('ThisNameIsFarTooLongForValidation');
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.error.code).toBe('ERR_INVALID_PAYLOAD');
      }
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects joinRoom with invalid roomCode or name without emitting to socket', async () => {
      const { joinRoom, lastError } = useSocket(mockSocket);

      // Room code with wrong length (< 4 chars)
      const res1 = await joinRoom('ABC', 'Alice');
      expect(res1.success).toBe(false);
      if (!res1.success) {
        expect(res1.error.code).toBe('ERR_INVALID_PAYLOAD');
      }
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();

      // Room code with invalid symbols
      const res2 = await joinRoom('AB!@', 'Alice');
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.error.code).toBe('ERR_INVALID_PAYLOAD');
      }
      expect(mockSocket.emit).not.toHaveBeenCalled();

      // Empty player name
      const res3 = await joinRoom('WXYZ', '');
      expect(res3.success).toBe(false);
      if (!res3.success) {
        expect(res3.error.code).toBe('ERR_INVALID_PAYLOAD');
      }
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects makeMove with invalid roomCode or illegal square coordinate', async () => {
      const { makeMove, lastError } = useSocket(mockSocket);

      // Invalid square coordinates
      const res1 = await makeMove('WXYZ', { from: 'z9' as any, to: 'e4' });
      expect(res1.success).toBe(false);
      if (!res1.success) {
        expect(res1.error.code).toBe('ERR_INVALID_PAYLOAD');
      }
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();

      // Invalid room code
      const res2 = await makeMove('TOOLONG', { from: 'e2', to: 'e4' });
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.error.code).toBe('ERR_INVALID_PAYLOAD');
      }
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects reconnect with non-UUID playerId or invalid roomCode', async () => {
      const { reconnect, lastError } = useSocket(mockSocket);

      // Non-UUID playerId
      const res1 = await reconnect('WXYZ', 'invalid-player-id', 'token123');
      expect(res1.success).toBe(false);
      if (!res1.success) {
        expect(res1.error.code).toBe('ERR_INVALID_PAYLOAD');
      }
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();

      // 3-character roomCode
      const res2 = await reconnect('XYZ', '11111111-1111-4111-a111-111111111111', 'token123');
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.error.code).toBe('ERR_INVALID_PAYLOAD');
      }
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects resign with invalid roomCode', () => {
      const { resign, lastError } = useSocket(mockSocket);

      const cb = vi.fn();
      resign('XYZ', cb);

      expect(cb).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({ code: 'ERR_INVALID_PAYLOAD' }),
      });
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects offerDraw with invalid roomCode', () => {
      const { offerDraw, lastError } = useSocket(mockSocket);

      const cb = vi.fn();
      offerDraw('BAD_CODE', cb);

      expect(cb).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({ code: 'ERR_INVALID_PAYLOAD' }),
      });
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects respondDraw with invalid roomCode', () => {
      const { respondDraw, lastError } = useSocket(mockSocket);

      const cb = vi.fn();
      respondDraw('1', true, cb);

      expect(cb).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({ code: 'ERR_INVALID_PAYLOAD' }),
      });
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects requestRematch with invalid roomCode', () => {
      const { requestRematch, lastError } = useSocket(mockSocket);

      const cb = vi.fn();
      requestRematch('12345', cb);

      expect(cb).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({ code: 'ERR_INVALID_PAYLOAD' }),
      });
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects respondRematch with invalid roomCode', () => {
      const { respondRematch, lastError } = useSocket(mockSocket);

      const cb = vi.fn();
      respondRematch('!!@@', true, cb);

      expect(cb).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({ code: 'ERR_INVALID_PAYLOAD' }),
      });
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('rejects leaveRoom with invalid roomCode', async () => {
      const { leaveRoom, lastError } = useSocket(mockSocket);

      const cb = vi.fn();
      await leaveRoom('NO', cb);

      expect(cb).toHaveBeenCalledWith({ success: false });
      expect(lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 7. [ENH-014] Absence of Obsolete sessionToken cast
  // ==========================================================================
  describe('7. [ENH-014] Absence of Obsolete sessionToken cast', () => {
    it('restores and saves session on game:rematch_started cleanly without player cast', () => {
      const { currentRoom, currentPlayer, sessionToken } = useSocket(mockSocket);

      const originalRoom = createTestRoom({ status: 'game_over' });
      currentRoom.value = originalRoom;

      // Player object adheres strictly to Player model (zero sessionToken field)
      const sanitizedPlayer = createTestPlayer({ id: '11111111-1111-4111-a111-111111111111', color: 'w' });
      expect('sessionToken' in sanitizedPlayer).toBe(false);
      currentPlayer.value = sanitizedPlayer;

      // Set existing session token ref
      sessionToken.value = 'valid_session_token_rematch';

      // Rematch started payload with reversed colors
      const newWhitePlayer = createTestPlayer({
        id: '22222222-2222-4222-a222-222222222222',
        color: 'w',
        socketId: 'sock_player_2',
      });
      const newBlackPlayer = createTestPlayer({
        id: '11111111-1111-4111-a111-111111111111',
        color: 'b',
        socketId: 'sock_player_1',
      });
      const rematchRoom: RoomState = {
        ...originalRoom,
        status: 'playing',
        whitePlayer: newWhitePlayer,
        blackPlayer: newBlackPlayer,
        game: { ...originalRoom.game, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
      };

      eventHandlers['game:rematch_started']({
        room: rematchRoom,
        gameState: rematchRoom.game,
      });

      // SessionToken preserved and persisted
      expect(sessionToken.value).toBe('valid_session_token_rematch');
      const savedRaw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      expect(savedRaw).not.toBeNull();
      const saved = JSON.parse(savedRaw!);
      expect(saved).toEqual({
        roomCode: 'WXYZ',
        playerId: '11111111-1111-4111-a111-111111111111',
        sessionToken: 'valid_session_token_rematch',
      });

      // Player assignment correctly updated to black
      expect(currentPlayer.value?.color).toBe('b');
    });

    it('restores session from getSavedSession fallback if sessionToken ref is empty', () => {
      const { currentRoom, currentPlayer, sessionToken } = useSocket(mockSocket);

      const originalRoom = createTestRoom({ status: 'game_over' });
      currentRoom.value = originalRoom;
      currentPlayer.value = createTestPlayer({ id: '11111111-1111-4111-a111-111111111111', color: 'w' });

      // Emulate scenario where sessionToken.value was reset but storage still holds token
      sessionToken.value = null;
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          roomCode: 'WXYZ',
          playerId: '11111111-1111-4111-a111-111111111111',
          sessionToken: 'recovered_from_storage_token',
        })
      );

      eventHandlers['game:rematch_started']({
        room: { ...originalRoom, status: 'playing' },
        gameState: originalRoom.game,
      });

      expect(sessionToken.value).toBe('recovered_from_storage_token');
      const saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!);
      expect(saved.sessionToken).toBe('recovered_from_storage_token');
    });
  });

  // ==========================================================================
  // 8. Spectator Lifecycle & Reconnection Sequences During Active Match
  // ==========================================================================
  describe('8. Spectator Lifecycle & Reconnection Sequences During Active Match', () => {
    it('preserves room playing status when a spectator disconnects during an active game', () => {
      const { currentRoom, currentPlayer } = useSocket(mockSocket);

      const spectator = createTestPlayer({
        id: '33333333-3333-4333-a333-333333333333',
        name: 'Charlie Spectator',
        isHost: false,
        socketId: 'sock_spectator_1',
      });
      const room = createTestRoom({
        status: 'playing',
        spectators: [spectator],
      });
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;

      // Spectator drops connection
      eventHandlers['room:player_disconnected']({
        playerId: spectator.id,
        gracePeriodMs: 30000,
      });

      // INVARIANT: Spectator disconnect MUST NOT pause the match or change status away from 'playing'
      expect(currentRoom.value?.status).toBe('playing');
      expect(currentRoom.value?.spectators).toHaveLength(1);
      expect(currentRoom.value?.spectators[0]?.isConnected).toBe(false);
      expect(currentRoom.value?.whitePlayer?.isConnected).toBe(true);
      expect(currentRoom.value?.blackPlayer?.isConnected).toBe(true);
    });

    it('allows active players to continue submitting moves while a spectator is disconnected', async () => {
      const { currentRoom, currentPlayer, makeMove } = useSocket(mockSocket);

      const spectator = createTestPlayer({
        id: '33333333-3333-4333-a333-333333333333',
        name: 'Charlie Spectator',
        isHost: false,
        socketId: 'sock_spectator_1',
      });
      const room = createTestRoom({
        status: 'playing',
        spectators: [spectator],
      });
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;

      // 1. Spectator drops connection
      eventHandlers['room:player_disconnected']({
        playerId: spectator.id,
        gracePeriodMs: 30000,
      });

      expect(currentRoom.value?.status).toBe('playing');
      expect(currentRoom.value?.spectators[0]?.isConnected).toBe(false);

      // 2. Active player makes a move
      const movePayload = { from: 'e2', to: 'e4' } as any;
      const expectedMoveResult: MoveResult = {
        san: 'e4',
        from: 'e2',
        to: 'e4',
        color: 'w',
        piece: 'p',
        flags: 'b',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        moveNumber: 1,
        timestamp: 1700000005000,
      };

      mockSocket.emit.mockImplementation((event: string, payload: any, ack: Function) => {
        if (event === 'game:move') {
          expect(payload.roomCode).toBe('WXYZ');
          expect(payload.move).toEqual(movePayload);
          ack({ success: true, moveResult: expectedMoveResult });
        }
      });

      const res = await makeMove('WXYZ', movePayload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.moveResult).toEqual(expectedMoveResult);
      }

      // 3. Server broadcasts game:moved
      eventHandlers['game:moved']({
        move: expectedMoveResult,
        gameState: {
          ...room.game,
          fen: expectedMoveResult.fen,
          turn: 'b',
          moveCount: 1,
        },
      });

      // Room remains playing with updated FEN
      expect(currentRoom.value?.status).toBe('playing');
      expect(currentRoom.value?.game.fen).toBe(expectedMoveResult.fen);
      expect(currentRoom.value?.game.turn).toBe('b');
    });

    it('restores spectator connectivity on spectator reconnection without disturbing active match', () => {
      const { currentRoom, currentPlayer } = useSocket(mockSocket);

      const spectator = createTestPlayer({
        id: '33333333-3333-4333-a333-333333333333',
        name: 'Charlie Spectator',
        isHost: false,
        socketId: 'sock_spectator_1',
        isConnected: false,
      });
      const room = createTestRoom({
        status: 'playing',
        spectators: [spectator],
      });
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;

      // Spectator reconnects
      eventHandlers['room:player_reconnected']({
        playerId: spectator.id,
        playerName: 'Charlie Spectator',
      });

      expect(currentRoom.value?.spectators[0]?.isConnected).toBe(true);
      expect(currentRoom.value?.status).toBe('playing');
      expect(currentRoom.value?.whitePlayer?.isConnected).toBe(true);
      expect(currentRoom.value?.blackPlayer?.isConnected).toBe(true);
    });

    it('executes full active player disconnect and reconnection sequence: playing -> paused_disconnect -> playing', () => {
      const { currentRoom, currentPlayer } = useSocket(mockSocket);

      const spectator = createTestPlayer({
        id: '33333333-3333-4333-a333-333333333333',
        name: 'Charlie Spectator',
      });
      const room = createTestRoom({
        status: 'playing',
        spectators: [spectator],
      });
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;

      // 1. Black player temporarily drops connection
      eventHandlers['room:player_disconnected']({
        playerId: room.blackPlayer!.id,
        gracePeriodMs: 30000,
      });

      // Match MUST pause when an active player disconnects
      expect(currentRoom.value?.status).toBe('paused_disconnect');
      expect(currentRoom.value?.blackPlayer?.isConnected).toBe(false);
      expect(currentRoom.value?.whitePlayer?.isConnected).toBe(true);
      expect(currentRoom.value?.spectators[0]?.isConnected).toBe(true);

      // 2. Black player reconnects within grace period
      eventHandlers['room:player_reconnected']({
        playerId: room.blackPlayer!.id,
        playerName: 'Bob',
      });

      // Match automatically resumes to 'playing' once both active players are connected
      expect(currentRoom.value?.status).toBe('playing');
      expect(currentRoom.value?.blackPlayer?.isConnected).toBe(true);
      expect(currentRoom.value?.whitePlayer?.isConnected).toBe(true);
    });

    it('handles multiple spectators disconnecting and reconnecting independently during an active game', () => {
      const { currentRoom, currentPlayer } = useSocket(mockSocket);

      const spec1 = createTestPlayer({ id: '33333333-3333-4333-a333-333333333333', name: 'Spec1' });
      const spec2 = createTestPlayer({ id: '44444444-4444-4444-a444-444444444444', name: 'Spec2' });
      const room = createTestRoom({
        status: 'playing',
        spectators: [spec1, spec2],
      });
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;

      // First spectator drops
      eventHandlers['room:player_disconnected']({ playerId: spec1.id, gracePeriodMs: 30000 });
      expect(currentRoom.value?.status).toBe('playing');
      expect(currentRoom.value?.spectators.find((s) => s.id === spec1.id)?.isConnected).toBe(false);
      expect(currentRoom.value?.spectators.find((s) => s.id === spec2.id)?.isConnected).toBe(true);

      // Second spectator drops
      eventHandlers['room:player_disconnected']({ playerId: spec2.id, gracePeriodMs: 30000 });
      expect(currentRoom.value?.status).toBe('playing');
      expect(currentRoom.value?.spectators.find((s) => s.id === spec1.id)?.isConnected).toBe(false);
      expect(currentRoom.value?.spectators.find((s) => s.id === spec2.id)?.isConnected).toBe(false);

      // First spectator reconnects
      eventHandlers['room:player_reconnected']({ playerId: spec1.id, playerName: 'Spec1' });
      expect(currentRoom.value?.status).toBe('playing');
      expect(currentRoom.value?.spectators.find((s) => s.id === spec1.id)?.isConnected).toBe(true);
      expect(currentRoom.value?.spectators.find((s) => s.id === spec2.id)?.isConnected).toBe(false);

      // Second spectator reconnects
      eventHandlers['room:player_reconnected']({ playerId: spec2.id, playerName: 'Spec2' });
      expect(currentRoom.value?.status).toBe('playing');
      expect(currentRoom.value?.spectators.find((s) => s.id === spec1.id)?.isConnected).toBe(true);
      expect(currentRoom.value?.spectators.find((s) => s.id === spec2.id)?.isConnected).toBe(true);
    });

    it('synchronizes room and player state via authoritative room:reconnected event', () => {
      const { currentRoom, currentPlayer } = useSocket(mockSocket);

      const room = createTestRoom({ status: 'paused_disconnect' });
      room.blackPlayer!.isConnected = false;
      currentRoom.value = room;
      currentPlayer.value = room.whitePlayer;

      const updatedWhitePlayer = { ...room.whitePlayer!, socketId: 'sock_p1_synced', isConnected: true };
      const updatedBlackPlayer = { ...room.blackPlayer!, socketId: 'sock_p2_synced', isConnected: true };
      const reconnectedRoom: RoomState = {
        ...room,
        status: 'playing',
        whitePlayer: updatedWhitePlayer,
        blackPlayer: updatedBlackPlayer,
      };

      eventHandlers['room:reconnected']({
        room: reconnectedRoom,
        player: updatedWhitePlayer,
        roomStatus: 'playing',
      });

      expect(currentRoom.value?.status).toBe('playing');
      expect(currentRoom.value?.whitePlayer?.isConnected).toBe(true);
      expect(currentRoom.value?.blackPlayer?.isConnected).toBe(true);
      expect(currentPlayer.value?.socketId).toBe('sock_p1_synced');
    });
  });
});
