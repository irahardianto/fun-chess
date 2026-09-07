import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useStorageQuotaAlert } from '../useStorageQuotaAlert';
import {
  storageAlertDispatcher,
  type StorageQuotaAlertEvent,
} from '@/platform/storage/storage_alert';

describe('useStorageQuotaAlert composable', () => {
  const sampleEvent: StorageQuotaAlertEvent = {
    type: 'STORAGE_QUOTA_EXCEEDED',
    store: 'scenarios',
    attemptedAction: 'save',
    timestamp: 1725700000000,
    message: 'Storage quota exceeded for scenarios',
    suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
  };

  const alternativeEvent: StorageQuotaAlertEvent = {
    type: 'STORAGE_QUOTA_EXCEEDED',
    store: 'unified',
    attemptedAction: 'overwrite',
    timestamp: 1725700010000,
    message: 'Storage quota exceeded during unified overwrite',
    suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
  };

  beforeEach(() => {
    storageAlertDispatcher.clear();
  });

  afterEach(() => {
    storageAlertDispatcher.clear();
  });

  it('should initialize with default inactive state', () => {
    const TestComponent = defineComponent({
      setup() {
        return useStorageQuotaAlert();
      },
      template: '<div></div>',
    });

    const wrapper = mount(TestComponent);

    expect(wrapper.vm.isQuotaExceeded).toBe(false);
    expect(wrapper.vm.currentAlert).toBeNull();

    wrapper.unmount();
  });

  it('should reactively update state when storageAlertDispatcher emits an event', async () => {
    const TestComponent = defineComponent({
      setup() {
        return useStorageQuotaAlert();
      },
      template: '<div></div>',
    });

    const wrapper = mount(TestComponent);

    expect(wrapper.vm.isQuotaExceeded).toBe(false);
    expect(wrapper.vm.currentAlert).toBeNull();

    storageAlertDispatcher.notify(sampleEvent);

    expect(wrapper.vm.isQuotaExceeded).toBe(true);
    expect(wrapper.vm.currentAlert).toEqual(sampleEvent);

    wrapper.unmount();
  });

  it('should clear currentAlert and reset isQuotaExceeded on dismissAlert()', () => {
    const TestComponent = defineComponent({
      setup() {
        return useStorageQuotaAlert();
      },
      template: '<div></div>',
    });

    const wrapper = mount(TestComponent);

    storageAlertDispatcher.notify(sampleEvent);
    expect(wrapper.vm.isQuotaExceeded).toBe(true);
    expect(wrapper.vm.currentAlert).toEqual(sampleEvent);

    wrapper.vm.dismissAlert();

    expect(wrapper.vm.isQuotaExceeded).toBe(false);
    expect(wrapper.vm.currentAlert).toBeNull();

    wrapper.unmount();
  });

  it('should correctly handle subsequent notifications after dismissal', () => {
    const TestComponent = defineComponent({
      setup() {
        return useStorageQuotaAlert();
      },
      template: '<div></div>',
    });

    const wrapper = mount(TestComponent);

    storageAlertDispatcher.notify(sampleEvent);
    expect(wrapper.vm.isQuotaExceeded).toBe(true);

    wrapper.vm.dismissAlert();
    expect(wrapper.vm.isQuotaExceeded).toBe(false);

    storageAlertDispatcher.notify(alternativeEvent);
    expect(wrapper.vm.isQuotaExceeded).toBe(true);
    expect(wrapper.vm.currentAlert).toEqual(alternativeEvent);

    wrapper.unmount();
  });

  it('should clean up subscription on component unmount and stop receiving events', () => {
    const unsubscribeSpy = vi.fn();
    const originalSubscribe = storageAlertDispatcher.subscribe.bind(storageAlertDispatcher);

    vi.spyOn(storageAlertDispatcher, 'subscribe').mockImplementation((listener) => {
      const realUnsub = originalSubscribe(listener);
      return () => {
        unsubscribeSpy();
        realUnsub();
      };
    });

    const TestComponent = defineComponent({
      setup() {
        return useStorageQuotaAlert();
      },
      template: '<div></div>',
    });

    const wrapper = mount(TestComponent);

    expect(wrapper.vm.isQuotaExceeded).toBe(false);

    // Unmount the component
    wrapper.unmount();

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);

    // Dispatching after unmount should not update or throw
    storageAlertDispatcher.notify(sampleEvent);
    expect(wrapper.vm.isQuotaExceeded).toBe(false);
    expect(wrapper.vm.currentAlert).toBeNull();
  });

  it('should safely allow dismissAlert() when no alert is active', () => {
    const TestComponent = defineComponent({
      setup() {
        return useStorageQuotaAlert();
      },
      template: '<div></div>',
    });

    const wrapper = mount(TestComponent);

    expect(() => wrapper.vm.dismissAlert()).not.toThrow();
    expect(wrapper.vm.isQuotaExceeded).toBe(false);
    expect(wrapper.vm.currentAlert).toBeNull();

    wrapper.unmount();
  });

  it('should notify multiple active composable instances independently', () => {
    const TestComponentA = defineComponent({
      setup() {
        return { alertA: useStorageQuotaAlert() };
      },
      template: '<div></div>',
    });

    const TestComponentB = defineComponent({
      setup() {
        return { alertB: useStorageQuotaAlert() };
      },
      template: '<div></div>',
    });

    const wrapperA = mount(TestComponentA);
    const wrapperB = mount(TestComponentB);

    storageAlertDispatcher.notify(sampleEvent);

    expect(wrapperA.vm.alertA.isQuotaExceeded.value).toBe(true);
    expect(wrapperA.vm.alertA.currentAlert.value).toEqual(sampleEvent);

    expect(wrapperB.vm.alertB.isQuotaExceeded.value).toBe(true);
    expect(wrapperB.vm.alertB.currentAlert.value).toEqual(sampleEvent);

    // Dismissing A should not affect B
    wrapperA.vm.alertA.dismissAlert();

    expect(wrapperA.vm.alertA.isQuotaExceeded.value).toBe(false);
    expect(wrapperA.vm.alertA.currentAlert.value).toBeNull();

    expect(wrapperB.vm.alertB.isQuotaExceeded.value).toBe(true);
    expect(wrapperB.vm.alertB.currentAlert.value).toEqual(sampleEvent);

    wrapperA.unmount();
    wrapperB.unmount();
  });
});
