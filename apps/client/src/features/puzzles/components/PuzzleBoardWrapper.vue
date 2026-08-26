<script setup lang="ts">
import type { Square, PieceColor, HintData, HintLevel } from '@fun-chess/shared';
import ChessBoard from '../../board/ChessBoard.vue';
import ProgressiveHintLayer from './ProgressiveHintLayer.vue';

interface Props {
  fen: string;
  orientation?: PieceColor;
  turn?: PieceColor;
  myColor?: PieceColor | null;
  selectedSquare?: Square | null;
  legalMoves?: readonly Square[];
  lastMove?: { from: string; to: string } | null;
  kingInCheckSquare?: Square | null;
  interactive?: boolean;
  disabled?: boolean;
  hintLevel?: HintLevel;
  hintData?: HintData | null;
}

const props = withDefaults(defineProps<Props>(), {
  orientation: 'w',
  turn: 'w',
  myColor: null,
  selectedSquare: null,
  legalMoves: () => [],
  lastMove: null,
  kingInCheckSquare: null,
  interactive: true,
  disabled: false,
  hintLevel: 0,
  hintData: null,
});

const emit = defineEmits<{
  select: [square: Square];
  move: [move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }];
  promotionRequired: [payload: { from: Square; to: Square }];
  'request-hint': [];
  requestHint: [];
}>();
</script>

<template>
  <div class="puzzle-board-wrapper" data-testid="puzzle-board-wrapper">
    <div class="board-relative-frame">
      <ChessBoard
        :fen="props.fen"
        :orientation="props.orientation"
        :turn="props.turn"
        :my-color="props.myColor"
        :selected-square="props.selectedSquare"
        :legal-moves="props.legalMoves"
        :last-move="props.lastMove"
        :king-in-check-square="props.kingInCheckSquare"
        :interactive="props.interactive"
        :disabled="props.disabled"
        @select="emit('select', $event)"
        @move="emit('move', $event)"
        @promotion-required="emit('promotionRequired', $event)"
      />

      <!-- Progressive 3-Tier Hint Layer Overlay -->
      <ProgressiveHintLayer
        :hint-level="props.hintLevel"
        :hint-data="props.hintData"
        :source-square="props.hintData?.sourceSquare"
        :target-square="props.hintData?.targetSquare"
        :orientation="props.orientation"
        :fen="props.fen"
        :disabled="props.disabled || !props.interactive"
        @request-hint="emit('request-hint'); emit('requestHint')"
      />
    </div>
  </div>
</template>

<style scoped>
.puzzle-board-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  position: relative;
}

.board-relative-frame {
  position: relative;
  width: 100%;
  max-width: min(92vw, calc(78vh - 120px), 580px);
  aspect-ratio: 1 / 1;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
