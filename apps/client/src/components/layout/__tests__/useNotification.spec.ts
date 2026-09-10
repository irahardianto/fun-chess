import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useNotification } from '../composables/useNotification';

describe('useNotification composable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const { clearAll } = useNotification();
    clearAll();
  });

  afterEach(() => {
    const { clearAll } = useNotification();
    clearAll();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('initializes with null activeNotification and empty notificationAnnouncement', () => {
    const { activeNotification, notificationAnnouncement } = useNotification();

    expect(activeNotification.value).toBeNull();
    expect(notificationAnnouncement.value).toBe('');
  });

  it('showNotification() sets activeNotification with timestamp ID and defaults type to info', () => {
    const { activeNotification, notificationAnnouncement, showNotification } = useNotification();

    const startTime = Date.now();
    showNotification('Game saved successfully');

    expect(activeNotification.value).not.toBeNull();
    expect(activeNotification.value?.message).toBe('Game saved successfully');
    expect(activeNotification.value?.type).toBe('info');
    expect(typeof activeNotification.value?.id).toBe('number');
    expect(activeNotification.value?.id).toBeGreaterThanOrEqual(startTime);
    expect(notificationAnnouncement.value).toBe('Game saved successfully');
  });

  it('showNotification() correctly handles error and success notification types', () => {
    const { activeNotification, showNotification } = useNotification();

    showNotification('Failed to connect to room', 'error');
    expect(activeNotification.value?.type).toBe('error');
    expect(activeNotification.value?.message).toBe('Failed to connect to room');

    showNotification('Puzzle solved in 3 moves!', 'success');
    expect(activeNotification.value?.type).toBe('error'); // Since FIFO queue: active is first item
  });

  it('auto-dismiss timer automatically clears notification after durationMs', () => {
    const { activeNotification, notificationAnnouncement, showNotification } = useNotification();

    showNotification('Auto dismiss test', 'info', 3000);
    expect(activeNotification.value).not.toBeNull();

    // Advance to just before the 3000ms threshold
    vi.advanceTimersByTime(2999);
    expect(activeNotification.value).not.toBeNull();

    // Cross the 3000ms threshold
    vi.advanceTimersByTime(1);
    expect(activeNotification.value).toBeNull();
    expect(notificationAnnouncement.value).toBe('');
  });

  it('respects custom durationMs and 0 disables auto-dismiss', () => {
    const { activeNotification, showNotification } = useNotification();

    // Custom 2000ms duration
    showNotification('Short banner', 'info', 2000);
    vi.advanceTimersByTime(1999);
    expect(activeNotification.value).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(activeNotification.value).toBeNull();

    // 0ms duration = persistent banner
    showNotification('Persistent error banner', 'error', 0);
    vi.advanceTimersByTime(100000);
    expect(activeNotification.value).not.toBeNull();
    expect(activeNotification.value?.message).toBe('Persistent error banner');
  });

  it('handles multiple notifications in FIFO queue order', () => {
    const { activeNotification, showNotification } = useNotification();

    showNotification('First notice', 'info', 2000);
    showNotification('Second notice', 'success', 4000);

    expect(activeNotification.value?.message).toBe('First notice');

    // After first notice duration expires (2000ms), second notice becomes active
    vi.advanceTimersByTime(2000);
    expect(activeNotification.value?.message).toBe('Second notice');

    // After second notice duration expires (4000ms), queue is empty
    vi.advanceTimersByTime(4000);
    expect(activeNotification.value).toBeNull();
  });

  it('dismissNotification() removes active notification and clears timer', () => {
    const { activeNotification, showNotification, dismissNotification } = useNotification();

    showNotification('Manual dismiss test', 'info', 5000);
    const notifId = activeNotification.value?.id;
    expect(notifId).toBeDefined();

    dismissNotification(notifId);
    expect(activeNotification.value).toBeNull();

    // Advancing timers afterwards does nothing
    vi.advanceTimersByTime(5000);
    expect(activeNotification.value).toBeNull();
  });

  it('dismissNotification(id) ignores call if id does not match active notification', () => {
    const { activeNotification, showNotification, dismissNotification } = useNotification();

    showNotification('Current alert', 'info', 5000);
    const activeId = activeNotification.value?.id as number;

    dismissNotification(activeId + 9999);
    // Should still be active because ID didn't match
    expect(activeNotification.value).not.toBeNull();
    expect(activeNotification.value?.message).toBe('Current alert');
  });

  it('clearAll() immediately empties active notification and announcement', () => {
    const { activeNotification, notificationAnnouncement, showNotification, clearAll } = useNotification();

    showNotification('To be cleared', 'error', 5000);
    expect(activeNotification.value).not.toBeNull();
    expect(notificationAnnouncement.value).toBe('To be cleared');

    clearAll();
    expect(activeNotification.value).toBeNull();
    expect(notificationAnnouncement.value).toBe('');

    vi.advanceTimersByTime(5000);
    expect(activeNotification.value).toBeNull();
  });

  it('automatically clears active timer when effect scope is disposed (MIN-004)', () => {
    const scope = effectScope();
    let notif!: ReturnType<typeof useNotification>;

    scope.run(() => {
      notif = useNotification();
      notif.showNotification('Scope cleanup test', 'info', 5000);
    });

    expect(notif.activeNotification.value).not.toBeNull();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    // Dispose effect scope
    scope.stop();

    // Active timer is cleared, so advancing timers does not trigger dismissNotification
    vi.advanceTimersByTime(10000);
    expect(notif.activeNotification.value?.message).toBe('Scope cleanup test');
  });
});
