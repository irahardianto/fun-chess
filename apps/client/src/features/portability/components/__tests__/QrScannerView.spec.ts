import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import QrScannerView from '../QrScannerView.vue';

describe('QrScannerView.vue', () => {
  let mockTrack: { stop: ReturnType<typeof vi.fn> };
  let mockStream: { getTracks: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockTrack = { stop: vi.fn() };
    mockStream = { getTracks: vi.fn().mockReturnValue([mockTrack]) };

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders camera viewfinder, dropzone and manual drawer toggle', () => {
    const wrapper = mount(QrScannerView);

    expect(wrapper.find('.scanner-viewport-card').exists()).toBe(true);
    expect(wrapper.find('.dropzone-box').exists()).toBe(true);
    expect(wrapper.find('.manual-drawer-toggle').exists()).toBe(true);
    wrapper.unmount();
  });

  it('handles camera permission error state on mount and displays error fallback', async () => {
    const permError = new Error('Permission denied');
    permError.name = 'NotAllowedError';
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(permError);

    const wrapper = mount(QrScannerView);
    await vi.waitFor(() => {
      expect(wrapper.find('.scanner-empty-state').exists()).toBe(true);
    });

    const errorText = wrapper.find('.scanner-error-text');
    expect(errorText.text()).toContain('Camera permission was denied');
    wrapper.unmount();
  });

  it('catches initCamera failure in onMounted without unhandled rejection', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => {
      throw new Error('Sync camera hardware failure');
    });

    const wrapper = mount(QrScannerView);
    await vi.waitFor(() => {
      expect(wrapper.find('.scanner-empty-state').exists()).toBe(true);
    });

    expect(wrapper.find('.scanner-error-text').text()).toContain('Sync camera hardware failure');
    wrapper.unmount();
  });

  it('re-attempts camera acquisition when retry button is clicked', async () => {
    const permError = new Error('Permission denied');
    permError.name = 'NotAllowedError';
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(permError);

    const wrapper = mount(QrScannerView);
    await vi.waitFor(() => {
      expect(wrapper.find('.scanner-empty-state').exists()).toBe(true);
    });

    // Reset mock to resolve successfully on retry
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(mockStream as any);

    const retryBtn = wrapper.findAll('button').find((b) => b.text().includes('Try Camera Again'));
    expect(retryBtn?.exists()).toBe(true);

    await retryBtn?.trigger('click');
    await vi.waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    });

    wrapper.unmount();
  });

  it('handles dragover and dragleave events to toggle active dropzone state', async () => {
    const wrapper = mount(QrScannerView);
    const dropzone = wrapper.find('.dropzone-box');

    expect(dropzone.classes()).not.toContain('is-drag-active');

    await dropzone.trigger('dragover');
    expect(dropzone.classes()).toContain('is-drag-active');

    await dropzone.trigger('dragleave');
    expect(dropzone.classes()).not.toContain('is-drag-active');
    wrapper.unmount();
  });

  it('emits file event on dropzone file drop and clears drag active state', async () => {
    const wrapper = mount(QrScannerView);
    const dropzone = wrapper.find('.dropzone-box');

    const file = new File(['{"magic":"FC_PROGRESS_V1"}'], 'save.json', {
      type: 'application/json',
    });

    await dropzone.trigger('dragover');
    expect(dropzone.classes()).toContain('is-drag-active');

    await dropzone.trigger('drop', {
      dataTransfer: {
        files: [file],
      },
    });

    expect(dropzone.classes()).not.toContain('is-drag-active');
    expect(wrapper.emitted('file')?.[0]).toEqual([file]);
    wrapper.unmount();
  });

  it('does not emit file event when dropped files list is empty', async () => {
    const wrapper = mount(QrScannerView);
    const dropzone = wrapper.find('.dropzone-box');

    await dropzone.trigger('drop', {
      dataTransfer: {
        files: [],
      },
    });

    expect(wrapper.emitted('file')).toBeUndefined();
    wrapper.unmount();
  });

  it('clicks hidden file input when Browse File button is clicked', async () => {
    const wrapper = mount(QrScannerView);
    const fileInput = wrapper.find<HTMLInputElement>('.dropzone-hidden-input');
    const clickSpy = vi.spyOn(fileInput.element, 'click');

    const browseBtn = wrapper.findAll('button').find((b) => b.text().includes('Browse File'));
    await browseBtn?.trigger('click');

    expect(clickSpy).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('handles file input change event and emits file', async () => {
    const wrapper = mount(QrScannerView);
    const fileInput = wrapper.find<HTMLInputElement>('.dropzone-hidden-input');

    const file = new File(['{"data": 123}'], 'manual-select.json', {
      type: 'application/json',
    });

    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      writable: true,
    });

    await fileInput.trigger('change');

    expect(wrapper.emitted('file')?.[0]).toEqual([file]);
    expect(fileInput.element.value).toBe('');
    wrapper.unmount();
  });

  it('handles file input change event with no selected files gracefully', async () => {
    const wrapper = mount(QrScannerView);
    const fileInput = wrapper.find<HTMLInputElement>('.dropzone-hidden-input');

    Object.defineProperty(fileInput.element, 'files', {
      value: [],
      writable: true,
    });

    await fileInput.trigger('change');
    expect(wrapper.emitted('file')).toBeUndefined();
    wrapper.unmount();
  });

  it('toggles manual drawer on click and submits manual code', async () => {
    const wrapper = mount(QrScannerView);

    expect(wrapper.find('.manual-textarea').exists()).toBe(false);

    // Open drawer
    await wrapper.find('.manual-drawer-toggle').trigger('click');
    expect(wrapper.find('.manual-textarea').exists()).toBe(true);

    const textarea = wrapper.find('.manual-textarea');
    await textarea.setValue('FC1:some_code');

    const loadBtn = wrapper.findAll('button').find((b) => b.text().includes('Load Progress'));
    await loadBtn?.trigger('click');

    expect(wrapper.emitted('code')?.[0]).toEqual(['FC1:some_code']);

    // Toggle close drawer
    await wrapper.find('.manual-drawer-toggle').trigger('click');
    expect(wrapper.find('.manual-textarea').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not emit code when submitting whitespace-only manual input', async () => {
    const wrapper = mount(QrScannerView);

    await wrapper.find('.manual-drawer-toggle').trigger('click');
    const textarea = wrapper.find('.manual-textarea');
    await textarea.setValue('   ');

    const loadBtn = wrapper.findAll('button').find((b) => b.text().includes('Load Progress'));
    expect(loadBtn?.attributes('disabled')).toBeDefined();

    await loadBtn?.trigger('click');
    expect(wrapper.emitted('code')).toBeUndefined();
    wrapper.unmount();
  });

  it('passes loading prop to action buttons', async () => {
    const wrapper = mount(QrScannerView, {
      props: {
        loading: true,
      },
    });

    await wrapper.find('.manual-drawer-toggle').trigger('click');
    const browseBtn = wrapper.findAll('button').find((b) => b.text().includes('Browse File'));
    expect(browseBtn?.classes()).toContain('is-loading');

    wrapper.unmount();
  });

  it('cleans up scanner on unmount', async () => {
    const wrapper = mount(QrScannerView);
    await vi.waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });
    // Wait for microtasks so media stream is stored
    await new Promise((r) => setTimeout(r, 10));
    wrapper.unmount();
    expect(mockTrack.stop).toHaveBeenCalled();
  });
});
