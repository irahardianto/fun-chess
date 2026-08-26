<script setup lang="ts">
import { watch } from 'vue';
import type { MascotId } from '@fun-chess/shared';
import BaseModal from '../../../components/base/BaseModal.vue';
import BaseButton from '../../../components/base/BaseButton.vue';
import { useConfetti } from '../../../composables/useConfetti';

interface Props {
  modelValue?: boolean;
  mascotId?: MascotId;
  title?: string;
  message: string;
  variant?: 'solve' | 'hint' | 'mistake' | 'streak_milestone';
  confirmText?: string;
  triggerConfetti?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  mascotId: 'sparky',
  title: 'Coach Tip! 💡',
  variant: 'solve',
  confirmText: 'Got It! 👍',
  triggerConfetti: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [];
  close: [];
}>();

const { celebrate } = useConfetti();

const mascotAvatars: Record<MascotId, { name: string; avatar: string; color: string }> = {
  peanut: { name: 'Peanut the Pup', avatar: '🐶', color: 'var(--mascot-peanut-primary, #f58220)' },
  sparky: { name: 'Sparky Squirrel', avatar: '🐿️', color: 'var(--mascot-sparky-primary, #ea580c)' },
  fox: { name: 'Clever Fox', avatar: '🦊', color: 'var(--mascot-fox-primary, #ef4444)' },
  owl: { name: 'GM Owl', avatar: '🦉', color: 'var(--mascot-owl-primary, #6366f1)' },
};

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen && (props.triggerConfetti || props.variant === 'solve' || props.variant === 'streak_milestone')) {
      celebrate();
    }
  }
);

function handleConfirm() {
  emit('confirm');
  emit('update:modelValue', false);
}

function handleClose() {
  emit('close');
  emit('update:modelValue', false);
}
</script>

<template>
  <BaseModal
    :model-value="props.modelValue"
    size="sm"
    :title="props.title"
    data-testid="mascot-feedback-modal"
    @close="handleClose"
  >
    <div class="mascot-feedback-body" :class="`variant--${props.variant}`">
      <div class="mascot-hero-avatar" :style="{ borderColor: mascotAvatars[props.mascotId].color }">
        <span class="avatar-emoji">{{ mascotAvatars[props.mascotId].avatar }}</span>
      </div>

      <div class="mascot-name-tag">
        {{ mascotAvatars[props.mascotId].name }}
      </div>

      <div class="mascot-speech-bubble">
        <p class="bubble-message" data-testid="mascot-message">
          "{{ props.message }}"
        </p>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer-actions">
        <BaseButton
          variant="primary"
          size="md"
          data-testid="mascot-confirm-btn"
          @click="handleConfirm"
        >
          {{ props.confirmText }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.mascot-feedback-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3, 12px);
  padding: var(--space-2, 8px) 0;
}

.mascot-hero-avatar {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-pill, 9999px);
  background: var(--bg-surface-raised, #f1f5f9);
  border: 3px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md, 0 6px 16px rgba(15, 23, 42, 0.1));
  animation: float-bounce 2.5s infinite ease-in-out;
}

.avatar-emoji {
  font-size: 2.5rem;
  line-height: 1;
}

.mascot-name-tag {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 700;
  color: var(--text-muted, #64748b);
}

.mascot-speech-bubble {
  position: relative;
  background: var(--bg-surface-raised, #f8fafc);
  border: 2px solid var(--border-medium, #cbd5e1);
  border-radius: var(--radius-card, 22px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  width: 100%;
  box-sizing: border-box;
  animation: bubble-pop 280ms var(--ease-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275));
}

.bubble-message {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-base, 16px);
  font-weight: 600;
  color: var(--text-main, #0f172a);
  line-height: var(--leading-normal, 1.5);
  margin: 0;
}

.modal-footer-actions {
  display: flex;
  justify-content: center;
  width: 100%;
}
</style>
