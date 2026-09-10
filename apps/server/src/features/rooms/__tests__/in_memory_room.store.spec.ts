import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InMemoryRoomStore, deepFreeze } from "../in_memory_room.store.js";
import { RoomState } from "@fun-chess/shared";
import {
  RoomNotFoundError,
  OptimisticLockConflictError,
  LockTimeoutError,
  RoomLockTimeoutError,
  LockExecutionTimeoutError,
  RoomCapacityExceededError,
  RoomBusyError,
  StaleLockExecutionError,
} from "../room.errors.js";
import { NullLogger } from "../../../platform/logger/null_logger.js";
import type { Logger } from "../../../platform/logger/index.js";

interface TestableStore {
  rooms: Map<string, unknown>;
  lockQueues: Map<string, unknown>;
  socketIndex: Map<string, unknown>;
  LOCK_TIMEOUT_MS: number;
  EXECUTION_TIMEOUT_MS: number;
  cancelledTickets: Set<number>;
  trackCancelledTicket(ticket: number): void;
  assertTicketValid(code: string, explicitContext?: unknown): void;
}

function testStore(s: InMemoryRoomStore): TestableStore {
  return s as unknown as TestableStore;
}

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

    it("guarantees deep immutability so external mutations do not contaminate store (ENH-013)", async () => {
      const room = createDummyRoom("SAFE");
      await store.save(room);

      const fetched = await store.findByCode("SAFE");
      expect(fetched).not.toBeNull();
      expect(Object.isFrozen(fetched)).toBe(true);
      expect(Object.isFrozen(fetched?.whitePlayer)).toBe(true);
      expect(() => {
        if (fetched && fetched.whitePlayer) {
          (fetched.whitePlayer as any).name = "HACKED_NAME";
        }
      }).toThrow(TypeError);

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

    it("rejects waiting action with RoomLockTimeoutError when lock acquisition times out (MAJ-022)", async () => {
      const code = "TO_RACE";
      const customStore = new InMemoryRoomStore(undefined, undefined, {
        lockTimeoutMs: 25,
      });

      let unblockHolder!: () => void;
      const holderBlocker = new Promise<void>((resolve) => {
        unblockHolder = resolve;
      });

      // Acquire lock and hold it longer than the waiter's lockTimeoutMs
      const holder = customStore.withLock(code, async () => {
        await holderBlocker;
        return "holder_done";
      });

      // Attempt to acquire lock while holder is active
      const waiter = customStore.withLock(code, async () => {
        return "waiter_done";
      });

      await expect(waiter).rejects.toThrow(RoomLockTimeoutError);

      unblockHolder();
      const holderResult = await holder;
      expect(holderResult).toBe("holder_done");
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
        expect(testStore(store).lockQueues.has(code)).toBe(true);
      });

      expect(testStore(store).lockQueues.has(code)).toBe(false);
      expect(testStore(store).lockQueues.size).toBe(0);
    });

    it("throws LockTimeoutError when waiting for lock exceeds LOCK_TIMEOUT_MS", async () => {
      const code = "TMOT";
      // Temporarily override LOCK_TIMEOUT_MS for fast test execution
      testStore(store).LOCK_TIMEOUT_MS = 30;

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
      testStore(store).LOCK_TIMEOUT_MS = 30;

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
      expect(testStore(store).lockQueues.has(code)).toBe(true);

      // 3. Waiter 2 is queued behind waiter 1 (with plenty of time)
      testStore(store).LOCK_TIMEOUT_MS = 5000;
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
      expect(testStore(store).lockQueues.has(code)).toBe(false);
    });

    it("throws LockExecutionTimeoutError when action execution exceeds EXECUTION_TIMEOUT_MS (MAJ-005)", async () => {
      const code = "EXECTMO";
      testStore(store).EXECUTION_TIMEOUT_MS = 30;

      const hangingAction = store.withLock(code, async () => {
        // Hang indefinitely
        await new Promise(() => {});
      });

      await expect(hangingAction).rejects.toThrow(LockExecutionTimeoutError);

      // Verify lock was released immediately: next waiter can acquire
      (
        store as unknown as { EXECUTION_TIMEOUT_MS: number }
      ).EXECUTION_TIMEOUT_MS = 5000;
      const nextAction = await store.withLock(code, async () => "unblocked");
      expect(nextAction).toBe("unblocked");
    });

    it("absorbs post-timeout rejection from orphaned lock action without unhandled rejection (CRIT-002)", async () => {
      const code = "ORPHAN";
      const warnLogs: { msg: string; meta?: Record<string, unknown> }[] = [];
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn((msg: string, meta?: Record<string, unknown>) => {
          warnLogs.push({ msg, meta });
        }),
        error: vi.fn(),
        fatal: vi.fn(),
        child: () => mockLogger as unknown as Logger,
      } as unknown as Logger;

      const customStore = new InMemoryRoomStore(undefined, undefined, {
        executionTimeoutMs: 20,
        logger: mockLogger,
      });

      let orphanedActionResolve!: () => void;
      const blocker = new Promise<void>((resolve) => {
        orphanedActionResolve = resolve;
      });

      // Launch an action that times out, then rejects after timeout
      const timedOutPromise = customStore.withLock(code, async () => {
        await blocker;
        throw new Error("Post-timeout async explosion in orphaned action");
      });

      await expect(timedOutPromise).rejects.toThrow(LockExecutionTimeoutError);

      // Trigger the rejection in the background after execution timeout has expired
      orphanedActionResolve();

      // Wait a tick for the post-timeout rejection to run and be caught
      await new Promise((resolve) => setTimeout(resolve, 15));

      const postTimeoutWarn = warnLogs.find(
        (log) =>
          log.msg === "Orphaned lock action rejected after execution timeout",
      );
      expect(postTimeoutWarn).toBeDefined();
    });

    it("elevates lock timeout events to warn level (MAJ-027)", async () => {
      const warnLogs: string[] = [];
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn((msg: string) => {
          warnLogs.push(msg);
        }),
        error: vi.fn(),
        fatal: vi.fn(),
        child: () => mockLogger as unknown as Logger,
      } as unknown as Logger;

      const customStore = new InMemoryRoomStore(mockLogger);
      customStore.LOCK_TIMEOUT_MS = 20;

      let releaseLock!: () => void;
      const blocker = new Promise<void>((r) => {
        releaseLock = r;
      });
      const first = customStore.withLock("WARN", async () => {
        await blocker;
      });

      await expect(
        customStore.withLock("WARN", async () => "ok"),
      ).rejects.toThrow(LockTimeoutError);

      releaseLock();
      await first;

      expect(warnLogs).toContain("Lock acquisition timed out");
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
      const deletePromise = store.delete("HOLD");

      // Lock queue must NOT be deleted immediately because action2 and delete are queued
      const queueEntry = testStore(store).lockQueues.get("HOLD");
      expect(queueEntry).toBeDefined();

      const [res1, res2, deleted] = await Promise.all([
        action1,
        action2,
        deletePromise,
      ]);
      expect(res1).toBe("action1");
      expect(res2).toBe("action2");
      expect(deleted).toBe(true);
      expect(secondWaiterExecuted).toBe(true);

      // Wait for next tick for the finally cleanup
      await new Promise((resolve) => setTimeout(resolve, 10));

      // After waiters settle, queue should be cleaned up
      expect(testStore(store).lockQueues.get("HOLD")).toBeUndefined();
    });
  });

  describe("Clock and IdGenerator injection (MAJ-012)", () => {
    it("uses injected IClock for lastActivityAt timestamps", async () => {
      const fixedTime = 1699999999000;
      const mockClock = { now: () => fixedTime };
      const customStore = new InMemoryRoomStore(mockClock);

      const room = createDummyRoom("TIME");
      delete (room as Partial<RoomState>).lastActivityAt;
      await customStore.save(room);

      const saved = await customStore.findByCode("TIME");
      expect(saved?.lastActivityAt).toBe(fixedTime);

      const updatedTime = 1700000000000;
      const currentTime = updatedTime;
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

  describe("Memory bounds for cancelledTickets", () => {
    it("bounds cancelledTickets set to MAX_CANCELLED_TICKETS to prevent memory leaks", () => {
      const store = new InMemoryRoomStore();
      const max = store.MAX_CANCELLED_TICKETS;
      expect(max).toBe(5000);

      // Simulate inserting max + 100 cancelled tickets
      for (let i = 1; i <= max + 100; i++) {
        testStore(store).trackCancelledTicket(i);
      }

      const set = testStore(store).cancelledTickets;
      expect(set.size).toBe(max);
      // Earliest 100 tickets should have been evicted
      expect(set.has(1)).toBe(false);
      expect(set.has(100)).toBe(false);
      // Newer tickets must remain present
      expect(set.has(101)).toBe(true);
      expect(set.has(max + 100)).toBe(true);
    });
  });

  describe("Room Capacity Limit & RoomCapacityExceededError (MAJ-017)", () => {
    it("throws RoomCapacityExceededError on save when maximum capacity is reached for a new room", async () => {
      const capacityStore = new InMemoryRoomStore(undefined, undefined, {
        maxRooms: 2,
      });

      await capacityStore.save(createDummyRoom("RM01"));
      await capacityStore.save(createDummyRoom("RM02"));

      // Attempting to save a 3rd new room should fail with RoomCapacityExceededError
      let caughtError: unknown;
      try {
        await capacityStore.save(createDummyRoom("RM03"));
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(RoomCapacityExceededError);
      const error = caughtError as RoomCapacityExceededError;
      expect(error.name).toBe("RoomCapacityExceededError");
      expect(error.code).toBe("ERR_ROOM_CAPACITY_EXCEEDED");
      expect(error.statusCode).toBe(429);
      expect(error.details).toEqual({ maxRooms: 2 });
      expect(error.message).toContain("Maximum room capacity reached (2)");
    });

    it("allows updating existing rooms even when at maximum capacity", async () => {
      const capacityStore = new InMemoryRoomStore(undefined, undefined, {
        maxRooms: 2,
      });

      const r1 = createDummyRoom("RM01");
      const r2 = createDummyRoom("RM02");
      await capacityStore.save(r1);
      await capacityStore.save(r2);

      // Updating RM01 should succeed without throwing
      await expect(
        capacityStore.save({ ...r1, status: "playing" }),
      ).resolves.not.toThrow();

      const updated = await capacityStore.findByCode("RM01");
      expect(updated?.status).toBe("playing");
    });

    it("throws RoomCapacityExceededError on createIfAbsent when maximum capacity is reached", async () => {
      const capacityStore = new InMemoryRoomStore(undefined, undefined, {
        maxRooms: 1,
      });

      await capacityStore.createIfAbsent(createDummyRoom("RM01"));

      let caughtError: unknown;
      try {
        await capacityStore.createIfAbsent(createDummyRoom("RM02"));
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(RoomCapacityExceededError);
      const error = caughtError as RoomCapacityExceededError;
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe("ERR_ROOM_CAPACITY_EXCEEDED");
      expect(error.details).toEqual({ maxRooms: 1 });
    });
  });

  describe("Queue-depth circuit breaker (ENH-004)", () => {
    it("rejects incoming lock requests with RoomBusyError when queue depth exceeds maxQueueDepth", async () => {
      const logger = new NullLogger();
      const storeWithLimit = new InMemoryRoomStore({
        maxQueueDepth: 2,
        logger,
      });

      let releaseFirst: () => void;
      const firstBlocker = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      // 1st request acquires the lock (waitersCount = 1)
      const p1 = storeWithLimit.withLock("BUSY", async () => {
        await firstBlocker;
        return "first_done";
      });

      // Give event loop tick to let p1 acquire lock
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 2nd request enters the queue (waitersCount = 2)
      const p2 = storeWithLimit.withLock("BUSY", async () => {
        return "second_done";
      });

      // Give event loop tick for p2 to enqueue
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 3rd request arrives when waitersCount is 2 (>= maxQueueDepth of 2) -> immediately rejected
      await expect(
        storeWithLimit.withLock("BUSY", async () => "third_done"),
      ).rejects.toThrow(RoomBusyError);

      const warningLogs = logger.warnLogs.filter(
        (l) => l.context?.operation === "room_lock_queue_depth_exceeded",
      );
      expect(warningLogs.length).toBe(1);
      expect(warningLogs[0]?.context).toMatchObject({
        roomCode: "BUSY",
        maxQueueDepth: 2,
      });

      // Clean up first blocker
      releaseFirst!();
      expect(await p1).toBe("first_done");
      expect(await p2).toBe("second_done");
    });
  });

  describe("DEBUG-level mutation logging (ENH-010)", () => {
    it("logs debug records on save, createIfAbsent, mutate, and delete", async () => {
      const logger = new NullLogger();
      const loggedStore = new InMemoryRoomStore({ logger });

      // 1. createIfAbsent
      const room = createDummyRoom("DBGL");
      await loggedStore.createIfAbsent(room);
      const createLogs = logger.debugLogs.filter(
        (l) => l.context?.operation === "room_storage_create",
      );
      expect(createLogs.length).toBe(1);
      expect(createLogs[0]?.context?.roomCode).toBe("DBGL");

      // 2. save
      await loggedStore.save({ ...room, status: "playing" });
      const saveLogs = logger.debugLogs.filter(
        (l) => l.context?.operation === "room_storage_save",
      );
      expect(saveLogs.length).toBe(1);
      expect(saveLogs[0]?.context?.roomCode).toBe("DBGL");

      // 3. mutate
      await loggedStore.mutate("DBGL", async (r) => ({
        updatedRoom: { ...r, status: "game_over" },
        result: "mutated",
      }));
      const mutateStarted = logger.debugLogs.filter(
        (l) => l.context?.operation === "room_mutate_started",
      );
      const mutateCompleted = logger.debugLogs.filter(
        (l) => l.context?.operation === "room_mutate_completed",
      );
      expect(mutateStarted.length).toBe(1);
      expect(mutateCompleted.length).toBe(1);

      // 4. delete
      await loggedStore.delete("DBGL");
      const deleteLogs = logger.debugLogs.filter(
        (l) => l.context?.operation === "room_storage_delete",
      );
      expect(deleteLogs.length).toBe(1);
      expect(deleteLogs[0]?.context?.roomCode).toBe("DBGL");
      expect(deleteLogs[0]?.context?.existed).toBe(true);
    });
  });

  describe("Decomposed withLock execution (ENH-013)", () => {
    it("executes actions sequentially under FIFO mutex with acquireLock, executeWithTimeout, releaseLock", async () => {
      const executionOrder: number[] = [];

      const p1 = store.withLock("FIFO", async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        executionOrder.push(1);
        return 1;
      });

      const p2 = store.withLock("FIFO", async () => {
        executionOrder.push(2);
        return 2;
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(executionOrder).toEqual([1, 2]);
    });

    it("supports re-entrant withLock calls within the same async context", async () => {
      const result = await store.withLock("REENTRANT", async (ctx) => {
        expect(ctx?.roomCode).toBe("REENTRANT");
        const nested = await store.withLock("REENTRANT", async (nestedCtx) => {
          expect(nestedCtx?.ticket).toBe(ctx?.ticket);
          return "nested_success";
        });
        return `outer_${nested}`;
      });
      expect(result).toBe("outer_nested_success");
    });
  });

  describe("deepFreeze utility (ENH-013)", () => {
    it("returns primitives and null as-is", () => {
      expect(deepFreeze(null)).toBeNull();
      expect(deepFreeze(undefined)).toBeUndefined();
      expect(deepFreeze(42)).toBe(42);
      expect(deepFreeze("str")).toBe("str");
      expect(deepFreeze(true)).toBe(true);
    });

    it("deeply freezes nested objects and arrays", () => {
      const complex = {
        level1: {
          level2: {
            items: [1, 2, { name: "nested" }],
          },
        },
      };
      const frozen = deepFreeze(complex);
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.level1)).toBe(true);
      expect(Object.isFrozen(frozen.level1.level2)).toBe(true);
      expect(Object.isFrozen(frozen.level1.level2.items)).toBe(true);
      expect(Object.isFrozen(frozen.level1.level2.items[2])).toBe(true);

      expect(() => {
        (frozen.level1 as any).foo = "bar";
      }).toThrow(TypeError);
    });

    it("safely handles objects where sub-properties are already frozen", () => {
      const sub = Object.freeze({ child: 1 });
      const parent = { sub };
      const frozen = deepFreeze(parent);
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(frozen.sub.child).toBe(1);
    });
  });

  describe("AbortSignal cancellation (ENH-015)", () => {
    it("rejects read queries immediately when signal is already aborted", async () => {
      const ac = new AbortController();
      ac.abort();

      await expect(store.findByCode("TEST", { signal: ac.signal })).rejects.toThrow();
      await expect(store.findBySocketId("sock_1", { signal: ac.signal })).rejects.toThrow();
      await expect(store.listActiveRooms({ signal: ac.signal })).rejects.toThrow();
      await expect(store.count({ signal: ac.signal })).rejects.toThrow();
    });

    it("rejects mutations immediately when signal is already aborted", async () => {
      const ac = new AbortController();
      ac.abort();
      const room = createDummyRoom("ABRT");

      await expect(store.save(room, undefined, { signal: ac.signal })).rejects.toThrow();
      await expect(store.createIfAbsent(room, { signal: ac.signal })).rejects.toThrow();
      await expect(store.delete("ABRT", { signal: ac.signal })).rejects.toThrow();
      await expect(store.clear({ signal: ac.signal })).rejects.toThrow();
      await expect(
        store.mutate("ABRT", (r) => ({ updatedRoom: r, result: 1 }), { signal: ac.signal }),
      ).rejects.toThrow();
      await expect(
        store.withLock("ABRT", async () => 1, undefined, { signal: ac.signal }),
      ).rejects.toThrow();
    });

    it("aborts in-flight withLock waiting in lock queue when signal fires", async () => {
      const code = "ABQT";
      let releaseHolder!: () => void;
      const holderBlocker = new Promise<void>((r) => {
        releaseHolder = r;
      });

      // 1. Holder holds lock
      const holder = store.withLock(code, async () => {
        await holderBlocker;
        return "holder_done";
      });

      // Allow holder to acquire
      await new Promise((r) => setTimeout(r, 10));

      // 2. Waiter queued with AbortSignal
      const ac = new AbortController();
      const waiter = store.withLock(
        code,
        async () => "waiter_done",
        undefined,
        { signal: ac.signal },
      );

      // Give waiter a moment to enter queue
      await new Promise((r) => setTimeout(r, 10));

      // Abort waiter
      ac.abort();

      await expect(waiter).rejects.toThrow();

      // Release holder and confirm holder completes normally
      releaseHolder();
      expect(await holder).toBe("holder_done");
    });
  });

  describe("Secondary socket index self-healing & fallback re-indexing (MIN-028)", () => {
    it("re-indexes sockets into primary index when fallback search finds white player", async () => {
      const room = createDummyRoom("REIX");
      await store.save(room);

      // Simulate index desync: clear socketIndex while room is still in rooms map
      testStore(store).socketIndex.clear();
      expect(testStore(store).socketIndex.size).toBe(0);

      // Fallback search should find room by white player's socketId
      const found = await store.findBySocketId("sock_white");
      expect(found).not.toBeNull();
      expect(found?.playerId).toBe("p_white");

      // Verify that socketIndex was healed and re-populated
      expect(testStore(store).socketIndex.has("sock_white")).toBe(true);
      expect(testStore(store).socketIndex.has("sock_black")).toBe(true);
      expect(testStore(store).socketIndex.has("sock_spec")).toBe(true);
    });

    it("re-indexes sockets into primary index when fallback search finds black player", async () => {
      const room = createDummyRoom("REBK");
      await store.save(room);

      testStore(store).socketIndex.clear();

      const found = await store.findBySocketId("sock_black");
      expect(found).not.toBeNull();
      expect(found?.playerId).toBe("p_black");

      expect(testStore(store).socketIndex.has("sock_black")).toBe(true);
    });

    it("re-indexes sockets into primary index when fallback search finds spectator", async () => {
      const room = createDummyRoom("RESP");
      await store.save(room);

      testStore(store).socketIndex.clear();

      const found = await store.findBySocketId("sock_spec");
      expect(found).not.toBeNull();
      expect(found?.playerId).toBe("p_spec");

      expect(testStore(store).socketIndex.has("sock_spec")).toBe(true);
    });

    it("cleans up stale socket index entry if room no longer contains socketId", async () => {
      const room = createDummyRoom("STAL");
      await store.save(room);

      // Manually insert an obsolete entry into socketIndex
      testStore(store).socketIndex.set("sock_obsolete", {
        roomCode: "STAL",
        playerId: "p_unknown",
      });

      const found = await store.findBySocketId("sock_obsolete");
      expect(found).toBeNull();
      expect(testStore(store).socketIndex.has("sock_obsolete")).toBe(false);
    });
  });

  describe("Constructor Overloads and Options Parsing", () => {
    it("handles InMemoryRoomStoreOptions object configuration", () => {
      const s = new InMemoryRoomStore({
        maxRooms: 50,
        maxCancelledTickets: 100,
        lockTimeoutMs: 1234,
        executionTimeoutMs: 4321,
        maxQueueDepth: 10,
      });

      expect(s.maxRooms).toBe(50);
      expect(s.MAX_CANCELLED_TICKETS).toBe(100);
      expect(s.LOCK_TIMEOUT_MS).toBe(1234);
      expect(s.EXECUTION_TIMEOUT_MS).toBe(4321);
      expect(s.maxQueueDepth).toBe(10);
    });

    it("handles positional logger and options parameter configuration", () => {
      const logger = new NullLogger();
      const s = new InMemoryRoomStore(logger, undefined, {
        lockTimeoutMs: 2000,
        executionTimeoutMs: 3000,
        maxRooms: 500,
        maxCancelledTickets: 250,
        maxQueueDepth: 25,
      });

      expect(s.LOCK_TIMEOUT_MS).toBe(2000);
      expect(s.EXECUTION_TIMEOUT_MS).toBe(3000);
      expect(s.maxRooms).toBe(500);
      expect(s.MAX_CANCELLED_TICKETS).toBe(250);
      expect(s.maxQueueDepth).toBe(25);
    });

    it("handles 4th argument options", () => {
      const logger = new NullLogger();
      const s = new InMemoryRoomStore(
        undefined,
        undefined,
        logger,
        {
          lockTimeoutMs: 999,
          executionTimeoutMs: 888,
          maxRooms: 777,
          maxCancelledTickets: 666,
          maxQueueDepth: 55,
        },
      );

      expect(s.LOCK_TIMEOUT_MS).toBe(999);
      expect(s.EXECUTION_TIMEOUT_MS).toBe(888);
      expect(s.maxRooms).toBe(777);
      expect(s.MAX_CANCELLED_TICKETS).toBe(666);
      expect(s.maxQueueDepth).toBe(55);
    });
  });

  describe("assertTicketValid Edge Cases", () => {
    it("ignores assertTicketValid when context roomCode does not match", () => {
      expect(() => {
        testStore(store).assertTicketValid("CODE_A", {
          roomCode: "CODE_B",
          ticket: 1,
          isCancelled: () => false,
        });
      }).not.toThrow();
    });

    it("throws StaleLockExecutionError when ticket is cancelled or active ticket does not match", () => {
      testStore(store).trackCancelledTicket(99);

      expect(() => {
        testStore(store).assertTicketValid("TICK", {
          roomCode: "TICK",
          ticket: 99,
          isCancelled: () => true,
        });
      }).toThrow(StaleLockExecutionError);
    });

    it("enforces active lock ticket check or requires allowUnlocked in save() (MIN-009)", async () => {
      const room = createDummyRoom("LOCKS");
      await store.save(room);

      // Simulate an active lock on room LOCKS
      testStore(store).activeTickets.set("LOCKS", 42);

      // Attempting to save without ticket or allowUnlocked should throw StaleLockExecutionError
      await expect(store.save(room)).rejects.toThrow(StaleLockExecutionError);

      // Saving with wrong ticket should throw StaleLockExecutionError
      await expect(store.save(room, undefined, { ticket: 99 })).rejects.toThrow(StaleLockExecutionError);

      // Saving with matching ticket succeeds
      await expect(store.save(room, undefined, { ticket: 42 })).resolves.toBeUndefined();

      // Saving with allowUnlocked: true succeeds even under active lock
      await expect(store.save(room, undefined, { allowUnlocked: true })).resolves.toBeUndefined();

      testStore(store).activeTickets.delete("LOCKS");
    });
  });

  describe("Additional Branch Coverage (MAJ-001)", () => {
    it("handles rooms with spectators without socketIds and players without socketIds", async () => {
      const room = createDummyRoom("NOSOCK");
      room.whitePlayer = undefined;
      room.blackPlayer = undefined;
      room.spectators = [
        {
          id: "p_spec_nosock",
          name: "NoSockSpec",
          color: "w",
          isHost: false,
          isConnected: false,
          connectedAt: Date.now(),
        },
      ];

      await store.save(room);
      const found = await store.findByCode("NOSOCK");
      expect(found).not.toBeNull();
      expect(await store.findBySocketId("sock_none")).toBeNull();
    });

    it("absorbs non-Error rejection from orphaned lock action without unhandled rejection", async () => {
      const warnLogs: { msg: string; meta?: Record<string, unknown> }[] = [];
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn((msg: string, meta?: Record<string, unknown>) => {
          warnLogs.push({ msg, meta });
        }),
        error: vi.fn(),
        child: () => mockLogger as unknown as Logger,
      } as unknown as Logger;

      const customStore = new InMemoryRoomStore({
        executionTimeoutMs: 15,
        logger: mockLogger,
      });

      let orphanedActionResolve!: () => void;
      const blocker = new Promise<void>((resolve) => {
        orphanedActionResolve = resolve;
      });

      const timedOutPromise = customStore.withLock("RAWERR", async () => {
        await blocker;
        // Throw non-Error primitive
        throw "string_error_from_orphaned_action";
      });

      await expect(timedOutPromise).rejects.toThrow(LockExecutionTimeoutError);

      orphanedActionResolve();
      await new Promise((resolve) => setTimeout(resolve, 25));

      const postTimeoutWarn = warnLogs.find(
        (log) => log.msg === "Orphaned lock action rejected after execution timeout",
      );
      expect(postTimeoutWarn).toBeDefined();
      expect(postTimeoutWarn?.meta?.error).toEqual({
        raw: "string_error_from_orphaned_action",
      });
    });

    it("returns false when deleting a non-existent room", async () => {
      const deleted = await store.delete("NONEXIST");
      expect(deleted).toBe(false);
    });

    it("preserves explicitly mutated lastActivityAt during mutate", async () => {
      const room = createDummyRoom("ACTV");
      await store.save(room);

      const customTime = 1234567890;
      await store.mutate("ACTV", (r) => {
        r.lastActivityAt = customTime;
        return { updatedRoom: r, result: "ok" };
      });

      const updated = await store.findByCode("ACTV");
      expect(updated?.lastActivityAt).toBe(customTime);
    });

    it("chains subsequent lock acquisition when previous waiter in tail rejects", async () => {
      const code = "TAILREJ";
      // First action throws an error
      await expect(
        store.withLock(code, async () => {
          throw new Error("Action failed");
        }),
      ).rejects.toThrow("Action failed");

      // Next action should still acquire successfully
      const res = await store.withLock(code, async () => "next_ok");
      expect(res).toBe("next_ok");
    });
  });
});
