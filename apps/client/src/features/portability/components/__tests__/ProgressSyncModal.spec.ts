import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ProgressSyncModal from '../ProgressSyncModal.vue';
import QrExportView from '../QrExportView.vue';
import QrScannerView from '../QrScannerView.vue';

describe('ProgressSyncModal.vue', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]),
        }),
      },
    });
  });

  it('renders closed when modelValue is false', () => {
    const wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: false,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    expect(wrapper.find('.sync-tab-bar').exists()).toBe(false);
  });

  it('renders tab switcher and export view by default when open', async () => {
    const wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: true,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    expect(wrapper.find('#tab-export').exists()).toBe(true);
    expect(wrapper.find('#tab-import').exists()).toBe(true);
    expect(wrapper.findComponent(QrExportView).exists()).toBe(true);
    expect(wrapper.findComponent(QrScannerView).exists()).toBe(false);
  });

  it('switches between Export and Import tabs on button click', async () => {
    const wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: true,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const importTabBtn = wrapper.find('#tab-import');
    await importTabBtn.trigger('click');

    expect(wrapper.findComponent(QrExportView).exists()).toBe(false);
    expect(wrapper.findComponent(QrScannerView).exists()).toBe(true);

    const exportTabBtn = wrapper.find('#tab-export');
    await exportTabBtn.trigger('click');

    expect(wrapper.findComponent(QrExportView).exists()).toBe(true);
    expect(wrapper.findComponent(QrScannerView).exists()).toBe(false);
  });

  it('switches tabs with keyboard arrows', async () => {
    const wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: true,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const tabBar = wrapper.find('.sync-tab-bar');
    await tabBar.trigger('keydown', { key: 'ArrowRight' });

    expect(wrapper.findComponent(QrScannerView).exists()).toBe(true);
  });
});
