import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProgressFileService } from '../progress_file.service';

describe('ProgressFileService', () => {
  let service: ProgressFileService;

  beforeEach(() => {
    service = new ProgressFileService();
  });

  it('triggers download with createObjectURL and click', () => {
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

    clickSpy.mockRestore();
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
});
