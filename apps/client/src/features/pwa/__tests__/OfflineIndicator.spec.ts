import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import OfflineIndicator from '../components/OfflineIndicator.vue';
import { useNetworkStatus } from '../composables/useNetworkStatus';

describe('OfflineIndicator.vue', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    const { setOnlineStatus } = useNetworkStatus();
    setOnlineStatus(true);
  });

  afterEach(() => {
    const { setOnlineStatus } = useNetworkStatus();
    setOnlineStatus(true);
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('renders nothing or remains hidden when browser is online', () => {
    // Arrange
    const { setOnlineStatus } = useNetworkStatus();
    setOnlineStatus(true);

    // Act
    wrapper = mount(OfflineIndicator);

    // Assert
    expect(wrapper.find('[data-testid="offline-indicator"]').exists()).toBe(false);
  });

  it('renders floating reassurance pill when network is offline', async () => {
    // Arrange & Act
    wrapper = mount(OfflineIndicator, {
      props: { forceOffline: true },
    });
    await wrapper.vm.$nextTick();

    // Assert
    expect(wrapper.find('[data-testid="offline-indicator"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="offline-expanded-pill"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Playing 100% Offline');
    expect(wrapper.text()).toContain('Puzzles, Academy & AI Bots');
  });

  it('displays aviator peanut pup mascot icon in expanded mode', async () => {
    // Arrange & Act
    wrapper = mount(OfflineIndicator, {
      props: { forceOffline: true },
    });
    await wrapper.vm.$nextTick();

    // Assert
    const avatarBadge = wrapper.find('.offline-avatar-badge');
    expect(avatarBadge.exists()).toBe(true);
    expect(avatarBadge.text()).toMatch(/🐶|✈️/);
  });

  it('collapses into compact chip when dismiss button is clicked', async () => {
    // Arrange
    wrapper = mount(OfflineIndicator, {
      props: { forceOffline: true },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="offline-expanded-pill"]').exists()).toBe(true);

    // Act
    const dismissBtn = wrapper.find('[data-testid="offline-dismiss-btn"]');
    expect(dismissBtn.exists()).toBe(true);
    await dismissBtn.trigger('click');
    await wrapper.vm.$nextTick();

    // Assert
    expect(wrapper.find('[data-testid="offline-expanded-pill"]').exists()).toBe(false);
    const compactChip = wrapper.find('[data-testid="offline-compact-chip"]');
    expect(compactChip.exists()).toBe(true);
    expect(compactChip.text()).toContain('Offline Ready');
  });

  it('expands back to full reassurance pill when compact chip is clicked', async () => {
    // Arrange
    wrapper = mount(OfflineIndicator, {
      props: { forceOffline: true },
    });
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="offline-dismiss-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="offline-compact-chip"]').exists()).toBe(true);

    // Act
    await wrapper.find('[data-testid="offline-compact-chip"]').trigger('click');
    await wrapper.vm.$nextTick();

    // Assert
    expect(wrapper.find('[data-testid="offline-expanded-pill"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="offline-compact-chip"]').exists()).toBe(false);
  });

  it('includes proper accessible ARIA live region attributes', async () => {
    // Arrange & Act
    wrapper = mount(OfflineIndicator, {
      props: { forceOffline: true },
    });
    await wrapper.vm.$nextTick();

    // Assert
    const statusEl = wrapper.find('[role="status"]');
    expect(statusEl.exists()).toBe(true);
    expect(statusEl.attributes('aria-live')).toBe('polite');
  });
});
