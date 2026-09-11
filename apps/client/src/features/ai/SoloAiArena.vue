<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PieceColor, MascotId, Square } from '@fun-chess/shared';
import { useAiGame } from './composables/useAiGame.js';
import { AiMascotBadge, AiGameHud, AiGameOverModal } from './components/index.js';
import { ChessBoard } from '../board/index.js';
import { PlayerBadge, CapturedTray, MoveHistoryList } from '../hud/index.js';
import { PromotionModal } from '../modals/index.js';
import BaseButton from '../../components/base/BaseButton.vue';
import BaseModal from '../../components/base/BaseModal.vue';
import { useAudioContext } from '@/platform/di';
import { useAudio } from '../../composables/useAudio.js';
import { useConfetti } from '../../composables/useConfetti.js';
import type { MoveOutcomeEvent, GameCompletionOutcomeEvent } from './composables/useAiGame.js';

interface Props {
  initialMascotId?: MascotId;
  initialPlayerColor?: PieceColor | 'random';
  initialFen?: string;
  playerName?: string;
  playerAvatar?: string;
}

const props = withDefaults(defineProps<Props>(), {
  initialMascotId: 'peanut',
  initialPlayerColor: 'w',
  initialFen: undefined,
  playerName: 'You',
  playerAvatar: '🦁',
});

const emit = defineEmits<{
  exit: [];
  lobby: [];
  changeOpponent: [];
  'change-opponent': [];
}>();

const audioContext = useAudioContext();
const fallbackAudio = useAudio();
const audio = audioContext ?? fallbackAudio;
const isMuted = audio.isMuted;
const toggleMute = () => audio.toggleMute();
const { celebrate } = useConfetti();

function handleMoveOutcome(event: MoveOutcomeEvent) {
  if (event.isCheck) {
    audio.playCheck();
  } else if (event.isCapture) {
    audio.playCapture();
  } else {
    audio.playMove();
  }
}

function handleGameCompletion(event: GameCompletionOutcomeEvent) {
  if (event.isLocalPlayerWinner) {
    audio.playVictory();
    celebrate();
  } else if (event.winner === 'draw') {
    audio.playDraw();
  }
}

// Solo AI Game State Machine
const aiGame = useAiGame({
  mascotId: props.initialMascotId,
  playerColor: props.initialPlayerColor,
  initialFen: props.initialFen,
  onMoveOutcome: handleMoveOutcome,
  onGameCompletion: handleGameCompletion,
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
  requestPromotion,
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

function handlePromotionRequired(payload: { from: Square; to: Square }) {
  requestPromotion(payload.from, payload.to);
}

function handlePromotionSelect(piece: 'q' | 'r' | 'b' | 'n') {
  completePromotion(piece);
}

const showResignModal = ref(false);

function handleResign() {
  audio.playClick();
  showResignModal.value = true;
}

function confirmResign() {
  audio.playClick();
  showResignModal.value = false;
  resign();
}

function cancelResign() {
  audio.playClick();
  showResignModal.value = false;
}

function handleRematch() {
  audio.playStart();
  startNewGame();
}

function handleChangeOpponent() {
  emit('changeOpponent');
  emit('change-opponent');
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
        <span class="match-mode-pill">Solo AI Match</span>
        <span class="opponent-name-tag">vs. {{ mascot.name }}</span>
      </div>

      <div class="header-right-actions">
        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="arena-mute-btn"
          :aria-label="isMuted ? 'Unmute audio' : 'Mute audio'"
          class="nav-icon-btn btn-icon-solo-audio"
          @click="toggleMute"
        >
          <template #icon>{{ isMuted ? '🔇' : '🔊' }}</template>
        </BaseButton>

        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="change-mascot-btn"
          class="nav-icon-btn btn-icon-solo-mascot"
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

      <!-- Persistent Live Region for Screen Readers -->
      <div
        class="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ activeHint ? `Tactical Hint: ${activeHint.explanation}` : '' }}
      </div>

      <!-- 2. Active Hint Banner (Revealed when hint is requested) -->
      <transition name="hint-slide">
        <div
          v-if="activeHint"
          data-testid="active-hint-banner"
          class="active-hint-banner"
        >
          <div class="hint-banner-header">
            <span class="hint-badge">💡 Tactical Hint</span>
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
          @promotion-required="handlePromotionRequired"
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

    <!-- Accessible Resign Confirmation Modal -->
    <BaseModal
      :model-value="showResignModal"
      size="sm"
      title="Resign Match?"
      aria-label="Confirm Resignation"
      @close="cancelResign"
    >
      <div class="confirm-modal-content">
        <p class="confirm-modal-message">
          Resign this match against {{ mascot.name }}? 🏳️
        </p>
        <div class="confirm-modal-actions">
          <BaseButton
            variant="ghost"
            size="md"
            @click="cancelResign"
          >
            Keep Playing
          </BaseButton>
          <BaseButton
            variant="danger"
            size="md"
            data-testid="confirm-resign-btn"
            @click="confirmResign"
          >
            Resign
          </BaseButton>
        </div>
      </div>
    </BaseModal>
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
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--color-primary-text, #ffffff);
  letter-spacing: var(--tracking-wide);
}

[data-theme='dark'] .match-mode-pill {
  color: var(--color-primary-text, #ffffff);
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
  min-width: 44px;
  min-height: 44px;
  height: 44px;
  padding: 4px;
}

.btn-icon-solo-audio,
.btn-icon-solo-mascot {
  min-width: 44px;
  min-height: 44px;
}

/* Arena Playfield */
.arena-playfield {
  position: relative;
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
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 24px);
  max-width: 540px;
  z-index: var(--z-overlay-dialogue, 20);
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: var(--hint-banner-glass, var(--hint-banner-bg, hsl(48, 100%, 96%)));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 2px solid var(--hint-banner-border, hsl(45, 95%, 55%));
  border-radius: var(--radius-lg);
  padding: var(--space-2-5) var(--space-4);
  box-shadow: var(--glow-hint-banner, 0 0 20px 4px rgba(255, 193, 7, 0.38), var(--shadow-lg));
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  background: transparent;
  border: none;
  font-size: var(--text-sm);
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  box-sizing: border-box;
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
  margin: 0;
}

/* Transition */
.hint-slide-enter-active,
.hint-slide-leave-active {
  transition: opacity var(--duration-fast) ease, transform var(--duration-fast) var(--ease-spring);
}

.hint-slide-enter-from,
.hint-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px) scale(0.95);
}

.hint-slide-enter-to,
.hint-slide-leave-from {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
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
  transition: opacity var(--duration-fast) ease, transform var(--duration-fast) ease;
}

.history-slide-enter-from,
.history-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.confirm-modal-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-2) 0;
}

.confirm-modal-message {
  font-size: var(--text-base);
  color: var(--text-subtle);
  margin: 0;
  line-height: var(--leading-relaxed);
}

.confirm-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-2);
}
</style>
