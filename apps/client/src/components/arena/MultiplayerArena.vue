<script setup lang="ts">
import { ref, computed } from 'vue';
import type { RoomState, Player, Square, PieceType, MoveResult } from '@fun-chess/shared';
import { BaseButton } from '@/components/base';
import { ChessBoard } from '@/features/board';
import { PlayerBadge, CapturedTray, MoveHistoryList } from '@/features/hud';

interface Props {
  currentRoom: RoomState;
  currentPlayer: Player | null;
  opponentPlayer?: Player | null;
  socketId?: string | null;
  isConnected?: boolean;
  isHost?: boolean;
  fen: string;
  turn: 'w' | 'b';
  orientation: 'w' | 'b';
  myColor: 'w' | 'b' | null;
  isMyTurn: boolean;
  selectedSquare: Square | null;
  legalMoves: Square[];
  lastMove: { from: string; to: string } | null;
  kingInCheckSquare: Square | null;
  capturedWhite: PieceType[];
  capturedBlack: PieceType[];
  materialAdvantage: { white: number; black: number };
  moveHistory: MoveResult[];
  myPlayerAvatar?: string;
  drawOfferedBy: { fromPlayerId: string; fromPlayerName: string } | null;
}

const props = withDefaults(defineProps<Props>(), {
  opponentPlayer: null,
  socketId: null,
  isConnected: true,
  isHost: undefined,
  myPlayerAvatar: '🦁',
  drawOfferedBy: null,
  moveHistory: () => [],
});

const emit = defineEmits<{
  'select-square': [sq: Square]; selectSquare: [sq: Square]; select: [sq: Square];
  'execute-move': [move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }];
  executeMove: [move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }];
  move: [move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }];
  'promotion-required': [payload: { from: Square; to: Square }];
  promotionRequired: [payload: { from: Square; to: Square }];
  'accept-draw': []; acceptDraw: []; 'decline-draw': []; declineDraw: [];
  'offer-draw': []; offerDraw: []; resign: []; 'flip-board': []; flipBoard: [];
}>();

const showHistory = ref(false);
const computedIsHost = computed(() => props.isHost ?? (props.currentRoom.hostId === props.currentPlayer?.id));
const computedOpponent = computed(() => {
  if (props.opponentPlayer) return props.opponentPlayer;
  if (!props.currentPlayer) return null;
  return props.currentPlayer.color === 'w' ? props.currentRoom.blackPlayer : props.currentRoom.whitePlayer;
});

function handleSelect(sq: Square) {
  emit('select-square', sq); emit('selectSquare', sq); emit('select', sq);
}
function handleMove(move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) {
  emit('execute-move', move); emit('executeMove', move); emit('move', move);
}
function handlePromotionRequired(payload: { from: Square; to: Square }) {
  emit('promotion-required', payload); emit('promotionRequired', payload);
}
function handleAcceptDraw() { emit('accept-draw'); emit('acceptDraw'); }
function handleDeclineDraw() { emit('decline-draw'); emit('declineDraw'); }
function handleOfferDraw() { emit('offer-draw'); emit('offerDraw'); }
function handleResign() { emit('resign'); }
function handleFlipBoard() { emit('flip-board'); emit('flipBoard'); }
</script>

<template>
  <div class="game-arena-container" data-testid="game-arena-container">
    <div v-if="currentRoom.status === 'paused_disconnect'" class="disconnect-warning-banner" role="alert">
      <span>⚠️ Opponent disconnected. Waiting for reconnection (60s)...</span>
    </div>

    <div v-if="drawOfferedBy" class="draw-offer-banner" role="alert">
      <span>🤝 <strong>{{ drawOfferedBy.fromPlayerName }}</strong> offered a peaceful draw!</span>
      <div class="banner-buttons">
        <BaseButton variant="success" size="sm" @click="handleAcceptDraw">Accept draw</BaseButton>
        <BaseButton variant="ghost" size="sm" @click="handleDeclineDraw">Decline draw</BaseButton>
      </div>
    </div>

    <div
      v-if="currentRoom.status === 'playing'"
      class="arena-turn-indicator"
      :class="{ 'is-my-turn': isMyTurn }"
      role="status"
      aria-live="polite"
    >
      <span class="turn-indicator-dot"></span>
      <span class="turn-indicator-text">
        {{ isMyTurn ? '✨ Your Turn to Move!' : `⏳ Waiting for ${computedOpponent?.name || 'Opponent'}...` }}
      </span>
    </div>

    <div class="player-hud-row top-hud">
      <PlayerBadge
        :player-name="computedOpponent?.name || 'Opponent'"
        :color="computedOpponent?.color || (myColor === 'w' ? 'b' : 'w')"
        :is-current-turn="turn === (computedOpponent?.color || 'b')"
        :is-connected="computedOpponent?.isConnected ?? true"
        :is-host="computedOpponent?.isHost ?? false"
        :is-self="false"
        :avatar="computedOpponent?.avatar || '🦊'"
      />
      <CapturedTray
        :captured-pieces="computedOpponent?.color === 'b' ? capturedWhite : capturedBlack"
        :color="computedOpponent?.color === 'b' ? 'w' : 'b'"
        :material-advantage="computedOpponent?.color === 'b' ? materialAdvantage.black : materialAdvantage.white"
      />
    </div>

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
        @select="handleSelect"
        @move="handleMove"
        @promotion-required="handlePromotionRequired"
      />
    </div>

    <div class="player-hud-row bottom-hud">
      <CapturedTray
        :captured-pieces="myColor === 'w' ? capturedBlack : capturedWhite"
        :color="myColor === 'w' ? 'b' : 'w'"
        :material-advantage="myColor === 'w' ? materialAdvantage.white : materialAdvantage.black"
      />
      <PlayerBadge
        :player-name="currentPlayer?.name || 'You'"
        :color="currentPlayer?.color || myColor || 'w'"
        :is-current-turn="turn === (currentPlayer?.color || 'w')"
        :is-connected="isConnected"
        :is-host="computedIsHost"
        :is-self="true"
        :avatar="myPlayerAvatar"
      />
    </div>

    <div class="in-game-toolbar">
      <BaseButton variant="ghost" size="md" data-testid="flip-board-action" @click="handleFlipBoard">
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

      <BaseButton variant="ghost" size="md" data-testid="toggle-history-action" @click="showHistory = !showHistory">
        <template #icon-left>📜</template>
        {{ showHistory ? 'Hide moves' : 'View moves' }} ({{ moveHistory?.length || 0 }})
      </BaseButton>
    </div>

    <div v-if="showHistory" class="history-card-wrapper">
      <MoveHistoryList :moves="moveHistory" />
    </div>
  </div>
</template>

<style scoped>
.game-arena-container {
  position: relative; display: flex; flex-direction: column; align-items: center;
  width: 100%; max-width: 580px; gap: var(--space-2, 8px); box-sizing: border-box; overflow-x: hidden;
}
.disconnect-warning-banner {
  position: absolute; top: 8px; left: 50%; inset-inline-start: 50%; transform: translateX(-50%);
  z-index: var(--z-overlay-alert, 30); width: calc(100% - 16px); max-width: 560px;
  background-color: var(--color-danger, #dc2626); color: var(--text-on-danger, #ffffff);
  font-family: var(--font-body); font-size: var(--text-sm, 14px); font-weight: var(--weight-bold, 700);
  padding: var(--space-2, 8px) var(--space-4, 16px); border-radius: var(--radius-md, 12px);
  text-align: center; box-shadow: var(--shadow-lg); box-sizing: border-box; animation: pulse-valid-dot 1.5s infinite ease-in-out;
}
.draw-offer-banner {
  position: absolute; top: 8px; left: 50%; inset-inline-start: 50%; transform: translateX(-50%);
  z-index: var(--z-overlay-alert, 30); width: calc(100% - 16px); max-width: 560px;
  display: flex; align-items: center; justify-content: space-between;
  background-color: var(--bg-surface-glass, rgba(255, 255, 255, 0.88));
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 2px solid var(--color-accent, #ffb300);
  padding: var(--space-2, 8px) var(--space-4, 16px); border-radius: var(--radius-md, 12px);
  color: var(--text-main, #0f172a); box-shadow: var(--shadow-lg); box-sizing: border-box; animation: banner-pop 0.24s var(--ease-spring);
}
.banner-buttons { display: flex; gap: var(--space-2, 8px); }
.arena-turn-indicator {
  display: flex; align-items: center; justify-content: center; gap: var(--space-2, 8px); width: 100%;
  padding: 8px 16px; border-radius: var(--radius-pill, 9999px); background-color: var(--bg-surface, #ffffff);
  border: 1.5px solid var(--border-subtle, #e2e8f0); box-shadow: var(--shadow-sm); font-family: var(--font-display);
  font-size: var(--text-sm, 14px); font-weight: var(--weight-bold, 700); color: var(--text-main, #0f172a);
  box-sizing: border-box; transition: transform var(--duration-fast, 140ms), background-color var(--duration-fast, 140ms);
}
.arena-turn-indicator.is-my-turn {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(124, 58, 237, 0.12));
  border-color: var(--color-primary, #6c5ce7); color: var(--color-primary, #6c5ce7); box-shadow: 0 0 14px rgba(124, 58, 237, 0.2);
}
.turn-indicator-dot { width: 8px; height: 8px; border-radius: 50%; background-color: var(--text-muted, #64748b); flex-shrink: 0; }
.arena-turn-indicator.is-my-turn .turn-indicator-dot {
  background-color: var(--status-online, #10b981); box-shadow: 0 0 8px var(--status-online, #10b981); animation: pulse-valid-dot 1.4s infinite ease-in-out;
}
.turn-indicator-text { white-space: nowrap; }
.player-hud-row {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  gap: var(--space-2, 8px); max-width: 100%; box-sizing: border-box; overflow-x: auto; -webkit-overflow-scrolling: touch;
}
.chessboard-wrapper { width: 100%; display: flex; justify-content: center; box-sizing: border-box; max-width: 100%; }
.in-game-toolbar {
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: var(--space-2, 8px); width: 100%; margin-top: var(--space-1, 4px);
}
.action-btn--subdued-danger {
  color: var(--color-danger, #dc2626) !important; border-color: var(--border-medium, #cbd5e1) !important; background-color: transparent !important;
}
.action-btn--subdued-danger:hover:not(:disabled) {
  background-color: var(--color-danger-subtle, rgba(220, 38, 38, 0.16)) !important; border-color: var(--color-danger, #dc2626) !important; color: var(--color-danger, #dc2626) !important;
}
.action-btn--subdued-danger:active:not(:disabled) {
  background-color: var(--color-danger-subtle, rgba(220, 38, 38, 0.24)) !important; border-color: var(--color-danger, #dc2626) !important;
}
.history-card-wrapper { width: 100%; margin-top: var(--space-2, 8px); }
@media (max-width: 640px) {
  .in-game-toolbar { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2, 8px); }
  .in-game-toolbar :deep(button) { min-height: 44px; padding: 6px 4px; font-size: var(--text-xs, 12px); min-width: 0; }
}
</style>
