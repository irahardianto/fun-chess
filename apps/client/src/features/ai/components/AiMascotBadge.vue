<script setup lang="ts">
import { computed } from 'vue';
import type { PieceColor, MascotPersona } from '@fun-chess/shared';

interface Props {
  mascot: MascotPersona;
  color?: PieceColor;
  isCurrentTurn?: boolean;
  isThinking?: boolean;
  dialogue?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  color: 'b',
  isCurrentTurn: false,
  isThinking: false,
  dialogue: null,
});

const resolvedColor = computed<PieceColor>(() => props.color);

const statusText = computed(() => {
  if (props.isThinking) return 'Calculating...';
  if (props.isCurrentTurn) return 'Thinking... ⏳';
  return 'Ready';
});
</script>

<template>
  <div
    class="ai-mascot-badge-container"
    :data-testid="`ai-mascot-badge-${props.mascot.id}`"
    role="region"
    :aria-label="`${props.mascot.name}, AI Level ${props.mascot.difficulty}, playing as ${resolvedColor === 'w' ? 'White' : 'Black'}`"
  >
    <!-- Top Row: Avatar, Identity Info, and Turn / Thinking status -->
    <div
      class="badge-card"
      :class="{
        'is-active-turn': props.isCurrentTurn,
        'is-thinking': props.isThinking,
      }"
      :style="{ '--mascot-accent': props.mascot.themeColor }"
    >
      <!-- Avatar Medallion with Pulse Ring -->
      <div class="avatar-wrapper" :style="{ borderColor: props.mascot.themeColor }">
        <span class="mascot-emoji" aria-hidden="true">{{ props.mascot.avatar }}</span>
        <!-- Thinking Dot Badge -->
        <span
          v-if="props.isThinking"
          class="thinking-indicator-dot"
          title="AI is thinking"
        />
      </div>

      <!-- Mascot Info -->
      <div class="mascot-info">
        <div class="name-row">
          <span class="mascot-name">{{ props.mascot.name }}</span>
          <span class="elo-badge">~{{ props.mascot.eloEstimate }}</span>
          <span class="bot-tag">AI</span>
        </div>

        <div class="status-row">
          <span class="color-indicator">
            <span class="color-dot">{{ resolvedColor === 'w' ? '⚪' : '⚫' }}</span>
            <span class="color-name">{{ resolvedColor === 'w' ? 'White' : 'Black' }}</span>
          </span>

          <!-- Thinking Bouncing Dots Animation -->
          <div v-if="props.isThinking" class="thinking-dots-container" aria-hidden="true">
            <span class="dot dot-1"></span>
            <span class="dot dot-2"></span>
            <span class="dot dot-3"></span>
          </div>
        </div>
      </div>

      <!-- Active Turn Status Pill -->
      <div
        v-if="props.isCurrentTurn"
        class="turn-status-pill"
        role="status"
        aria-live="polite"
      >
        <span class="turn-text">{{ statusText }}</span>
      </div>
    </div>

    <!-- Reactive Speech Bubble -->
    <transition name="bubble-pop">
      <div
        v-if="props.dialogue"
        :key="props.dialogue"
        data-testid="mascot-dialogue-bubble"
        class="mascot-speech-bubble"
        role="status"
        aria-live="polite"
      >
        <span class="bubble-icon" aria-hidden="true">💬</span>
        <span class="bubble-text">"{{ props.dialogue }}"</span>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.ai-mascot-badge-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  box-sizing: border-box;
}

.badge-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background-color: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  transition: all var(--duration-fast) ease;
  box-sizing: border-box;
  width: 100%;
}

.badge-card.is-active-turn {
  border-color: var(--mascot-accent, var(--color-primary));
  box-shadow: 0 0 16px 2px rgba(108, 92, 231, 0.25);
}

.avatar-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background-color: var(--bg-app);
  border-radius: var(--radius-pill);
  border: 2.5px solid var(--color-primary);
  font-size: 1.6rem;
  user-select: none;
  flex-shrink: 0;
  box-shadow: var(--shadow-xs);
}

.mascot-emoji {
  line-height: 1;
}

.thinking-indicator-dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 12px;
  height: 12px;
  border-radius: var(--radius-pill);
  background-color: var(--color-accent);
  border: 2px solid var(--bg-surface);
  animation: pulse-reconnect 1s infinite alternate;
}

.mascot-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.name-row {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  flex-wrap: nowrap;
}

.mascot-name {
  font-family: var(--font-display);
  font-weight: var(--weight-heavy);
  font-size: var(--text-base);
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.elo-badge {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  background-color: var(--color-primary-subtle);
  color: var(--color-primary);
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  line-height: 1.2;
}

.bot-tag {
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: var(--weight-heavy);
  background-color: var(--border-strong);
  color: var(--text-inverse);
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  line-height: 1;
}

.status-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.color-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--text-muted);
}

.color-dot {
  font-size: 0.9em;
}

/* Thinking Indicator Dots */
.thinking-dots-container {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  background-color: var(--color-accent-subtle);
  border-radius: var(--radius-pill);
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: var(--radius-pill);
  background-color: var(--color-accent);
  animation: thinking-dot-bounce 900ms infinite ease-in-out;
}

.dot-1 {
  animation-delay: 0ms;
}
.dot-2 {
  animation-delay: 150ms;
}
.dot-3 {
  animation-delay: 300ms;
}

@keyframes thinking-dot-bounce {
  0%, 80%, 100% {
    transform: scale(0.6) translateY(0);
    opacity: 0.4;
  }
  40% {
    transform: scale(1.2) translateY(-3px);
    opacity: 1;
  }
}

.turn-status-pill {
  background-color: var(--color-accent);
  color: var(--text-on-accent);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-heavy);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  margin-left: auto;
  white-space: nowrap;
  box-shadow: var(--shadow-xs);
}

/* Speech Bubble */
.mascot-speech-bubble {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background-color: var(--bg-surface);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-xl);
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  box-shadow: var(--shadow-sm);
  margin-top: var(--space-1);
}

/* Bubble Pointer Tail pointing to avatar */
.mascot-speech-bubble::before {
  content: '';
  position: absolute;
  top: -7px;
  left: 20px;
  width: 12px;
  height: 12px;
  background-color: var(--bg-surface);
  border-left: 2px solid var(--border-medium);
  border-top: 2px solid var(--border-medium);
  transform: rotate(45deg);
}

.bubble-icon {
  font-size: 1.1rem;
  line-height: 1;
  flex-shrink: 0;
}

.bubble-text {
  font-family: var(--font-display);
  color: var(--text-main);
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
}

/* Bubble Transition */
.bubble-pop-enter-active {
  animation: bubble-pop 280ms var(--ease-spring);
}

.bubble-pop-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.bubble-pop-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(4px);
}

@keyframes bubble-pop {
  0% {
    transform: scale(0.85) translateY(6px);
    opacity: 0;
  }
  70% {
    transform: scale(1.04) translateY(-2px);
    opacity: 1;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

@media (max-width: 480px) {
  .badge-card {
    padding: 4px 8px;
    gap: 8px;
  }

  .avatar-wrapper {
    width: 36px;
    height: 36px;
    font-size: 1.3rem;
  }

  .mascot-name {
    font-size: var(--text-sm);
    max-width: 110px;
  }

  .turn-status-pill {
    display: none;
  }
}
</style>
