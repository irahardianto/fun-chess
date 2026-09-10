/**
 * Interface contract for reactive network status monitoring (MAJ-011).
 * Isolates browser host objects (navigator.onLine, window events) behind testable abstraction.
 */

export interface INetworkMonitor {
  /**
   * Returns current online status.
   */
  isOnline(): boolean;

  /**
   * Registers a listener callback triggered whenever the network transitions between online/offline.
   * @returns Cleanup teardown function.
   */
  addListener(listener: (isOnline: boolean) => void): () => void;

  /**
   * Optional manual override for mock implementations and test environments.
   */
  setOnlineStatus?(isOnline: boolean): void;
}
