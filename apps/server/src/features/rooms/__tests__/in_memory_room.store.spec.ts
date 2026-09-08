import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InMemoryRoomStore } from "../in_memory_room.store.js";
import { RoomState } from "@fun-chess/shared";
import {
  RoomNotFoundError,
  OptimisticLockConflictError,
  LockTimeoutError,
  LockExecutionTimeoutError,
} from "../room.errors.js";

describe("InMemoryRoomStore", () => {
  let store: InMemoryRoomStore;

  const createDummyRoom = (roomCode: string, version = 1): RoomState => ({
    roomCode,
    version,
    status: "lobby",
    hostId: "host_1",
    whitePlayer: {
      id: "p_white",
      socketId: "sock_white",
      name: "Player White",
      color: "w",
      isHost: true,
      isConnected: true,
      connectedAt: Date.now(),
    },
    blackPlayer: {
      id: "p_black",
      socketId: "sock_black",
      name: "Player Black",
      color: "b",
      isHost: false,
      isConnected: true,
      connectedAt: Date.now(),
    },
    spectators: [
      {
        id: "p_spec",
        socketId: "sock_spec",
        name: "Spectator",
        color: "w",
        isHost: false,
        isConnected: true,
        connectedAt: Date.now(),
      },
    ],
    game: {
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      turn: "w",
      isCheck: false,
      isCheckmate: false,
      isDraw: false,
      isStalemate: false,
      isThreefoldRepetition: false,
      isInsufficientMaterial: false,
      isFiftyMoveRule: false,
      moveHistory: [],
      capturedWhite: [],
      capturedBlack: [],
      materialAdvantage: { white: 0, black: 0 },
      lastMove: null,
      moveCount: 0,
    },
    rematch: null,
    drawOffer: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  });

  beforeEach(() => {
    store = new InMemoryRoomStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Base CRUD and Lookup Operations", () => {
    it("saves and finds a room by case-insensitive room code", async () => {
      const room = createDummyRoom("star");
      await store.save(room);

      const foundLower = await store.findByCode("star");
      const foundUpper = await store.findByCode("STAR");

      expect(foundLower).not.toBeNull();
      expect(foundLower?.roomCode).toBe("star");
      expect(foundUpper).not.toBeNull();
      expect(foundUpper?.roomCode).toBe("star");
    });

    it("returns null when room code is not found", async () => {
      const found = await store.findByCode("NONE");
      expect(found).toBeNull();
    });

    it("finds room by socketId for white player, black player, and spectator", async () => {
      const room = createDummyRoom("MOON");
      await store.save(room);

      const whiteMatch = await store.findBySocketId("sock_white");
      expect(whiteMatch).not.toBeNull();
      expect(whiteMatch?.playerId).toBe("p_white");

      const blackMatch = await store.findBySocketId("sock_black");
      expect(blackMatch).not.toBeNull();
      expect(blackMatch?.playerId).toBe("p_black");

      const specMatch = await store.findBySocketId("sock_spec");
      expect(specMatch).not.toBeNull();
      expect(specMatch?.playerId).toBe("p_spec");

      const noMatch = await store.findBySocketId("sock_unknown");
      expect(noMatch).toBeNull();
    });

    it("deletes room by code and cleans up lock queue", async () => {
      const room = createDummyRoom("SUNN");
      await store.save(room);
      expect(await store.count()).toBe(1);

      const deleted = await store.delete("sunn");
      expect(deleted).toBe(true);
      expect(await store.count()).toBe(0);
      expect(await store.findByCode("SUNN")).toBeNull();
    });

    it("lists all active rooms", async () => {
      await store.save(createDummyRoom("R001"));
      await store.save(createDummyRoom("R002"));
      await store.save(createDummyRoom("R003"));

      const list = await store.listActiveRooms();
      expect(list).toHaveLength(3);
      expect(await store.count()).toBe(3);
    });

    it("guarantees deep immutability so external mutations do not contaminate store", async () => {
      const room = createDummyRoom("SAFE");
      await store.save(room);

      const fetched = await store.findByCode("SAFE");
      if (fetched && fetched.whitePlayer) {
        fetched.whitePlayer.name = "HACKED_NAME";
      }

      const reFetched = await store.findByCode("SAFE");
      expect(reFetched?.whitePlayer?.name).toBe("Player White");
    });
  });

  describe("Version Tracking and CAS Validation", () => {
    it("initializes room version to 1 if not set, and increments version on save", async () => {
      const room = createDummyRoom("VERS");
      await store.save(room);

      const saved = await store.findByCode("VERS");
      expect(saved?.version).toBe(1);

      // Save again
      await store.save(saved!);
      const saved2 = await store.findByCode("VERS");
      expect(saved2?.version).toBe(2);
    });

    it("succeeds when expectedVersion matches actual stored version", async () => {
      const room = createDummyRoom("MATCH");
      await store.save(room); // version becomes 1

      const current = (await store.findByCode("MATCH"))!;
      expect(current.version).toBe(1);

      await store.save(current, 1);
      const updated = (await store.findByCode("MATCH"))!;
      expect(updated.version).toBe(2);
    });

    it("throws OptimisticLockConflictError when expectedVersion does not match", async () => {
      const room = createDummyRoom("CONF");
      await store.save(room); // version becomes 1

      const current = (await store.findByCode("CONF"))!;
      expect(current.version).toBe(1);

      await expect(store.save(current, 99)).rejects.toThrow(
        OptimisticLockConflictError,
      );
    });
  });

  describe("withLock", () => {
    it("serializes concurrent executions on the same room code sequentially", async () => {
      const order: number[] = [];
      const code = "LOCK";

      const p1 = store.withLock(code, async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        order.push(1);
        return "p1";
      });

      const p2 = store.withLock(code, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(2);
        return "p2";
      });

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1).toBe("p1");
      expect(res2).toBe("p2");
      expect(order).toEqual([1, 2]); // p1 must finish before p2 starts despite p2 having shorter timeout
    });

    it("allows independent rooms to execute concurrently without blocking", async () => {
      const completed: string[] = [];

      const p1 = store.withLock("ROOMA", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        completed.push("A");
      });

      const p2 = store.withLock("ROOMB", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        completed.push("B");
      });

      await Promise.all([p1, p2]);
      expect(completed).toEqual(["B", "A"]); // ROOMB finished earlier without waiting for ROOMA
    });

    it("cleans up lock queue after operations complete (eviction when waitersCount <= 0)", async () => {
      const code = "EVIC";
      await store.withLock(code, async () => {
        expect((store as any).lockQueues.has(code)).toBe(true);
      });

      expect((store as any).lockQueues.has(code)).toBe(false);
      expect((store as any).lockQueues.size).toBe(0);
    });

    it("throws LockTimeoutError when waiting for lock exceeds LOCK_TIMEOUT_MS", async () => {
      const code = "TMOT";
      // Temporarily override LOCK_TIMEOUT_MS for fast test execution
      (store as any).LOCK_TIMEOUT_MS = 30;

      let blockerResolve!: () => void;
      const blockerPromise = new Promise<void>((resolve) => {
        blockerResolve = resolve;
      });

      // Start lock holder
      const holder = store.withLock(code, async () => {
        await blockerPromise;
      });

      // Attempt to acquire while held
      const waiter = store.withLock(code, async () => "never");

      await expect(waiter).rejects.toThrow(LockTimeoutError);

      blockerResolve();
      await holder;
    });

    it("preserves mutual exclusion when an intermediate waiter times out (CRIT-002)", async () => {
      const code = "CRIT";
      (store as any).LOCK_TIMEOUT_MS = 30;

      let holderFinished = false;
      let holderResolve!: () => void;
      const holderBlocker = new Promise<void>((resolve) => {
        holderResolve = resolve;
      });

      // 1. Holder acquires lock and holds it
      const holder = store.withLock(code, async () => {
        await holderBlocker;
        holderFinished = true;
        return "holder_done";
      });

      // 2. Waiter 1 is enqueued and will time out in 30ms
      const waiter1 = store.withLock(code, async () => "waiter1_done");

      // Waiter 1 must reject with LockTimeoutError
      await expect(waiter1).rejects.toThrow(LockTimeoutError);

      // Verify that holder is STILL running and holder has NOT finished
      expect(holderFinished).toBe(false);
      // Verify that the queue is NOT prematurely deleted from lockQueues
      expect((store as any).lockQueues.has(code)).toBe(true);

      // 3. Waiter 2 is queued behind waiter 1 (with plenty of time)
      (store as any).LOCK_TIMEOUT_MS = 5000;
      let waiter2Started = false;
      const waiter2 = store.withLock(code, async () => {
        // When waiter 2 runs, holder MUST be finished
        expect(holderFinished).toBe(true);
        waiter2Started = true;
        return "waiter2_done";
      });

      // Allow a few ticks: waiter 2 should STILL be waiting because holder hasn't finished
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(waiter2Started).toBe(false);

      // Now release holder
      holderResolve();
      const holderResult = await holder;
      expect(holderResult).toBe("holder_done");

      // Waiter 2 can now complete
      const waiter2Result = await waiter2;
      expect(waiter2Result).toBe("waiter2_done");
      expect(waiter2Started).toBe(true);

      // After all complete, lock queue is cleaned up
      expect((store as any).lockQueues.has(code)).toBe(false);
    });

    it("throws LockExecutionTimeoutError when action execution exceeds EXECUTION_TIMEOUT_MS (MAJ-005)", async () => {
      const code = "EXECTMO";
      (store as any).EXECUTION_TIMEOUT_MS = 30;

      const hangingAction = store.withLock(code, async () => {
        // Hang indefinitely
        await new Promise(() => {});
      });

      await expect(hangingAction).rejects.toThrow(LockExecutionTimeoutError);

      // Verify lock was released immediately: next waiter can acquire
      (store as any).EXECUTION_TIMEOUT_MS = 5000;
      const nextAction = await store.withLock(code, async () => "unblocked");
      expect(nextAction).toBe("unblocked");
    });
  });

  describe("mutate", () => {
    it("atomically mutates room, increments version, updates lastActivityAt, and returns result", async () => {
      const room = createDummyRoom("MUTA");
      await store.save(room);

      const beforeTime = Date.now();
      const result = await store.mutate("muta", (current) => {
        current.status = "playing";
        return { updatedRoom: current, result: { custom: "ok" } };
      });

      expect(result).toEqual({ custom: "ok" });

      const mutated = (await store.findByCode("MUTA"))!;
      expect(mutated.status).toBe("playing");
      expect(mutated.version).toBe(2);
      expect(mutated.lastActivityAt).toBeGreaterThanOrEqual(beforeTime);
    });

    it("throws RoomNotFoundError when attempting to mutate non-existent room", async () => {
      await expect(
        store.mutate("NONO", (current) => ({
          updatedRoom: current,
          result: null,
        })),
      ).rejects.toThrow(RoomNotFoundError);
    });

    it("throws Error if mutator alters the roomCode", async () => {
      const room = createDummyRoom("CODE");
      await store.save(room);

      await expect(
        store.mutate("CODE", (current) => {
          return {
            updatedRoom: { ...current, roomCode: "DIFF" },
            result: null,
          };
        }),
      ).rejects.toThrow(/Mutation cannot alter roomCode/);
    });

    it("serializes multiple concurrent mutations on the same room without lost updates", async () => {
      const room = createDummyRoom("RACE");
      await store.save(room);

      const mutations = Array.from({ length: 10 }, (_, i) =>
        store.mutate("RACE", (current) => {
          current.game.moveCount += 1;
          return { updatedRoom: current, result: i };
        }),
      );

      await Promise.all(mutations);

      const finalRoom = (await store.findByCode("RACE"))!;
      expect(finalRoom.game.moveCount).toBe(10);
      expect(finalRoom.version).toBe(11); // Initial (1) + 10 mutations = 11
    });

    it("retains lock queue during delete when waiters are queued (MAJ-024)", async () => {
      const room = createDummyRoom("HOLD");
      await store.save(room);

      let slowMutationStarted = false;
      let slowMutationFinished = false;
      let secondWaiterExecuted = false;

      // First action holds the lock
      const action1 = store.withLock("HOLD", async () => {
        slowMutationStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 60));
        slowMutationFinished = true;
        return "action1";
      });

      // Wait until action1 has acquired the lock
      while (!slowMutationStarted) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      // Second action is queued while action1 is running
      const action2 = store.withLock("HOLD", async () => {
        expect(slowMutationFinished).toBe(true);
        secondWaiterExecuted = true;
        return "action2";
      });

      // Call delete while action2 is waiting
      const deleted = await store.delete("HOLD");
      expect(deleted).toBe(true);

      // Lock queue must NOT be deleted immediately because action2 is queued
      const queueEntry = (store as any).lockQueues.get("HOLD");
      expect(queueEntry).toBeDefined();

      const [res1, res2] = await Promise.all([action1, action2]);
      expect(res1).toBe("action1");
      expect(res2).toBe("action2");
      expect(secondWaiterExecuted).toBe(true);

      // Wait for next tick for the finally cleanup
      await new Promise((resolve) => setTimeout(resolve, 10));

      // After waiters settle, queue should be cleaned up
      expect((store as any).lockQueues.get("HOLD")).toBeUndefined();
    });
  });

  describe("Clock and IdGenerator injection (MAJ-012)", () => {
    it("uses injected IClock for lastActivityAt timestamps", async () => {
      const fixedTime = 1699999999000;
      const mockClock = { now: () => fixedTime };
      const customStore = new InMemoryRoomStore(mockClock);

      const room = createDummyRoom("TIME");
      delete (room as any).lastActivityAt;
      await customStore.save(room);

      const saved = await customStore.findByCode("TIME");
      expect(saved?.lastActivityAt).toBe(fixedTime);

      const updatedTime = 1700000000000;
      let currentTime = updatedTime;
      const updatingClock = { now: () => currentTime };
      const updatingStore = new InMemoryRoomStore(updatingClock);
      await updatingStore.save(createDummyRoom("MUT8"));

      await updatingStore.mutate("MUT8", (r) => ({
        updatedRoom: { ...r, game: { ...r.game, moveCount: 1 } },
        result: true,
      }));

      const mutated = await updatingStore.findByCode("MUT8");
      expect(mutated?.lastActivityAt).toBe(updatedTime);
    });
  });
});
