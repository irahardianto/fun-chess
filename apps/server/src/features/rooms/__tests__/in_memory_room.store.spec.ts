import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRoomStore } from "../in_memory_room.store.js";
import { RoomState } from "@fun-chess/shared";

describe("InMemoryRoomStore", () => {
  let store: InMemoryRoomStore;

  const createDummyRoom = (roomCode: string): RoomState => ({
    roomCode,
    status: "lobby",
    hostId: "host_1",
    whitePlayer: {
      id: "p_white",
      socketId: "sock_white",
      name: "Player White",
      color: "w",
      isHost: true,
      isConnected: true,
      sessionToken: "token_white",
      connectedAt: Date.now(),
    },
    blackPlayer: {
      id: "p_black",
      socketId: "sock_black",
      name: "Player Black",
      color: "b",
      isHost: false,
      isConnected: true,
      sessionToken: "token_black",
      connectedAt: Date.now(),
    },
    spectators: [
      {
        id: "p_spec",
        socketId: "sock_spec",
        name: "Spectator",
        color: "w",
        isHost: false,
        isConnected: true,
        sessionToken: "token_spec",
        connectedAt: Date.now(),
      },
    ],
    game: {
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      turn: "w",
      isCheck: false,
      isCheckmate: false,
      isDraw: false,
      isStalemate: false,
      isThreefoldRepetition: false,
      isInsufficientMaterial: false,
      isFiftyMoveRule: false,
      moveHistory: [],
      capturedWhite: [],
      capturedBlack: [],
      materialAdvantage: { white: 0, black: 0 },
      lastMove: null,
      moveCount: 0,
    },
    rematch: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  });

  beforeEach(() => {
    store = new InMemoryRoomStore();
  });

  it("saves and finds a room by case-insensitive room code", async () => {
    const room = createDummyRoom("star");
    await store.save(room);

    const foundLower = await store.findByCode("star");
    const foundUpper = await store.findByCode("STAR");

    expect(foundLower).not.toBeNull();
    expect(foundLower?.roomCode).toBe("star");
    expect(foundUpper).not.toBeNull();
    expect(foundUpper?.roomCode).toBe("star");
  });

  it("returns null when room code is not found", async () => {
    const found = await store.findByCode("NONE");
    expect(found).toBeNull();
  });

  it("finds room by socketId for white player, black player, and spectator", async () => {
    const room = createDummyRoom("MOON");
    await store.save(room);

    const whiteMatch = await store.findBySocketId("sock_white");
    expect(whiteMatch).not.toBeNull();
    expect(whiteMatch?.playerId).toBe("p_white");

    const blackMatch = await store.findBySocketId("sock_black");
    expect(blackMatch).not.toBeNull();
    expect(blackMatch?.playerId).toBe("p_black");

    const specMatch = await store.findBySocketId("sock_spec");
    expect(specMatch).not.toBeNull();
    expect(specMatch?.playerId).toBe("p_spec");

    const noMatch = await store.findBySocketId("sock_unknown");
    expect(noMatch).toBeNull();
  });

  it("deletes room by code", async () => {
    const room = createDummyRoom("SUNN");
    await store.save(room);
    expect(await store.count()).toBe(1);

    const deleted = await store.delete("sunn");
    expect(deleted).toBe(true);
    expect(await store.count()).toBe(0);
    expect(await store.findByCode("SUNN")).toBeNull();
  });

  it("lists all active rooms", async () => {
    await store.save(createDummyRoom("R001"));
    await store.save(createDummyRoom("R002"));
    await store.save(createDummyRoom("R003"));

    const list = await store.listActiveRooms();
    expect(list).toHaveLength(3);
    expect(await store.count()).toBe(3);
  });

  it("guarantees deep immutability so external mutations do not contaminate store", async () => {
    const room = createDummyRoom("SAFE");
    await store.save(room);

    const fetched = await store.findByCode("SAFE");
    if (fetched && fetched.whitePlayer) {
      fetched.whitePlayer.name = "HACKED_NAME";
    }

    const reFetched = await store.findByCode("SAFE");
    expect(reFetched?.whitePlayer?.name).toBe("Player White");
  });
});
