<script setup lang="ts">
import { ref, watch } from 'vue';
import { BaseButton, BaseCard, BaseInput } from '@/components/base';

const props = withDefaults(
  defineProps<{
    initialRoomCode?: string;
    loading?: boolean;
    errorMessage?: string;
  }>(),
  {
    initialRoomCode: '',
    loading: false,
    errorMessage: '',
  }
);

const emit = defineEmits<{
  (e: 'join', payload: { roomCode: string; playerName: string }): void;
}>();

const joinNickname = ref('');
const roomCode = ref(props.initialRoomCode ? props.initialRoomCode.toUpperCase() : '');
const nicknameError = ref('');
const localError = ref('');

watch(
  () => props.initialRoomCode,
  (newCode) => {
    if (newCode) {
      roomCode.value = newCode.toUpperCase();
    }
  }
);

function onJoinSubmit() {
  nicknameError.value = '';
  localError.value = '';

  const name = joinNickname.value.trim();
  const code = roomCode.value.trim().toUpperCase();

  if (!name) {
    nicknameError.value = 'Enter a nickname to join';
    return;
  }
  if (!code || code.length !== 4) {
    localError.value = 'Room code must be 4 characters.';
    return;
  }

  emit('join', { roomCode: code, playerName: name });
}
</script>

<template>
  <BaseCard variant="raised" padding="lg" class="join-card" data-testid="join-card">
    <template #header>
      <div class="card-header-inner">
        <span class="card-badge">🚀 Join Match</span>
        <h3 class="card-title">Enter Room Code</h3>
      </div>
    </template>

    <form class="join-form" @submit.prevent="onJoinSubmit">
      <BaseInput
        v-model="joinNickname"
        label="Your Nickname"
        placeholder="e.g. ShadowBishop 🐼"
        :error="nicknameError"
        clearable
        data-testid="join-nickname-input"
      >
        <template #icon-left>👤</template>
      </BaseInput>

      <BaseInput
        v-model="roomCode"
        label="4-Letter Room Code"
        placeholder="STAR"
        uppercase
        :maxlength="4"
        :error="errorMessage || localError"
        clearable
        data-testid="join-room-code-input"
      >
        <template #icon-left>🔑</template>
      </BaseInput>

      <BaseButton
        type="submit"
        variant="accent"
        size="lg"
        full-width
        :loading="loading"
        class="join-submit-btn"
        data-testid="join-game-btn"
        @click="onJoinSubmit"
      >
        <template #icon-left>🚀</template>
        Join Game
      </BaseButton>
    </form>
  </BaseCard>
</template>

<style scoped>
.join-card {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.join-card :deep(.base-card-body) {
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
  color: var(--color-accent-text, #92400e);
  background-color: var(--color-accent-subtle);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  width: fit-content;
}

.card-title {
  font-size: var(--text-xl);
  color: var(--text-main);
  margin: 0;
}

.join-form {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  justify-content: space-between;
  gap: var(--space-4);
  height: 100%;
}

.join-submit-btn {
  margin-top: auto;
  min-height: 52px;
}
</style>
