import { randomUUID, randomInt } from "node:crypto";
import type { IClock, IIdGenerator } from "@fun-chess/shared";

export type { IClock, IIdGenerator };

/**
 * Production clock adapter using Date.now().
 */
export class SystemClock implements IClock {
  public now(): number {
    return Date.now();
  }
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
