import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InMemorySessionRegistry } from "../in_memory_session_registry.js";

describe("InMemorySessionRegistry", () => {
  let registry: InMemorySessionRegistry;

  beforeEach(() => {
    registry = new InMemorySessionRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createSession", () => {
    it("creates a session with valid metadata, unique token, and normalized uppercase roomCode", async () => {
      const record = await registry.createSession({
        playerId: "p-123",
        roomCode: "abcd",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      expect(record.sessionToken).toBeDefined();
      expect(typeof record.sessionToken).toBe("string");
      expect(record.playerId).toBe("p-123");
      expect(record.roomCode).toBe("ABCD");
      expect(record.color).toBe("w");
      expect(record.isHost).toBe(true);
      expect(record.socketId).toBe("sock-1");
      expect(record.createdAt).toBeLessThanOrEqual(Date.now());
      expect(record.lastSeenAt).toBe(record.createdAt);
      expect(record.expiresAt).toBeGreaterThan(record.createdAt);
    });

    it("respects custom ttlMs when provided", async () => {
      const customTtl = 5000;
      const record = await registry.createSession({
        playerId: "p-456",
        roomCode: "XYZW",
        color: "b",
        isHost: false,
        socketId: "sock-2",
        ttlMs: customTtl,
      });

      expect(record.expiresAt).toBe(record.createdAt + customTtl);
    });
  });

  describe("validateSession", () => {
    it("validates and returns session record for matching token, roomCode, and playerId", async () => {
      const created = await registry.createSession({
        playerId: "player-1",
        roomCode: "ROOM",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      const validated = await registry.validateSession(
        created.sessionToken,
        "room", // case-insensitive verification
        "player-1",
      );

      expect(validated).not.toBeNull();
      expect(validated?.sessionToken).toBe(created.sessionToken);
      expect(validated?.playerId).toBe("player-1");
      expect(validated?.roomCode).toBe("ROOM");
    });

    it("returns null when session token does not exist", async () => {
      const result = await registry.validateSession(
        "non-existent-token",
        "ROOM",
        "player-1",
      );

      expect(result).toBeNull();
    });

    it("returns null when roomCode does not match", async () => {
      const created = await registry.createSession({
        playerId: "player-1",
        roomCode: "ROOM",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      const result = await registry.validateSession(
        created.sessionToken,
        "DIFF",
        "player-1",
      );

      expect(result).toBeNull();
    });

    it("returns null when playerId does not match", async () => {
      const created = await registry.createSession({
        playerId: "player-1",
        roomCode: "ROOM",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      const result = await registry.validateSession(
        created.sessionToken,
        "ROOM",
        "wrong-player",
      );

      expect(result).toBeNull();
    });

    it("returns null and deletes session if token is past expiresAt", async () => {
      const created = await registry.createSession({
        playerId: "player-1",
        roomCode: "ROOM",
        color: "w",
        isHost: true,
        socketId: "sock-1",
        ttlMs: -1000, // already expired
      });

      const result = await registry.validateSession(
        created.sessionToken,
        "ROOM",
        "player-1",
      );

      expect(result).toBeNull();

      // Ensure it was purged from the registry
      const secondAttempt = await registry.validateSession(
        created.sessionToken,
        "ROOM",
        "player-1",
      );
      expect(secondAttempt).toBeNull();
    });
  });

  describe("touchSession", () => {
    it("updates socketId and lastSeenAt timestamp for active session", async () => {
      const created = await registry.createSession({
        playerId: "player-1",
        roomCode: "ROOM",
        color: "w",
        isHost: true,
        socketId: "sock-old",
      });

      // Small wait to ensure timestamp increment
      await new Promise((resolve) => setTimeout(resolve, 5));

      await registry.touchSession(created.sessionToken, "sock-new");

      const validated = await registry.validateSession(
        created.sessionToken,
        "ROOM",
        "player-1",
      );

      expect(validated?.socketId).toBe("sock-new");
      expect(validated?.lastSeenAt).toBeGreaterThanOrEqual(created.lastSeenAt);
    });

    it("safely handles touch on non-existent session token", async () => {
      await expect(
        registry.touchSession("invalid-token", "sock-new"),
      ).resolves.toBeUndefined();
    });
  });

  describe("deleteSession", () => {
    it("deletes an existing session and cleans up indices", async () => {
      const created = await registry.createSession({
        playerId: "player-1",
        roomCode: "ROOM",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      const deleted = await registry.deleteSession(created.sessionToken);
      expect(deleted).toBe(true);

      const validated = await registry.validateSession(
        created.sessionToken,
        "ROOM",
        "player-1",
      );
      expect(validated).toBeNull();
    });

    it("returns false when deleting a non-existent session", async () => {
      const deleted = await registry.deleteSession("missing-token");
      expect(deleted).toBe(false);
    });
  });

  describe("deleteSessionsForRoom (cascade deletion)", () => {
    it("removes all player sessions associated with the given room code", async () => {
      const p1Session = await registry.createSession({
        playerId: "player-1",
        roomCode: "ROOM",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      const p2Session = await registry.createSession({
        playerId: "player-2",
        roomCode: "ROOM",
        color: "b",
        isHost: false,
        socketId: "sock-2",
      });

      const otherSession = await registry.createSession({
        playerId: "player-3",
        roomCode: "OTHER",
        color: "w",
        isHost: true,
        socketId: "sock-3",
      });

      const deletedCount = await registry.deleteSessionsForRoom("room");
      expect(deletedCount).toBe(2);

      expect(
        await registry.validateSession(
          p1Session.sessionToken,
          "ROOM",
          "player-1",
        ),
      ).toBeNull();
      expect(
        await registry.validateSession(
          p2Session.sessionToken,
          "ROOM",
          "player-2",
        ),
      ).toBeNull();

      // Other room sessions must remain untouched
      const otherValidated = await registry.validateSession(
        otherSession.sessionToken,
        "OTHER",
        "player-3",
      );
      expect(otherValidated).not.toBeNull();
    });

    it("returns 0 when deleting sessions for room with no sessions", async () => {
      const deletedCount = await registry.deleteSessionsForRoom("EMPTY");
      expect(deletedCount).toBe(0);
    });
  });

  describe("cleanupExpiredSessions", () => {
    it("purges all sessions past expiresAt and preserves active ones", async () => {
      const activeSession = await registry.createSession({
        playerId: "active-p",
        roomCode: "ACTV",
        color: "w",
        isHost: true,
        socketId: "sock-actv",
        ttlMs: 60_000,
      });

      const expiredSession1 = await registry.createSession({
        playerId: "exp-p1",
        roomCode: "EXP1",
        color: "w",
        isHost: true,
        socketId: "sock-exp1",
        ttlMs: -1000,
      });

      const expiredSession2 = await registry.createSession({
        playerId: "exp-p2",
        roomCode: "EXP2",
        color: "b",
        isHost: false,
        socketId: "sock-exp2",
        ttlMs: -500,
      });

      const cleanedCount = await registry.cleanupExpiredSessions();
      expect(cleanedCount).toBe(2);

      expect(
        await registry.validateSession(
          activeSession.sessionToken,
          "ACTV",
          "active-p",
        ),
      ).not.toBeNull();
      expect(
        await registry.validateSession(
          expiredSession1.sessionToken,
          "EXP1",
          "exp-p1",
        ),
      ).toBeNull();
      expect(
        await registry.validateSession(
          expiredSession2.sessionToken,
          "EXP2",
          "exp-p2",
        ),
      ).toBeNull();
    });
  });

  describe("clear", () => {
    it("completely resets all sessions and indices", async () => {
      const session = await registry.createSession({
        playerId: "p-1",
        roomCode: "ROOM",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      await registry.clear();

      expect(
        await registry.validateSession(session.sessionToken, "ROOM", "p-1"),
      ).toBeNull();
    });
  });
});
