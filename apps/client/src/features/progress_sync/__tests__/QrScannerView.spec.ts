import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import QrScannerView from '@/features/portability/components/QrScannerView.vue';
import { ref } from 'vue';

const mockIsScanning = ref(true);
const mockHasCamera = ref(true);
const mockCameraError = ref<string | null>(null);
const mockStartScanner = vi.fn();
const mockStopScanner = vi.fn();

vi.mock('@/features/portability/composables/useQrScanner', () => ({
  useQrScanner: (_opts: any) => ({
    isScanning: mockIsScanning,
    hasCamera: mockHasCamera,
    cameraError: mockCameraError,
    scannedCode: ref(null),
    isProcessing: ref(false),
    startScanner: mockStartScanner,
    stopScanner: mockStopScanner,
    resetScanner: vi.fn(),
  }),
}));

describe('QrScannerView.vue', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    mockIsScanning.value = true;
    mockHasCamera.value = true;
    mockCameraError.value = null;
    mockStartScanner.mockClear();
    mockStopScanner.mockClear();
  });

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders video viewfinder card with 4-corner reticle and laser sweep line', () => {
    // Arrange & Act
    wrapper = mount(QrScannerView);

    // Assert
    expect(wrapper.find('.scanner-viewport-card').exists()).toBe(true);
    expect(wrapper.find('.scanner-laser-line').exists()).toBe(true);
    expect(wrapper.find('.reticle-corner.top-left').exists()).toBe(true);
    expect(wrapper.find('.reticle-corner.bottom-right').exists()).toBe(true);
  });

  it('renders camera permission error fallback when permission is denied', async () => {
    // Arrange
    mockHasCamera.value = false;
    mockCameraError.value = 'Camera permission was denied. Please allow camera access in your browser settings to scan QR codes! 📷';

    // Act
    wrapper = mount(QrScannerView);

    // Assert
    const emptyState = wrapper.find('.scanner-empty-state');
    expect(emptyState.exists()).toBe(true);
    expect(emptyState.text()).toContain('Camera permission');
  });

  it('renders drag-and-drop file dropzone for JSON saves', () => {
    // Arrange & Act
    wrapper = mount(QrScannerView);

    // Assert
    const dropzone = wrapper.find('.dropzone-box');
    expect(dropzone.exists()).toBe(true);
    expect(wrapper.text()).toContain('.json');
  });

  it('emits file when a file is dropped into dropzone', async () => {
    // Arrange
    wrapper = mount(QrScannerView);
    const dropzone = wrapper.find('.dropzone-box');

    const mockFile = new File(['{"magic":"FC_PROGRESS_V1"}'], 'funchess-save.json', {
      type: 'application/json',
    });

    // Act
    await dropzone.trigger('drop', {
      dataTransfer: {
        files: [mockFile],
      },
    });

    // Assert
    expect(wrapper.emitted('file')?.[0]).toEqual([mockFile]);
  });

  it('allows expanding manual code drawer and submitting raw text payload', async () => {
    // Arrange
    wrapper = mount(QrScannerView);

    const toggleBtn = wrapper.find('.manual-drawer-toggle');
    expect(toggleBtn.exists()).toBe(true);
    await toggleBtn.trigger('click');

    const textarea = wrapper.find('.manual-textarea');
    expect(textarea.exists()).toBe(true);

    // Act
    await textarea.setValue('FC1:eJy1VMockData');
    const submitBtn = wrapper.find('.manual-input-drawer button');
    expect(submitBtn.exists()).toBe(true);
    await submitBtn.trigger('click');

    // Assert
    expect(wrapper.emitted('code')?.[0]).toEqual(['FC1:eJy1VMockData']);
  });
});
