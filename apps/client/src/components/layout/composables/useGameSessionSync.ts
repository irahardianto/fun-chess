/**
 * Game session synchronization and event orchestration composable for App.vue.
 * Coordinates WebSockets, chess rules engine, audio triggers, and modal states (MAJ-019).
 */

import { computed, watch, type Ref } from 'vue';
import type { Square, RoomState, RoomStatus, GameOverPayload } from '@fun-chess/shared';
import type { AppAudioProvider } from '@/components/layout';
import type { useModalManager } from './useModalManager';
import type { useAppNavigation } from './useAppNavigation';
import type { useSocket, useChessGame } from '@/composables';
import type { KeyValueStorage } from '@/platform/storage';
import { STORAGE_KEYS } from '@/platform/storage';

export interface UseGameSessionSyncOptions {
  audioProviderRef: Ref<InstanceType<typeof AppAudioProvider> | null>;
  socketApi: ReturnType<typeof useSocket>;
  chessEngine: ReturnType<typeof useChessGame>;
  modalManager: ReturnType<typeof useModalManager>;
  navigation: ReturnType<typeof useAppNavigation>;
  celebrate: () => void;
  showNotification: (msg: string, type?: 'info' | 'error' | 'success', durationMs?: number) => void;
  safeLocalStorage: KeyValueStorage;
}

export function useGameSessionSync(options: UseGameSessionSyncOptions) {
  const {
    audioProviderRef,
    socketApi,
    chessEngine,
    modalManager,
    navigation,
    celebrate,
    showNotification,
    safeLocalStorage,
  } = options;

  const {
    socketId,
    currentRoom,
    currentPlayer,
    rematchRequestedBy,
    lastGameOver,
    kingInCheck,
    createRoom,
    joinRoom,
    makeMove,
  } = socketApi;

  const {
    orientation,
    myColor,
    syncGameState,
    resetGame,
    setPlayerColor,
  } = chessEngine;

  const { showQrModal, showGameOverModal } = modalManager;
  const { isActionLoading, myPlayerAvatar } = navigation;

  // Audio helper triggers
  const playMove = () => audioProviderRef.value?.playMove();
  const playCapture = () => audioProviderRef.value?.playCapture();
  const playCheck = () => audioProviderRef.value?.playCheck();
  const playVictory = () => audioProviderRef.value?.playVictory();
  const playDraw = () => audioProviderRef.value?.playDraw();
  const playStart = () => audioProviderRef.value?.playStart();
  const playError = () => audioProviderRef.value?.playError();
  const playStarEarned = () => audioProviderRef.value?.playStarEarned();

  // Computed properties
  const isHost = computed(() => {
    return Boolean(
      currentRoom.value &&
      currentPlayer.value &&
      currentRoom.value.hostId === currentPlayer.value.id
    );
  });

  const opponentPlayer = computed(() => {
    if (!currentRoom.value || !currentPlayer.value) {
      return null;
    }
    return currentPlayer.value.color === 'w'
      ? currentRoom.value.blackPlayer
      : currentRoom.value.whitePlayer;
  });

  const isWinner = computed(() => {
    return Boolean(
      lastGameOver.value &&
      myColor.value &&
      lastGameOver.value.winner === myColor.value
    );
  });

  const isDrawResult = computed(() => {
    return Boolean(
      lastGameOver.value &&
      lastGameOver.value.winner === 'draw'
    );
  });

  const isRematchRequestedByMe = computed(() => {
    return Boolean(
      currentRoom.value?.rematch?.status === 'pending' &&
      currentRoom.value.rematch.requestedBy === currentPlayer.value?.id
    );
  });

  const showIncomingRematchModal = computed(() => {
    return Boolean(
      rematchRequestedBy.value &&
      currentPlayer.value &&
      rematchRequestedBy.value.requestedBy !== currentPlayer.value.id
    );
  });

  // --------------------------------------------------------------------------
  // Named Watcher Handlers (ENH-012)
  // --------------------------------------------------------------------------

  /**
   * Synchronizes active player color and board orientation based on current player or socket assignment.
   *
   * @param room - Current room state containing participant assignments
   */
  function handleActivePlayerChange(room: RoomState): void {
    if (currentPlayer.value) {
      setPlayerColor(currentPlayer.value.color);
      orientation.value = currentPlayer.value.color;
    } else if (socketId.value) {
      const assignedColor =
        room.whitePlayer?.socketId === socketId.value
          ? 'w'
          : room.blackPlayer?.socketId === socketId.value
            ? 'b'
            : null;
      if (assignedColor) {
        setPlayerColor(assignedColor);
        orientation.value = assignedColor;
      }
    }
  }

  /**
   * Synchronizes room state changes: resets chess engine if room was cleared, updates game
   * state snapshot, updates active player orientation, and opens QR modal for host in lobby.
   *
   * @param room - Updated room state snapshot or null if room was left/cleared
   */
  function handleRoomStateChange(room: RoomState | null): void {
    if (!room) {
      setPlayerColor(null);
      resetGame();
      return;
    }
    if (room.game) {
      syncGameState(room.game);
    }
    handleActivePlayerChange(room);
    if (room.status === 'lobby' && isHost.value) {
      showQrModal.value = true;
    }
  }

  /**
   * Handles room status transitions: dismisses QR modal and plays match start audio
   * when transitioning from lobby to playing.
   *
   * @param newStatus - New room status
   * @param oldStatus - Preceding room status
   */
  function handleRoomStatusChange(newStatus?: RoomStatus, oldStatus?: RoomStatus): void {
    if (newStatus === 'playing' && oldStatus === 'lobby') {
      showQrModal.value = false;
      playStart();
    }
  }

  /**
   * Handles game over outcomes: opens game-over modal, plays victory or draw audio,
   * and triggers celebratory confetti when the local player wins.
   *
   * @param gameOver - Game over payload or null
   */
  function handleGameResultChange(gameOver: GameOverPayload | null): void {
    if (gameOver) {
      showGameOverModal.value = true;
      if (myColor.value && gameOver.winner === myColor.value) {
        playVictory();
        celebrate();
      } else if (gameOver.winner === 'draw') {
        playDraw();
      }
    }
  }

  /**
   * Handles check state transitions: plays check audio alert when local king is in check.
   *
   * @param isInCheck - King in check state payload or boolean indicator
   */
  function handleKingCheckChange(isInCheck: unknown): void {
    if (isInCheck) {
      playCheck();
    }
  }

  // Watchers for Room and Game Lifecycle
  watch(() => currentRoom.value, handleRoomStateChange, { deep: true });
  watch(() => currentRoom.value?.status, handleRoomStatusChange);
  watch(() => lastGameOver.value, handleGameResultChange);
  watch(() => kingInCheck.value, handleKingCheckChange);

  // Action Handlers
  async function handleHostGame(payload: { playerName: string; avatar?: string; preferredColor: 'w' | 'b' | 'random' }) {
    if (payload.avatar) {
      myPlayerAvatar.value = payload.avatar;
      safeLocalStorage.safeSetItem(STORAGE_KEYS.PLAYER_AVATAR, payload.avatar);
    }
    isActionLoading.value = true;
    try {
      const result = await createRoom(payload.playerName, payload.preferredColor, payload.avatar);
      if (result.success) {
        showQrModal.value = true;
      } else {
        playError();
        showNotification(
          result.error?.message || 'Unable to create room. Check your connection and try again.',
          'error'
        );
      }
    } finally {
      isActionLoading.value = false;
    }
  }

  async function handleJoinGame(payload: { roomCode: string; playerName: string; avatar?: string }) {
    if (payload.avatar) {
      myPlayerAvatar.value = payload.avatar;
      safeLocalStorage.safeSetItem(STORAGE_KEYS.PLAYER_AVATAR, payload.avatar);
    }
    isActionLoading.value = true;
    try {
      const result = await joinRoom(payload.roomCode, payload.playerName, payload.avatar);
      if (!result.success) {
        playError();
        showNotification(
          result.error?.message || 'Unable to join room. Check the 4-letter room code and try again.',
          'error'
        );
      }
    } finally {
      isActionLoading.value = false;
    }
  }

  let isSubmittingMove = false;
  async function handleExecuteMove(move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) {
    if (!currentRoom.value || isSubmittingMove) {
      return;
    }
    isSubmittingMove = true;
    try {
      const result = await makeMove(currentRoom.value.roomCode, move);
      if (result.success) {
        if (result.moveResult.captured) {
          playCapture();
        } else {
          playMove();
        }
      } else {
        playError();
        if (currentRoom.value.game) {
          syncGameState(currentRoom.value.game);
        }
      }
    } finally {
      isSubmittingMove = false;
    }
  }

  return {
    isHost,
    opponentPlayer,
    isWinner,
    isDrawResult,
    isRematchRequestedByMe,
    showIncomingRematchModal,
    handleHostGame,
    handleJoinGame,
    handleExecuteMove,
    handleRoomStateChange,
    handleActivePlayerChange,
    handleRoomStatusChange,
    handleGameResultChange,
    handleKingCheckChange,
    playMove,
    playCapture,
    playCheck,
    playVictory,
    playDraw,
    playStart,
    playError,
    playStarEarned,
  };
}
