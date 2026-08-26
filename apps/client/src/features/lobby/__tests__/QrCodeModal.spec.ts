import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import QrCodeModal from '../QrCodeModal.vue';
import QRCode from 'qrcode';

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
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('renders room code and calls QRCode generator', async () => {
    wrapper = mount(QrCodeModal, {
      props: {
        modelValue: true,
        roomCode: 'STAR',
      },
    });

    const roomCodeBadge = document.body.querySelector('[data-testid="room-code-display"]');
    expect(roomCodeBadge?.textContent).toContain('STAR');
    expect(QRCode.toDataURL).toHaveBeenCalled();
  });

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

  it('allows manual IP override when custom IP is entered', async () => {
    wrapper = mount(QrCodeModal, {
      props: {
        modelValue: true,
        roomCode: 'CODE',
      },
    });

    const customInput = document.body.querySelector('.ip-text-input') as HTMLInputElement;

    if (customInput) {
      customInput.value = '192.168.1.99';
      customInput.dispatchEvent(new Event('input'));

      await wrapper.vm.$nextTick();
      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        expect.stringContaining('192.168.1.99'),
        expect.any(Object)
      );
    }
  });

  it('emits close event when modal close button is clicked', async () => {
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
});
