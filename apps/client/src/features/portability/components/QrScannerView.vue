<script setup lang="ts">
import { ref, onMounted, onUnmounted, useTemplateRef } from 'vue';
import { useQrScanner } from '../composables/useQrScanner';
import BaseButton from '@/components/base/BaseButton.vue';

const props = defineProps<{
  loading?: boolean;
}>();

const emit = defineEmits<{
  code: [code: string];
  file: [file: File];
}>();

const videoRef = useTemplateRef<HTMLVideoElement>('videoElement');
const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasElement');
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInput');

const isDragActive = ref(false);
const isManualOpen = ref(false);
const manualText = ref('');

const {
  isScanning,
  hasCamera,
  cameraError,
  startScanner,
  stopScanner,
} = useQrScanner({
  onScan: (scannedData: string) => {
    emit('code', scannedData);
  },
});

async function initCamera() {
  if (videoRef.value) {
    await startScanner(videoRef.value, canvasRef.value || undefined);
  }
}

onMounted(() => {
  initCamera();
});

onUnmounted(() => {
  stopScanner();
});

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragActive.value = true;
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault();
  isDragActive.value = false;
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragActive.value = false;

  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      emit('file', droppedFile);
    }
  }
}

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const selectedFile = target.files[0];
    if (selectedFile) {
      emit('file', selectedFile);
    }
    target.value = '';
  }
}

function handleManualSubmit() {
  const text = manualText.value.trim();
  if (text) {
    emit('code', text);
  }
}
</script>

<template>
  <div class="qr-scanner-view-container">
    <!-- Camera Viewport Card -->
    <div class="scanner-viewport-card" aria-label="Camera scanner viewfinder">
      <!-- Live Video Feed -->
      <video
        ref="videoElement"
        class="scanner-video-feed"
        autoplay
        muted
        playsinline
      />

      <!-- Hidden canvas for pixel extraction -->
      <canvas ref="canvasElement" class="scanner-hidden-canvas" />

      <!-- Active Scanning Overlay (Reticle + Sweeping Laser) -->
      <div v-if="isScanning && !cameraError" class="scanner-reticle-overlay">
        <span class="reticle-corner top-left" />
        <span class="reticle-corner top-right" />
        <span class="reticle-corner bottom-left" />
        <span class="reticle-corner bottom-right" />
        <div class="scanner-laser-line" />
        <span class="scanner-aim-hint">Point camera at QR code</span>
      </div>

      <!-- Camera Error / Empty State Fallback -->
      <div v-if="cameraError || !hasCamera" class="scanner-empty-state">
        <span class="scanner-empty-icon" aria-hidden="true">📷 ⚠️</span>
        <p class="scanner-error-text">{{ cameraError || 'Camera unavailable. Allow camera access in browser settings or upload a save file below.' }}</p>
        <BaseButton
          variant="ghost"
          size="sm"
          @click="initCamera"
        >
          🔄 Try Camera Again
        </BaseButton>
      </div>
    </div>

    <!-- OR Divider -->
    <div class="or-divider">
      <span class="or-line" />
      <span class="or-text">— OR —</span>
      <span class="or-line" />
    </div>

    <!-- Drag & Drop JSON Dropzone -->
    <div
      class="dropzone-box"
      :class="{ 'is-drag-active': isDragActive }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <input
        ref="fileInput"
        type="file"
        accept=".json,application/json"
        class="dropzone-hidden-input"
        @change="handleFileChange"
      >

      <span class="dropzone-icon" aria-hidden="true">📁</span>
      <div class="dropzone-text-group">
        <p class="dropzone-title">Drag and drop save file (.json)</p>
        <p class="dropzone-subtitle">or restore an exported backup file</p>
      </div>

      <BaseButton
        variant="ghost"
        size="sm"
        :loading="props.loading"
        @click="fileInputRef?.click()"
      >
        📂 Browse File
      </BaseButton>
    </div>

    <!-- Manual Code Input Collapsible Drawer -->
    <div class="manual-drawer-wrapper">
      <button
        type="button"
        class="manual-drawer-toggle"
        :aria-expanded="isManualOpen"
        @click="isManualOpen = !isManualOpen"
      >
        <span>{{ isManualOpen ? '▲ Hide Manual Input' : '▼ Paste Code / Manual Text Fallback' }}</span>
      </button>

      <div v-if="isManualOpen" class="manual-input-drawer">
        <label for="manual-backup-input" class="sr-only">Paste backup code or JSON text</label>
        <textarea
          id="manual-backup-input"
          v-model="manualText"
          class="manual-textarea"
          placeholder="Paste Version 12 code string (FC1:...) or JSON backup..."
          rows="3"
        />
        <BaseButton
          variant="primary"
          size="sm"
          :disabled="!manualText.trim()"
          :loading="props.loading"
          @click="handleManualSubmit"
        >
          📥 Load Progress
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qr-scanner-view-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3, 12px);
  width: 100%;
}

/* Viewport Card */
.scanner-viewport-card {
  position: relative;
  width: 100%;
  max-width: 380px;
  height: 260px;
  background-color: var(--qr-scanner-bg, #000000);
  border-radius: var(--radius-xl, 22px);
  overflow: hidden;
  margin: 0 auto;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.40);
  border: 2px solid var(--border-medium);
}

.scanner-video-feed {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scanner-hidden-canvas {
  display: none;
}

/* Reticle Overlay */
.scanner-reticle-overlay {
  position: absolute;
  inset: 20px;
  pointer-events: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 8px;
}

.reticle-corner {
  position: absolute;
  width: 28px;
  height: 28px;
  border-color: var(--qr-reticle-color, #10b981);
}

.reticle-corner.top-left {
  top: 0;
  left: 0;
  border-top: 3px solid var(--qr-reticle-color, #10b981);
  border-left: 3px solid var(--qr-reticle-color, #10b981);
  border-top-left-radius: 8px;
}

.reticle-corner.top-right {
  top: 0;
  right: 0;
  border-top: 3px solid var(--qr-reticle-color, #10b981);
  border-right: 3px solid var(--qr-reticle-color, #10b981);
  border-top-right-radius: 8px;
}

.reticle-corner.bottom-left {
  bottom: 0;
  left: 0;
  border-bottom: 3px solid var(--qr-reticle-color, #10b981);
  border-left: 3px solid var(--qr-reticle-color, #10b981);
  border-bottom-left-radius: 8px;
}

.reticle-corner.bottom-right {
  bottom: 0;
  right: 0;
  border-bottom: 3px solid var(--qr-reticle-color, #10b981);
  border-right: 3px solid var(--qr-reticle-color, #10b981);
  border-bottom-right-radius: 8px;
}

/* Sweeping Laser Scanline */
.scanner-laser-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--qr-laser-line, linear-gradient(90deg, transparent, #10b981 30%, #34d399 50%, #10b981 70%, transparent));
  box-shadow: 0 0 12px 3px rgba(16, 185, 129, 0.90);
  animation: laser-sweep 2.2s ease-in-out infinite alternate;
}

@keyframes laser-sweep {
  0% {
    top: 15%;
    opacity: 0.85;
  }
  50% {
    opacity: 1.0;
    filter: drop-shadow(0 0 8px #10b981);
  }
  100% {
    top: 85%;
    opacity: 0.85;
  }
}

.scanner-aim-hint {
  font-family: var(--font-display);
  font-size: var(--text-caption, 12px);
  color: #ffffff;
  background: rgba(0, 0, 0, 0.65);
  padding: 2px 8px;
  border-radius: var(--radius-pill, 9999px);
}

.scanner-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: var(--space-4, 16px);
  text-align: center;
  color: var(--text-muted);
  gap: var(--space-2, 8px);
}

.scanner-empty-icon {
  font-size: 2.2rem;
}

.scanner-error-text {
  font-family: var(--font-body);
  font-size: var(--text-caption, 12px);
  color: var(--text-muted);
  max-width: 260px;
}

/* OR Divider */
.or-divider {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  width: 100%;
  max-width: 440px;
  margin: var(--space-1, 4px) 0;
}

.or-line {
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}

.or-text {
  font-family: var(--font-display);
  font-size: var(--text-caption, 12px);
  font-weight: var(--weight-bold);
  color: var(--text-faint);
  letter-spacing: 0.05em;
}

/* Dropzone */
.dropzone-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2, 8px);
  width: 100%;
  max-width: 440px;
  padding: var(--space-4, 16px);
  background-color: var(--dropzone-bg, rgba(124, 58, 237, 0.06));
  border: var(--dropzone-border, 2px dashed var(--color-primary));
  border-radius: var(--radius-lg, 16px);
  text-align: center;
  transition: background-color var(--duration-fast) ease, border-color var(--duration-fast) ease, transform var(--duration-fast) ease;
  box-sizing: border-box;
}

.dropzone-box.is-drag-active {
  background-color: var(--dropzone-bg-active, rgba(124, 58, 237, 0.16));
  border: var(--dropzone-border-active, 2px dashed #a78bfa);
  transform: scale(1.02);
}

.dropzone-hidden-input {
  display: none;
}

.dropzone-icon {
  font-size: 1.8rem;
}

.dropzone-text-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dropzone-title {
  font-family: var(--font-display);
  font-size: var(--text-body-base, 14px);
  font-weight: var(--weight-bold);
  color: var(--text-main);
}

.dropzone-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-caption, 12px);
  color: var(--text-muted);
}

/* Manual Drawer */
.manual-drawer-wrapper {
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.manual-drawer-toggle {
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: var(--text-caption, 12px);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  padding: 6px 12px;
  border-radius: var(--radius-pill, 9999px);
  transition: color var(--duration-fast) ease, background-color var(--duration-fast) ease;
}

.manual-drawer-toggle:hover {
  color: var(--text-main);
  background-color: var(--bg-surface-raised);
}

.manual-input-drawer {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  margin-top: var(--space-2, 8px);
}

.manual-textarea {
  width: 100%;
  min-height: 70px;
  padding: var(--space-2-5, 10px);
  background-color: var(--bg-app);
  border: 1.5px solid var(--border-medium);
  border-radius: var(--radius-md, 12px);
  font-family: var(--font-mono, monospace);
  font-size: 16px;
  color: var(--text-main);
  resize: vertical;
  box-sizing: border-box;
}

.manual-textarea:focus {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: var(--focus-ring);
}
</style>
