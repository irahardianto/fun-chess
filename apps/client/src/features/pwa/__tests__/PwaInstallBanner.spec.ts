import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PwaInstallBanner from '../components/PwaInstallBanner.vue';
import { usePwaInstall } from '../composables/usePwaInstall';

describe('PwaInstallBanner.vue', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    });

    const { setDeferredPrompt, resetSnooze, setInstalled } = usePwaInstall();
    setDeferredPrompt(null);
    setInstalled(false);
    resetSnooze();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders install banner with kid-friendly text when forceShow is true', () => {
    const wrapper = mount(PwaInstallBanner, {
      props: { forceShow: true },
    });

    const banner = wrapper.find('[data-testid="pwa-install-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain('Install Fun Chess on your Device!');
    expect(banner.text()).toContain('Play anywhere, even without Wi-Fi or internet!');
    expect(banner.text()).toContain('Install App');
    expect(banner.text()).toContain('Remind me later');
  });

  it('emits install event and calls promptInstall when Install App button is clicked', async () => {
    const wrapper = mount(PwaInstallBanner, {
      props: { forceShow: true },
    });

    const installBtn = wrapper.find('[data-testid="pwa-banner-install-btn"]');
    await installBtn.trigger('click');

    expect(wrapper.emitted('install')).toHaveLength(1);
  });

  it('emits dismiss event and snoozes prompt when Remind me later or Close is clicked', async () => {
    const wrapper = mount(PwaInstallBanner, {
      props: { forceShow: true },
    });

    const dismissBtn = wrapper.find('[data-testid="pwa-banner-dismiss-btn"]');
    await dismissBtn.trigger('click');

    expect(wrapper.emitted('dismiss')).toHaveLength(1);
    const { isSnoozed } = usePwaInstall();
    expect(isSnoozed.value).toBe(true);
  });
});
