import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import type { UnifiedProgressPayload, ProgressDiffPreview, SyncMergeStrategy } from '@fun-chess/shared';
import ProgressSyncModal from '../ProgressSyncModal.vue';
import QrExportView from '../QrExportView.vue';
import QrScannerView from '../QrScannerView.vue';
import ProgressConflictModal from '../ProgressConflictModal.vue';
import { defaultProgressFileService } from '../../services/progress_file.service';

// Shared mock state for useProgressSync
const mockProgressState = {
  isLoading: ref(false),
  syncError: ref<string | null>(null),
  currentProgress: ref<UnifiedProgressPayload | null>(null),
  incomingPayload: ref<UnifiedProgressPayload | null>(null),
  diffPreview: ref<ProgressDiffPreview | null>(null),
  isConflictModalOpen: ref(false),
  isSyncModalOpen: ref(false),
  loadCurrentProgress: vi.fn(),
  exportJson: vi.fn(),
  exportQrString: vi.fn(),
  importPayload: vi.fn(),
  executeMerge: vi.fn(),
  openSyncModal: vi.fn(),
  closeSyncModal: vi.fn(),
  openConflictModal: vi.fn(),
  closeConflictModal: vi.fn(),
  clearError: vi.fn(),
};

vi.mock('../../composables/useProgressSync', () => ({
  useProgressSync: () => ({
    isLoading: mockProgressState.isLoading,
    syncError: mockProgressState.syncError,
    currentProgress: mockProgressState.currentProgress,
    incomingPayload: mockProgressState.incomingPayload,
    diffPreview: mockProgressState.diffPreview,
    isConflictModalOpen: mockProgressState.isConflictModalOpen,
    isSyncModalOpen: mockProgressState.isSyncModalOpen,
    loadCurrentProgress: mockProgressState.loadCurrentProgress,
    exportJson: mockProgressState.exportJson,
    exportQrString: mockProgressState.exportQrString,
    importPayload: mockProgressState.importPayload,
    executeMerge: mockProgressState.executeMerge,
    openSyncModal: mockProgressState.openSyncModal,
    closeSyncModal: mockProgressState.closeSyncModal,
    openConflictModal: mockProgressState.openConflictModal,
    closeConflictModal: mockProgressState.closeConflictModal,
    clearError: mockProgressState.clearError,
  }),
}));

// Shared mock state for usePwaInstall
const mockPwaState = {
  canInstall: ref(true),
  isStandalone: ref(false),
  promptInstall: vi.fn().mockResolvedValue(true),
};

vi.mock('@/features/pwa', () => ({
  usePwaInstall: () => ({
    canInstall: mockPwaState.canInstall,
    isStandalone: mockPwaState.isStandalone,
    promptInstall: mockPwaState.promptInstall,
  }),
}));

describe('ProgressSyncModal.vue', () => {
  beforeEach(() => {
    // Reset Progress State
    mockProgressState.isLoading.value = false;
    mockProgressState.syncError.value = null;
    mockProgressState.currentProgress.value = {
      schemaVersion: '1.0.0',
      exportTimestamp: '2026-09-07T00:00:00Z',
      scenarios: { 'scenario-1': { completed: true, starsEarned: 3 } },
      puzzles: {
        ratingProfile: { rating: 1200, bestStreak: 5 },
        solvedPuzzles: { 'p-1': { solvedAt: 12345 } },
      },
      settings: {},
    } as unknown as UnifiedProgressPayload;
    mockProgressState.incomingPayload.value = null;
    mockProgressState.diffPreview.value = null;
    mockProgressState.isConflictModalOpen.value = false;
    mockProgressState.isSyncModalOpen.value = false;

    mockProgressState.loadCurrentProgress.mockReset().mockResolvedValue(mockProgressState.currentProgress.value);
    mockProgressState.exportJson.mockReset().mockResolvedValue('{"mock":"json"}');
    mockProgressState.exportQrString.mockReset().mockResolvedValue('FC_PROGRESS_V1:mock-qr-payload');
    mockProgressState.importPayload.mockReset().mockResolvedValue(true);
    mockProgressState.executeMerge.mockReset().mockResolvedValue(mockProgressState.currentProgress.value);
    mockProgressState.clearError.mockReset().mockImplementation(() => {
      mockProgressState.syncError.value = null;
    });

    // Reset PWA state
    mockPwaState.canInstall.value = true;
    mockPwaState.isStandalone.value = false;
    mockPwaState.promptInstall.mockReset().mockResolvedValue(true);

    // Stub navigator APIs
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

    // Mock Canvas and Media prototypes to eliminate JSDOM console noise
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(1000) }),
    } as unknown as CanvasRenderingContext2D);

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  // --------------------------------------------------------------------------
  // 1. Modal Visibility & Lifecycle
  // --------------------------------------------------------------------------
  describe('Modal Visibility & Lifecycle', () => {
    it('renders closed when modelValue is false', () => {
      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: false,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      expect(wrapper.find('.sync-tab-bar').exists()).toBe(false);
      expect(mockProgressState.loadCurrentProgress).not.toHaveBeenCalled();
    });

    it('renders default closed when modelValue prop is omitted', () => {
      const wrapper = mount(ProgressSyncModal, {
        global: {
          stubs: { Teleport: true },
        },
      });

      expect(wrapper.find('.sync-tab-bar').exists()).toBe(false);
    });

    it('renders open when modelValue is true, clears errors, and loads progress & QR', async () => {
      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockProgressState.clearError).toHaveBeenCalled();
      expect(mockProgressState.loadCurrentProgress).toHaveBeenCalled();
      expect(mockProgressState.exportQrString).toHaveBeenCalled();

      expect(wrapper.find('#tab-export').exists()).toBe(true);
      expect(wrapper.find('#tab-import').exists()).toBe(true);
      expect(wrapper.findComponent(QrExportView).exists()).toBe(true);
      expect(wrapper.findComponent(QrScannerView).exists()).toBe(false);
    });

    it('closes modal when BaseModal emits update:modelValue with false', async () => {
      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const baseModal = wrapper.findComponent({ name: 'BaseModal' });
      expect(baseModal.exists()).toBe(true);

      baseModal.vm.$emit('update:modelValue', false);
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('update:modelValue')).toBeTruthy();
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Lifecycle & QR Error Handling
  // --------------------------------------------------------------------------
  describe('Lifecycle & QR Error Handling', () => {
    it('handles loadCurrentProgress failure with Error instance and displays banner', async () => {
      mockProgressState.loadCurrentProgress.mockRejectedValueOnce(new Error('Storage database locked'));

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const errorBanner = wrapper.find('.sync-error-banner');
      expect(errorBanner.exists()).toBe(true);
      expect(errorBanner.text()).toContain('Storage database locked');
    });

    it('handles loadCurrentProgress failure with non-Error value and displays fallback', async () => {
      mockProgressState.loadCurrentProgress.mockRejectedValueOnce('Corrupt storage');

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const errorBanner = wrapper.find('.sync-error-banner');
      expect(errorBanner.exists()).toBe(true);
      expect(errorBanner.text()).toContain('Failed to load progress data');
    });

    it('handles refreshExportQr failure with Error instance and displays banner', async () => {
      mockProgressState.exportQrString.mockRejectedValueOnce(new Error('Canvas memory limit exceeded'));

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const errorBanner = wrapper.find('.sync-error-banner');
      expect(errorBanner.exists()).toBe(true);
      expect(errorBanner.text()).toContain('Canvas memory limit exceeded');
    });

    it('handles refreshExportQr failure with non-Error value and displays fallback', async () => {
      mockProgressState.exportQrString.mockRejectedValueOnce({ custom: 'failure' });

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const errorBanner = wrapper.find('.sync-error-banner');
      expect(errorBanner.exists()).toBe(true);
      expect(errorBanner.text()).toContain('Failed to generate export QR code');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Tab Switching & Keyboard Navigation
  // --------------------------------------------------------------------------
  describe('Tab Switching & Keyboard Navigation', () => {
    it('switches between Export and Import tabs on button click', async () => {
      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const exportTabBtn = wrapper.find('#tab-export');
      const importTabBtn = wrapper.find('#tab-import');

      expect(exportTabBtn.classes()).toContain('is-active');
      expect(exportTabBtn.attributes('aria-selected')).toBe('true');
      expect(exportTabBtn.attributes('tabindex')).toBe('0');
      expect(importTabBtn.classes()).not.toContain('is-active');
      expect(importTabBtn.attributes('aria-selected')).toBe('false');
      expect(importTabBtn.attributes('tabindex')).toBe('-1');

      // Click import tab
      await importTabBtn.trigger('click');
      expect(wrapper.findComponent(QrExportView).exists()).toBe(false);
      expect(wrapper.findComponent(QrScannerView).exists()).toBe(true);
      expect(importTabBtn.classes()).toContain('is-active');
      expect(importTabBtn.attributes('aria-selected')).toBe('true');
      expect(importTabBtn.attributes('tabindex')).toBe('0');
      expect(exportTabBtn.classes()).not.toContain('is-active');
      expect(mockProgressState.clearError).toHaveBeenCalled();

      // Click export tab back
      mockProgressState.exportQrString.mockClear();
      await exportTabBtn.trigger('click');
      expect(wrapper.findComponent(QrExportView).exists()).toBe(true);
      expect(wrapper.findComponent(QrScannerView).exists()).toBe(false);
      expect(exportTabBtn.classes()).toContain('is-active');
      expect(mockProgressState.exportQrString).toHaveBeenCalled();
    });

    it('navigates tabs using ArrowRight, ArrowLeft, Home, and End keys and focuses tab buttons', async () => {
      const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');

      const wrapper = mount(ProgressSyncModal, {
        attachTo: document.body,
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const tabBar = wrapper.find('.sync-tab-bar');

      // ArrowRight toggles export -> import and focuses #tab-import
      await tabBar.trigger('keydown', { key: 'ArrowRight' });
      expect(wrapper.findComponent(QrScannerView).exists()).toBe(true);
      expect(focusSpy).toHaveBeenCalled();

      // ArrowRight toggles import -> export and focuses #tab-export
      await tabBar.trigger('keydown', { key: 'ArrowRight' });
      expect(wrapper.findComponent(QrExportView).exists()).toBe(true);

      // ArrowLeft toggles export -> import
      await tabBar.trigger('keydown', { key: 'ArrowLeft' });
      expect(wrapper.findComponent(QrScannerView).exists()).toBe(true);

      // Home key forces tab to export
      await tabBar.trigger('keydown', { key: 'Home' });
      expect(wrapper.findComponent(QrExportView).exists()).toBe(true);

      // End key forces tab to import
      await tabBar.trigger('keydown', { key: 'End' });
      expect(wrapper.findComponent(QrScannerView).exists()).toBe(true);

      wrapper.unmount();
      focusSpy.mockRestore();
    });

    it('ignores unhandled keys during tab bar keydown', async () => {
      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const tabBar = wrapper.find('.sync-tab-bar');
      await tabBar.trigger('keydown', { key: 'Tab' });
      await tabBar.trigger('keydown', { key: 'Enter' });
      await tabBar.trigger('keydown', { key: 'Space' });

      // Still on export tab
      expect(wrapper.findComponent(QrExportView).exists()).toBe(true);
      expect(wrapper.findComponent(QrScannerView).exists()).toBe(false);
    });

    it('handles tab focus gracefully when element is not in DOM', async () => {
      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const getElemSpy = vi.spyOn(document, 'getElementById').mockReturnValue(null);

      const tabBar = wrapper.find('.sync-tab-bar');
      await tabBar.trigger('keydown', { key: 'ArrowRight' });

      expect(wrapper.findComponent(QrScannerView).exists()).toBe(true);
      getElemSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // 4. Export File Generation
  // --------------------------------------------------------------------------
  describe('Export File Generation', () => {
    it('downloads json backup when QrExportView emits download-json', async () => {
      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const exportView = wrapper.findComponent(QrExportView);
      expect(exportView.exists()).toBe(true);

      exportView.vm.$emit('download-json');
      await wrapper.vm.$nextTick();

      expect(mockProgressState.exportJson).toHaveBeenCalledWith('funchess-save.json');
    });

    it('handles exportJson Error rejection and displays banner', async () => {
      mockProgressState.exportJson.mockRejectedValueOnce(new Error('Failed to create Blob'));

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const exportView = wrapper.findComponent(QrExportView);
      exportView.vm.$emit('download-json');
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const errorBanner = wrapper.find('.sync-error-banner');
      expect(errorBanner.exists()).toBe(true);
      expect(errorBanner.text()).toContain('Failed to create Blob');
    });

    it('handles exportJson non-Error rejection and displays fallback', async () => {
      mockProgressState.exportJson.mockRejectedValueOnce('Disk full');

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const exportView = wrapper.findComponent(QrExportView);
      exportView.vm.$emit('download-json');
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const errorBanner = wrapper.find('.sync-error-banner');
      expect(errorBanner.exists()).toBe(true);
      expect(errorBanner.text()).toContain('Failed to export backup file');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Import Handling (QR Code & File)
  // --------------------------------------------------------------------------
  describe('Import Handling (QR Code & File)', () => {
    it('closes modal when importPayload returns true (auto-merge success)', async () => {
      mockProgressState.importPayload.mockResolvedValueOnce(true);

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      await wrapper.find('#tab-import').trigger('click');
      const scannerView = wrapper.findComponent(QrScannerView);
      expect(scannerView.exists()).toBe(true);

      scannerView.vm.$emit('code', 'FC_PROGRESS_V1:mock-scanned-data');
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockProgressState.importPayload).toHaveBeenCalledWith('FC_PROGRESS_V1:mock-scanned-data');
      expect(wrapper.emitted('update:modelValue')).toBeTruthy();
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });

    it('leaves modal open when importPayload returns false (conflict detected)', async () => {
      mockProgressState.importPayload.mockResolvedValueOnce(false);

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      await wrapper.find('#tab-import').trigger('click');
      const scannerView = wrapper.findComponent(QrScannerView);

      scannerView.vm.$emit('code', 'FC_PROGRESS_V1:conflict-data');
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(mockProgressState.importPayload).toHaveBeenCalledWith('FC_PROGRESS_V1:conflict-data');
      expect(wrapper.emitted('update:modelValue')).toBeFalsy();
    });

    it('rejects uploaded file exceeding 2MB limit with error banner', async () => {
      const readSpy = vi.spyOn(defaultProgressFileService, 'readProgressFile');

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      await wrapper.find('#tab-import').trigger('click');
      const scannerView = wrapper.findComponent(QrScannerView);

      const oversizedFile = {
        name: 'huge_save.json',
        size: 3 * 1024 * 1024,
      } as unknown as File;

      scannerView.vm.$emit('file', oversizedFile);
      await wrapper.vm.$nextTick();

      const errorBanner = wrapper.find('.sync-error-banner');
      expect(errorBanner.exists()).toBe(true);
      expect(errorBanner.text()).toContain('File size exceeds 2MB limit');
      expect(readSpy).not.toHaveBeenCalled();
      readSpy.mockRestore();
    });

    it('reads valid uploaded file, imports payload, and closes modal on success', async () => {
      const readSpy = vi.spyOn(defaultProgressFileService, 'readProgressFile').mockResolvedValue('{"valid":"json"}');
      mockProgressState.importPayload.mockResolvedValueOnce(true);

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      await wrapper.find('#tab-import').trigger('click');
      const scannerView = wrapper.findComponent(QrScannerView);

      const validFile = {
        name: 'save.json',
        size: 1024,
      } as unknown as File;

      scannerView.vm.$emit('file', validFile);
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(readSpy).toHaveBeenCalledWith(validFile);
      expect(mockProgressState.importPayload).toHaveBeenCalledWith('{"valid":"json"}');
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
      readSpy.mockRestore();
    });

    it('leaves modal open when valid uploaded file import results in conflict', async () => {
      const readSpy = vi.spyOn(defaultProgressFileService, 'readProgressFile').mockResolvedValue('{"conflict":"json"}');
      mockProgressState.importPayload.mockResolvedValueOnce(false);

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      await wrapper.find('#tab-import').trigger('click');
      const scannerView = wrapper.findComponent(QrScannerView);

      const validFile = {
        name: 'save.json',
        size: 1024,
      } as unknown as File;

      scannerView.vm.$emit('file', validFile);
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('update:modelValue')).toBeFalsy();
      readSpy.mockRestore();
    });

    it('handles file read error with custom message', async () => {
      const readSpy = vi.spyOn(defaultProgressFileService, 'readProgressFile').mockRejectedValue(new Error('Corrupt file structure'));

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      await wrapper.find('#tab-import').trigger('click');
      const scannerView = wrapper.findComponent(QrScannerView);

      const validFile = {
        name: 'bad.json',
        size: 512,
      } as unknown as File;

      scannerView.vm.$emit('file', validFile);
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const errorBanner = wrapper.find('.sync-error-banner');
      expect(errorBanner.exists()).toBe(true);
      expect(errorBanner.text()).toContain('Corrupt file structure');
      readSpy.mockRestore();
    });

    it('handles file read error without message and shows fallback', async () => {
      const readSpy = vi.spyOn(defaultProgressFileService, 'readProgressFile').mockRejectedValue(null);

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      await wrapper.find('#tab-import').trigger('click');
      const scannerView = wrapper.findComponent(QrScannerView);

      const validFile = {
        name: 'bad.json',
        size: 512,
      } as unknown as File;

      scannerView.vm.$emit('file', validFile);
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const errorBanner = wrapper.find('.sync-error-banner');
      expect(errorBanner.exists()).toBe(true);
      expect(errorBanner.text()).toContain('Failed to read save file.');
      readSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // 6. Conflict Resolution Modal Triggering & Handling
  // --------------------------------------------------------------------------
  describe('Conflict Resolution Modal Triggering & Handling', () => {
    it('does not render conflict modal when conflict is not open', () => {
      mockProgressState.isConflictModalOpen.value = false;

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      expect(wrapper.findComponent(ProgressConflictModal).exists()).toBe(false);
    });

    it('renders ProgressConflictModal when conflict conditions are met', () => {
      mockProgressState.isConflictModalOpen.value = true;
      mockProgressState.diffPreview.value = {
        hasDifferences: true,
        conflicts: [],
        autoResolvable: false,
      } as unknown as ProgressDiffPreview;
      mockProgressState.incomingPayload.value = {
        schemaVersion: '1.0.0',
        exportTimestamp: '2026-09-07T00:00:00Z',
        scenarios: {},
      } as unknown as UnifiedProgressPayload;

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const conflictModal = wrapper.findComponent(ProgressConflictModal);
      expect(conflictModal.exists()).toBe(true);
      expect(conflictModal.props('loading')).toBe(false);
    });

    it('forwards @resolve event to executeMerge with selected strategy', async () => {
      mockProgressState.isConflictModalOpen.value = true;
      mockProgressState.diffPreview.value = { hasDifferences: true } as unknown as ProgressDiffPreview;
      mockProgressState.incomingPayload.value = { scenarios: {} } as unknown as UnifiedProgressPayload;

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const conflictModal = wrapper.findComponent(ProgressConflictModal);
      conflictModal.vm.$emit('resolve', 'smart_merge' as SyncMergeStrategy);
      await wrapper.vm.$nextTick();

      expect(mockProgressState.executeMerge).toHaveBeenCalledWith('smart_merge');
    });

    it('handles @closed event by resetting conflict state and closing modal', async () => {
      mockProgressState.isConflictModalOpen.value = true;
      mockProgressState.diffPreview.value = { hasDifferences: true } as unknown as ProgressDiffPreview;
      mockProgressState.incomingPayload.value = { scenarios: {} } as unknown as UnifiedProgressPayload;

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const conflictModal = wrapper.findComponent(ProgressConflictModal);
      conflictModal.vm.$emit('closed');
      await wrapper.vm.$nextTick();

      expect(mockProgressState.isConflictModalOpen.value).toBe(false);
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });

    it('updates isConflictModalOpen when ProgressConflictModal emits update:modelValue', async () => {
      mockProgressState.isConflictModalOpen.value = true;
      mockProgressState.diffPreview.value = { hasDifferences: true } as unknown as ProgressDiffPreview;
      mockProgressState.incomingPayload.value = { scenarios: {} } as unknown as UnifiedProgressPayload;

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const conflictModal = wrapper.findComponent(ProgressConflictModal);
      conflictModal.vm.$emit('update:modelValue', false);
      await wrapper.vm.$nextTick();

      expect(mockProgressState.isConflictModalOpen.value).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Error Notification & Dismissal
  // --------------------------------------------------------------------------
  describe('Error Notification & Dismissal', () => {
    it('displays error banner and clears error when dismiss button is clicked', async () => {
      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      mockProgressState.syncError.value = 'Failed to load progress data';
      await wrapper.vm.$nextTick();

      const banner = wrapper.find('.sync-error-banner');
      expect(banner.exists()).toBe(true);
      expect(banner.text()).toContain('Failed to load progress data');

      const dismissBtn = wrapper.find('.error-dismiss-btn');
      expect(dismissBtn.exists()).toBe(true);
      await dismissBtn.trigger('click');

      expect(mockProgressState.clearError).toHaveBeenCalled();
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.sync-error-banner').exists()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 8. PWA Install Card
  // --------------------------------------------------------------------------
  describe('PWA Install Card', () => {
    it('renders PWA install section and triggers promptInstall when clicked', async () => {
      mockPwaState.canInstall.value = true;
      mockPwaState.isStandalone.value = false;

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const pwaSection = wrapper.find('[data-testid="sync-pwa-install-section"]');
      expect(pwaSection.exists()).toBe(true);
      expect(pwaSection.text()).toContain('Install App & Offline Play');

      const installBtn = wrapper.find('[data-testid="sync-pwa-install-btn"]');
      expect(installBtn.exists()).toBe(true);
      await installBtn.trigger('click');

      expect(mockPwaState.promptInstall).toHaveBeenCalled();
    });

    it('hides PWA install card when app is running in standalone mode', () => {
      mockPwaState.isStandalone.value = true;

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      expect(wrapper.find('[data-testid="sync-pwa-install-section"]').exists()).toBe(false);
    });

    it('hides PWA install card when canInstall is false', () => {
      mockPwaState.canInstall.value = false;

      const wrapper = mount(ProgressSyncModal, {
        props: {
          modelValue: true,
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      expect(wrapper.find('[data-testid="sync-pwa-install-section"]').exists()).toBe(false);
    });
  });
});

