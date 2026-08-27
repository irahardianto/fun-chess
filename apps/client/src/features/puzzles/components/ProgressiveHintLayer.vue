<script setup lang="ts">
import { computed } from 'vue';
import type { HintData, HintLevel, Square, PieceColor } from '@fun-chess/shared';
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

const hintLabel = computed(() => {
  if (effectiveLevel.value === 0) return '💡 Need a Hint?';
  if (effectiveLevel.value === 1) return '🎯 Show Target?';
  if (effectiveLevel.value === 2) return '👑 Show Solution!';
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
      />
      <div
        v-if="effectiveLevel >= 2 && effectiveTarget"
        class="hint-beacon-square"
        data-testid="hint-beacon-square"
      />
      <svg
        v-if="effectiveLevel >= 3"
        class="hint-arrow-svg"
        data-testid="hint-arrow-svg"
        viewBox="0 0 100 100"
      />
      <div
        v-if="effectiveLevel >= 3 && movingPiece"
        class="hint-ghost-piece"
        data-testid="hint-ghost-piece"
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
  transition: all var(--duration-fast, 140ms) var(--ease-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275));
}

.meter-dot.is-active {
  background: var(--academy-gold, #ffc107);
  box-shadow: 0 0 8px rgba(255, 193, 7, 0.8);
  transform: scale(1.15);
}

.pop-fade-enter-active,
.pop-fade-leave-active {
  transition: all 0.25s var(--ease-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275));
}

.pop-fade-enter-from,
.pop-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}
</style>
