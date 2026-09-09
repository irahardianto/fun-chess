import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppToastManager from '../AppToastManager.vue';
import type { AppNotification } from '../composables/useNotification';

function createProps(notif: AppNotification | null = null, announcement?: string) {
  return {
    notification: notif,
    notifications: notif ? [notif] : [],
    latestAnnouncement: announcement ?? notif?.message ?? '',
    announcement: announcement ?? notif?.message ?? '',
  };
}

describe('AppToastManager.vue', () => {
  it('renders persistent live region with role="status", aria-live="polite", and aria-atomic="true"', () => {
    const wrapper = mount(AppToastManager, {
      props: createProps(null, ''),
    });

    const liveRegion = wrapper.find('[role="status"][aria-live="polite"]');
    expect(liveRegion.exists()).toBe(true);
    expect(liveRegion.attributes('aria-atomic')).toBe('true');
    expect(liveRegion.classes()).toContain('sr-only');
  });

  it('updates live region text content when announcement or notification message changes', async () => {
    const wrapper = mount(AppToastManager, {
      props: createProps(
        { id: 1, type: 'info', message: 'Saved successfully' },
        'Saved successfully'
      ),
    });

    const liveRegion = wrapper.find('[role="status"][aria-live="polite"]');
    expect(liveRegion.text()).toContain('Saved successfully');
  });

  it('does not render notification banner when notification is null', () => {
    const wrapper = mount(AppToastManager, {
      props: createProps(null),
    });

    expect(wrapper.find('[data-testid="app-notification-banner"]').exists()).toBe(false);
  });

  it('renders info notification with is-info class and role="status"', () => {
    const wrapper = mount(AppToastManager, {
      props: createProps({
        id: 42,
        type: 'info',
        message: 'Connecting to room...',
      }),
    });

    const banner = wrapper.find('[data-testid="app-notification-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.classes()).toContain('is-info');
    expect(banner.attributes('role')).toBe('status');
    expect(banner.find('.notification-message').text()).toBe('Connecting to room...');
  });

  it('renders error notification with is-error class and role="alert"', () => {
    const wrapper = mount(AppToastManager, {
      props: createProps({
        id: 43,
        type: 'error',
        message: 'Room not found. Please check code.',
      }),
    });

    const banner = wrapper.find('[data-testid="app-notification-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.classes()).toContain('is-error');
    expect(banner.attributes('role')).toBe('alert');
    expect(banner.find('.notification-message').text()).toBe('Room not found. Please check code.');
  });

  it('renders success notification with is-success class and role="status"', () => {
    const wrapper = mount(AppToastManager, {
      props: createProps({
        id: 44,
        type: 'success',
        message: 'Game progress exported!',
      }),
    });

    const banner = wrapper.find('[data-testid="app-notification-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.classes()).toContain('is-success');
    expect(banner.attributes('role')).toBe('status');
    expect(banner.find('.notification-message').text()).toBe('Game progress exported!');
  });

  it('renders dismiss button with aria-label="Dismiss notification" and emits dismiss event with ID on click', async () => {
    const notificationId = 12345;
    const wrapper = mount(AppToastManager, {
      props: createProps({
        id: notificationId,
        type: 'info',
        message: 'Dismissable notice',
      }),
    });

    const dismissBtn = wrapper.find('.notification-dismiss-btn');
    expect(dismissBtn.exists()).toBe(true);
    expect(dismissBtn.attributes('aria-label')).toBe('Dismiss notification');
    expect(dismissBtn.attributes('type')).toBe('button');

    await dismissBtn.trigger('click');

    expect(wrapper.emitted('dismiss')).toBeTruthy();
    expect(wrapper.emitted('dismiss')?.[0]).toEqual([notificationId]);
  });
});
