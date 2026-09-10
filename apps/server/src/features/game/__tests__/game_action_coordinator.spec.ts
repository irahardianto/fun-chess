import { describe, it, expect, beforeEach } from "vitest";
import { GameActionCoordinator } from "../game_action_coordinator.js";
import { GamePlayerResolver } from "../game_player_resolver.js";
import { MockRoomGameAdapter } from "./mock_room_adapter.js";
import { MockSessionRegistry } from "../../rooms/index.js";
import {
  type RoomState,
  RoomNotFoundError,
  GameNotActiveError,
  PlayerNotInRoomError,
  InvalidPayloadError,
  type IClock,
} from "@fun-chess/shared";
import { ChessEngine } from "../chess_engine.js";
import { Chess } from "chess.js";
import { NullLogger } from "../../../platform/logger/null_logger.js";
import { SystemClock } from "../../../platform/time/index.js";

describe("GameActionCoordinator", () => {
  let store: MockRoomGameAdapter;
  let sessionRegistry: MockSessionRegistry;
  let clock: IClock;
  let logger: NullLogger;
  let playerResolver: GamePlayerResolver;
  let coordinator: GameActionCoordinator;

  const createActiveGameRoom = (
    code = "ACT",
    customFen?: string,
  ): RoomState => {
    const chess = customFen ? new Chess(customFen) : new Chess();
    const now = Date.now();
    return {
      roomCode: code,
      status: "playing",
      hostId: "p_white_id",
      whitePlayer: {
        id: "p_white_id",
        socketId: "sock_white",
        name: "White Player",
        color: "w",
        isHost: true,
        isConnected: true,
        connectedAt: now,
        createdAt: now - 30000,
        updatedAt: now - 5000,
      },
      blackPlayer: {
        id: "p_black_id",
        socketId: "sock_black",
        name: "Black Player",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: now,
        createdAt: now - 30000,
        updatedAt: now - 5000,
      },
      spectators: [],
      game: ChessEngine.extractGameState(chess, null),
      rematch: null,
      drawOffer: null,
      createdAt: now - 30000,
      lastActivityAt: now - 5000,
    };
  };

  beforeEach(() => {
    store = new MockRoomGameAdapter();
    sessionRegistry = new MockSessionRegistry();
    clock = new SystemClock();
    logger = new NullLogger();
    playerResolver = new GamePlayerResolver(store, sessionRegistry, logger);
    coordinator = new GameActionCoordinator(
      store,
      clock,
      logger,
      playerResolver,
    );
  });

  describe("resign", () => {
    it("concedes game when white player resigns, declaring black as winner", async () => {
      const room = createActiveGameRoom("RESIGN");
      await store.save(room);

      const { room: updatedRoom, gameOverPayload } = await coordinator.resign(
        "RESIGN",
        "sock_white",
      );

      expect(gameOverPayload.winner).toBe("b");
      expect(gameOverPayload.reason).toBe("resignation");
      expect(gameOverPayload.winnerName).toBe("Black Player");
      expect(gameOverPayload.message).toContain("White Player resigned");
      expect(updatedRoom.status).toBe("game_over");
      expect(store.finalizeGameCalls).toHaveLength(1);
    });

    it("concedes game when black player resigns, declaring white as winner", async () => {
      const room = createActiveGameRoom("RESIGN_B");
      await store.save(room);

      const { gameOverPayload } = await coordinator.resign(
        "RESIGN_B",
        "sock_black",
      );

      expect(gameOverPayload.winner).toBe("w");
      expect(gameOverPayload.reason).toBe("resignation");
      expect(gameOverPayload.winnerName).toBe("White Player");
    });

    it("throws RoomNotFoundError when room does not exist", async () => {
      await expect(
        coordinator.resign("NONEXIST", "sock_white"),
      ).rejects.toThrow(RoomNotFoundError);
    });

    it("throws GameNotActiveError when room is not in playing status", async () => {
      const room = createActiveGameRoom("OVER");
      room.status = "game_over";
      await store.save(room);

      await expect(coordinator.resign("OVER", "sock_white")).rejects.toThrow(
        GameNotActiveError,
      );
    });

    it("throws PlayerNotInRoomError when socket is not in room", async () => {
      const room = createActiveGameRoom("RESIGN_STRANGER");
      await store.save(room);

      await expect(
        coordinator.resign("RESIGN_STRANGER", "sock_stranger"),
      ).rejects.toThrow(PlayerNotInRoomError);
    });
  });

  describe("offerDraw", () => {
    it("records pending draw offer from white player targeting black player", async () => {
      const room = createActiveGameRoom("DRAW");
      await store.save(room);

      const result = await coordinator.offerDraw("DRAW", "sock_white");

      expect(result.fromPlayer.id).toBe("p_white_id");
      expect(result.opponentPlayer?.id).toBe("p_black_id");
      expect(result.room.drawOffer?.offeredBy).toBe("p_white_id");
      expect(store.updateDrawOfferCalls).toHaveLength(1);
    });

    it("records pending draw offer from black player targeting white player", async () => {
      const room = createActiveGameRoom("DRAW_B");
      await store.save(room);

      const result = await coordinator.offerDraw("DRAW_B", "sock_black");

      expect(result.fromPlayer.id).toBe("p_black_id");
      expect(result.opponentPlayer?.id).toBe("p_white_id");
    });

    it("throws RoomNotFoundError when room does not exist", async () => {
      await expect(
        coordinator.offerDraw("NONEXIST", "sock_white"),
      ).rejects.toThrow(RoomNotFoundError);
    });

    it("throws GameNotActiveError when room is not in playing state", async () => {
      const room = createActiveGameRoom("NOT_PLAYING");
      room.status = "lobby";
      await store.save(room);

      await expect(
        coordinator.offerDraw("NOT_PLAYING", "sock_white"),
      ).rejects.toThrow(GameNotActiveError);
    });
  });

  describe("respondDraw", () => {
    it("declines draw offer and clears pending offer from room", async () => {
      const room = createActiveGameRoom("DECLINE_DRAW");
      room.drawOffer = {
        offeredBy: "p_white_id",
        offeredAt: Date.now() - 1000,
      };
      await store.save(room);

      const result = await coordinator.respondDraw(
        "DECLINE_DRAW",
        "sock_black",
        false,
      );

      expect(result.accept).toBe(false);
      expect(result.byPlayerId).toBe("p_black_id");
      expect(result.room.drawOffer).toBeNull();
      expect(result.gameOverPayload).toBeUndefined();
    });

    it("accepts draw offer and finalizes game with draw_agreement", async () => {
      const room = createActiveGameRoom("ACCEPT_DRAW");
      room.drawOffer = {
        offeredBy: "p_white_id",
        offeredAt: Date.now() - 1000,
      };
      await store.save(room);

      const result = await coordinator.respondDraw(
        "ACCEPT_DRAW",
        "sock_black",
        true,
      );

      expect(result.accept).toBe(true);
      expect(result.byPlayerId).toBe("p_black_id");
      expect(result.gameOverPayload?.winner).toBe("draw");
      expect(result.gameOverPayload?.reason).toBe("draw_agreement");
      expect(result.room.status).toBe("game_over");
    });

    it("throws GameNotActiveError when no draw offer is currently pending", async () => {
      const room = createActiveGameRoom("NO_DRAW");
      room.drawOffer = null;
      await store.save(room);

      await expect(
        coordinator.respondDraw("NO_DRAW", "sock_black", true),
      ).rejects.toThrow(GameNotActiveError);
    });

    it("throws InvalidPayloadError when player responds to their own draw offer", async () => {
      const room = createActiveGameRoom("SELF_DRAW");
      room.drawOffer = {
        offeredBy: "p_white_id",
        offeredAt: Date.now() - 1000,
      };
      await store.save(room);

      await expect(
        coordinator.respondDraw("SELF_DRAW", "sock_white", true),
      ).rejects.toThrow(InvalidPayloadError);
    });
  });

  describe("requestRematch", () => {
    it("initiates rematch request following game over", async () => {
      const room = createActiveGameRoom("REMATCH");
      room.status = "game_over";
      await store.save(room);

      const result = await coordinator.requestRematch("REMATCH", "sock_white");

      expect(result.requestedBy).toBe("p_white_id");
      expect(result.requesterName).toBe("White Player");
      expect(result.room.status).toBe("rematch_pending");
      expect(result.room.rematch?.status).toBe("pending");
      expect(store.updateRematchCalls).toHaveLength(1);
    });

    it("throws GameNotActiveError when match is still playing", async () => {
      const room = createActiveGameRoom("PLAYING");
      room.status = "playing";
      await store.save(room);

      await expect(
        coordinator.requestRematch("PLAYING", "sock_white"),
      ).rejects.toThrow(GameNotActiveError);
    });
  });

  describe("respondRematch", () => {
    it("declines rematch proposal and updates rematch status to declined", async () => {
      const room = createActiveGameRoom("DECLINE_REMATCH");
      room.status = "rematch_pending";
      room.rematch = {
        requestedBy: "p_white_id",
        requestedAt: Date.now() - 2000,
        status: "pending",
      };
      await store.save(room);

      const result = await coordinator.respondRematch(
        "DECLINE_REMATCH",
        "sock_black",
        false,
      );

      expect(result.accept).toBe(false);
      expect(result.byPlayerId).toBe("p_black_id");
      expect(result.room.rematch?.status).toBe("declined");
      expect(result.room.status).toBe("game_over");
    });

    it("accepts rematch proposal, swaps player piece colors, and resets game state", async () => {
      const room = createActiveGameRoom("ACCEPT_REMATCH");
      room.status = "rematch_pending";
      room.rematch = {
        requestedBy: "p_white_id",
        requestedAt: Date.now() - 2000,
        status: "pending",
      };
      await store.save(room);

      const result = await coordinator.respondRematch(
        "ACCEPT_REMATCH",
        "sock_black",
        true,
      );

      expect(result.accept).toBe(true);
      expect(result.byPlayerId).toBe("p_black_id");
      expect(result.room.status).toBe("playing");
      expect(result.room.rematch?.status).toBe("accepted");
      expect(result.nextGameState?.moveCount).toBe(0);
      expect(result.nextGameState?.turn).toBe("w");

      // Verify piece color swapping: old black player is now white
      expect(result.room.whitePlayer?.id).toBe("p_black_id");
      expect(result.room.whitePlayer?.color).toBe("w");
      // Old white player is now black
      expect(result.room.blackPlayer?.id).toBe("p_white_id");
      expect(result.room.blackPlayer?.color).toBe("b");
    });

    it("throws GameNotActiveError when no rematch is pending", async () => {
      const room = createActiveGameRoom("NO_REMATCH");
      room.status = "game_over";
      room.rematch = null;
      await store.save(room);

      await expect(
        coordinator.respondRematch("NO_REMATCH", "sock_black", true),
      ).rejects.toThrow(GameNotActiveError);
    });

    it("throws InvalidPayloadError when requester attempts to respond to their own rematch", async () => {
      const room = createActiveGameRoom("SELF_REMATCH");
      room.status = "rematch_pending";
      room.rematch = {
        requestedBy: "p_white_id",
        requestedAt: Date.now() - 2000,
        status: "pending",
      };
      await store.save(room);

      await expect(
        coordinator.respondRematch("SELF_REMATCH", "sock_white", true),
      ).rejects.toThrow(InvalidPayloadError);
    });

    it("throws GameNotActiveError when one of the players is disconnected on accept", async () => {
      const room = createActiveGameRoom("DISCONNECTED");
      room.status = "rematch_pending";
      room.rematch = {
        requestedBy: "p_white_id",
        requestedAt: Date.now() - 2000,
        status: "pending",
      };
      if (room.whitePlayer) {
        room.whitePlayer.isConnected = false;
      }
      await store.save(room);

      await expect(
        coordinator.respondRematch("DISCONNECTED", "sock_black", true),
      ).rejects.toThrow(GameNotActiveError);
    });
  });
});
