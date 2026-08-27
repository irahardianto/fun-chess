<script setup lang="ts">
import { computed } from "vue";
import { BaseButton } from "@/components/base";
import { usePwaInstall } from "../composables/usePwaInstall";

interface Props {
  forceShow?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  forceShow: false,
});

const emit = defineEmits<{
  install: [];
  dismiss: [];
}>();

const { showInstallBanner, promptInstall, snoozePrompt } = usePwaInstall();

const isVisible = computed(() => props.forceShow || showInstallBanner.value);

async function handleInstallClick() {
  emit("install");
  await promptInstall();
}

function handleDismiss() {
  emit("dismiss");
  snoozePrompt(7);
}
</script>

<template>
  <Transition name="banner-slide">
    <div
      v-if="isVisible"
      class="pwa-install-banner-wrapper"
      role="banner"
      aria-label="PWA Installation Offer"
      data-testid="pwa-install-banner"
    >
      <div class="pwa-banner-card">
        <!-- Icon Badge -->
        <div class="banner-icon-badge" aria-hidden="true">
          🎮✨
        </div>

        <!-- Text Content -->
        <div class="banner-text-content">
          <h4 class="banner-title">Install Fun Chess on your Device!</h4>
          <p class="banner-desc">Play anywhere, even without Wi-Fi or internet!</p>
        </div>

        <!-- Action Buttons -->
        <div class="banner-actions">
          <BaseButton
            variant="ghost"
            size="sm"
            class="banner-btn-secondary"
            data-testid="pwa-banner-dismiss-btn"
            @click="handleDismiss"
          >
            Remind me later
          </BaseButton>

          <BaseButton
            variant="accent"
            size="sm"
            class="banner-btn-primary"
            data-testid="pwa-banner-install-btn"
            @click="handleInstallClick"
          >
            <template #icon-right>🚀</template>
            Install App
          </BaseButton>
        </div>

        <!-- Quick Close Button -->
        <button
          type="button"
          class="banner-close-btn"
          aria-label="Dismiss install banner"
          data-testid="pwa-banner-close-btn"
          @click="handleDismiss"
        >
          ✕
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pwa-install-banner-wrapper {
  position: fixed;
  bottom: max(20px, calc(12px + env(safe-area-inset-bottom, 0px)));
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-pwa-banner, 45);
  width: min(580px, calc(100% - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  max-width: 580px;
  pointer-events: none;
}

.pwa-banner-card {
  pointer-events: auto;
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background-color: var(--bg-surface-glass);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-xl);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
}

.banner-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-lg);
  background-color: var(--color-primary-subtle);
  border: 1.5px solid var(--color-primary);
  font-size: 1.4rem;
  flex-shrink: 0;
  user-select: none;
}

.banner-text-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.banner-title {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  line-height: 1.2;
  margin: 0;
}

.banner-desc {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-muted);
  line-height: 1.3;
  margin: 0;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.banner-close-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 10px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-size: var(--text-sm);
  transition: background-color var(--duration-fast, 140ms) ease, color var(--duration-fast, 140ms) ease;
  position: absolute;
  top: 4px;
  inset-inline-end: 4px;
}

@media (max-width: 600px) {
  .pwa-banner-card {
    flex-wrap: wrap;
    padding-top: var(--space-4);
  }

  .banner-close-btn {
    display: flex;
  }

  .banner-actions {
    width: 100%;
    justify-content: flex-end;
    margin-top: var(--space-1);
  }

  .banner-btn-secondary,
  .banner-btn-primary {
    flex: 1;
  }
}

/* Animations */
.banner-slide-enter-active,
.banner-slide-leave-active {
  transition: transform 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 200ms ease;
}

.banner-slide-enter-from,
.banner-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, 40px) scale(0.92);
}
</style>
