<script setup lang="ts">
import BaseButton from '../../../components/base/BaseButton.vue';

interface Props {
  canTakeback?: boolean;
  canAskHint?: boolean;
  takebackCount?: number;
  hintsCount?: number;
  isAiThinking?: boolean;
  isGameOver?: boolean;
  movesCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  canTakeback: false,
  canAskHint: true,
  takebackCount: 0,
  hintsCount: 0,
  isAiThinking: false,
  isGameOver: false,
  movesCount: 0,
});

const emit = defineEmits<{
  takeback: [];
  hint: [];
  flip: [];
  history: [];
  resign: [];
}>();
</script>

<template>
  <div class="ai-game-hud" role="toolbar" aria-label="Solo Game Actions">
    <!-- Primary Learning Action: Takeback / Undo -->
    <BaseButton
      variant="ghost"
      size="md"
      data-testid="takeback-btn"
      class="hud-btn takeback-btn"
      :disabled="!props.canTakeback || props.isAiThinking || props.isGameOver"
      :aria-label="`Takeback move, used ${props.takebackCount} times`"
      @click="emit('takeback')"
    >
      <template #icon-left>
        <span class="hud-icon spin-on-hover">🔄</span>
      </template>
      <span>Takeback</span>
      <span v-if="props.takebackCount > 0" class="hud-badge takeback-badge">
        {{ props.takebackCount }}
      </span>
    </BaseButton>

    <!-- Primary Learning Action: Ask for a Hint -->
    <BaseButton
      variant="accent"
      size="md"
      data-testid="hint-btn"
      class="hud-btn hint-btn"
      :disabled="!props.canAskHint || props.isAiThinking || props.isGameOver"
      :aria-label="`Ask for a hint, used ${props.hintsCount} times`"
      @click="emit('hint')"
    >
      <template #icon-left>
        <span class="hud-icon pulse-glow">💡</span>
      </template>
      <span>Ask Hint</span>
      <span v-if="props.hintsCount > 0" class="hud-badge hint-badge">
        {{ props.hintsCount }}
      </span>
    </BaseButton>

    <!-- Secondary Action: Flip Board -->
    <BaseButton
      variant="ghost"
      size="md"
      data-testid="flip-btn"
      class="hud-btn"
      aria-label="Flip board perspective"
      @click="emit('flip')"
    >
      <template #icon-left>
        <span class="hud-icon">🔃</span>
      </template>
      <span>Flip</span>
    </BaseButton>

    <!-- Secondary Action: Move History Toggle -->
    <BaseButton
      variant="ghost"
      size="md"
      data-testid="history-btn"
      class="hud-btn"
      :aria-label="`Toggle move history, ${props.movesCount} plies played`"
      @click="emit('history')"
    >
      <template #icon-left>
        <span class="hud-icon">📜</span>
      </template>
      <span>Moves ({{ props.movesCount }})</span>
    </BaseButton>

    <!-- Secondary Action: Resign Match -->
    <BaseButton
      variant="danger"
      size="md"
      data-testid="resign-btn"
      class="hud-btn resign-btn"
      :disabled="props.isGameOver"
      aria-label="Resign match"
      @click="emit('resign')"
    >
      <template #icon-left>
        <span class="hud-icon">🏳️</span>
      </template>
      <span>Resign</span>
    </BaseButton>
  </div>
</template>

<style scoped>
.ai-game-hud {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  flex-wrap: wrap;
  box-sizing: border-box;
  margin-top: var(--space-2);
}

.hud-btn {
  font-family: var(--font-display);
  font-weight: var(--weight-bold);
  min-height: 44px;
  flex: 1 1 auto;
  max-width: 150px;
}

.takeback-btn {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.takeback-btn:hover:not(:disabled) {
  background-color: var(--color-primary-subtle);
}

.hint-btn {
  box-shadow: var(--shadow-btn-accent);
}

.hud-icon {
  font-size: 1.15rem;
  line-height: 1;
  display: inline-block;
}

.hud-badge {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-heavy);
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  margin-left: 4px;
}

.takeback-badge {
  background-color: var(--color-primary);
  color: var(--text-on-primary);
}

.hint-badge {
  background-color: var(--text-on-accent);
  color: var(--color-accent);
}

.pulse-glow {
  animation: float-bounce 2s infinite ease-in-out;
}

.takeback-btn:hover .spin-on-hover {
  transform: rotate(-45deg);
  transition: transform var(--duration-fast) ease;
}

@media (max-width: 580px) {
  .hud-btn {
    font-size: var(--text-xs);
    padding: var(--space-1-5) var(--space-2);
    min-height: 40px;
    max-width: none;
  }
}
</style>
