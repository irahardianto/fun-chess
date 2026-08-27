import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';
import { useQrScanner } from '../useQrScanner';
import jsQR from 'jsqr';

// Mock jsQR
vi.mock('jsqr', () => ({
  default: vi.fn(),
}));

describe('useQrScanner composable', () => {
  let mockMediaStream: MediaStream;
  let mockTrack: MediaStreamTrack;
  let mockVideo: HTMLVideoElement;
  let mockCanvas: HTMLCanvasElement;

  beforeEach(() => {
    mockTrack = {
      stop: vi.fn(),
      enabled: true,
      id: 'mock-track-id',
      kind: 'video',
      label: 'mock-camera',
      readyState: 'live',
    } as unknown as MediaStreamTrack;

    mockMediaStream = {
      getTracks: vi.fn(() => [mockTrack]),
      getVideoTracks: vi.fn(() => [mockTrack]),
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
      },
      configurable: true,
      writable: true,
    });

    mockVideo = document.createElement('video');
    Object.defineProperty(mockVideo, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(mockVideo, 'videoHeight', { value: 480, configurable: true });
    Object.defineProperty(mockVideo, 'HAVE_ENOUGH_DATA', { value: 4, configurable: true });
    Object.defineProperty(mockVideo, 'readyState', { value: 4, configurable: true });
    mockVideo.play = vi.fn().mockResolvedValue(undefined);

    mockCanvas = document.createElement('canvas');
    // Mock Canvas 2D Context
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(640 * 480 * 4),
        width: 640,
        height: 480,
      })),
    };
    vi.spyOn(mockCanvas, 'getContext').mockReturnValue(mockCtx as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes in idle non-scanning state with no errors', () => {
    // Arrange & Act
    const scope = effectScope();
    let scanner: ReturnType<typeof useQrScanner> | undefined;
    scope.run(() => {
      scanner = useQrScanner();
    });

    // Assert
    expect(scanner?.isScanning.value).toBe(false);
    expect(scanner?.hasCamera.value).toBe(true);
    expect(scanner?.cameraError.value).toBeNull();
    expect(scanner?.scannedCode.value).toBeNull();
    scope.stop();
  });

  it('acquires camera stream with environment facingMode and starts scanning', async () => {
    // Arrange
    const scope = effectScope();
    let scanner: ReturnType<typeof useQrScanner> | undefined;
    scope.run(() => {
      scanner = useQrScanner();
    });

    // Act
    await scanner?.startScanner(mockVideo, mockCanvas);

    // Assert
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          facingMode: { ideal: 'environment' },
        }),
      })
    );
    expect(mockVideo.srcObject).toBe(mockMediaStream);
    expect(mockVideo.play).toHaveBeenCalled();
    expect(scanner?.isScanning.value).toBe(true);
    expect(scanner?.cameraError.value).toBeNull();
    scanner?.stopScanner();
    scope.stop();
  });

  it('processes video frame via jsQR and executes onScan callback on QR detection', async () => {
    // Arrange
    const scanCallback = vi.fn();
    (jsQR as any).mockReturnValue({
      data: 'FC1:eJy1V_MOCK_PAYLOAD',
    });

    // Mock requestAnimationFrame to execute synchronously once
    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb;
      return 1;
    });

    const scope = effectScope();
    let scanner: ReturnType<typeof useQrScanner> | undefined;
    scope.run(() => {
      scanner = useQrScanner({ onScan: scanCallback });
    });

    await scanner?.startScanner(mockVideo, mockCanvas);

    // Act - Trigger the frame scan callback
    if (rafCallback) {
      (rafCallback as any)(1000);
    }

    // Assert
    expect(jsQR).toHaveBeenCalled();
    expect(scanCallback).toHaveBeenCalledWith('FC1:eJy1V_MOCK_PAYLOAD');
    expect(scanner?.scannedCode.value).toBe('FC1:eJy1V_MOCK_PAYLOAD');
    scanner?.stopScanner();
    scope.stop();
  });

  it('stops scanning and releases all video tracks cleanly', async () => {
    // Arrange
    const scope = effectScope();
    let scanner: ReturnType<typeof useQrScanner> | undefined;
    scope.run(() => {
      scanner = useQrScanner();
    });

    await scanner?.startScanner(mockVideo, mockCanvas);
    expect(scanner?.isScanning.value).toBe(true);

    // Act
    scanner?.stopScanner();

    // Assert
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(scanner?.isScanning.value).toBe(false);
    scope.stop();
  });

  it('handles camera permission denied (NotAllowedError) gracefully', async () => {
    // Arrange
    const permissionError = new Error('Permission denied');
    permissionError.name = 'NotAllowedError';
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(permissionError);

    const scope = effectScope();
    let scanner: ReturnType<typeof useQrScanner> | undefined;
    scope.run(() => {
      scanner = useQrScanner();
    });

    // Act
    await scanner?.startScanner(mockVideo, mockCanvas);

    // Assert
    expect(scanner?.isScanning.value).toBe(false);
    expect(scanner?.hasCamera.value).toBe(false);
    expect(scanner?.cameraError.value).toContain('Camera permission');
    scope.stop();
  });

  it('handles missing camera device (NotFoundError) gracefully', async () => {
    // Arrange
    const notFoundError = new Error('No camera device found');
    notFoundError.name = 'NotFoundError';
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(notFoundError);

    const scope = effectScope();
    let scanner: ReturnType<typeof useQrScanner> | undefined;
    scope.run(() => {
      scanner = useQrScanner();
    });

    // Act
    await scanner?.startScanner(mockVideo, mockCanvas);

    // Assert
    expect(scanner?.isScanning.value).toBe(false);
    expect(scanner?.hasCamera.value).toBe(false);
    expect(scanner?.cameraError.value).toContain('No camera found');
    scope.stop();
  });
});
