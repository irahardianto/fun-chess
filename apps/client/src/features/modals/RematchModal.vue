<script setup lang="ts">
import { BaseModal, BaseButton } from '@/components/base';

withDefaults(
  defineProps<{
    modelValue: boolean;
    requesterName?: string;
  }>(),
  {
    modelValue: false,
    requesterName: 'Opponent',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'accept'): void;
  (e: 'decline'): void;
}>();
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    title="Rematch Challenge! ⚔️"
    size="sm"
    data-testid="rematch-modal"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="rematch-modal-content">
      <p class="rematch-text">
        <strong>{{ requesterName }}</strong> wants a rematch! Piece colors will be swapped. Accept challenge?
      </p>

      <div class="rematch-actions">
        <BaseButton
          variant="primary"
          size="lg"
          full-width
          data-testid="accept-rematch-btn"
          @click="emit('accept')"
        >
          <template #icon-left>⚔️</template>
          Accept rematch
        </BaseButton>

        <BaseButton
          variant="ghost"
          size="md"
          full-width
          data-testid="decline-rematch-btn"
          @click="emit('decline')"
        >
          Decline rematch
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.rematch-modal-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  text-align: center;
}

.rematch-text {
  font-size: var(--text-base);
  color: var(--text-main);
  line-height: var(--leading-normal);
}

.rematch-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}
</style>
