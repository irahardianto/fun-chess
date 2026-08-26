<script setup lang="ts">
import { computed } from 'vue';

export type CardVariant = 'default' | 'raised' | 'flat' | 'interactive';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface Props {
  variant?: CardVariant;
  padding?: CardPadding;
  as?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  padding: 'md',
  as: 'div',
});

const cardClasses = computed(() => [
  'base-card',
  `base-card--${props.variant}`,
  `base-card--p-${props.padding}`,
]);
</script>

<template>
  <component :is="props.as" :class="cardClasses">
    <!-- Header Slot -->
    <header v-if="$slots.header" class="base-card-header">
      <slot name="header" />
    </header>

    <!-- Main Content Body Slot -->
    <div class="base-card-body">
      <slot />
    </div>

    <!-- Footer Slot -->
    <footer v-if="$slots.footer" class="base-card-footer">
      <slot name="footer" />
    </footer>
  </component>
</template>

<style scoped>
.base-card {
  display: flex;
  flex-direction: column;
  background-color: var(--bg-surface);
  border-radius: var(--radius-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-main);
  box-sizing: border-box;
  transition: transform var(--duration-fast) var(--ease-spring),
              box-shadow var(--duration-fast) ease,
              border-color var(--duration-fast) ease;
}

/* VARIANTS */
.base-card--default {
  box-shadow: var(--shadow-md);
}

.base-card--raised {
  background-color: var(--bg-surface-raised);
  box-shadow: var(--shadow-xl);
  border-color: var(--border-medium);
}

.base-card--flat {
  box-shadow: none;
  border-color: var(--border-subtle);
  background-color: var(--bg-surface);
}

.base-card--interactive {
  box-shadow: var(--shadow-md);
  cursor: pointer;
}

.base-card--interactive:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-xl);
  border-color: var(--color-primary);
}

/* PADDING */
.base-card--p-none .base-card-body,
.base-card--p-none .base-card-header,
.base-card--p-none .base-card-footer {
  padding: 0;
}

.base-card--p-sm {
  padding: var(--space-3);
  gap: var(--space-2);
}

.base-card--p-md {
  padding: var(--space-5);
  gap: var(--space-4);
}

.base-card--p-lg {
  padding: var(--space-8);
  gap: var(--space-6);
}

.base-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.base-card-body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
}

.base-card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-4);
}
</style>
