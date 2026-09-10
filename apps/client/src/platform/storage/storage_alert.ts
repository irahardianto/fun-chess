import { serializeError } from '@fun-chess/shared';
import { logger as defaultLogger, type ILogger } from '../telemetry';

/**
 * Cross-browser detection for Web Storage quota exceeded errors.
 * Covers WebKit, Blink, Gecko, and legacy Safari Private Browsing DOM exceptions.
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return (
      // Standard W3C code & name
      err.code === 22 ||
      err.name === 'QuotaExceededError' ||
      // Firefox Gecko legacy
      err.code === 1014 ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    );
  }
  // Generic error object inspection for non-standard runtimes / polyfills / mocks
  if (typeof err === 'object') {
    const errObj = err as Record<string, unknown>;
    const name = typeof errObj.name === 'string' ? errObj.name : '';
    const code = typeof errObj.code === 'number' ? errObj.code : 0;
    const message = typeof errObj.message === 'string' ? errObj.message : '';
    return (
      name === 'QuotaExceededError' ||
      name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      code === 22 ||
      code === 1014 ||
      message.includes('QuotaExceededError')
    );
  }
  return false;
}

export interface StorageQuotaAlertEvent {
  readonly type: 'STORAGE_QUOTA_EXCEEDED';
  readonly store: 'scenarios' | 'puzzles' | 'unified';
  readonly attemptedAction: 'overwrite' | 'save' | 'import';
  readonly timestamp: number;
  readonly message: string;
  readonly suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR';
}

export type StorageAlertListener = (event: StorageQuotaAlertEvent) => void;

export class StorageAlertDispatcher {
  private readonly listeners = new Set<StorageAlertListener>();

  constructor(private readonly logger: ILogger = defaultLogger) {}

  public subscribe(listener: StorageAlertListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notify(event: StorageQuotaAlertEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        this.logger.error('Error in storage alert listener', {
          operation: 'storage_alert_notify',
          error: serializeError(err),
        });
      }
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}

export const storageAlertDispatcher = new StorageAlertDispatcher();
