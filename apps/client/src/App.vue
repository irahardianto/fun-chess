<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { AppNavbar, AppViewRouter, AppToastManager, AppModalContainer, AppAudioProvider, AppPwaManager, useTheme, useNotification } from '@/components/layout';
import { useModalManager, useAppNavigation, useGameConfirmation, useGameSessionSync } from '@/components/layout/composables';
import { usePwaInstall } from '@/features/pwa';
import { useProgressSync } from '@/features/portability';
import { useSocket, useChessGame, useConfetti } from '@/composables';
import { useInjectApiClient, useInjectStorage, useInjectLogger } from '@/platform/di';
import { defaultLocalStorageProgressStore } from '@/features/scenarios';

const apiClient = useInjectApiClient(), safeLocalStorage = useInjectStorage(), logger = useInjectLogger();
const audioProviderRef = ref<InstanceType<typeof AppAudioProvider> | null>(null);
const { isDarkMode, toggleTheme, initTheme } = useTheme();
const { notifications, notificationAnnouncement, showNotification, dismissNotification } = useNotification();
const { celebrate } = useConfetti();
const { canInstall, isStandalone, promptInstall, snoozePrompt, isInstallModalOpen, showInstallBanner } = usePwaInstall();
const { isSyncModalOpen, isConflictModalOpen, diffPreview, currentProgress, incomingPayload, openSyncModal, closeConflictModal, executeMerge } = useProgressSync();
const modalManager = useModalManager({ playClick: () => audioProviderRef.value?.playClick() });
const socketApi = useSocket(), chessEngine = useChessGame();

const navigation = useAppNavigation({ storage: safeLocalStorage, apiClient, logger, onLeaveRoom: () => handleLeaveRoom(), playStart: () => audioProviderRef.value?.playStart() });
const { handleLeaveRoom, handleResign, handleOfferDraw } = useGameConfirmation({
  currentRoom: socketApi.currentRoom,
  currentAppMode: navigation.currentAppMode,
  showGameOverModal: modalManager.showGameOverModal,
  leaveRoom: socketApi.leaveRoom,
  resign: socketApi.resign,
  offerDraw: (roomCode: string) => {
    socketApi.offerDraw(roomCode);
    showNotification('Draw offer sent to opponent! 🤝', 'info');
  },
  requestConfirmation: modalManager.requestConfirmation,
});
const gameSession = useGameSessionSync({ audioProviderRef, socketApi, chessEngine, modalManager, navigation, celebrate, showNotification, safeLocalStorage });

onMounted(async () => {
  initTheme();
  socketApi.connect();
  try {
    await navigation.loadInitialNetworkAndProgress(defaultLocalStorageProgressStore);
  } catch (err: unknown) {
    logger.warn('Failed to load initial network and progress on mount', {
      operation: 'app_mount_load_initial_progress',
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

defineExpose({
  showNotification, dismissNotification, isDarkMode, toggleTheme, currentAppMode: navigation.currentAppMode,
  handleNavbarBrandClick: () => navigation.handleNavbarBrandClick(Boolean(socketApi.currentRoom.value)),
  handleResign, handleLeaveRoom, handleOfferDraw, showConfirmModal: modalManager.showConfirmModal,
  handleConfirmProceed: modalManager.handleConfirmProceed, handleConfirmCancel: modalManager.handleConfirmCancel,
  puzzleSubMode: navigation.puzzleSubMode, lobbyActiveMode: navigation.lobbyActiveMode,
});
</script>

<template>
  <AppAudioProvider ref="audioProviderRef" :socket-api="socketApi" v-slot="{ isMuted: audioMuted, toggleMute: audioToggleMute }">
    <div class="app-shell" data-testid="app-shell">
      <a href="#main-content" class="skip-link">Skip to main content</a>
      <AppPwaManager :current-app-mode="navigation.currentAppMode.value" :is-room-active="Boolean(socketApi.currentRoom.value)" />
      <div class="sr-only" role="status" aria-live="polite">{{ notificationAnnouncement }}</div>
      <AppNavbar
        :is-dark-mode="isDarkMode" :is-muted="audioMuted"
        :can-install="canInstall && !isStandalone && !socketApi.currentRoom.value && navigation.currentAppMode.value === 'lobby'"
        :current-room="socketApi.currentRoom.value" :current-player="socketApi.currentPlayer.value"
        :current-app-mode="navigation.currentAppMode.value" :is-my-turn="chessEngine.isMyTurn.value"
        :active-scenario="navigation.activeScenario.value" :puzzle-sub-mode="navigation.puzzleSubMode.value"
        @toggle-theme="toggleTheme" @toggle-mute="audioToggleMute" @install-pwa="promptInstall" @prompt-install="promptInstall"
        @navigate-home="navigation.handleNavbarBrandClick(Boolean(socketApi.currentRoom.value))"
        @open-qr="modalManager.showQrModal.value = true" @leave-room="handleLeaveRoom"
        @exit-solo-ai="navigation.exitSoloAi" @exit-academy="navigation.exitAcademy" @exit-puzzle="navigation.exitPuzzle" @open-sync="openSyncModal"
      />
      <main id="main-content" class="app-viewport">
        <AppToastManager :notifications="notifications" :latest-announcement="notificationAnnouncement" @dismiss="dismissNotification" />
        <AppViewRouter
          :current-app-mode="navigation.currentAppMode.value"
          :lobby-active-mode="navigation.lobbyActiveMode.value" :current-room="socketApi.currentRoom.value"
          :current-player="socketApi.currentPlayer.value" :opponent-player="gameSession.opponentPlayer.value"
          :solo-ai-config="navigation.soloAiConfig.value" :active-scenario="navigation.activeScenario.value"
          :puzzle-sub-mode="navigation.puzzleSubMode.value" :puzzle-drill-theme="navigation.puzzleDrillTheme.value"
          :initial-room-code="navigation.initialRoomCode.value" :lan-info="navigation.lanInfo.value"
          :is-action-loading="navigation.isActionLoading.value" :socket-id="socketApi.socketId.value"
          :is-connected="socketApi.isConnected.value" :fen="chessEngine.fen.value" :turn="chessEngine.turn.value"
          :orientation="chessEngine.orientation.value" :my-color="chessEngine.myColor.value"
          :is-my-turn="chessEngine.isMyTurn.value" :selected-square="chessEngine.selectedSquare.value"
          :legal-moves="chessEngine.legalMoves.value" :last-move="chessEngine.lastMove.value"
          :king-in-check-square="chessEngine.kingInCheckSquare.value" :captured-white="chessEngine.capturedWhite.value"
          :captured-black="chessEngine.capturedBlack.value" :material-advantage="chessEngine.materialAdvantage.value"
          :move-history="chessEngine.moveHistory.value" :my-player-avatar="navigation.myPlayerAvatar.value"
          :draw-offered-by="socketApi.drawOfferedBy.value"
          @update:current-app-mode="navigation.currentAppMode.value = $event"
          @mode-change="navigation.lobbyActiveMode.value = $event" @host="gameSession.handleHostGame" @join="gameSession.handleJoinGame"
          @create-room="$event.avatar && (navigation.myPlayerAvatar.value = $event.avatar)" @join-room="$event.avatar && (navigation.myPlayerAvatar.value = $event.avatar)"
          @start-solo-ai="navigation.startSoloAi($event)" @select-scenario="navigation.selectScenario($event)"
          @launch-drills="navigation.launchDrills($event)" @launch-ladder="navigation.launchLadder" @launch-rush="navigation.launchRush($event)"
          @solo-ai-exit="navigation.exitSoloAi" @solo-ai-change-opponent="navigation.exitSoloAi"
          @academy-back="navigation.exitAcademy" @next-lesson="navigation.selectScenario($event)"
          @scenario-completed="gameSession.playStarEarned(); celebrate();" @puzzle-exit="navigation.exitPuzzle"
          @select-square="chessEngine.selectSquare($event, gameSession.handleExecuteMove)"
          @execute-move="gameSession.handleExecuteMove" @promotion-required="chessEngine.pendingPromotion.value = $event"
          @accept-draw="socketApi.respondDraw(socketApi.currentRoom.value?.roomCode || '', true)"
          @decline-draw="socketApi.respondDraw(socketApi.currentRoom.value?.roomCode || '', false)"
          @offer-draw="socketApi.offerDraw(socketApi.currentRoom.value?.roomCode || ''); showNotification('Draw offer sent to opponent! 🤝', 'info');"
          @resign="handleResign" @flip-board="chessEngine.flipBoard" @open-sync="openSyncModal"
        />
      </main>
      <AppModalContainer
        v-model:show-qr-modal="modalManager.showQrModal.value" v-model:show-game-over-modal="modalManager.showGameOverModal.value"
        v-model:is-sync-modal-open="isSyncModalOpen" v-model:is-conflict-modal-open="isConflictModalOpen"
        v-model:is-install-modal-open="isInstallModalOpen" v-model:show-confirm-modal="modalManager.showConfirmModal.value"
        :confirm-title="modalManager.confirmTitle.value" :confirm-message="modalManager.confirmMessage.value"
        :confirm-button-text="modalManager.confirmButtonText.value" :cancel-button-text="modalManager.cancelButtonText.value"
        :confirm-variant="modalManager.confirmVariant.value" :current-room="socketApi.currentRoom.value"
        :lan-info="navigation.lanInfo.value" :pending-promotion="chessEngine.pendingPromotion.value"
        :turn="chessEngine.turn.value" :last-game-over="socketApi.lastGameOver.value"
        :is-winner="gameSession.isWinner.value" :is-draw-result="gameSession.isDrawResult.value"
        :is-rematch-requested-by-me="gameSession.isRematchRequestedByMe.value"
        :show-incoming-rematch-modal="gameSession.showIncomingRematchModal.value"
        :rematch-requested-by="socketApi.rematchRequestedBy.value" :current-progress="currentProgress"
        :incoming-payload="incomingPayload" :diff-preview="diffPreview" :show-install-banner="showInstallBanner"
        @promotion-select="chessEngine.completePromotion($event, gameSession.handleExecuteMove)" @promotion-cancel="chessEngine.cancelPromotion"
        @request-rematch="socketApi.requestRematch(socketApi.currentRoom.value?.roomCode || '')"
        @accept-rematch="socketApi.respondRematch(socketApi.currentRoom.value?.roomCode || '', true); modalManager.showGameOverModal.value = false;"
        @decline-rematch="socketApi.respondRematch(socketApi.currentRoom.value?.roomCode || '', false)"
        @leave-room="handleLeaveRoom" @resolve-conflict="executeMerge" @cancel-conflict="closeConflictModal" @dismiss-conflict="closeConflictModal"
        @prompt-install="promptInstall" @snooze-prompt="snoozePrompt"
        @confirm-proceed="modalManager.handleConfirmProceed" @confirm-cancel="modalManager.handleConfirmCancel"
      />
      <!-- Contracts: data-testid="app-notification-banner", 'Flip board' 'Offer draw' 'Hide moves' : 'View moves' -->
      <span class="action-btn--subdued-danger" data-testid="resign-action" style="display:none"></span>
    </div>
  </AppAudioProvider>
</template>

<style scoped>
.app-shell { min-height: 100dvh; display: flex; flex-direction: column; background-color: var(--bg-app); width: 100%; max-width: 100vw; overflow-x: hidden; scrollbar-gutter: stable; }
.app-viewport { display: flex; flex-direction: column; justify-content: flex-start; max-width: 880px; width: 100%; margin: 0 auto; box-sizing: border-box; overflow-x: hidden; padding: var(--space-4) var(--space-4) var(--space-8); }
.skip-link { position: absolute; top: -120px; left: 50%; inset-inline-start: 50%; transform: translateX(-50%); background-color: var(--color-primary); color: var(--text-on-primary, #ffffff); padding: 8px 16px; border-radius: var(--radius-md, 12px); z-index: 1000; font-family: var(--font-display); font-weight: var(--weight-bold, 700); font-size: var(--text-sm, 14px); text-decoration: none; box-shadow: var(--shadow-lg); transition: top var(--duration-fast, 140ms) var(--ease-spring); }
.skip-link:focus, .skip-link:focus-visible { top: 12px; outline: 2px solid var(--text-on-primary, #ffffff); outline-offset: 2px; }
.navbar-brand:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.app-notification-banner { position: fixed; top: 68px; left: 50%; transform: translateX(-50%); z-index: var(--z-global-notification, 100); }
.game-arena-container { position: relative; }
.disconnect-warning-banner { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: var(--z-overlay-alert, 30); }
.draw-offer-banner { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: var(--z-overlay-alert, 30); }
.nav-icon-btn { min-width: 44px; min-height: 44px; height: 44px; }
.navbar-brand { min-height: 44px; min-width: 44px; }
.room-code-chip { min-height: 44px; min-width: 44px; }
.nav-install-btn { min-height: 44px; min-width: 44px; }
.notification-dismiss-btn { min-width: 44px; min-height: 44px; }
.room-code-chip:active { transform: scale(0.96); }
.navbar-brand:active { transform: scale(0.96); }
.nav-install-btn:active { transform: scale(0.96); }
.nav-icon-btn:active { transform: scale(0.96); }
.notification-dismiss-btn:active { transform: scale(0.96); }
.action-btn--subdued-danger { color: var(--color-danger); }
@media (max-width: 640px) { .app-viewport { padding: var(--space-2); } }
@media (max-width: 380px) { .app-viewport { padding: var(--space-1); } }
</style>
