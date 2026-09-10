import type { IIdGenerator } from "@fun-chess/shared";
import type { IRoomStore } from "./room.store.js";
import { MAX_ROOMS } from "./room.store.js";
import { RoomCapacityExceededError } from "./room.errors.js";
import { UuidGenerator } from "../../platform/time/index.js";

export const ROOM_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 4;
export const DEFAULT_MAX_ATTEMPTS = 100;

/**
 * Interface contract for generating collision-free room codes (MAJ-017).
 */
export interface IRoomCodeGenerator {
  /**
   * Generates a 4-character uppercase alphanumeric room code available in the provided store.
   *
   * @param store - Room persistence store to check code availability against
   * @param maxAttempts - Maximum collision retry attempts before throwing capacity error
   * @returns An available 4-character room code
   * @throws RoomCapacityExceededError if available code cannot be found within maxAttempts
   */
  generateAvailableCode(store: IRoomStore, maxAttempts?: number): Promise<string>;

  /**
   * Generates a candidate 4-character room code.
   */
  generateCandidate(): string;
}

/**
 * Pure generator of 4-character uppercase alphanumeric room codes
 * using IIdGenerator and collision retry loops against IRoomStore (MAJ-017).
 */
export class RoomCodeGenerator implements IRoomCodeGenerator {
  constructor(private readonly idGenerator: IIdGenerator = new UuidGenerator()) {}

  public async generateAvailableCode(
    store: IRoomStore,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  ): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = this.generateCandidate();
      const existing = await store.findByCode(candidate);
      if (!existing) {
        return candidate;
      }
    }

    throw new RoomCapacityExceededError(MAX_ROOMS);
  }

  public generateCandidate(): string {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const idx = this.idGenerator.generateRandomInt(
        0,
        ROOM_CODE_CHARSET.length,
      );
      code += ROOM_CODE_CHARSET.charAt(idx);
    }
    return code;
  }
}
