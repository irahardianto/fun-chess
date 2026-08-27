import { ref, onUnmounted, getCurrentInstance, type Ref } from 'vue';
import jsQR from 'jsqr';

export interface UseQrScannerOptions {
  onScan?: (code: string) => void;
  facingMode?: 'environment' | 'user';
}

export interface UseQrScannerReturn {
  isScanning: Ref<boolean>;
  hasCamera: Ref<boolean>;
  cameraError: Ref<string | null>;
  scannedCode: Ref<string | null>;
  isProcessing: Ref<boolean>;
  startScanner: (videoElement: HTMLVideoElement, canvasElement?: HTMLCanvasElement) => Promise<void>;
  stopScanner: () => void;
  resetScanner: () => void;
}

/**
 * Composable for camera acquisition and real-time QR code frame scanning via jsQR.
 * Handles lifecycle cleanup, permission errors, and frame analysis loops.
 */
export function useQrScanner(options: UseQrScannerOptions = {}): UseQrScannerReturn {
  const isScanning = ref(false);
  const hasCamera = ref(true);
  const cameraError = ref<string | null>(null);
  const scannedCode = ref<string | null>(null);
  const isProcessing = ref(false);

  let mediaStream: MediaStream | null = null;
  let animationFrameId: number | null = null;
  let internalCanvas: HTMLCanvasElement | null = null;

  function stopScanner(): void {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      mediaStream = null;
    }

    isScanning.value = false;
  }

  function resetScanner(): void {
    scannedCode.value = null;
    cameraError.value = null;
    isProcessing.value = false;
  }

  function scanFrame(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement): void {
    if (!isScanning.value) return;

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
                if (options.onScan) {
                  options.onScan(code);
                }
              }
            }
          } catch (err) {
            console.warn('[FC_PROGRESS_SYNC] Frame scan error', err);
          }
        }
      }
    }

    if (isScanning.value) {
      animationFrameId = requestAnimationFrame(() => scanFrame(videoElement, canvasElement));
    }
  }

  async function startScanner(
    videoElement: HTMLVideoElement,
    canvasElement?: HTMLCanvasElement
  ): Promise<void> {
    stopScanner();
    resetScanner();

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      hasCamera.value = false;
      cameraError.value = 'Camera access is not supported on this device/browser.';
      return;
    }

    try {
      const facingMode = options.facingMode || 'environment';
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr: any) {
        if (
          firstErr?.name === 'NotAllowedError' ||
          firstErr?.name === 'PermissionDeniedError' ||
          firstErr?.name === 'NotFoundError'
        ) {
          throw firstErr;
        }
        // Fallback to basic video constraint if ideal facingMode fails
        console.warn('[FC_PROGRESS_SYNC] Exact camera constraint failed, trying basic video fallback', firstErr);
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      mediaStream = stream;
      videoElement.srcObject = stream;
      videoElement.setAttribute('playsinline', 'true'); // Required for iOS Safari
      await videoElement.play();

      if (!canvasElement) {
        if (!internalCanvas) {
          internalCanvas = document.createElement('canvas');
        }
        canvasElement = internalCanvas;
      }

      isScanning.value = true;
      hasCamera.value = true;
      cameraError.value = null;

      animationFrameId = requestAnimationFrame(() => scanFrame(videoElement, canvasElement!));
    } catch (err: any) {
      hasCamera.value = false;
      isScanning.value = false;

      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        cameraError.value = 'Camera permission was denied. Please allow camera access in your browser settings to scan QR codes! 📷';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        cameraError.value = 'No camera found on this device.';
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        cameraError.value = 'Camera is already in use by another application.';
      } else {
        cameraError.value = err?.message || 'Unable to access camera.';
      }

      console.error('[FC_PROGRESS_SYNC] Failed to start camera scanner', err);
    }
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      stopScanner();
    });
  }

  return {
    isScanning,
    hasCamera,
    cameraError,
    scannedCode,
    isProcessing,
    startScanner,
    stopScanner,
    resetScanner,
  };
}
