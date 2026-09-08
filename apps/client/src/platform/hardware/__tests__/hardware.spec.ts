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
} from '../index';

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

      const downloader = new BrowserFileDownloader();
      downloader.download('{"hello":"world"}', 'test.json', 'application/json');

      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(mockAnchor.download).toBe('test.json');
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockAnchor.parentNode?.removeChild).toHaveBeenCalledWith(mockAnchor);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
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

      const downloader = new BrowserFileDownloader();
      const blob = new Blob(['binary'], { type: 'text/plain' });
      downloader.download(blob, 'file.txt');

      expect(mockAnchor.download).toBe('file.txt');
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-blob');
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
});
