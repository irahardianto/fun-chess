<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted, getCurrentInstance } from 'vue';
import type { UnifiedProgressPayload } from '@fun-chess/shared';
import QRCode from 'qrcode';
import BaseButton from '@/components/base/BaseButton.vue';
import { useClipboardService } from '@/platform/di/helpers';
import { defaultClipboardService, type IClipboardService } from '@/platform/hardware/clipboard.interface';
import { useInjectLogger } from '@/platform/di';
import { logger as defaultLogger } from '@/platform/telemetry';

const props = defineProps<{
  payload: UnifiedProgressPayload | null;
  qrString: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  downloadJson: [];
}>();

function resolveClipboardService(): IClipboardService {
  if (getCurrentInstance()) {
    try {
      return useClipboardService();
    } catch (err: unknown) {
      defaultLogger.debug('Failed to inject clipboard service, using default', {
        operation: 'qr_export_resolve_clipboard',
        error: err instanceof Error ? err.message : String(err),
      });
      return defaultClipboardService;
    }
  }
  return defaultClipboardService;
}

const clipboardService = resolveClipboardService();
const logger = useInjectLogger();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const canvasError = ref<string | null>(null);
const isCopied = ref(false);
let copyTimeout: ReturnType<typeof setTimeout> | null = null;

const totalStars = computed(() => {
  if (!props.payload?.scenarios) return 0;
  return Object.values(props.payload.scenarios).reduce(
    (sum, sc) => sum + (sc.starsEarned || 0),
    0
  );
});

const currentRating = computed(() => {
  return props.payload?.puzzles?.ratingProfile?.rating ?? 800;
});

const solvedPuzzlesCount = computed(() => {
  if (!props.payload?.puzzles?.solvedPuzzles) return 0;
  return Object.keys(props.payload.puzzles.solvedPuzzles).length;
});

async function renderQrCode() {
  if (!canvasRef.value || !props.qrString) return;
  canvasError.value = null;

  try {
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvasRef.value.getContext ? canvasRef.value.getContext('2d') : null;
    } catch (err: unknown) {
      logger.debug('Failed to acquire canvas context', {
        operation: 'qr_export_get_context',
        error: err instanceof Error ? err.message : String(err),
      });
      ctx = null;
    }
    if (!ctx) {
      canvasError.value = 'Failed to acquire 2D canvas context';
      return;
    }
    await QRCode.toCanvas(canvasRef.value, props.qrString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 6,
      width: 240,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  } catch (err: unknown) {
    canvasError.value = err instanceof Error ? err.message : 'QR code generation failed';
    logger.warn('QR canvas generation note', {
      operation: 'qr_export_canvas_render',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

watch(
  () => [props.qrString, canvasRef.value],
  () => {
    nextTick(() => {
      renderQrCode();
    });
  },
  { immediate: true }
);

async function handleCopy() {
  if (!props.qrString) return;
  try {
    const success = await clipboardService.copyText(props.qrString);
    if (success) {
      isCopied.value = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        isCopied.value = false;
        copyTimeout = null;
      }, 2500);
    }
  } catch (err: unknown) {
    logger.warn('Failed to copy to clipboard', {
      operation: 'qr_export_copy_clipboard',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

onUnmounted(() => {
  if (copyTimeout) {
    clearTimeout(copyTimeout);
    copyTimeout = null;
  }
});

defineExpose({
  canvasRef,
  canvasError,
  renderQrCode,
});
</script>

<template>
  <div class="qr-export-container">
    <!-- QR Code Canvas Frame -->
    <div class="qr-canvas-frame" role="img" aria-label="QR Code containing user game progress">
      <canvas ref="canvasRef" class="qr-canvas-element" width="240" height="240" />
      <p v-if="canvasError" class="canvas-error-text" role="alert">{{ canvasError }}</p>
    </div>

    <!-- Kid-Friendly Help Copy -->
    <p class="export-guide-text">
      📱 <strong>Instructions:</strong> Open Fun Chess on your other device, switch to <em>"Import"</em>, and scan this QR code!
    </p>

    <!-- Export Action Buttons -->
    <div class="export-actions-row">
      <BaseButton
        variant="primary"
        size="md"
        :full-width="true"
        :loading="props.loading"
        @click="emit('downloadJson')"
      >
        <template #icon>💾</template>
        Download funchess-save.json (Instant Backup)
      </BaseButton>

      <BaseButton
        variant="ghost"
        size="md"
        :full-width="true"
        :disabled="!props.qrString"
        @click="handleCopy"
      >
        <template #icon>{{ isCopied ? '✅' : '📋' }}</template>
        {{ isCopied ? 'Copied QR Code Data! ✨' : 'Copy QR Code Text / Data' }}
      </BaseButton>
    </div>

    <!-- Live Stats Preview Pill -->
    <div class="stats-preview-pill">
      <span>⭐ <strong>{{ totalStars }}</strong> Stars</span>
      <span class="pill-divider">•</span>
      <span>🎯 <strong>{{ currentRating }}</strong> Elo</span>
      <span class="pill-divider">•</span>
      <span>🧩 <strong>{{ solvedPuzzlesCount }}</strong> Puzzles Solved</span>
    </div>
  </div>
</template>

<style scoped>
.qr-export-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4, 16px);
  text-align: center;
  width: 100%;
}

.qr-canvas-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-3, 12px);
  background-color: var(--qr-canvas-bg, #ffffff);
  border-radius: var(--radius-xl, 22px);
  box-shadow: var(--qr-canvas-shadow, 0 8px 24px rgba(0, 0, 0, 0.25));
  border: 4px solid var(--color-primary);
}

.qr-canvas-element {
  display: block;
  width: 240px;
  height: 240px;
  max-width: 100%;
  border-radius: calc(var(--radius-xl, 22px) - 10px);
}

.export-guide-text {
  font-family: var(--font-body);
  font-size: var(--text-body-base, 14px);
  color: var(--text-muted);
  line-height: 1.4;
  max-width: 440px;
}

.export-actions-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5, 10px);
  width: 100%;
  max-width: 440px;
}

.stats-preview-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
  padding: 8px 16px;
  background-color: var(--bg-surface-raised);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-pill, 9999px);
  font-family: var(--font-body);
  font-size: var(--text-caption, 12px);
  color: var(--text-main);
  margin-top: var(--space-1, 4px);
}

.pill-divider {
  color: var(--text-faint);
}
</style>
