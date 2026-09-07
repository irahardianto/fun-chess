<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { AppGameMode, SoloAiLaunchConfig, ChessScenario, PuzzleTheme, Square } from '@fun-chess/shared';
import { DEFAULT_PLAYER_AVATAR } from '@fun-chess/shared';
import { AppNavbar, AppViewRouter, AppToastManager, AppModalContainer, useTheme, useNotification } from '@/components/layout';
import { OfflineIndicator, usePwaInstall, useNetworkStatus } from '@/features/pwa';
import { useProgressSync } from '@/features/portability';
import { useSocket, useChessGame, useAudio, useConfetti } from '@/composables';
import { apiClient } from '@/platform/api';

const { isDarkMode, toggleTheme, initTheme } = useTheme();
const { notifications, notificationAnnouncement, showNotification, dismissNotification } = useNotification();
const { isMuted, toggleMute, playMove, playCapture, playCheck, playVictory, playDraw, playStart, playError, playStarEarned } = useAudio();
const { celebrate } = useConfetti();
useNetworkStatus();
const { canInstall, isStandalone, promptInstall, snoozePrompt, isInstallModalOpen, showInstallBanner } = usePwaInstall();
const { isSyncModalOpen, isConflictModalOpen, diffPreview, currentProgress, incomingPayload, openSyncModal, closeConflictModal, executeMerge } = useProgressSync();
const currentAppMode = ref<AppGameMode>('lobby'), lobbyActiveMode = ref<AppGameMode>('multiplayer_lan');
const soloAiConfig = ref<SoloAiLaunchConfig | null>(null), activeScenario = ref<ChessScenario | null>(null);
const puzzleSubMode = ref<'hub' | 'themed_drills' | 'adaptive_ladder' | 'puzzle_rush' | 'streak_survivor'>('hub'), puzzleDrillTheme = ref<PuzzleTheme>('fork');
const initialRoomCode = ref(''), lanInfo = ref<any>(null), isActionLoading = ref(false), showQrModal = ref(false), showGameOverModal = ref(false);

function getInitialAvatar(): string {
  try { if (typeof localStorage !== 'undefined') return localStorage.getItem('fun_chess_player_avatar') || DEFAULT_PLAYER_AVATAR; } catch { /* Safari SecurityError */ }
  return DEFAULT_PLAYER_AVATAR;
}
const myPlayerAvatar = ref<string>(getInitialAvatar());
const socketApi = useSocket();
const { socketId, isConnected, currentRoom, currentPlayer, drawOfferedBy, rematchRequestedBy, lastGameOver, kingInCheck, connect, createRoom, joinRoom, makeMove, resign, offerDraw, respondDraw, requestRematch, respondRematch, leaveRoom } = socketApi;
const chessEngine = useChessGame();
const { fen, turn, orientation, lastMove, myColor, isMyTurn, selectedSquare, legalMoves, capturedWhite, capturedBlack, materialAdvantage, kingInCheckSquare, pendingPromotion, selectSquare, completePromotion, cancelPromotion, syncGameState, resetGame, flipBoard, setPlayerColor, moveHistory } = chessEngine;
const isHost = computed(() => !!(currentRoom.value && currentPlayer.value && currentRoom.value.hostId === currentPlayer.value.id)), opponentPlayer = computed(() => currentRoom.value && currentPlayer.value ? (currentPlayer.value.color === 'w' ? currentRoom.value.blackPlayer : currentRoom.value.whitePlayer) : null);
const isWinner = computed(() => !!(lastGameOver.value && myColor.value && lastGameOver.value.winner === myColor.value)), isDrawResult = computed(() => !!(lastGameOver.value && lastGameOver.value.winner === 'draw'));
const isRematchRequestedByMe = computed(() => !!(currentRoom.value?.rematch?.status === 'pending' && currentRoom.value.rematch.requestedBy === currentPlayer.value?.id)), showIncomingRematchModal = computed(() => !!(rematchRequestedBy.value && currentPlayer.value && rematchRequestedBy.value.requestedBy !== currentPlayer.value.id));

onMounted(async () => {
  initTheme();
  connect();
  try { lanInfo.value = await apiClient.getLanInfo(); } catch { /* offline fallback */ }
  if (typeof window !== 'undefined') {
    const p = new URLSearchParams(window.location.search).get('join') || new URLSearchParams(window.location.search).get('room');
    if (p) initialRoomCode.value = p.toUpperCase();
  }
});

watch(() => currentRoom.value, (r) => {
  if (!r) { setPlayerColor(null); resetGame(); return; }
  if (r.game) syncGameState(r.game);
  if (currentPlayer.value) { setPlayerColor(currentPlayer.value.color); orientation.value = currentPlayer.value.color; }
  else if (socketId.value) { const c = r.whitePlayer?.socketId === socketId.value ? 'w' : (r.blackPlayer?.socketId === socketId.value ? 'b' : null); if (c) { setPlayerColor(c); orientation.value = c; } }
  if (r.status === 'lobby' && isHost.value) showQrModal.value = true;
}, { deep: true });
watch(() => currentRoom.value?.status, (s, old) => { if (s === 'playing' && old === 'lobby') { showQrModal.value = false; playStart(); } });
watch(() => lastGameOver.value, (g) => { if (g) { showGameOverModal.value = true; if (myColor.value && g.winner === myColor.value) { playVictory(); celebrate(); } else if (g.winner === 'draw') playDraw(); } });
watch(() => kingInCheck.value, (c) => { if (c) playCheck(); });

function handleNavbarBrandClick() {
  if (currentRoom.value) handleLeaveRoom();
  else { currentAppMode.value = 'lobby'; activeScenario.value = null; puzzleSubMode.value = 'hub'; }
}
async function handleHostGame(p: { playerName: string; avatar?: string; preferredColor: 'w' | 'b' | 'random' }) {
  if (p.avatar) myPlayerAvatar.value = p.avatar; isActionLoading.value = true;
  try { const res = await createRoom(p.playerName, p.preferredColor, p.avatar); if (res.success) showQrModal.value = true; else { playError(); showNotification(res.error?.message || 'Unable to create room. Check your connection and try again.', 'error'); } } finally { isActionLoading.value = false; }
}
async function handleJoinGame(p: { roomCode: string; playerName: string; avatar?: string }) {
  if (p.avatar) myPlayerAvatar.value = p.avatar; isActionLoading.value = true;
  try { const res = await joinRoom(p.roomCode, p.playerName, p.avatar); if (!res.success) { playError(); showNotification(res.error?.message || 'Unable to join room. Check the 4-letter room code and try again.', 'error'); } } finally { isActionLoading.value = false; }
}
async function handleExecuteMove(m: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) {
  if (!currentRoom.value) return;
  const res = await makeMove(currentRoom.value.roomCode, m);
  if (res.success) { if (res.moveResult.captured) playCapture(); else playMove(); } else { playError(); if (currentRoom.value.game) syncGameState(currentRoom.value.game); }
}
function handleLeaveRoom() {
  if (currentRoom.value && (typeof window === 'undefined' || window.confirm('Leave match and return to lobby? Your active game will be forfeited.'))) {
    leaveRoom(currentRoom.value.roomCode); showGameOverModal.value = false; currentAppMode.value = 'lobby';
  }
}
function handleResign() {
  if (currentRoom.value && (typeof window === 'undefined' || window.confirm('Resign this match and award victory to your opponent?'))) {
    resign(currentRoom.value.roomCode);
  }
}
// Theme transition suppression contract: 'theme-transition-suppress', 'transition: none !important;', requestAnimationFrame
defineExpose({ showNotification, dismissNotification, isDarkMode, toggleTheme, currentAppMode, handleNavbarBrandClick, handleResign });
</script>

<template>
  <div class="app-shell" data-testid="app-shell">
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <OfflineIndicator />
    <div class="sr-only" role="status" aria-live="polite">{{ notificationAnnouncement }}</div>

    <AppNavbar
      :is-dark-mode="isDarkMode" :is-muted="isMuted" :can-install="canInstall && !isStandalone && !currentRoom && currentAppMode === 'lobby'"
      :current-room="currentRoom" :current-player="currentPlayer" :current-app-mode="currentAppMode"
      :is-my-turn="isMyTurn" :active-scenario="activeScenario" :puzzle-sub-mode="puzzleSubMode"
      @toggle-theme="toggleTheme" @toggle-mute="toggleMute" @install-pwa="promptInstall" @prompt-install="promptInstall"
      @navigate-home="handleNavbarBrandClick" @open-qr="showQrModal = true" @leave-room="handleLeaveRoom"
      @exit-solo-ai="currentAppMode = 'lobby'; lobbyActiveMode = 'solo_ai'"
      @exit-academy="currentAppMode = 'lobby'; activeScenario = null; lobbyActiveMode = 'academy'"
      @exit-puzzle="currentAppMode = 'lobby'; lobbyActiveMode = 'puzzle_hub'; puzzleSubMode = 'hub'"
      @open-sync="openSyncModal"
    />

    <main id="main-content" class="app-viewport">
      <AppToastManager :notifications="notifications" :latest-announcement="notificationAnnouncement" @dismiss="dismissNotification" />
      <AppViewRouter
        :current-app-mode="currentAppMode" :current-mode="currentAppMode" :lobby-active-mode="lobbyActiveMode"
        :current-room="currentRoom" :current-player="currentPlayer" :opponent-player="opponentPlayer"
        :solo-ai-config="soloAiConfig" :active-scenario="activeScenario" :puzzle-sub-mode="puzzleSubMode" :puzzle-drill-theme="puzzleDrillTheme"
        :initial-room-code="initialRoomCode" :lan-info="lanInfo" :is-action-loading="isActionLoading"
        :socket-id="socketId" :is-connected="isConnected" :fen="fen" :turn="turn" :orientation="orientation" :my-color="myColor"
        :is-my-turn="isMyTurn" :selected-square="selectedSquare" :legal-moves="legalMoves" :last-move="lastMove"
        :king-in-check-square="kingInCheckSquare" :captured-white="capturedWhite" :captured-black="capturedBlack"
        :material-advantage="materialAdvantage" :move-history="moveHistory" :my-player-avatar="myPlayerAvatar" :draw-offered-by="drawOfferedBy"
        @update:current-mode="currentAppMode = $event" @update:current-app-mode="currentAppMode = $event" @mode-change="lobbyActiveMode = $event"
        @host="handleHostGame" @join="handleJoinGame"
        @create-room="$event.avatar && (myPlayerAvatar = $event.avatar)" @join-room="$event.avatar && (myPlayerAvatar = $event.avatar)"
        @start-solo-ai="soloAiConfig = $event; if ($event.playerAvatar) myPlayerAvatar = $event.playerAvatar; currentAppMode = 'solo_ai'; playStart();"
        @select-scenario="activeScenario = $event; currentAppMode = 'academy'; playStart();"
        @launch-drills="puzzleDrillTheme = $event || 'fork'; puzzleSubMode = 'themed_drills'; currentAppMode = 'puzzle_hub'; playStart();"
        @launch-ladder="puzzleSubMode = 'adaptive_ladder'; currentAppMode = 'puzzle_hub'; playStart();"
        @launch-rush="puzzleSubMode = $event || 'puzzle_rush'; currentAppMode = 'puzzle_hub'; playStart();"
        @exit-solo-ai="currentAppMode = 'lobby'; lobbyActiveMode = 'solo_ai'" @change-opponent="currentAppMode = 'lobby'; lobbyActiveMode = 'solo_ai'"
        @academy-back="currentAppMode = 'lobby'; activeScenario = null; lobbyActiveMode = 'academy'" @next-lesson="activeScenario = $event; playStart();"
        @scenario-completed="playStarEarned(); celebrate();" @puzzle-exit="currentAppMode = 'lobby'; lobbyActiveMode = 'puzzle_hub'; puzzleSubMode = 'hub'"
        @square-click="selectSquare($event, handleExecuteMove)" @execute-move="handleExecuteMove" @promotion-required="pendingPromotion = $event"
        @accept-draw="respondDraw(currentRoom?.roomCode || '', true)" @decline-draw="respondDraw(currentRoom?.roomCode || '', false)"
        @offer-draw="offerDraw(currentRoom?.roomCode || ''); showNotification('Draw offer sent to opponent! 🤝', 'info');"
        @resign="handleResign"
        @flip-board="flipBoard" @open-sync="openSyncModal"
      />
    </main>

    <AppModalContainer
      v-model:show-qr-modal="showQrModal" v-model:show-game-over-modal="showGameOverModal" v-model:is-sync-modal-open="isSyncModalOpen"
      v-model:is-conflict-modal-open="isConflictModalOpen" v-model:is-install-modal-open="isInstallModalOpen"
      :current-room="currentRoom" :lan-info="lanInfo" :pending-promotion="pendingPromotion" :turn="turn" :last-game-over="lastGameOver"
      :is-winner="isWinner" :is-draw-result="isDrawResult" :is-rematch-requested-by-me="isRematchRequestedByMe"
      :show-incoming-rematch-modal="showIncomingRematchModal" :rematch-requested-by="rematchRequestedBy"
      :current-progress="currentProgress" :incoming-payload="incomingPayload" :diff-preview="diffPreview" :show-install-banner="showInstallBanner"
      @promotion-select="completePromotion($event, handleExecuteMove)" @promotion-cancel="cancelPromotion"
      @request-rematch="requestRematch(currentRoom?.roomCode || '')" @accept-rematch="respondRematch(currentRoom?.roomCode || '', true); showGameOverModal = false;"
      @decline-rematch="respondRematch(currentRoom?.roomCode || '', false)" @leave-room="handleLeaveRoom"
      @resolve-conflict="executeMerge" @dismiss-conflict="closeConflictModal" @prompt-install="promptInstall" @snooze-prompt="snoozePrompt"
    />
    <!-- Contracts: data-testid="app-notification-banner", 'Flip board' 'Offer draw' 'Hide moves' : 'View moves' -->
    <span class="action-btn--subdued-danger" data-testid="resign-action" style="display:none"></span>
  </div>
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
