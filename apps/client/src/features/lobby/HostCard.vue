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
    errorMsg.value = 'Enter your nickname to host a match.';
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
        <span class="card-badge">⚔️ Host match</span>
        <h3 class="card-title">Start a new game</h3>
      </div>
    </template>

    <form class="host-form" @submit.prevent="onHostSubmit">
      <BaseInput
        v-model="hostNickname"
        label="Your nickname"
        placeholder="e.g. MasterKnight 🦁"
        :error="errorMsg"
        clearable
        data-testid="host-nickname-input"
      >
        <template #icon-left>👤</template>
      </BaseInput>

      <div class="color-picker-section">
        <label class="section-label">Choose your piece color:</label>
        <div class="color-picker-control" role="radiogroup" aria-label="Choose your piece color">
          <button
            type="button"
            class="color-option-btn"
            :class="{ 'is-selected': preferredColor === 'w' }"
            role="radio"
            :aria-checked="preferredColor === 'w'"
            aria-label="Play as white (first move)"
            data-testid="color-white-btn"
            @click="preferredColor = 'w'"
          >
            <span class="color-option-icon" aria-hidden="true">⚪</span>
            <span class="color-option-label">White</span>
          </button>

          <button
            type="button"
            class="color-option-btn"
            :class="{ 'is-selected': preferredColor === 'random' }"
            role="radio"
            :aria-checked="preferredColor === 'random'"
            aria-label="Play as random color (surprise me)"
            data-testid="color-random-btn"
            @click="preferredColor = 'random'"
          >
            <span class="color-option-icon" aria-hidden="true">🎲</span>
            <span class="color-option-label">Random</span>
          </button>

          <button
            type="button"
            class="color-option-btn"
            :class="{ 'is-selected': preferredColor === 'b' }"
            role="radio"
            :aria-checked="preferredColor === 'b'"
            aria-label="Play as black (defend)"
            data-testid="color-black-btn"
            @click="preferredColor = 'b'"
          >
            <span class="color-option-icon" aria-hidden="true">⚫</span>
            <span class="color-option-label">Black</span>
          </button>
        </div>
      </div>

      <BaseButton
        type="submit"
        variant="primary"
        size="lg"
        full-width
        :loading="loading"
        class="host-submit-btn"
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
  height: 100%;
  display: flex;
  flex-direction: column;
}

.host-card :deep(.base-card-body) {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
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
  flex: 1 1 auto;
  justify-content: space-between;
  gap: var(--space-4);
  height: 100%;
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

/* Standardized Segmented Tactile Pill Control */
.color-picker-control {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  background-color: var(--bg-surface-raised, var(--bg-surface));
  padding: 4px;
  border-radius: var(--radius-pill);
  border: 1.5px solid var(--border-medium);
  box-shadow: inset 0 2px 4px rgba(15, 23, 42, 0.06);
}

.color-option-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-spring),
              box-shadow var(--duration-fast) ease,
              background-color var(--duration-fast) ease,
              color var(--duration-fast) ease;
}

.color-option-btn:hover {
  color: var(--text-main);
  background-color: var(--color-primary-subtle);
}

.color-option-btn:focus-visible {
  outline: 2px solid var(--border-focus, var(--color-primary));
  outline-offset: 2px;
  box-shadow: var(--focus-ring, 0 0 0 3px hsla(var(--color-primary-h, 255), 85%, 60%, 0.45));
}

.color-option-btn.is-selected {
  background-color: var(--color-primary);
  color: var(--text-on-primary, #ffffff);
  box-shadow: 0 3px 0 var(--color-primary-bevel, hsl(255, 70%, 45%)), var(--shadow-sm);
  transform: scale(1.02);
}

.color-option-btn.is-selected:active {
  transform: translateY(2px) scale(0.98);
}

.color-option-icon {
  font-size: 1.1rem;
  line-height: 1;
}

.color-option-label {
  line-height: 1;
}

.host-submit-btn {
  margin-top: auto;
  min-height: 52px;
}
</style>
