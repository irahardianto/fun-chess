/**
 * Service for 1-click JSON backup file download and upload reading.
 * Adheres to Rule 1 (I/O Isolation) and Defensive Programming Mandates.
 */
export class ProgressFileService {
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

    try {
      const blob = new Blob([envelopeJson], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();

      // Clean up after click dispatch
      setTimeout(() => {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('[FC_PROGRESS_SYNC] Failed to initiate file download', err);
      throw new Error('Unable to download backup file');
    }
  }

  /**
   * Reads raw string content from an uploaded File or Blob object.
   *
   * @param file - File selected by user or dropped in dropzone
   * @returns Resolves to UTF-8 text content
   */
  public async readProgressFile(file: File | Blob): Promise<string> {
    if (!file) {
      throw new Error('No file provided for reading');
    }

    // Modern file.text() API if supported
    if (typeof file.text === 'function') {
      try {
        return await file.text();
      } catch (err) {
        console.warn('[FC_PROGRESS_SYNC] file.text() failed, trying FileReader fallback', err);
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
        reject(reader.error || new Error('Failed to read save file'));
      };
      reader.readAsText(file);
    });
  }
}

export const defaultProgressFileService = new ProgressFileService();
export const progressFileService = defaultProgressFileService;
