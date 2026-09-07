<script setup lang="ts">
import { computed } from 'vue';
import type { AppNotification } from './composables/useNotification';

interface Props {
  notifications: AppNotification[];
  latestAnnouncement?: string;
}

const props = withDefaults(defineProps<Props>(), {
  latestAnnouncement: undefined,
});

const emit = defineEmits<{
  dismiss: [id: number];
}>();

const announcementText = computed(() => {
  if (props.latestAnnouncement !== undefined) return props.latestAnnouncement;
  if (props.notifications.length > 0) {
    return props.notifications[props.notifications.length - 1]?.message ?? '';
  }
  return '';
});

function getIcon(type: 'error' | 'info' | 'success'): string {
  switch (type) {
    case 'error':
      return '⚠️';
    case 'success':
      return '✅';
    case 'info':
    default:
      return 'ℹ️';
  }
}
</script>

<template>
  <div class="app-toast-manager" data-testid="app-toast-manager">
    <!-- Persistent Live Region for Screen Readers (WCAG 4.1.3) -->
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ announcementText }}
    </div>

    <!-- Floating banner stack -->
    <TransitionGroup name="notification-slide" tag="div" class="toast-container">
      <div
        v-for="item in notifications"
        :key="item.id"
        class="app-notification-banner"
        :class="'is-' + item.type"
        :role="item.type === 'error' ? 'alert' : 'status'"
        aria-live="polite"
        data-testid="app-notification-banner"
      >
        <slot name="icon" :type="item.type">
          <span class="notification-icon" aria-hidden="true">{{ getIcon(item.type) }}</span>
        </slot>
        <span class="notification-message">{{ item.message }}</span>
        <slot name="action" :id="item.id" />
        <button
          type="button"
          class="notification-dismiss-btn"
          aria-label="Dismiss notification"
          @click="emit('dismiss', item.id)"
        >
          ✕
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 68px;
  left: 50%;
  inset-inline-start: 50%;
  transform: translateX(-50%);
  z-index: var(--z-global-notification, 100);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2, 8px);
  width: calc(100% - 32px);
  max-width: 580px;
  pointer-events: none;
}

.app-notification-banner {
  pointer-events: auto;
  position: fixed;
  top: 68px;
  left: 50%;
  inset-inline-start: 50%;
  transform: translateX(-50%);
  z-index: var(--z-global-notification, 100);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  width: calc(100% - 32px);
  max-width: 580px;
  padding: var(--space-2-5, 10px) var(--space-4, 16px);
  border-radius: var(--radius-lg, 16px);
  font-family: var(--font-display);
  font-size: var(--text-sm, 14px);
  font-weight: var(--weight-bold, 700);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-sizing: border-box;
}

.toast-container .app-notification-banner {
  position: relative;
  top: auto;
  left: auto;
  inset-inline-start: auto;
  transform: none;
  width: 100%;
}

.app-notification-banner.is-error {
  background-color: var(--soft-error-glass, rgba(255, 241, 242, 0.94));
  border: 1.5px solid var(--soft-error-border, hsl(350, 80%, 75%));
  color: var(--soft-error-text, hsl(350, 75%, 28%));
}

.app-notification-banner.is-info {
  background-color: var(--soft-info-glass, rgba(240, 249, 255, 0.94));
  border: 1.5px solid var(--soft-info-border, hsl(198, 80%, 75%));
  color: var(--soft-info-text, hsl(198, 90%, 25%));
}

.app-notification-banner.is-success {
  background-color: var(--soft-success-glass, rgba(240, 253, 244, 0.94));
  border: 1.5px solid var(--soft-success-border, hsl(145, 60%, 75%));
  color: var(--soft-success-text, hsl(145, 80%, 22%));
}

[data-theme='dark'] .app-notification-banner.is-error {
  background-color: var(--soft-error-glass, rgba(45, 20, 25, 0.94));
  border-color: var(--soft-error-border, hsl(350, 50%, 35%));
  color: var(--soft-error-text, hsl(350, 85%, 90%));
}

[data-theme='dark'] .app-notification-banner.is-info {
  background-color: var(--soft-info-glass, rgba(20, 38, 50, 0.94));
  border-color: var(--soft-info-border, hsl(198, 50%, 35%));
  color: var(--soft-info-text, hsl(198, 85%, 90%));
}

[data-theme='dark'] .app-notification-banner.is-success {
  background-color: var(--soft-success-glass, rgba(20, 45, 30, 0.94));
  border-color: var(--soft-success-border, hsl(145, 50%, 35%));
  color: var(--soft-success-text, hsl(145, 85%, 90%));
}

.notification-icon {
  font-size: 1.1rem;
  line-height: 1;
  flex-shrink: 0;
}

.notification-message {
  flex: 1 1 auto;
  text-align: start;
}

.notification-dismiss-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  min-width: 44px;
  min-height: 44px;
  font-size: var(--text-sm, 14px);
  color: inherit;
  opacity: 0.75;
  border-radius: var(--radius-xs, 4px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  transition: opacity var(--duration-fast, 150ms), transform var(--duration-fast, 150ms) var(--ease-spring);
}

.notification-dismiss-btn:hover {
  opacity: 1;
}

.notification-dismiss-btn:active {
  transform: scale(0.96);
}

.notification-dismiss-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: var(--focus-ring, 0 0 0 3px hsl(var(--color-primary-h, 255) 85% 60% / 0.45));
}

.notification-slide-enter-active,
.notification-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s var(--ease-spring);
}

.notification-slide-enter-from,
.notification-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, -14px) scale(0.96);
}

.toast-container .notification-slide-enter-from,
.toast-container .notification-slide-leave-to {
  opacity: 0;
  transform: translateY(-14px) scale(0.96);
}

.notification-slide-enter-to,
.notification-slide-leave-from {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}

.toast-container .notification-slide-enter-to,
.toast-container .notification-slide-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

@media (max-width: 640px) {
  .toast-container,
  .app-notification-banner {
    top: 64px;
    width: calc(100% - 24px);
    max-width: 440px;
    padding: var(--space-2, 8px) var(--space-3, 12px);
  }
}

@media (max-width: 380px) {
  .toast-container,
  .app-notification-banner {
    top: 58px;
    width: calc(100% - 16px);
    padding: 6px 10px;
    font-size: var(--text-xs, 12px);
  }
}
</style>
