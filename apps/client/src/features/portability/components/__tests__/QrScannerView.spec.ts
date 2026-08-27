import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import QrScannerView from '../QrScannerView.vue';

describe('QrScannerView.vue', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]),
        }),
      },
    });
  });

  it('renders camera viewfinder, dropzone and manual drawer toggle', () => {
    const wrapper = mount(QrScannerView);

    expect(wrapper.find('.scanner-viewport-card').exists()).toBe(true);
    expect(wrapper.find('.dropzone-box').exists()).toBe(true);
    expect(wrapper.find('.manual-drawer-toggle').exists()).toBe(true);
  });

  it('toggles manual drawer on click and submits manual code', async () => {
    const wrapper = mount(QrScannerView);

    expect(wrapper.find('.manual-textarea').exists()).toBe(false);

    await wrapper.find('.manual-drawer-toggle').trigger('click');
    expect(wrapper.find('.manual-textarea').exists()).toBe(true);

    const textarea = wrapper.find('.manual-textarea');
    await textarea.setValue('FC1:some_code');

    const loadBtn = wrapper.findAll('button').find((b) => b.text().includes('Load Progress'));
    await loadBtn?.trigger('click');

    expect(wrapper.emitted('code')?.[0]).toEqual(['FC1:some_code']);
  });

  it('emits file event on dropzone file drop', async () => {
    const wrapper = mount(QrScannerView);
    const dropzone = wrapper.find('.dropzone-box');

    const file = new File(['{"magic":"FC_PROGRESS_V1"}'], 'save.json', {
      type: 'application/json',
    });

    await dropzone.trigger('drop', {
      dataTransfer: {
        files: [file],
      },
    });

    expect(wrapper.emitted('file')?.[0]).toEqual([file]);
  });
});
