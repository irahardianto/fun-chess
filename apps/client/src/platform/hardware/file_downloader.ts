/**
 * Browser file download abstraction and test doubles.
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Finding MAJ-012.
 */

export interface IFileDownloader {
  /**
   * Triggers a browser file download of the given text or binary content.
   *
   * @param content - File data as a string or binary Blob
   * @param filename - Target file name presented to the user
   * @param mimeType - Optional MIME type override (defaults to 'application/octet-stream')
   */
  download(content: string | Blob, filename: string, mimeType?: string): void;
}

/**
 * Production implementation using a hidden DOM anchor and Blob object URL.
 */
export class BrowserFileDownloader implements IFileDownloader {
  public download(
    content: string | Blob,
    filename: string,
    mimeType: string = 'application/octet-stream'
  ): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    let url: string | undefined;
    let link: HTMLAnchorElement | undefined;

    try {
      const blob =
        content instanceof Blob
          ? content
          : new Blob([content], { type: mimeType });
      url = URL.createObjectURL(blob);
      link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
    } finally {
      if (link && link.parentNode) {
        link.parentNode.removeChild(link);
      }
      if (url) {
        setTimeout(() => {
          URL.revokeObjectURL(url!);
        }, 1000);
      }
    }
  }
}

export interface DownloadCallRecord {
  content: string | Blob;
  filename: string;
  mimeType?: string;
}

/**
 * Test double implementation recording download invocations for verification.
 */
export class MockFileDownloader implements IFileDownloader {
  public readonly calls: DownloadCallRecord[] = [];

  public download(
    content: string | Blob,
    filename: string,
    mimeType?: string
  ): void {
    this.calls.push({ content, filename, mimeType });
  }

  public clear(): void {
    this.calls.length = 0;
  }
}

export const defaultFileDownloader: IFileDownloader = new BrowserFileDownloader();
