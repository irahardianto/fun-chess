import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jsQR from 'jsqr';
import { useQrDecoder } from '../useQrDecoder';

vi.mock('jsqr', () => ({
  default: vi.fn(),
}));

describe('useQrDecoder', () => {
  let mockVideo: HTMLVideoElement;
  let mockCanvas: HTMLCanvasElement;
  let mockCtx: { drawImage: ReturnType<typeof vi.fn>; getImageData: ReturnType<typeof vi.fn> };
  let rafCallbacks: Array<() => void>;

  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: () => void) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({
        data: new Uint8ClampedArray(400),
        width: 10,
        height: 10,
      }),
    };

    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
    } as unknown as HTMLCanvasElement;

    mockVideo = {
      readyState: 4,
      videoWidth: 640,
      videoHeight: 480,
      HAVE_ENOUGH_DATA: 4,
    } as unknown as HTMLVideoElement;

    vi.mocked(jsQR).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default decoder state', () => {
    const { scannedCode, isProcessing, isDecoding } = useQrDecoder();

    expect(scannedCode.value).toBeNull();
    expect(isProcessing.value).toBe(false);
    expect(isDecoding.value).toBe(false);
  });

  it('starts decoding and registers animation frame loop', () => {
    const { startDecoding, isDecoding } = useQrDecoder();

    startDecoding(mockVideo, mockCanvas);

    expect(isDecoding.value).toBe(true);
    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it('stops decoding and cancels animation frame', () => {
    const { startDecoding, stopDecoding, isDecoding } = useQrDecoder();

    startDecoding(mockVideo, mockCanvas);
    expect(isDecoding.value).toBe(true);

    stopDecoding();
    expect(isDecoding.value).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('scans frame, decodes QR code, updates reactive state, and triggers onScan callback', () => {
    const onScan = vi.fn();
    vi.mocked(jsQR).mockReturnValue({
      data: 'https://funchess.app/sync#room=ABCD',
    } as any);

    const { startDecoding, scannedCode, isProcessing } = useQrDecoder();
    startDecoding(mockVideo, mockCanvas, onScan);

    // Execute the queued animation frame callback
    expect(rafCallbacks.length).toBeGreaterThan(0);
    rafCallbacks[0]();

    expect(mockCtx.drawImage).toHaveBeenCalledWith(mockVideo, 0, 0, 640, 480);
    expect(jsQR).toHaveBeenCalled();
    expect(scannedCode.value).toBe('https://funchess.app/sync#room=ABCD');
    expect(isProcessing.value).toBe(true);
    expect(onScan).toHaveBeenCalledWith('https://funchess.app/sync#room=ABCD');
  });

  it('ignores frames when video element does not have enough data', () => {
    const lowDataVideo = {
      ...mockVideo,
      readyState: 1, // HAVE_METADATA only
    } as unknown as HTMLVideoElement;

    const onScan = vi.fn();
    const { startDecoding } = useQrDecoder();
    startDecoding(lowDataVideo, mockCanvas, onScan);

    rafCallbacks[0]();

    expect(mockCtx.drawImage).not.toHaveBeenCalled();
    expect(jsQR).not.toHaveBeenCalled();
    expect(onScan).not.toHaveBeenCalled();
  });

  it('resets scannedCode and isProcessing on resetDecoder', () => {
    const { scannedCode, isProcessing, resetDecoder } = useQrDecoder();
    scannedCode.value = 'old-code';
    isProcessing.value = true;

    resetDecoder();

    expect(scannedCode.value).toBeNull();
    expect(isProcessing.value).toBe(false);
  });
});
