import { describe, it, expect, vi } from "vitest";
import {
  type RoomState,
  type Player,
  GameNotActiveError,
  PlayerNotInRoomError,
  InvalidPayloadError,
  createInitialGameState,
} from "@fun-chess/shared";
import { DrawCoordinator } from "../draw_coordinator.js";
import type { IRoomStore } from "../room.store.js";
import { createInitialRoomState } from "../room.logic.js";

describe("DrawCoordinator (MAJ-017)", () => {
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

  const createPlayingRoom = (roomCode = "DRAW"): RoomState => {
    return {
      ...createInitialRoomState({
        roomCode,
        hostPlayer: whitePlayer,
        createdAt: 1000,
      }),
      blackPlayer,
      status: "playing",
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

  it("records a draw offer from an active participant", async () => {
    const room = createPlayingRoom();
    const store = createMockStore(room);
    const coordinator = new DrawCoordinator(store, { now: () => 3000 });

    const updated = await coordinator.offerDraw("DRAW", "p_white");

    expect(updated.drawOffer).toEqual({
      offeredBy: "p_white",
      offeredAt: 3000,
    });
  });

  it("rejects offerDraw if room is not playing", async () => {
    const room = createPlayingRoom();
    room.status = "game_over";
    const store = createMockStore(room);
    const coordinator = new DrawCoordinator(store);

    await expect(coordinator.offerDraw("DRAW", "p_white")).rejects.toThrow(
      GameNotActiveError,
    );
  });

  it("rejects offerDraw if player is not in room", async () => {
    const room = createPlayingRoom();
    const store = createMockStore(room);
    const coordinator = new DrawCoordinator(store);

    await expect(coordinator.offerDraw("DRAW", "p_stranger")).rejects.toThrow(
      PlayerNotInRoomError,
    );
  });

  it("accepts a pending draw offer, ending the match by agreement", async () => {
    const room = createPlayingRoom();
    room.drawOffer = { offeredBy: "p_white", offeredAt: 2500 };
    const store = createMockStore(room);
    const coordinator = new DrawCoordinator(store, { now: () => 4000 });

    const { room: updated, gameOver } = await coordinator.acceptDraw("DRAW", "p_black");

    expect(updated.status).toBe("game_over");
    expect(updated.drawOffer).toBeNull();
    expect(gameOver.winner).toBe("draw");
    expect(gameOver.reason).toBe("draw_agreement");
  });

  it("rejects acceptDraw if no draw offer is pending", async () => {
    const room = createPlayingRoom();
    room.drawOffer = null;
    const store = createMockStore(room);
    const coordinator = new DrawCoordinator(store);

    await expect(coordinator.acceptDraw("DRAW", "p_black")).rejects.toThrow(
      GameNotActiveError,
    );
  });

  it("rejects acceptDraw if player tries to accept their own offer", async () => {
    const room = createPlayingRoom();
    room.drawOffer = { offeredBy: "p_white", offeredAt: 2500 };
    const store = createMockStore(room);
    const coordinator = new DrawCoordinator(store);

    await expect(coordinator.acceptDraw("DRAW", "p_white")).rejects.toThrow(
      InvalidPayloadError,
    );
  });

  it("declines a pending draw offer, resetting drawOffer to null", async () => {
    const room = createPlayingRoom();
    room.drawOffer = { offeredBy: "p_white", offeredAt: 2500 };
    const store = createMockStore(room);
    const coordinator = new DrawCoordinator(store, { now: () => 4500 });

    const updated = await coordinator.declineDraw("DRAW", "p_black");

    expect(updated.status).toBe("playing");
    expect(updated.drawOffer).toBeNull();
  });

  it("rejects declineDraw if player tries to decline their own offer", async () => {
    const room = createPlayingRoom();
    room.drawOffer = { offeredBy: "p_white", offeredAt: 2500 };
    const store = createMockStore(room);
    const coordinator = new DrawCoordinator(store);

    await expect(coordinator.declineDraw("DRAW", "p_white")).rejects.toThrow(
      InvalidPayloadError,
    );
  });

  it("clears pending draw offer on move via cancelDrawOnMove", () => {
    const room = createPlayingRoom();
    room.drawOffer = { offeredBy: "p_white", offeredAt: 2500 };
    const coordinator = new DrawCoordinator(createMockStore(room));

    const updated = coordinator.cancelDrawOnMove(room);
    expect(updated.drawOffer).toBeNull();

    // When already null, returns unchanged reference
    const unchanged = coordinator.cancelDrawOnMove(updated);
    expect(unchanged).toBe(updated);
  });
});
