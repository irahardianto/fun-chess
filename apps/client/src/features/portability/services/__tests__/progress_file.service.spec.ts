import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProgressFileService } from '../progress_file.service';
import { MockFileDownloader } from '@/platform/hardware';

describe('ProgressFileService', () => {
  let service: ProgressFileService;

  beforeEach(() => {
    service = new ProgressFileService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('triggers download with createObjectURL and click', () => {
    vi.useFakeTimers();
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-uuid');
    const mockRevokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, 'appendChild');

    service.downloadProgressFile('{"test": true}', 'my-save.json');

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();

    // BrowserFileDownloader revokes object URL in setTimeout(..., 1000)
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/mock-uuid');

    clickSpy.mockRestore();
  });

  it('guarantees DOM node removal and URL revocation in finally block even when click throws', () => {
    vi.useFakeTimers();
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-uuid');
    const mockRevokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('Simulated click failure');
    });
    const removeChildSpy = vi.spyOn(document.body, 'removeChild');

    expect(() => service.downloadProgressFile('{"test": true}', 'fail.json')).toThrow(
      'Unable to download backup file'
    );

    expect(removeChildSpy).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/mock-uuid');

    clickSpy.mockRestore();
  });

  it('delegates to injected IFileDownloader implementation', () => {
    const mockDownloader = new MockFileDownloader();
    const customService = new ProgressFileService(undefined, mockDownloader);

    customService.downloadProgressFile('{"data": 123}', 'backup.json');

    expect(mockDownloader.calls).toHaveLength(1);
    expect(mockDownloader.calls[0]).toEqual({
      content: '{"data": 123}',
      filename: 'backup.json',
      mimeType: 'application/json;charset=utf-8',
    });
  });

  it('reads file content using file.text()', async () => {
    const mockFile = {
      text: vi.fn().mockResolvedValue('{"magic": "FC_PROGRESS_V1"}'),
    } as unknown as File;

    const content = await service.readProgressFile(mockFile);
    expect(content).toBe('{"magic": "FC_PROGRESS_V1"}');
  });

  it('throws error when no file is passed', async () => {
    await expect(service.readProgressFile(null as unknown as File)).rejects.toThrow(
      'No file provided for reading'
    );
  });

  it('rejects files larger than 2MB with explicit user error message', async () => {
    const oversizedFile = {
      size: 2 * 1024 * 1024 + 1024, // 2MB + 1KB
      text: vi.fn().mockResolvedValue('{"large": true}'),
    } as unknown as File;

    await expect(service.readProgressFile(oversizedFile)).rejects.toThrow(
      'File size exceeds 2MB limit'
    );
    expect(oversizedFile.text).not.toHaveBeenCalled();
  });
});
