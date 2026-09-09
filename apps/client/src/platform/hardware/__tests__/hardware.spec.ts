import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BrowserFileDownloader,
  MockFileDownloader,
  defaultFileDownloader,
  BrowserHapticsService,
  MockHapticsService,
  defaultHapticsService,
  BrowserWebRtcDiscovery,
  MockWebRtcDiscovery,
  defaultWebRtcDiscovery,
  BrowserClipboardService,
  MockClipboardService,
  defaultClipboardService,
  BrowserCameraService,
  MockCameraService,
  defaultCameraService,
} from '../index';
import type { ILogger } from '@/platform/telemetry';

describe('Hardware Platform Abstractions (MAJ-012)', () => {
  describe('File Downloader', () => {
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;

    beforeEach(() => {
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    });

    it('BrowserFileDownloader creates anchor, triggers click, and cleans up', () => {
      const mockAnchor = {
        href: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
        parentNode: {
          removeChild: vi.fn(),
        },
      } as unknown as HTMLAnchorElement;

      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor);
      URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      URL.revokeObjectURL = vi.fn();
      vi.useFakeTimers();

      const downloader = new BrowserFileDownloader();
      downloader.download('{"hello":"world"}', 'test.json', 'application/json');

      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(mockAnchor.download).toBe('test.json');
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockAnchor.parentNode?.removeChild).toHaveBeenCalledWith(mockAnchor);
      vi.advanceTimersByTime(1000);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
      vi.useRealTimers();
    });

    it('BrowserFileDownloader handles Blob content directly', () => {
      const mockAnchor = {
        href: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
        parentNode: {
          removeChild: vi.fn(),
        },
      } as unknown as HTMLAnchorElement;

      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor);
      URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-blob');
      URL.revokeObjectURL = vi.fn();
      vi.useFakeTimers();

      const downloader = new BrowserFileDownloader();
      const blob = new Blob(['binary'], { type: 'text/plain' });
      downloader.download(blob, 'file.txt');

      expect(mockAnchor.download).toBe('file.txt');
      expect(mockAnchor.click).toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-blob');
      vi.useRealTimers();
    });

    it('tracks downloads and supports clear in MockFileDownloader', () => {
      const mock = new MockFileDownloader();
      expect(mock.calls).toHaveLength(0);

      mock.download('content 1', 'file1.json', 'application/json');
      mock.download('content 2', 'file2.txt');

      expect(mock.calls).toHaveLength(2);
      expect(mock.calls[0]).toEqual({
        content: 'content 1',
        filename: 'file1.json',
        mimeType: 'application/json',
      });
      expect(mock.calls[1]).toEqual({
        content: 'content 2',
        filename: 'file2.txt',
        mimeType: undefined,
      });

      mock.clear();
      expect(mock.calls).toHaveLength(0);
    });

    it('exports defaultFileDownloader singleton', () => {
      expect(defaultFileDownloader).toBeInstanceOf(BrowserFileDownloader);
    });
  });

  describe('Haptics Service', () => {
    it('BrowserHapticsService queries support and triggers vibrate', () => {
      const mockVibrate = vi.fn().mockReturnValue(true);
      vi.stubGlobal('navigator', {
        vibrate: mockVibrate,
      });

      const service = new BrowserHapticsService();
      expect(service.isSupported()).toBe(true);

      const result = service.vibrate([100, 50, 100]);
      expect(result).toBe(true);
      expect(mockVibrate).toHaveBeenCalledWith([100, 50, 100]);

      vi.unstubAllGlobals();
    });

    it('BrowserHapticsService safely returns false when unsupported or throws', () => {
      vi.stubGlobal('navigator', {});

      const service = new BrowserHapticsService();
      expect(service.isSupported()).toBe(false);
      expect(service.vibrate(200)).toBe(false);

      vi.stubGlobal('navigator', {
        vibrate: () => {
          throw new Error('NotAllowedError');
        },
      });
      expect(service.isSupported()).toBe(true);
      expect(service.vibrate(200)).toBe(false);

      vi.unstubAllGlobals();
    });

    it('MockHapticsService records vibration calls and respects configured support', () => {
      const mock = new MockHapticsService(true);
      expect(mock.isSupported()).toBe(true);

      expect(mock.vibrate(50)).toBe(true);
      expect(mock.vibrate([100, 100])).toBe(true);
      expect(mock.calls).toEqual([50, [100, 100]]);

      mock.clear();
      expect(mock.calls).toHaveLength(0);

      mock.supported = false;
      expect(mock.isSupported()).toBe(false);
      expect(mock.vibrate(50)).toBe(false);
      expect(mock.calls).toHaveLength(0);
    });

    it('exports defaultHapticsService singleton', () => {
      expect(defaultHapticsService).toBeInstanceOf(BrowserHapticsService);
    });
  });

  describe('WebRTC Discovery', () => {
    it('BrowserWebRtcDiscovery extracts IPv4 address from ICE candidate', async () => {
      class MockRTCPeerConnection {
        onicecandidate: ((event: { candidate?: { candidate: string } }) => void) | null = null;
        createDataChannel = vi.fn();
        createOffer = vi.fn().mockResolvedValue({});
        setLocalDescription = vi.fn().mockImplementation(() => {
          setTimeout(() => {
            if (this.onicecandidate) {
              this.onicecandidate({
                candidate: {
                  candidate: 'candidate:1 1 UDP 2122252543 192.168.1.145 54321 typ host',
                },
              });
            }
          }, 5);
          return Promise.resolve();
        });
        close = vi.fn();
      }

      vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection);

      const discovery = new BrowserWebRtcDiscovery();
      const ip = await discovery.discoverLocalIp(500);

      expect(ip).toBe('192.168.1.145');

      vi.unstubAllGlobals();
    });

    it('BrowserWebRtcDiscovery times out safely when no candidate arrives', async () => {
      class MockRTCPeerConnectionTimeout {
        onicecandidate: null = null;
        createDataChannel = vi.fn();
        createOffer = vi.fn().mockResolvedValue({});
        setLocalDescription = vi.fn().mockResolvedValue(undefined);
        close = vi.fn();
      }

      vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnectionTimeout);

      const discovery = new BrowserWebRtcDiscovery();
      const ip = await discovery.discoverLocalIp(20);

      expect(ip).toBeNull();

      vi.unstubAllGlobals();
    });

    it('BrowserWebRtcDiscovery logs debug with operation webrtc_discover_ip on errors [MAJ-010]', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
        getLevel: vi.fn(),
        setLevel: vi.fn(),
      };

      class FailingRTCPeerConnection {
        createDataChannel = vi.fn();
        createOffer = vi.fn().mockRejectedValue(new Error('SDP negotiation failed'));
        setLocalDescription = vi.fn();
        close = vi.fn().mockImplementation(() => {
          throw new Error('Close failed');
        });
      }

      vi.stubGlobal('RTCPeerConnection', FailingRTCPeerConnection);

      const discovery = new BrowserWebRtcDiscovery(mockLogger as unknown as ILogger);
      const ip = await discovery.discoverLocalIp(100);

      expect(ip).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'WebRTC offer creation or local description failed',
        expect.objectContaining({
          operation: 'webrtc_discover_ip',
          error: expect.any(String),
        })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Failed to close RTCPeerConnection cleanly',
        expect.objectContaining({
          operation: 'webrtc_discover_ip',
          error: expect.any(String),
        })
      );

      vi.unstubAllGlobals();
    });

    it('MockWebRtcDiscovery returns configured IP', async () => {
      const mock = new MockWebRtcDiscovery('10.0.0.42');
      expect(await mock.discoverLocalIp()).toBe('10.0.0.42');

      mock.ip = null;
      expect(await mock.discoverLocalIp()).toBeNull();
    });

    it('exports defaultWebRtcDiscovery singleton', () => {
      expect(defaultWebRtcDiscovery).toBeInstanceOf(BrowserWebRtcDiscovery);
    });
  });

  describe('Clipboard Service (MAJ-015)', () => {
    it('BrowserClipboardService uses navigator.clipboard when available', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      const readTextMock = vi.fn().mockResolvedValue('clipboard content');

      vi.stubGlobal('navigator', {
        clipboard: {
          writeText: writeTextMock,
          readText: readTextMock,
        },
      });

      const service = new BrowserClipboardService();
      expect(service.isSupported()).toBe(true);

      const copySuccess = await service.copyText('hello world');
      expect(copySuccess).toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith('hello world');

      const text = await service.readText();
      expect(text).toBe('clipboard content');
      expect(readTextMock).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('BrowserClipboardService falls back to document.execCommand when navigator.clipboard fails', async () => {
      vi.stubGlobal('navigator', {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
        },
      });

      const execCommandMock = vi.fn().mockReturnValue(true);
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      const removeChildSpy = vi.spyOn(document.body, 'removeChild');
      document.execCommand = execCommandMock;

      const service = new BrowserClipboardService();
      const success = await service.copyText('fallback text');

      expect(success).toBe(true);
      expect(execCommandMock).toHaveBeenCalledWith('copy');
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();

      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it('BrowserClipboardService returns false when both modern and legacy clipboard fail', async () => {
      vi.stubGlobal('navigator', {});
      document.execCommand = vi.fn().mockImplementation(() => {
        throw new Error('Not allowed');
      });

      const service = new BrowserClipboardService();
      const success = await service.copyText('fail');
      expect(success).toBe(false);

      vi.unstubAllGlobals();
    });

    it('BrowserClipboardService readText returns empty string when unsupported', async () => {
      vi.stubGlobal('navigator', {});

      const service = new BrowserClipboardService();
      expect(await service.readText()).toBe('');

      vi.unstubAllGlobals();
    });

    it('MockClipboardService stores text and tracks history', async () => {
      const mock = new MockClipboardService('initial');
      expect(mock.isSupported()).toBe(true);
      expect(await mock.readText()).toBe('initial');

      expect(await mock.copyText('first copy')).toBe(true);
      expect(await mock.copyText('second copy')).toBe(true);
      expect(mock.history).toEqual(['first copy', 'second copy']);
      expect(await mock.readText()).toBe('second copy');

      mock.clear();
      expect(mock.history).toHaveLength(0);
      expect(await mock.readText()).toBe('');

      mock.supported = false;
      expect(mock.isSupported()).toBe(false);
      expect(await mock.copyText('unsupported')).toBe(false);
      expect(await mock.readText()).toBe('');
    });

    it('exports defaultClipboardService singleton', () => {
      expect(defaultClipboardService).toBeInstanceOf(BrowserClipboardService);
    });
  });

  describe('Camera Service (MAJ-015)', () => {
    it('BrowserCameraService queries support and delegates getUserMedia', async () => {
      const mockStream = { active: true, getTracks: () => [] } as unknown as MediaStream;
      const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: getUserMediaMock,
        },
      });

      const service = new BrowserCameraService();
      expect(service.isSupported()).toBe(true);

      const stream = await service.getUserMedia({ video: true });
      expect(stream).toBe(mockStream);
      expect(getUserMediaMock).toHaveBeenCalledWith({ video: true });

      vi.unstubAllGlobals();
    });

    it('BrowserCameraService throws error when mediaDevices is unsupported', async () => {
      vi.stubGlobal('navigator', {});

      const service = new BrowserCameraService();
      expect(service.isSupported()).toBe(false);
      await expect(service.getUserMedia({ video: true })).rejects.toThrow(
        'Camera/MediaDevices API is not supported in this environment'
      );

      vi.unstubAllGlobals();
    });

    it('MockCameraService returns configured stream and records constraints', async () => {
      const customStream = { id: 'custom-stream' } as unknown as MediaStream;
      const mock = new MockCameraService(true, customStream);

      expect(mock.isSupported()).toBe(true);
      const stream = await mock.getUserMedia({ video: { facingMode: 'environment' } });
      expect(stream).toBe(customStream);
      expect(mock.lastConstraints).toEqual({ video: { facingMode: 'environment' } });

      // Default mock stream generation
      const mockDefault = new MockCameraService(true);
      const genStream = await mockDefault.getUserMedia({ video: true });
      expect(genStream).toBeDefined();
      expect(genStream.getVideoTracks()).toHaveLength(1);

      // Unsupported mock throws NotAllowedError
      mockDefault.supported = false;
      await expect(mockDefault.getUserMedia({ video: true })).rejects.toThrow('Permission denied');
    });

    it('exports defaultCameraService singleton', () => {
      expect(defaultCameraService).toBeInstanceOf(BrowserCameraService);
    });
  });
});
