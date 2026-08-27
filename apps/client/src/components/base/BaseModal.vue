<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted, useId, ref, nextTick } from 'vue';

export type ModalSize = 'sm' | 'md' | 'lg' | 'full';

interface Props {
  modelValue?: boolean;
  isOpen?: boolean;
  title?: string;
  ariaLabel?: string;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
  size?: ModalSize;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: undefined,
  isOpen: undefined,
  title: undefined,
  ariaLabel: undefined,
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
const modalContainerRef = ref<HTMLElement | null>(null);
let previousActiveElement: HTMLElement | null = null;

const isVisible = computed(() => {
  if (props.modelValue !== undefined) return props.modelValue;
  if (props.isOpen !== undefined) return props.isOpen;
  return false;
});

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function setAppInert(inert: boolean) {
  if (typeof document === 'undefined') return;
  const appEl = document.getElementById('app');
  if (appEl) {
    if (inert) {
      appEl.setAttribute('inert', '');
    } else {
      appEl.removeAttribute('inert');
    }
  }
}

function getFocusableElements(): HTMLElement[] {
  if (!modalContainerRef.value) return [];
  const elements = modalContainerRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return Array.from(elements).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('disabled')) {
      return false;
    }
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
    }
    return true;
  });
}

function autoFocusFirstElement() {
  nextTick(() => {
    if (!isVisible.value) return;
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    } else if (modalContainerRef.value) {
      modalContainerRef.value.focus();
    }
  });
}

function restoreFocus() {
  if (
    previousActiveElement &&
    typeof previousActiveElement.focus === 'function' &&
    previousActiveElement.isConnected
  ) {
    previousActiveElement.focus();
  }
  previousActiveElement = null;
}

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
  if (!isVisible.value) return;

  if (props.closeOnEsc && event.key === 'Escape') {
    event.preventDefault();
    handleClose();
    return;
  }

  if (event.key === 'Tab') {
    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      if (modalContainerRef.value) {
        modalContainerRef.value.focus();
      }
      return;
    }

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === firstElement || !modalContainerRef.value?.contains(document.activeElement)) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement || !modalContainerRef.value?.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }
}

watch(
  isVisible,
  (visible) => {
    if (typeof document !== 'undefined') {
      if (visible) {
        if (typeof document.activeElement !== 'undefined') {
          previousActiveElement = document.activeElement as HTMLElement | null;
        }
        document.body.style.overflow = 'hidden';
        setAppInert(true);
        autoFocusFirstElement();
      } else {
        document.body.style.overflow = '';
        setAppInert(false);
        restoreFocus();
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
    setAppInert(false);
    restoreFocus();
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
          ref="modalContainerRef"
          tabindex="-1"
          class="base-modal-container"
          :class="`base-modal--${props.size}`"
          role="dialog"
          aria-modal="true"
          :aria-label="props.ariaLabel"
          :aria-labelledby="props.ariaLabel ? undefined : (props.title || $slots.header ? titleId : undefined)"
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
  padding-block: max(var(--space-4), calc(var(--space-4) + env(safe-area-inset-top, 0px))) max(var(--space-4), calc(var(--space-4) + env(safe-area-inset-bottom, 0px)));
  padding-inline: max(var(--space-4), calc(var(--space-4) + env(safe-area-inset-left, 0px))) max(var(--space-4), calc(var(--space-4) + env(safe-area-inset-right, 0px)));
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
  max-height: min(calc(100vh - 32px), calc(100dvh - 32px));
  background-color: var(--bg-surface);
  border-radius: var(--radius-modal);
  border: 1px solid var(--border-medium);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
  box-sizing: border-box;
  outline: none;
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
  min-height: min(calc(100vh - 32px), calc(100dvh - 32px));
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
  transition: transform var(--duration-fast) ease, background-color var(--duration-fast) ease, border-color var(--duration-fast) ease, color var(--duration-fast) ease;
  margin-inline-start: auto;
}

.base-modal-close-btn:hover {
  background-color: var(--color-danger-subtle);
  color: var(--color-danger);
  border-color: var(--color-danger);
  transform: scale(1.08);
}

.base-modal-close-btn:focus-visible {
  outline: 3px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: var(--focus-ring);
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
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity var(--duration-fast) ease;
}

.modal-fade-enter-active .base-modal-container,
.modal-fade-leave-active .base-modal-container {
  transition: transform var(--duration-spring) var(--ease-spring), opacity var(--duration-fast) ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .base-modal-container {
  opacity: 0;
  transform: scale(0.90) translateY(20px);
}

.modal-fade-leave-to .base-modal-container {
  opacity: 0;
  transform: scale(0.92) translateY(12px);
}
</style>
