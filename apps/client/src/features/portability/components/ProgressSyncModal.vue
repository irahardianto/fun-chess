<script setup lang="ts">
import { ref, watch } from 'vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseButton from '@/components/base/BaseButton.vue';
import QrExportView from './QrExportView.vue';
import QrScannerView from './QrScannerView.vue';
import ProgressConflictModal from './ProgressConflictModal.vue';
import { useProgressSync } from '../composables/useProgressSync';
import { defaultProgressFileService } from '../services/progress_file.service';
import { usePwaInstall } from '@/features/pwa';
import { logger } from '@/platform/telemetry';

const modelValue = defineModel<boolean>({ default: false });

const activeTab = ref<'export' | 'import'>('export');
const qrString = ref('');

const { canInstall, isStandalone, promptInstall } = usePwaInstall();

const {
  isLoading,
  syncError,
  currentProgress,
  incomingPayload,
  diffPreview,
  isConflictModalOpen,
  loadCurrentProgress,
  exportJson,
  exportQrString,
  importPayload,
  executeMerge,
  clearError,
} = useProgressSync();

async function refreshExportQr() {
  try {
    qrString.value = await exportQrString();
  } catch (err: unknown) {
    syncError.value = err instanceof Error ? err.message : 'Failed to generate export QR code';
    logger.warn('Failed to refresh export QR code', {
      operation: 'progress_sync_refresh_qr',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

watch(
  modelValue,
  async (isOpen) => {
    if (isOpen) {
      clearError();
      try {
        await loadCurrentProgress();
      } catch (err: unknown) {
        syncError.value = err instanceof Error ? err.message : 'Failed to load progress data';
        logger.warn('Failed to load current progress', {
          operation: 'progress_sync_load_progress',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (activeTab.value === 'export') {
        await refreshExportQr();
      }
    }
  },
  { immediate: true }
);

watch(activeTab, async (newTab) => {
  clearError();
  if (newTab === 'export' && modelValue.value) {
    await refreshExportQr();
  }
});

async function handleDownloadJson() {
  try {
    await exportJson('funchess-save.json');
  } catch (err: unknown) {
    syncError.value = err instanceof Error ? err.message : 'Failed to export backup file';
    logger.warn('Failed to export backup file', {
      operation: 'progress_sync_export_json',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}


async function handleImportCode(code: string) {
  const success = await importPayload(code);
  if (success) {
    // If auto-merged without conflict
    modelValue.value = false;
  }
}

async function handleImportFile(file: File) {
  try {
    if (file && file.size > 2 * 1024 * 1024) {
      syncError.value = `File size exceeds 2MB limit (${(file.size / (1024 * 1024)).toFixed(2)}MB uploaded). Please upload a valid Fun Chess backup file.`;
      return;
    }
    const text = await defaultProgressFileService.readProgressFile(file);
    const success = await importPayload(text);
    if (success) {
      modelValue.value = false;
    }
  } catch (err: unknown) {
    syncError.value = err instanceof Error ? err.message : 'Failed to read save file.';
  }
}

function handleConflictResolved() {
  isConflictModalOpen.value = false;
  modelValue.value = false;
}

function handleTabKeyDown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    if (event.key === 'Home') {
      activeTab.value = 'export';
    } else if (event.key === 'End') {
      activeTab.value = 'import';
    } else {
      activeTab.value = activeTab.value === 'export' ? 'import' : 'export';
    }
    const tabEl = document.getElementById(activeTab.value === 'export' ? 'tab-export' : 'tab-import');
    tabEl?.focus();
  }
}
</script>

<template>
  <BaseModal
    v-model="modelValue"
    size="lg"
    aria-label="Sync Progress Across Devices"
  >
    <template #header>
      <div class="sync-modal-header">
        <h2 class="sync-modal-title">Sync Progress Across Devices 🔄✨</h2>
        <p class="sync-modal-subtitle">Transfer your stars, ratings, and solved puzzles with Zero Accounts!</p>
      </div>
    </template>

    <div class="sync-modal-content">
      <!-- Error Notification Pill -->
      <div v-if="syncError" class="sync-error-banner" role="alert">
        <span class="error-icon" aria-hidden="true">⚠️</span>
        <span class="error-message">{{ syncError }}</span>
        <button
          type="button"
          class="error-dismiss-btn"
          aria-label="Dismiss error"
          @click="clearError"
        >
          ✕
        </button>
      </div>

      <!-- 2-Tab Navigation Switcher -->
      <div
        class="sync-tab-bar"
        role="tablist"
        aria-label="Progress synchronization options"
        @keydown="handleTabKeyDown"
      >
        <button
          id="tab-export"
          type="button"
          role="tab"
          class="sync-tab-btn"
          :class="{ 'is-active': activeTab === 'export' }"
          :aria-selected="activeTab === 'export'"
          aria-controls="panel-export"
          :tabindex="activeTab === 'export' ? 0 : -1"
          @click="activeTab = 'export'"
        >
          📤 Export Progress
        </button>
        <button
          id="tab-import"
          type="button"
          role="tab"
          class="sync-tab-btn"
          :class="{ 'is-active': activeTab === 'import' }"
          :aria-selected="activeTab === 'import'"
          aria-controls="panel-import"
          :tabindex="activeTab === 'import' ? 0 : -1"
          @click="activeTab = 'import'"
        >
          📥 Import Progress
        </button>
      </div>

      <!-- Tab 1: Export Progress Panel -->
      <div
        v-if="activeTab === 'export'"
        id="panel-export"
        role="tabpanel"
        aria-labelledby="tab-export"
        class="sync-tab-panel"
      >
        <QrExportView
          :payload="currentProgress"
          :qr-string="qrString"
          :loading="isLoading"
          @download-json="handleDownloadJson"
        />
      </div>

      <!-- Tab 2: Import Progress Panel -->
      <div
        v-if="activeTab === 'import'"
        id="panel-import"
        role="tabpanel"
        aria-labelledby="tab-import"
        class="sync-tab-panel"
      >
        <QrScannerView
          :loading="isLoading"
          @code="handleImportCode"
          @file="handleImportFile"
        />
      </div>

      <!-- PWA Install / Offline Play Section -->
      <div
        v-if="canInstall && !isStandalone"
        class="sync-pwa-install-card"
        data-testid="sync-pwa-install-section"
      >
        <div class="pwa-card-details">
          <span class="pwa-card-icon" aria-hidden="true">📲</span>
          <div class="pwa-card-texts">
            <h4 class="pwa-card-title">Install App & Offline Play</h4>
            <p class="pwa-card-desc">Install Fun Chess on your device for instant launch and 100% offline access.</p>
          </div>
        </div>
        <BaseButton
          variant="primary"
          size="sm"
          data-testid="sync-pwa-install-btn"
          class="sync-pwa-install-action"
          @click="promptInstall"
        >
          <template #icon-left>🚀</template>
          Install App
        </BaseButton>
      </div>
    </div>
  </BaseModal>

  <!-- Conflict Resolution Modal -->
  <ProgressConflictModal
    v-if="isConflictModalOpen && diffPreview && incomingPayload"
    v-model="isConflictModalOpen"
    :current-progress="currentProgress"
    :incoming-progress="incomingPayload"
    :diff-preview="diffPreview"
    :loading="isLoading"
    @resolve="executeMerge"
    @closed="handleConflictResolved"
  />
</template>

<style scoped>
.sync-modal-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sync-modal-title {
  font-family: var(--font-display);
  font-size: var(--text-modal-h2, 22px);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  line-height: 1.2;
}

.sync-modal-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-caption, 12px);
  color: var(--text-muted);
}

.sync-modal-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

/* Error Banner */
.sync-error-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: 10px 14px;
  background-color: var(--status-danger-bg, rgba(239, 68, 68, 0.15));
  border: 1.5px solid var(--color-danger, #ef4444);
  border-radius: var(--radius-md, 12px);
  color: var(--text-main);
  font-family: var(--font-body);
  font-size: var(--text-body-base, 14px);
  animation: float-pill-in 240ms ease-out;
}

.error-icon {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.error-message {
  flex: 1;
}

.error-dismiss-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-weight: bold;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color var(--duration-fast) ease, color var(--duration-fast) ease;
}

.error-dismiss-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: var(--text-main);
}

/* Tab Bar */
.sync-tab-bar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2, 8px);
  background-color: var(--bg-app);
  padding: var(--space-1, 4px);
  border-radius: var(--radius-xl, 22px);
  border: 1px solid var(--border-subtle);
}

.sync-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2, 8px);
  min-height: var(--touch-tab, 48px);
  padding: var(--space-2, 8px) var(--space-4, 16px);
  border-radius: var(--radius-lg, 16px);
  border: none;
  background: transparent;
  font-family: var(--font-display);
  font-size: var(--text-card-h4, 16px);
  font-weight: var(--weight-bold);
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--duration-fast) ease, background-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
}

.sync-tab-btn:hover {
  color: var(--text-main);
  background-color: rgba(255, 255, 255, 0.04);
}

.sync-tab-btn.is-active {
  background-color: var(--color-primary);
  color: #ffffff;
  box-shadow: 0 4px 14px var(--color-primary-subtle);
}

.sync-tab-panel {
  width: 100%;
  animation: modal-fade-in 180ms ease-out;
}

/* PWA Install Card */
.sync-pwa-install-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  background-color: var(--color-primary-subtle, rgba(108, 92, 231, 0.1));
  border: 1.5px solid var(--color-primary, #6c5ce7);
  border-radius: var(--radius-lg, 16px);
  box-sizing: border-box;
  margin-top: var(--space-1, 4px);
}

.pwa-card-details {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  flex: 1;
  min-width: 0;
}

.pwa-card-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-pill, 9999px);
  background-color: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-medium);
}

.pwa-card-texts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pwa-card-title {
  font-family: var(--font-display);
  font-size: var(--text-sm, 14px);
  font-weight: var(--weight-bold, 700);
  color: var(--text-main);
  margin: 0;
}

.pwa-card-desc {
  font-family: var(--font-body);
  font-size: var(--text-xs, 12px);
  color: var(--text-muted);
  margin: 0;
  line-height: 1.3;
}

.sync-pwa-install-action {
  flex-shrink: 0;
  white-space: nowrap;
}

@media (max-width: 540px) {
  .sync-pwa-install-card {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3, 12px);
  }

  .sync-pwa-install-action {
    width: 100%;
  }
}

@keyframes modal-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
