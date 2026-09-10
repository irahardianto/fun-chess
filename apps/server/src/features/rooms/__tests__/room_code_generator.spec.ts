import { describe, it, expect, vi } from "vitest";
import type { IIdGenerator, RoomState } from "@fun-chess/shared";
import {
  RoomCodeGenerator,
  ROOM_CODE_CHARSET,
  ROOM_CODE_LENGTH,
} from "../room_code_generator.js";
import { RoomCapacityExceededError } from "../room.errors.js";
import type { IRoomStore } from "../room.store.js";

describe("RoomCodeGenerator (MAJ-017)", () => {
  const createMockStore = (existingCodes: Set<string> = new Set()): IRoomStore => {
    return {
      findByCode: vi.fn(async (code: string) => {
        if (existingCodes.has(code)) {
          return { roomCode: code } as RoomState;
        }
        return null;
      }),
      findBySocketId: vi.fn(),
      mutate: vi.fn(),
      withLock: vi.fn(),
      save: vi.fn(),
      createIfAbsent: vi.fn(),
      delete: vi.fn(),
      listActiveRooms: vi.fn(),
      count: vi.fn(),
      clear: vi.fn(),
    };
  };

  it("generates a 4-character uppercase alphanumeric code from charset", async () => {
    const store = createMockStore();
    const generator = new RoomCodeGenerator();

    const code = await generator.generateAvailableCode(store);

    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    for (const char of code) {
      expect(ROOM_CODE_CHARSET).toContain(char);
    }
  });

  it("retries on collision until an available code is found", async () => {
    // Generate predetermined indices: first attempt produces "AAAA", second produces "BBBB"
    let callCount = 0;
    const mockIdGenerator: IIdGenerator = {
      generateId: () => "mock-id",
      generateRandomInt: () => {
        // Return 0 for first 4 calls ("AAAA"), then 1 for next 4 calls ("BBBB")
        const index = callCount < 4 ? 0 : 1;
        callCount++;
        return index;
      },
    };

    const store = createMockStore(new Set(["AAAA"]));
    const generator = new RoomCodeGenerator(mockIdGenerator);

    const code = await generator.generateAvailableCode(store);

    expect(code).toBe("BBBB");
    expect(store.findByCode).toHaveBeenCalledTimes(2);
    expect(store.findByCode).toHaveBeenNthCalledWith(1, "AAAA");
    expect(store.findByCode).toHaveBeenNthCalledWith(2, "BBBB");
  });

  it("throws RoomCapacityExceededError when maxAttempts is reached without finding available code", async () => {
    const mockIdGenerator: IIdGenerator = {
      generateId: () => "mock-id",
      generateRandomInt: () => 0, // Always generates "AAAA"
    };

    const store = createMockStore(new Set(["AAAA"]));
    const generator = new RoomCodeGenerator(mockIdGenerator);

    await expect(
      generator.generateAvailableCode(store, 5),
    ).rejects.toThrow(RoomCapacityExceededError);

    expect(store.findByCode).toHaveBeenCalledTimes(5);
  });
});
