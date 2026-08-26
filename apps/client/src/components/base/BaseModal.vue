<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted, useId } from 'vue';

export type ModalSize = 'sm' | 'md' | 'lg' | 'full';

interface Props {
  modelValue?: boolean;
  isOpen?: boolean;
  title?: string;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
  size?: ModalSize;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: undefined,
  isOpen: undefined,
  title: undefined,
  closeOnBackdrop: true,
  closeOnEsc: true,
  showCloseButton: true,
  size: 'md',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  close: [];
}>();

const autoId = useId();
const titleId = computed(() => `modal-title-${autoId}`);

const isVisible = computed(() => {
  if (props.modelValue !== undefined) return props.modelValue;
  if (props.isOpen !== undefined) return props.isOpen;
  return false;
});

function handleClose() {
  emit('update:modelValue', false);
  emit('close');
}

function handleBackdropClick(event: MouseEvent) {
  if (props.closeOnBackdrop && event.target === event.currentTarget) {
    handleClose();
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (props.closeOnEsc && event.key === 'Escape' && isVisible.value) {
    handleClose();
  }
}

watch(
  isVisible,
  (visible) => {
    if (typeof document !== 'undefined') {
      if (visible) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeyDown);
  }
  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="isVisible"
        class="base-modal-backdrop"
        role="presentation"
        @click="handleBackdropClick"
      >
        <div
          class="base-modal-container"
          :class="`base-modal--${props.size}`"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="props.title || $slots.header ? titleId : undefined"
          @click.stop
        >
          <!-- Header -->
          <header class="base-modal-header">
            <slot name="header">
              <h2 v-if="props.title" :id="titleId" class="base-modal-title">
                {{ props.title }}
              </h2>
            </slot>

            <!-- Close Button -->
            <button
              v-if="props.showCloseButton"
              type="button"
              class="base-modal-close-btn"
              aria-label="Close dialog"
              @click="handleClose"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="close-icon" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>

          <!-- Content Body -->
          <div class="base-modal-body">
            <slot />
          </div>

          <!-- Footer -->
          <footer v-if="$slots.footer" class="base-modal-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.base-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background-color: var(--bg-overlay);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  overflow-y: auto;
}

.base-modal-container {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: calc(100vh - var(--space-8));
  background-color: var(--bg-surface);
  border-radius: var(--radius-modal);
  border: 1px solid var(--border-medium);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
  box-sizing: border-box;
}

/* SIZES */
.base-modal--sm {
  max-width: 360px;
}

.base-modal--md {
  max-width: 480px;
}

.base-modal--lg {
  max-width: 680px;
}

.base-modal--full {
  max-width: calc(100vw - var(--space-8));
  min-height: calc(100vh - var(--space-8));
}

.base-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5) var(--space-6);
  border-bottom: 1px solid var(--border-subtle);
  gap: var(--space-3);
}

.base-modal-title {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  line-height: var(--leading-tight);
}

.base-modal-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background-color: var(--bg-app);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--duration-fast) ease;
  margin-left: auto;
}

.base-modal-close-btn:hover {
  background-color: var(--color-danger-subtle);
  color: var(--color-danger);
  border-color: var(--color-danger);
  transform: scale(1.08);
}

.close-icon {
  width: 18px;
  height: 18px;
}

.base-modal-body {
  padding: var(--space-6);
  overflow-y: auto;
  flex: 1 1 auto;
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--text-main);
}

.base-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--border-subtle);
  background-color: var(--bg-surface-raised);
}

/* MODAL TRANSITION ANIMATIONS */
.modal-fade-enter-active {
  transition: opacity var(--duration-fast) ease;
}

.modal-fade-leave-active {
  transition: opacity var(--duration-fast) ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .base-modal-container {
  animation: modal-pop-in var(--duration-spring) var(--ease-out-back);
}

.modal-fade-leave-active .base-modal-container {
  animation: modal-pop-in var(--duration-fast) ease reverse;
}
</style>
