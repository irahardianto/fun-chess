import { randomUUID, randomInt } from "node:crypto";
import { SystemClock, type IClock, type IIdGenerator } from "@fun-chess/shared";

export { SystemClock };
export type { IClock, IIdGenerator };

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
