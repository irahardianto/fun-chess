<script setup lang="ts">
import { computed, useId } from 'vue';

interface Props {
  modelValue?: string | number;
  label?: string;
  id?: string;
  placeholder?: string;
  type?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  clearable?: boolean;
  maxlength?: number;
  uppercase?: boolean;
  autocomplete?: string;
  ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  label: undefined,
  id: undefined,
  placeholder: '',
  type: 'text',
  error: undefined,
  hint: undefined,
  disabled: false,
  clearable: false,
  maxlength: undefined,
  uppercase: false,
  autocomplete: 'off',
  ariaLabel: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
  clear: [];
  enter: [event: KeyboardEvent];
}>();

const autoId = useId();
const inputId = computed(() => props.id || `input-${autoId}`);
const errorId = computed(() => `${inputId.value}-error`);
const hintId = computed(() => `${inputId.value}-hint`);

const hasValue = computed(() => {
  return props.modelValue !== undefined && props.modelValue !== null && String(props.modelValue).length > 0;
});

const describedBy = computed(() => {
  const ids: string[] = [];
  if (props.error) ids.push(errorId.value);
  else if (props.hint) ids.push(hintId.value);
  return ids.length > 0 ? ids.join(' ') : undefined;
});

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  let val = target.value;
  if (props.uppercase) {
    val = val.toUpperCase();
    target.value = val;
  }
  emit('update:modelValue', val);
}

function handleClear() {
  if (props.disabled) return;
  emit('update:modelValue', '');
  emit('clear');
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    emit('enter', event);
  }
}
</script>

<template>
  <div
    class="base-input-group"
    :class="{
      'has-error': !!props.error,
      'is-disabled': props.disabled,
      'is-uppercase': props.uppercase,
    }"
  >
    <!-- Label -->
    <label v-if="props.label" :for="inputId" class="base-input-label">
      {{ props.label }}
    </label>

    <!-- Input Box Wrapper -->
    <div class="base-input-wrapper">
      <!-- Prefix Slot -->
      <span v-if="$slots.prefix || $slots['icon-left']" class="base-input-slot prefix-slot" aria-hidden="true">
        <slot name="prefix">
          <slot name="icon-left" />
        </slot>
      </span>

      <!-- Native Input -->
      <input
        :id="inputId"
        :type="props.type"
        :value="props.modelValue"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        :maxlength="props.maxlength"
        :autocomplete="props.autocomplete"
        :aria-label="props.ariaLabel || props.label"
        :aria-invalid="!!props.error"
        :aria-describedby="describedBy"
        class="base-input-control"
        @input="handleInput"
        @focus="(e) => emit('focus', e)"
        @blur="(e) => emit('blur', e)"
        @keydown="handleKeyDown"
      />

      <!-- Clear Button -->
      <button
        v-if="props.clearable && hasValue && !props.disabled"
        type="button"
        class="base-input-clear-btn"
        aria-label="Clear input text"
        tabindex="-1"
        @click="handleClear"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="clear-icon" aria-hidden="true">
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clip-rule="evenodd"
          />
        </svg>
      </button>

      <!-- Suffix Slot -->
      <span v-if="$slots.suffix || $slots['icon-right']" class="base-input-slot suffix-slot" aria-hidden="true">
        <slot name="suffix">
          <slot name="icon-right" />
        </slot>
      </span>
    </div>

    <!-- Error Message -->
    <p v-if="props.error" :id="errorId" class="base-input-error" role="alert">
      <span class="error-icon" aria-hidden="true">⚠️</span>
      <span>{{ props.error }}</span>
    </p>

    <!-- Hint Message -->
    <p v-else-if="props.hint" :id="hintId" class="base-input-hint">
      {{ props.hint }}
    </p>
  </div>
</template>

<style scoped>
.base-input-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
  width: 100%;
}

.base-input-label {
  font-family: var(--font-display);
  font-weight: var(--weight-bold);
  font-size: var(--text-sm);
  color: var(--text-main);
  user-select: none;
}

.base-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  background-color: var(--bg-surface);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  transition: border-color var(--duration-fast) ease,
              box-shadow var(--duration-fast) ease,
              background-color var(--duration-fast) ease;
}

.base-input-wrapper:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 4px var(--color-primary-subtle);
}

.has-error .base-input-wrapper {
  border-color: var(--color-danger);
}

.has-error .base-input-wrapper:focus-within {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 4px var(--color-danger-subtle);
}

.is-disabled .base-input-wrapper {
  opacity: 0.6;
  background-color: var(--border-subtle);
  cursor: not-allowed;
}

.base-input-control {
  width: 100%;
  min-height: 48px;
  padding: var(--space-2-5) var(--space-4);
  font-family: var(--font-body);
  font-weight: var(--weight-semibold);
  font-size: 16px; /* Prevents iOS Safari auto-zoom on input focus */
  color: var(--text-main);
  background: transparent;
  border: none;
  outline: none;
  box-sizing: border-box;
}

.is-uppercase .base-input-control {
  text-transform: uppercase;
  font-family: var(--font-mono);
  letter-spacing: var(--tracking-wide);
}

.base-input-control::placeholder {
  color: var(--text-faint);
  font-weight: var(--weight-regular);
}

.base-input-control:disabled {
  cursor: not-allowed;
}

.base-input-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 1.2em;
}

.prefix-slot {
  padding-inline-start: var(--space-3);
}

.suffix-slot {
  padding-inline-end: var(--space-3);
}

.base-input-clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--space-2-5);
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--radius-pill);
  transition: color var(--duration-fast) ease, transform var(--duration-instant) ease;
}

.base-input-clear-btn:hover {
  color: var(--color-danger);
  transform: scale(1.1);
}

.clear-icon {
  width: 18px;
  height: 18px;
}

.base-input-error {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--color-danger);
  margin-top: 2px;
}

.base-input-hint {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin-top: 2px;
}
</style>
