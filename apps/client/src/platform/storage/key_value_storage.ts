/**
 * Storage boundary abstraction for key-value persistence.
 * Adheres to Architectural Patterns Rule 1: I/O Isolation.
 */
export interface KeyValueStorage {
  /**
   * Retrieves an item by key. Returns null if key does not exist or storage is inaccessible.
   */
  getItem(key: string): string | null;

  /**
   * Persists a key-value pair.
   * @throws StorageQuotaExceededError or DOMException if device storage quota is exhausted
   */
  setItem(key: string, value: string): void;

  /**
   * Removes an item by key.
   */
  removeItem(key: string): void;

  /**
   * Clears all items in this storage instance.
   */
  clear(): void;

  /**
   * Returns the key at the specified index.
   */
  key(index: number): string | null;

  /**
   * Returns total number of stored entries.
   */
  readonly length: number;

  /**
   * Indicates whether the underlying storage mechanism is active and writable.
   */
  isAvailable(): boolean;

  /**
   * Safe getter that falls back to defaultValue if item is absent or storage throws.
   */
  safeGetItem<T = string>(key: string, defaultValue: T): string | T;

  /**
   * Safe setter that swallows non-fatal errors and returns success boolean.
   */
  safeSetItem(key: string, value: string): boolean;
}
