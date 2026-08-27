<script setup lang="ts">
import { ref, watch } from 'vue';
import BaseModal from '@/components/base/BaseModal.vue';
import QrExportView from './QrExportView.vue';
import QrScannerView from './QrScannerView.vue';
import ProgressConflictModal from './ProgressConflictModal.vue';
import { useProgressSync } from '../composables/useProgressSync';
import { defaultProgressFileService } from '../services/progress_file.service';

const modelValue = defineModel<boolean>({ default: false });

const activeTab = ref<'export' | 'import'>('export');
const qrString = ref('');

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
  } catch {
    // handled by composable syncError
  }
}

watch(
  modelValue,
  async (isOpen) => {
    if (isOpen) {
      clearError();
      await loadCurrentProgress().catch(() => {});
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
  await exportJson('funchess-save.json').catch(() => {});
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
    const text = await defaultProgressFileService.readProgressFile(file);
    const success = await importPayload(text);
    if (success) {
      modelValue.value = false;
    }
  } catch (err: any) {
    syncError.value = err?.message || 'Failed to read save file.';
  }
}

function handleConflictResolved() {
  isConflictModalOpen.value = false;
  modelValue.value = false;
}

function handleTabKeyDown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    activeTab.value = activeTab.value === 'export' ? 'import' : 'export';
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
          tabindex="0"
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
          tabindex="0"
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
  color: var(--text-primary, #f8fafc);
  line-height: 1.2;
}

.sync-modal-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-caption, 12px);
  color: var(--text-secondary, #94a3b8);
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
  border: 1.5px solid var(--status-danger, #ef4444);
  border-radius: var(--radius-md, 12px);
  color: var(--text-primary, #f8fafc);
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
  color: var(--text-secondary, #94a3b8);
  font-weight: bold;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 140ms ease;
}

.error-dismiss-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

/* Tab Bar */
.sync-tab-bar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2, 8px);
  background-color: var(--bg-primary, #0f0f1b);
  padding: var(--space-1, 4px);
  border-radius: var(--radius-xl, 22px);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
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
  color: var(--text-secondary, #94a3b8);
  cursor: pointer;
  transition: all 180ms ease;
}

.sync-tab-btn:hover {
  color: var(--text-primary, #f8fafc);
  background-color: rgba(255, 255, 255, 0.04);
}

.sync-tab-btn.is-active {
  background-color: var(--accent-primary, #7c3aed);
  color: #ffffff;
  box-shadow: 0 4px 14px var(--accent-primary-glow, rgba(124, 58, 237, 0.45));
}

.sync-tab-panel {
  width: 100%;
  animation: modal-fade-in 180ms ease-out;
}

@keyframes modal-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
