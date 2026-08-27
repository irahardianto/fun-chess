<script setup lang="ts">
import { computed } from 'vue';
import { BaseModal, BaseButton } from '@/components/base';
import { usePwaInstall } from '../composables/usePwaInstall';

interface Props {
  modelValue?: boolean;
  isOpen?: boolean;
  forceIos?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: undefined,
  isOpen: undefined,
  forceIos: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  close: [];
  installed: [];
}>();

const {
  isInstallModalOpen,
  isIosSafari,
  deferredPrompt,
  promptInstall,
  closeInstallModal,
} = usePwaInstall();

const isVisible = computed({
  get: () => {
    if (props.modelValue !== undefined) return props.modelValue;
    if (props.isOpen !== undefined) return props.isOpen;
    return isInstallModalOpen.value;
  },
  set: (val) => {
    emit('update:modelValue', val);
    if (!val) {
      closeInstallModal();
      emit('close');
    }
  },
});

const isIos = computed(() =>
  props.forceIos !== undefined ? props.forceIos : isIosSafari.value
);

const modalTitle = computed(() =>
  isIos.value ? 'Install Fun Chess on iOS 🍎' : 'Install Fun Chess App 🚀'
);

function handleClose() {
  isVisible.value = false;
}

async function handleNativeInstall() {
  const success = await promptInstall();
  if (success) {
    emit('installed');
    handleClose();
  }
}
</script>

<template>
  <BaseModal
    v-model="isVisible"
    :title="modalTitle"
    size="md"
    data-testid="pwa-install-modal"
  >
    <div class="install-modal-content">
      <!-- 1. iOS Safari 3-Step Guide -->
      <template v-if="isIos">
        <p class="install-subtitle">
          Follow these 3 easy steps to play offline on your Home Screen!
        </p>

        <div class="ios-step-list" data-testid="ios-install-steps">
          <div class="ios-step-card">
            <div class="step-number-badge">1</div>
            <div class="step-content">
              <div class="step-title">Tap the Share Button</div>
              <div class="step-desc">
                Tap the Share icon
                <span class="step-icon-highlight">⎋</span>
                located at the bottom of Safari.
              </div>
            </div>
          </div>

          <div class="ios-step-card">
            <div class="step-number-badge">2</div>
            <div class="step-content">
              <div class="step-title">Scroll & Tap "Add to Home Screen"</div>
              <div class="step-desc">
                Scroll down the menu options and tap
                <span class="step-icon-highlight">➕ Add to Home Screen</span>.
              </div>
            </div>
          </div>

          <div class="ios-step-card">
            <div class="step-number-badge">3</div>
            <div class="step-content">
              <div class="step-title">Tap "Add" in Top Right Corner</div>
              <div class="step-desc">
                Tap <span class="step-icon-highlight">Add</span> to complete installation. You're ready to play offline! 🎉
              </div>
            </div>
          </div>
        </div>

        <div class="install-modal-actions">
          <BaseButton
            variant="primary"
            size="lg"
            :full-width="true"
            data-testid="ios-install-done-btn"
            @click="handleClose"
          >
            Got it, Let's Play! ♟️
          </BaseButton>
        </div>
      </template>

      <!-- 2. Desktop & Android Instructions -->
      <template v-else>
        <p class="install-subtitle">
          Enjoy fullscreen chess, faster loading, and 100% offline play!
        </p>

        <div v-if="deferredPrompt" class="native-install-cta">
          <BaseButton
            variant="accent"
            size="lg"
            :full-width="true"
            data-testid="native-install-btn"
            @click="handleNativeInstall"
          >
            <template #icon-right>🚀</template>
            Install Fun Chess Now
          </BaseButton>
        </div>

        <div class="platform-tips-list">
          <div class="platform-tip-card">
            <div class="tip-icon-badge">💻</div>
            <div class="step-content">
              <div class="step-title">Chrome / Edge / Desktop</div>
              <div class="step-desc">
                Look for the install icon
                <span class="step-icon-highlight">⊕</span>
                in your browser address bar.
              </div>
            </div>
          </div>

          <div class="platform-tip-card">
            <div class="tip-icon-badge">🤖</div>
            <div class="step-content">
              <div class="step-title">Android (Chrome)</div>
              <div class="step-desc">
                Tap the menu <span class="step-icon-highlight">⋮</span> and select
                <span class="step-icon-highlight">Add to Home screen</span>.
              </div>
            </div>
          </div>
        </div>

        <div class="install-modal-actions">
          <BaseButton
            variant="ghost"
            size="md"
            :full-width="true"
            data-testid="install-modal-close-btn"
            @click="handleClose"
          >
            Close
          </BaseButton>
        </div>
      </template>
    </div>
  </BaseModal>
</template>

<style scoped>
.install-modal-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.install-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--text-muted);
  line-height: 1.4;
  margin: 0;
}

.ios-step-list,
.platform-tips-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ios-step-card,
.platform-tip-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background-color: var(--bg-surface-raised);
  border: 1.5px solid var(--border-medium);
  border-radius: var(--radius-lg);
  transition: transform 180ms ease, border-color 180ms ease;
  box-sizing: border-box;
}

.ios-step-card:hover,
.platform-tip-card:hover {
  transform: translateX(3px);
  border-color: var(--color-primary);
}

.step-number-badge,
.tip-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: #ffffff;
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  flex-shrink: 0;
}

.tip-icon-badge {
  background: var(--color-primary-subtle);
  border: 1.5px solid var(--color-primary);
  font-size: 1.1rem;
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.step-title {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--text-main);
}

.step-desc {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-muted);
  line-height: 1.4;
}

.step-icon-highlight {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  font-family: var(--font-mono);
  font-weight: bold;
  color: var(--color-accent-text);
}

.native-install-cta {
  margin-bottom: var(--space-1);
}

.install-modal-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-2);
}
</style>
