import { describe, it, expect, beforeEach } from "vitest";
import { RoomMemberCoordinator } from "../room_member_coordinator.js";
import { MockRoomStore } from "../mock_room.store.js";
import { InMemorySessionRegistry } from "../in_memory_session_registry.js";
import { DisconnectTimerRegistry } from "../disconnect_timer_registry.js";
import { NullLogger } from "../../../platform/logger/null_logger.js";
import {
  type Player,
  type RoomState,
  createInitialGameState,
} from "@fun-chess/shared";
import {
  RoomNotFoundError,
  RoomFullError,
  InvalidRoomCodeError,
  InvalidSessionError,
  PlayerNotInRoomError,
  InvalidPayloadError,
} from "../room.errors.js";
import { createInitialRoomState } from "../room.logic.js";

describe("RoomMemberCoordinator", () => {
  let store: MockRoomStore;
  let sessionRegistry: InMemorySessionRegistry;
  let timerRegistry: DisconnectTimerRegistry;
  let logger: NullLogger;
  let coordinator: RoomMemberCoordinator;

  const createHostPlayer = (id = "p_host", socketId = "sock_host"): Player => ({
    id,
    socketId,
    name: "HostPlayer",
    color: "w",
    isHost: true,
    isConnected: true,
    connectedAt: 1000,
  });

  const createLobbyRoom = (roomCode = "MEMB"): RoomState => ({
    ...createInitialRoomState({
      roomCode,
      hostPlayer: createHostPlayer(),
      createdAt: 1000,
    }),
  });

  beforeEach(() => {
    store = new MockRoomStore();
    sessionRegistry = new InMemorySessionRegistry("test-secret-at-least-16-chars-long", false);
    timerRegistry = new DisconnectTimerRegistry();
    logger = new NullLogger();
    coordinator = new RoomMemberCoordinator(
      store,
      sessionRegistry,
      undefined,
      timerRegistry,
      logger,
    );
  });

  describe("joinRoom", () => {
    it("successfully joins an open room as the second player and creates session", async () => {
      const room = createLobbyRoom();
      await store.save(room);

      const result = await coordinator.joinRoom(
        { roomCode: room.roomCode, playerName: "GuestPlayer" },
        "sock_guest",
      );

      expect(result.room.status).toBe("playing");
      expect(result.player.name).toBe("GuestPlayer");
      expect(result.player.color).toBe("b");
      expect(result.sessionToken).toBeDefined();

      const session = await sessionRegistry.validateSession(
        result.sessionToken,
        room.roomCode,
        result.player.id,
      );
      expect(session).not.toBeNull();
      expect(session?.color).toBe("b");
    });

    it("rejects joining with invalid room code length", async () => {
      await expect(
        coordinator.joinRoom({ roomCode: "INVALID", playerName: "Guest" }, "sock_1"),
      ).rejects.toThrow(InvalidRoomCodeError);
    });

    it("rejects joining with empty player name", async () => {
      const room = createLobbyRoom();
      await store.save(room);

      await expect(
        coordinator.joinRoom({ roomCode: room.roomCode, playerName: "   " }, "sock_1"),
      ).rejects.toThrow(InvalidPayloadError);
    });

    it("rejects joining a non-existent room", async () => {
      await expect(
        coordinator.joinRoom({ roomCode: "NONO", playerName: "Guest" }, "sock_1"),
      ).rejects.toThrow(RoomNotFoundError);
    });

    it("rejects joining when room is already full", async () => {
      const room = createLobbyRoom();
      room.blackPlayer = {
        id: "p_black",
        socketId: "sock_black",
        name: "BlackPlayer",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: 1000,
      };
      room.status = "playing";
      await store.save(room);

      await expect(
        coordinator.joinRoom({ roomCode: room.roomCode, playerName: "ThirdWheel" }, "sock_3"),
      ).rejects.toThrow(RoomFullError);
    });
  });

  describe("reconnect", () => {
    it("successfully restores disconnected player session and cancels disconnect timer", async () => {
      const room = createLobbyRoom();
      room.whitePlayer!.isConnected = false;
      await store.save(room);

      const session = await sessionRegistry.createSession({
        playerId: room.whitePlayer!.id,
        roomCode: room.roomCode,
        color: "w",
        isHost: true,
        socketId: "sock_host_old",
      });

      timerRegistry.set(room.roomCode, room.whitePlayer!.id, {} as any);
      expect(timerRegistry.get(room.roomCode, room.whitePlayer!.id)).toBeDefined();

      const result = await coordinator.reconnect(
        {
          roomCode: room.roomCode,
          playerId: room.whitePlayer!.id,
          sessionToken: session.sessionToken,
        },
        "sock_host_new",
      );

      expect(result.player.isConnected).toBe(true);
      expect(result.player.socketId).toBe("sock_host_new");
      expect(timerRegistry.get(room.roomCode, room.whitePlayer!.id)).toBeUndefined();
    });

    it("rejects reconnection with invalid session token", async () => {
      const room = createLobbyRoom();
      await store.save(room);

      await expect(
        coordinator.reconnect(
          {
            roomCode: room.roomCode,
            playerId: room.whitePlayer!.id,
            sessionToken: "invalid-token",
          },
          "sock_new",
        ),
      ).rejects.toThrow(InvalidSessionError);
    });

    it("rejects reconnection with missing payload fields", async () => {
      await expect(
        coordinator.reconnect(
          {
            roomCode: "",
            playerId: "p1",
            sessionToken: "tok",
          },
          "sock",
        ),
      ).rejects.toThrow(InvalidPayloadError);
    });
  });

  describe("leaveRoom", () => {
    it("deletes room and removes sessions when host leaves an empty room", async () => {
      const room = createLobbyRoom();
      await store.save(room);

      await sessionRegistry.createSession({
        playerId: room.whitePlayer!.id,
        roomCode: room.roomCode,
        color: "w",
        isHost: true,
        socketId: "sock_host",
      });

      const result = await coordinator.leaveRoom(room.roomCode, "sock_host");

      expect(result.shouldDelete).toBe(true);
      expect(result.player.id).toBe(room.whitePlayer!.id);
      expect(await store.findByCode(room.roomCode)).toBeNull();
    });

    it("removes non-host player and preserves room when non-host leaves", async () => {
      const room = createLobbyRoom();
      room.blackPlayer = {
        id: "p_black",
        socketId: "sock_black",
        name: "BlackPlayer",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: 1000,
      };
      room.status = "playing";
      room.game = {
        ...createInitialGameState(),
        status: "playing",
      };
      await store.save(room);

      const result = await coordinator.leaveRoom(room.roomCode, "sock_black");

      expect(result.shouldDelete).toBe(false);
      expect(result.player.id).toBe("p_black");

      const saved = await store.findByCode(room.roomCode);
      expect(saved).not.toBeNull();
      expect(saved?.blackPlayer).toBeNull();
    });

    it("rejects leaveRoom if socket does not belong to the room", async () => {
      const room = createLobbyRoom();
      await store.save(room);

      await expect(
        coordinator.leaveRoom(room.roomCode, "sock_stranger"),
      ).rejects.toThrow(PlayerNotInRoomError);
    });
  });

  describe("updatePlayerSocket", () => {
    it("updates socketId for player in room under lock", async () => {
      const room = createLobbyRoom();
      await store.save(room);

      const updated = await coordinator.updatePlayerSocket(
        room.roomCode,
        room.whitePlayer!.id,
        "sock_brand_new",
      );

      expect(updated.whitePlayer?.socketId).toBe("sock_brand_new");
      expect(updated.whitePlayer?.isConnected).toBe(true);

      const saved = await store.findByCode(room.roomCode);
      expect(saved?.whitePlayer?.socketId).toBe("sock_brand_new");
    });

    it("rejects updatePlayerSocket if player is not in room", async () => {
      const room = createLobbyRoom();
      await store.save(room);

      await expect(
        coordinator.updatePlayerSocket(room.roomCode, "p_unknown", "sock_new"),
      ).rejects.toThrow(PlayerNotInRoomError);
    });
  });
});
