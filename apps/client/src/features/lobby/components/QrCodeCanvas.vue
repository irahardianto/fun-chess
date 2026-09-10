<script setup lang="ts">
interface Props {
  qrDataUrl?: string;
  isGenerating?: boolean;
  error?: string | null | boolean;
}

withDefaults(defineProps<Props>(), {
  qrDataUrl: '',
  isGenerating: false,
  error: null,
});

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <!-- QR Code Image Frame & Error Fallback -->
  <div v-if="!error && !isGenerating && qrDataUrl" class="qr-canvas-card">
    <img
      :src="qrDataUrl"
      alt="QR Code to join chess match"
      class="qr-image"
    />
  </div>

  <div
    v-else-if="error"
    class="qr-canvas-card--error"
    role="alert"
    aria-live="assertive"
  >
    <span class="qr-error-icon" aria-hidden="true">⚠️</span>
    <div class="qr-error-title">Failed to create QR Code canvas</div>
    <p class="qr-error-desc">
      Your device browser couldn't draw the QR code. You can still join instantly using the 4-letter code or link!
    </p>
    <button
      type="button"
      class="qr-retry-btn"
      aria-label="Retry generating QR code"
      @click="emit('retry')"
    >
      🔄 Retry QR Code
    </button>
    <div class="qr-loading-placeholder" style="display: none">
      Generating QR Code...
    </div>
  </div>

  <div v-else class="qr-canvas-card">
    <div class="qr-loading-placeholder">
      Generating QR Code...
    </div>
  </div>
</template>

<style scoped src="../qr-code-modal.css"></style>
