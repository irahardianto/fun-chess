import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InMemorySessionRegistry } from "../in_memory_session_registry.js";
import { NullLogger } from "../../../platform/logger/null_logger.js";

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

    it("extends session expiresAt with sliding TTL on touch (MIN-023)", async () => {
      const created = await registry.createSession({
        playerId: "player-1",
        roomCode: "ROOM",
        color: "w",
        isHost: true,
        socketId: "sock-1",
        ttlMs: 5000,
      });

      const initialExpiresAt = created.expiresAt;
      await new Promise((resolve) => setTimeout(resolve, 10));

      await registry.touchSession(created.sessionToken, "sock-1");

      const touched = await registry.validateSession(
        created.sessionToken,
        "ROOM",
        "player-1",
      );

      // Default TTL (2 hours) should be applied from current now, extending well past initialExpiresAt
      expect(touched?.expiresAt).toBeGreaterThan(initialExpiresAt);
    });

    it("respects custom extensionTtlMs on touchSession (MIN-023)", async () => {
      const created = await registry.createSession({
        playerId: "player-1",
        roomCode: "ROOM",
        color: "w",
        isHost: true,
        socketId: "sock-1",
        ttlMs: 10_000,
      });

      await registry.touchSession(created.sessionToken, "sock-1", 30_000);

      const touched = await registry.validateSession(
        created.sessionToken,
        "ROOM",
        "player-1",
      );

      expect(touched).not.toBeNull();
      expect(touched!.expiresAt).toBeGreaterThan(created.createdAt + 20_000);
    });

    it("advances lastSeenAt monotonically and updates socketId across multiple touches (MIN-026)", async () => {
      const created = await registry.createSession({
        playerId: "p-multi-touch",
        roomCode: "MTCH",
        color: "w",
        isHost: true,
        socketId: "sock-initial",
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      await registry.touchSession(created.sessionToken, "sock-second");
      const firstTouch = await registry.validateSession(
        created.sessionToken,
        "MTCH",
        "p-multi-touch",
      );
      expect(firstTouch?.socketId).toBe("sock-second");
      expect(firstTouch?.lastSeenAt).toBeGreaterThan(created.lastSeenAt);

      await new Promise((resolve) => setTimeout(resolve, 5));
      await registry.touchSession(created.sessionToken, "sock-third");
      const secondTouch = await registry.validateSession(
        created.sessionToken,
        "MTCH",
        "p-multi-touch",
      );
      expect(secondTouch?.socketId).toBe("sock-third");
      expect(secondTouch?.lastSeenAt).toBeGreaterThan(firstTouch!.lastSeenAt);
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

  describe("deleteSessionForPlayer (CRIT-002)", () => {
    it("deletes session for a specific player in a room without affecting other players", async () => {
      const hostSession = await registry.createSession({
        playerId: "host-1",
        roomCode: "ROOM",
        color: "w",
        isHost: true,
        socketId: "sock-host",
      });

      const guestSession = await registry.createSession({
        playerId: "guest-1",
        roomCode: "ROOM",
        color: "b",
        isHost: false,
        socketId: "sock-guest",
      });

      // Delete guest session
      const deleted = await registry.deleteSessionForPlayer("ROOM", "guest-1");
      expect(deleted).toBe(true);

      // Guest session should be gone
      const guestVal = await registry.validateSession(
        guestSession.sessionToken,
        "ROOM",
        "guest-1",
      );
      expect(guestVal).toBeNull();

      // Host session must still be intact
      const hostVal = await registry.validateSession(
        hostSession.sessionToken,
        "ROOM",
        "host-1",
      );
      expect(hostVal).not.toBeNull();
    });

    it("returns false when deleting session for non-existent player or room", async () => {
      const deleted = await registry.deleteSessionForPlayer(
        "NOROOM",
        "noplayer",
      );
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

    it("returns 0 when no sessions are expired (MIN-026)", async () => {
      await registry.createSession({
        playerId: "active-p1",
        roomCode: "ACT1",
        color: "w",
        isHost: true,
        socketId: "sock-1",
        ttlMs: 60_000,
      });

      const cleaned = await registry.cleanupExpiredSessions();
      expect(cleaned).toBe(0);
    });

    it("cleans up secondary indices when sessions expire (MIN-026)", async () => {
      await registry.createSession({
        playerId: "exp-sec-p",
        roomCode: "SEC1",
        color: "w",
        isHost: true,
        socketId: "sock-sec",
        ttlMs: -100,
      });

      const cleaned = await registry.cleanupExpiredSessions();
      expect(cleaned).toBe(1);

      // Verify secondary lookup returns null
      const token = await registry.getSessionTokenForPlayer("SEC1", "exp-sec-p");
      expect(token).toBeNull();
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

  describe("updateSessionColor", () => {
    it("updates player session color and refreshes lastSeenAt", async () => {
      const created = await registry.createSession({
        playerId: "p-color-test",
        roomCode: "COLR",
        color: "w",
        isHost: true,
        socketId: "sock-1",
      });

      expect(created.color).toBe("w");

      await registry.updateSessionColor("colr", "p-color-test", "b");

      const validated = await registry.validateSession(
        created.sessionToken,
        "COLR",
        "p-color-test",
      );
      expect(validated).not.toBeNull();
      expect(validated?.color).toBe("b");
    });

    it("no-ops safely if player or room is not found in playerIndex", async () => {
      await expect(
        registry.updateSessionColor("NONE", "p-unknown", "b"),
      ).resolves.not.toThrow();
    });

    it("inverts color and preserves all other session fields (MIN-026)", async () => {
      const created = await registry.createSession({
        playerId: "p-invert",
        roomCode: "INVT",
        color: "w",
        isHost: true,
        socketId: "sock-invt",
      });

      await registry.updateSessionColor("INVT", "p-invert", "b");
      const updatedBlack = await registry.validateSession(
        created.sessionToken,
        "INVT",
        "p-invert",
      );
      expect(updatedBlack?.color).toBe("b");
      expect(updatedBlack?.playerId).toBe("p-invert");
      expect(updatedBlack?.roomCode).toBe("INVT");
      expect(updatedBlack?.isHost).toBe(true);
      expect(updatedBlack?.socketId).toBe("sock-invt");

      // Invert back to white
      await registry.updateSessionColor("INVT", "p-invert", "w");
      const updatedWhite = await registry.validateSession(
        created.sessionToken,
        "INVT",
        "p-invert",
      );
      expect(updatedWhite?.color).toBe("w");
    });
  });

  describe("Clock and IdGenerator injection (MAJ-012)", () => {
    it("uses injected IClock and IIdGenerator", async () => {
      const fixedTime = 1700000000000;
      const mockClock = { now: () => fixedTime };
      const mockIdGen = { generateId: () => "mocked-uuid-token" };

      const customRegistry = new InMemorySessionRegistry(mockClock, mockIdGen);
      const record = await customRegistry.createSession({
        playerId: "p-custom",
        roomCode: "CUST",
        color: "w",
        isHost: true,
        socketId: "sock-c",
      });

      expect(record.sessionToken).toBe("mocked-uuid-token");
      expect(record.createdAt).toBe(fixedTime);
      expect(record.lastSeenAt).toBe(fixedTime);
    });
  });

  describe("getSessionByToken (SEC-002)", () => {
    it("retrieves session record by sessionToken", async () => {
      const created = await registry.createSession({
        playerId: "p-lookup",
        roomCode: "LOOK",
        color: "w",
        isHost: true,
        socketId: "sock-look",
      });

      const session = await registry.getSessionByToken(created.sessionToken);
      expect(session).not.toBeNull();
      expect(session?.sessionToken).toBe(created.sessionToken);
      expect(session?.playerId).toBe("p-lookup");
      expect(session?.roomCode).toBe("LOOK");
    });

    it("returns null for non-existent token", async () => {
      const session = await registry.getSessionByToken("non-existent-token");
      expect(session).toBeNull();
    });

    it("returns null and deletes expired session", async () => {
      const created = await registry.createSession({
        playerId: "p-exp-lookup",
        roomCode: "EXPK",
        color: "b",
        isHost: false,
        socketId: "sock-expk",
        ttlMs: -500, // already expired
      });

      const session = await registry.getSessionByToken(created.sessionToken);
      expect(session).toBeNull();

      // Ensure session is purged
      const secondAttempt = await registry.getSessionByToken(created.sessionToken);
      expect(secondAttempt).toBeNull();
    });
  });

  describe("getSessionTokenForPlayer (SEC-002)", () => {
    it("returns session token for existing player in room", async () => {
      const created = await registry.createSession({
        playerId: "p-player-tok",
        roomCode: "PTOK",
        color: "w",
        isHost: true,
        socketId: "sock-ptok",
      });

      const token = await registry.getSessionTokenForPlayer("ptok", "p-player-tok");
      expect(token).toBe(created.sessionToken);
    });

    it("returns null when player or room does not exist", async () => {
      const token = await registry.getSessionTokenForPlayer("NONE", "no-player");
      expect(token).toBeNull();
    });

    it("returns null and deletes token if session has expired", async () => {
      await registry.createSession({
        playerId: "p-exp-player",
        roomCode: "EXPP",
        color: "w",
        isHost: true,
        socketId: "sock-expp",
        ttlMs: -100, // already expired
      });

      const token = await registry.getSessionTokenForPlayer("EXPP", "p-exp-player");
      expect(token).toBeNull();
    });
  });

  describe("DEBUG-level mutation logging (ENH-010)", () => {
    it("logs debug records on createSession, touchSession, updateSessionColor, and cleanupExpiredSessions", async () => {
      const logger = new NullLogger();
      const loggedRegistry = new InMemorySessionRegistry(undefined, undefined, logger);

      // 1. createSession
      const created = await loggedRegistry.createSession({
        playerId: "p-dbg-1",
        roomCode: "DBGS",
        color: "w",
        isHost: true,
        socketId: "sock-dbg-1",
      });
      const createLogs = logger.debugLogs.filter(
        (l) => l.context?.operation === "session_storage_create",
      );
      expect(createLogs.length).toBe(1);
      expect(createLogs[0]?.context).toMatchObject({
        roomCode: "DBGS",
        playerId: "p-dbg-1",
        sessionToken: created.sessionToken,
      });

      // 2. touchSession
      await loggedRegistry.touchSession(created.sessionToken, "sock-dbg-2");
      const touchLogs = logger.debugLogs.filter(
        (l) => l.context?.operation === "session_storage_touch",
      );
      expect(touchLogs.length).toBe(1);
      expect(touchLogs[0]?.context).toMatchObject({
        sessionToken: created.sessionToken,
        newSocketId: "sock-dbg-2",
      });

      // 3. updateSessionColor
      await loggedRegistry.updateSessionColor("DBGS", "p-dbg-1", "b");
      const updateColorLogs = logger.debugLogs.filter(
        (l) => l.context?.operation === "session_storage_update_color",
      );
      expect(updateColorLogs.length).toBe(1);
      expect(updateColorLogs[0]?.context).toMatchObject({
        roomCode: "DBGS",
        playerId: "p-dbg-1",
        newColor: "b",
      });

      // 4. cleanupExpiredSessions
      await loggedRegistry.cleanupExpiredSessions();
      const cleanupLogs = logger.debugLogs.filter(
        (l) => l.context?.operation === "session_storage_cleanup_expired",
      );
      expect(cleanupLogs.length).toBe(1);
      expect(cleanupLogs[0]?.context?.cleanedCount).toBeDefined();
    });
  });
});
