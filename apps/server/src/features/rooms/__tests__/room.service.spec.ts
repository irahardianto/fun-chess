import { describe, it, expect, beforeEach } from "vitest";
import { RoomService } from "../room.service.js";
import { MockRoomStore } from "../mock_room.store.js";
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
  let service: RoomService;

  beforeEach(() => {
    store = new MockRoomStore();
    service = new RoomService(store);
  });

  describe("createRoom", () => {
    it("creates a room with 4-letter uppercase code and correct host player", async () => {
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
      expect(sessionToken).toBeDefined();
      expect(store.saveCalls).toHaveLength(1);
    });

    it("supports host choosing black pieces", async () => {
      const { room } = await service.createRoom(
        { playerName: "Maya", preferredColor: "b" },
        "sock_host",
      );

      expect(room.blackPlayer?.name).toBe("Maya");
      expect(room.whitePlayer).toBeNull();
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
    it("allows player 2 to join and transitions room to playing", async () => {
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
      expect(sessionToken).toBeDefined();
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
    it("restores dropped player socket and unpauses game", async () => {
      const { room: created, sessionToken: p1Token } = await service.createRoom(
        { playerName: "P1", preferredColor: "w" },
        "sock_1",
      );
      const { player: p2 } = await service.joinRoom(
        { roomCode: created.roomCode, playerName: "P2" },
        "sock_2",
      );

      // Simulate disconnect
      await service.handleDisconnect("sock_1");
      const disconnectedRoom = await service.getRoom(created.roomCode);
      expect(disconnectedRoom?.status).toBe("paused_disconnect");
      expect(disconnectedRoom?.whitePlayer?.isConnected).toBe(false);

      // Reconnect P1
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

    it("rejects invalid session token", async () => {
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
  });

  describe("leaveRoom & handleDisconnect", () => {
    it("deletes room when host leaves lobby", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "Host", preferredColor: "w" },
        "sock_1",
      );

      const { shouldDelete } = await service.leaveRoom(
        created.roomCode,
        "sock_1",
      );
      expect(shouldDelete).toBe(true);
      expect(await service.getRoom(created.roomCode)).toBeNull();
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

    it("cleans up abandoned rooms older than maxAge", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "Host", preferredColor: "w" },
        "sock_1",
      );
      created.lastActivityAt = Date.now() - 15 * 60 * 1000; // 15 mins ago
      await store.save(created);

      const count = await service.cleanupAbandonedRooms(10 * 60 * 1000);
      expect(count).toBe(1);
      expect(await service.getRoom(created.roomCode)).toBeNull();
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

    it("returns null for non-existent room", async () => {
      const result = await service.handleAbandonmentForfeit("NONO", "some_id");
      expect(result).toBeNull();
    });
  });
});
