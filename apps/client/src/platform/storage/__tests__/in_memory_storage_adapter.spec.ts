import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorageAdapter } from '../in_memory_storage_adapter';

describe('InMemoryStorageAdapter (MAJ-032)', () => {
  let adapter: InMemoryStorageAdapter;

  beforeEach(() => {
    adapter = new InMemoryStorageAdapter();
  });

  describe('isAvailable', () => {
    it('always returns true for in-memory storage', () => {
      expect(adapter.isAvailable()).toBe(true);
    });
  });

  describe('getItem & setItem', () => {
    it('returns null for a key that does not exist', () => {
      expect(adapter.getItem('nonexistent-key')).toBeNull();
    });

    it('stores a string value and retrieves it by key', () => {
      adapter.setItem('greeting', 'hello world');
      expect(adapter.getItem('greeting')).toBe('hello world');
    });

    it('converts non-string values to string on setItem', () => {
      // Test coercion behavior
      adapter.setItem('numeric-key', 12345 as unknown as string);
      expect(adapter.getItem('numeric-key')).toBe('12345');

      adapter.setItem('boolean-key', true as unknown as string);
      expect(adapter.getItem('boolean-key')).toBe('true');

      adapter.setItem('object-key', { foo: 'bar' } as unknown as string);
      expect(adapter.getItem('object-key')).toBe('[object Object]');
    });

    it('allows empty string as a valid stored value without returning null', () => {
      adapter.setItem('empty-key', '');
      expect(adapter.getItem('empty-key')).toBe('');
    });

    it('overwrites existing values when the same key is set again', () => {
      adapter.setItem('counter', '1');
      expect(adapter.getItem('counter')).toBe('1');

      adapter.setItem('counter', '2');
      expect(adapter.getItem('counter')).toBe('2');
    });
  });

  describe('removeItem', () => {
    it('removes a stored key so subsequent getItem returns null', () => {
      adapter.setItem('session_token', 'token-abc-123');
      expect(adapter.getItem('session_token')).toBe('token-abc-123');

      adapter.removeItem('session_token');
      expect(adapter.getItem('session_token')).toBeNull();
    });

    it('does not throw or fail when removing a non-existent key', () => {
      expect(() => {
        adapter.removeItem('missing-key');
      }).not.toThrow();
    });
  });

  describe('clear', () => {
    it('removes all stored keys from the in-memory map', () => {
      adapter.setItem('key1', 'val1');
      adapter.setItem('key2', 'val2');
      adapter.setItem('key3', 'val3');
      expect(adapter.length).toBe(3);

      adapter.clear();

      expect(adapter.length).toBe(0);
      expect(adapter.getItem('key1')).toBeNull();
      expect(adapter.getItem('key2')).toBeNull();
      expect(adapter.getItem('key3')).toBeNull();
    });

    it('is idempotent on an already empty store', () => {
      expect(() => {
        adapter.clear();
        adapter.clear();
      }).not.toThrow();
      expect(adapter.length).toBe(0);
    });
  });

  describe('length', () => {
    it('returns 0 when store is empty', () => {
      expect(adapter.length).toBe(0);
    });

    it('returns accurate count of distinct keys as items are added and removed', () => {
      adapter.setItem('alpha', '1');
      expect(adapter.length).toBe(1);

      adapter.setItem('beta', '2');
      expect(adapter.length).toBe(2);

      // Overwrite existing key - length must remain unchanged
      adapter.setItem('alpha', 'updated');
      expect(adapter.length).toBe(2);

      adapter.removeItem('alpha');
      expect(adapter.length).toBe(1);

      adapter.removeItem('beta');
      expect(adapter.length).toBe(0);
    });
  });

  describe('key(index)', () => {
    it('returns the key name at the specified index', () => {
      adapter.setItem('k1', 'v1');
      adapter.setItem('k2', 'v2');

      expect(adapter.key(0)).toBe('k1');
      expect(adapter.key(1)).toBe('k2');
    });

    it('returns null when index is out of bounds or negative', () => {
      adapter.setItem('k1', 'v1');

      expect(adapter.key(1)).toBeNull();
      expect(adapter.key(99)).toBeNull();
      expect(adapter.key(-1)).toBeNull();
    });
  });

  describe('safeGetItem', () => {
    it('returns stored value if key exists', () => {
      adapter.setItem('theme', 'dark');
      expect(adapter.safeGetItem('theme', 'light')).toBe('dark');
    });

    it('returns provided defaultValue if key does not exist', () => {
      expect(adapter.safeGetItem('missing-pref', 'default-value')).toBe('default-value');
    });

    it('returns defaultValue of generic type (e.g. object, number, null)', () => {
      const defaultObj = { setting: true };
      expect(adapter.safeGetItem('config', defaultObj)).toBe(defaultObj);

      expect(adapter.safeGetItem('numeric_pref', 42)).toBe(42);
      expect(adapter.safeGetItem('nullable_pref', null)).toBeNull();
    });

    it('returns empty string when stored value is empty string rather than fallback', () => {
      adapter.setItem('blank', '');
      expect(adapter.safeGetItem('blank', 'fallback')).toBe('');
    });
  });

  describe('safeSetItem', () => {
    it('sets item and returns boolean true', () => {
      const result = adapter.safeSetItem('foo', 'bar');
      expect(result).toBe(true);
      expect(adapter.getItem('foo')).toBe('bar');
    });

    it('handles non-string values safely and returns true', () => {
      const result = adapter.safeSetItem('active', false as unknown as string);
      expect(result).toBe(true);
      expect(adapter.getItem('active')).toBe('false');
    });
  });

  describe('Instance Isolation', () => {
    it('maintains completely isolated state across distinct adapter instances', () => {
      const adapterA = new InMemoryStorageAdapter();
      const adapterB = new InMemoryStorageAdapter();

      adapterA.setItem('shared-key', 'value-A');
      expect(adapterA.getItem('shared-key')).toBe('value-A');
      expect(adapterB.getItem('shared-key')).toBeNull();

      adapterB.setItem('shared-key', 'value-B');
      expect(adapterA.getItem('shared-key')).toBe('value-A');
      expect(adapterB.getItem('shared-key')).toBe('value-B');

      adapterA.clear();
      expect(adapterA.length).toBe(0);
      expect(adapterB.length).toBe(1);
    });
  });
});
