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

  it('rejects files larger than 5MB with explicit user error message', async () => {
    const oversizedFile = {
      size: 5 * 1024 * 1024 + 1024, // 5MB + 1KB
      text: vi.fn().mockResolvedValue('{"large": true}'),
    } as unknown as File;

    await expect(service.readProgressFile(oversizedFile)).rejects.toThrow(
      'File size exceeds 5MB limit'
    );
    expect(oversizedFile.text).not.toHaveBeenCalled();
  });

  it('reads file content using FileReader fallback when file.text throws', async () => {
    const mockFile = {
      size: 100,
      text: vi.fn().mockRejectedValue(new Error('text() not supported')),
    } as unknown as File;

    class MockFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      result: string | null = '{"fallback": true}';
      error: Error | null = null;
      abort = vi.fn();
      readAsText() {
        setTimeout(() => {
          this.onload?.();
        }, 10);
      }
    }

    vi.stubGlobal('FileReader', MockFileReader);

    const result = await service.readProgressFile(mockFile);
    expect(result).toBe('{"fallback": true}');
  });

  it('handles FileReader onabort event and rejects with abort error', async () => {
    const mockFile = {
      size: 100,
      text: vi.fn().mockRejectedValue(new Error('text() failed')),
    } as unknown as File;

    class MockFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      result: string | null = null;
      error: Error | null = null;
      abort = vi.fn();
      readAsText() {
        setTimeout(() => {
          this.onabort?.();
        }, 10);
      }
    }

    vi.stubGlobal('FileReader', MockFileReader);

    await expect(service.readProgressFile(mockFile)).rejects.toThrow(
      'File reading was aborted'
    );
  });

  it('handles FileReader timeout by calling abort() and rejecting', async () => {
    vi.useFakeTimers();

    const mockFile = {
      size: 100,
      // no text() method so it enters FileReader directly
    } as unknown as File;

    let aborted = false;
    class MockFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      result: string | null = null;
      error: Error | null = null;
      abort = vi.fn(() => {
        aborted = true;
      });
      readAsText = vi.fn();
    }

    vi.stubGlobal('FileReader', MockFileReader);

    const readPromise = service.readProgressFile(mockFile);
    vi.advanceTimersByTime(10000);

    await expect(readPromise).rejects.toThrow(
      'File reading timed out after 10000ms'
    );
    expect(aborted).toBe(true);
  });

  it('handles FileReader onerror and rejects with file reader error', async () => {
    const mockFile = {
      size: 100,
      text: vi.fn().mockRejectedValue(new Error('text() failed')),
    } as unknown as File;

    class MockFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      result: string | null = null;
      error = new Error('Disk read error');
      abort = vi.fn();
      readAsText() {
        setTimeout(() => {
          this.onerror?.();
        }, 10);
      }
    }

    vi.stubGlobal('FileReader', MockFileReader);

    await expect(service.readProgressFile(mockFile)).rejects.toThrow(
      'Disk read error'
    );
  });
});
