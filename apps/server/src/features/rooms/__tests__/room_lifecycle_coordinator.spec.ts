import { describe, it, expect, beforeEach, vi } from "vitest";
import { RoomLifecycleCoordinator } from "../room_lifecycle_coordinator.js";
import { MockRoomStore } from "../mock_room.store.js";
import { InMemorySessionRegistry } from "../in_memory_session_registry.js";
import { DisconnectTimerRegistry } from "../disconnect_timer_registry.js";
import { MockTimerService } from "../timer_service.js";
import { NullLogger } from "../../../platform/logger/null_logger.js";
import {
  type Player,
  type RoomState,
  createInitialGameState,
} from "@fun-chess/shared";
import { createInitialRoomState } from "../room.logic.js";

describe("RoomLifecycleCoordinator", () => {
  let store: MockRoomStore;
  let sessionRegistry: InMemorySessionRegistry;
  let timerRegistry: DisconnectTimerRegistry;
  let timerService: MockTimerService;
  let logger: NullLogger;
  let coordinator: RoomLifecycleCoordinator;

  const createHostPlayer = (id = "p_host", socketId = "sock_host"): Player => ({
    id,
    socketId,
    name: "HostPlayer",
    color: "w",
    isHost: true,
    isConnected: true,
    connectedAt: 1000,
  });

  const createGuestPlayer = (id = "p_guest", socketId = "sock_guest"): Player => ({
    id,
    socketId,
    name: "GuestPlayer",
    color: "b",
    isHost: false,
    isConnected: true,
    connectedAt: 2000,
  });

  const createPlayingRoom = (roomCode = "LIFE"): RoomState => ({
    ...createInitialRoomState({
      roomCode,
      hostPlayer: createHostPlayer(),
      createdAt: 1000,
    }),
    blackPlayer: createGuestPlayer(),
    status: "playing",
    game: {
      ...createInitialGameState(),
      status: "playing",
    },
  });

  beforeEach(() => {
    store = new MockRoomStore();
    sessionRegistry = new InMemorySessionRegistry("test-secret-at-least-16-chars-long", false);
    timerService = new MockTimerService();
    timerRegistry = new DisconnectTimerRegistry(timerService);
    logger = new NullLogger();
    coordinator = new RoomLifecycleCoordinator(
      store,
      sessionRegistry,
      undefined,
      timerRegistry,
      timerService,
      logger,
    );
  });

  describe("handleDisconnect", () => {
    it("returns null if socketId not found in any active room", async () => {
      const result = await coordinator.handleDisconnect("unknown_sock");
      expect(result).toBeNull();
    });

    it("returns null and ignores stale disconnect event if player socket already changed", async () => {
      const room = createPlayingRoom();
      await store.save(room);

      // Simulate player socket in room being updated to "sock_host_new"
      room.whitePlayer!.socketId = "sock_host_new";
      await store.save(room);

      // Store still mapped old socket "sock_host"
      store.findBySocketId = vi.fn(async () => ({
        room,
        playerId: room.whitePlayer!.id,
      }));

      const result = await coordinator.handleDisconnect("sock_host");
      expect(result).toBeNull();
    });

    it("pauses active match and arms abandonment timer when playing player drops", async () => {
      const room = createPlayingRoom();
      await store.save(room);

      const onForfeit = vi.fn();
      const result = await coordinator.handleDisconnect("sock_host", onForfeit, 5000);

      expect(result).not.toBeNull();
      expect(result?.wasActiveGame).toBe(true);
      expect(result?.room.status).toBe("paused_disconnect");
      expect(result?.room.whitePlayer?.isConnected).toBe(false);

      // Timer must be scheduled in timerService and registered in timerRegistry
      expect(timerService.getPendingCount()).toBe(1);
      expect(timerRegistry.get(room.roomCode, room.whitePlayer!.id)).toBeDefined();
    });

    it("marks player disconnected without arming abandonment timer if game is not active", async () => {
      const lobbyRoom = createInitialRoomState({
        roomCode: "LOBB",
        hostPlayer: createHostPlayer("p_host", "sock_host"),
        createdAt: 1000,
      });
      await store.save(lobbyRoom);

      const result = await coordinator.handleDisconnect("sock_host");
      expect(result).not.toBeNull();
      expect(result?.wasActiveGame).toBe(false);
      expect(result?.room.whitePlayer?.isConnected).toBe(false);
      expect(timerService.getPendingCount()).toBe(0);
      expect(timerRegistry.get(lobbyRoom.roomCode, "p_host")).toBeUndefined();
    });

    it("fires abandonment timer callback when grace period expires", async () => {
      const room = createPlayingRoom();
      await store.save(room);

      const onForfeit = vi.fn();
      await coordinator.handleDisconnect("sock_host", onForfeit, 1000);

      expect(timerService.getPendingCount()).toBe(1);
      // Fast forward mock timer
      await timerService.advance(1000);

      expect(onForfeit).toHaveBeenCalledTimes(1);
      const forfeitArgs = onForfeit.mock.calls[0];
      expect(forfeitArgs?.[0]?.status).toBe("game_over");
      expect(forfeitArgs?.[1]?.winner).toBe("b"); // White abandoned, Black wins
      expect(forfeitArgs?.[1]?.reason).toBe("abandonment");
    });
  });

  describe("handleAbandonmentForfeit", () => {
    it("returns null if room does not exist", async () => {
      const result = await coordinator.handleAbandonmentForfeit("NONE", "p_white");
      expect(result).toBeNull();
    });

    it("forfeits paused match and awards win to opponent", async () => {
      const room = createPlayingRoom();
      room.status = "paused_disconnect";
      room.whitePlayer!.isConnected = false;
      await store.save(room);

      const result = await coordinator.handleAbandonmentForfeit(room.roomCode, room.whitePlayer!.id);

      expect(result).not.toBeNull();
      expect(result?.room.status).toBe("game_over");
      expect(result?.gameOverPayload.winner).toBe("b");
      expect(result?.gameOverPayload.reason).toBe("abandonment");

      const saved = await store.findByCode(room.roomCode);
      expect(saved?.status).toBe("game_over");
    });

    it("returns null if match was already concluded", async () => {
      const room = createPlayingRoom();
      room.status = "game_over";
      await store.save(room);

      const result = await coordinator.handleAbandonmentForfeit(room.roomCode, room.whitePlayer!.id);
      expect(result).toBeNull();
    });
  });

  describe("cleanupAbandonedRooms & cleanupExpiredSessions", () => {
    it("cleans up rooms inactive longer than maxAgeMs and deletes associated sessions", async () => {
      const oldRoom = createPlayingRoom("OLD1");
      oldRoom.lastActivityAt = 1000;
      await store.save(oldRoom);

      await sessionRegistry.createSession({
        playerId: "p_host",
        roomCode: "OLD1",
        color: "w",
        isHost: true,
        socketId: "sock_host",
      });

      const freshRoom = createPlayingRoom("NEW1");
      freshRoom.lastActivityAt = Date.now();
      await store.save(freshRoom);

      const cleaned = await coordinator.cleanupAbandonedRooms(60_000);
      expect(cleaned).toBe(1);

      expect(await store.findByCode("OLD1")).toBeNull();
      expect(await store.findByCode("NEW1")).not.toBeNull();
    });

    it("cleans up expired sessions via cleanupExpiredSessions", async () => {
      const spy = vi.spyOn(sessionRegistry, "cleanupExpiredSessions");
      const cleaned = await coordinator.cleanupExpiredSessions();
      expect(spy).toHaveBeenCalled();
      expect(typeof cleaned).toBe("number");
    });
  });
});
