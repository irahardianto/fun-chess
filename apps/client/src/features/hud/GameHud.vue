<script setup lang="ts">
import { BaseButton } from '@/components/base';
import type { GameState, PieceColor, Player } from '@fun-chess/shared';
import PlayerBadge from './PlayerBadge.vue';
import CapturedTray from './CapturedTray.vue';

defineProps<{
  whitePlayer: Player | null;
  blackPlayer: Player | null;
  currentTurn: PieceColor;
  selfPlayerId?: string;
  gameState: GameState;
  isMuted?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-sound'): void;
  (e: 'flip-board'): void;
  (e: 'resign'): void;
  (e: 'offer-draw'): void;
}>();
</script>

<template>
  <div class="game-hud" data-testid="game-hud">
    <!-- Top Bar: Opponent -->
    <div class="hud-section opponent-section">
      <PlayerBadge
        v-if="blackPlayer"
        :player-name="blackPlayer.name"
        :color="blackPlayer.color"
        :is-current-turn="currentTurn === blackPlayer.color"
        :is-connected="blackPlayer.isConnected"
        :is-host="blackPlayer.isHost"
        :is-self="blackPlayer.id === selfPlayerId"
        avatar="🐼"
      />
      <CapturedTray
        :captured-pieces="gameState.capturedBlack"
        color="b"
        :material-advantage="gameState.materialAdvantage.white"
      />
    </div>

    <!-- Bottom Bar: Player Self + Controls -->
    <div class="hud-section player-section">
      <CapturedTray
        :captured-pieces="gameState.capturedWhite"
        color="w"
        :material-advantage="gameState.materialAdvantage.black"
      />
      <PlayerBadge
        v-if="whitePlayer"
        :player-name="whitePlayer.name"
        :color="whitePlayer.color"
        :is-current-turn="currentTurn === whitePlayer.color"
        :is-connected="whitePlayer.isConnected"
        :is-host="whitePlayer.isHost"
        :is-self="whitePlayer.id === selfPlayerId"
        avatar="🚀"
      />

      <!-- Toolbar -->
      <div class="hud-toolbar">
        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="toggle-sound-btn"
          :aria-label="isMuted ? 'Unmute audio' : 'Mute audio'"
          @click="emit('toggle-sound')"
        >
          <template #icon>{{ isMuted ? '🔇' : '🔊' }}</template>
          <span>{{ isMuted ? 'Unmute' : 'Mute' }}</span>
        </BaseButton>

        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="flip-board-btn"
          aria-label="Flip board"
          @click="emit('flip-board')"
        >
          <template #icon>🔄</template>
          <span>Flip</span>
        </BaseButton>

        <BaseButton
          variant="ghost"
          size="sm"
          data-testid="offer-draw-btn"
          aria-label="Offer draw"
          @click="emit('offer-draw')"
        >
          <template #icon>🤝</template>
          <span>Offer Draw</span>
        </BaseButton>

        <BaseButton
          variant="danger"
          size="sm"
          data-testid="resign-btn"
          aria-label="Resign"
          @click="emit('resign')"
        >
          <template #icon>🏳️</template>
          <span>Resign</span>
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-hud {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  max-width: 580px;
  margin: 0 auto;
}

.hud-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.hud-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-1);
}
</style>
