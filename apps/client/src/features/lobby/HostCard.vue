<script setup lang="ts">
import { ref } from 'vue';
import { BaseButton, BaseCard, BaseInput } from '@/components/base';

defineProps<{
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'host', payload: { playerName: string; preferredColor: 'w' | 'b' | 'random' }): void;
}>();

const hostNickname = ref('');
const preferredColor = ref<'w' | 'b' | 'random'>('random');
const errorMsg = ref('');

function onHostSubmit() {
  const name = hostNickname.value.trim();
  if (!name) {
    errorMsg.value = 'Please enter your name to host a match!';
    return;
  }
  errorMsg.value = '';
  emit('host', { playerName: name, preferredColor: preferredColor.value });
}
</script>

<template>
  <BaseCard variant="raised" padding="lg" class="host-card" data-testid="host-card">
    <template #header>
      <div class="card-header-inner">
        <span class="card-badge">⚔️ Host Match</span>
        <h3 class="card-title">Start a New Game</h3>
      </div>
    </template>

    <form class="host-form" @submit.prevent="onHostSubmit">
      <BaseInput
        v-model="hostNickname"
        label="Your Nickname"
        placeholder="e.g. MasterKnight 🦁"
        :error="errorMsg"
        clearable
        data-testid="host-nickname-input"
      >
        <template #icon-left>👤</template>
      </BaseInput>

      <div class="color-picker-section">
        <label class="section-label">Choose Your Piece Color:</label>
        <div class="color-options-grid" role="radiogroup" aria-label="Choose your piece color">
          <button
            type="button"
            class="color-option-btn"
            :class="{ 'is-selected': preferredColor === 'w' }"
            role="radio"
            :aria-checked="preferredColor === 'w'"
            aria-label="Play as White (Play First)"
            data-testid="color-white-btn"
            @click="preferredColor = 'w'"
          >
            <span class="color-btn-icon" aria-hidden="true">⚪</span>
            <span class="color-btn-title">White</span>
            <span class="color-btn-desc">First Move</span>
          </button>

          <button
            type="button"
            class="color-option-btn"
            :class="{ 'is-selected': preferredColor === 'random' }"
            role="radio"
            :aria-checked="preferredColor === 'random'"
            aria-label="Play as Random Color (Surprise Me)"
            data-testid="color-random-btn"
            @click="preferredColor = 'random'"
          >
            <span class="color-btn-icon" aria-hidden="true">🎲</span>
            <span class="color-btn-title">Random</span>
            <span class="color-btn-desc">Surprise Me</span>
          </button>

          <button
            type="button"
            class="color-option-btn"
            :class="{ 'is-selected': preferredColor === 'b' }"
            role="radio"
            :aria-checked="preferredColor === 'b'"
            aria-label="Play as Black (Defend)"
            data-testid="color-black-btn"
            @click="preferredColor = 'b'"
          >
            <span class="color-btn-icon" aria-hidden="true">⚫</span>
            <span class="color-btn-title">Black</span>
            <span class="color-btn-desc">Defend</span>
          </button>
        </div>
      </div>

      <BaseButton
        type="submit"
        variant="primary"
        size="lg"
        full-width
        :loading="loading"
        data-testid="host-game-btn"
        @click="onHostSubmit"
      >
        <template #icon-left>⚔️</template>
        Host Game
      </BaseButton>
    </form>
  </BaseCard>
</template>

<style scoped>
.host-card {
  width: 100%;
}

.card-header-inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.card-badge {
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--color-primary);
  background-color: var(--color-primary-subtle);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  width: fit-content;
}

.card-title {
  font-size: var(--text-xl);
  color: var(--text-main);
  margin: 0;
}

.host-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.color-picker-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.section-label {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--text-muted);
}

.color-options-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.color-option-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-2) var(--space-1);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-md);
  background-color: var(--bg-surface);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-spring);
}

.color-option-btn:hover {
  border-color: var(--color-primary);
  background-color: var(--color-primary-subtle);
}

.color-option-btn:focus-visible {
  outline: 2px solid var(--border-focus, var(--color-primary));
  outline-offset: 2px;
  box-shadow: var(--focus-ring, 0 0 0 3px hsla(var(--color-primary-h, 255), 85%, 60%, 0.45));
}

.color-option-btn:active {
  transform: translateY(4px) scale(0.96);
}

.color-option-btn.is-selected {
  border-color: var(--color-primary);
  background-color: var(--color-primary-subtle);
  box-shadow: 0 0 0 2px var(--color-primary);
}

.color-option-btn.is-selected:active {
  transform: translateY(4px) scale(0.96);
}

.color-btn-icon {
  font-size: 1.4rem;
}

.color-btn-title {
  font-family: var(--font-display);
  font-weight: var(--weight-bold);
  font-size: var(--text-sm);
  color: var(--text-main);
}

.color-btn-desc {
  font-size: var(--text-xs);
  color: var(--text-faint);
}
</style>
