import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserStorageAdapter } from '../browser_storage_adapter';
import { InMemoryStorageAdapter } from '../in_memory_storage_adapter';
import { createSafeStorage, safeLocalStorage, safeSessionStorage } from '../index';
import { storageAlertDispatcher, isQuotaExceededError, type StorageQuotaAlertEvent } from '../storage_alert';

describe('BrowserStorageAdapter', () => {
  let mockStore: Record<string, string>;

  beforeEach(() => {
    mockStore = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockStore[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStore[key];
      }),
      clear: vi.fn(() => {
        mockStore = {};
      }),
      key: vi.fn((idx: number) => Object.keys(mockStore)[idx] ?? null),
      get length() {
        return Object.keys(mockStore).length;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normal operation: sets, gets, removes, and clears items', () => {
    const adapter = new BrowserStorageAdapter('localStorage');
    expect(adapter.isAvailable()).toBe(true);

    adapter.setItem('test-key', 'test-value');
    expect(adapter.getItem('test-key')).toBe('test-value');
    expect(adapter.length).toBe(1);
    expect(adapter.key(0)).toBe('test-key');

    adapter.removeItem('test-key');
    expect(adapter.getItem('test-key')).toBeNull();
    expect(adapter.length).toBe(0);

    adapter.setItem('k1', 'v1');
    adapter.setItem('k2', 'v2');
    expect(adapter.length).toBe(2);
    adapter.clear();
    expect(adapter.length).toBe(0);
  });

  it('safeGetItem and safeSetItem work correctly', () => {
    const adapter = new BrowserStorageAdapter('localStorage');
    expect(adapter.safeGetItem('missing', 'fallback')).toBe('fallback');

    expect(adapter.safeSetItem('foo', 'bar')).toBe(true);
    expect(adapter.safeGetItem('foo', 'fallback')).toBe('bar');
  });

  it('handles Safari Private Browsing mode SecurityError probe and falls back to in-memory Map', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      }),
      setItem: vi.fn(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    });

    const adapter = new BrowserStorageAdapter('localStorage');
    expect(adapter.isAvailable()).toBe(false);

    // In-memory fallback allows normal reads/writes without throwing
    adapter.setItem('safari-key', 'safari-value');
    expect(adapter.getItem('safari-key')).toBe('safari-value');
    expect(adapter.safeGetItem('safari-key', 'default')).toBe('safari-value');
    expect(adapter.length).toBe(1);

    adapter.removeItem('safari-key');
    expect(adapter.getItem('safari-key')).toBeNull();
  });

  it('notifies storageAlertDispatcher and rethrows on QuotaExceededError during setItem', () => {
    const adapter = new BrowserStorageAdapter('localStorage');
    expect(adapter.isAvailable()).toBe(true);

    const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw quotaError;
    });

    const listener = vi.fn();
    const unsubscribe = storageAlertDispatcher.subscribe(listener);

    try {
      expect(() => {
        adapter.setItem('big-key', 'big-value');
      }).toThrow();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining<Partial<StorageQuotaAlertEvent>>({
          type: 'STORAGE_QUOTA_EXCEEDED',
          attemptedAction: 'save',
        })
      );
    } finally {
      unsubscribe();
    }
  });

  it('safeSetItem catches QuotaExceededError, notifies dispatcher, and returns false [MAJ-039]', () => {
    const adapter = new BrowserStorageAdapter('localStorage');
    const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw quotaError;
    });

    const listener = vi.fn();
    const unsubscribe = storageAlertDispatcher.subscribe(listener);

    try {
      const result = adapter.safeSetItem('overflow-key', 'value');
      expect(result).toBe(false);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining<Partial<StorageQuotaAlertEvent>>({
          type: 'STORAGE_QUOTA_EXCEEDED',
          attemptedAction: 'save',
        })
      );
      // Value is still available via in-memory fallback
      expect(adapter.getItem('overflow-key')).toBe('value');
    } finally {
      unsubscribe();
    }
  });

  it('removeItem catches QuotaExceededError, notifies dispatcher, and does not throw [MAJ-039]', () => {
    const adapter = new BrowserStorageAdapter('localStorage');
    const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw quotaError;
    });

    const listener = vi.fn();
    const unsubscribe = storageAlertDispatcher.subscribe(listener);

    try {
      expect(() => adapter.removeItem('any-key')).not.toThrow();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining<Partial<StorageQuotaAlertEvent>>({
          type: 'STORAGE_QUOTA_EXCEEDED',
          attemptedAction: 'save',
        })
      );
    } finally {
      unsubscribe();
    }
  });

  it('clear catches QuotaExceededError, notifies dispatcher, and does not throw [MAJ-039]', () => {
    const adapter = new BrowserStorageAdapter('localStorage');
    const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
    vi.spyOn(window.localStorage, 'clear').mockImplementation(() => {
      throw quotaError;
    });

    const listener = vi.fn();
    const unsubscribe = storageAlertDispatcher.subscribe(listener);

    try {
      expect(() => adapter.clear()).not.toThrow();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining<Partial<StorageQuotaAlertEvent>>({
          type: 'STORAGE_QUOTA_EXCEEDED',
          attemptedAction: 'save',
        })
      );
    } finally {
      unsubscribe();
    }
  });
});

describe('FileReader Error Recovery Paths (MAJ-039)', () => {
  it('recovers from FileReader.onerror rejecting with descriptive error', async () => {
    class FailingFileReader {
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsText(_blob: Blob) {
        this.error = new DOMException('Read failed', 'NotReadableError');
        setTimeout(() => {
          this.onerror?.();
        }, 5);
      }
    }

    vi.stubGlobal('FileReader', FailingFileReader);

    const readAsync = (file: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error || new Error('Unknown read error'));
        reader.readAsText(file);
      });
    };

    await expect(readAsync(new Blob(['hello']))).rejects.toThrow('Read failed');
    vi.unstubAllGlobals();
  });

  it('exercises ProgressFileService FileReader.onerror fallback when file.text() fails [MAJ-039]', async () => {
    const { ProgressFileService } = await import('@/features/portability/services/progress_file.service');
    const service = new ProgressFileService();

    class MockFailingFileReader {
      error = new DOMException('File reading aborted or unreadable', 'NotReadableError');
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsText() {
        setTimeout(() => {
          this.onerror?.();
        }, 5);
      }
    }

    vi.stubGlobal('FileReader', MockFailingFileReader);

    // Mock file without text() method to trigger FileReader fallback
    const mockFile = {
      size: 512,
    } as unknown as File;

    await expect(service.readProgressFile(mockFile)).rejects.toThrow(
      'File reading aborted or unreadable'
    );

    vi.unstubAllGlobals();
  });
});

describe('InMemoryStorageAdapter', () => {
  it('stores and retrieves data purely in memory', () => {
    const mem = new InMemoryStorageAdapter();
    expect(mem.isAvailable()).toBe(true);

    mem.setItem('a', '1');
    mem.setItem('b', '2');
    expect(mem.length).toBe(2);
    expect(mem.getItem('a')).toBe('1');
    expect(mem.key(0)).toBe('a');

    expect(mem.safeGetItem('missing', 'def')).toBe('def');
    expect(mem.safeSetItem('c', '3')).toBe(true);
    expect(mem.getItem('c')).toBe('3');

    mem.removeItem('a');
    expect(mem.getItem('a')).toBeNull();

    mem.clear();
    expect(mem.length).toBe(0);
  });
});

describe('Storage Factory & Predicate', () => {
  it('creates safe storage instances and exports safe singletons', () => {
    const storage = createSafeStorage('localStorage');
    expect(storage).toBeDefined();
    expect(safeLocalStorage).toBeDefined();
    expect(safeSessionStorage).toBeDefined();
  });

  it('detects quota exceeded errors across standard and non-standard runtimes', () => {
    expect(isQuotaExceededError(new DOMException('quota', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaExceededError(new Error('Random error'))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
  });
});
