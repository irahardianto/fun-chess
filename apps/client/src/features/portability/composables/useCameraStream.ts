import { ref, onUnmounted, getCurrentInstance, onScopeDispose, getCurrentScope, type Ref } from 'vue';
import { logger, generateCorrelationId } from '@/platform/telemetry';
import { useCameraService } from '@/platform/di/helpers';
import { defaultCameraService, type ICameraService } from '@/platform/hardware/camera.interface';

export interface UseCameraStreamOptions {
  facingMode?: 'environment' | 'user';
  cameraService?: ICameraService;
}

export interface UseCameraStreamReturn {
  mediaStream: Ref<MediaStream | null>;
  hasCamera: Ref<boolean>;
  cameraError: Ref<string | null>;
  isStreaming: Ref<boolean>;
  startStream: (
    videoElement: HTMLVideoElement,
    options?: UseCameraStreamOptions
  ) => Promise<MediaStream | null>;
  stopStream: () => void;
  resetCameraError: () => void;
}

/**
 * Stops all tracks in a MediaStream safely.
 * Remediates CRIT-007: Unconditionally stops all MediaStream tracks.
 */
export function stopMediaStreamTracks(stream: MediaStream | null): void {
  if (!stream) return;
  try {
    const tracks = stream.getTracks();
    for (const track of tracks) {
      try {
        track.stop();
      } catch (err: unknown) {
        logger.warn('Failed to stop media track', {
          operation: 'camera_stop_track',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err: unknown) {
    logger.warn('Failed to get tracks from stream', {
      operation: 'camera_get_tracks',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Composable dedicated to camera stream acquisition, permission handling, and track cleanup.
 * Part of MIN-027 decomposition from useQrScanner.
 * Injects ICameraService (MAJ-015) and implements structured start/success logging (MIN-014).
 */
export function useCameraStream(defaultOptions: UseCameraStreamOptions = {}): UseCameraStreamReturn {
  function resolveCameraService(custom?: ICameraService): ICameraService {
    if (custom) return custom;
    if (getCurrentInstance()) {
      try {
        return useCameraService();
      } catch {
        return defaultCameraService;
      }
    }
    return defaultCameraService;
  }

  const cameraService = resolveCameraService(defaultOptions.cameraService);
  const mediaStream = ref<MediaStream | null>(null);
  const hasCamera = ref(true);
  const cameraError = ref<string | null>(null);
  const isStreaming = ref(false);

  let activeVideoElement: HTMLVideoElement | null = null;

  function stopStream(): void {
    if (mediaStream.value) {
      stopMediaStreamTracks(mediaStream.value);
      mediaStream.value = null;
    }

    if (activeVideoElement) {
      try {
        activeVideoElement.srcObject = null;
      } catch (err: unknown) {
        logger.warn('Failed to clear videoElement.srcObject', {
          operation: 'camera_clear_src_object',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      activeVideoElement = null;
    }

    isStreaming.value = false;
  }

  function resetCameraError(): void {
    cameraError.value = null;
  }

  async function startStream(
    videoElement: HTMLVideoElement,
    options: UseCameraStreamOptions = {}
  ): Promise<MediaStream | null> {
    stopStream();
    resetCameraError();

    const activeService = options.cameraService ? resolveCameraService(options.cameraService) : cameraService;

    if (!activeService.isSupported()) {
      hasCamera.value = false;
      cameraError.value = 'Camera access is not supported on this device/browser.';
      return null;
    }

    const correlationId = generateCorrelationId();
    const startTime = performance.now();
    const facingMode = options.facingMode || defaultOptions.facingMode || 'environment';

    logger.info('Starting camera stream acquisition', {
      operation: 'camera_start_stream',
      correlationId,
      facingMode,
    });

    let acquiredStream: MediaStream | null = null;
    activeVideoElement = videoElement;

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      try {
        acquiredStream = await activeService.getUserMedia(constraints);
      } catch (firstErr: any) {
        if (
          firstErr?.name === 'NotAllowedError' ||
          firstErr?.name === 'PermissionDeniedError' ||
          firstErr?.name === 'NotFoundError'
        ) {
          throw firstErr;
        }
        logger.warn('Exact camera constraint failed, trying basic video fallback', {
          operation: 'camera_constraints_fallback',
          correlationId,
          error: firstErr instanceof Error ? firstErr.message : String(firstErr),
        });
        acquiredStream = await activeService.getUserMedia({ video: true, audio: false });
      }

      mediaStream.value = acquiredStream;
      videoElement.srcObject = acquiredStream;
      videoElement.setAttribute('playsinline', 'true');
      await videoElement.play();

      isStreaming.value = true;
      hasCamera.value = true;
      cameraError.value = null;

      const durationMs = Math.round(performance.now() - startTime);
      logger.info('Camera stream acquired successfully', {
        operation: 'camera_start_stream',
        correlationId,
        durationMs,
      });

      return acquiredStream;
    } catch (err: any) {
      // CRIT-007: Unconditionally stop all tracks on stream and nullify video.srcObject
      if (acquiredStream) {
        stopMediaStreamTracks(acquiredStream);
      }
      if (mediaStream.value) {
        stopMediaStreamTracks(mediaStream.value);
        mediaStream.value = null;
      }
      if (videoElement) {
        try {
          videoElement.srcObject = null;
        } catch (clearErr: unknown) {
          logger.warn('Failed to clear videoElement.srcObject in catch', {
            operation: 'camera_catch_clear_src_object',
            error: clearErr instanceof Error ? clearErr.message : String(clearErr),
          });
        }
      }
      activeVideoElement = null;

      hasCamera.value = false;
      isStreaming.value = false;

      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        cameraError.value = 'Camera permission was denied. Allow camera access in browser settings to scan QR codes.';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        cameraError.value = 'No camera found on this device.';
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        cameraError.value = 'Camera is already in use by another application.';
      } else {
        cameraError.value = err?.message || 'Unable to access camera.';
      }

      const durationMs = Math.round(performance.now() - startTime);
      logger.error('Failed to start camera stream', {
        operation: 'camera_start_stream',
        correlationId,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });

      return null;
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopStream();
    });
  } else if (getCurrentInstance()) {
    onUnmounted(() => {
      stopStream();
    });
  }

  return {
    mediaStream,
    hasCamera,
    cameraError,
    isStreaming,
    startStream,
    stopStream,
    resetCameraError,
  };
}
