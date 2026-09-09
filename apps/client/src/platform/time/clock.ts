import type { IClock } from '@fun-chess/shared';

export type { IClock };

/**
 * Production clock adapter using Date.now().
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) per MAJ-012.
 */
export class SystemClock implements IClock {
  public now(): number {
    return Date.now();
  }
}
