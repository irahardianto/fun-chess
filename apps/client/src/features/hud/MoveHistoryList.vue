<script setup lang="ts">
import { computed, watch, nextTick, useTemplateRef } from 'vue';
import type { MoveResult } from '@fun-chess/shared';

interface Props {
  moves?: MoveResult[];
}

const props = withDefaults(defineProps<Props>(), {
  moves: () => [],
});

const listContainerRef = useTemplateRef<HTMLElement>('listContainerRef');

interface MovePair {
  moveNumber: number;
  white?: MoveResult;
  black?: MoveResult;
}

const movePairs = computed<MovePair[]>(() => {
  const pairs: MovePair[] = [];
  const moves = props.moves;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const pairIndex = Math.floor(i / 2);
    const moveNumber = pairIndex + 1;

    if (!pairs[pairIndex]) {
      pairs[pairIndex] = { moveNumber };
    }

    if (move.color === 'w') {
      pairs[pairIndex].white = move;
    } else {
      pairs[pairIndex].black = move;
    }
  }

  return pairs;
});

// Auto-scroll to bottom on new moves
watch(
  () => props.moves.length,
  async () => {
    await nextTick();
    if (listContainerRef.value) {
      listContainerRef.value.scrollTop = listContainerRef.value.scrollHeight;
    }
  }
);
</script>

<template>
  <div class="move-history-card">
    <div class="history-header">
      <span class="history-title">📜 Move History</span>
      <span class="move-count">{{ props.moves.length }} plies</span>
    </div>

    <div ref="listContainerRef" class="history-scroll-area" tabindex="0" aria-label="Move history list">
      <div v-if="movePairs.length === 0" class="history-empty empty-history">
        No moves yet. Make your first move! ♟️
      </div>

      <div
        v-for="pair in movePairs"
        :key="pair.moveNumber"
        data-testid="move-history-row"
        class="move-row"
      >
        <span class="move-index">{{ pair.moveNumber }}.</span>
        <span
          class="move-san move-white"
          :class="{ 'is-latest': pair.white && !pair.black && pair.moveNumber === movePairs.length }"
        >
          {{ pair.white?.san || '' }}
        </span>
        <span
          class="move-san move-black"
          :class="{ 'is-latest': pair.black && pair.moveNumber === movePairs.length }"
        >
          {{ pair.black?.san || '' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.move-history-card {
  display: flex;
  flex-direction: column;
  background-color: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  height: 100%;
  min-height: 160px;
  max-height: 280px;
  box-sizing: border-box;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background-color: var(--bg-surface-raised);
  border-bottom: 1px solid var(--border-subtle);
}

.history-title {
  font-family: var(--font-display);
  font-weight: var(--weight-bold);
  font-size: var(--text-sm);
  color: var(--text-main);
}

.move-count {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.history-scroll-area {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--space-2) var(--space-3);
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  scroll-behavior: smooth;
  font-variant-numeric: tabular-nums;
}

.history-empty,
.empty-history {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-faint);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  text-align: center;
  padding: var(--space-4) 0;
}

.move-row {
  display: grid;
  grid-template-columns: 36px 1fr 1fr;
  align-items: center;
  padding: 2px var(--space-1);
  border-radius: var(--radius-xs);
  transition: background-color var(--duration-instant) ease;
}

.move-row:hover {
  background-color: var(--color-primary-subtle);
}

.move-index {
  color: var(--text-faint);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}

.move-san {
  color: var(--text-main);
  font-weight: var(--weight-bold);
  font-variant-numeric: tabular-nums;
}

.move-san.is-latest {
  color: var(--color-primary);
  background-color: var(--color-primary-subtle);
  padding: 1px 4px;
  border-radius: var(--radius-xs);
}
</style>
