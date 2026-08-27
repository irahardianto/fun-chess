import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useQrScanner } from '../useQrScanner';

describe('useQrScanner', () => {
  let mockTrack: { stop: ReturnType<typeof vi.fn> };
  let mockStream: { getTracks: ReturnType<typeof vi.fn> };
  let mockVideo: HTMLVideoElement;

  beforeEach(() => {
    mockTrack = { stop: vi.fn() };
    mockStream = { getTracks: vi.fn().mockReturnValue([mockTrack]) };

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(123));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    mockVideo = {
      readyState: 4,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn().mockResolvedValue(undefined),
      setAttribute: vi.fn(),
      srcObject: null,
      HAVE_ENOUGH_DATA: 4,
    } as unknown as HTMLVideoElement;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default scanner states', () => {
    const { isScanning, hasCamera, cameraError, scannedCode, isProcessing } = useQrScanner();

    expect(isScanning.value).toBe(false);
    expect(hasCamera.value).toBe(true);
    expect(cameraError.value).toBeNull();
    expect(scannedCode.value).toBeNull();
    expect(isProcessing.value).toBe(false);
  });

  it('starts scanner and attaches media stream to video element', async () => {
    const { startScanner, isScanning, hasCamera } = useQrScanner();

    await startScanner(mockVideo);

    expect(isScanning.value).toBe(true);
    expect(hasCamera.value).toBe(true);
    expect(mockVideo.play).toHaveBeenCalled();
  });

  it('handles camera permission errors gracefully', async () => {
    const permError = new Error('Permission denied');
    permError.name = 'NotAllowedError';
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(permError);

    const { startScanner, isScanning, cameraError } = useQrScanner();

    await startScanner(mockVideo);

    expect(isScanning.value).toBe(false);
    expect(cameraError.value).toContain('Camera permission was denied');
  });

  it('stops video tracks on stopScanner', async () => {
    const { startScanner, stopScanner, isScanning } = useQrScanner();

    await startScanner(mockVideo);
    expect(isScanning.value).toBe(true);

    stopScanner();
    expect(isScanning.value).toBe(false);
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(123);
  });

  it('resets scanner state with resetScanner', () => {
    const { resetScanner, scannedCode, cameraError, isProcessing } = useQrScanner();

    scannedCode.value = 'FC1:123';
    cameraError.value = 'error';
    isProcessing.value = true;

    resetScanner();

    expect(scannedCode.value).toBeNull();
    expect(cameraError.value).toBeNull();
    expect(isProcessing.value).toBe(false);
  });
});
