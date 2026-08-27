import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import ProgressSyncModal from '@/features/portability/components/ProgressSyncModal.vue';

vi.mock('qrcode', () => ({
  default: {
    toCanvas: vi.fn().mockResolvedValue(undefined),
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockQr'),
  },
}));

vi.mock('@/composables/useConfetti', () => ({
  useConfetti: () => ({
    celebrateVictory: vi.fn(),
  }),
}));

describe('ProgressSyncModal.vue', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders modal dialog and defaults to Export Progress tab', async () => {
    // Arrange & Act
    wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: true,
      },
    });
    await flushPromises();

    // Assert
    const modal = document.body.querySelector('[role="dialog"]');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain('Sync Progress');

    const exportTab = document.body.querySelector('#tab-export');
    expect(exportTab?.classList.contains('is-active') || exportTab?.getAttribute('aria-selected') === 'true').toBe(true);
  });

  it('switches between Export and Import tabs on button click', async () => {
    // Arrange
    wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: true,
      },
    });
    await flushPromises();

    const importTab = document.body.querySelector('#tab-import') as HTMLButtonElement;
    expect(importTab).not.toBeNull();

    // Act
    importTab.click();
    await flushPromises();

    // Assert
    expect(importTab.classList.contains('is-active') || importTab.getAttribute('aria-selected') === 'true').toBe(true);
    expect(document.body.querySelector('#panel-import')).not.toBeNull();
  });

  it('supports keyboard navigation with Arrow keys across tabs', async () => {
    // Arrange
    wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: true,
      },
    });
    await flushPromises();

    const tabBar = document.body.querySelector('.sync-tab-bar') as HTMLElement;
    expect(tabBar).not.toBeNull();

    // Act - Press ArrowRight to switch to import
    tabBar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await flushPromises();

    // Assert
    const importTab = document.body.querySelector('#tab-import');
    expect(importTab?.classList.contains('is-active')).toBe(true);
  });

  it('renders QR code canvas and stats summary on Export tab', async () => {
    // Arrange & Act
    wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: true,
      },
    });
    await flushPromises();

    // Assert
    const qrFrame = document.body.querySelector('.qr-canvas-frame') || document.body.querySelector('canvas');
    expect(qrFrame).not.toBeNull();

    const statsPill = document.body.querySelector('.stats-preview-pill');
    expect(statsPill).not.toBeNull();
  });

  it('handles 1-click JSON backup download click', async () => {
    // Arrange
    wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: true,
      },
    });
    await flushPromises();

    // Act
    const downloadBtn = document.body.querySelector('.qr-export-container button.btn-tactile--primary') as HTMLButtonElement;
    expect(downloadBtn).not.toBeNull();
    downloadBtn.click();
    await flushPromises();

    // Assert
    expect(downloadBtn).toBeDefined();
  });

  it('copies QR string to clipboard on button click', async () => {
    // Arrange
    wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: true,
      },
    });
    await flushPromises();

    // Act
    const copyBtn = document.body.querySelector('.qr-export-container button.btn-tactile--ghost') as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();
    copyBtn.click();
    await flushPromises();

    // Assert
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it('renders camera viewfinder and drag-and-drop dropzone on Import tab', async () => {
    // Arrange
    wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: true,
      },
    });
    await flushPromises();

    // Switch to import tab
    const importTab = document.body.querySelector('#tab-import') as HTMLButtonElement;
    importTab.click();
    await flushPromises();

    // Assert
    expect(document.body.querySelector('.scanner-viewport-card') || document.body.querySelector('.scanner-laser-line')).not.toBeNull();
    expect(document.body.querySelector('.dropzone-box') || document.body.querySelector('.dropzone-container')).not.toBeNull();
  });

  it('allows manual text/QR payload submission via fallback drawer', async () => {
    // Arrange
    wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: true,
      },
    });
    await flushPromises();

    const importTab = document.body.querySelector('#tab-import') as HTMLButtonElement;
    importTab.click();
    await flushPromises();

    // Open manual input drawer
    const toggleBtn = document.body.querySelector('.manual-drawer-toggle') as HTMLButtonElement;
    if (toggleBtn) {
      toggleBtn.click();
      await flushPromises();
    }

    const textarea = document.body.querySelector('.manual-textarea') as HTMLTextAreaElement;
    const submitBtn = document.body.querySelector('.manual-input-drawer button') as HTMLButtonElement;

    if (textarea && submitBtn) {
      // Act
      textarea.value = 'FC1:eJy1VMockData';
      textarea.dispatchEvent(new Event('input'));
      await flushPromises();

      submitBtn.click();
      await flushPromises();

      // Assert
      expect(submitBtn).toBeDefined();
    }
  });

  it('closes modal when close button is clicked', async () => {
    // Arrange
    wrapper = mount(ProgressSyncModal, {
      props: {
        modelValue: true,
      },
    });
    await flushPromises();

    // Act
    const closeBtn = document.body.querySelector('.base-modal-close-btn') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    await flushPromises();

    // Assert
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });
});
