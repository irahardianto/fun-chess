import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useCameraStream,
  stopMediaStreamTracks,
  formatCameraErrorMessage,
  acquireMediaStreamWithFallback,
  cleanupFailedStream,
} from '../useCameraStream';

describe('useCameraStream', () => {
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

    mockVideo = {
      readyState: 4,
      videoWidth: 1280,
      videoHeight: 720,
      play: vi.fn().mockResolvedValue(undefined),
      setAttribute: vi.fn(),
      srcObject: null,
      HAVE_ENOUGH_DATA: 4,
    } as unknown as HTMLVideoElement;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default camera stream states', () => {
    const { mediaStream, hasCamera, cameraError, isStreaming } = useCameraStream();

    expect(mediaStream.value).toBeNull();
    expect(hasCamera.value).toBe(true);
    expect(cameraError.value).toBeNull();
    expect(isStreaming.value).toBe(false);
  });

  it('stops media stream tracks safely when stopMediaStreamTracks is called', () => {
    const stop1 = vi.fn();
    const stop2 = vi.fn();
    const stream = {
      getTracks: vi.fn().mockReturnValue([{ stop: stop1 }, { stop: stop2 }]),
    } as unknown as MediaStream;

    stopMediaStreamTracks(stream);

    expect(stop1).toHaveBeenCalledTimes(1);
    expect(stop2).toHaveBeenCalledTimes(1);
  });

  it('handles null stream gracefully in stopMediaStreamTracks', () => {
    expect(() => stopMediaStreamTracks(null)).not.toThrow();
  });

  it('starts camera stream and assigns srcObject on video element', async () => {
    const { startStream, isStreaming, hasCamera, mediaStream } = useCameraStream();

    const result = await startStream(mockVideo);

    expect(result).toBe(mockStream);
    expect(mediaStream.value).toStrictEqual(mockStream);
    expect(isStreaming.value).toBe(true);
    expect(hasCamera.value).toBe(true);
    expect(mockVideo.srcObject).toBe(mockStream);
    expect(mockVideo.play).toHaveBeenCalled();
  });

  it('falls back to basic constraints when ideal constraints fail', async () => {
    const fallbackStream = { getTracks: vi.fn().mockReturnValue([]) };
    vi.mocked(navigator.mediaDevices.getUserMedia)
      .mockRejectedValueOnce(new Error('Overconstrained'))
      .mockResolvedValueOnce(fallbackStream as any);

    const { startStream, isStreaming } = useCameraStream();
    const result = await startStream(mockVideo);

    expect(result).toBe(fallbackStream);
    expect(isStreaming.value).toBe(true);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('handles permission denied error cleanly and stops stream', async () => {
    const permErr = new Error('Permission denied');
    permErr.name = 'NotAllowedError';
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(permErr);

    const { startStream, isStreaming, hasCamera, cameraError } = useCameraStream();
    const result = await startStream(mockVideo);

    expect(result).toBeNull();
    expect(isStreaming.value).toBe(false);
    expect(hasCamera.value).toBe(false);
    expect(cameraError.value).toContain('Camera permission was denied');
    expect(mockVideo.srcObject).toBeNull();
  });

  it('handles NotFoundError when device has no camera', async () => {
    const notFoundErr = new Error('Requested device not found');
    notFoundErr.name = 'NotFoundError';
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(notFoundErr);

    const { startStream, cameraError } = useCameraStream();
    await startStream(mockVideo);

    expect(cameraError.value).toContain('No camera found on this device');
  });

  it('handles NotReadableError when camera is in use by another app', async () => {
    const busyErr = new Error('Device in use');
    busyErr.name = 'NotReadableError';
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(busyErr);

    const { startStream, cameraError } = useCameraStream();
    await startStream(mockVideo);

    expect(cameraError.value).toContain('Camera is already in use by another application');
  });

  it('handles environment without getUserMedia support', async () => {
    vi.stubGlobal('navigator', {});

    const { startStream, hasCamera, cameraError } = useCameraStream();
    const result = await startStream(mockVideo);

    expect(result).toBeNull();
    expect(hasCamera.value).toBe(false);
    expect(cameraError.value).toContain('not supported');
  });

  it('stops stream and resets state on stopStream call', async () => {
    const { startStream, stopStream, mediaStream, isStreaming } = useCameraStream();
    await startStream(mockVideo);

    stopStream();

    expect(mediaStream.value).toBeNull();
    expect(isStreaming.value).toBe(false);
    expect(mockVideo.srcObject).toBeNull();
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it('resets camera error via resetCameraError', () => {
    const { cameraError, resetCameraError } = useCameraStream();
    cameraError.value = 'Some error';

    resetCameraError();

    expect(cameraError.value).toBeNull();
  });

  describe('formatCameraErrorMessage', () => {
    it('handles NotAllowedError', () => {
      const err = new Error('denied');
      err.name = 'NotAllowedError';
      expect(formatCameraErrorMessage(err)).toContain('Camera permission was denied');
    });

    it('handles NotFoundError', () => {
      const err = new Error('not found');
      err.name = 'NotFoundError';
      expect(formatCameraErrorMessage(err)).toContain('No camera found');
    });

    it('handles NotReadableError', () => {
      const err = new Error('in use');
      err.name = 'NotReadableError';
      expect(formatCameraErrorMessage(err)).toContain('already in use');
    });

    it('falls back to generic error message', () => {
      expect(formatCameraErrorMessage(new Error('Hardware malfunction'))).toBe('Hardware malfunction');
      expect(formatCameraErrorMessage(null)).toBe('Unable to access camera.');
    });
  });

  describe('acquireMediaStreamWithFallback', () => {
    it('throws immediately on permission errors without retrying fallback', async () => {
      const permErr = new Error('Denied');
      permErr.name = 'NotAllowedError';
      const mockService = {
        isSupported: vi.fn().mockReturnValue(true),
        getUserMedia: vi.fn().mockRejectedValue(permErr),
      };

      await expect(
        acquireMediaStreamWithFallback({ video: true }, mockService as any)
      ).rejects.toThrow('Denied');
      expect(mockService.getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('retries fallback for other errors', async () => {
      const fallback = { getTracks: vi.fn().mockReturnValue([]) } as unknown as MediaStream;
      const mockService = {
        isSupported: vi.fn().mockReturnValue(true),
        getUserMedia: vi.fn()
          .mockRejectedValueOnce(new Error('Overconstrained'))
          .mockResolvedValueOnce(fallback),
      };

      const result = await acquireMediaStreamWithFallback({ video: true }, mockService as any);
      expect(result).toBe(fallback);
      expect(mockService.getUserMedia).toHaveBeenCalledTimes(2);
    });
  });

  describe('cleanupFailedStream', () => {
    it('stops stream tracks and clears video srcObject safely', () => {
      const stopFn = vi.fn();
      const stream = {
        getTracks: vi.fn().mockReturnValue([{ stop: stopFn }]),
      } as unknown as MediaStream;
      const video = { srcObject: stream } as unknown as HTMLVideoElement;

      cleanupFailedStream(stream, video);

      expect(stopFn).toHaveBeenCalledTimes(1);
      expect(video.srcObject).toBeNull();
    });

    it('handles null stream and video gracefully', () => {
      expect(() => cleanupFailedStream(null, null)).not.toThrow();
    });
  });
});
