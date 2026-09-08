import { ref, onUnmounted, getCurrentInstance, type Ref } from 'vue';
import { useCameraStream, type UseCameraStreamOptions } from './useCameraStream';
import { useQrDecoder, type UseQrDecoderOptions } from './useQrDecoder';

export interface UseQrScannerOptions extends UseCameraStreamOptions, UseQrDecoderOptions {}

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

export * from './useCameraStream';
export * from './useQrDecoder';

/**
 * Composable for camera acquisition and real-time QR code frame scanning via jsQR.
 * Recomposed from useCameraStream and useQrDecoder per MIN-027.
 * Preserves full backward compatibility and remediates CRIT-007 track cleanup.
 */
export function useQrScanner(options: UseQrScannerOptions = {}): UseQrScannerReturn {
  const isScanning = ref(false);

  const cameraStream = useCameraStream({ facingMode: options.facingMode });
  const qrDecoder = useQrDecoder({ onScan: options.onScan });

  const { hasCamera, cameraError } = cameraStream;
  const { scannedCode, isProcessing } = qrDecoder;

  function stopScanner(): void {
    qrDecoder.stopDecoding();
    cameraStream.stopStream();
    isScanning.value = false;
  }

  function resetScanner(): void {
    qrDecoder.resetDecoder();
    cameraStream.resetCameraError();
    isProcessing.value = false;
  }

  async function startScanner(
    videoElement: HTMLVideoElement,
    canvasElement?: HTMLCanvasElement
  ): Promise<void> {
    stopScanner();
    resetScanner();

    const stream = await cameraStream.startStream(videoElement, {
      facingMode: options.facingMode,
    });

    if (stream) {
      isScanning.value = true;
      qrDecoder.startDecoding(videoElement, canvasElement, options.onScan);
    } else {
      isScanning.value = false;
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
