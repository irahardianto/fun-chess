import type { KeyValueStorage } from './key_value_storage';
import { isQuotaExceededError, storageAlertDispatcher } from './storage_alert';

export class BrowserStorageAdapter implements KeyValueStorage {
  private available = false;
  private readonly fallback = new Map<string, string>();

  constructor(
    private readonly storageType: 'localStorage' | 'sessionStorage' = 'localStorage'
  ) {
    this.probeAvailability();
  }

  private probeAvailability(): void {
    if (typeof window === 'undefined') {
      this.available = false;
      return;
    }
    try {
      const storage = window[this.storageType];
      if (!storage) {
        this.available = false;
        return;
      }
      const probeKey = `__fc_probe_${Date.now()}__`;
      storage.setItem(probeKey, '1');
      storage.removeItem(probeKey);
      this.available = true;
    } catch {
      // SecurityError (Safari Private Browsing mode) or QuotaExceededError
      this.available = false;
    }
  }

  private get rawStorage(): Storage | null {
    if (!this.available || typeof window === 'undefined') return null;
    try {
      return window[this.storageType];
    } catch {
      return null;
    }
  }

  public isAvailable(): boolean {
    return this.available;
  }

  public getItem(key: string): string | null {
    const storage = this.rawStorage;
    if (!storage) {
      return this.fallback.get(key) ?? null;
    }
    try {
      return storage.getItem(key);
    } catch {
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
    }
  }

  public removeItem(key: string): void {
    this.fallback.delete(key);
    const storage = this.rawStorage;
    if (storage) {
      try {
        storage.removeItem(key);
      } catch {
        // Safe ignore
      }
    }
  }

  public clear(): void {
    this.fallback.clear();
    const storage = this.rawStorage;
    if (storage) {
      try {
        storage.clear();
      } catch {
        // Safe ignore
      }
    }
  }

  public key(index: number): string | null {
    const storage = this.rawStorage;
    if (storage) {
      try {
        return storage.key(index);
      } catch {
        // Fall back below
      }
    }
    return Array.from(this.fallback.keys())[index] ?? null;
  }

  public get length(): number {
    const storage = this.rawStorage;
    if (storage) {
      try {
        return storage.length;
      } catch {
        // Fall back below
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
    } catch {
      return false;
    }
  }
}
