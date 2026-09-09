import { ref, onUnmounted, getCurrentInstance, getCurrentScope, onScopeDispose, type Ref } from 'vue';
import jsQR from 'jsqr';
import { useInjectLogger } from '@/platform/di';
import { logger as defaultLogger } from '@/platform/telemetry';

export interface UseQrDecoderOptions {
  onScan?: (code: string) => void;
}

export interface UseQrDecoderReturn {
  scannedCode: Ref<string | null>;
  isProcessing: Ref<boolean>;
  isDecoding: Ref<boolean>;
  startDecoding: (
    videoElement: HTMLVideoElement,
    canvasElement?: HTMLCanvasElement,
    onScan?: (code: string) => void
  ) => void;
  stopDecoding: () => void;
  resetDecoder: () => void;
}

/**
 * Composable dedicated to QR code frame analysis and decoding via jsQR.
 * Part of MIN-027 decomposition from useQrScanner.
 */
export function useQrDecoder(defaultOptions: UseQrDecoderOptions = {}): UseQrDecoderReturn {
  const logger = getCurrentInstance() ? useInjectLogger() : defaultLogger;
  const scannedCode = ref<string | null>(null);
  const isProcessing = ref(false);
  const isDecoding = ref(false);

  let animationFrameId: number | null = null;
  let internalCanvas: HTMLCanvasElement | null = null;

  function stopDecoding(): void {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    isDecoding.value = false;
  }

  function resetDecoder(): void {
    scannedCode.value = null;
    isProcessing.value = false;
  }

  function scanFrame(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement,
    onScan?: (code: string) => void
  ): void {
    if (!isDecoding.value) return;

    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
      const width = videoElement.videoWidth;
      const height = videoElement.videoHeight;

      if (width > 0 && height > 0) {
        canvasElement.width = width;
        canvasElement.height = height;

        const ctx = canvasElement.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(videoElement, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);

          try {
            const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });

            if (qrResult && qrResult.data) {
              const code = qrResult.data.trim();
              if (code && code !== scannedCode.value) {
                scannedCode.value = code;
                isProcessing.value = true;
                const callback = onScan || defaultOptions.onScan;
                if (callback) {
                  callback(code);
                }
              }
            }
          } catch (err) {
            logger.warn('Frame scan error during QR decoding', {
              operation: 'qr_decode_frame',
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }

    if (isDecoding.value) {
      animationFrameId = requestAnimationFrame(() =>
        scanFrame(videoElement, canvasElement, onScan)
      );
    }
  }

  function startDecoding(
    videoElement: HTMLVideoElement,
    canvasElement?: HTMLCanvasElement,
    onScan?: (code: string) => void
  ): void {
    stopDecoding();

    let targetCanvas = canvasElement;
    if (!targetCanvas) {
      if (!internalCanvas) {
        internalCanvas = document.createElement('canvas');
      }
      targetCanvas = internalCanvas;
    }

    isDecoding.value = true;
    animationFrameId = requestAnimationFrame(() =>
      scanFrame(videoElement, targetCanvas!, onScan)
    );
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopDecoding();
    });
  } else if (getCurrentInstance()) {
    onUnmounted(() => {
      stopDecoding();
    });
  }

  return {
    scannedCode,
    isProcessing,
    isDecoding,
    startDecoding,
    stopDecoding,
    resetDecoder,
  };
}
