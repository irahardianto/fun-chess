/**
 * Time abstraction for isolating system clock I/O.
 * Enables deterministic testing of timeouts, TTLs, and timestamps.
 */
export interface IClock {
  /** Returns the current timestamp in milliseconds since Unix epoch */
  now(): number;
}

/**
 * ID and randomness abstraction for isolating non-deterministic generation.
 */
export interface IIdGenerator {
  /** Generates a unique string identifier (e.g. UUIDv4) */
  generateId(): string;
  /** Generates a pseudo-random integer between min (inclusive) and max (exclusive) */
  generateRandomInt(min: number, max: number): number;
}
