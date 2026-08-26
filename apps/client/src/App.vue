<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type {
  Square,
  LanInfoResponse,
  AppGameMode,
  SoloAiLaunchConfig,
  ChessScenario,
} from '@fun-chess/shared';
import { BaseButton } from '@/components/base';
import { ChessBoard } from '@/features/board';
import { PlayerBadge, CapturedTray, MoveHistoryList } from '@/features/hud';
import { LobbyView, QrCodeModal } from '@/features/lobby';
import { SoloAiArena } from '@/features/ai';
import { ScenarioArena } from '@/features/scenarios';
import { PuzzleArena, PuzzleRushArena } from '@/features/puzzles';
import { PromotionModal, GameOverModal, RematchModal } from '@/features/modals';
import { useSocket, useChessGame, useAudio, useConfetti } from '@/composables';
import type { PuzzleTheme } from '@fun-chess/shared';

// --- Theme Management ---
const isDarkMode = ref(false);
function toggleTheme() {
  isDarkMode.value = !isDarkMode.value;
  if (typeof document !== 'undefined') {
    if (isDarkMode.value) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
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
      toggleTheme();
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
async function handleHostGame(payload: { playerName: string; preferredColor: 'w' | 'b' | 'random' }) {
  isActionLoading.value = true;
  try {
    const res = await createRoom(payload.playerName, payload.preferredColor);
    if (res.success) {
      showQrModal.value = true;
    } else {
      playError();
      alert(res.error?.message || 'Failed to create room');
    }
  } finally {
    isActionLoading.value = false;
  }
}

async function handleJoinGame(payload: { roomCode: string; playerName: string }) {
  isActionLoading.value = true;
  try {
    const res = await joinRoom(payload.roomCode, payload.playerName);
    if (!res.success) {
      playError();
      alert(res.error?.message || 'Failed to join room');
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
  if (confirm('Are you sure you want to resign this match? 🏳️')) {
    resign(currentRoom.value.roomCode);
  }
}

function handleOfferDraw() {
  if (!currentRoom.value) return;
  offerDraw(currentRoom.value.roomCode);
  alert('Draw offer sent to opponent! 🤝');
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
  if (confirm('Return to Lobby?')) {
    leaveRoom(currentRoom.value.roomCode);
    showGameOverModal.value = false;
    currentAppMode.value = 'lobby';
  }
}
</script>

<template>
  <div class="app-shell" data-testid="app-shell">
    <!-- Top Global App Bar -->
    <header class="app-navbar">
      <div class="navbar-brand" title="Fun Chess Home" @click="handleNavbarBrandClick">
        <span class="brand-logo-icon" aria-hidden="true">♟️</span>
        <span class="brand-title">Fun Chess! ✨</span>
      </div>

      <!-- In-Game Header Details -->
      <div v-if="currentRoom" class="room-chip-group">
        <button
          type="button"
          class="room-code-chip"
          data-testid="room-code-chip"
          title="Click to view QR code"
          @click="showQrModal = true"
        >
          <span class="room-chip-label">ROOM:</span>
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
          aria-label="Exit Game to Lobby"
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
          aria-label="Exit Solo Match"
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
          aria-label="Exit Academy Lesson"
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
          aria-label="Exit Puzzle Arena"
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
    <main class="app-viewport">
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
          <span>⚠️ Opponent disconnected! Grace period running (60s)...</span>
        </div>

        <!-- Draw Offer Alert Banner -->
        <div
          v-if="drawOfferedBy"
          class="draw-offer-banner"
          role="alert"
        >
          <span>🤝 <strong>{{ drawOfferedBy.fromPlayerName }}</strong> offered a peaceful draw!</span>
          <div class="banner-buttons">
            <BaseButton variant="success" size="sm" @click="handleAcceptDraw">Accept</BaseButton>
            <BaseButton variant="ghost" size="sm" @click="handleDeclineDraw">Decline</BaseButton>
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
            avatar="🐼"
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
            avatar="🦁"
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
            Flip Board
          </BaseButton>

          <BaseButton
            variant="ghost"
            size="md"
            data-testid="offer-draw-action"
            :disabled="currentRoom.status !== 'playing'"
            @click="handleOfferDraw"
          >
            <template #icon-left>🤝</template>
            Draw
          </BaseButton>

          <BaseButton
            variant="danger"
            size="md"
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
            Moves ({{ chessEngine.moveHistory.value.length }})
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
        @start-solo-ai="handleStartSoloAi"
        @select-scenario="handleSelectScenario"
        @launch-drills="handleLaunchDrills"
        @launch-ladder="handleLaunchLadder"
        @launch-rush="handleLaunchRush"
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
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-app);
}

.app-navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background-color: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-xs);
  position: sticky;
  top: 0;
  z-index: 50;
  box-sizing: border-box;
  width: 100%;
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
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
  gap: 4px;
  background-color: var(--color-primary-subtle);
  border: 1px dashed var(--color-primary);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  white-space: nowrap;
  transition: transform var(--duration-fast) var(--ease-spring);
}

.room-code-chip:hover {
  transform: scale(1.05);
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
  font-size: 0.9rem;
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
  gap: 4px;
  flex-shrink: 0;
}

.nav-icon-btn {
  padding: 4px 8px;
  min-width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.nav-exit-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.exit-icon {
  font-size: 1rem;
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
  justify-content: center;
  padding: var(--space-3);
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.game-arena-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 580px;
  gap: var(--space-2);
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
  color: var(--text-muted);
  box-sizing: border-box;
  transition: all var(--duration-fast);
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
  background-color: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: pulse-valid-dot 1.4s infinite ease-in-out;
}

.turn-indicator-text {
  white-space: nowrap;
}

.disconnect-warning-banner {
  width: 100%;
  background-color: var(--color-danger);
  color: var(--text-on-danger);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  text-align: center;
  animation: pulse-valid-dot 1.5s infinite ease-in-out;
}

.draw-offer-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background-color: var(--color-accent-subtle);
  border: 2px solid var(--color-accent);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  box-sizing: border-box;
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
}

.chessboard-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
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
    padding: 4px 8px;
    font-size: var(--text-xs);
  }

  .exit-text {
    display: none;
  }

  .nav-icon-btn {
    min-width: 32px;
    height: 32px;
    padding: 2px 6px;
  }

  .app-viewport {
    padding: var(--space-1);
  }

  .game-arena-container {
    gap: var(--space-2);
  }

  .arena-turn-indicator {
    padding: 6px 12px;
    font-size: var(--text-xs);
  }

  .in-game-toolbar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }

  .in-game-toolbar :deep(button) {
    padding: 6px 2px;
    font-size: var(--text-xs);
    min-width: 0;
  }
}
</style>
