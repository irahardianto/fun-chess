import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import AppPwaManager from '../AppPwaManager.vue';
import AppPwaBanner from '../AppPwaBanner.vue';

const mockPromptInstall = vi.fn();
const mockSnoozePrompt = vi.fn();
const mockUseNetworkStatus = vi.fn();

vi.mock('@/features/pwa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/pwa')>();
  return {
    ...actual,
    useNetworkStatus: () => mockUseNetworkStatus(),
    usePwaInstall: () => ({
      promptInstall: mockPromptInstall,
      snoozePrompt: mockSnoozePrompt,
      canInstall: ref(true),
      isStandalone: ref(false),
      isSnoozed: ref(false),
      showInstallBanner: ref(true),
      isInstallModalOpen: ref(false),
    }),
  };
});

describe('AppPwaManager.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts with default props and initializes network status', () => {
    const wrapper = mount(AppPwaManager);
    expect(mockUseNetworkStatus).toHaveBeenCalled();
    const banner = wrapper.findComponent(AppPwaBanner);
    expect(banner.exists()).toBe(true);
    expect(banner.props('currentAppMode')).toBe('lobby');
    expect(banner.props('isRoomActive')).toBe(false);
  });

  it('passes custom props to child AppPwaBanner', () => {
    const wrapper = mount(AppPwaManager, {
      props: {
        currentAppMode: 'solo_ai',
        isRoomActive: true,
      },
    });
    const banner = wrapper.findComponent(AppPwaBanner);
    expect(banner.props('currentAppMode')).toBe('solo_ai');
    expect(banner.props('isRoomActive')).toBe(true);
  });

  it('forwards install event from banner to promptInstall', async () => {
    const wrapper = mount(AppPwaManager);
    const banner = wrapper.findComponent(AppPwaBanner);
    await banner.vm.$emit('install');
    expect(mockPromptInstall).toHaveBeenCalledTimes(1);
  });

  it('forwards snooze event from banner to snoozePrompt', async () => {
    const wrapper = mount(AppPwaManager);
    const banner = wrapper.findComponent(AppPwaBanner);
    await banner.vm.$emit('snooze');
    expect(mockSnoozePrompt).toHaveBeenCalledTimes(1);
  });
});
