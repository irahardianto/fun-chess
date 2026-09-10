import { describe, it, expect, vi } from "vitest";
import {
  type RoomState,
  type Player,
  GameNotActiveError,
  PlayerNotInRoomError,
  InvalidPayloadError,
  createInitialGameState,
} from "@fun-chess/shared";
import { RematchCoordinator } from "../rematch_coordinator.js";
import type { IRoomStore } from "../room.store.js";
import type { ISessionRegistry } from "../session_registry.js";
import { createInitialRoomState } from "../room.logic.js";

describe("RematchCoordinator (MAJ-017)", () => {
  const whitePlayer: Player = {
    id: "p_white",
    socketId: "sock_white",
    name: "White",
    color: "w",
    isHost: true,
    isConnected: true,
    connectedAt: 1000,
  };

  const blackPlayer: Player = {
    id: "p_black",
    socketId: "sock_black",
    name: "Black",
    color: "b",
    isHost: false,
    isConnected: true,
    connectedAt: 2000,
  };

  const createGameOverRoom = (roomCode = "REMT"): RoomState => {
    return {
      ...createInitialRoomState({
        roomCode,
        hostPlayer: whitePlayer,
        createdAt: 1000,
      }),
      blackPlayer,
      status: "game_over",
      game: createInitialGameState(),
    };
  };

  const createMockStore = (initialRoom: RoomState): IRoomStore => {
    let currentRoom = structuredClone(initialRoom);
    return {
      findByCode: vi.fn(async () => structuredClone(currentRoom)),
      findBySocketId: vi.fn(),
      mutate: vi.fn(async (_code, mutator) => {
        const cloned = structuredClone(currentRoom);
        const { updatedRoom, result } = await mutator(cloned);
        currentRoom = updatedRoom;
        return result;
      }),
      withLock: vi.fn(),
      save: vi.fn(async (room) => {
        currentRoom = structuredClone(room);
      }),
      createIfAbsent: vi.fn(),
      delete: vi.fn(),
      listActiveRooms: vi.fn(),
      count: vi.fn(),
      clear: vi.fn(),
    };
  };

  const createMockSessionRegistry = (): ISessionRegistry => {
    return {
      createSession: vi.fn(),
      validateSession: vi.fn(),
      touchSession: vi.fn(),
      updateSessionColor: vi.fn(),
      invalidateSession: vi.fn(),
      clearRoomSessions: vi.fn(),
      cleanupExpiredSessions: vi.fn(),
    };
  };

  it("records a rematch request from a participant when game is over", async () => {
    const room = createGameOverRoom();
    const store = createMockStore(room);
    const sessionRegistry = createMockSessionRegistry();
    const coordinator = new RematchCoordinator(store, sessionRegistry, { now: () => 5000 });

    const updated = await coordinator.requestRematch("REMT", "p_white");

    expect(updated.status).toBe("rematch_pending");
    expect(updated.rematch).toEqual({
      requestedBy: "p_white",
      requestedAt: 5000,
      status: "pending",
    });
  });

  it("rejects requestRematch if room is not in game_over status", async () => {
    const room = createGameOverRoom();
    room.status = "playing";
    const store = createMockStore(room);
    const sessionRegistry = createMockSessionRegistry();
    const coordinator = new RematchCoordinator(store, sessionRegistry);

    await expect(coordinator.requestRematch("REMT", "p_white")).rejects.toThrow(
      GameNotActiveError,
    );
  });

  it("rejects requestRematch if player is not in room", async () => {
    const room = createGameOverRoom();
    const store = createMockStore(room);
    const sessionRegistry = createMockSessionRegistry();
    const coordinator = new RematchCoordinator(store, sessionRegistry);

    await expect(coordinator.requestRematch("REMT", "p_imposter")).rejects.toThrow(
      PlayerNotInRoomError,
    );
  });

  it("accepts a rematch, swaps player colors, resets game, and updates session colors", async () => {
    const room = createGameOverRoom();
    room.status = "rematch_pending";
    room.rematch = {
      requestedBy: "p_white",
      requestedAt: 4000,
      status: "pending",
    };

    const store = createMockStore(room);
    const sessionRegistry = createMockSessionRegistry();
    const coordinator = new RematchCoordinator(store, sessionRegistry, { now: () => 6000 });

    const { room: updated, newGame } = await coordinator.acceptRematch("REMT", "p_black", "test-corr");

    expect(updated.status).toBe("playing");
    expect(updated.rematch?.status).toBe("accepted");
    expect(updated.whitePlayer?.id).toBe("p_black");
    expect(updated.whitePlayer?.color).toBe("w");
    expect(updated.blackPlayer?.id).toBe("p_white");
    expect(updated.blackPlayer?.color).toBe("b");
    expect(newGame.fen).toBe(createInitialGameState().fen);

    // Verify session registry updates
    expect(sessionRegistry.updateSessionColor).toHaveBeenCalledWith(
      "REMT",
      "p_black",
      "w",
      { correlationId: "test-corr" },
    );
    expect(sessionRegistry.updateSessionColor).toHaveBeenCalledWith(
      "REMT",
      "p_white",
      "b",
      { correlationId: "test-corr" },
    );
  });

  it("rejects acceptRematch if no rematch is pending", async () => {
    const room = createGameOverRoom();
    room.rematch = null;
    const store = createMockStore(room);
    const sessionRegistry = createMockSessionRegistry();
    const coordinator = new RematchCoordinator(store, sessionRegistry);

    await expect(coordinator.acceptRematch("REMT", "p_black")).rejects.toThrow(
      GameNotActiveError,
    );
  });

  it("rejects acceptRematch if player attempts to accept own request", async () => {
    const room = createGameOverRoom();
    room.rematch = {
      requestedBy: "p_white",
      requestedAt: 4000,
      status: "pending",
    };
    const store = createMockStore(room);
    const sessionRegistry = createMockSessionRegistry();
    const coordinator = new RematchCoordinator(store, sessionRegistry);

    await expect(coordinator.acceptRematch("REMT", "p_white")).rejects.toThrow(
      InvalidPayloadError,
    );
  });

  it("rejects acceptRematch if either player is disconnected", async () => {
    const room = createGameOverRoom();
    room.rematch = {
      requestedBy: "p_white",
      requestedAt: 4000,
      status: "pending",
    };
    if (room.blackPlayer) {
      room.blackPlayer.isConnected = false;
    }
    const store = createMockStore(room);
    const sessionRegistry = createMockSessionRegistry();
    const coordinator = new RematchCoordinator(store, sessionRegistry);

    await expect(coordinator.acceptRematch("REMT", "p_black")).rejects.toThrow(
      GameNotActiveError,
    );
  });

  it("declines a pending rematch request", async () => {
    const room = createGameOverRoom();
    room.rematch = {
      requestedBy: "p_white",
      requestedAt: 4000,
      status: "pending",
    };
    const store = createMockStore(room);
    const sessionRegistry = createMockSessionRegistry();
    const coordinator = new RematchCoordinator(store, sessionRegistry, { now: () => 7000 });

    const updated = await coordinator.declineRematch("REMT", "p_black");

    expect(updated.rematch?.status).toBe("declined");
    expect(updated.status).toBe("game_over");
  });

  it("rejects declineRematch if player attempts to decline own request", async () => {
    const room = createGameOverRoom();
    room.rematch = {
      requestedBy: "p_white",
      requestedAt: 4000,
      status: "pending",
    };
    const store = createMockStore(room);
    const sessionRegistry = createMockSessionRegistry();
    const coordinator = new RematchCoordinator(store, sessionRegistry);

    await expect(coordinator.declineRematch("REMT", "p_white")).rejects.toThrow(
      InvalidPayloadError,
    );
  });
});
