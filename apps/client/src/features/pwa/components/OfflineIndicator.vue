<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useNetworkStatus } from "../composables/useNetworkStatus";

interface Props {
  autoCollapseDelay?: number;
  forceOffline?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  autoCollapseDelay: 5000,
  forceOffline: undefined,
});

const { isOffline, offlineHeadline, offlineSubtext } = useNetworkStatus();

const isActuallyOffline = computed(() =>
  props.forceOffline !== undefined ? props.forceOffline : isOffline.value
);

const isExpanded = ref(true);
let autoCollapseTimer: ReturnType<typeof setTimeout> | null = null;

function clearCollapseTimer() {
  if (autoCollapseTimer) {
    clearTimeout(autoCollapseTimer);
    autoCollapseTimer = null;
  }
}

function startAutoCollapseTimer() {
  clearCollapseTimer();
  if (props.autoCollapseDelay > 0) {
    autoCollapseTimer = setTimeout(() => {
      isExpanded.value = false;
    }, props.autoCollapseDelay);
  }
}

function handleDismiss() {
  clearCollapseTimer();
  isExpanded.value = false;
}

function handleExpand() {
  clearCollapseTimer();
  isExpanded.value = true;
  startAutoCollapseTimer();
}

watch(
  isActuallyOffline,
  (offline) => {
    if (offline) {
      isExpanded.value = true;
      startAutoCollapseTimer();
    } else {
      clearCollapseTimer();
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (isActuallyOffline.value) {
    startAutoCollapseTimer();
  }
});

onUnmounted(() => {
  clearCollapseTimer();
});
</script>

<template>
  <Transition name="float-pill">
    <div
      v-if="isActuallyOffline"
      class="offline-indicator-wrapper"
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
    >
      <!-- 1. Expanded Hero Floating Reassurance Mode -->
      <div
        v-if="isExpanded"
        class="offline-reassurance-pill"
        data-testid="offline-expanded-pill"
      >
        <div class="offline-avatar-badge" aria-hidden="true">
          🐶✈️
        </div>

        <div class="offline-content">
          <span class="offline-headline">{{ offlineHeadline }}</span>
          <span class="offline-subtext">{{ offlineSubtext }}</span>
        </div>

        <button
          type="button"
          class="offline-dismiss-btn"
          aria-label="Dismiss offline banner"
          title="Minimize offline banner"
          data-testid="offline-dismiss-btn"
          @click="handleDismiss"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            class="dismiss-icon"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- 2. Compact Badge Mode (When auto-collapsed or dismissed) -->
      <button
        v-else
        type="button"
        class="offline-compact-chip"
        title="Playing offline — click for info"
        aria-label="Offline Mode active. Click to view offline info"
        data-testid="offline-compact-chip"
        @click="handleExpand"
      >
        <span class="compact-icon" aria-hidden="true">✈️</span>
        <span class="compact-label">Offline Ready</span>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
/* Container: Floating zero-CLS overlay */
.offline-indicator-wrapper {
  position: fixed;
  top: 68px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-floating-indicator, 40);
  width: calc(100% - 32px);
  max-width: 580px;
  pointer-events: none; /* Allows clicks through empty surrounding area */
  display: flex;
  justify-content: center;
}

/* Floating Pill Card */
.offline-reassurance-pill {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2-5, 10px) var(--space-4);
  background-color: var(--bg-surface-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 2px solid var(--status-offline-border);
  border-radius: var(--radius-pill);
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.28), 0 2px 6px rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
  width: 100%;
  animation: float-pill-in 360ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.offline-avatar-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-pill);
  background-color: var(--status-offline-bg);
  border: 1.5px solid var(--status-offline);
  font-size: 1.35rem;
  flex-shrink: 0;
  user-select: none;
}

.offline-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.offline-headline {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--status-offline-text);
  line-height: 1.2;
}

.offline-subtext {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-muted);
  line-height: 1.3;
}

.offline-dismiss-btn {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-width: 32px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all 140ms ease;
}

.offline-dismiss-btn:hover {
  background-color: var(--status-offline-bg);
  color: var(--status-offline-text);
  transform: scale(1.1);
}

.offline-dismiss-btn:focus-visible {
  outline: 2px solid var(--status-offline);
  outline-offset: 2px;
}

.dismiss-icon {
  width: 16px;
  height: 16px;
}

/* Compact Chip (Shown when collapsed) */
.offline-compact-chip {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  background-color: var(--bg-surface-glass);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1.5px solid var(--status-offline-border);
  color: var(--status-offline-text);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  cursor: pointer;
  transition: all 140ms ease;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
}

.offline-compact-chip:hover {
  transform: translateY(-2px);
  background-color: var(--status-offline-bg);
  box-shadow: 0 6px 16px rgba(245, 158, 11, 0.35);
}

.offline-compact-chip:focus-visible {
  outline: 2px solid var(--status-offline);
  outline-offset: 2px;
}

.compact-icon {
  font-size: 1rem;
}

.compact-label {
  line-height: 1;
}

/* Transitions */
.float-pill-enter-active,
.float-pill-leave-active {
  transition: all 240ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.float-pill-enter-from,
.float-pill-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.92);
}
</style>
