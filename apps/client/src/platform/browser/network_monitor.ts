import type { INetworkMonitor } from '../hardware/network_monitor.interface';

export type { INetworkMonitor };

/**
 * Production implementation of INetworkMonitor using browser window and navigator APIs.
 * Includes defensive SSR and non-browser guards (MAJ-011, MAJ-015).
 */
export class BrowserNetworkMonitor implements INetworkMonitor {
  private _listeners = new Set<(isOnline: boolean) => void>();
  private _initialized = false;

  private _onOnline = () => {
    this._listeners.forEach((cb) => cb(true));
  };

  private _onOffline = () => {
    this._listeners.forEach((cb) => cb(false));
  };

  isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  addListener(listener: (isOnline: boolean) => void): () => void {
    this._listeners.add(listener);
    if (typeof window !== 'undefined' && !this._initialized) {
      window.addEventListener('online', this._onOnline);
      window.addEventListener('offline', this._onOffline);
      this._initialized = true;
    }
    return () => {
      this._listeners.delete(listener);
      if (this._listeners.size === 0 && typeof window !== 'undefined' && this._initialized) {
        window.removeEventListener('online', this._onOnline);
        window.removeEventListener('offline', this._onOffline);
        this._initialized = false;
      }
    };
  }

  reset(): void {
    if (typeof window !== 'undefined' && this._initialized) {
      window.removeEventListener('online', this._onOnline);
      window.removeEventListener('offline', this._onOffline);
    }
    this._listeners.clear();
    this._initialized = false;
  }
}
