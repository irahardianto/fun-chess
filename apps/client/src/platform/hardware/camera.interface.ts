/**
 * Camera/MediaDevices hardware abstraction and test doubles.
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Finding MAJ-015.
 */

export interface ICameraService {
  /**
   * Requests user media video stream matching constraints.
   */
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;

  /**
   * Checks if mediaDevices and getUserMedia are supported in the current browser context.
   */
  isSupported(): boolean;
}

/**
 * Production implementation delegating to navigator.mediaDevices.getUserMedia.
 */
export class BrowserCameraService implements ICameraService {
  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  public async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    if (!this.isSupported()) {
      throw new Error('Camera/MediaDevices API is not supported in this environment');
    }
    return navigator.mediaDevices.getUserMedia(constraints);
  }
}

/**
 * Test double implementation providing controllable MediaStream for camera and QR scanner testing.
 */
export class MockCameraService implements ICameraService {
  public supported: boolean;
  public mockStream: MediaStream | null;
  public lastConstraints?: MediaStreamConstraints;

  constructor(supported: boolean = true, mockStream: MediaStream | null = null) {
    this.supported = supported;
    this.mockStream = mockStream;
  }

  public isSupported(): boolean {
    return this.supported;
  }

  public async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    this.lastConstraints = constraints;
    if (!this.supported) {
      throw new DOMException('Permission denied', 'NotAllowedError');
    }
    if (this.mockStream) {
      return this.mockStream;
    }

    const track = {
      kind: 'video',
      enabled: true,
      stop: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    return {
      getTracks: () => [track],
      getVideoTracks: () => [track],
      getAudioTracks: () => [],
      active: true,
    } as unknown as MediaStream;
  }
}

export const defaultCameraService: ICameraService = new BrowserCameraService();
