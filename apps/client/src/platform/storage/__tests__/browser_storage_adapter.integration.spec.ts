/**
 * Integration test suite for BrowserStorageAdapter against native browser storage APIs.
 * Exercises real jsdom window.localStorage and window.sessionStorage without stubbing globals.
 * Addresses MAJ-039.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserStorageAdapter } from '../browser_storage_adapter';
import { storageAlertDispatcher, type StorageQuotaAlertEvent } from '../storage_alert';
import { logger } from '../../telemetry';

// Under Node 22+ / 26+, Node's experimental built-in globalThis.localStorage shadows JSDOM's window.localStorage.
// Wire window.localStorage to JSDOM's real native Storage instance without using vi.stubGlobal mocks.
if (
  !window.localStorage &&
  (window as unknown as { jsdom?: { window: { localStorage: Storage } } }).jsdom?.window?.localStorage
) {
  Object.defineProperty(window, 'localStorage', {
    value: (window as unknown as { jsdom: { window: { localStorage: Storage } } }).jsdom.window
      .localStorage,
    configurable: true,
    writable: true,
  });
}

describe('BrowserStorageAdapter Integration (Native Storage Infrastructure)', () => {
  beforeEach(() => {
    window.localStorage?.clear();
    window.sessionStorage?.clear();
    storageAlertDispatcher.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage?.clear();
    window.sessionStorage?.clear();
    storageAlertDispatcher.clear();
    vi.restoreAllMocks();
  });

  describe('Normal Native Storage Operations', () => {
    it('should persist, retrieve, and delete items when using native localStorage', () => {
      // Arrange
      const adapter = new BrowserStorageAdapter('localStorage');
      expect(adapter.isAvailable()).toBe(true);

      // Act & Assert
      adapter.setItem('fc_user_theme', 'dark');
      expect(adapter.getItem('fc_user_theme')).toBe('dark');
      expect(window.localStorage.getItem('fc_user_theme')).toBe('dark');
      expect(adapter.length).toBe(1);
      expect(adapter.key(0)).toBe('fc_user_theme');

      adapter.removeItem('fc_user_theme');
      expect(adapter.getItem('fc_user_theme')).toBeNull();
      expect(window.localStorage.getItem('fc_user_theme')).toBeNull();
      expect(adapter.length).toBe(0);
    });

    it('should persist, retrieve, and delete items when using native sessionStorage', () => {
      // Arrange
      const adapter = new BrowserStorageAdapter('sessionStorage');
      expect(adapter.isAvailable()).toBe(true);

      // Act & Assert
      adapter.setItem('fc_session_token', 'token-12345');
      expect(adapter.getItem('fc_session_token')).toBe('token-12345');
      expect(window.sessionStorage.getItem('fc_session_token')).toBe('token-12345');
      expect(adapter.length).toBe(1);
      expect(adapter.key(0)).toBe('fc_session_token');

      adapter.removeItem('fc_session_token');
      expect(adapter.getItem('fc_session_token')).toBeNull();
      expect(window.sessionStorage.getItem('fc_session_token')).toBeNull();
      expect(adapter.length).toBe(0);
    });

    it('should clear all entries from native storage when clear is invoked', () => {
      // Arrange
      const adapter = new BrowserStorageAdapter('localStorage');
      adapter.setItem('k1', 'v1');
      adapter.setItem('k2', 'v2');
      adapter.setItem('k3', 'v3');
      expect(adapter.length).toBe(3);
      expect(window.localStorage.length).toBe(3);

      // Act
      adapter.clear();

      // Assert
      expect(adapter.length).toBe(0);
      expect(window.localStorage.length).toBe(0);
      expect(adapter.getItem('k1')).toBeNull();
      expect(adapter.key(0)).toBeNull();
    });

    it('should return fallback default value when key does not exist via safeGetItem', () => {
      // Arrange
      const adapter = new BrowserStorageAdapter('localStorage');

      // Act
      const result = adapter.safeGetItem('non_existent_key', 'default_val');

      // Assert
      expect(result).toBe('default_val');
    });

    it('should return true and store value when safeSetItem succeeds on native storage', () => {
      // Arrange
      const adapter = new BrowserStorageAdapter('localStorage');

      // Act
      const success = adapter.safeSetItem('safe_key', 'safe_value');

      // Assert
      expect(success).toBe(true);
      expect(adapter.getItem('safe_key')).toBe('safe_value');
      expect(window.localStorage.getItem('safe_key')).toBe('safe_value');
    });
  });

  describe('Boundary Quotas and QuotaExceededError Handling', () => {
    it('should notify storageAlertDispatcher and rethrow error when Storage.prototype.setItem triggers quota error', () => {
      // Arrange
      const adapter = new BrowserStorageAdapter('localStorage');
      const quotaError = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw quotaError;
      });
      const alertListener = vi.fn();
      const unsubscribe = storageAlertDispatcher.subscribe(alertListener);

      // Act & Assert
      try {
        expect(() => {
          adapter.setItem('overflow_key', 'large_payload');
        }).toThrow(quotaError);

        expect(alertListener).toHaveBeenCalledTimes(1);
        expect(alertListener).toHaveBeenCalledWith(
          expect.objectContaining<Partial<StorageQuotaAlertEvent>>({
            type: 'STORAGE_QUOTA_EXCEEDED',
            store: 'unified',
            attemptedAction: 'save',
            suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
          })
        );
        // Value is retained in in-memory fallback even when native write throws quota error
        expect(adapter.getItem('overflow_key')).toBe('large_payload');
      } finally {
        unsubscribe();
        setItemSpy.mockRestore();
      }
    });

    it('should catch quota error, notify dispatcher, and return false when safeSetItem encounters quota limit', () => {
      // Arrange
      const adapter = new BrowserStorageAdapter('localStorage');
      const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw quotaError;
      });
      const alertListener = vi.fn();
      const unsubscribe = storageAlertDispatcher.subscribe(alertListener);

      // Act
      let success: boolean;
      try {
        success = adapter.safeSetItem('quota_key', 'quota_value');
      } finally {
        setItemSpy.mockRestore();
      }

      // Assert
      expect(success).toBe(false);
      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining<Partial<StorageQuotaAlertEvent>>({
          type: 'STORAGE_QUOTA_EXCEEDED',
          attemptedAction: 'save',
        })
      );
      // Value should still be retrievable from in-memory fallback
      expect(adapter.getItem('quota_key')).toBe('quota_value');
      unsubscribe();
    });

    it('should notify dispatcher and not throw when Storage.prototype.removeItem encounters quota error', () => {
      // Arrange
      const adapter = new BrowserStorageAdapter('localStorage');
      const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw quotaError;
      });
      const alertListener = vi.fn();
      const unsubscribe = storageAlertDispatcher.subscribe(alertListener);

      // Act & Assert
      try {
        expect(() => adapter.removeItem('any_key')).not.toThrow();
        expect(alertListener).toHaveBeenCalledWith(
          expect.objectContaining<Partial<StorageQuotaAlertEvent>>({
            type: 'STORAGE_QUOTA_EXCEEDED',
            attemptedAction: 'save',
            message: 'Storage quota exceeded while removing item.',
          })
        );
      } finally {
        unsubscribe();
        removeItemSpy.mockRestore();
      }
    });

    it('should notify dispatcher and not throw when Storage.prototype.clear encounters quota error', () => {
      // Arrange
      const adapter = new BrowserStorageAdapter('localStorage');
      const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
      const clearSpy = vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {
        throw quotaError;
      });
      const alertListener = vi.fn();
      const unsubscribe = storageAlertDispatcher.subscribe(alertListener);

      // Act & Assert
      try {
        expect(() => adapter.clear()).not.toThrow();
        expect(alertListener).toHaveBeenCalledWith(
          expect.objectContaining<Partial<StorageQuotaAlertEvent>>({
            type: 'STORAGE_QUOTA_EXCEEDED',
            attemptedAction: 'save',
            message: 'Storage quota exceeded while clearing storage.',
          })
        );
      } finally {
        unsubscribe();
        clearSpy.mockRestore();
      }
    });
  });

  describe('Non-Quota Native Storage Exceptions & In-Memory Fallback', () => {
    it('should store in in-memory fallback and log warning without throwing when Storage.prototype.setItem throws non-quota error', () => {
      // Arrange
      const adapter = new BrowserStorageAdapter('localStorage');
      const nonQuotaError = new Error('Simulated disk I/O failure');
      const warnSpy = vi.spyOn(logger, 'warn');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw nonQuotaError;
      });

      // Act & Assert
      try {
        expect(() => {
          adapter.setItem('non_quota_key', 'fallback_value');
        }).not.toThrow();

        // Data preserved in in-memory cache
        expect(adapter.getItem('non_quota_key')).toBe('fallback_value');
        expect(warnSpy).toHaveBeenCalledWith(
          'Failed to persist item to browser storage, using fallback cache',
          expect.objectContaining({
            operation: 'browser_storage_set_item',
            key: 'non_quota_key',
            error: 'Simulated disk I/O failure',
          })
        );
      } finally {
        setItemSpy.mockRestore();
      }
    });

    it('should fall back to in-memory cache when Storage.prototype.getItem throws unexpected error', () => {
      // Arrange
      const adapter = new BrowserStorageAdapter('localStorage');
      // Prepopulate via fallback
      const nonQuotaError = new Error('Native read error');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw nonQuotaError;
      });
      adapter.setItem('cached_item', 'cached_content');
      setItemSpy.mockRestore();

      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Corrupted storage entry');
      });

      // Act & Assert
      try {
        const value = adapter.getItem('cached_item');
        expect(value).toBe('cached_content');
      } finally {
        getItemSpy.mockRestore();
      }
    });
  });

  describe('Storage Isolation Between Local and Session Adapters', () => {
    it('should keep localStorage and sessionStorage completely isolated when using separate adapters', () => {
      // Arrange
      const localAdapter = new BrowserStorageAdapter('localStorage');
      const sessionAdapter = new BrowserStorageAdapter('sessionStorage');
      const sharedKey = 'shared_setting_key';

      // Act
      localAdapter.setItem(sharedKey, 'value_for_local');
      sessionAdapter.setItem(sharedKey, 'value_for_session');

      // Assert
      expect(localAdapter.getItem(sharedKey)).toBe('value_for_local');
      expect(sessionAdapter.getItem(sharedKey)).toBe('value_for_session');

      expect(window.localStorage.getItem(sharedKey)).toBe('value_for_local');
      expect(window.sessionStorage.getItem(sharedKey)).toBe('value_for_session');

      // Clearing local storage should not affect session storage
      localAdapter.clear();
      expect(localAdapter.getItem(sharedKey)).toBeNull();
      expect(window.localStorage.getItem(sharedKey)).toBeNull();
      expect(sessionAdapter.getItem(sharedKey)).toBe('value_for_session');
      expect(window.sessionStorage.getItem(sharedKey)).toBe('value_for_session');

      // Clearing session storage removes session data
      sessionAdapter.clear();
      expect(sessionAdapter.getItem(sharedKey)).toBeNull();
      expect(window.sessionStorage.getItem(sharedKey)).toBeNull();
    });

    it('should maintain independent keys and lengths across local and session adapters', () => {
      // Arrange
      const localAdapter = new BrowserStorageAdapter('localStorage');
      const sessionAdapter = new BrowserStorageAdapter('sessionStorage');

      // Act
      localAdapter.setItem('local_1', 'val1');
      localAdapter.setItem('local_2', 'val2');

      sessionAdapter.setItem('sess_1', 'valA');

      // Assert
      expect(localAdapter.length).toBe(2);
      expect(sessionAdapter.length).toBe(1);
      expect(localAdapter.key(0)).toBe('local_1');
      expect(sessionAdapter.key(0)).toBe('sess_1');

      localAdapter.removeItem('local_1');
      expect(localAdapter.length).toBe(1);
      expect(sessionAdapter.length).toBe(1);
    });
  });
});
