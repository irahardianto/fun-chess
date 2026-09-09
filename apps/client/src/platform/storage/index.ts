import type { KeyValueStorage } from './key_value_storage';
import { BrowserStorageAdapter } from './browser_storage_adapter';
import { InMemoryStorageAdapter } from './in_memory_storage_adapter';

export * from './key_value_storage';
export * from './browser_storage_adapter';
export * from './in_memory_storage_adapter';
export * from './storage_alert';
export * from './storage_keys';
export * from './keys';
export * from './migration';

import type { IClock } from '@fun-chess/shared';

/**
 * Creates a safe KeyValueStorage instance.
 * Automatically falls back to in-memory storage in SSR or if browser storage throws.
 */
export function createSafeStorage(
  type: 'localStorage' | 'sessionStorage' = 'localStorage',
  clock?: IClock
): KeyValueStorage {
  if (typeof window === 'undefined') {
    return new InMemoryStorageAdapter();
  }
  return new BrowserStorageAdapter(type, clock);
}

export const safeLocalStorage = createSafeStorage('localStorage');
export const safeSessionStorage = createSafeStorage('sessionStorage');
