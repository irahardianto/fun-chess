<script setup lang="ts">
import { computed } from 'vue';

export type ButtonVariant = 'primary' | 'accent' | 'danger' | 'ghost' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  fullWidth?: boolean;
  ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  type: 'button',
  fullWidth: false,
  ariaLabel: undefined,
});

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

const buttonClasses = computed(() => [
  'btn-tactile',
  `btn-tactile--${props.variant}`,
  `btn-tactile--${props.size}`,
  {
    'is-disabled': props.disabled || props.loading,
    'is-loading': props.loading,
    'is-full-width': props.fullWidth,
  },
]);

function handleClick(event: MouseEvent) {
  if (props.disabled || props.loading) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  emit('click', event);
}
</script>

<template>
  <button
    :type="props.type"
    :class="buttonClasses"
    :disabled="props.disabled || props.loading"
    :aria-label="props.ariaLabel"
    :aria-busy="props.loading"
    :aria-disabled="props.disabled || props.loading"
    @click="handleClick"
  >
    <!-- Loading Spinner -->
    <span v-if="props.loading" class="btn-spinner" aria-hidden="true">
      <svg viewBox="0 0 24 24" class="btn-spinner-icon">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" opacity="0.25" />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          stroke-width="4"
          stroke-linecap="round"
          fill="none"
        />
      </svg>
    </span>

    <!-- Left Icon Slot -->
    <span v-if="$slots['icon-left'] || $slots.icon" class="btn-icon btn-icon--left" aria-hidden="true">
      <slot name="icon-left">
        <slot name="icon" />
      </slot>
    </span>

    <!-- Button Text / Main Content -->
    <span class="btn-content">
      <slot />
    </span>

    <!-- Right Icon Slot -->
    <span v-if="$slots['icon-right']" class="btn-icon btn-icon--right" aria-hidden="true">
      <slot name="icon-right" />
    </span>
  </button>
</template>

<style scoped>
.btn-tactile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-weight: var(--weight-bold);
  border: none;
  border-radius: var(--radius-btn);
  cursor: pointer;
  transform: translateY(0);
  transition: transform var(--duration-instant) ease,
              box-shadow var(--duration-instant) ease,
              filter var(--duration-fast) ease,
              background-color var(--duration-fast) ease;
  user-select: none;
  text-decoration: none;
  position: relative;
  overflow: visible;
  line-height: var(--leading-none);
  text-align: center;
  box-sizing: border-box;
}

.btn-tactile:focus-visible {
  outline: 3px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: var(--focus-ring);
}

/* SIZES */
.btn-tactile--sm {
  font-size: var(--text-sm);
  padding: var(--space-2) var(--space-3);
  min-height: 38px;
  border-radius: var(--radius-md);
}

@media (pointer: coarse), (max-width: 640px) {
  .btn-tactile--sm {
    min-height: var(--touch-target-min, 44px);
  }
}

.btn-tactile--md {
  font-size: var(--text-base);
  padding: var(--space-3) var(--space-5);
  min-height: var(--touch-target-button);
}

.btn-tactile--lg {
  font-size: var(--text-lg);
  padding: var(--space-4) var(--space-8);
  min-height: 60px;
  border-radius: var(--radius-xl);
}

.is-full-width {
  width: 100%;
}

/* VARIANTS */
/* Primary — Electric Violet */
.btn-tactile--primary {
  background-color: var(--color-primary);
  color: var(--text-on-primary);
  box-shadow: var(--shadow-btn-primary);
}

.btn-tactile--primary:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-2px);
  box-shadow: var(--shadow-btn-primary-hover);
}

.btn-tactile--primary:active:not(:disabled) {
  transform: translateY(4px) scale(0.96);
  box-shadow: var(--shadow-btn-primary-active);
}

/* Accent — Sunshine Gold */
.btn-tactile--accent {
  background-color: var(--color-accent);
  color: var(--text-on-accent);
  box-shadow: var(--shadow-btn-accent);
}

.btn-tactile--accent:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-2px);
  box-shadow: var(--shadow-btn-accent-hover);
}

.btn-tactile--accent:active:not(:disabled) {
  transform: translateY(4px) scale(0.96);
  box-shadow: var(--shadow-btn-accent-active);
}

/* Success — Emerald Mint */
.btn-tactile--success {
  background-color: var(--color-success);
  color: var(--text-on-success);
  box-shadow: var(--shadow-btn-success);
}

.btn-tactile--success:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-2px);
  box-shadow: var(--shadow-btn-success-hover);
}

.btn-tactile--success:active:not(:disabled) {
  transform: translateY(4px) scale(0.96);
  box-shadow: var(--shadow-btn-success-active);
}

/* Danger — Coral Crimson */
.btn-tactile--danger {
  background-color: var(--color-danger);
  color: var(--text-on-danger);
  box-shadow: var(--shadow-btn-danger);
}

.btn-tactile--danger:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-2px);
  box-shadow: var(--shadow-btn-danger-hover);
}

.btn-tactile--danger:active:not(:disabled) {
  transform: translateY(4px) scale(0.96);
  box-shadow: var(--shadow-btn-danger-active);
}

/* Ghost / Outlined */
.btn-tactile--ghost {
  background-color: transparent;
  color: var(--text-main);
  border: 2px solid var(--border-medium);
  box-shadow: var(--shadow-xs);
}

.btn-tactile--ghost:hover:not(:disabled) {
  background-color: var(--color-primary-subtle);
  border-color: var(--color-primary);
  color: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.btn-tactile--ghost:active:not(:disabled) {
  transform: translateY(2px) scale(0.96);
  box-shadow: none;
}

/* DISABLED & LOADING */
.btn-tactile:disabled,
.btn-tactile.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.15) !important;
  filter: grayscale(0.2) !important;
}

.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15em;
  line-height: 1;
}

.btn-content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.2em;
  height: 1.2em;
  animation: btn-spin 0.8s linear infinite;
}

.btn-spinner-icon {
  width: 100%;
  height: 100%;
}

@keyframes btn-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
