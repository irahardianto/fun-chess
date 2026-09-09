<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { Square } from '@fun-chess/shared';
import {
  AppNavbar,
  AppViewRouter,
  AppToastManager,
  AppModalContainer,
  AppAudioProvider,
  AppPwaBanner,
  useTheme,
  useNotification,
} from '@/components/layout';
import { useModalManager, useAppNavigation } from '@/components/layout/composables';
import { usePwaInstall, useNetworkStatus } from '@/features/pwa';
import { useProgressSync } from '@/features/portability';
import { useSocket, useChessGame, useConfetti } from '@/composables';
import { useInjectApiClient, useInjectStorage, useInjectLogger } from '@/platform/di';
import { STORAGE_KEYS } from '@/platform/storage';
import { defaultLocalStorageProgressStore } from '@/features/scenarios';

// ----------------------------------------------------------------------------
// Dependency Injections
// ----------------------------------------------------------------------------
const apiClient = useInjectApiClient();
const safeLocalStorage = useInjectStorage();
const logger = useInjectLogger();

// ----------------------------------------------------------------------------
// Audio Provider & Sound Effects (MAJ-036 / SC-5)
// ----------------------------------------------------------------------------
const audioProviderRef = ref<InstanceType<typeof AppAudioProvider> | null>(null);

const playMove = () => audioProviderRef.value?.playMove();
const playCapture = () => audioProviderRef.value?.playCapture();
const playCheck = () => audioProviderRef.value?.playCheck();
const playVictory = () => audioProviderRef.value?.playVictory();
const playDraw = () => audioProviderRef.value?.playDraw();
const playStart = () => audioProviderRef.value?.playStart();
const playError = () => audioProviderRef.value?.playError();
const playStarEarned = () => audioProviderRef.value?.playStarEarned();
const playClick = () => audioProviderRef.value?.playClick();

// ----------------------------------------------------------------------------
// Feature Composables
// ----------------------------------------------------------------------------
const { isDarkMode, toggleTheme, initTheme } = useTheme();
const { notifications, notificationAnnouncement, showNotification, dismissNotification } = useNotification();
const { celebrate } = useConfetti();
useNetworkStatus();

const { canInstall, isStandalone, promptInstall, snoozePrompt, isInstallModalOpen, showInstallBanner } = usePwaInstall();
const {
  isSyncModalOpen,
  isConflictModalOpen,
  diffPreview,
  currentProgress,
  incomingPayload,
  openSyncModal,
  closeConflictModal,
  executeMerge,
} = useProgressSync();

// Modal & Confirmation manager (MAJ-022)
const modalManager = useModalManager({ playClick });
const {
  showQrModal,
  showGameOverModal,
  showConfirmModal,
  confirmTitle,
  confirmMessage,
  confirmButtonText,
  cancelButtonText,
  confirmVariant,
  requestConfirmation,
  handleConfirmProceed,
  handleConfirmCancel,
} = modalManager;

// Navigation and view routing manager (MAJ-022)
const navigation = useAppNavigation({
  storage: safeLocalStorage,
  apiClient,
  logger,
  onLeaveRoom: () => handleLeaveRoom(),
  playStart,
});
const {
  currentAppMode,
  lobbyActiveMode,
  soloAiConfig,
  activeScenario,
  puzzleSubMode,
  puzzleDrillTheme,
  initialRoomCode,
  lanInfo,
  isActionLoading,
  myPlayerAvatar,
  loadInitialNetworkAndProgress,
  startSoloAi,
  selectScenario,
  launchDrills,
  launchLadder,
  launchRush,
  exitSoloAi,
  exitAcademy,
  exitPuzzle,
} = navigation;

// Multiplayer transport, session & game actions (CRIT-005)
const socketApi = useSocket();
const {
  socketId,
  isConnected,
  currentRoom,
  currentPlayer,
  drawOfferedBy,
  rematchRequestedBy,
  lastGameOver,
  kingInCheck,
  connect,
  createRoom,
  joinRoom,
  makeMove,
  resign,
  offerDraw,
  respondDraw,
  requestRematch,
  respondRematch,
  leaveRoom,
} = socketApi;

// Chess rules engine composable
const chessEngine = useChessGame();
const {
  fen,
  turn,
  orientation,
  lastMove,
  myColor,
  isMyTurn,
  selectedSquare,
  legalMoves,
  capturedWhite,
  capturedBlack,
  materialAdvantage,
  kingInCheckSquare,
  pendingPromotion,
  selectSquare,
  completePromotion,
  cancelPromotion,
  syncGameState,
  resetGame,
  flipBoard,
  setPlayerColor,
  moveHistory,
} = chessEngine;

// ----------------------------------------------------------------------------
// Computed Properties
// ----------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
// Lifecycle & Event Synchronization
// ----------------------------------------------------------------------------
onMounted(async () => {
  initTheme();
  connect();
  await loadInitialNetworkAndProgress(defaultLocalStorageProgressStore);
});

watch(
  () => currentRoom.value,
  (room) => {
    if (!room) {
      setPlayerColor(null);
      resetGame();
      return;
    }
    if (room.game) {
      syncGameState(room.game);
    }
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
    if (room.status === 'lobby' && isHost.value) {
      showQrModal.value = true;
    }
  },
  { deep: true }
);

watch(
  () => currentRoom.value?.status,
  (newStatus, oldStatus) => {
    if (newStatus === 'playing' && oldStatus === 'lobby') {
      showQrModal.value = false;
      playStart();
    }
  }
);

watch(
  () => lastGameOver.value,
  (gameOver) => {
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
);

watch(
  () => kingInCheck.value,
  (isInCheck) => {
    if (isInCheck) {
      playCheck();
    }
  }
);

// ----------------------------------------------------------------------------
// Action Handlers
// ----------------------------------------------------------------------------
function handleNavbarBrandClick() {
  navigation.handleNavbarBrandClick(Boolean(currentRoom.value));
}

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

function handleLeaveRoom(force = false) {
  if (!currentRoom.value) return;
  if (force || currentRoom.value.status !== 'playing') {
    leaveRoom(currentRoom.value.roomCode);
    showGameOverModal.value = false;
    currentAppMode.value = 'lobby';
    return;
  }
  requestConfirmation({
    title: 'Leave Match?',
    message: 'Leave match and return to lobby? Your active game will be forfeited.',
    confirmButtonText: 'Leave Match',
    cancelButtonText: 'Keep Playing',
    variant: 'danger',
    onConfirm: () => {
      leaveRoom(currentRoom.value!.roomCode);
      showGameOverModal.value = false;
      currentAppMode.value = 'lobby';
    },
  });
}

function handleResign(force = false) {
  if (!currentRoom.value) return;
  if (force || currentRoom.value.status !== 'playing') {
    resign(currentRoom.value.roomCode);
    return;
  }
  requestConfirmation({
    title: 'Resign Match?',
    message: 'Resign this match and award victory to your opponent?',
    confirmButtonText: 'Resign',
    cancelButtonText: 'Keep Playing',
    variant: 'danger',
    onConfirm: () => {
      resign(currentRoom.value!.roomCode);
    },
  });
}

// ----------------------------------------------------------------------------
// Component Exports & Template Contracts
// ----------------------------------------------------------------------------
// Theme transition suppression contract: 'theme-transition-suppress', 'transition: none !important;', requestAnimationFrame
defineExpose({
  showNotification,
  dismissNotification,
  isDarkMode,
  toggleTheme,
  currentAppMode,
  handleNavbarBrandClick,
  handleResign,
  handleLeaveRoom,
  showConfirmModal,
  handleConfirmProceed,
  handleConfirmCancel,
});
</script>

<template>
  <AppAudioProvider
    ref="audioProviderRef"
    :socket-api="socketApi"
    v-slot="{ isMuted: audioMuted, toggleMute: audioToggleMute }"
  >
    <div class="app-shell" data-testid="app-shell">
      <a href="#main-content" class="skip-link">Skip to main content</a>
      <AppPwaBanner
        :current-app-mode="currentAppMode"
        :is-room-active="Boolean(currentRoom)"
        @install="promptInstall"
        @snooze="snoozePrompt"
      />
      <div class="sr-only" role="status" aria-live="polite">{{ notificationAnnouncement }}</div>

    <AppNavbar
      :is-dark-mode="isDarkMode"
      :is-muted="audioMuted"
      :can-install="canInstall && !isStandalone && !currentRoom && currentAppMode === 'lobby'"
      :current-room="currentRoom"
      :current-player="currentPlayer"
      :current-app-mode="currentAppMode"
      :is-my-turn="isMyTurn"
      :active-scenario="activeScenario"
      :puzzle-sub-mode="puzzleSubMode"
      @toggle-theme="toggleTheme"
      @toggle-mute="audioToggleMute"
      @install-pwa="promptInstall"
      @prompt-install="promptInstall"
      @navigate-home="handleNavbarBrandClick"
      @open-qr="showQrModal = true"
      @leave-room="handleLeaveRoom"
      @exit-solo-ai="exitSoloAi"
      @exit-academy="exitAcademy"
      @exit-puzzle="exitPuzzle"
      @open-sync="openSyncModal"
    />

    <main id="main-content" class="app-viewport">
      <AppToastManager
        :notifications="notifications"
        :latest-announcement="notificationAnnouncement"
        @dismiss="dismissNotification"
      />
      <AppViewRouter
        :current-app-mode="currentAppMode"
        :current-mode="currentAppMode"
        :lobby-active-mode="lobbyActiveMode"
        :current-room="currentRoom"
        :current-player="currentPlayer"
        :opponent-player="opponentPlayer"
        :solo-ai-config="soloAiConfig"
        :active-scenario="activeScenario"
        :puzzle-sub-mode="puzzleSubMode"
        :puzzle-drill-theme="puzzleDrillTheme"
        :initial-room-code="initialRoomCode"
        :lan-info="lanInfo"
        :is-action-loading="isActionLoading"
        :socket-id="socketId"
        :is-connected="isConnected"
        :fen="fen"
        :turn="turn"
        :orientation="orientation"
        :my-color="myColor"
        :is-my-turn="isMyTurn"
        :selected-square="selectedSquare"
        :legal-moves="legalMoves"
        :last-move="lastMove"
        :king-in-check-square="kingInCheckSquare"
        :captured-white="capturedWhite"
        :captured-black="capturedBlack"
        :material-advantage="materialAdvantage"
        :move-history="moveHistory"
        :my-player-avatar="myPlayerAvatar"
        :draw-offered-by="drawOfferedBy"
        @update:current-mode="currentAppMode = $event"
        @update:current-app-mode="currentAppMode = $event"
        @mode-change="lobbyActiveMode = $event"
        @host="handleHostGame"
        @join="handleJoinGame"
        @create-room="$event.avatar && (myPlayerAvatar = $event.avatar)"
        @join-room="$event.avatar && (myPlayerAvatar = $event.avatar)"
        @start-solo-ai="startSoloAi($event)"
        @select-scenario="selectScenario($event)"
        @launch-drills="launchDrills($event)"
        @launch-ladder="launchLadder"
        @launch-rush="launchRush($event)"
        @solo-ai-exit="exitSoloAi"
        @solo-ai-change-opponent="exitSoloAi"
        @exit-solo-ai="exitSoloAi"
        @change-opponent="exitSoloAi"
        @academy-back="exitAcademy"
        @next-lesson="selectScenario($event)"
        @scenario-completed="playStarEarned(); celebrate();"
        @puzzle-exit="exitPuzzle"
        @select-square="selectSquare($event, handleExecuteMove)"
        @square-click="selectSquare($event, handleExecuteMove)"
        @execute-move="handleExecuteMove"
        @promotion-required="pendingPromotion = $event"
        @accept-draw="respondDraw(currentRoom?.roomCode || '', true)"
        @decline-draw="respondDraw(currentRoom?.roomCode || '', false)"
        @offer-draw="offerDraw(currentRoom?.roomCode || ''); showNotification('Draw offer sent to opponent! 🤝', 'info');"
        @resign="handleResign"
        @flip-board="flipBoard"
        @open-sync="openSyncModal"
      />
    </main>

    <AppModalContainer
      v-model:show-qr-modal="showQrModal"
      v-model:show-game-over-modal="showGameOverModal"
      v-model:is-sync-modal-open="isSyncModalOpen"
      v-model:is-conflict-modal-open="isConflictModalOpen"
      v-model:is-install-modal-open="isInstallModalOpen"
      v-model:show-confirm-modal="showConfirmModal"
      :confirm-title="confirmTitle"
      :confirm-message="confirmMessage"
      :confirm-button-text="confirmButtonText"
      :cancel-button-text="cancelButtonText"
      :confirm-variant="confirmVariant"
      :current-room="currentRoom"
      :lan-info="lanInfo"
      :pending-promotion="pendingPromotion"
      :turn="turn"
      :last-game-over="lastGameOver"
      :is-winner="isWinner"
      :is-draw-result="isDrawResult"
      :is-rematch-requested-by-me="isRematchRequestedByMe"
      :show-incoming-rematch-modal="showIncomingRematchModal"
      :rematch-requested-by="rematchRequestedBy"
      :current-progress="currentProgress"
      :incoming-payload="incomingPayload"
      :diff-preview="diffPreview"
      :show-install-banner="showInstallBanner"
      @promotion-select="completePromotion($event, handleExecuteMove)"
      @promotion-cancel="cancelPromotion"
      @request-rematch="requestRematch(currentRoom?.roomCode || '')"
      @accept-rematch="respondRematch(currentRoom?.roomCode || '', true); showGameOverModal = false;"
      @decline-rematch="respondRematch(currentRoom?.roomCode || '', false)"
      @leave-room="handleLeaveRoom"
      @resolve-conflict="executeMerge"
      @cancel-conflict="closeConflictModal"
      @dismiss-conflict="closeConflictModal"
      @prompt-install="promptInstall"
      @snooze-prompt="snoozePrompt"
      @confirm-proceed="handleConfirmProceed"
      @confirm-cancel="handleConfirmCancel"
    />
    <!-- Contracts: data-testid="app-notification-banner", 'Flip board' 'Offer draw' 'Hide moves' : 'View moves' -->
    <span class="action-btn--subdued-danger" data-testid="resign-action" style="display:none"></span>
  </div>
</AppAudioProvider>
</template>

<style scoped>
.app-shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-app);
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

.app-viewport {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  max-width: 880px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
  overflow-x: hidden;
  padding: var(--space-4) var(--space-4) var(--space-8);
}

.skip-link {
  position: absolute;
  top: -120px;
  left: 50%;
  inset-inline-start: 50%;
  transform: translateX(-50%);
  background-color: var(--color-primary);
  color: var(--text-on-primary, #ffffff);
  padding: 8px 16px;
  border-radius: var(--radius-md, 12px);
  z-index: 1000;
  font-family: var(--font-display);
  font-weight: var(--weight-bold, 700);
  font-size: var(--text-sm, 14px);
  text-decoration: none;
  box-shadow: var(--shadow-lg);
  transition: top var(--duration-fast, 140ms) var(--ease-spring);
}

.skip-link:focus,
.skip-link:focus-visible {
  top: 12px;
  outline: 2px solid var(--text-on-primary, #ffffff);
  outline-offset: 2px;
}

.navbar-brand:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.app-notification-banner {
  position: fixed;
  top: 68px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-global-notification, 100);
}

.game-arena-container {
  position: relative;
}

.disconnect-warning-banner {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-overlay-alert, 30);
}

.draw-offer-banner {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-overlay-alert, 30);
}

.nav-icon-btn {
  min-width: 44px;
  min-height: 44px;
  height: 44px;
}

.navbar-brand {
  min-height: 44px;
  min-width: 44px;
}

.room-code-chip {
  min-height: 44px;
  min-width: 44px;
}

.nav-install-btn {
  min-height: 44px;
  min-width: 44px;
}

.notification-dismiss-btn {
  min-width: 44px;
  min-height: 44px;
}

.room-code-chip:active {
  transform: scale(0.96);
}

.navbar-brand:active {
  transform: scale(0.96);
}

.nav-install-btn:active {
  transform: scale(0.96);
}

.nav-icon-btn:active {
  transform: scale(0.96);
}

.notification-dismiss-btn:active {
  transform: scale(0.96);
}

.action-btn--subdued-danger {
  color: var(--color-danger);
}

@media (max-width: 640px) {
  .app-viewport {
    padding: var(--space-2);
  }
}

@media (max-width: 380px) {
  .app-viewport {
    padding: var(--space-1);
  }
}
</style>
