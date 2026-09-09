import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useGameSessionSync } from '../useGameSessionSync';
import type { RoomState, Player } from '@fun-chess/shared';

describe('useGameSessionSync', () => {
  let audioProviderRef: any;
  let socketApi: any;
  let chessEngine: any;
  let modalManager: any;
  let navigation: any;
  let celebrateMock: ReturnType<typeof vi.fn<() => void>>;
  let showNotificationMock: ReturnType<typeof vi.fn<(msg: string, type?: 'info' | 'error' | 'success', durationMs?: number) => void>>;
  let safeLocalStorageMock: any;

  beforeEach(() => {
    audioProviderRef = ref({
      playMove: vi.fn(),
      playCapture: vi.fn(),
      playCheck: vi.fn(),
      playVictory: vi.fn(),
      playDraw: vi.fn(),
      playStart: vi.fn(),
      playError: vi.fn(),
      playStarEarned: vi.fn(),
      playClick: vi.fn(),
    });

    socketApi = {
      socketId: ref('socket-1'),
      currentRoom: ref<RoomState | null>(null),
      currentPlayer: ref<Player | null>(null),
      rematchRequestedBy: ref<any>(null),
      lastGameOver: ref<any>(null),
      kingInCheck: ref(false),
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      makeMove: vi.fn(),
    };

    chessEngine = {
      orientation: ref('w'),
      myColor: ref<'w' | 'b' | null>('w'),
      selectSquare: vi.fn(),
      syncGameState: vi.fn(),
      resetGame: vi.fn(),
      setPlayerColor: vi.fn(),
    };

    modalManager = {
      showQrModal: ref(false),
      showGameOverModal: ref(false),
    };

    navigation = {
      isActionLoading: ref(false),
      myPlayerAvatar: ref('🦊'),
    };

    celebrateMock = vi.fn<() => void>();
    showNotificationMock = vi.fn<(msg: string, type?: 'info' | 'error' | 'success', durationMs?: number) => void>();
    safeLocalStorageMock = {
      safeSetItem: vi.fn(),
      safeGetItem: vi.fn(),
    };
  });

  const createComposable = () =>
    useGameSessionSync({
      audioProviderRef,
      socketApi,
      chessEngine,
      modalManager,
      navigation,
      celebrate: celebrateMock,
      showNotification: showNotificationMock,
      safeLocalStorage: safeLocalStorageMock,
    });

  it('computes isHost correctly', () => {
    const sessionSync = createComposable();
    expect(sessionSync.isHost.value).toBe(false);

    socketApi.currentPlayer.value = { id: 'p1', name: 'Alice' } as any;
    socketApi.currentRoom.value = { hostId: 'p1' } as any;
    expect(sessionSync.isHost.value).toBe(true);

    socketApi.currentRoom.value = { hostId: 'p2' } as any;
    expect(sessionSync.isHost.value).toBe(false);
  });

  it('computes opponentPlayer based on current player color', () => {
    const sessionSync = createComposable();
    expect(sessionSync.opponentPlayer.value).toBeNull();

    socketApi.currentPlayer.value = { id: 'p1', color: 'w' } as any;
    socketApi.currentRoom.value = {
      whitePlayer: { id: 'p1', color: 'w' },
      blackPlayer: { id: 'p2', color: 'b' },
    } as any;

    expect(sessionSync.opponentPlayer.value).toEqual({ id: 'p2', color: 'b' });

    socketApi.currentPlayer.value = { id: 'p2', color: 'b' } as any;
    expect(sessionSync.opponentPlayer.value).toEqual({ id: 'p1', color: 'w' });
  });

  it('computes isWinner and isDrawResult correctly', () => {
    const sessionSync = createComposable();
    expect(sessionSync.isWinner.value).toBe(false);
    expect(sessionSync.isDrawResult.value).toBe(false);

    chessEngine.myColor.value = 'w';
    socketApi.lastGameOver.value = { winner: 'w', reason: 'checkmate' };
    expect(sessionSync.isWinner.value).toBe(true);
    expect(sessionSync.isDrawResult.value).toBe(false);

    socketApi.lastGameOver.value = { winner: 'draw', reason: 'stalemate' };
    expect(sessionSync.isWinner.value).toBe(false);
    expect(sessionSync.isDrawResult.value).toBe(true);
  });

  it('computes rematch states correctly', () => {
    const sessionSync = createComposable();
    expect(sessionSync.isRematchRequestedByMe.value).toBe(false);
    expect(sessionSync.showIncomingRematchModal.value).toBe(false);

    socketApi.currentPlayer.value = { id: 'p1' } as any;
    socketApi.currentRoom.value = {
      rematch: { status: 'pending', requestedBy: 'p1' },
    } as any;
    expect(sessionSync.isRematchRequestedByMe.value).toBe(true);

    socketApi.rematchRequestedBy.value = { requestedBy: 'p2' };
    expect(sessionSync.showIncomingRematchModal.value).toBe(true);
  });

  it('resets game when currentRoom transitions from active to null', async () => {
    socketApi.currentRoom.value = { roomCode: 'ROOM' } as any;
    createComposable();
    socketApi.currentRoom.value = null;
    await vi.waitFor(() => {
      expect(chessEngine.setPlayerColor).toHaveBeenCalledWith(null);
      expect(chessEngine.resetGame).toHaveBeenCalled();
    });
  });

  it('syncs game state and player color when room is set', async () => {
    createComposable();
    socketApi.currentPlayer.value = { id: 'p1', color: 'b' } as any;
    socketApi.currentRoom.value = {
      roomCode: 'TEST',
      status: 'playing',
      game: { fen: 'startfen' },
    } as any;

    await vi.waitFor(() => {
      expect(chessEngine.syncGameState).toHaveBeenCalledWith({ fen: 'startfen' });
      expect(chessEngine.setPlayerColor).toHaveBeenCalledWith('b');
      expect(chessEngine.orientation.value).toBe('b');
    });
  });

  it('plays sounds and celebrates on game over', async () => {
    createComposable();
    chessEngine.myColor.value = 'w';
    socketApi.lastGameOver.value = { winner: 'w', reason: 'checkmate' };

    await vi.waitFor(() => {
      expect(modalManager.showGameOverModal.value).toBe(true);
      expect(audioProviderRef.value.playVictory).toHaveBeenCalled();
      expect(celebrateMock).toHaveBeenCalled();
    });
  });

  it('plays draw sound on draw game over', async () => {
    createComposable();
    chessEngine.myColor.value = 'w';
    socketApi.lastGameOver.value = { winner: 'draw', reason: 'stalemate' };

    await vi.waitFor(() => {
      expect(modalManager.showGameOverModal.value).toBe(true);
      expect(audioProviderRef.value.playDraw).toHaveBeenCalled();
      expect(celebrateMock).not.toHaveBeenCalled();
    });
  });

  it('plays check sound when kingInCheck is true', async () => {
    createComposable();
    socketApi.kingInCheck.value = true;

    await vi.waitFor(() => {
      expect(audioProviderRef.value.playCheck).toHaveBeenCalled();
    });
  });

  it('handles host game creation success and failure', async () => {
    const sessionSync = createComposable();

    // Success
    socketApi.createRoom.mockResolvedValueOnce({ success: true, room: { roomCode: 'ROOM' } });
    await sessionSync.handleHostGame({ playerName: 'Bob', avatar: '🦁', preferredColor: 'w' });
    expect(navigation.myPlayerAvatar.value).toBe('🦁');
    expect(safeLocalStorageMock.safeSetItem).toHaveBeenCalledWith('fun_chess_player_avatar', '🦁');
    expect(modalManager.showQrModal.value).toBe(true);
    expect(navigation.isActionLoading.value).toBe(false);

    // Failure
    socketApi.createRoom.mockResolvedValueOnce({ success: false, error: { message: 'Network error' } });
    await sessionSync.handleHostGame({ playerName: 'Bob', preferredColor: 'random' });
    expect(audioProviderRef.value.playError).toHaveBeenCalled();
    expect(showNotificationMock).toHaveBeenCalledWith('Network error', 'error');
  });

  it('handles join game failure', async () => {
    const sessionSync = createComposable();
    socketApi.joinRoom.mockResolvedValueOnce({ success: false, error: { message: 'Room not found' } });
    await sessionSync.handleJoinGame({ roomCode: 'XYZW', playerName: 'Charlie' });
    expect(audioProviderRef.value.playError).toHaveBeenCalled();
    expect(showNotificationMock).toHaveBeenCalledWith('Room not found', 'error');
  });

  it('handles move execution with capture and non-capture', async () => {
    const sessionSync = createComposable();
    socketApi.currentRoom.value = { roomCode: 'ABCD', game: { fen: 'f' } } as any;

    // Normal move
    socketApi.makeMove.mockResolvedValueOnce({ success: true, moveResult: { captured: undefined } });
    await sessionSync.handleExecuteMove({ from: 'e2' as any, to: 'e4' as any });
    expect(audioProviderRef.value.playMove).toHaveBeenCalled();

    // Capture move
    socketApi.makeMove.mockResolvedValueOnce({ success: true, moveResult: { captured: 'p' } });
    await sessionSync.handleExecuteMove({ from: 'e4' as any, to: 'd5' as any });
    expect(audioProviderRef.value.playCapture).toHaveBeenCalled();

    // Failed move
    socketApi.makeMove.mockResolvedValueOnce({ success: false });
    await sessionSync.handleExecuteMove({ from: 'e4' as any, to: 'e5' as any });
    expect(audioProviderRef.value.playError).toHaveBeenCalled();
    expect(chessEngine.syncGameState).toHaveBeenCalledWith({ fen: 'f' });
  });

  describe('Named Watcher Callbacks (ENH-012)', () => {
    it('handleRoomStatusChange closes QR modal and plays start sound on transition from lobby to playing', () => {
      const sessionSync = createComposable();
      modalManager.showQrModal.value = true;

      sessionSync.handleRoomStatusChange('playing', 'lobby');

      expect(modalManager.showQrModal.value).toBe(false);
      expect(audioProviderRef.value.playStart).toHaveBeenCalled();
    });

    it('handleRoomStatusChange ignores non-transition states', () => {
      const sessionSync = createComposable();
      modalManager.showQrModal.value = true;

      sessionSync.handleRoomStatusChange('lobby', 'lobby');
      expect(modalManager.showQrModal.value).toBe(true);
      expect(audioProviderRef.value.playStart).not.toHaveBeenCalled();
    });

    it('handleGameResultChange triggers victory sound and celebration when player wins', () => {
      const sessionSync = createComposable();
      chessEngine.myColor.value = 'w';

      sessionSync.handleGameResultChange({
        winner: 'w',
        reason: 'checkmate',
        finalFen: '8/8/8/8/8/8/8/8 w - - 0 1',
        totalMoves: 20,
        startTimeMs: 1000,
      } as any);

      expect(modalManager.showGameOverModal.value).toBe(true);
      expect(audioProviderRef.value.playVictory).toHaveBeenCalled();
      expect(celebrateMock).toHaveBeenCalled();
    });

    it('handleGameResultChange triggers draw sound on draw outcome', () => {
      const sessionSync = createComposable();
      chessEngine.myColor.value = 'w';

      sessionSync.handleGameResultChange({
        winner: 'draw',
        reason: 'stalemate',
        finalFen: '8/8/8/8/8/8/8/8 w - - 0 1',
        totalMoves: 30,
        startTimeMs: 1000,
      } as any);

      expect(modalManager.showGameOverModal.value).toBe(true);
      expect(audioProviderRef.value.playDraw).toHaveBeenCalled();
      expect(celebrateMock).not.toHaveBeenCalled();
    });

    it('handleActivePlayerChange assigns color from socketId when currentPlayer is not yet bound', () => {
      const sessionSync = createComposable();
      socketApi.currentPlayer.value = null;
      socketApi.socketId.value = 'socket-white';

      sessionSync.handleActivePlayerChange({
        roomCode: 'ABCD',
        status: 'lobby',
        whitePlayer: { id: 'p1', socketId: 'socket-white', color: 'w' },
        blackPlayer: null,
      } as any);

      expect(chessEngine.setPlayerColor).toHaveBeenCalledWith('w');
      expect(chessEngine.orientation.value).toBe('w');
    });

    it('handleKingCheckChange triggers check sound when king is in check', () => {
      const sessionSync = createComposable();

      sessionSync.handleKingCheckChange(true);
      expect(audioProviderRef.value.playCheck).toHaveBeenCalledTimes(1);

      sessionSync.handleKingCheckChange(false);
      expect(audioProviderRef.value.playCheck).toHaveBeenCalledTimes(1);
    });

    it('handleRoomStateChange resets game on null room and syncs state on valid room', () => {
      const sessionSync = createComposable();

      sessionSync.handleRoomStateChange(null);
      expect(chessEngine.setPlayerColor).toHaveBeenCalledWith(null);
      expect(chessEngine.resetGame).toHaveBeenCalled();

      sessionSync.handleRoomStateChange({
        roomCode: 'SYNC',
        status: 'playing',
        game: { fen: 'fen_test' },
      } as any);
      expect(chessEngine.syncGameState).toHaveBeenCalledWith({ fen: 'fen_test' });
    });
  });
});
