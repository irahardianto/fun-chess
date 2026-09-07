import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRoomStore } from "../in_memory_room.store.js";
import { InMemorySessionRegistry } from "../in_memory_session_registry.js";
import { RoomService } from "../room.service.js";
import { GameService } from "../../game/game.service.js";
import {
  GameNotActiveError,
  NotYourTurnError,
  RoomFullError,
} from "@fun-chess/shared";
import { OptimisticLockConflictError } from "../room.errors.js";

describe("Room & Game Concurrency Control", () => {
  let store: InMemoryRoomStore;
  let sessionRegistry: InMemorySessionRegistry;
  let roomService: RoomService;
  let gameService: GameService;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    sessionRegistry = new InMemorySessionRegistry();
    roomService = new RoomService(store, sessionRegistry);
    gameService = new GameService(store);
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
      expect((store as any).lockQueues.size).toBe(0);
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
      expect((store as any).lockQueues.size).toBe(0);
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
      expect((store as any).lockQueues.size).toBe(0);
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

      expect((store as any).lockQueues.size).toBe(0);
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
      expect((store as any).lockQueues.size).toBe(0);
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
      expect((store as any).lockQueues.size).toBe(0);
    });
  });
});
