<script setup lang="ts">
import { computed } from 'vue';
import type { PieceColor, PieceType } from '@fun-chess/shared';
import ChessPieceSvg from '../../components/base/ChessPieceSvg.vue';

interface Props {
  capturedPieces?: PieceType[];
  color?: PieceColor;
  pieceColor?: PieceColor;
  materialAdvantage?: number;
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  capturedPieces: () => [],
  color: undefined,
  pieceColor: undefined,
  materialAdvantage: 0,
  label: undefined,
});

const resolvedColor = computed<PieceColor>(() => {
  return props.color || props.pieceColor || 'w';
});

// Sort pieces by standard chess value hierarchy: Q (9), R (5), B (3), N (3), P (1)
const pieceOrder: Record<PieceType, number> = {
  q: 1,
  r: 2,
  b: 3,
  n: 4,
  p: 5,
  k: 6,
};

const sortedPieces = computed(() => {
  return [...props.capturedPieces].sort((a, b) => pieceOrder[a] - pieceOrder[b]);
});
</script>

<template>
  <div class="captured-tray" role="region" :aria-label="props.label || 'Captured pieces tray'">
    <!-- Empty Tray Label -->
    <span
      v-if="sortedPieces.length === 0"
      class="empty-tray-label"
    >
      No captures
    </span>

    <!-- Pieces list with slight overlap -->
    <div v-else class="pieces-row">
      <span
        v-for="(pieceType, idx) in sortedPieces"
        :key="`${pieceType}-${idx}`"
        class="captured-piece-item tray-piece-item"
        :style="{ zIndex: idx + 1 }"
      >
        <ChessPieceSvg
          :color="resolvedColor"
          :type="pieceType"
          :size="22"
        />
      </span>
    </div>

    <!-- Material Score Badge -->
    <span
      v-if="props.materialAdvantage > 0"
      data-testid="material-advantage"
      class="material-badge"
      :aria-label="`+${props.materialAdvantage} material advantage`"
    >
      +{{ props.materialAdvantage }}
    </span>
  </div>
</template>

<style scoped>
.captured-tray {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 32px;
  padding: var(--space-1) var(--space-2);
  background-color: var(--bg-surface);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  box-sizing: border-box;
}

.empty-tray-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-faint);
  font-style: italic;
  padding: 0 var(--space-1);
}

.pieces-row {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  min-width: 24px;
  max-width: 140px;
  overflow-x: auto;
  scrollbar-width: none;
}

.pieces-row::-webkit-scrollbar {
  display: none;
}

.captured-piece-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: -6px;
  color-scheme: only light !important;
  forced-color-adjust: none !important;
  transition: transform var(--duration-fast) ease;
}

.captured-piece-item:first-child {
  margin-left: 0;
}

.captured-piece-item:hover {
  transform: translateY(-2px) scale(1.2);
  z-index: 50 !important;
}

.material-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-success);
  color: var(--text-on-success);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  font-variant-numeric: tabular-nums;
  padding: 1px var(--space-2);
  border-radius: var(--radius-pill);
  line-height: 1.2;
  box-shadow: var(--shadow-xs);
}
</style>
