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
const roomCode = ref(props.initialRoomCode);
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
  const name = joinNickname.value.trim();
  const code = roomCode.value.trim().toUpperCase();

  if (!name) {
    localError.value = 'Please enter your name!';
    return;
  }
  if (!code || code.length !== 4) {
    localError.value = 'Room code must be 4 characters!';
    return;
  }

  localError.value = '';
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

    <div class="join-form">
      <BaseInput
        v-model="joinNickname"
        label="Your Nickname"
        placeholder="e.g. ShadowBishop 🐼"
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
        variant="accent"
        size="lg"
        full-width
        :loading="loading"
        data-testid="join-game-btn"
        @click="onJoinSubmit"
      >
        <template #icon-left>🚀</template>
        Join Game
      </BaseButton>
    </div>
  </BaseCard>
</template>

<style scoped>
.join-card {
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
  color: var(--color-accent);
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
  gap: var(--space-4);
}
</style>
