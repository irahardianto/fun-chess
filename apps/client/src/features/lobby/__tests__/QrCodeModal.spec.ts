import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import fs from 'fs';
import path from 'path';
import QrCodeModal from '../QrCodeModal.vue';
import QRCode from 'qrcode';
import { logger } from '@/platform/telemetry';

describe('QrCodeModal.vue', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    (vi.spyOn(QRCode, 'toDataURL') as any).mockResolvedValue('data:image/png;base64,mockQrCode');
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. QR Canvas Generation & Rendering
  // ==========================================================================
  describe('1. QR Canvas Generation & Rendering', () => {
    it('renders room code badge and calls QRCode generator with correct parameters', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'STAR',
        },
      });

      await wrapper.vm.$nextTick();
      const roomCodeBadge = document.body.querySelector('[data-testid="room-code-display"]');
      expect(roomCodeBadge?.textContent).toContain('STAR');
      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        expect.stringContaining('STAR'),
        expect.objectContaining({
          width: 220,
          margin: 2,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        })
      );
    });

    it('renders loading placeholder before data URL resolves and displays img once loaded', async () => {
      let resolvePromise: (val: string) => void;
      const pendingPromise = new Promise<string>((resolve) => {
        resolvePromise = resolve;
      });
      (vi.spyOn(QRCode, 'toDataURL') as any).mockReturnValue(pendingPromise);

      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'WAIT',
        },
      });

      // Before resolution: loading placeholder exists, img does not
      const placeholder = document.body.querySelector('.qr-loading-placeholder');
      expect(placeholder).not.toBeNull();
      expect(placeholder?.textContent).toContain('Generating QR Code...');
      expect(document.body.querySelector('.qr-image')).toBeNull();

      // Resolve QR generation
      resolvePromise!('data:image/png;base64,resolvedQr');
      await pendingPromise;
      await wrapper.vm.$nextTick();

      // After resolution: img element is rendered with data URL
      const img = document.body.querySelector('.qr-image') as HTMLImageElement;
      expect(img).not.toBeNull();
      expect(img?.src).toBe('data:image/png;base64,resolvedQr');
      expect(document.body.querySelector('.qr-loading-placeholder')).toBeNull();
    });

    it('displays .qr-canvas-card--error error state with retry button on QRCode.toDataURL rejection without stranding user (ENH-004)', async () => {
      const loggerErrorSpy = vi.spyOn(logger, 'error');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const toDataURLMock = vi.spyOn(QRCode, 'toDataURL') as any;
      toDataURLMock.mockRejectedValueOnce(new Error('Canvas rendering failed'));

      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'ERRQ',
        },
      });

      await wrapper.vm.$nextTick();
      await flushPromises();
      await wrapper.vm.$nextTick();

      const errorWasLogged =
        loggerErrorSpy.mock.calls.some((call) =>
          call.some((arg) => typeof arg === 'string' && arg.includes('Failed to generate QR code'))
        ) ||
        consoleErrorSpy.mock.calls.some((call) =>
          call.some((arg) => typeof arg === 'string' && arg.includes('Failed to generate QR code'))
        );
      expect(errorWasLogged).toBe(true);

      // Verify .qr-canvas-card--error error state card is displayed
      const errorCard = document.body.querySelector('.qr-canvas-card--error');
      expect(errorCard).not.toBeNull();

      // Verify error copy and description
      const errorTitle = document.body.querySelector('.qr-error-title');
      expect(errorTitle?.textContent).toContain('Failed to create QR Code canvas');
      const errorDesc = document.body.querySelector('.qr-error-desc');
      expect(errorDesc?.textContent).toContain("couldn't draw the QR code");

      // Verify retry button exists and is interactive
      const retryBtn = document.body.querySelector('.qr-retry-btn') as HTMLButtonElement;
      expect(retryBtn).not.toBeNull();
      expect(retryBtn.textContent).toContain('Retry QR Code');

      // Verify user is NOT stranded on visible loading placeholder in the main card
      const normalLoadingPlaceholder = document.body.querySelector('.qr-canvas-card:not(.qr-canvas-card--error) .qr-loading-placeholder');
      expect(normalLoadingPlaceholder).toBeNull();

      // Clicking retry retriggers QR generation
      toDataURLMock.mockResolvedValueOnce('data:image/png;base64,retriedSuccessQr');
      retryBtn.click();

      await wrapper.vm.$nextTick();
      await flushPromises();
      await wrapper.vm.$nextTick();

      expect(toDataURLMock).toHaveBeenCalledTimes(2);
      expect(document.body.querySelector('.qr-canvas-card--error')).toBeNull();
      const qrImg = document.body.querySelector('.qr-image') as HTMLImageElement;
      expect(qrImg).not.toBeNull();
      expect(qrImg.src).toBe('data:image/png;base64,retriedSuccessQr');
    });

    it('regenerates QR code when props change (roomCode, joinUrl, isOpen)', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'INIT',
        },
      });

      await wrapper.vm.$nextTick();
      expect(QRCode.toDataURL).toHaveBeenCalledWith(expect.stringContaining('INIT'), expect.any(Object));

      // Update roomCode
      await wrapper.setProps({ roomCode: 'NEXT' });
      await wrapper.vm.$nextTick();
      expect(QRCode.toDataURL).toHaveBeenCalledWith(expect.stringContaining('NEXT'), expect.any(Object));

      // Update joinUrl
      await wrapper.setProps({ joinUrl: 'https://custom.chess.url/?join=CUSTOM' });
      await wrapper.vm.$nextTick();
      expect(QRCode.toDataURL).toHaveBeenCalledWith('https://custom.chess.url/?join=CUSTOM', expect.any(Object));
    });

    it('does not generate QR code when modal is closed', () => {
      (QRCode.toDataURL as any).mockClear();
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: false,
          isOpen: false,
          roomCode: 'CLSD',
        },
      });

      expect(QRCode.toDataURL).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. Room Code & URL Copy Action and Feedback
  // ==========================================================================
  describe('2. Room Code & URL Copy Action and Feedback', () => {
    it('copies invite URL to clipboard and provides feedback', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'LION',
          joinUrl: 'http://192.168.1.50:3000/?join=LION',
        },
      });

      const copyBtn = document.body.querySelector('[data-testid="copy-link-btn"]') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();
      copyBtn.click();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'http://192.168.1.50:3000/?join=LION'
      );
    });

    it('resets copy feedback button text after 2000ms timeout', async () => {
      vi.useFakeTimers();

      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'TIME',
        },
      });

      const copyBtn = document.body.querySelector('[data-testid="copy-link-btn"]') as HTMLButtonElement;
      expect(copyBtn.textContent).toContain('Copy Invite Link');

      copyBtn.click();
      await vi.advanceTimersByTimeAsync(0);
      expect(copyBtn.textContent).toContain('Copied! ✅');

      // Fast-forward 1999ms: still copied
      await vi.advanceTimersByTimeAsync(1999);
      expect(copyBtn.textContent).toContain('Copied! ✅');

      // Advance past 2000ms: resets to default label
      await vi.advanceTimersByTimeAsync(50);
      expect(copyBtn.textContent).toContain('Copy Invite Link');
    });

    it('clears and refreshes copy timeout on rapid successive clicks', async () => {
      vi.useFakeTimers();

      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'RAPD',
        },
      });

      const copyBtn = document.body.querySelector('[data-testid="copy-link-btn"]') as HTMLButtonElement;
      copyBtn.click();
      await vi.advanceTimersByTimeAsync(0);
      expect(copyBtn.textContent).toContain('Copied! ✅');

      // Click again after 1500ms (before first timer expires)
      await vi.advanceTimersByTimeAsync(1500);
      copyBtn.click();
      await vi.advanceTimersByTimeAsync(0);

      // At 2500ms from start (1000ms after second click), should still show 'Copied! ✅'
      await vi.advanceTimersByTimeAsync(1000);
      expect(copyBtn.textContent).toContain('Copied! ✅');

      // Advance past the second 2000ms timeout
      await vi.advanceTimersByTimeAsync(1100);
      expect(copyBtn.textContent).toContain('Copy Invite Link');
    });

    it('falls back to document.execCommand when navigator.clipboard is unavailable', async () => {
      const execCommandFn = vi.fn().mockReturnValue(true);
      document.execCommand = execCommandFn;
      Object.assign(navigator, {
        clipboard: undefined,
      });

      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'FALL',
          joinUrl: 'http://192.168.1.77:3000/?join=FALL',
        },
      });

      const copyBtn = document.body.querySelector('[data-testid="copy-link-btn"]') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();
      copyBtn.click();
      await wrapper.vm.$nextTick();

      expect(execCommandFn).toHaveBeenCalledWith('copy');
      expect(copyBtn.textContent).toContain('Copied!');
    });

    it('falls back to document.execCommand when navigator.clipboard.writeText rejects', async () => {
      const execCommandFn = vi.fn().mockReturnValue(true);
      document.execCommand = execCommandFn;
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Permission denied on insecure HTTP origin')),
        },
      });

      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'REJC',
          joinUrl: 'http://192.168.1.88:3000/?join=REJC',
        },
      });

      const copyBtn = document.body.querySelector('[data-testid="copy-link-btn"]') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();
      copyBtn.click();

      await vi.waitFor(() => {
        expect(execCommandFn).toHaveBeenCalledWith('copy');
        expect(copyBtn.textContent).toContain('Copied!');
      });
    });

    it('displays copy error notice when both clipboard and document.execCommand fail (MAJ-028)', async () => {
      const execCommandFn = vi.fn().mockReturnValue(false);
      document.execCommand = execCommandFn;
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
        },
      });

      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'ERRC',
          joinUrl: 'http://192.168.1.99:3000/?join=ERRC',
        },
      });

      const copyBtn = document.body.querySelector('[data-testid="copy-link-btn"]') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();
      copyBtn.click();

      await vi.waitFor(() => {
        const errorNotice = document.body.querySelector('[data-testid="copy-error-notice"]');
        expect(errorNotice).not.toBeNull();
        expect(errorNotice?.textContent).toContain('Could not copy automatically');
      });
    });

    it('clears copy error notice after 5000ms timeout', async () => {
      vi.useFakeTimers();

      const execCommandFn = vi.fn().mockReturnValue(false);
      document.execCommand = execCommandFn;
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Failed')),
        },
      });

      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'TOUT',
        },
      });

      const copyBtn = document.body.querySelector('[data-testid="copy-link-btn"]') as HTMLButtonElement;
      copyBtn.click();
      await vi.advanceTimersByTimeAsync(0);

      expect(document.body.querySelector('[data-testid="copy-error-notice"]')).not.toBeNull();

      // Advance 4999ms: still visible
      await vi.advanceTimersByTimeAsync(4999);
      expect(document.body.querySelector('[data-testid="copy-error-notice"]')).not.toBeNull();

      // Advance past 5000ms: dismissed
      await vi.advanceTimersByTimeAsync(50);
      expect(document.body.querySelector('[data-testid="copy-error-notice"]')).toBeNull();
    });

    it('handles document.execCommand exception without crashing and triggers error notice', async () => {
      document.execCommand = vi.fn().mockImplementation(() => {
        throw new Error('execCommand disabled in sandbox');
      });
      Object.assign(navigator, { clipboard: undefined });

      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'EXCP',
        },
      });

      const copyBtn = document.body.querySelector('[data-testid="copy-link-btn"]') as HTMLButtonElement;
      copyBtn.click();
      await wrapper.vm.$nextTick();

      const errorNotice = document.body.querySelector('[data-testid="copy-error-notice"]');
      expect(errorNotice).not.toBeNull();
    });
  });

  // ==========================================================================
  // 3. LAN Discovery & Error Fallback
  // ==========================================================================
  describe('3. LAN Discovery & Error Fallback', () => {
    it('uses LAN IP from lanInfo when available on localhost', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'PLAY',
          lanInfo: {
            lanIp: '192.168.1.120',
            port: 3000,
            localUrl: 'http://localhost:3000',
            joinUrl: 'http://192.168.1.120:3000',
            interfaces: ['192.168.1.120'],
          },
        },
      });

      await wrapper.vm.$nextTick();
      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        expect.stringContaining('192.168.1.120'),
        expect.any(Object)
      );
    });

    it('renders localhost warning and prefill subnet helpers when on localhost without LAN IP', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'WARN',
          lanInfo: null,
        },
      });

      await wrapper.vm.$nextTick();
      const warningHeader = document.body.querySelector('.lan-status-header');
      expect(warningHeader?.textContent).toContain('Localhost Detected');
      expect(warningHeader?.textContent).toContain('Phones cannot connect to localhost');

      const prefillTags = document.body.querySelectorAll('.prefill-tag');
      expect(prefillTags.length).toBe(3);
      expect(prefillTags[0]?.textContent).toContain('192.168.1._');
      expect(prefillTags[1]?.textContent).toContain('192.168.0._');
      expect(prefillTags[2]?.textContent).toContain('10.0.0._');
    });

    it('populates custom IP input when quick prefill button is clicked', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'PREF',
          lanInfo: null,
        },
      });

      await wrapper.vm.$nextTick();
      const prefillTags = document.body.querySelectorAll('.prefill-tag');
      (prefillTags[0] as HTMLButtonElement).click();
      await wrapper.vm.$nextTick();

      const customInput = document.body.querySelector('.ip-text-input') as HTMLInputElement;
      expect(customInput.value).toBe('192.168.1.');

      // Click second prefill tag
      (prefillTags[1] as HTMLButtonElement).click();
      await wrapper.vm.$nextTick();
      expect(customInput.value).toBe('192.168.0.');

      // Click third prefill tag
      (prefillTags[2] as HTMLButtonElement).click();
      await wrapper.vm.$nextTick();
      expect(customInput.value).toBe('10.0.0.');
    });

    it('renders discovered interface pills and selects interface on click', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'IFACE',
          lanInfo: {
            lanIp: '192.168.1.100',
            port: 3000,
            localUrl: 'http://localhost:3000',
            joinUrl: 'http://192.168.1.100:3000',
            interfaces: ['192.168.1.100', '10.0.4.15'],
          },
        },
      });

      await wrapper.vm.$nextTick();
      const pills = document.body.querySelectorAll('.pill-btn');
      expect(pills.length).toBeGreaterThanOrEqual(2);

      // Click second interface pill
      const targetPill = Array.from(pills).find((p) => p.textContent?.includes('10.0.4.15')) as HTMLButtonElement;
      expect(targetPill).not.toBeNull();
      targetPill.click();
      await wrapper.vm.$nextTick();

      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        expect.stringContaining('10.0.4.15'),
        expect.any(Object)
      );
      const customInput = document.body.querySelector('.ip-text-input') as HTMLInputElement;
      expect(customInput.value).toBe('10.0.4.15');
    });

    it('allows manual IP override when custom IP is entered via input and apply button', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'CODE',
        },
      });

      const customInput = document.body.querySelector('.ip-text-input') as HTMLInputElement;
      expect(customInput).not.toBeNull();

      customInput.value = '192.168.1.99';
      customInput.dispatchEvent(new Event('input'));
      await wrapper.vm.$nextTick();

      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        expect.stringContaining('192.168.1.99'),
        expect.any(Object)
      );
    });

    it('applies custom IP on enter key press', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'ENTR',
        },
      });

      const customInput = document.body.querySelector('.ip-text-input') as HTMLInputElement;
      customInput.value = '192.168.1.188';
      customInput.dispatchEvent(new Event('input'));
      customInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
      await wrapper.vm.$nextTick();

      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        expect.stringContaining('192.168.1.188'),
        expect.any(Object)
      );
    });

    it('displays inline accessible error when invalid IP is submitted and clears on valid IP', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'STAR',
        },
      });

      const customInput = document.body.querySelector('.ip-text-input') as HTMLInputElement;
      const applyBtn = document.body.querySelector('[data-testid="apply-custom-ip-btn"]') as HTMLButtonElement;

      // Enter invalid IP
      customInput.value = '999.999.999';
      customInput.dispatchEvent(new Event('input'));
      await wrapper.vm.$nextTick();

      applyBtn.click();
      await wrapper.vm.$nextTick();

      const errorEl = document.body.querySelector('[data-testid="qr-ip-error"]');
      expect(errorEl).not.toBeNull();
      expect(errorEl?.textContent).toContain('Enter a valid IPv4 address');
      expect(customInput.getAttribute('aria-invalid')).toBe('true');

      // Enter valid IP
      customInput.value = '192.168.1.55';
      customInput.dispatchEvent(new Event('input'));
      await wrapper.vm.$nextTick();

      const clearedErrorEl = document.body.querySelector('[data-testid="qr-ip-error"]');
      expect(clearedErrorEl).toBeNull();
      expect(customInput.getAttribute('aria-invalid')).toBe('false');
    });

    it('displays error notice when empty IP is applied', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'EMPT',
        },
      });

      const customInput = document.body.querySelector('.ip-text-input') as HTMLInputElement;
      const applyBtn = document.body.querySelector('[data-testid="apply-custom-ip-btn"]') as HTMLButtonElement;

      customInput.value = '';
      customInput.dispatchEvent(new Event('input'));
      await wrapper.vm.$nextTick();

      applyBtn.click();
      await wrapper.vm.$nextTick();

      const errorEl = document.body.querySelector('[data-testid="qr-ip-error"]');
      expect(errorEl?.textContent).toContain('Enter an IP address.');
    });

    it('toggles IP help guide visibility on button click', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'HELP',
        },
      });

      const helpBtn = document.body.querySelector('.help-toggle-btn') as HTMLButtonElement;
      expect(helpBtn).not.toBeNull();
      expect(helpBtn.textContent).toContain('❓ How to find your computer IP');
      expect(document.body.querySelector('.ip-guide-box')).toBeNull();

      // Click to expand
      helpBtn.click();
      await wrapper.vm.$nextTick();

      expect(helpBtn.textContent).toContain('▲ Hide IP help');
      const guideBox = document.body.querySelector('.ip-guide-box');
      expect(guideBox).not.toBeNull();
      expect(guideBox?.textContent).toContain('Windows:');
      expect(guideBox?.textContent).toContain('Mac:');
      expect(guideBox?.textContent).toContain('Linux:');

      // Click to collapse
      helpBtn.click();
      await wrapper.vm.$nextTick();
      expect(document.body.querySelector('.ip-guide-box')).toBeNull();
      expect(helpBtn.textContent).toContain('❓ How to find your computer IP');
    });
  });

  // ==========================================================================
  // 4. Cloud Relay Mode & URL Formatting
  // ==========================================================================
  describe('4. Cloud Relay Mode & URL Formatting', () => {
    it('renders Cloud Server Online info and subtitle when isCloudRelay is true', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'HERO',
          lanInfo: {
            lanIp: '127.0.0.1',
            port: 3000,
            localUrl: 'https://chess.cloud.app',
            joinUrl: 'https://chess.cloud.app/?join=HERO',
            interfaces: [],
            isCloudRelay: true,
            relayMode: 'cloud',
          },
        },
      });

      await wrapper.vm.$nextTick();

      const cloudStatus = document.body.querySelector('[data-testid="qr-cloud-status"]');
      expect(cloudStatus).not.toBeNull();
      expect(cloudStatus?.textContent).toContain('Cloud Server Online');

      const subtitle = document.body.querySelector('.qr-subtitle');
      expect(subtitle?.textContent).toContain('Share via Cloud Link / QR Code');
    });

    it('generates cloud join URL without port :3000 when publicUrl is provided', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: '457M',
          lanInfo: {
            lanIp: 'fun-chess-753683872274.asia-southeast1.run.app',
            port: 3000,
            localUrl: 'http://localhost:3000',
            joinUrl: 'https://fun-chess-753683872274.asia-southeast1.run.app',
            interfaces: ['169.254.8.1'],
            isCloudRelay: true,
            relayMode: 'cloud',
            publicUrl: 'https://fun-chess-753683872274.asia-southeast1.run.app',
          },
        },
      });

      await wrapper.vm.$nextTick();

      const preview = document.body.querySelector('.url-preview');
      expect(preview?.textContent).toBe('https://fun-chess-753683872274.asia-southeast1.run.app/?join=457M');
      expect(preview?.textContent).not.toContain(':3000');

      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        'https://fun-chess-753683872274.asia-southeast1.run.app/?join=457M',
        expect.any(Object)
      );
    });

    it('omits port in effectivePort when port is 80 or 443', async () => {
      const originalLocation = window.location;
      try {
        Object.defineProperty(window, 'location', {
          value: new URL('http://192.168.1.50:80/'),
          configurable: true,
          writable: true,
        });

        wrapper = mount(QrCodeModal, {
          props: {
            modelValue: true,
            roomCode: 'P80X',
            lanInfo: {
              lanIp: '192.168.1.50',
              port: 80,
              localUrl: 'http://localhost',
              joinUrl: 'http://192.168.1.50',
              interfaces: [],
            },
          },
        });

        await wrapper.vm.$nextTick();
        const preview = document.body.querySelector('.url-preview');
        expect(preview?.textContent).toBe('http://192.168.1.50/?join=P80X');
        expect(preview?.textContent).not.toContain(':80');
      } finally {
        Object.defineProperty(window, 'location', {
          value: originalLocation,
          configurable: true,
          writable: true,
        });
      }
    });

    it('renders cloud vs lan multiplayer footer accurately', async () => {
      // 1. LAN footer
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'FOOT',
          lanInfo: {
            lanIp: '192.168.1.42',
            port: 3000,
            localUrl: 'http://localhost:3000',
            joinUrl: 'http://192.168.1.42:3000',
            interfaces: [],
          },
        },
      });

      await wrapper.vm.$nextTick();
      const lanFooter = document.body.querySelector('.network-info-footer');
      expect(lanFooter?.textContent).toContain('📡 Wi-Fi Multiplayer');
      expect(lanFooter?.textContent).toContain('192.168.1.42:3000');

      // 2. Cloud footer
      await wrapper.setProps({
        lanInfo: {
          lanIp: '127.0.0.1',
          port: 3000,
          localUrl: 'https://cloud.chess.com',
          joinUrl: 'https://cloud.chess.com',
          interfaces: [],
          isCloudRelay: true,
        },
      });
      await wrapper.vm.$nextTick();
      const cloudFooter = document.body.querySelector('.network-info-footer');
      expect(cloudFooter?.textContent).toContain('☁️ Cloud Multiplayer • Online Relay Active');
    });
  });

  // ==========================================================================
  // 5. Modal Lifecycle, Close Button & Backdrop Click
  // ==========================================================================
  describe('5. Modal Lifecycle, Close Button & Backdrop Click', () => {
    it('emits close and update:modelValue when modal close button is clicked', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'STAR',
        },
      });

      const closeBtn = document.body.querySelector('.base-modal-close-btn') as HTMLButtonElement;
      expect(closeBtn).not.toBeNull();
      closeBtn.click();

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
      expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('emits close and update:modelValue when modal backdrop is clicked', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'BKDR',
        },
      });

      const backdrop = document.body.querySelector('.base-modal-backdrop') as HTMLElement;
      expect(backdrop).not.toBeNull();
      backdrop.click();

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
      expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('does not close modal when clicking inside modal container', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'KEEP',
        },
      });

      const container = document.body.querySelector('.base-modal-container') as HTMLElement;
      expect(container).not.toBeNull();
      container.click();

      expect(wrapper.emitted('close')).toBeUndefined();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('opens and renders correctly when isOpen prop is used instead of modelValue', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          isOpen: true,
          roomCode: 'ISOP',
        },
      });

      await wrapper.vm.$nextTick();
      const container = document.body.querySelector('.base-modal-container');
      expect(container).not.toBeNull();
      expect(QRCode.toDataURL).toHaveBeenCalledWith(expect.stringContaining('ISOP'), expect.any(Object));
    });
  });

  describe('Responsive Design for Narrow Screens (UX-WARN-04)', () => {
    it('defines responsive styles with flex-wrap: wrap on .ip-input-row for viewports <= 480px', () => {
      const sfcPath = path.resolve(__dirname, '../QrCodeModal.vue');
      const content = fs.readFileSync(sfcPath, 'utf-8');

      expect(content).toContain('@media (max-width: 480px)');
      expect(content).toMatch(/@media\s*\(max-width:\s*480px\)\s*\{[^}]*\.ip-input-row\s*\{[^}]*flex-wrap:\s*wrap;/s);
      expect(content).toMatch(/\.ip-input-row\s+\.ip-text-input\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*100%;/s);
      expect(content).toMatch(/\.ip-input-row\s+:deep\(button\),\s*\.ip-input-row\s+button\s*\{[^}]*width:\s*100%;[^}]*justify-content:\s*center;/s);
    });

    it('renders .ip-input-row and apply button within modal', async () => {
      wrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'RESP',
        },
      });

      await wrapper.vm.$nextTick();
      const ipRow = document.body.querySelector('.ip-input-row');
      expect(ipRow).not.toBeNull();
      const applyBtn = ipRow?.querySelector('button');
      expect(applyBtn).not.toBeNull();
      expect(applyBtn?.textContent).toContain('Apply IP');
    });
  });
});
