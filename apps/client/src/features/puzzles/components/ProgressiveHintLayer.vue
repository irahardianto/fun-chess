<script lang="ts">
import type { Square, PieceColor } from '@fun-chess/shared';

export interface SquareCoordinates {
  x: number;
  y: number;
  centerX: number;
  centerY: number;
}

export function squareToCoordinates(
  sq: Square | string,
  orientation: PieceColor = 'w'
): SquareCoordinates {
  const file = sq.charAt(0).toLowerCase();
  const rank = sq.charAt(1);
  const fileNum = file.charCodeAt(0) - 97; // 'a' -> 0, ..., 'h' -> 7
  const rankNum = parseInt(rank, 10); // '1' -> 1, ..., '8' -> 8

  const col = orientation === 'w' ? fileNum : 7 - fileNum;
  const row = orientation === 'w' ? 8 - rankNum : rankNum - 1;

  const x = col * 12.5;
  const y = row * 12.5;
  const centerX = x + 6.25;
  const centerY = y + 6.25;

  return { x, y, centerX, centerY };
}
</script>

<script setup lang="ts">
import { computed } from 'vue';
import type { HintData, HintLevel } from '@fun-chess/shared';
import BaseButton from '../../../components/base/BaseButton.vue';

interface Props {
  hintData?: HintData | null;
  hintLevel?: HintLevel;
  hintsUsed?: number;
  disabled?: boolean;
  sourceSquare?: Square | null;
  targetSquare?: Square | null;
  movingPiece?: { type: string; color: string } | null;
  orientation?: PieceColor;
  boardFlipped?: boolean;
  fen?: string;
  showControls?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  hintData: null,
  hintLevel: 0,
  hintsUsed: 0,
  disabled: false,
  sourceSquare: undefined,
  targetSquare: undefined,
  movingPiece: undefined,
  orientation: 'w',
  boardFlipped: false,
  fen: undefined,
  showControls: true,
});

const emit = defineEmits<{
  (e: 'request-hint'): void;
}>();

const effectiveLevel = computed(() => {
  return props.hintLevel || props.hintData?.level || 0;
});

const effectiveSource = computed(() => {
  return props.sourceSquare || props.hintData?.sourceSquare;
});

const effectiveTarget = computed(() => {
  return props.targetSquare || props.hintData?.targetSquare;
});

const nudgeSquareStyle = computed(() => {
  if (!effectiveSource.value) return {};
  const coords = squareToCoordinates(effectiveSource.value, props.orientation);
  return {
    left: `${coords.x}%`,
    top: `${coords.y}%`,
    width: '12.5%',
    height: '12.5%',
  };
});

const beaconSquareStyle = computed(() => {
  if (!effectiveTarget.value) return {};
  const coords = squareToCoordinates(effectiveTarget.value, props.orientation);
  return {
    left: `${coords.x}%`,
    top: `${coords.y}%`,
    width: '12.5%',
    height: '12.5%',
  };
});

const arrowCoords = computed(() => {
  if (!effectiveSource.value || !effectiveTarget.value) return null;
  const src = squareToCoordinates(effectiveSource.value, props.orientation);
  const tgt = squareToCoordinates(effectiveTarget.value, props.orientation);
  return {
    x1: src.centerX,
    y1: src.centerY,
    x2: tgt.centerX,
    y2: tgt.centerY,
  };
});

const ghostPieceStyle = computed(() => {
  if (!effectiveTarget.value) return {};
  const coords = squareToCoordinates(effectiveTarget.value, props.orientation);
  return {
    left: `${coords.x}%`,
    top: `${coords.y}%`,
    width: '12.5%',
    height: '12.5%',
  };
});

const hintLabel = computed(() => {
  if (effectiveLevel.value === 0) return '💡 Get Hint';
  if (effectiveLevel.value === 1) return '🎯 Show Target';
  if (effectiveLevel.value === 2) return '👑 Show Solution';
  return '👑 Solution Shown';
});

const hintBadge = computed(() => {
  if (effectiveLevel.value === 0) return 'Level 0/3';
  return `Level ${effectiveLevel.value}/3`;
});
</script>

<template>
  <div class="progressive-hint-container" data-testid="progressive-hint-layer">
    <!-- Visual Board Overlays Frame Anchor -->
    <div class="hint-board-anchor">
      <slot />

      <!-- Visual Board Overlays (1:1 with ChessBoard) -->
      <div
        v-if="effectiveLevel >= 1 && effectiveSource"
        class="hint-nudge-square"
        data-testid="hint-nudge-square"
        :style="nudgeSquareStyle"
      />
      <div
        v-if="effectiveLevel >= 2 && effectiveTarget"
        class="hint-beacon-square"
        data-testid="hint-beacon-square"
        :style="beaconSquareStyle"
      />
      <svg
        v-if="effectiveLevel >= 3"
        class="hint-arrow-svg"
        data-testid="hint-arrow-svg"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="hint-arrowhead"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--academy-gold, #ffc107)" />
          </marker>
        </defs>
        <line
          v-if="arrowCoords"
          :x1="arrowCoords.x1"
          :y1="arrowCoords.y1"
          :x2="arrowCoords.x2"
          :y2="arrowCoords.y2"
          stroke="var(--academy-gold, #ffc107)"
          stroke-width="2.5"
          stroke-linecap="round"
          marker-end="url(#hint-arrowhead)"
          class="hint-arrow-line"
        />
      </svg>
      <div
        v-if="effectiveLevel >= 3 && movingPiece"
        class="hint-ghost-piece"
        data-testid="hint-ghost-piece"
        :style="ghostPieceStyle"
      />
    </div>

    <!-- Active Hint Card / Speech Bubble & Action Controls (in-flow below board) -->
    <div v-if="props.showControls" class="hint-controls-wrapper">
      <transition name="pop-fade">
        <div
          v-if="hintData && hintData.level > 0"
          class="hint-speech-bubble"
          data-testid="hint-speech-bubble"
        >
          <div class="hint-bubble-header">
            <span class="hint-bubble-badge" :data-tier="hintData.tier">
              {{ hintBadge }} ({{ hintData.tier.replace('_', ' ') }})
            </span>
            <span v-if="hintData.sourceSquare" class="hint-square-pill">
              Piece: {{ hintData.sourceSquare.toUpperCase() }}
            </span>
            <span v-if="hintData.targetSquare" class="hint-square-pill target">
              Target: {{ hintData.targetSquare.toUpperCase() }}
            </span>
          </div>

          <p class="hint-bubble-message">{{ hintData.message }}</p>

          <p v-if="hintData.mascotDialogue" class="hint-mascot-dialogue">
            {{ hintData.mascotDialogue }}
          </p>

          <div v-if="hintData.solutionSan" class="solution-callout">
            <span class="solution-label">Best Move:</span>
            <strong class="solution-san">{{ hintData.solutionSan }}</strong>
          </div>
        </div>
      </transition>

      <!-- Hint Action Button & 3-Tier Meter -->
      <div class="hint-action-bar">
        <BaseButton
          variant="accent"
          size="md"
          class="hint-request-btn"
          data-testid="request-hint-btn"
          :disabled="props.disabled || effectiveLevel >= 3"
          @click="emit('request-hint')"
        >
          <template #icon-left>💡</template>
          {{ hintLabel }}
        </BaseButton>

        <!-- Mini 3-dot Hint Meter -->
        <div class="hint-tier-meter" aria-label="Hint Meter" role="status">
          <span
            v-for="i in 3"
            :key="i"
            class="meter-dot"
            :class="{ 'is-active': effectiveLevel >= i }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progressive-hint-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3, 12px);
  width: 100%;
  position: relative;
}

.hint-board-anchor {
  position: relative;
  width: 100%;
  max-width: min(92vw, calc(78vh - 120px), 580px);
  aspect-ratio: 1 / 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.hint-nudge-square,
.hint-beacon-square,
.hint-arrow-svg,
.hint-ghost-piece {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: var(--z-board-indicator, 8);
}

.hint-nudge-square {
  position: absolute;
  inset: 0;
  border: 3.5px solid var(--academy-gold, #ffc107);
  border-radius: var(--radius-sm, 8px);
  box-shadow: 0 0 14px rgba(255, 193, 7, 0.8), inset 0 0 8px rgba(255, 193, 7, 0.4);
  background-color: rgba(255, 193, 7, 0.25);
  animation: nudge-pulse 1.8s infinite ease-in-out;
  box-sizing: border-box;
}

.hint-beacon-square {
  right: auto;
  bottom: auto;
  border: 3.5px solid var(--color-success, #22c55e);
  border-radius: var(--radius-sm, 8px);
  box-shadow: 0 0 16px rgba(34, 197, 94, 0.85), inset 0 0 8px rgba(34, 197, 94, 0.45);
  background-color: rgba(34, 197, 94, 0.28);
  animation: beacon-pulse 1.8s infinite ease-in-out;
  box-sizing: border-box;
}

.hint-arrow-svg {
  width: 100%;
  height: 100%;
  z-index: var(--z-board-indicator, 9);
}

.hint-arrow-line {
  filter: drop-shadow(0 0 4px rgba(255, 193, 7, 0.9));
  animation: arrow-glow 2s infinite ease-in-out;
}

.hint-ghost-piece {
  right: auto;
  bottom: auto;
  opacity: 0.7;
}

@keyframes nudge-pulse {
  0%, 100% {
    transform: scale(0.95);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.05);
    opacity: 1;
  }
}

@keyframes beacon-pulse {
  0%, 100% {
    transform: scale(0.95);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.05);
    opacity: 1;
  }
}

@keyframes arrow-glow {
  0%, 100% {
    opacity: 0.85;
    stroke-width: 2.2;
  }
  50% {
    opacity: 1;
    stroke-width: 3.2;
  }
}

.hint-controls-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3, 12px);
  width: 100%;
  max-width: 580px;
}

.hint-speech-bubble {
  width: 100%;
  padding: var(--space-3, 12px) var(--space-4, 16px);
  background: var(--hint-banner-bg, #fffbeb);
  border: 2px solid var(--hint-banner-border, #ffc107);
  border-radius: var(--radius-card, 22px);
  box-shadow: var(--shadow-sm, 0 2px 6px rgba(15, 23, 42, 0.09));
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  box-sizing: border-box;
}

.hint-bubble-header {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}

.hint-bubble-badge {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 9999px);
  background: var(--academy-gold, #ffc107);
  color: #1e1b4b;
  text-transform: capitalize;
}

.hint-square-pill {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-sm, 8px);
  background: rgba(15, 23, 42, 0.08);
  color: var(--text-main, #0f172a);
}

.hint-square-pill.target {
  background: rgba(34, 197, 94, 0.2);
  color: var(--color-success-text, #166534);
}

.hint-bubble-message {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-base, 16px);
  color: var(--hint-banner-text, #451a03);
  margin: 0;
  font-weight: 600;
}

.hint-mascot-dialogue {
  font-family: var(--font-display);
  font-size: var(--text-sm, 14px);
  color: var(--text-muted, #64748b);
  margin: 0;
  font-style: italic;
}

.solution-callout {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-1, 4px) var(--space-2, 8px);
  background: rgba(34, 197, 94, 0.15);
  border-radius: var(--radius-sm, 8px);
  width: fit-content;
}

.solution-label {
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  color: var(--text-muted, #64748b);
}

.solution-san {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-base, 16px);
  color: var(--color-success-text, #166534);
}

.hint-action-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}

.hint-tier-meter {
  display: flex;
  gap: var(--space-1, 4px);
}

.meter-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--hint-meter-empty, #e2e8f0);
  transition: background-color var(--duration-fast, 140ms) var(--ease-spring), box-shadow var(--duration-fast, 140ms) ease, transform var(--duration-fast, 140ms) var(--ease-spring);
}

.meter-dot.is-active {
  background: var(--academy-gold, #ffc107);
  box-shadow: 0 0 8px rgba(255, 193, 7, 0.8);
  transform: scale(1.15);
}

.pop-fade-enter-active,
.pop-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s var(--ease-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275));
}

.pop-fade-enter-from,
.pop-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}
</style>
