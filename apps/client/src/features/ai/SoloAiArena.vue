<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PieceColor, MascotId, Square } from '@fun-chess/shared';
import { useAiGame } from './composables/useAiGame.js';
import { AiMascotBadge, AiGameHud, AiGameOverModal } from './components/index.js';
import { ChessBoard } from '../board/index.js';
import { PlayerBadge, CapturedTray, MoveHistoryList } from '../hud/index.js';
import { PromotionModal } from '../modals/index.js';
import BaseButton from '../../components/base/BaseButton.vue';
import { useAudio } from '../../composables/useAudio.js';

interface Props {
  initialMascotId?: MascotId;
  initialPlayerColor?: PieceColor | 'random';
  playerName?: string;
  playerAvatar?: string;
}

const props = withDefaults(defineProps<Props>(), {
  initialMascotId: 'peanut',
  initialPlayerColor: 'w',
  playerName: 'You',
  playerAvatar: '🦁',
});

const emit = defineEmits<{
  exit: [];
  lobby: [];
  changeOpponent: [];
}>();

const { isMuted, toggleMute } = useAudio();

// Solo AI Game State Machine
const aiGame = useAiGame({
  mascotId: props.initialMascotId,
  playerColor: props.initialPlayerColor,
});

const {
  mascot,
  activeMascotDialogue,
  fen,
  turn,
  orientation,
  playerColor,
  aiColor,
  isPlayerTurn,
  isAiThinking,
  lastGameOver,
  moveHistory,
  lastMove,
  kingInCheckSquare,
  selectedSquare,
  legalMoves,
  pendingPromotion,
  selectSquare,
  applyPlayerMove,
  completePromotion,
  cancelPromotion,
  capturedWhite,
  capturedBlack,
  materialAdvantage,
  takebackCount,
  canTakeback,
  takeback,
  activeHint,
  hintsCount,
  canAskHint,
  askForHint,
  clearHint,
  startNewGame,
  flipBoard,
  resign,
} = aiGame;

const showHistory = ref(false);
const showGameOverModal = ref(true);

const isPlayerWinner = computed(() => {
  if (!lastGameOver.value) return false;
  return lastGameOver.value.winner === playerColor.value;
});

const isDrawResult = computed(() => {
  if (!lastGameOver.value) return false;
  return lastGameOver.value.winner === 'draw';
});

function handleSquareClick(sq: Square) {
  selectSquare(sq);
}

function handlePromotionSelect(piece: 'q' | 'r' | 'b' | 'n') {
  completePromotion(piece);
}

function handleResign() {
  if (confirm(`Resign this match against ${mascot.value.name}? 🏳️`)) {
    resign();
  }
}

function handleRematch() {
  startNewGame();
}

function handleChangeOpponent() {
  emit('changeOpponent');
}

function handleExit() {
  emit('exit');
  emit('lobby');
}
</script>

<template>
  <div class="solo-ai-arena" data-testid="solo-ai-arena" role="main" aria-label="Solo AI Chess Arena">
    <!-- Top Action Bar / Arena Header -->
    <header class="arena-header">
      <BaseButton
        variant="ghost"
        size="sm"
        data-testid="exit-arena-btn"
        class="header-back-btn"
        aria-label="Return to Main Menu"
        @click="handleExit"
      >
        <template #icon-left><span>⬅️</span></template>
        Menu
      </BaseButton>

      <div class="match-info-center">
        <span class="match-mode-pill">SOLO AI MATCH</span>
        <span class="opponent-name-tag">vs. {{ mascot.name }}</span>
      </div>

      <div class="header-right-actions">
        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="arena-mute-btn"
          :aria-label="isMuted ? 'Unmute audio' : 'Mute audio'"
          class="nav-icon-btn"
          @click="toggleMute"
        >
          <template #icon>{{ isMuted ? '🔇' : '🔊' }}</template>
        </BaseButton>

        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="change-mascot-btn"
          class="nav-icon-btn"
          aria-label="Change Mascot Opponent"
          @click="handleChangeOpponent"
        >
          <template #icon>🐾</template>
        </BaseButton>
      </div>
    </header>

    <!-- Arena Container -->
    <div class="arena-playfield">
      <!-- 1. Top Opponent Status: Mascot Badge & Opponent Captured Tray -->
      <div class="hud-section top-opponent-section">
        <AiMascotBadge
          :mascot="mascot"
          :color="aiColor"
          :is-current-turn="turn === aiColor"
          :is-thinking="isAiThinking"
          :dialogue="activeMascotDialogue"
        />

        <div class="tray-align-right">
          <CapturedTray
            :captured-pieces="aiColor === 'b' ? capturedWhite : capturedBlack"
            :color="aiColor === 'b' ? 'w' : 'b'"
            :material-advantage="
              aiColor === 'b'
                ? materialAdvantage.black
                : materialAdvantage.white
            "
            :label="`${mascot.name}'s captured pieces`"
          />
        </div>
      </div>

      <!-- 2. Active Hint Banner (Revealed when hint is requested) -->
      <transition name="hint-slide">
        <div
          v-if="activeHint"
          data-testid="active-hint-banner"
          class="active-hint-banner"
          role="status"
          aria-live="polite"
        >
          <div class="hint-banner-header">
            <span class="hint-badge">💡 TACTICAL HINT</span>
            <button
              type="button"
              class="hint-close-btn"
              aria-label="Dismiss hint"
              @click="clearHint"
            >
              ✕
            </button>
          </div>
          <p class="hint-banner-text">{{ activeHint.explanation }}</p>
        </div>
      </transition>

      <!-- 3. Interactive Chess Board -->
      <div class="chessboard-frame">
        <ChessBoard
          :fen="fen"
          :orientation="orientation"
          :turn="turn"
          :my-color="playerColor"
          :selected-square="selectedSquare"
          :legal-moves="legalMoves"
          :last-move="lastMove"
          :king-in-check-square="kingInCheckSquare"
          :interactive="isPlayerTurn"
          @select="handleSquareClick"
          @move="(m) => applyPlayerMove(m.from, m.to, m.promotion)"
        />
      </div>

      <!-- 4. Bottom Player Status: Player Badge & Player Captured Tray -->
      <div class="hud-section bottom-player-section">
        <div class="tray-align-left">
          <CapturedTray
            :captured-pieces="playerColor === 'w' ? capturedBlack : capturedWhite"
            :color="playerColor === 'w' ? 'b' : 'w'"
            :material-advantage="
              playerColor === 'w'
                ? materialAdvantage.white
                : materialAdvantage.black
            "
            :label="`${props.playerName}'s captured pieces`"
          />
        </div>

        <PlayerBadge
          :player-name="props.playerName"
          :color="playerColor"
          :is-current-turn="turn === playerColor"
          :is-self="true"
          :avatar="props.playerAvatar"
        />
      </div>

      <!-- 5. In-Game Action Bar (Takeback, Hint, Flip, History, Resign) -->
      <AiGameHud
        :can-takeback="canTakeback"
        :can-ask-hint="canAskHint"
        :takeback-count="takebackCount"
        :hints-count="hintsCount"
        :is-ai-thinking="isAiThinking"
        :is-game-over="!!lastGameOver"
        :moves-count="moveHistory.length"
        @takeback="takeback"
        @hint="askForHint"
        @flip="flipBoard"
        @history="showHistory = !showHistory"
        @resign="handleResign"
      />

      <!-- 6. Move History Drawer -->
      <transition name="history-slide">
        <div v-if="showHistory" class="history-container">
          <MoveHistoryList :moves="moveHistory" />
        </div>
      </transition>
    </div>

    <!-- Pawn Promotion Modal -->
    <PromotionModal
      :model-value="!!pendingPromotion"
      :color="turn"
      @select="handlePromotionSelect"
      @cancel="cancelPromotion"
    />

    <!-- Game Over Praise & Rematch Modal -->
    <AiGameOverModal
      v-if="lastGameOver"
      :model-value="showGameOverModal"
      :payload="lastGameOver"
      :mascot="mascot"
      :is-player-winner="isPlayerWinner"
      :is-draw="isDrawResult"
      :takeback-count="takebackCount"
      :hints-count="hintsCount"
      @rematch="handleRematch"
      @change-opponent="handleChangeOpponent"
      @lobby="handleExit"
      @close="showGameOverModal = false"
    />
  </div>
</template>

<style scoped>
.solo-ai-arena {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  gap: var(--space-3);
  box-sizing: border-box;
}

/* Arena Header */
.arena-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background-color: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-xs);
  box-sizing: border-box;
}

.match-info-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.match-mode-pill {
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: var(--weight-heavy);
  color: var(--color-primary);
  letter-spacing: var(--tracking-wide);
}

.opponent-name-tag {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--text-main);
}

.header-right-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-icon-btn {
  min-width: 34px;
  height: 34px;
  padding: 4px;
}

/* Arena Playfield */
.arena-playfield {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: var(--space-2);
}

.hud-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: var(--space-2);
}

.top-opponent-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.bottom-player-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-1);
}

.tray-align-right {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

.tray-align-left {
  display: flex;
  justify-content: flex-start;
}

/* Active Hint Banner */
.active-hint-banner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  background-color: var(--hint-banner-bg, hsl(48, 100%, 96%));
  border: 2px solid var(--hint-banner-border, hsl(45, 95%, 55%));
  border-radius: var(--radius-lg);
  padding: var(--space-2-5) var(--space-4);
  box-shadow: 0 0 16px 2px rgba(255, 193, 7, 0.4);
  box-sizing: border-box;
}

.hint-banner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hint-badge {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-heavy);
  color: var(--text-on-accent, #1e1b4b);
  background-color: var(--color-accent, #ffb300);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}

.hint-close-btn {
  background: transparent;
  border: none;
  font-size: var(--text-sm);
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.hint-close-btn:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.hint-banner-text {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--hint-banner-text, hsl(42, 90%, 22%));
  line-height: var(--leading-snug);
}

.hint-slide-enter-active,
.hint-slide-leave-active {
  transition: all var(--duration-fast) var(--ease-spring);
}

.hint-slide-enter-from,
.hint-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Chessboard Frame */
.chessboard-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

/* History Container */
.history-container {
  width: 100%;
  margin-top: var(--space-2);
}

.history-slide-enter-active,
.history-slide-leave-active {
  transition: all var(--duration-fast) ease;
}

.history-slide-enter-from,
.history-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
