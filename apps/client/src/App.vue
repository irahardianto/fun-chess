<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type {
  Square,
  LanInfoResponse,
  AppGameMode,
  SoloAiLaunchConfig,
  ChessScenario,
} from '@fun-chess/shared';
import {
  DEFAULT_PLAYER_AVATAR,
} from '@fun-chess/shared';
import { BaseButton } from '@/components/base';
import { ChessBoard } from '@/features/board';
import { PlayerBadge, CapturedTray, MoveHistoryList } from '@/features/hud';
import { LobbyView, QrCodeModal } from '@/features/lobby';
import { SoloAiArena } from '@/features/ai';
import { ScenarioArena } from '@/features/scenarios';
import { PuzzleArena, PuzzleRushArena } from '@/features/puzzles';
import { PromotionModal, GameOverModal, RematchModal } from '@/features/modals';
import {
  OfflineIndicator,
  PwaInstallBanner,
  PwaInstallModal,
  usePwaInstall,
  useNetworkStatus,
} from '@/features/pwa';
import {
  ProgressSyncModal,
  ProgressConflictModal,
  useProgressSync,
} from '@/features/portability';
import { useSocket, useChessGame, useAudio, useConfetti } from '@/composables';
import type { PuzzleTheme } from '@fun-chess/shared';

// --- Theme Management ---
const isDarkMode = ref(false);

function applyTheme(dark: boolean) {
  isDarkMode.value = dark;
  if (typeof document !== 'undefined') {
    // Suppress CSS transitions temporarily during theme switch to prevent visual smearing
    const style = document.createElement('style');
    style.id = 'theme-transition-suppress';
    style.appendChild(
      document.createTextNode('*, *::before, *::after { transition: none !important; }')
    );
    document.head.appendChild(style);

    if (dark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    // Synchronize <meta name="theme-color"> with active theme
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', dark ? '#0f0f1b' : '#ffffff');
    }

    // Force layout reflow
    const _flushReflow = document.body.offsetHeight;
    void _flushReflow;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove();
      });
    });
  }
}

function toggleTheme() {
  applyTheme(!isDarkMode.value);
}

// --- Inline Notifications / Error State ---
interface AppNotification {
  id: number;
  type: 'error' | 'info' | 'success';
  message: string;
}

const activeNotification = ref<AppNotification | null>(null);
const notificationAnnouncement = computed(() => activeNotification.value?.message || '');
let notificationTimer: ReturnType<typeof setTimeout> | null = null;

function showNotification(message: string, type: 'error' | 'info' | 'success' = 'info', durationMs = 5000) {
  if (notificationTimer) {
    clearTimeout(notificationTimer);
  }
  activeNotification.value = {
    id: Date.now(),
    type,
    message,
  };
  if (durationMs > 0) {
    notificationTimer = setTimeout(() => {
      activeNotification.value = null;
    }, durationMs);
  }
}

function dismissNotification() {
  if (notificationTimer) {
    clearTimeout(notificationTimer);
  }
  activeNotification.value = null;
}

// --- Audio & FX ---
const {
  isMuted,
  toggleMute,
  playMove,
  playCapture,
  playCheck,
  playVictory,
  playDraw,
  playStart,
  playError,
  playStarEarned,
} = useAudio();
const { celebrate } = useConfetti();

// --- LAN Info State ---
const lanInfo = ref<LanInfoResponse | null>(null);

// --- PWA & Offline Experience ---
useNetworkStatus();
const {
  canInstall,
  isStandalone,
  promptInstall,
  snoozePrompt,
  isInstallModalOpen,
  showInstallBanner,
} = usePwaInstall();

// --- Progress Portability & Sync ---
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

// --- App Shell Routing State ---
const currentAppMode = ref<AppGameMode>('lobby');
const lobbyActiveMode = ref<AppGameMode>('multiplayer_lan');
const soloAiConfig = ref<SoloAiLaunchConfig | null>(null);
const activeScenario = ref<ChessScenario | null>(null);
const puzzleSubMode = ref<'hub' | 'themed_drills' | 'adaptive_ladder' | 'puzzle_rush' | 'streak_survivor'>('hub');
const puzzleDrillTheme = ref<PuzzleTheme>('fork');

// --- Real-Time Socket & Chess Engine ---
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
} = chessEngine;

// --- Local UI States & Modals ---
const myPlayerAvatar = ref<string>(
  typeof localStorage !== 'undefined'
    ? localStorage.getItem('fun_chess_player_avatar') || DEFAULT_PLAYER_AVATAR
    : DEFAULT_PLAYER_AVATAR
);
const showQrModal = ref(false);
const showGameOverModal = ref(false);
const initialRoomCode = ref('');
const isActionLoading = ref(false);
const showHistory = ref(false);

const isHost = computed(() => {
  if (!currentRoom.value || !currentPlayer.value) return false;
  return currentRoom.value.hostId === currentPlayer.value.id;
});

const opponentPlayer = computed(() => {
  if (!currentRoom.value || !currentPlayer.value) return null;
  return currentPlayer.value.color === 'w'
    ? currentRoom.value.blackPlayer
    : currentRoom.value.whitePlayer;
});

const isWinner = computed(() => {
  if (!lastGameOver.value || !myColor.value) return false;
  return lastGameOver.value.winner === myColor.value;
});

const isDrawResult = computed(() => {
  if (!lastGameOver.value) return false;
  return lastGameOver.value.winner === 'draw';
});

const isRematchRequestedByMe = computed(() => {
  if (!currentRoom.value?.rematch || !currentPlayer.value) return false;
  return (
    currentRoom.value.rematch.status === 'pending' &&
    currentRoom.value.rematch.requestedBy === currentPlayer.value.id
  );
});

const showIncomingRematchModal = computed(() => {
  if (!rematchRequestedBy.value || !currentPlayer.value) return false;
  return rematchRequestedBy.value.requestedBy !== currentPlayer.value.id;
});

// --- Lifecycle & Initialization ---
onMounted(async () => {
  // Connect real-time socket
  connect();

  // Fetch host LAN discovery info
  if (typeof fetch !== 'undefined') {
    try {
      const res = await fetch('/api/lan-info');
      if (res.ok) {
        lanInfo.value = await res.json();
      }
    } catch {
      // Offline fallback
    }
  }

  // Read URL query parameter for instant joining
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('join') || params.get('room');
    if (roomParam) {
      initialRoomCode.value = roomParam.toUpperCase();
    }

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme(true);
    }
  }
});

// Sync server game state into client chess engine
watch(
  () => currentRoom.value,
  (newRoom) => {
    if (newRoom) {
      // Sync engine state
      if (newRoom.game) {
        syncGameState(newRoom.game);
      }

      // Determine player color assignment
      if (currentPlayer.value) {
        setPlayerColor(currentPlayer.value.color);
        orientation.value = currentPlayer.value.color;
      } else if (socketId.value) {
        if (newRoom.whitePlayer?.socketId === socketId.value) {
          setPlayerColor('w');
          orientation.value = 'w';
        } else if (newRoom.blackPlayer?.socketId === socketId.value) {
          setPlayerColor('b');
          orientation.value = 'b';
        }
      }

      // Auto-open QR modal when host is waiting in lobby
      if (newRoom.status === 'lobby' && isHost.value) {
        showQrModal.value = true;
      }
    } else {
      setPlayerColor(null);
      resetGame();
    }
  },
  { deep: true }
);

// Watch for game start / rematch start
watch(
  () => currentRoom.value?.status,
  (newStatus, oldStatus) => {
    if (newStatus === 'playing' && oldStatus === 'lobby') {
      showQrModal.value = false;
      playStart();
    }
  }
);

// Watch for game over
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

// Watch for checks
watch(
  () => kingInCheck.value,
  (check) => {
    if (check) {
      playCheck();
    }
  }
);

// --- Mode Navigation Handlers ---
function handleModeChange(mode: AppGameMode) {
  lobbyActiveMode.value = mode;
}

function handleStartSoloAi(config: SoloAiLaunchConfig) {
  soloAiConfig.value = config;
  if (config.playerAvatar) {
    myPlayerAvatar.value = config.playerAvatar;
  }
  currentAppMode.value = 'solo_ai';
  playStart();
}

function handleSoloAiExit() {
  currentAppMode.value = 'lobby';
  lobbyActiveMode.value = 'solo_ai';
}

function handleSoloAiChangeOpponent() {
  currentAppMode.value = 'lobby';
  lobbyActiveMode.value = 'solo_ai';
}

function handleSelectScenario(scenario: ChessScenario) {
  activeScenario.value = scenario;
  currentAppMode.value = 'academy';
  playStart();
}

function handleAcademyBack() {
  currentAppMode.value = 'lobby';
  activeScenario.value = null;
  lobbyActiveMode.value = 'academy';
}

function handleNextLesson(nextScenario: ChessScenario) {
  activeScenario.value = nextScenario;
  playStart();
}

function handleScenarioCompleted(_stars: number) {
  playStarEarned();
  celebrate();
}

function handleLaunchDrills(theme?: PuzzleTheme) {
  puzzleDrillTheme.value = theme || 'fork';
  puzzleSubMode.value = 'themed_drills';
  currentAppMode.value = 'puzzle_hub';
  playStart();
}

function handleLaunchLadder() {
  puzzleSubMode.value = 'adaptive_ladder';
  currentAppMode.value = 'puzzle_hub';
  playStart();
}

function handleLaunchRush(subMode?: 'puzzle_rush' | 'streak_survivor') {
  puzzleSubMode.value = subMode || 'puzzle_rush';
  currentAppMode.value = 'puzzle_hub';
  playStart();
}

function handlePuzzleHubExit() {
  currentAppMode.value = 'lobby';
  lobbyActiveMode.value = 'puzzle_hub';
  puzzleSubMode.value = 'hub';
}

function handleNavbarBrandClick() {
  if (currentRoom.value) {
    handleLeaveRoom();
  } else if (currentAppMode.value === 'solo_ai') {
    handleSoloAiExit();
  } else if (currentAppMode.value === 'academy') {
    handleAcademyBack();
  } else if (currentAppMode.value === 'puzzle_hub') {
    handlePuzzleHubExit();
  }
}

// --- User Actions ---
function handleCreateRoom(payload: { playerName: string; avatar: string; preferredColor: 'w' | 'b' | 'random' }) {
  if (payload.avatar) {
    myPlayerAvatar.value = payload.avatar;
  }
}

function handleJoinRoom(payload: { roomCode: string; playerName: string; avatar: string }) {
  if (payload.avatar) {
    myPlayerAvatar.value = payload.avatar;
  }
}

async function handleHostGame(payload: { playerName: string; avatar?: string; preferredColor: 'w' | 'b' | 'random' }) {
  if (payload.avatar) {
    myPlayerAvatar.value = payload.avatar;
  }
  isActionLoading.value = true;
  try {
    const res = await createRoom(payload.playerName, payload.preferredColor, payload.avatar);
    if (res.success) {
      showQrModal.value = true;
    } else {
      playError();
      showNotification(res.error?.message || 'Unable to create room. Check your connection and try again.', 'error');
    }
  } finally {
    isActionLoading.value = false;
  }
}

async function handleJoinGame(payload: { roomCode: string; playerName: string; avatar?: string }) {
  if (payload.avatar) {
    myPlayerAvatar.value = payload.avatar;
  }
  isActionLoading.value = true;
  try {
    const res = await joinRoom(payload.roomCode, payload.playerName, payload.avatar);
    if (!res.success) {
      playError();
      showNotification(res.error?.message || 'Unable to join room. Check the 4-letter room code and try again.', 'error');
    }
  } finally {
    isActionLoading.value = false;
  }
}

async function handleExecuteMove(move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) {
  if (!currentRoom.value) return;

  const res = await makeMove(currentRoom.value.roomCode, move);
  if (res.success) {
    if (res.moveResult.captured) {
      playCapture();
    } else {
      playMove();
    }
  } else {
    playError();
    // Re-sync on invalid move
    if (currentRoom.value.game) {
      syncGameState(currentRoom.value.game);
    }
  }
}

function handleSquareClick(sq: Square) {
  selectSquare(sq, (move) => {
    handleExecuteMove(move);
  });
}

function handlePromotionRequired(payload: { from: Square; to: Square }) {
  pendingPromotion.value = payload;
}

function handlePromotionSelect(piece: 'q' | 'r' | 'b' | 'n') {
  completePromotion(piece, (move) => {
    handleExecuteMove(move);
  });
}

function handleResign() {
  if (!currentRoom.value) return;
  if (confirm('Resign this match and award victory to your opponent?')) {
    resign(currentRoom.value.roomCode);
  }
}

function handleOfferDraw() {
  if (!currentRoom.value) return;
  offerDraw(currentRoom.value.roomCode);
  showNotification('Draw offer sent to opponent! 🤝', 'info');
}

function handleAcceptDraw() {
  if (!currentRoom.value) return;
  respondDraw(currentRoom.value.roomCode, true);
}

function handleDeclineDraw() {
  if (!currentRoom.value) return;
  respondDraw(currentRoom.value.roomCode, false);
}

function handleRequestRematch() {
  if (!currentRoom.value) return;
  requestRematch(currentRoom.value.roomCode);
}

function handleAcceptRematch() {
  if (!currentRoom.value) return;
  respondRematch(currentRoom.value.roomCode, true);
  showGameOverModal.value = false;
}

function handleDeclineRematch() {
  if (!currentRoom.value) return;
  respondRematch(currentRoom.value.roomCode, false);
}

function handleLeaveRoom() {
  if (!currentRoom.value) return;
  if (confirm('Leave match and return to lobby? Your active game will be forfeited.')) {
    leaveRoom(currentRoom.value.roomCode);
    showGameOverModal.value = false;
    currentAppMode.value = 'lobby';
  }
}
</script>

<template>
  <div class="app-shell" data-testid="app-shell">
    <!-- Accessible Skip to Main Content Link (WCAG 2.4.1) -->
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <!-- Reassuring Offline Status Pill -->
    <OfflineIndicator />

    <!-- Top Global App Bar -->
    <header class="app-navbar">
      <button
        type="button"
        class="navbar-brand"
        title="Fun Chess Home"
        aria-label="Fun Chess Home"
        @click="handleNavbarBrandClick"
      >
        <span class="brand-logo-icon" aria-hidden="true">♟️</span>
        <span class="brand-title">Fun Chess! ✨</span>
      </button>

      <!-- In-Game Header Details -->
      <div v-if="currentRoom" class="room-chip-group">
        <button
          type="button"
          class="room-code-chip"
          data-testid="room-code-chip"
          title="View QR code"
          :aria-label="'View QR code for room ' + (currentRoom?.roomCode || '')"
          @click="showQrModal = true"
        >
          <span class="room-chip-label">Room:</span>
          <span class="room-chip-code">{{ currentRoom.roomCode }}</span>
          <span class="room-chip-icon">📱</span>
        </button>

        <div
          v-if="currentRoom.status === 'playing'"
          class="turn-status-badge desktop-turn-badge"
          :class="{ 'is-my-turn': isMyTurn }"
        >
          {{ isMyTurn ? 'Your Turn! ✨' : 'Thinking... ⏳' }}
        </div>
      </div>

      <!-- Quick Action Controls -->
      <div class="navbar-actions">
        <!-- PWA Install Pill (Mobile/Desktop Lobby only) -->
        <BaseButton
          v-if="canInstall && !isStandalone && !currentRoom && currentAppMode === 'lobby'"
          variant="primary"
          size="sm"
          data-testid="pwa-install-btn"
          class="nav-install-btn"
          aria-label="Install App"
          @click="promptInstall"
        >
          <template #icon-left>📲</template>
          Install App
        </BaseButton>

        <!-- Save & Progress Sync Button -->
        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="save-sync-btn"
          class="nav-icon-btn"
          aria-label="Save & Sync Progress"
          title="Save & Sync Progress"
          @click="openSyncModal"
        >
          <template #icon>⚙️</template>
        </BaseButton>

        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="mute-toggle-btn"
          :aria-label="isMuted ? 'Unmute audio' : 'Mute audio'"
          class="nav-icon-btn"
          @click="toggleMute"
        >
          <template #icon>{{ isMuted ? '🔇' : '🔊' }}</template>
        </BaseButton>

        <BaseButton
          variant="ghost"
          size="sm"
          class="nav-icon-btn"
          :aria-label="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        >
          <template #icon>{{ isDarkMode ? '☀️' : '🌙' }}</template>
        </BaseButton>

        <BaseButton
          v-if="currentRoom"
          variant="ghost"
          size="sm"
          class="nav-icon-btn nav-exit-btn"
          data-testid="leave-room-btn"
          aria-label="Return to Lobby"
          @click="handleLeaveRoom"
        >
          <template #icon>
            <span class="exit-icon">🚪</span>
            <span class="exit-text">Exit</span>
          </template>
        </BaseButton>

        <BaseButton
          v-else-if="currentAppMode === 'solo_ai'"
          variant="ghost"
          size="sm"
          class="nav-icon-btn nav-exit-btn"
          data-testid="exit-solo-ai-btn"
          aria-label="Return to Lobby"
          @click="handleSoloAiExit"
        >
          <template #icon>
            <span class="exit-icon">🚪</span>
            <span class="exit-text">Exit</span>
          </template>
        </BaseButton>

        <BaseButton
          v-else-if="currentAppMode === 'academy' && activeScenario"
          variant="ghost"
          size="sm"
          class="nav-icon-btn nav-exit-btn"
          data-testid="exit-academy-btn"
          aria-label="Return to Academy"
          @click="handleAcademyBack"
        >
          <template #icon>
            <span class="exit-icon">🚪</span>
            <span class="exit-text">Exit</span>
          </template>
        </BaseButton>

        <BaseButton
          v-else-if="currentAppMode === 'puzzle_hub' && puzzleSubMode !== 'hub'"
          variant="ghost"
          size="sm"
          class="nav-icon-btn nav-exit-btn"
          data-testid="exit-puzzle-btn"
          aria-label="Return to Puzzle Hub"
          @click="handlePuzzleHubExit"
        >
          <template #icon>
            <span class="exit-icon">🚪</span>
            <span class="exit-text">Exit</span>
          </template>
        </BaseButton>
      </div>
    </header>

    <!-- Main Dynamic Viewport -->
    <main id="main-content" class="app-viewport">
      <!-- Persistent Live Region for Screen Readers -->
      <div class="sr-only" role="status" aria-live="polite">{{ notificationAnnouncement }}</div>

      <!-- Accessible Inline Notification Banner -->
      <Transition name="notification-slide">
        <div
          v-if="activeNotification"
          class="app-notification-banner"
          :class="`is-${activeNotification.type}`"
          :role="activeNotification.type === 'error' ? 'alert' : 'status'"
          aria-live="polite"
          data-testid="app-notification-banner"
        >
          <span class="notification-icon" aria-hidden="true">
            {{ activeNotification.type === 'error' ? '⚠️' : activeNotification.type === 'success' ? '✅' : 'ℹ️' }}
          </span>
          <span class="notification-message">{{ activeNotification.message }}</span>
          <button
            type="button"
            class="notification-dismiss-btn"
            aria-label="Dismiss notification"
            @click="dismissNotification"
          >
            ✕
          </button>
        </div>
      </Transition>
      <!-- 1. Solo AI Mascot Arena View -->
      <SoloAiArena
        v-if="currentAppMode === 'solo_ai' && soloAiConfig"
        :initial-mascot-id="soloAiConfig.mascotId"
        :initial-player-color="soloAiConfig.playerColor"
        :player-name="soloAiConfig.playerName"
        :player-avatar="soloAiConfig.playerAvatar"
        @exit="handleSoloAiExit"
        @lobby="handleSoloAiExit"
        @change-opponent="handleSoloAiChangeOpponent"
      />

      <!-- 2. Active Academy Scenario Arena View -->
      <ScenarioArena
        v-else-if="currentAppMode === 'academy' && activeScenario"
        :scenario="activeScenario"
        @back="handleAcademyBack"
        @next-lesson="handleNextLesson"
        @completed="handleScenarioCompleted"
      />

      <!-- 3. Active Puzzle Arena (Themed Drills / Adaptive Ladder) -->
      <PuzzleArena
        v-else-if="currentAppMode === 'puzzle_hub' && (puzzleSubMode === 'themed_drills' || puzzleSubMode === 'adaptive_ladder')"
        :mode="puzzleSubMode"
        :initial-theme="puzzleDrillTheme"
        @back="handlePuzzleHubExit"
        @completed="handleScenarioCompleted"
      />

      <!-- 4. Active Puzzle Rush / Streak Survivor Arena -->
      <PuzzleRushArena
        v-else-if="currentAppMode === 'puzzle_hub' && (puzzleSubMode === 'puzzle_rush' || puzzleSubMode === 'streak_survivor')"
        :sub-mode="puzzleSubMode"
        @exit="handlePuzzleHubExit"
        @lobby="handlePuzzleHubExit"
      />

      <!-- 5. LAN Multiplayer Playing Arena View -->
      <div v-else-if="currentRoom && currentRoom.status !== 'lobby'" class="game-arena-container">
        <!-- Disconnect Alert Banner -->
        <div
          v-if="currentRoom.status === 'paused_disconnect'"
          class="disconnect-warning-banner"
          role="alert"
        >
          <span>⚠️ Opponent disconnected. Waiting for reconnection (60s)...</span>
        </div>

        <!-- Draw Offer Alert Banner -->
        <div
          v-if="drawOfferedBy"
          class="draw-offer-banner"
          role="alert"
        >
          <span>🤝 <strong>{{ drawOfferedBy.fromPlayerName }}</strong> offered a peaceful draw!</span>
          <div class="banner-buttons">
            <BaseButton variant="success" size="sm" @click="handleAcceptDraw">Accept draw</BaseButton>
            <BaseButton variant="ghost" size="sm" @click="handleDeclineDraw">Decline draw</BaseButton>
          </div>
        </div>

        <!-- Game Arena Turn Indicator -->
        <div
          v-if="currentRoom.status === 'playing'"
          class="arena-turn-indicator"
          :class="{ 'is-my-turn': isMyTurn }"
          role="status"
          aria-live="polite"
        >
          <span class="turn-indicator-dot"></span>
          <span class="turn-indicator-text">
            {{ isMyTurn ? '✨ Your Turn to Move!' : `⏳ Waiting for ${opponentPlayer?.name || 'Opponent'}...` }}
          </span>
        </div>

        <!-- Top Opponent Status & Captured Pieces Tray -->
        <div class="player-hud-row top-hud">
          <PlayerBadge
            :player-name="opponentPlayer?.name || 'Opponent'"
            :color="opponentPlayer?.color || (myColor === 'w' ? 'b' : 'w')"
            :is-current-turn="turn === (opponentPlayer?.color || 'b')"
            :is-connected="opponentPlayer?.isConnected ?? true"
            :is-host="opponentPlayer?.isHost ?? false"
            :is-self="false"
            :avatar="opponentPlayer?.avatar || '🐼'"
          />
          <CapturedTray
            :captured-pieces="opponentPlayer?.color === 'b' ? capturedWhite : capturedBlack"
            :color="opponentPlayer?.color === 'b' ? 'w' : 'b'"
            :material-advantage="
              opponentPlayer?.color === 'b'
                ? materialAdvantage.black
                : materialAdvantage.white
            "
          />
        </div>

        <!-- 8x8 Interactive Chess Board -->
        <div class="chessboard-wrapper">
          <ChessBoard
            :fen="fen"
            :orientation="orientation"
            :turn="turn"
            :my-color="myColor"
            :selected-square="selectedSquare"
            :legal-moves="legalMoves"
            :last-move="lastMove"
            :king-in-check-square="kingInCheckSquare"
            :interactive="isMyTurn && currentRoom.status === 'playing'"
            @select="handleSquareClick"
            @move="handleExecuteMove"
            @promotion-required="handlePromotionRequired"
          />
        </div>

        <!-- Bottom Self Status & Captured Pieces Tray -->
        <div class="player-hud-row bottom-hud">
          <CapturedTray
            :captured-pieces="myColor === 'w' ? capturedBlack : capturedWhite"
            :color="myColor === 'w' ? 'b' : 'w'"
            :material-advantage="
              myColor === 'w'
                ? materialAdvantage.white
                : materialAdvantage.black
            "
          />
          <PlayerBadge
            :player-name="currentPlayer?.name || 'You'"
            :color="currentPlayer?.color || myColor || 'w'"
            :is-current-turn="turn === (currentPlayer?.color || 'w')"
            :is-connected="isConnected"
            :is-host="isHost"
            :is-self="true"
            :avatar="myPlayerAvatar"
          />
        </div>

        <!-- In-Game Action Bar -->
        <div class="in-game-toolbar">
          <BaseButton
            variant="ghost"
            size="md"
            data-testid="flip-board-action"
            @click="flipBoard"
          >
            <template #icon-left>🔄</template>
            Flip board
          </BaseButton>

          <BaseButton
            variant="ghost"
            size="md"
            data-testid="offer-draw-action"
            :disabled="currentRoom.status !== 'playing'"
            @click="handleOfferDraw"
          >
            <template #icon-left>🤝</template>
            Offer draw
          </BaseButton>

          <BaseButton
            variant="ghost"
            size="md"
            class="action-btn--subdued-danger"
            data-testid="resign-action"
            :disabled="currentRoom.status !== 'playing'"
            @click="handleResign"
          >
            <template #icon-left>🏳️</template>
            Resign
          </BaseButton>

          <BaseButton
            variant="ghost"
            size="md"
            data-testid="toggle-history-action"
            @click="showHistory = !showHistory"
          >
            <template #icon-left>📜</template>
            {{ showHistory ? 'Hide moves' : 'View moves' }} ({{ chessEngine.moveHistory.value.length }})
          </BaseButton>
        </div>

        <!-- Collapsible Move History -->
        <div v-if="showHistory" class="history-card-wrapper">
          <MoveHistoryList :moves="chessEngine.moveHistory.value" />
        </div>
      </div>

      <!-- 6. Main Lobby View (Default when not in an active game arena) -->
      <LobbyView
        v-else
        :initial-room-code="initialRoomCode"
        :lan-info="lanInfo"
        :loading="isActionLoading"
        :initial-mode="lobbyActiveMode"
        @mode-change="handleModeChange"
        @host="handleHostGame"
        @join="handleJoinGame"
        @create-room="handleCreateRoom"
        @createRoom="handleCreateRoom"
        @join-room="handleJoinRoom"
        @joinRoom="handleJoinRoom"
        @start-solo-ai="handleStartSoloAi"
        @select-scenario="handleSelectScenario"
        @launch-drills="handleLaunchDrills"
        @launch-ladder="handleLaunchLadder"
        @launch-rush="handleLaunchRush"
        @open-sync="openSyncModal"
        @openSync="openSyncModal"
      />
    </main>

    <!-- Dialogs & Modals -->
    <!-- 1. QR Code / LAN Share Modal -->
    <QrCodeModal
      v-if="currentRoom"
      v-model="showQrModal"
      :room-code="currentRoom.roomCode"
      :lan-info="lanInfo"
    />

    <!-- 2. Pawn Promotion Dialog -->
    <PromotionModal
      :model-value="!!pendingPromotion"
      :color="turn"
      @select="handlePromotionSelect"
      @cancel="cancelPromotion"
    />

    <!-- 3. Game Over Celebratory Modal -->
    <GameOverModal
      v-model="showGameOverModal"
      :payload="lastGameOver"
      :is-winner="isWinner"
      :is-draw="isDrawResult"
      :rematch-requested="isRematchRequestedByMe"
      @rematch="handleRequestRematch"
      @lobby="handleLeaveRoom"
    />

    <!-- 4. Inbound Rematch Challenge Modal -->
    <RematchModal
      :model-value="showIncomingRematchModal"
      :requester-name="rematchRequestedBy?.requesterName || 'Opponent'"
      @accept="handleAcceptRematch"
      @decline="handleDeclineRematch"
    />

    <!-- 5. Progress Portability Sync Modal -->
    <ProgressSyncModal v-model="isSyncModalOpen" />

    <!-- 6. Progress Conflict Resolution Modal -->
    <ProgressConflictModal
      v-model="isConflictModalOpen"
      :current-progress="currentProgress"
      :incoming-progress="incomingPayload"
      :diff-preview="diffPreview"
      @resolve="executeMerge"
      @merge="executeMerge('smart_merge')"
      @replace="executeMerge('replace_local')"
      @cancel="closeConflictModal"
    />

    <!-- 7. PWA Install Modal (iOS / Manual Guide) -->
    <PwaInstallModal v-model="isInstallModalOpen" />

    <!-- 8. Floating PWA Install CTA Banner -->
    <PwaInstallBanner
      v-if="showInstallBanner"
      @install="promptInstall"
      @dismiss="snoozePrompt"
    />
  </div>
</template>

<style scoped>
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

.app-shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-app);
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

.app-navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  padding-block-start: max(var(--space-2), calc(var(--space-2) + env(safe-area-inset-top, 0px)));
  padding-inline-start: max(var(--space-4), calc(var(--space-4) + env(safe-area-inset-left, 0px)));
  padding-inline-end: max(var(--space-4), calc(var(--space-4) + env(safe-area-inset-right, 0px)));
  background-color: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-xs);
  position: sticky;
  top: 0;
  z-index: 50;
  box-sizing: border-box;
  width: 100%;
  max-width: 100vw;
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
  background: transparent;
  border: none;
  min-height: 44px;
  min-width: 44px;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: start;
  box-sizing: border-box;
  transition: transform var(--duration-fast, 150ms) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
}

.navbar-brand:hover {
  transform: scale(1.02);
}

.navbar-brand:active {
  transform: scale(0.96);
}

.navbar-brand:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: var(--focus-ring, 0 0 0 3px hsl(var(--color-primary-h, 255) 85% 60% / 0.45));
  border-radius: var(--radius-sm, 8px);
}

.brand-logo-icon {
  font-size: 1.6rem;
  line-height: 1;
}

.brand-title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: var(--weight-heavy);
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
}

.room-chip-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 1;
  min-width: 0;
}

.room-code-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 44px;
  min-width: 44px;
  background-color: var(--color-primary-subtle);
  border: 1px dashed var(--color-primary);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  white-space: nowrap;
  box-sizing: border-box;
  transition: transform var(--duration-fast) var(--ease-spring);
}

.room-code-chip:hover {
  transform: scale(1.05);
}

.room-code-chip:active {
  transform: scale(0.96);
}

.room-code-chip:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: var(--focus-ring, 0 0 0 3px hsl(var(--color-primary-h, 255) 85% 60% / 0.45));
}

.room-chip-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--color-primary);
}

.room-chip-code {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--weight-heavy);
  color: var(--color-primary);
  letter-spacing: 0.08em;
}

.room-chip-icon {
  font-size: var(--text-sm);
}

.turn-status-badge {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background-color: var(--turn-waiting-bg);
  color: var(--turn-waiting-text);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
}

.turn-status-badge.is-my-turn {
  background-color: var(--turn-active-bg);
  color: var(--turn-active-text);
  animation: turn-bounce-glow 1.8s infinite ease-in-out;
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.nav-install-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  gap: 4px;
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  border-radius: var(--radius-pill);
  padding: 4px 12px;
  box-sizing: border-box;
  animation: float-bounce 3s infinite ease-in-out;
  transition: transform var(--duration-fast) var(--ease-spring);
}

.nav-install-btn:active {
  transform: scale(0.96);
}

.nav-icon-btn {
  padding: 4px 8px;
  min-width: 44px;
  min-height: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--duration-fast, 150ms) var(--ease-spring);
}

.nav-icon-btn:active {
  transform: scale(0.96);
}

.nav-exit-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.exit-icon {
  font-size: var(--text-base);
}

.exit-text {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: bold;
}

.app-viewport {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: var(--space-4) var(--space-4) var(--space-8);
  padding-block-end: max(var(--space-8), calc(var(--space-4) + env(safe-area-inset-bottom, 0px)));
  padding-inline-start: max(var(--space-4), calc(var(--space-4) + env(safe-area-inset-left, 0px)));
  padding-inline-end: max(var(--space-4), calc(var(--space-4) + env(safe-area-inset-right, 0px)));
  max-width: 880px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
  overflow-x: hidden;
}

/* Accessible Floating Global Notification Toast */
.app-notification-banner {
  position: fixed;
  top: 68px;
  left: 50%;
  inset-inline-start: 50%;
  transform: translateX(-50%);
  z-index: var(--z-global-notification, 100);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: calc(100% - 32px);
  max-width: 580px;
  padding: var(--space-2-5) var(--space-4);
  border-radius: var(--radius-lg);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-sizing: border-box;
  margin-bottom: 0;
}

.app-notification-banner.is-error {
  background-color: var(--soft-error-glass, rgba(255, 241, 242, 0.94));
  border: 1.5px solid var(--soft-error-border, hsl(350, 80%, 75%));
  color: var(--soft-error-text, hsl(350, 75%, 28%));
}

.app-notification-banner.is-info {
  background-color: var(--soft-info-glass, rgba(240, 249, 255, 0.94));
  border: 1.5px solid var(--soft-info-border, hsl(198, 80%, 75%));
  color: var(--soft-info-text, hsl(198, 90%, 25%));
}

.app-notification-banner.is-success {
  background-color: var(--soft-success-glass, rgba(240, 253, 244, 0.94));
  border: 1.5px solid var(--soft-success-border, hsl(145, 60%, 75%));
  color: var(--soft-success-text, hsl(145, 80%, 22%));
}

[data-theme='dark'] .app-notification-banner.is-error {
  background-color: var(--soft-error-glass, rgba(45, 20, 25, 0.94));
  border-color: var(--soft-error-border, hsl(350, 50%, 35%));
  color: var(--soft-error-text, hsl(350, 85%, 90%));
}

[data-theme='dark'] .app-notification-banner.is-info {
  background-color: var(--soft-info-glass, rgba(20, 38, 50, 0.94));
  border-color: var(--soft-info-border, hsl(198, 50%, 35%));
  color: var(--soft-info-text, hsl(198, 85%, 90%));
}

[data-theme='dark'] .app-notification-banner.is-success {
  background-color: var(--soft-success-glass, rgba(20, 45, 30, 0.94));
  border-color: var(--soft-success-border, hsl(145, 50%, 35%));
  color: var(--soft-success-text, hsl(145, 85%, 90%));
}

.notification-icon {
  font-size: 1.1rem;
  line-height: 1;
  flex-shrink: 0;
}

.notification-message {
  flex: 1 1 auto;
  text-align: start;
}

.notification-dismiss-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  min-width: 44px;
  min-height: 44px;
  font-size: var(--text-sm);
  color: inherit;
  opacity: 0.75;
  border-radius: var(--radius-xs, 4px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  transition: opacity var(--duration-fast, 150ms), transform var(--duration-fast, 150ms) var(--ease-spring);
}

.notification-dismiss-btn:hover {
  opacity: 1;
}

.notification-dismiss-btn:active {
  transform: scale(0.96);
}

.notification-dismiss-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: var(--focus-ring, 0 0 0 3px hsl(var(--color-primary-h, 255) 85% 60% / 0.45));
}

.notification-slide-enter-active,
.notification-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s var(--ease-spring);
}

.notification-slide-enter-from,
.notification-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, -14px) scale(0.96);
}

.notification-slide-enter-to,
.notification-slide-leave-from {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}

@keyframes banner-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -8px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}

.game-arena-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 580px;
  gap: var(--space-2);
  box-sizing: border-box;
  overflow-x: hidden;
}

/* Arena Turn Indicator Banner */
.arena-turn-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  background-color: var(--bg-surface);
  border: 1.5px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  box-sizing: border-box;
  transition: transform var(--duration-fast), background-color var(--duration-fast), border-color var(--duration-fast), box-shadow var(--duration-fast);
}

.arena-turn-indicator.is-my-turn {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(124, 58, 237, 0.12));
  border-color: var(--color-primary);
  color: var(--color-primary);
  box-shadow: 0 0 14px rgba(124, 58, 237, 0.2);
}

.turn-indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--text-muted);
  flex-shrink: 0;
}

.arena-turn-indicator.is-my-turn .turn-indicator-dot {
  background-color: var(--status-online, #10b981);
  box-shadow: 0 0 8px var(--status-online, #10b981);
  animation: pulse-valid-dot 1.4s infinite ease-in-out;
}

.turn-indicator-text {
  white-space: nowrap;
}

.disconnect-warning-banner {
  position: absolute;
  top: 8px;
  left: 50%;
  inset-inline-start: 50%;
  transform: translateX(-50%);
  z-index: var(--z-overlay-alert, 30);
  width: calc(100% - 16px);
  max-width: 560px;
  background-color: var(--color-danger);
  color: var(--text-on-danger, #ffffff);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  text-align: center;
  box-shadow: var(--shadow-lg);
  box-sizing: border-box;
  animation: pulse-valid-dot 1.5s infinite ease-in-out;
}

.draw-offer-banner {
  position: absolute;
  top: 8px;
  left: 50%;
  inset-inline-start: 50%;
  transform: translateX(-50%);
  z-index: var(--z-overlay-alert, 30);
  width: calc(100% - 16px);
  max-width: 560px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--bg-surface-glass);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 2px solid var(--color-accent);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  color: var(--text-main);
  box-shadow: var(--shadow-lg);
  box-sizing: border-box;
  animation: banner-pop 0.24s var(--ease-spring);
}

.banner-buttons {
  display: flex;
  gap: var(--space-2);
}

.player-hud-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: var(--space-2);
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.chessboard-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
  box-sizing: border-box;
  max-width: 100%;
}

.in-game-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  width: 100%;
  margin-top: var(--space-1);
}

.action-btn--subdued-danger {
  color: var(--color-danger, #ef4444) !important;
  border-color: var(--border-medium) !important;
  background-color: transparent !important;
}

.action-btn--subdued-danger:hover:not(:disabled) {
  background-color: var(--color-danger-subtle, rgba(239, 68, 68, 0.16)) !important;
  border-color: var(--color-danger, #ef4444) !important;
  color: var(--color-danger, #ef4444) !important;
}

.action-btn--subdued-danger:active:not(:disabled) {
  background-color: var(--color-danger-subtle, rgba(239, 68, 68, 0.24)) !important;
  border-color: var(--color-danger, #ef4444) !important;
}

.history-card-wrapper {
  width: 100%;
  margin-top: var(--space-2);
}

@media (max-width: 640px) {
  .app-navbar {
    padding: 6px 10px;
  }

  .brand-title {
    display: none;
  }

  .brand-logo-icon {
    font-size: 1.4rem;
  }

  .desktop-turn-badge {
    display: none;
  }

  .room-chip-label {
    display: none;
  }

  .room-code-chip {
    padding: 4px 10px;
    font-size: var(--text-xs);
    white-space: nowrap;
    flex-shrink: 0;
    min-height: 44px;
    min-width: 44px;
    box-sizing: border-box;
  }

  .nav-install-btn {
    display: none;
  }

  .exit-text {
    display: none;
  }

  .nav-icon-btn {
    min-width: 44px;
    min-height: 44px;
    height: 44px;
    padding: 2px 6px;
  }

  .app-viewport {
    padding: var(--space-3) var(--space-2) var(--space-6);
  }

  .app-notification-banner {
    top: 64px;
    width: calc(100% - 24px);
    max-width: 440px;
    padding: var(--space-2) var(--space-3);
  }

  .game-arena-container {
    gap: var(--space-2);
  }

  .disconnect-warning-banner,
  .draw-offer-banner {
    top: 8px;
    width: calc(100% - 16px);
    max-width: 440px;
  }

  .arena-turn-indicator {
    padding: 6px 12px;
    font-size: var(--text-xs);
  }

  .in-game-toolbar {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2, 8px);
  }

  .in-game-toolbar :deep(button) {
    min-height: 44px;
    padding: 6px 4px;
    font-size: var(--text-xs);
    min-width: 0;
  }
}

@media (max-width: 480px) {
  .app-notification-banner {
    top: 64px;
    width: calc(100% - 24px);
    max-width: 440px;
    padding: var(--space-2) var(--space-3);
  }

  .disconnect-warning-banner,
  .draw-offer-banner {
    top: 8px;
    width: calc(100% - 16px);
    max-width: 440px;
  }
}

@media (max-width: 380px) {
  .app-notification-banner {
    top: 58px;
    width: calc(100% - 16px);
    padding: 6px 10px;
    font-size: var(--text-xs);
  }

  .disconnect-warning-banner,
  .draw-offer-banner {
    top: 4px;
    width: calc(100% - 12px);
    padding: 6px 10px;
    font-size: var(--text-xs);
  }
}
</style>
