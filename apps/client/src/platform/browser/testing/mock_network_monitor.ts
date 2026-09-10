import type { INetworkMonitor } from '../network_monitor';

/**
 * Mock implementation of INetworkMonitor for deterministic unit and integration testing (MAJ-011, MAJ-015, BLK-02).
 */
export class MockNetworkMonitor implements INetworkMonitor {
  private _isOnline: boolean;
  private _listeners = new Set<(isOnline: boolean) => void>();

  constructor(initialOnline = true) {
    this._isOnline = initialOnline;
  }

  isOnline(): boolean {
    return this._isOnline;
  }

  setOnlineStatus(isOnline: boolean): void {
    this._isOnline = isOnline;
    this._listeners.forEach((cb) => cb(isOnline));
  }

  addListener(listener: (isOnline: boolean) => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  reset(): void {
    this._listeners.clear();
  }
}
