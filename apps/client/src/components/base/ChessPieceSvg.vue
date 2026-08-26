<script setup lang="ts">
import { computed } from 'vue';
import type { PieceColor, PieceType } from '@fun-chess/shared';
import type { PieceKey } from '@/assets/pieces';

interface Props {
  piece?: PieceKey;
  color?: PieceColor;
  type?: PieceType;
  size?: number | string;
}

const props = withDefaults(defineProps<Props>(), {
  piece: undefined,
  color: undefined,
  type: undefined,
  size: '100%',
});

const resolvedKey = computed<PieceKey | null>(() => {
  if (props.piece) return props.piece;
  if (props.color && props.type) {
    return `${props.color}${props.type.toUpperCase()}` as PieceKey;
  }
  return null;
});

const formattedSize = computed(() => {
  if (typeof props.size === 'number') {
    return `${props.size}px`;
  }
  return props.size;
});
</script>

<template>
  <svg
    v-if="resolvedKey"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 45 45"
    :width="formattedSize"
    :height="formattedSize"
    class="chess-piece-svg"
    :data-piece="resolvedKey"
    aria-hidden="true"
  >
    <!-- WHITE PAWN -->
    <template v-if="resolvedKey === 'wP'">
      <path
        d="m22.5 9c-2.21 0-4 1.79-4 4 0 0.89 0.29 1.71 0.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03 0.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62 0.49-0.67 0.78-1.49 0.78-2.38 0-2.21-1.79-4-4-4z"
        stroke="#1e293b"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="#ffffff"
      />
    </template>

    <!-- WHITE KNIGHT -->
    <template v-else-if="resolvedKey === 'wN'">
      <g fill="none" fill-rule="evenodd" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" fill="#ffffff" />
        <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" fill="#ffffff" />
        <path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" fill="#1e293b" />
        <path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" fill="#1e293b" />
      </g>
    </template>

    <!-- WHITE BISHOP -->
    <template v-else-if="resolvedKey === 'wB'">
      <g fill="none" fill-rule="evenodd" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <g fill="#ffffff" stroke-linecap="butt">
          <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.54 9,36 9,36 z" />
          <path d="M 12,36 C 12,32 17,29 17,25 C 17,22 14.5,19 14.5,14.5 C 14.5,10 18,6 22.5,6 C 27,6 30.5,10 30.5,14.5 C 30.5,19 28,22 28,25 C 28,29 33,32 33,36 z" />
          <path d="M 17.5,26 L 27.5,26" />
        </g>
        <path d="M 22.5,10 L 22.5,13 M 21,11.5 L 24,11.5" stroke="#1e293b" stroke-width="1.5" />
        <path d="M 17.5,16 C 19,15 21,14.5 22.5,14.5 C 24,14.5 26,15 27.5,16" stroke="#1e293b" />
        <path d="M 20,18.5 L 25,23.5 M 25,18.5 L 20,23.5" stroke="#1e293b" />
      </g>
    </template>

    <!-- WHITE ROOK -->
    <template v-else-if="resolvedKey === 'wR'">
      <g fill="#ffffff" fill-rule="evenodd" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 9,39 L 36,39 L 36,36 L 9,36 z" />
        <path d="M 12,36 L 12,32 L 33,32 L 33,36 z" />
        <path d="M 11,14 L 34,14 L 34,9 L 29,9 L 29,11 L 25,11 L 25,9 L 20,9 L 20,11 L 16,11 L 16,9 L 11,9 z" />
        <path d="M 14,32 L 31,32 L 31,14 L 14,14 z" />
        <path d="M 14,29 L 31,29" />
        <path d="M 14,26 L 31,26" />
        <path d="M 14,17 L 31,17" />
      </g>
    </template>

    <!-- WHITE QUEEN -->
    <template v-else-if="resolvedKey === 'wQ'">
      <g fill="#ffffff" fill-rule="evenodd" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 8 12 A 2 2 0 1 1 4,12 A 2 2 0 1 1 8 12 z" />
        <path d="M 16 8.5 A 2 2 0 1 1 12,8.5 A 2 2 0 1 1 16 8.5 z" />
        <path d="M 24.5 7.5 A 2 2 0 1 1 20.5,7.5 A 2 2 0 1 1 24.5 7.5 z" />
        <path d="M 33 8.5 A 2 2 0 1 1 29,8.5 A 2 2 0 1 1 33 8.5 z" />
        <path d="M 41 12 A 2 2 0 1 1 37,12 A 2 2 0 1 1 41 12 z" />
        <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38,14 L 31,25 L 22.5,10 L 14,25 L 7,14 z" />
        <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 10.5,36 10.5,36 C 9,37.5 11,38.5 11,38.5 L 34,38.5 C 34,38.5 36,37.5 34.5,36 C 34.5,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 z" />
        <path d="M 11.5,30 C 15,29 30,29 33.5,30" />
        <path d="M 12,33.5 C 18,32.5 27,32.5 33,33.5" />
      </g>
    </template>

    <!-- WHITE KING -->
    <template v-else-if="resolvedKey === 'wK'">
      <g fill="none" fill-rule="evenodd" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 22.5,11.63 L 22.5,6" />
        <path d="M 20,8 L 25,8" />
        <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 24,11.5 21,11.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" fill="#ffffff" stroke-linecap="butt" />
        <path d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 C 36.5,35 34.5,31 31.5,30 C 28.5,29 27,30 22.5,30 C 18,30 16.5,29 13.5,30 C 10.5,31 8.5,35 11.5,37 z" fill="#ffffff" />
        <path d="M 11.5,30 C 17,27 28,27 33.5,30" />
        <path d="M 11.5,33.5 C 17,30.5 28,30.5 33.5,33.5" />
        <path d="M 11.5,37 C 17,34 28,34 33.5,37" />
      </g>
    </template>

    <!-- BLACK PAWN -->
    <template v-else-if="resolvedKey === 'bP'">
      <path
        d="m22.5 9c-2.21 0-4 1.79-4 4 0 0.89 0.29 1.71 0.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03 0.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62 0.49-0.67 0.78-1.49 0.78-2.38 0-2.21-1.79-4-4-4z"
        stroke="#0f172a"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="#262a36"
      />
    </template>

    <!-- BLACK KNIGHT -->
    <template v-else-if="resolvedKey === 'bN'">
      <g fill="none" fill-rule="evenodd" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" fill="#262a36" />
        <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" fill="#262a36" />
        <path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" fill="#ffffff" />
        <path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" fill="#ffffff" />
      </g>
    </template>

    <!-- BLACK BISHOP -->
    <template v-else-if="resolvedKey === 'bB'">
      <g fill="none" fill-rule="evenodd" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <g fill="#262a36" stroke-linecap="butt">
          <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.54 9,36 9,36 z" />
          <path d="M 12,36 C 12,32 17,29 17,25 C 17,22 14.5,19 14.5,14.5 C 14.5,10 18,6 22.5,6 C 27,6 30.5,10 30.5,14.5 C 30.5,19 28,22 28,25 C 28,29 33,32 33,36 z" />
          <path d="M 17.5,26 L 27.5,26" stroke="#ffffff" stroke-width="1.5" />
        </g>
        <path d="M 22.5,10 L 22.5,13 M 21,11.5 L 24,11.5" stroke="#ffffff" stroke-width="1.5" />
        <path d="M 17.5,16 C 19,15 21,14.5 22.5,14.5 C 24,14.5 26,15 27.5,16" stroke="#ffffff" />
        <path d="M 20,18.5 L 25,23.5 M 25,18.5 L 20,23.5" stroke="#ffffff" />
      </g>
    </template>

    <!-- BLACK ROOK -->
    <template v-else-if="resolvedKey === 'bR'">
      <g fill="#262a36" fill-rule="evenodd" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 9,39 L 36,39 L 36,36 L 9,36 z" />
        <path d="M 12,36 L 12,32 L 33,32 L 33,36 z" />
        <path d="M 11,14 L 34,14 L 34,9 L 29,9 L 29,11 L 25,11 L 25,9 L 20,9 L 20,11 L 16,11 L 16,9 L 11,9 z" />
        <path d="M 14,32 L 31,32 L 31,14 L 14,14 z" />
        <path d="M 14,29 L 31,29" stroke="#ffffff" stroke-width="1.2" />
        <path d="M 14,26 L 31,26" stroke="#ffffff" stroke-width="1.2" />
        <path d="M 14,17 L 31,17" stroke="#ffffff" stroke-width="1.2" />
      </g>
    </template>

    <!-- BLACK QUEEN -->
    <template v-else-if="resolvedKey === 'bQ'">
      <g fill="#262a36" fill-rule="evenodd" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 8 12 A 2 2 0 1 1 4,12 A 2 2 0 1 1 8 12 z" />
        <path d="M 16 8.5 A 2 2 0 1 1 12,8.5 A 2 2 0 1 1 16 8.5 z" />
        <path d="M 24.5 7.5 A 2 2 0 1 1 20.5,7.5 A 2 2 0 1 1 24.5 7.5 z" />
        <path d="M 33 8.5 A 2 2 0 1 1 29,8.5 A 2 2 0 1 1 33 8.5 z" />
        <path d="M 41 12 A 2 2 0 1 1 37,12 A 2 2 0 1 1 41 12 z" />
        <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38,14 L 31,25 L 22.5,10 L 14,25 L 7,14 z" />
        <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 10.5,36 10.5,36 C 9,37.5 11,38.5 11,38.5 L 34,38.5 C 34,38.5 36,37.5 34.5,36 C 34.5,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 z" />
        <path d="M 11.5,30 C 15,29 30,29 33.5,30" stroke="#ffffff" stroke-width="1.2" />
        <path d="M 12,33.5 C 18,32.5 27,32.5 33,33.5" stroke="#ffffff" stroke-width="1.2" />
      </g>
    </template>

    <!-- BLACK KING -->
    <template v-else-if="resolvedKey === 'bK'">
      <g fill="none" fill-rule="evenodd" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 22.5,11.63 L 22.5,6" stroke="#0f172a" />
        <path d="M 20,8 L 25,8" stroke="#0f172a" />
        <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 24,11.5 21,11.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" fill="#262a36" stroke-linecap="butt" />
        <path d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 C 36.5,35 34.5,31 31.5,30 C 28.5,29 27,30 22.5,30 C 18,30 16.5,29 13.5,30 C 10.5,31 8.5,35 11.5,37 z" fill="#262a36" />
        <path d="M 11.5,30 C 17,27 28,27 33.5,30" stroke="#ffffff" stroke-width="1.2" />
        <path d="M 11.5,33.5 C 17,30.5 28,30.5 33.5,33.5" stroke="#ffffff" stroke-width="1.2" />
        <path d="M 11.5,37 C 17,34 28,34 33.5,37" stroke="#ffffff" stroke-width="1.2" />
      </g>
    </template>
  </svg>
</template>

<style scoped>
.chess-piece-svg {
  display: block;
  user-select: none;
  pointer-events: none;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15));
  color-scheme: only light !important;
  forced-color-adjust: none !important;
}

.chess-piece-svg *,
.chess-piece-svg path,
.chess-piece-svg g {
  forced-color-adjust: none !important;
  color-scheme: only light !important;
}
</style>
