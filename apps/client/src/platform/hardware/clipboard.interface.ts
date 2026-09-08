/**
 * Clipboard hardware abstraction and test doubles.
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Finding MAJ-015.
 */

import { logger as defaultLogger, type ILogger } from '@/platform/telemetry';

export interface IClipboardService {
  /**
   * Copies text string to system clipboard.
   * Returns true on success, false on rejection.
   */
  copyText(text: string): Promise<boolean>;

  /**
   * Reads current plain text content from clipboard.
   */
  readText(): Promise<string>;

  /**
   * Checks if clipboard write is supported in the current browser context.
   */
  isSupported(): boolean;
}

/**
 * Production implementation using navigator.clipboard with legacy document.execCommand fallback.
 */
export class BrowserClipboardService implements IClipboardService {
  constructor(private readonly logger: ILogger = defaultLogger) {}

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    if (
      typeof navigator !== 'undefined' &&
      !!navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      return true;
    }
    return typeof document !== 'undefined' && typeof document.execCommand === 'function';
  }

  public async copyText(text: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // 1. Try modern navigator.clipboard.writeText API
    if (
      typeof navigator !== 'undefined' &&
      !!navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        this.logger.debug('Modern navigator.clipboard.writeText failed, falling back to legacy execCommand', {
          operation: 'clipboard_write_text',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. Legacy fallback using temporary textarea and document.execCommand('copy')
    if (typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, text.length);

        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        return successful;
      } catch (err) {
        this.logger.warn('Legacy document.execCommand copy failed', {
          operation: 'clipboard_exec_command',
          error: err instanceof Error ? err.message : String(err),
        });
        return false;
      }
    }

    return false;
  }

  public async readText(): Promise<string> {
    if (
      typeof navigator !== 'undefined' &&
      !!navigator.clipboard &&
      typeof navigator.clipboard.readText === 'function'
    ) {
      try {
        return await navigator.clipboard.readText();
      } catch (err) {
        this.logger.warn('navigator.clipboard.readText failed', {
          operation: 'clipboard_read_text',
          error: err instanceof Error ? err.message : String(err),
        });
        return '';
      }
    }
    return '';
  }
}

/**
 * Test double implementation recording clipboard operations in memory.
 */
export class MockClipboardService implements IClipboardService {
  public text: string;
  public supported: boolean;
  public readonly history: string[] = [];

  constructor(initialText: string = '', supported: boolean = true) {
    this.text = initialText;
    this.supported = supported;
  }

  public isSupported(): boolean {
    return this.supported;
  }

  public async copyText(text: string): Promise<boolean> {
    if (!this.supported) {
      return false;
    }
    this.text = text;
    this.history.push(text);
    return true;
  }

  public async readText(): Promise<string> {
    if (!this.supported) {
      return '';
    }
    return this.text;
  }

  public clear(): void {
    this.text = '';
    this.history.length = 0;
  }
}

export const defaultClipboardService: IClipboardService = new BrowserClipboardService();
