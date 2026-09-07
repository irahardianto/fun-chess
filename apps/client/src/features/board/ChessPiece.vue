<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PieceColor, PieceType, Square } from '@fun-chess/shared';
import type { PieceKey } from '@/assets/pieces';
import { logger } from '@/platform/telemetry/index.js';
import ChessPieceSvg from '../../components/base/ChessPieceSvg.vue';

interface Props {
  piece?: PieceKey;
  color?: PieceColor;
  type?: PieceType;
  square?: Square;
  isSelected?: boolean;
  isDragging?: boolean;
  draggable?: boolean;
  isDraggable?: boolean;
  size?: number | string;
}

const props = withDefaults(defineProps<Props>(), {
  piece: undefined,
  color: undefined,
  type: undefined,
  square: undefined,
  isSelected: false,
  isDragging: false,
  draggable: true,
  isDraggable: true,
  size: '100%',
});

const emit = defineEmits<{
  click: [event: MouseEvent];
  select: [square: Square];
  dragstart: [event: DragEvent];
  dragStart: [square: Square, event: PointerEvent];
  dragMove: [square: Square, event: PointerEvent, offset: { x: number; y: number }];
  dragEnd: [square: Square, event: PointerEvent, clientPos: { x: number; y: number }];
}>();

const resolvedColor = computed<PieceColor>(() => {
  if (props.color) return props.color;
  if (props.piece) return props.piece.charAt(0) as PieceColor;
  return 'w';
});

const resolvedType = computed<PieceType>(() => {
  if (props.type) return props.type;
  if (props.piece) return props.piece.charAt(1).toLowerCase() as PieceType;
  return 'p';
});

const resolvedKey = computed<PieceKey>(() => {
  if (props.piece) return props.piece;
  return `${resolvedColor.value}${resolvedType.value.toUpperCase()}` as PieceKey;
});

const isInternalDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });
const startPos = ref({ x: 0, y: 0 });
const pointerId = ref<number | null>(null);

const pieceNameMap: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

const accessibleLabel = computed(() => {
  const colorName = resolvedColor.value === 'w' ? 'White' : 'Black';
  const pieceName = pieceNameMap[resolvedType.value] || resolvedType.value;
  return `${colorName} ${pieceName}${props.square ? ` on ${props.square}` : ''}`;
});

const isDraggableActive = computed(() => props.draggable && props.isDraggable);

function handleClick(e: MouseEvent) {
  emit('click', e);
  if (props.square) {
    emit('select', props.square);
  }
}

function handlePointerDown(e: PointerEvent) {
  if (!isDraggableActive.value || e.button !== 0) return;

  const target = e.currentTarget as HTMLElement;
  pointerId.value = e.pointerId;
  try {
    target.setPointerCapture(e.pointerId);
  } catch (err) {
    logger.warn('Failed to set pointer capture', {
      operation: 'set_pointer_capture',
      pointerId: e.pointerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  startPos.value = { x: e.clientX, y: e.clientY };
  dragOffset.value = { x: 0, y: 0 };
  isInternalDragging.value = false;
}

function handlePointerMove(e: PointerEvent) {
  if (pointerId.value !== e.pointerId) return;

  const dx = e.clientX - startPos.value.x;
  const dy = e.clientY - startPos.value.y;

  if (!isInternalDragging.value && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
    isInternalDragging.value = true;
    if (props.square) {
      emit('dragStart', props.square, e);
    }
  }

  if (isInternalDragging.value) {
    dragOffset.value = { x: dx, y: dy };
    if (props.square) {
      emit('dragMove', props.square, e, { x: dx, y: dy });
    }
  }
}

function handlePointerUp(e: PointerEvent) {
  if (pointerId.value !== e.pointerId) return;

  const target = e.currentTarget as HTMLElement;
  try {
    target.releasePointerCapture(e.pointerId);
  } catch (err) {
    logger.warn('Failed to release pointer capture', {
      operation: 'release_pointer_capture',
      pointerId: e.pointerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const wasDragging = isInternalDragging.value;
  isInternalDragging.value = false;
  pointerId.value = null;

  if (wasDragging && props.square) {
    emit('dragEnd', props.square, e, { x: e.clientX, y: e.clientY });
  } else if (!wasDragging && props.square) {
    emit('select', props.square);
  }

  dragOffset.value = { x: 0, y: 0 };
}

function handlePointerCancel(e: PointerEvent) {
  if (pointerId.value === e.pointerId) {
    isInternalDragging.value = false;
    pointerId.value = null;
    dragOffset.value = { x: 0, y: 0 };
  }
}

function handleDragStartNative(e: DragEvent) {
  if (isDraggableActive.value) {
    emit('dragstart', e);
  }
}

const draggingComputed = computed(() => props.isDragging || isInternalDragging.value);

const pieceStyle = computed(() => {
  if (isInternalDragging.value) {
    return {
      transform: `translate3d(${dragOffset.value.x}px, ${dragOffset.value.y}px, 0) translateY(-8px) scale(1.15)`,
      zIndex: 100,
      cursor: 'grabbing',
    };
  }
  return {};
});
</script>

<template>
  <div
    class="chess-piece-wrapper"
    :class="{
      'is-selected': props.isSelected,
      'is-dragging': draggingComputed,
      'is-interactive': isDraggableActive,
    }"
    :style="pieceStyle"
    :data-testid="'chess-piece'"
    :data-piece="resolvedKey"
    :draggable="isDraggableActive"
    role="button"
    :aria-label="accessibleLabel"
    tabindex="-1"
    @click="handleClick"
    @dragstart="handleDragStartNative"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
  >
    <ChessPieceSvg
      :color="resolvedColor"
      :type="resolvedType"
      :size="props.size"
    />
  </div>
</template>

<style scoped>
.chess-piece-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  user-select: none;
  touch-action: none;
  cursor: pointer;
  color-scheme: only light !important;
  forced-color-adjust: none !important;
  transition: transform var(--duration-fast) var(--ease-spring),
              filter var(--duration-fast) ease;
}

.chess-piece-wrapper.is-interactive:hover:not(.is-dragging) {
  transform: translateY(-3px) scale(1.05);
}

.chess-piece-wrapper.is-selected:not(.is-dragging) {
  transform: translateY(-6px) scale(1.12);
  filter: drop-shadow(var(--glow-piece-lift));
  z-index: 25;
}

.chess-piece-wrapper.is-dragging {
  cursor: grabbing;
  filter: drop-shadow(var(--glow-piece-lift));
  pointer-events: none;
  transition: none;
}
</style>
