import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryRoomStore,
  InMemorySessionRegistry,
  RoomService,
  createInitialRoomState,
  OptimisticLockConflictError,
  RoomAlreadyExistsError,
  StaleLockExecutionError,
  LockExecutionTimeoutError,
} from "../../features/rooms/index.js";
import { GameService } from "../../features/game/index.js";
import {
  GameNotActiveError,
  NotYourTurnError,
  RoomFullError,
  type Player,
} from "@fun-chess/shared";

interface TestableStore {
  lockQueues: Map<string, unknown>;
}

function testStore(s: InMemoryRoomStore): TestableStore {
  return s as unknown as TestableStore;
}

describe("Room & Game Concurrency Control", () => {
  let store: InMemoryRoomStore;
  let sessionRegistry: InMemorySessionRegistry;
  let roomService: RoomService;
  let gameService: GameService;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    sessionRegistry = new InMemorySessionRegistry(
      "test-secret-at-least-16-chars-long",
    );
    roomService = new RoomService(store, sessionRegistry);
    gameService = new GameService(roomService);
  });

  describe("Concurrent Room Joins", () => {
    it("allows exactly one join when a room has 1 open slot, rejecting others with RoomFullError", async () => {
      const { room: created } = await roomService.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_alice",
      );

      const joinAttempts = Array.from({ length: 8 }, (_, i) =>
        roomService
          .joinRoom(
            { roomCode: created.roomCode, playerName: `Joiner_${i}` },
            `sock_joiner_${i}`,
          )
          .then((res) => ({ success: true, res }))
          .catch((err) => ({ success: false, err })),
      );

      const results = await Promise.all(joinAttempts);

      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(7);

      for (const failure of failures) {
        expect(failure.err).toBeInstanceOf(RoomFullError);
      }

      const finalRoom = await store.findByCode(created.roomCode);
      expect(finalRoom?.whitePlayer).toBeDefined();
      expect(finalRoom?.blackPlayer).toBeDefined();
      expect(finalRoom?.status).toBe("playing");

      // Memory leak verification: lock queue cleaned up
      expect(testStore(store).lockQueues.size).toBe(0);
    });
  });

  describe("Interleaved & Conflicting Moves", () => {
    it("handles simultaneous moves from the same turn so only one move succeeds", async () => {
      const { room: created } = await roomService.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_alice",
      );
      await roomService.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );

      // Alice tries to play e2e4 AND d2d4 at the same time on White's turn
      const [move1, move2] = await Promise.allSettled([
        gameService.makeMove(
          { roomCode: created.roomCode, move: { from: "e2", to: "e4" } },
          "sock_alice",
        ),
        gameService.makeMove(
          { roomCode: created.roomCode, move: { from: "d2", to: "d4" } },
          "sock_alice",
        ),
      ]);

      const fulfilled = [move1, move2].filter((m) => m.status === "fulfilled");
      const rejected = [move1, move2].filter((m) => m.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Second move must be rejected with NotYourTurnError (since turn changed to 'b') or OptimisticLockConflictError
      const error = (rejected[0] as PromiseRejectedResult).reason;
      expect(
        error instanceof NotYourTurnError ||
          error instanceof OptimisticLockConflictError,
      ).toBe(true);

      const updated = await store.findByCode(created.roomCode);
      expect(updated?.game.turn).toBe("b");
      expect(updated?.game.moveCount).toBe(1);

      // Lock queue evicted
      expect(testStore(store).lockQueues.size).toBe(0);
    });

    it("rejects black move when executed simultaneously with white opening move on turn 'w'", async () => {
      const { room: created } = await roomService.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_alice",
      );
      await roomService.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );

      // White tries e2e4, Black simultaneously tries e7e5
      // If White moves first, Black's e7e5 succeeds (valid response on 'b').
      // If Black moves first, Black gets NotYourTurnError.
      // Either way, no corruption, state machine remains strictly valid.
      const results = await Promise.allSettled([
        gameService.makeMove(
          { roomCode: created.roomCode, move: { from: "e2", to: "e4" } },
          "sock_alice",
        ),
        gameService.makeMove(
          { roomCode: created.roomCode, move: { from: "e7", to: "e5" } },
          "sock_bob",
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      const updated = await store.findByCode(created.roomCode);
      expect(updated?.game.fen).toBeDefined();

      // Lock queue evicted
      expect(testStore(store).lockQueues.size).toBe(0);
    });
  });

  describe("Simultaneous Move and Resignation", () => {
    it("prevents subsequent moves once match is conceded by resignation", async () => {
      const { room: created } = await roomService.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_alice",
      );
      await roomService.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );

      // Alice concedes the match
      const resignPromise = gameService.resign(created.roomCode, "sock_alice");

      // Simultaneous move attempted by Alice or Bob
      const movePromise = gameService.makeMove(
        { roomCode: created.roomCode, move: { from: "e2", to: "e4" } },
        "sock_alice",
      );

      const [resResign, resMove] = await Promise.allSettled([
        resignPromise,
        movePromise,
      ]);

      // If resign ran first, move fails with GameNotActiveError
      // If move ran first, move succeeded, then resign succeeded, ending game in "game_over"
      const finalRoom = await store.findByCode(created.roomCode);
      expect(finalRoom?.status).toBe("game_over");

      if (resResign.status === "fulfilled" && resMove.status === "rejected") {
        expect((resMove as PromiseRejectedResult).reason).toBeInstanceOf(
          GameNotActiveError,
        );
      }

      // Any subsequent moves are strictly rejected with GameNotActiveError
      await expect(
        gameService.makeMove(
          { roomCode: created.roomCode, move: { from: "e7", to: "e5" } },
          "sock_bob",
        ),
      ).rejects.toBeInstanceOf(GameNotActiveError);

      expect(testStore(store).lockQueues.size).toBe(0);
    });
  });

  describe("Simultaneous Draw Acceptance and Move", () => {
    it("ensures atomic resolution when a move and draw acceptance race", async () => {
      const { room: created } = await roomService.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_alice",
      );
      await roomService.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );

      // White offers draw
      await gameService.offerDraw(created.roomCode, "sock_alice");

      // Concurrently: White plays a move AND Bob accepts the pending draw
      const [moveResult, drawResult] = await Promise.allSettled([
        gameService.makeMove(
          { roomCode: created.roomCode, move: { from: "e2", to: "e4" } },
          "sock_alice",
        ),
        gameService.respondDraw(created.roomCode, "sock_bob", true),
      ]);

      // One must succeed, the other must fail:
      // - If move ran first: drawOffer was cleared to null -> respondDraw rejects with GameNotActiveError
      // - If draw acceptance ran first: status changed to "game_over" -> makeMove rejects with GameNotActiveError
      const fulfilled = [moveResult, drawResult].filter(
        (r) => r.status === "fulfilled",
      );
      const rejected = [moveResult, drawResult].filter(
        (r) => r.status === "rejected",
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectionReason).toBeInstanceOf(GameNotActiveError);

      // Lock queues cleanly evicted
      expect(testStore(store).lockQueues.size).toBe(0);
    });
  });

  describe("Lock Queue Memory Leak Prevention", () => {
    it("ensures store.lockQueues size returns to 0 after dozens of parallel operations", async () => {
      const { room: created } = await roomService.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_alice",
      );
      await roomService.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );

      const operations = Array.from({ length: 30 }, (_, i) => {
        if (i % 2 === 0) {
          return store.mutate(created.roomCode, async (room) => {
            room.lastActivityAt = Date.now();
            return { updatedRoom: room, result: i };
          });
        }
        return store.withLock(created.roomCode, async () => {
          return i;
        });
      });

      const results = await Promise.all(operations);
      expect(results).toHaveLength(30);

      // Zero active lock queues lingering in memory
      expect(testStore(store).lockQueues.size).toBe(0);
    });
  });

  describe("Atomic createIfAbsent Concurrency (CRIT-003)", () => {
    it("rejects concurrent collision with RoomAlreadyExistsError", async () => {
      const host1: Player = {
        id: "p1",
        socketId: "s1",
        name: "Alice",
        color: "w",
        isHost: true,
        isConnected: true,
        connectedAt: 1000,
      };
      const host2: Player = {
        id: "p2",
        socketId: "s2",
        name: "Bob",
        color: "w",
        isHost: true,
        isConnected: true,
        connectedAt: 1000,
      };
      const room1 = createInitialRoomState({
        roomCode: "COLL",
        hostPlayer: host1,
        createdAt: 1000,
      });
      const room2 = createInitialRoomState({
        roomCode: "COLL",
        hostPlayer: host2,
        createdAt: 1000,
      });

      const results = await Promise.allSettled([
        store.createIfAbsent(room1),
        store.createIfAbsent(room2),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        RoomAlreadyExistsError,
      );
    });
  });

  describe("Ticket Cancellation & Stale Write Rejection (CRIT-002)", () => {
    it("invalidates ticket on execution timeout and rejects subsequent stale write with StaleLockExecutionError", async () => {
      const shortTimeoutStore = new InMemoryRoomStore(undefined, undefined, {
        lockTimeoutMs: 1000,
        executionTimeoutMs: 40,
      });

      const host: Player = {
        id: "p_host",
        socketId: "s_host",
        name: "Host",
        color: "w",
        isHost: true,
        isConnected: true,
        connectedAt: 1000,
      };
      const initialRoom = createInitialRoomState({
        roomCode: "STAL",
        hostPlayer: host,
        createdAt: 1000,
      });
      await shortTimeoutStore.save(initialRoom);

      let staleWriteError: unknown = null;

      // Action 1: Takes lock, sleeps longer than executionTimeoutMs (40ms), then attempts stale write
      const action1 = shortTimeoutStore.withLock("STAL", async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        try {
          // Attempt write using the expired ticket in context
          await shortTimeoutStore.save({
            ...initialRoom,
            status: "game_over",
          });
        } catch (err) {
          staleWriteError = err;
        }
      });

      // Action 1 should reject with LockExecutionTimeoutError from withLock timeout
      await expect(action1).rejects.toBeInstanceOf(LockExecutionTimeoutError);

      // Now Action 2 acquires lock and performs valid write
      await shortTimeoutStore.withLock("STAL", async () => {
        await shortTimeoutStore.save({
          ...initialRoom,
          status: "playing",
        });
      });

      // Wait for Action 1's delayed background write attempt to settle
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Assert that Action 1's write was rejected with StaleLockExecutionError
      expect(staleWriteError).toBeInstanceOf(StaleLockExecutionError);

      // Assert that Action 2's write was preserved in store and not overwritten by stale write
      const persisted = await shortTimeoutStore.findByCode("STAL");
      expect(persisted?.status).toBe("playing");
    });
  });
});
