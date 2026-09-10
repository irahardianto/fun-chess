import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { QrCodeCanvas, LanConfigSection } from '../components';

describe('Lobby Components', () => {
  describe('QrCodeCanvas.vue', () => {
    it('renders image when qrDataUrl is provided and not generating or error', () => {
      const wrapper = mount(QrCodeCanvas, {
        props: {
          qrDataUrl: 'data:image/png;base64,sample',
          isGenerating: false,
          error: null,
        },
      });

      const img = wrapper.find('img.qr-image');
      expect(img.exists()).toBe(true);
      expect(img.attributes('src')).toBe('data:image/png;base64,sample');
    });

    it('renders loading placeholder when isGenerating is true', () => {
      const wrapper = mount(QrCodeCanvas, {
        props: {
          qrDataUrl: 'data:image/png;base64,sample',
          isGenerating: true,
          error: null,
        },
      });

      expect(wrapper.find('img.qr-image').exists()).toBe(false);
      expect(wrapper.find('.qr-loading-placeholder').exists()).toBe(true);
    });

    it('renders error card and emits retry on button click', async () => {
      const wrapper = mount(QrCodeCanvas, {
        props: {
          error: 'Canvas error',
        },
      });

      expect(wrapper.find('.qr-canvas-card--error').exists()).toBe(true);
      expect(wrapper.find('.qr-error-title').text()).toContain('Failed to create QR Code canvas');

      const retryBtn = wrapper.find('.qr-retry-btn');
      expect(retryBtn.exists()).toBe(true);
      await retryBtn.trigger('click');

      expect(wrapper.emitted('retry')).toHaveLength(1);
    });
  });

  describe('LanConfigSection.vue', () => {
    it('renders interface pills and emits select-ip when pill is clicked', async () => {
      const wrapper = mount(LanConfigSection, {
        props: {
          interfaces: ['192.168.1.10', { address: '192.168.1.20' }],
          activeIp: '192.168.1.10',
          customIpInput: '',
        },
      });

      const pills = wrapper.findAll('.pill-btn');
      expect(pills.length).toBe(2);
      expect(pills[0]!.classes()).toContain('is-selected');

      await pills[1]!.trigger('click');
      expect(wrapper.emitted('select-ip')).toEqual([['192.168.1.20']]);
    });

    it('emits update:customIpInput on input change and prefill click', async () => {
      const wrapper = mount(LanConfigSection, {
        props: {
          activeIp: 'localhost',
          customIpInput: '',
          isCloudRelay: false,
        },
      });

      const input = wrapper.find<HTMLInputElement>('[data-testid="qr-custom-ip-input"]');
      await input.setValue('192.168.1.100');
      expect(wrapper.emitted('update:customIpInput')?.[0]).toEqual(['192.168.1.100']);

      const prefillTags = wrapper.findAll('.prefill-tag');
      expect(prefillTags.length).toBe(3);
      await prefillTags[0]!.trigger('click');
      expect(wrapper.emitted('update:customIpInput')).toContainEqual(['192.168.1.']);
    });

    it('emits apply-custom-ip when apply button is clicked', async () => {
      const wrapper = mount(LanConfigSection, {
        props: {
          activeIp: '192.168.1.10',
          customIpInput: '192.168.1.55',
        },
      });

      const applyBtn = wrapper.find('[data-testid="apply-custom-ip-btn"]');
      await applyBtn.trigger('click');
      expect(wrapper.emitted('apply-custom-ip')).toHaveLength(1);
    });

    it('toggles IP help guide visibility', async () => {
      const wrapper = mount(LanConfigSection, {
        props: {
          activeIp: '192.168.1.10',
        },
      });

      expect(wrapper.find('.ip-guide-box').exists()).toBe(false);
      const toggleBtn = wrapper.find('.help-toggle-btn');
      await toggleBtn.trigger('click');
      expect(wrapper.find('.ip-guide-box').exists()).toBe(true);
    });
  });
});
