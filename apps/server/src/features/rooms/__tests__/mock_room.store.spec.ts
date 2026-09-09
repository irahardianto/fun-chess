import { describe, it, expect, beforeEach } from "vitest";
import { MockRoomStore } from "../mock_room.store.js";
import {
  RoomState,
  GameState,
  GameOverPayload,
  createInitialGameState,
  createGameOverPayload,
} from "@fun-chess/shared";
import { RoomNotFoundError } from "../room.errors.js";

describe("MockRoomStore (MAJ-018)", () => {
  let store: MockRoomStore;

  const createTestRoom = (roomCode = "MOCK"): RoomState => ({
    roomCode,
    version: 1,
    status: "playing",
    hostId: "p_white",
    whitePlayer: {
      id: "p_white",
      socketId: "sock_white",
      name: "White Player",
      color: "w",
      isHost: true,
      isConnected: true,
      connectedAt: 1000,
    },
    blackPlayer: {
      id: "p_black",
      socketId: "sock_black",
      name: "Black Player",
      color: "b",
      isHost: false,
      isConnected: true,
      connectedAt: 2000,
    },
    spectators: [],
    game: createInitialGameState(),
    drawOffer: null,
    rematch: null,
    createdAt: 1000,
    lastActivityAt: 1000,
  });

  beforeEach(() => {
    store = new MockRoomStore();
  });

  describe("applyGameMove", () => {
    it("applies new game state and updates room version and lastActivityAt", async () => {
      const room = createTestRoom("MOVE");
      await store.save(room);

      const nextGameState: GameState = {
        ...room.game,
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        turn: "b",
        moveCount: 1,
      };

      const updated = await store.applyGameMove("MOVE", nextGameState);

      expect(updated.roomCode).toBe("MOVE");
      expect(updated.game.fen).toBe(nextGameState.fen);
      expect(updated.game.turn).toBe("b");
      expect(updated.game.moveCount).toBe(1);

      const fetched = await store.getRoom("MOVE");
      expect(fetched?.version).toBe(2);
      expect(fetched?.game.moveCount).toBe(1);
      expect(store.saveCalls.length).toBeGreaterThanOrEqual(2);
    });

    it("transitions room to game_over when gameOverPayload is provided", async () => {
      const room = createTestRoom("OVER");
      await store.save(room);

      const nextGameState: GameState = {
        ...room.game,
        fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
        isCheckmate: true,
        moveCount: 4,
      };

      const gameOverPayload: GameOverPayload = createGameOverPayload({
        winner: "b",
        winnerName: "Black Player",
        loserName: "White Player",
        reason: "checkmate",
        finalFen: nextGameState.fen,
        totalMoves: 4,
        startTimeMs: 1000,
      });

      const updated = await store.applyGameMove(
        "OVER",
        nextGameState,
        gameOverPayload,
      );

      expect(updated.status).toBe("game_over");
      expect(updated.game.isCheckmate).toBe(true);

      const stored = await store.findByCode("OVER");
      expect(stored?.status).toBe("game_over");
    });

    it("throws RoomNotFoundError when applying move to non-existent room", async () => {
      const nextGameState = createInitialGameState();
      await expect(store.applyGameMove("NONE", nextGameState)).rejects.toThrow(
        RoomNotFoundError,
      );
    });
  });

  describe("finalizeGame", () => {
    it("updates room status to game_over with provided gameOverPayload", async () => {
      const room = createTestRoom("FINL");
      await store.save(room);

      const gameOverPayload: GameOverPayload = createGameOverPayload({
        winner: "w",
        winnerName: "White Player",
        loserName: "Black Player",
        reason: "resignation",
        finalFen: room.game.fen,
        totalMoves: 10,
        startTimeMs: 1000,
      });

      const updated = await store.finalizeGame("FINL", gameOverPayload);

      expect(updated.status).toBe("game_over");
      const fetched = await store.findByCode("FINL");
      expect(fetched?.status).toBe("game_over");
    });

    it("throws RoomNotFoundError when finalizing a non-existent room", async () => {
      const gameOverPayload: GameOverPayload = createGameOverPayload({
        winner: "draw",
        reason: "agreement",
        finalFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        totalMoves: 0,
        startTimeMs: 1000,
      });

      await expect(store.finalizeGame("MISS", gameOverPayload)).rejects.toThrow(
        RoomNotFoundError,
      );
    });
  });

  describe("updateDrawOffer", () => {
    it("records active draw offer and clears it", async () => {
      const room = createTestRoom("DRAW");
      await store.save(room);

      const drawOffer: RoomState["drawOffer"] = {
        offeredBy: "p_white",
        offeredAt: 1500,
      };

      const updatedWithOffer = await store.updateDrawOffer("DRAW", drawOffer);
      expect(updatedWithOffer.drawOffer).toEqual(drawOffer);

      const updatedCleared = await store.updateDrawOffer("DRAW", null);
      expect(updatedCleared.drawOffer).toBeNull();
    });

    it("throws RoomNotFoundError when updating draw offer on non-existent room", async () => {
      await expect(
        store.updateDrawOffer("NOPE", {
          offeredBy: "p_white",
          offeredAt: 1000,
        }),
      ).rejects.toThrow(RoomNotFoundError);
    });
  });

  describe("updateRematch", () => {
    it("records rematch state and resets game state and players on accept", async () => {
      const room = createTestRoom("REMT");
      room.status = "game_over";
      await store.save(room);

      const requestedRematch: RoomState["rematch"] = {
        offeredBy: "p_white",
        status: "offered",
      };

      const updatedOffered = await store.updateRematch(
        "REMT",
        requestedRematch,
      );
      expect(updatedOffered.rematch?.status).toBe("offered");

      // Now accept rematch with new game state and swapped player colors
      const newGameState = createInitialGameState();
      const swappedPlayers = {
        whitePlayer: { ...room.blackPlayer!, color: "w" as const },
        blackPlayer: { ...room.whitePlayer!, color: "b" as const },
      };

      const acceptedRematch: RoomState["rematch"] = {
        offeredBy: "p_white",
        status: "accepted",
      };

      const updatedAccepted = await store.updateRematch(
        "REMT",
        acceptedRematch,
        newGameState,
        swappedPlayers,
      );

      expect(updatedAccepted.status).toBe("playing");
      expect(updatedAccepted.whitePlayer?.id).toBe("p_black");
      expect(updatedAccepted.blackPlayer?.id).toBe("p_white");
      expect(updatedAccepted.game.moveCount).toBe(0);
    });

    it("throws RoomNotFoundError when updating rematch on non-existent room", async () => {
      await expect(
        store.updateRematch("VOID", { offeredBy: "p_1", status: "offered" }),
      ).rejects.toThrow(RoomNotFoundError);
    });
  });

  describe("clear", () => {
    it("empties stored rooms and resets call tracking arrays", async () => {
      await store.save(createTestRoom("RM1"));
      await store.save(createTestRoom("RM2"));
      await store.delete("RM1");

      expect(await store.count()).toBe(1);
      expect(store.saveCalls.length).toBe(2);
      expect(store.deleteCalls.length).toBe(1);

      await store.clear();

      expect(await store.count()).toBe(0);
      expect(store.saveCalls.length).toBe(0);
      expect(store.deleteCalls.length).toBe(0);
      expect(await store.findByCode("RM2")).toBeNull();
    });
  });
});
