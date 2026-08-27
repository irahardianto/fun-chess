import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import PwaInstallModal from '../components/PwaInstallModal.vue';
import { usePwaInstall } from '../composables/usePwaInstall';

describe('PwaInstallModal.vue', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    const { setDeferredPrompt, setInstalled, resetSnooze } = usePwaInstall();
    setDeferredPrompt(null);
    setInstalled(false);
    resetSnooze();
  });

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders modal dialog when modelValue is true', async () => {
    // Arrange & Act
    wrapper = mount(PwaInstallModal, {
      props: {
        modelValue: true,
      },
    });
    await wrapper.vm.$nextTick();

    // Assert
    const modal = document.body.querySelector('[role="dialog"]');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain('Install Fun Chess');
  });

  it('renders 3-step illustrated guide when forceIos is true', async () => {
    // Arrange & Act
    wrapper = mount(PwaInstallModal, {
      props: {
        modelValue: true,
        forceIos: true,
      },
    });
    await wrapper.vm.$nextTick();

    // Assert
    const stepCards = document.body.querySelectorAll('.ios-step-card');
    expect(stepCards.length).toBe(3);

    expect(stepCards[0]?.textContent).toContain('Share');
    expect(stepCards[1]?.textContent).toContain('Add to Home Screen');
    expect(stepCards[2]?.textContent).toContain('Add');
  });

  it('renders 1-click install button when deferredPrompt is available and not iOS', async () => {
    // Arrange
    const { setDeferredPrompt } = usePwaInstall();
    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    } as any;
    setDeferredPrompt(mockPromptEvent);

    // Act
    wrapper = mount(PwaInstallModal, {
      props: {
        modelValue: true,
        forceIos: false,
      },
    });
    await wrapper.vm.$nextTick();

    // Assert
    const installBtn = document.body.querySelector('[data-testid="native-install-btn"]') as HTMLButtonElement;
    expect(installBtn).not.toBeNull();

    installBtn.click();
    await wrapper.vm.$nextTick();

    expect(mockPromptEvent.prompt).toHaveBeenCalled();
  });

  it('emits update:modelValue with false when close / got it button is clicked', async () => {
    // Arrange
    wrapper = mount(PwaInstallModal, {
      props: {
        modelValue: true,
        forceIos: true,
      },
    });
    await wrapper.vm.$nextTick();

    // Act
    const confirmBtn = document.body.querySelector('[data-testid="ios-install-done-btn"]') as HTMLButtonElement;
    expect(confirmBtn).not.toBeNull();
    confirmBtn.click();
    await wrapper.vm.$nextTick();

    // Assert
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });
});
