/**
 * Browser haptics abstraction and test doubles.
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Finding MAJ-012.
 */

export interface IHapticsService {
  /**
   * Pulses the vibration hardware with a duration or vibration pattern.
   *
   * @param pattern - Duration in milliseconds or an array of vibration/pause durations
   * @returns boolean indicating if the vibration was successfully triggered
   */
  vibrate(pattern: number | number[]): boolean;

  /**
   * Queries if the current execution environment supports the Vibration API.
   */
  isSupported(): boolean;
}

/**
 * Production implementation backed by window.navigator.vibrate with safe error handling.
 */
export class BrowserHapticsService implements IHapticsService {
  public isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    );
  }

  public vibrate(pattern: number | number[]): boolean {
    if (!this.isSupported()) {
      return false;
    }
    try {
      return navigator.vibrate(pattern);
    } catch {
      return false;
    }
  }
}

/**
 * Test double implementation recording vibrations with configurable support.
 */
export class MockHapticsService implements IHapticsService {
  public supported: boolean;
  public readonly calls: (number | number[])[] = [];

  constructor(supported: boolean = true) {
    this.supported = supported;
  }

  public isSupported(): boolean {
    return this.supported;
  }

  public vibrate(pattern: number | number[]): boolean {
    if (!this.supported) {
      return false;
    }
    this.calls.push(pattern);
    return true;
  }

  public clear(): void {
    this.calls.length = 0;
  }
}

export const defaultHapticsService: IHapticsService = new BrowserHapticsService();
