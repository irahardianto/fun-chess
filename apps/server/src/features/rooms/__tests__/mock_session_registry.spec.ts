import { describe, it, expect, beforeEach } from "vitest";
import { MockSessionRegistry } from "../mock_session_registry.js";
import type { IClock, IIdGenerator } from "@fun-chess/shared";

describe("MockSessionRegistry (MAJ-011)", () => {
  let registry: MockSessionRegistry;
  let currentTimestamp: number;
  let mockClock: IClock;
  let mockIdGen: IIdGenerator;
  let idCounter: number;

  beforeEach(() => {
    currentTimestamp = 1_000_000;
    idCounter = 1;
    mockClock = { now: () => currentTimestamp };
    mockIdGen = {
      generateId: () => `token-${idCounter++}`,
      generateRandomInt: (min: number) => min,
    };
    registry = new MockSessionRegistry({
      clock: mockClock,
      idGenerator: mockIdGen,
      defaultTtlMs: 60_000,
    });
  });

  describe("createSession", () => {
    it("creates a session record, indexes it, and records spy call", async () => {
      const record = await registry.createSession({
        playerId: "p1",
        roomCode: "abcd",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      expect(record.sessionToken).toBe("token-1");
      expect(record.playerId).toBe("p1");
      expect(record.roomCode).toBe("ABCD");
      expect(record.createdAt).toBe(1_000_000);
      expect(record.expiresAt).toBe(1_060_000);
      expect(registry.createCalls).toHaveLength(1);
      expect(registry.createCalls[0]?.playerId).toBe("p1");
    });

    it("respects custom ttlMs", async () => {
      const record = await registry.createSession({
        playerId: "p2",
        roomCode: "ABCD",
        color: "b",
        isHost: false,
        socketId: "sock-2",
        ttlMs: 5000,
      });

      expect(record.expiresAt).toBe(1_005_000);
    });
  });

  describe("validateSession", () => {
    it("validates active session and returns structured clone", async () => {
      const created = await registry.createSession({
        playerId: "p1",
        roomCode: "ABCD",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      const validated = await registry.validateSession(
        created.sessionToken,
        "abcd",
        "p1",
      );

      expect(validated).not.toBeNull();
      expect(validated?.sessionToken).toBe(created.sessionToken);
    });

    it("returns null on mismatched roomCode or playerId", async () => {
      const created = await registry.createSession({
        playerId: "p1",
        roomCode: "ABCD",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      expect(
        await registry.validateSession(created.sessionToken, "WXYZ", "p1"),
      ).toBeNull();
      expect(
        await registry.validateSession(created.sessionToken, "ABCD", "p2"),
      ).toBeNull();
    });

    it("returns null and deletes expired session", async () => {
      const created = await registry.createSession({
        playerId: "p1",
        roomCode: "ABCD",
        color: "w",
        isHost: true,
        socketId: "sock-1",
        ttlMs: 1000,
      });

      currentTimestamp += 2000;

      const validated = await registry.validateSession(
        created.sessionToken,
        "ABCD",
        "p1",
      );

      expect(validated).toBeNull();
      expect(registry.sessions.has(created.sessionToken)).toBe(false);
    });
  });

  describe("getSessionByToken", () => {
    it("retrieves active session by token", async () => {
      const created = await registry.createSession({
        playerId: "p1",
        roomCode: "ABCD",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      const fetched = await registry.getSessionByToken(created.sessionToken);

      expect(fetched?.playerId).toBe("p1");
    });

    it("returns null for non-existent token", async () => {
      expect(await registry.getSessionByToken("unknown")).toBeNull();
    });
  });

  describe("getSessionTokenForPlayer", () => {
    it("looks up session token by roomCode and playerId", async () => {
      const created = await registry.createSession({
        playerId: "p1",
        roomCode: "abcd",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      const token = await registry.getSessionTokenForPlayer("ABCD", "p1");
      expect(token).toBe(created.sessionToken);
    });

    it("returns null when player not found in room", async () => {
      expect(await registry.getSessionTokenForPlayer("ABCD", "unknown")).toBeNull();
    });
  });

  describe("touchSession", () => {
    it("updates socketId, lastSeenAt, slides expiresAt, and records in touchCalls", async () => {
      const created = await registry.createSession({
        playerId: "p1",
        roomCode: "ABCD",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      currentTimestamp += 10_000;
      await registry.touchSession(created.sessionToken, "sock-new", 30_000);

      expect(registry.touchCalls).toHaveLength(1);
      expect(registry.touchCalls[0]).toEqual({
        sessionToken: created.sessionToken,
        newSocketId: "sock-new",
        extensionTtlMs: 30_000,
      });

      const updated = await registry.getSessionByToken(created.sessionToken);
      expect(updated?.socketId).toBe("sock-new");
      expect(updated?.lastSeenAt).toBe(1_010_000);
      expect(updated?.expiresAt).toBe(1_040_000);
    });
  });

  describe("updateSessionColor", () => {
    it("updates piece color for player session", async () => {
      const created = await registry.createSession({
        playerId: "p1",
        roomCode: "ABCD",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      await registry.updateSessionColor("ABCD", "p1", "b");

      const updated = await registry.getSessionByToken(created.sessionToken);
      expect(updated?.color).toBe("b");
    });
  });

  describe("deletion methods", () => {
    it("deletes single session by token and records in deleteCalls", async () => {
      const created = await registry.createSession({
        playerId: "p1",
        roomCode: "ABCD",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      const deleted = await registry.deleteSession(created.sessionToken);
      expect(deleted).toBe(true);
      expect(registry.deleteCalls).toContain(created.sessionToken);
      expect(await registry.getSessionByToken(created.sessionToken)).toBeNull();
    });

    it("deletes session by player and records in deleteForPlayerCalls", async () => {
      await registry.createSession({
        playerId: "p1",
        roomCode: "ABCD",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      const deleted = await registry.deleteSessionForPlayer("ABCD", "p1");
      expect(deleted).toBe(true);
      expect(registry.deleteForPlayerCalls).toEqual([
        { roomCode: "ABCD", playerId: "p1" },
      ]);
    });

    it("cascade deletes all sessions for a room and records in deleteForRoomCalls", async () => {
      await registry.createSession({
        playerId: "p1",
        roomCode: "ABCD",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });
      await registry.createSession({
        playerId: "p2",
        roomCode: "ABCD",
        color: "b",
        isHost: false,
        socketId: "sock-2",
      });

      const count = await registry.deleteSessionsForRoom("ABCD");
      expect(count).toBe(2);
      expect(registry.deleteForRoomCalls).toContain("ABCD");
      expect(await registry.getSessionTokenForPlayer("ABCD", "p1")).toBeNull();
      expect(await registry.getSessionTokenForPlayer("ABCD", "p2")).toBeNull();
    });

    it("cleans up expired sessions", async () => {
      await registry.createSession({
        playerId: "p1",
        roomCode: "ABCD",
        color: "w",
        isHost: true,
        socketId: "sock-1",
        ttlMs: 1000,
      });
      await registry.createSession({
        playerId: "p2",
        roomCode: "ABCD",
        color: "b",
        isHost: false,
        socketId: "sock-2",
        ttlMs: 100_000,
      });

      currentTimestamp += 5000;
      const cleaned = await registry.cleanupExpiredSessions();
      expect(cleaned).toBe(1);
      expect(await registry.getSessionTokenForPlayer("ABCD", "p1")).toBeNull();
      expect(await registry.getSessionTokenForPlayer("ABCD", "p2")).not.toBeNull();
    });

    it("clears all records and spy call histories", async () => {
      await registry.createSession({
        playerId: "p1",
        roomCode: "ABCD",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      await registry.clear();
      expect(registry.sessions.size).toBe(0);
      expect(registry.roomIndex.size).toBe(0);
      expect(registry.playerIndex.size).toBe(0);
      expect(registry.createCalls).toHaveLength(0);
    });
  });
});
