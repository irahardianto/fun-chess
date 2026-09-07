import { logger as defaultLogger, type ILogger } from '../../../platform/telemetry';

/**
 * Maximum progress backup file size (2MB).
 */
export const MAX_PROGRESS_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB limit

/**
 * Contract for progress backup file service.
 */
export interface IProgressFileService {
  downloadProgressFile(envelopeJson: string, filename?: string): void;
  readProgressFile(file: File | Blob): Promise<string>;
}

/**
 * Service for 1-click JSON backup file download and upload reading.
 * Adheres to Rule 1 (I/O Isolation) and Defensive Programming Mandates.
 */
export class ProgressFileService implements IProgressFileService {
  constructor(private readonly logger: ILogger = defaultLogger) {}

  /**
   * Triggers client-side browser download of progress JSON envelope file.
   *
   * @param envelopeJson - Formatted JSON envelope string
   * @param filename - Optional target filename (default: 'funchess-save.json')
   */
  public downloadProgressFile(
    envelopeJson: string,
    filename: string = 'funchess-save.json'
  ): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    let url: string | undefined;
    let link: HTMLAnchorElement | undefined;
    try {
      const blob = new Blob([envelopeJson], { type: 'application/json;charset=utf-8' });
      url = URL.createObjectURL(blob);
      link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
    } catch (err) {
      this.logger.error('Failed to initiate file download', {
        operation: 'progress_file_download',
        filename,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error('Unable to download backup file');
    } finally {
      if (link && link.parentNode) {
        link.parentNode.removeChild(link);
      }
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
  }

  /**
   * Reads raw string content from an uploaded File or Blob object.
   *
   * @param file - File selected by user or dropped in dropzone
   * @returns Resolves to UTF-8 text content
   * @throws Error if file exceeds 2MB limit or cannot be read
   */
  public async readProgressFile(file: File | Blob): Promise<string> {
    if (!file) {
      throw new Error('No file provided for reading');
    }

    if (file.size > MAX_PROGRESS_FILE_SIZE_BYTES) {
      throw new Error(
        `File size exceeds 2MB limit (${(file.size / (1024 * 1024)).toFixed(2)}MB uploaded). Please upload a valid Fun Chess backup file.`
      );
    }

    // Modern file.text() API if supported
    if (typeof file.text === 'function') {
      try {
        return await file.text();
      } catch (err) {
        this.logger.warn('file.text() failed, trying FileReader fallback', {
          operation: 'progress_file_read',
          fileSize: file.size,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // FileReader fallback
    return new Promise((resolve, reject) => {
      if (typeof FileReader === 'undefined') {
        reject(new Error('FileReader API is unavailable in this environment'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as text'));
        }
      };
      reader.onerror = () => {
        this.logger.error('Failed to read save file', {
          operation: 'progress_file_read',
          fileSize: file.size,
          error: reader.error ? reader.error.message : 'Unknown FileReader error',
        });
        reject(reader.error || new Error('Failed to read save file'));
      };
      reader.readAsText(file);
    });
  }
}

export const defaultProgressFileService = new ProgressFileService();
export const progressFileService = defaultProgressFileService;

