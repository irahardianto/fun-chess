import type { KeyValueStorage } from './key_value_storage';

export class InMemoryStorageAdapter implements KeyValueStorage {
  private readonly store = new Map<string, string>();

  public isAvailable(): boolean {
    return true;
  }

  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }

  public key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  public get length(): number {
    return this.store.size;
  }

  public safeGetItem<T = string>(key: string, defaultValue: T): string | T {
    const val = this.getItem(key);
    return val !== null ? val : defaultValue;
  }

  public safeSetItem(key: string, value: string): boolean {
    this.setItem(key, value);
    return true;
  }
}
