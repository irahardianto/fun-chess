<script setup lang="ts">
import { computed } from 'vue';
import type { Square } from '@fun-chess/shared';
import MoveIndicator from './MoveIndicator.vue';

interface Props {
  square: Square;
  isLight: boolean;
  isSelected?: boolean;
  isLastMove?: boolean;
  isCheck?: boolean;
  isInCheck?: boolean;
  isValidMove?: boolean;
  isCapturable?: boolean;
  isCaptureTarget?: boolean;
  isSquareActive?: boolean;
  isFocused?: boolean;
  showRankLabel?: boolean;
  showFileLabel?: boolean;
  rankLabel?: string;
  fileLabel?: string;
  hasPiece?: boolean;
  pieceDescription?: string;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
  isLastMove: false,
  isCheck: false,
  isInCheck: false,
  isValidMove: false,
  isCapturable: false,
  isCaptureTarget: false,
  isSquareActive: false,
  isFocused: false,
  showRankLabel: undefined,
  showFileLabel: undefined,
  rankLabel: undefined,
  fileLabel: undefined,
  hasPiece: false,
  pieceDescription: undefined,
});

const emit = defineEmits<{
  select: [square: Square];
  click: [square: Square];
  drop: [fromSquare: string, toSquare: Square];
  keydown: [event: KeyboardEvent, square: Square];
}>();

const checkedState = computed(() => props.isCheck || props.isInCheck);
const capturableState = computed(() => props.isCapturable || props.isCaptureTarget);
const isSquareActive = computed(() => props.isSquareActive || props.isFocused || false);

const squareClasses = computed(() => [
  'chess-square',
  props.isLight ? 'is-light chess-square--light' : 'is-dark chess-square--dark',
  {
    'is-selected': props.isSelected,
    'is-last-move': props.isLastMove,
    'square-in-check': checkedState.value,
    'has-valid-move': props.isValidMove,
    'has-capturable-target': capturableState.value,
  },
]);

const shouldShowRank = computed(() => {
  if (props.showRankLabel !== undefined) return props.showRankLabel && !!props.rankLabel;
  return !!props.rankLabel;
});

const shouldShowFile = computed(() => {
  if (props.showFileLabel !== undefined) return props.showFileLabel && !!props.fileLabel;
  return !!props.fileLabel;
});

const ariaLabel = computed(() => {
  let label = `Square ${props.square}`;
  if (props.pieceDescription) {
    label += `, contains ${props.pieceDescription}`;
  } else {
    label += ', empty';
  }
  if (checkedState.value) {
    label += ', King in check!';
  } else if (capturableState.value) {
    label += ', capturable target';
  } else if (props.isValidMove) {
    label += ', legal move target';
  }
  return label;
});

function handleClick() {
  emit('select', props.square);
  emit('click', props.square);
}

function handleSquareArrowNav(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleClick();
    return;
  }

  const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
  if (navKeys.includes(event.key)) {
    event.preventDefault();
    emit('keydown', event, props.square);
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  const fromSquare = event.dataTransfer?.getData('text/plain') || '';
  emit('drop', fromSquare, props.square);
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
}
</script>

<template>
  <div
    :class="squareClasses"
    :data-square="props.square"
    role="gridcell"
    :aria-label="ariaLabel"
    :tabindex="isSquareActive ? 0 : -1"
    @click="handleClick"
    @drop="handleDrop"
    @dragover="handleDragOver"
    @keydown="handleSquareArrowNav"
  >
    <!-- Rank Coordinate Label (Top Left) -->
    <span
      v-if="shouldShowRank"
      class="square-coord square-coord--rank rank-label"
      :class="props.isLight ? 'coord-on-light' : 'coord-on-dark'"
      aria-hidden="true"
    >
      {{ props.rankLabel }}
    </span>

    <!-- Piece Slot -->
    <slot />

    <!-- Move Indicator -->
    <MoveIndicator
      v-if="(props.isValidMove && !props.hasPiece && !capturableState) || capturableState"
      :is-capture="capturableState"
    />

    <!-- File Coordinate Label (Bottom Right) -->
    <span
      v-if="shouldShowFile"
      class="square-coord square-coord--file file-label"
      :class="props.isLight ? 'coord-on-light' : 'coord-on-dark'"
      aria-hidden="true"
    >
      {{ props.fileLabel }}
    </span>
  </div>
</template>

<style scoped>
.chess-square {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  user-select: none;
  touch-action: none;
  box-sizing: border-box;
  color-scheme: only light !important;
  forced-color-adjust: none !important;
  transition: background-color var(--duration-fast) ease,
              box-shadow var(--duration-fast) ease;
  overflow: visible;
}

.chess-square:focus-visible {
  outline: 3px solid var(--border-focus, #6c5ce7);
  outline-offset: -3px;
  z-index: 5;
}

.chess-square--light,
.is-light {
  background-color: var(--board-light-sq);
}

.chess-square--dark,
.is-dark {
  background-color: var(--board-dark-sq);
}

.chess-square.is-selected {
  background-color: var(--highlight-selected) !important;
  box-shadow: inset 0 0 0 3px rgba(255, 179, 0, 0.9);
}

.chess-square.is-last-move:not(.is-selected):not(.square-in-check) {
  background-color: var(--highlight-last-move);
}

.chess-square.square-in-check {
  animation: check-strobe 1.2s infinite ease-in-out !important;
}

.chess-square.has-valid-move:hover {
  background-color: var(--highlight-valid-hover);
}

.move-indicator-wrapper {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.valid-move-dot {
  position: absolute;
  width: 32%;
  height: 32%;
  border-radius: var(--radius-pill);
  background-color: var(--highlight-valid-dot);
  box-shadow: var(--glow-valid-move);
  animation: pulse-valid-dot var(--duration-pulse) infinite ease-in-out;
  pointer-events: none;
}

.capture-target-ring {
  position: absolute;
  inset: 6%;
  border-radius: var(--radius-md);
  pointer-events: none;
  animation: pulse-capture-ring 1.1s infinite ease-in-out;
}

.square-coord {
  position: absolute;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-heavy);
  line-height: 1;
  pointer-events: none;
  user-select: none;
}

.square-coord--rank {
  inset-block-start: 4px;
  inset-inline-start: 5px;
}

.square-coord--file {
  inset-block-end: 4px;
  inset-inline-end: 5px;
}

.coord-on-light {
  color: var(--board-coord-light, #5c381e);
}

.coord-on-dark {
  color: var(--board-coord-dark, #3d220f);
}
</style>
