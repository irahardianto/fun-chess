import { describe, it, expect, beforeEach } from "vitest";
import { RoomService } from "../room.service.js";
import { MockRoomStore } from "../mock_room.store.js";
import { InMemorySessionRegistry } from "../in_memory_session_registry.js";
import {
  RoomNotFoundError,
  RoomFullError,
  InvalidRoomCodeError,
  UnauthorizedError,
  PlayerNotInRoomError,
  InvalidPayloadError,
} from "../room.errors.js";

describe("RoomService", () => {
  let store: MockRoomStore;
  let sessionRegistry: InMemorySessionRegistry;
  let service: RoomService;

  beforeEach(() => {
    store = new MockRoomStore();
    sessionRegistry = new InMemorySessionRegistry();
    service = new RoomService(store, sessionRegistry);
  });

  describe("createRoom", () => {
    it("creates a room with 4-letter uppercase code and correct host player without sessionToken on Player", async () => {
      const { room, sessionToken } = await service.createRoom(
        { playerName: "Leo", preferredColor: "w" },
        "sock_host",
      );

      expect(room.roomCode).toMatch(/^[A-Z0-9]{4}$/);
      expect(room.status).toBe("lobby");
      expect(room.hostId).toBeDefined();
      expect(room.whitePlayer).not.toBeNull();
      expect(room.whitePlayer?.name).toBe("Leo");
      expect(room.whitePlayer?.isHost).toBe(true);
      expect(room.whitePlayer?.socketId).toBe("sock_host");
      expect(room.blackPlayer).toBeNull();

      // Invariant: sessionToken returned in result, NEVER stored on Player in room
      expect(sessionToken).toBeDefined();
      expect((room.whitePlayer as any)?.sessionToken).toBeUndefined();
      expect((room.blackPlayer as any)?.sessionToken).toBeUndefined();

      // Invariant: session registered in SessionRegistry
      const session = await sessionRegistry.validateSession(
        sessionToken,
        room.roomCode,
        room.hostId,
      );
      expect(session).not.toBeNull();
      expect(session?.playerId).toBe(room.hostId);

      expect(store.saveCalls).toHaveLength(1);
    });

    it("supports host choosing black pieces", async () => {
      const { room, sessionToken } = await service.createRoom(
        { playerName: "Maya", preferredColor: "b" },
        "sock_host",
      );

      expect(room.blackPlayer?.name).toBe("Maya");
      expect(room.whitePlayer).toBeNull();
      expect((room.blackPlayer as any)?.sessionToken).toBeUndefined();
      expect(sessionToken).toBeDefined();
    });

    it("supports random color choice", async () => {
      const { room } = await service.createRoom(
        { playerName: "Alex", preferredColor: "random" },
        "sock_host",
      );

      const hasOnePlayer =
        Boolean(room.whitePlayer) !== Boolean(room.blackPlayer);
      expect(hasOnePlayer).toBe(true);
    });

    it("rejects empty or whitespace-only player name", async () => {
      await expect(
        service.createRoom({ playerName: "   " }, "sock_1"),
      ).rejects.toThrow(InvalidPayloadError);
    });

    it("rejects player name longer than 20 characters", async () => {
      await expect(
        service.createRoom(
          { playerName: "ThisNameIsWayTooLongForChess" },
          "sock_1",
        ),
      ).rejects.toThrow(InvalidPayloadError);
    });
  });

  describe("joinRoom", () => {
    it("allows player 2 to join, transitions room to playing, and registers session without sessionToken on Player", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "HostPlayer", preferredColor: "w" },
        "sock_1",
      );

      const {
        room: joined,
        player,
        sessionToken,
      } = await service.joinRoom(
        { roomCode: created.roomCode, playerName: "JoinerPlayer" },
        "sock_2",
      );

      expect(joined.status).toBe("playing");
      expect(joined.blackPlayer?.name).toBe("JoinerPlayer");
      expect(player.color).toBe("b");
      expect(player.isHost).toBe(false);

      // Invariant: sessionToken returned in result, NOT on Player model
      expect(sessionToken).toBeDefined();
      expect((player as any)?.sessionToken).toBeUndefined();
      expect((joined.blackPlayer as any)?.sessionToken).toBeUndefined();
      expect((joined.whitePlayer as any)?.sessionToken).toBeUndefined();

      // Invariant: session registered in SessionRegistry
      const session = await sessionRegistry.validateSession(
        sessionToken,
        joined.roomCode,
        player.id,
      );
      expect(session).not.toBeNull();
      expect(session?.playerId).toBe(player.id);
    });

    it("assigns white if host chose black", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "HostPlayer", preferredColor: "b" },
        "sock_1",
      );

      const { player } = await service.joinRoom(
        { roomCode: created.roomCode, playerName: "JoinerPlayer" },
        "sock_2",
      );

      expect(player.color).toBe("w");
    });

    it("rejects joining a non-existent room", async () => {
      await expect(
        service.joinRoom({ roomCode: "NOPE", playerName: "Joiner" }, "sock_2"),
      ).rejects.toThrow(RoomNotFoundError);
    });

    it("rejects joining a full room", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "P1", preferredColor: "w" },
        "sock_1",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "P2" },
        "sock_2",
      );

      await expect(
        service.joinRoom(
          { roomCode: created.roomCode, playerName: "P3" },
          "sock_3",
        ),
      ).rejects.toThrow(RoomFullError);
    });

    it("rejects invalid room code format", async () => {
      await expect(
        service.joinRoom({ roomCode: "12", playerName: "Joiner" }, "sock_2"),
      ).rejects.toThrow(InvalidRoomCodeError);
    });
  });

  describe("reconnect", () => {
    it("validates against SessionRegistry, restores dropped player socket, and unpauses game", async () => {
      const { room: created, sessionToken: p1Token } = await service.createRoom(
        { playerName: "P1", preferredColor: "w" },
        "sock_1",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "P2" },
        "sock_2",
      );

      // Simulate disconnect
      await service.handleDisconnect("sock_1");
      const disconnectedRoom = await service.getRoom(created.roomCode);
      expect(disconnectedRoom?.status).toBe("paused_disconnect");
      expect(disconnectedRoom?.whitePlayer?.isConnected).toBe(false);

      // Reconnect P1 with valid token from SessionRegistry
      const { room: reconnectedRoom, player } = await service.reconnect(
        {
          roomCode: created.roomCode,
          playerId: created.hostId,
          sessionToken: p1Token,
        },
        "sock_1_new",
      );

      expect(player.socketId).toBe("sock_1_new");
      expect(player.isConnected).toBe(true);
      expect(reconnectedRoom.status).toBe("playing");
    });

    it("rejects reconnect with invalid session token", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "P1", preferredColor: "w" },
        "sock_1",
      );

      await expect(
        service.reconnect(
          {
            roomCode: created.roomCode,
            playerId: created.hostId,
            sessionToken: "invalid_token",
          },
          "sock_new",
        ),
      ).rejects.toThrow(UnauthorizedError);
    });

    it("rejects reconnect with expired session token in SessionRegistry", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "P1", preferredColor: "w" },
        "sock_1",
      );

      // Create an expired session record directly in registry
      const expiredSession = await sessionRegistry.createSession({
        playerId: created.hostId,
        roomCode: created.roomCode,
        color: "w",
        isHost: true,
        socketId: "sock_1",
        ttlMs: -1000,
      });

      await expect(
        service.reconnect(
          {
            roomCode: created.roomCode,
            playerId: created.hostId,
            sessionToken: expiredSession.sessionToken,
          },
          "sock_new",
        ),
      ).rejects.toThrow(UnauthorizedError);
    });

    it("rejects reconnect when player ID does not match session", async () => {
      const { room: created, sessionToken } = await service.createRoom(
        { playerName: "P1", preferredColor: "w" },
        "sock_1",
      );

      await expect(
        service.reconnect(
          {
            roomCode: created.roomCode,
            playerId: "wrong_player_id",
            sessionToken,
          },
          "sock_new",
        ),
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("leaveRoom & handleDisconnect", () => {
    it("deletes room and deletes sessions when host leaves lobby", async () => {
      const { room: created, sessionToken } = await service.createRoom(
        { playerName: "Host", preferredColor: "w" },
        "sock_1",
      );

      const { shouldDelete } = await service.leaveRoom(
        created.roomCode,
        "sock_1",
      );
      expect(shouldDelete).toBe(true);
      expect(await service.getRoom(created.roomCode)).toBeNull();

      // Invariant: cascade session deletion on room delete
      expect(
        await sessionRegistry.validateSession(
          sessionToken,
          created.roomCode,
          created.hostId,
        ),
      ).toBeNull();
    });

    it("awards abandonment victory when a player leaves during active match", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "WhiteHost", preferredColor: "w" },
        "sock_w",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "BlackJoiner" },
        "sock_b",
      );

      const result = await service.leaveRoom(created.roomCode, "sock_b");

      expect(result.shouldDelete).toBe(false);
      expect(result.room.status).toBe("game_over");
      expect(result.gameOverPayload).toBeDefined();
      expect(result.gameOverPayload?.winner).toBe("w");
      expect(result.gameOverPayload?.winnerName).toBe("WhiteHost");
      expect(result.gameOverPayload?.reason).toBe("abandonment");
      expect(result.gameOverPayload?.message).toContain(
        "BlackJoiner left the game. WhiteHost won by abandonment!",
      );

      const saved = await service.getRoom(created.roomCode);
      expect(saved?.status).toBe("game_over");
    });

    it("awards abandonment victory to black when white host leaves active match", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "WhiteHost", preferredColor: "w" },
        "sock_w",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "BlackJoiner" },
        "sock_b",
      );

      const result = await service.leaveRoom(created.roomCode, "sock_w");

      expect(result.shouldDelete).toBe(false);
      expect(result.room.status).toBe("game_over");
      expect(result.gameOverPayload?.winner).toBe("b");
      expect(result.gameOverPayload?.winnerName).toBe("BlackJoiner");
    });

    it("awards abandonment victory if player leaves during paused_disconnect state", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "WhiteHost", preferredColor: "w" },
        "sock_w",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "BlackJoiner" },
        "sock_b",
      );

      await service.handleDisconnect("sock_w");

      const result = await service.leaveRoom(created.roomCode, "sock_b");

      expect(result.shouldDelete).toBe(false);
      expect(result.room.status).toBe("game_over");
      expect(result.gameOverPayload?.winner).toBe("w");
      expect(result.gameOverPayload?.reason).toBe("abandonment");
    });

    it("rejects leaveRoom if socket does not belong to room", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "Host", preferredColor: "w" },
        "sock_1",
      );

      await expect(
        service.leaveRoom(created.roomCode, "sock_stranger"),
      ).rejects.toThrow(PlayerNotInRoomError);
    });

    it("cleans up abandoned rooms older than maxAge, deletes sessions, and cancels disconnect timers", async () => {
      const { room: created, sessionToken: hostToken } =
        await service.createRoom(
          { playerName: "Host", preferredColor: "w" },
          "sock_1",
        );
      const { sessionToken: joinerToken, player: joiner } =
        await service.joinRoom(
          { roomCode: created.roomCode, playerName: "Joiner" },
          "sock_2",
        );

      // Verify sessions exist before cleanup
      expect(
        await sessionRegistry.validateSession(
          hostToken,
          created.roomCode,
          created.hostId,
        ),
      ).not.toBeNull();
      expect(
        await sessionRegistry.validateSession(
          joinerToken,
          created.roomCode,
          joiner.id,
        ),
      ).not.toBeNull();

      // Trigger disconnect so a disconnect timer exists
      await service.handleDisconnect("sock_1");

      const currentRoom = (await service.getRoom(created.roomCode))!;
      currentRoom.lastActivityAt = Date.now() - 15 * 60 * 1000; // 15 mins ago
      await store.save(currentRoom);

      const count = await service.cleanupAbandonedRooms(10 * 60 * 1000);
      expect(count).toBe(1);
      expect(await service.getRoom(created.roomCode)).toBeNull();

      // Invariant: cascade deletion of sessions
      expect(
        await sessionRegistry.validateSession(
          hostToken,
          created.roomCode,
          created.hostId,
        ),
      ).toBeNull();
      expect(
        await sessionRegistry.validateSession(
          joinerToken,
          created.roomCode,
          joiner.id,
        ),
      ).toBeNull();
    });

    it("cleans up expired sessions via cleanupExpiredSessions", async () => {
      const { room: created, sessionToken } = await service.createRoom(
        { playerName: "Host", preferredColor: "w" },
        "sock_host",
      );

      // Verify session exists
      expect(
        await sessionRegistry.validateSession(
          sessionToken,
          created.roomCode,
          created.hostId,
        ),
      ).not.toBeNull();

      // Fast forward expiry: set session expiresAt to past
      const sessionRecord = (sessionRegistry as any).sessions.get(sessionToken);
      if (sessionRecord) {
        sessionRecord.expiresAt = Date.now() - 1000;
      }

      const cleaned = await service.cleanupExpiredSessions();
      expect(cleaned).toBe(1);

      // Session is now gone
      expect(
        await sessionRegistry.validateSession(
          sessionToken,
          created.roomCode,
          created.hostId,
        ),
      ).toBeNull();
    });
  });

  describe("handleAbandonmentForfeit", () => {
    it("awards win by abandonment to opponent when disconnected player times out", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "WhiteHost", preferredColor: "w" },
        "sock_w",
      );
      const { player: blackPlayer } = await service.joinRoom(
        { roomCode: created.roomCode, playerName: "BlackJoiner" },
        "sock_b",
      );

      // White drops socket
      await service.handleDisconnect("sock_w");
      const disconnectedRoom = await service.getRoom(created.roomCode);
      expect(disconnectedRoom?.status).toBe("paused_disconnect");

      // Abandonment timeout fires
      const result = await service.handleAbandonmentForfeit(
        created.roomCode,
        created.hostId,
      );
      expect(result).not.toBeNull();
      expect(result?.room.status).toBe("game_over");
      expect(result?.gameOverPayload.winner).toBe("b");
      expect(result?.gameOverPayload.winnerName).toBe("BlackJoiner");
      expect(result?.gameOverPayload.reason).toBe("abandonment");
      expect(result?.gameOverPayload.message).toContain(
        "WhiteHost disconnected. BlackJoiner won by abandonment!",
      );

      const savedRoom = await service.getRoom(created.roomCode);
      expect(savedRoom?.status).toBe("game_over");
    });

    it("awards win to White if Black player drops and times out", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "WhiteHost", preferredColor: "w" },
        "sock_w",
      );
      const { player: blackPlayer } = await service.joinRoom(
        { roomCode: created.roomCode, playerName: "BlackJoiner" },
        "sock_b",
      );

      // Black drops socket
      await service.handleDisconnect("sock_b");

      // Abandonment timeout fires
      const result = await service.handleAbandonmentForfeit(
        created.roomCode,
        blackPlayer.id,
      );
      expect(result).not.toBeNull();
      expect(result?.gameOverPayload.winner).toBe("w");
      expect(result?.gameOverPayload.winnerName).toBe("WhiteHost");
      expect(result?.gameOverPayload.reason).toBe("abandonment");
    });

    it("returns null if room is not in paused_disconnect state", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "WhiteHost", preferredColor: "w" },
        "sock_w",
      );
      const result = await service.handleAbandonmentForfeit(
        created.roomCode,
        created.hostId,
      );
      expect(result).toBeNull();
    });

    it("returns null if disconnected player already reconnected", async () => {
      const { room: created, sessionToken: wToken } = await service.createRoom(
        { playerName: "WhiteHost", preferredColor: "w" },
        "sock_w",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "BlackJoiner" },
        "sock_b",
      );

      await service.handleDisconnect("sock_w");
      await service.reconnect(
        {
          roomCode: created.roomCode,
          playerId: created.hostId,
          sessionToken: wToken,
        },
        "sock_w_new",
      );

      const result = await service.handleAbandonmentForfeit(
        created.roomCode,
        created.hostId,
      );
      expect(result).toBeNull();
    });

    it("returns game_over with draw when BOTH players are disconnected on timeout", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "WhiteHost", preferredColor: "w" },
        "sock_w",
      );
      const { player: blackPlayer } = await service.joinRoom(
        { roomCode: created.roomCode, playerName: "BlackJoiner" },
        "sock_b",
      );

      // Both players drop socket
      await service.handleDisconnect("sock_w");
      await service.handleDisconnect("sock_b");

      const disconnectedRoom = await service.getRoom(created.roomCode);
      expect(disconnectedRoom?.status).toBe("paused_disconnect");
      expect(disconnectedRoom?.whitePlayer?.isConnected).toBe(false);
      expect(disconnectedRoom?.blackPlayer?.isConnected).toBe(false);

      // Timeout fires for White
      const result = await service.handleAbandonmentForfeit(
        created.roomCode,
        created.hostId,
      );

      expect(result).not.toBeNull();
      expect(result?.room.status).toBe("game_over");
      expect(result?.gameOverPayload.winner).toBe("draw");
      expect(result?.gameOverPayload.winnerName).toBeUndefined();
      expect(result?.gameOverPayload.reason).toBe("abandonment");
      expect(result?.gameOverPayload.message).toBe(
        "Both players disconnected. Game ended by abandonment.",
      );

      const savedRoom = await service.getRoom(created.roomCode);
      expect(savedRoom?.status).toBe("game_over");
    });

    it("returns null for non-existent room", async () => {
      const result = await service.handleAbandonmentForfeit("NONO", "some_id");
      expect(result).toBeNull();
    });
  });
});
