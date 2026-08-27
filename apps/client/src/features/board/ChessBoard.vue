<script setup lang="ts">
import { computed, ref, watch, useTemplateRef } from 'vue';
import type { PieceColor, PieceType, Square } from '@fun-chess/shared';
import ChessSquare from './ChessSquare.vue';
import ChessPiece from './ChessPiece.vue';
import { useAudio } from '../../composables/useAudio';

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
});

const emit = defineEmits<{
  select: [square: Square];
  move: [move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }];
  promotionRequired: [payload: { from: Square; to: Square }];
}>();

const { playPickup, playError } = useAudio();
const boardRef = useTemplateRef<HTMLElement>('boardRef');

const isBoardInteractive = computed(() => props.interactive && !props.disabled);

// Active/focused square for ARIA roving tabindex
const focusedSquare = ref<Square | null>(props.selectedSquare ?? null);

const activeSquare = computed<Square>(() => {
  if (focusedSquare.value) return focusedSquare.value;
  if (props.selectedSquare) return props.selectedSquare;
  return squaresList.value[0]?.square ?? 'e2';
});

watch(
  () => props.selectedSquare,
  (newVal) => {
    if (newVal) {
      focusedSquare.value = newVal;
    }
  }
);

// Parse board grid from FEN
const boardMatrix = computed(() => {
  const ranksFen = props.fen.split(' ')[0].split('/');
  const matrix: Array<Array<{ type: PieceType; color: PieceColor } | null>> = [];

  for (const row of ranksFen) {
    const rowPieces: Array<{ type: PieceType; color: PieceColor } | null> = [];
    for (const char of row) {
      if (/\d/.test(char)) {
        const emptyCount = parseInt(char, 10);
        for (let i = 0; i < emptyCount; i++) {
          rowPieces.push(null);
        }
      } else {
        const color: PieceColor = char === char.toUpperCase() ? 'w' : 'b';
        const type = char.toLowerCase() as PieceType;
        rowPieces.push({ type, color });
      }
    }
    matrix.push(rowPieces);
  }
  return matrix;
});

// Coordinate arrays based on orientation
const ranks = computed(() => {
  return props.orientation === 'w'
    ? ['8', '7', '6', '5', '4', '3', '2', '1']
    : ['1', '2', '3', '4', '5', '6', '7', '8'];
});

const files = computed(() => {
  return props.orientation === 'w'
    ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
});

// Flat array of 64 squares in render order
const squaresList = computed(() => {
  const result: Array<{
    square: Square;
    file: string;
    rank: string;
    isLight: boolean;
    piece: { type: PieceType; color: PieceColor } | null;
    fileLabel?: string;
    rankLabel?: string;
  }> = [];

  const rankArr = ranks.value;
  const fileArr = files.value;

  for (let rIdx = 0; rIdx < 8; rIdx++) {
    const rank = rankArr[rIdx];
    const matrixRowIdx = 8 - parseInt(rank, 10);

    for (let fIdx = 0; fIdx < 8; fIdx++) {
      const file = fileArr[fIdx];
      const square = `${file}${rank}` as Square;
      const matrixColIdx = file.charCodeAt(0) - 'a'.charCodeAt(0);

      const piece = boardMatrix.value[matrixRowIdx]?.[matrixColIdx] || null;

      const fileNum = file.charCodeAt(0) - 'a'.charCodeAt(0);
      const rankNum = parseInt(rank, 10);
      const isLight = (fileNum + rankNum) % 2 !== 0;

      const rankLabel = fIdx === 0 ? rank : undefined;
      const fileLabel = rIdx === 7 ? file : undefined;

      result.push({
        square,
        file,
        rank,
        isLight,
        piece,
        fileLabel,
        rankLabel,
      });
    }
  }

  return result;
});

function isSquareSelected(sq: Square): boolean {
  return props.selectedSquare === sq;
}

function isLastMoveSquare(sq: Square): boolean {
  if (!props.lastMove) return false;
  return props.lastMove.from === sq || props.lastMove.to === sq;
}

function isLegalMove(sq: Square): boolean {
  return props.legalMoves.includes(sq);
}

function isCapturableSquare(sq: Square, piece: { type: PieceType; color: PieceColor } | null): boolean {
  if (!isLegalMove(sq)) return false;
  if (piece && piece.color !== props.turn) return true;

  if (props.selectedSquare) {
    const selectedFile = props.selectedSquare.charAt(0);
    const sqFile = sq.charAt(0);
    if (selectedFile !== sqFile && !piece) {
      return true;
    }
  }
  return false;
}

function isSquareInCheck(sq: Square): boolean {
  return props.kingInCheckSquare === sq;
}

function isPieceDraggable(piece: { type: PieceType; color: PieceColor } | null): boolean {
  if (!isBoardInteractive.value || !piece) return false;
  if (piece.color !== props.turn) return false;
  if (props.myColor && piece.color !== props.myColor) return false;
  return true;
}

function handleSquareClick(sq: Square) {
  if (!isBoardInteractive.value) return;
  focusedSquare.value = sq;

  if (props.selectedSquare && props.legalMoves.includes(sq)) {
    const from = props.selectedSquare;
    const to = sq;

    const fromPiece = squaresList.value.find((s) => s.square === from)?.piece;
    if (fromPiece?.type === 'p') {
      const toRank = to.charAt(1);
      if ((fromPiece.color === 'w' && toRank === '8') || (fromPiece.color === 'b' && toRank === '1')) {
        emit('promotionRequired', { from, to });
        return;
      }
    }

    emit('move', { from, to });
    return;
  }

  emit('select', sq);
}

function handleSquareKeyDown(event: KeyboardEvent, currentSquare: Square) {
  if (!isBoardInteractive.value) return;

  const currIdx = squaresList.value.findIndex((s) => s.square === currentSquare);
  const safeIdx = currIdx >= 0 ? currIdx : 0;
  const row = Math.floor(safeIdx / 8);
  const col = safeIdx % 8;

  let nextRow = row;
  let nextCol = col;

  switch (event.key) {
    case 'ArrowUp':
      nextRow = Math.max(0, row - 1);
      break;
    case 'ArrowDown':
      nextRow = Math.min(7, row + 1);
      break;
    case 'ArrowLeft':
      nextCol = Math.max(0, col - 1);
      break;
    case 'ArrowRight':
      nextCol = Math.min(7, col + 1);
      break;
    case 'Home':
      nextCol = 0;
      if (event.ctrlKey) nextRow = 0;
      break;
    case 'End':
      nextCol = 7;
      if (event.ctrlKey) nextRow = 7;
      break;
    case 'PageUp':
      nextRow = 0;
      break;
    case 'PageDown':
      nextRow = 7;
      break;
    default:
      return;
  }

  const nextIdx = nextRow * 8 + nextCol;
  const nextSquare = squaresList.value[nextIdx]?.square;
  if (nextSquare) {
    focusedSquare.value = nextSquare;
    const targetEl = boardRef.value?.querySelector(`[data-square="${nextSquare}"]`) as HTMLElement | null;
    targetEl?.focus();
  }
}

function handlePieceSelect(sq: Square) {
  if (!isBoardInteractive.value) return;
  playPickup();
  handleSquareClick(sq);
}

function handleDragStart(sq: Square) {
  if (!isBoardInteractive.value) return;
  playPickup();
  emit('select', sq);
}

function handleDragEnd(
  fromSq: Square,
  _event: PointerEvent,
  clientPos: { x: number; y: number }
) {
  if (!isBoardInteractive.value) return;

  const element = document.elementFromPoint(clientPos.x, clientPos.y);
  const squareEl = element?.closest('[data-square]') as HTMLElement | null;
  const targetSq = squareEl?.getAttribute('data-square') as Square | null;

  if (targetSq && targetSq !== fromSq && props.legalMoves.includes(targetSq)) {
    const fromPiece = squaresList.value.find((s) => s.square === fromSq)?.piece;
    if (fromPiece?.type === 'p') {
      const toRank = targetSq.charAt(1);
      if ((fromPiece.color === 'w' && toRank === '8') || (fromPiece.color === 'b' && toRank === '1')) {
        emit('promotionRequired', { from: fromSq, to: targetSq });
        return;
      }
    }

    emit('move', { from: fromSq, to: targetSq });
  } else if (targetSq && targetSq !== fromSq && !props.legalMoves.includes(targetSq)) {
    playError();
  }
}
</script>

<template>
  <div
    ref="boardRef"
    class="chess-board-container"
    :class="{ 'is-disabled': !isBoardInteractive }"
    role="grid"
    aria-label="Chessboard, standard 8 by 8 grid"
  >
    <div class="chess-board-grid">
      <ChessSquare
        v-for="item in squaresList"
        :key="item.square"
        :square="item.square"
        :is-light="item.isLight"
        :is-selected="isSquareSelected(item.square)"
        :is-last-move="isLastMoveSquare(item.square)"
        :is-check="isSquareInCheck(item.square)"
        :is-valid-move="isLegalMove(item.square)"
        :is-capturable="isCapturableSquare(item.square, item.piece)"
        :is-square-active="activeSquare === item.square"
        :file-label="item.fileLabel"
        :rank-label="item.rankLabel"
        :has-piece="!!item.piece"
        :piece-description="item.piece ? `${item.piece.color === 'w' ? 'White' : 'Black'} ${item.piece.type}` : undefined"
        @select="handleSquareClick"
        @keydown="handleSquareKeyDown"
      >
        <ChessPiece
          v-if="item.piece"
          :color="item.piece.color"
          :type="item.piece.type"
          :square="item.square"
          :is-selected="isSquareSelected(item.square)"
          :is-draggable="isPieceDraggable(item.piece)"
          @select="handlePieceSelect"
          @drag-start="handleDragStart"
          @drag-end="handleDragEnd"
        />
      </ChessSquare>
    </div>
  </div>
</template>

<style scoped>
.chess-board-container {
  width: 100%;
  max-width: min(92vw, calc(78vh - 120px), 580px);
  aspect-ratio: 1 / 1;
  padding: 8px;
  background-color: var(--board-rim);
  border-radius: var(--radius-board);
  box-shadow: var(--shadow-lg);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  touch-action: none;
  margin: 0 auto;
  color-scheme: only light !important;
  forced-color-adjust: none !important;
}

.chess-board-container.is-disabled {
  opacity: 0.85;
  pointer-events: none;
}

.chess-board-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  width: 100%;
  height: 100%;
  border-radius: calc(var(--radius-board) - 8px);
  overflow: hidden;
  box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.25);
}
</style>
