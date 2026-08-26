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
}

const props = withDefaults(defineProps<Props>(), {
  hintData: null,
  hintLevel: 0,
  hintsUsed: 0,
  disabled: false,
  sourceSquare: undefined,
  targetSquare: undefined,
  movingPiece: undefined,
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
    <!-- Visual Board Overlays -->
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

    <!-- Active Hint Card / Speech Bubble -->
    <transition name="pop-fade">
      <div v-if="hintData && hintData.level > 0" class="hint-speech-bubble" data-testid="hint-speech-bubble">
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

    <!-- Hint Action Button -->
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
</template>

<style scoped>
.progressive-hint-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
}

.hint-nudge-square,
.hint-beacon-square,
.hint-ghost-piece {
  position: absolute;
  pointer-events: none;
}

.hint-speech-bubble {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  background: var(--hint-banner-bg, #fffbeb);
  border: 2px solid var(--hint-banner-border, #ffc107);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  box-sizing: border-box;
}

.hint-bubble-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.hint-bubble-badge {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--academy-gold, #ffc107);
  color: #1e1b4b;
  text-transform: capitalize;
}

.hint-square-pill {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: rgba(15, 23, 42, 0.08);
  color: var(--text-main);
}

.hint-square-pill.target {
  background: rgba(34, 197, 94, 0.2);
  color: var(--color-success, #22c55e);
}

.hint-bubble-message {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--hint-banner-text, #451a03);
  margin: 0;
  font-weight: 600;
}

.hint-mascot-dialogue {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin: 0;
  font-style: italic;
}

.solution-callout {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  background: rgba(34, 197, 94, 0.15);
  border-radius: var(--radius-sm);
  width: fit-content;
}

.solution-label {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--text-muted);
}

.solution-san {
  font-family: var(--font-mono);
  font-size: var(--text-base);
  color: var(--color-success, #22c55e);
}

.hint-action-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.hint-tier-meter {
  display: flex;
  gap: var(--space-1);
}

.meter-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--hint-meter-empty, #e2e8f0);
  transition: all var(--duration-fast) var(--ease-spring);
}

.meter-dot.is-active {
  background: var(--academy-gold, #ffc107);
  box-shadow: 0 0 8px rgba(255, 193, 7, 0.8);
  transform: scale(1.15);
}

.pop-fade-enter-active,
.pop-fade-leave-active {
  transition: all 0.25s var(--ease-spring);
}

.pop-fade-enter-from,
.pop-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}
</style>
