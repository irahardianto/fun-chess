import { randomUUID, randomInt } from "node:crypto";

/**
 * Clock abstraction for time retrieval (I/O isolation).
 */
export interface IClock {
  /** Returns the current timestamp in milliseconds since Unix epoch */
  now(): number;
}

/**
 * Production clock adapter using Date.now().
 */
export class SystemClock implements IClock {
  public now(): number {
    return Date.now();
  }
}

/**
 * ID and randomness generator abstraction (I/O isolation).
 */
export interface IIdGenerator {
  /** Generates a unique string identifier (e.g. UUIDv4) */
  generateId(): string;
  /** Generates a pseudo-random integer between min (inclusive) and max (exclusive) */
  generateRandomInt?(min: number, max: number): number;
}

/**
 * Production ID generator adapter using node:crypto.
 */
export class UuidGenerator implements IIdGenerator {
  public generateId(): string {
    return randomUUID();
  }

  public generateRandomInt(min: number, max: number): number {
    return randomInt(min, max);
  }
}
