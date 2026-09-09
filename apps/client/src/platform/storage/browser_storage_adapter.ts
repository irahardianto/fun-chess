import type { KeyValueStorage } from './key_value_storage';
import { isQuotaExceededError, storageAlertDispatcher } from './storage_alert';
import { logger } from '../telemetry';

export class BrowserStorageAdapter implements KeyValueStorage {
  private available = false;
  private readonly fallback = new Map<string, string>();

  constructor(
    private readonly storageType: 'localStorage' | 'sessionStorage' = 'localStorage'
  ) {
    this.probeAvailability();
  }

  public probeAvailability(): boolean {
    if (typeof window === 'undefined') {
      this.available = false;
      return false;
    }
    try {
      const storage = window[this.storageType];
      if (!storage) {
        this.available = false;
        return false;
      }
      const probeKey = `__fc_probe_${Date.now()}__`;
      storage.setItem(probeKey, '1');
      storage.removeItem(probeKey);
      this.available = true;
      return true;
    } catch (err) {
      if (isQuotaExceededError(err)) {
        this.available = true;
        return true;
      }
      logger.debug('Browser storage availability probe failed, falling back to memory', {
        operation: 'browser_storage_probe',
        storageType: this.storageType,
        error: err instanceof Error ? err.message : String(err),
      });
      // SecurityError (Safari Private Browsing mode)
      this.available = false;
      return false;
    }
  }

  private get rawStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    if (!this.available) {
      this.probeAvailability();
    }
    if (!this.available) return null;
    try {
      return window[this.storageType];
    } catch (err) {
      logger.debug('Failed to access window storage property, falling back to memory', {
        operation: 'browser_storage_raw_access',
        storageType: this.storageType,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  public isAvailable(): boolean {
    return this.probeAvailability();
  }

  public getItem(key: string): string | null {
    const storage = this.rawStorage;
    if (!storage) {
      return this.fallback.get(key) ?? null;
    }
    try {
      return storage.getItem(key) ?? this.fallback.get(key) ?? null;
    } catch (err) {
      logger.warn('Failed to read item from browser storage, using fallback cache', {
        operation: 'browser_storage_get_item',
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      return this.fallback.get(key) ?? null;
    }
  }

  public setItem(key: string, value: string): void {
    const storage = this.rawStorage;
    if (!storage) {
      this.fallback.set(key, value);
      return;
    }
    try {
      storage.setItem(key, value);
      // Synchronize in-memory fallback
      this.fallback.set(key, value);
    } catch (err) {
      // Store in memory regardless to prevent state loss in active session
      this.fallback.set(key, value);

      if (isQuotaExceededError(err)) {
        storageAlertDispatcher.notify({
          type: 'STORAGE_QUOTA_EXCEEDED',
          store: 'unified',
          attemptedAction: 'save',
          timestamp: Date.now(),
          message: 'Storage quota exceeded. Temporary in-memory cache activated.',
          suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
        });
        throw err;
      }

      logger.warn('Failed to persist item to browser storage, using fallback cache', {
        operation: 'browser_storage_set_item',
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  public removeItem(key: string): void {
    this.fallback.delete(key);
    const storage = this.rawStorage;
    if (storage) {
      try {
        storage.removeItem(key);
      } catch (err) {
        if (isQuotaExceededError(err)) {
          storageAlertDispatcher.notify({
            type: 'STORAGE_QUOTA_EXCEEDED',
            store: 'unified',
            attemptedAction: 'save',
            timestamp: Date.now(),
            message: 'Storage quota exceeded while removing item.',
            suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
          });
        } else {
          logger.warn('Failed to remove item from browser storage', {
            operation: 'browser_storage_remove_item',
            storageType: this.storageType,
            key,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  public clear(): void {
    this.fallback.clear();
    const storage = this.rawStorage;
    if (storage) {
      try {
        storage.clear();
      } catch (err) {
        if (isQuotaExceededError(err)) {
          storageAlertDispatcher.notify({
            type: 'STORAGE_QUOTA_EXCEEDED',
            store: 'unified',
            attemptedAction: 'save',
            timestamp: Date.now(),
            message: 'Storage quota exceeded while clearing storage.',
            suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
          });
        } else {
          logger.warn('Failed to clear browser storage', {
            operation: 'browser_storage_clear',
            storageType: this.storageType,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  public key(index: number): string | null {
    const storage = this.rawStorage;
    if (storage) {
      try {
        return storage.key(index);
      } catch (err) {
        logger.debug('Failed to inspect storage key at index', {
          operation: 'storage_key',
          storageType: this.storageType,
          index,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return Array.from(this.fallback.keys())[index] ?? null;
  }

  public get length(): number {
    const storage = this.rawStorage;
    if (storage) {
      try {
        return storage.length;
      } catch (err) {
        logger.debug('Failed to inspect storage length', {
          operation: 'storage_length',
          storageType: this.storageType,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return this.fallback.size;
  }

  public safeGetItem<T = string>(key: string, defaultValue: T): string | T {
    const val = this.getItem(key);
    return val !== null ? val : defaultValue;
  }

  public safeSetItem(key: string, value: string): boolean {
    try {
      this.setItem(key, value);
      return true;
    } catch (err) {
      if (isQuotaExceededError(err)) {
        storageAlertDispatcher.notify({
          type: 'STORAGE_QUOTA_EXCEEDED',
          store: 'unified',
          attemptedAction: 'save',
          timestamp: Date.now(),
          message: 'Storage quota exceeded during safe write.',
          suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
        });
      }
      return false;
    }
  }
}
