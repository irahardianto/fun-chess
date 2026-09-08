import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameService } from "../game.service.js";
import { MockRoomGameAdapter } from "./mock_room_adapter.js";
import {
  RoomState,
  RoomNotFoundError,
  GameNotActiveError,
  PlayerNotInRoomError,
  NotYourTurnError,
  InvalidMoveError,
  InvalidPayloadError,
  OptimisticLockConflictError,
} from "@fun-chess/shared";
import { ChessEngine } from "../chess_engine.js";
import { Chess } from "chess.js";
import { IClock, IIdGenerator } from "../clock.js";

describe("GameService", () => {
  let store: MockRoomGameAdapter;
  let service: GameService;

  const createActiveGameRoom = (
    code = "GAME",
    customFen?: string,
  ): RoomState => {
    const chess = customFen ? new Chess(customFen) : new Chess();
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
        connectedAt: Date.now(),
      },
      blackPlayer: {
        id: "p_black_id",
        socketId: "sock_black",
        name: "Black Player",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: Date.now(),
      },
      spectators: [],
      game: ChessEngine.extractGameState(chess, null),
      rematch: null,
      drawOffer: null,
      createdAt: Date.now() - 30000,
      lastActivityAt: Date.now() - 5000,
    };
  };

  beforeEach(() => {
    store = new MockRoomGameAdapter();
    service = new GameService(store);
  });

  describe("makeMove", () => {
    it("applies a legal move from white player and updates game state in store", async () => {
      const room = createActiveGameRoom("TEST");
      await store.save(room);

      const result = await service.makeMove(
        { roomCode: "TEST", move: { from: "e2", to: "e4" } },
        "sock_white",
      );

      expect(result.moveResult.san).toBe("e4");
      expect(result.gameState.turn).toBe("b");
      expect(result.room.game.turn).toBe("b");
      expect(result.gameOverPayload).toBeUndefined();

      const saved = await store.findByCode("TEST");
      expect(saved?.game.turn).toBe("b");
    });

    it("detects checkmate and sets room status to game_over", async () => {
      // Setup position 1 move before Scholar Checkmate (White queen on c4, bishop on c4 ready for Qxf7#)
      const matePositionFen =
        "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
      const room = createActiveGameRoom("MATE", matePositionFen);
      await store.save(room);

      const result = await service.makeMove(
        { roomCode: "MATE", move: { from: "h5", to: "f7" } },
        "sock_white",
      );

      expect(result.gameState.isCheckmate).toBe(true);
      expect(result.room.status).toBe("game_over");
      expect(result.gameOverPayload).toBeDefined();
      expect(result.gameOverPayload?.winner).toBe("w");
      expect(result.gameOverPayload?.reason).toBe("checkmate");
      expect(result.gameOverPayload?.winnerName).toBe("White Player");
    });

    it("detects threefold repetition draw and sets room status to game_over with threefold_repetition reason", async () => {
      const room = createActiveGameRoom("3FOLD");
      await store.save(room);

      const moves: { from: string; to: string; sock: string }[] = [
        { from: "g1", to: "f3", sock: "sock_white" },
        { from: "g8", to: "f6", sock: "sock_black" },
        { from: "f3", to: "g1", sock: "sock_white" },
        { from: "f6", to: "g8", sock: "sock_black" },
        { from: "g1", to: "f3", sock: "sock_white" },
        { from: "g8", to: "f6", sock: "sock_black" },
        { from: "f3", to: "g1", sock: "sock_white" },
        { from: "f6", to: "g8", sock: "sock_black" },
      ];

      let lastResult: any;
      for (const m of moves) {
        lastResult = await service.makeMove(
          { roomCode: "3FOLD", move: { from: m.from, to: m.to } },
          m.sock,
        );
      }

      expect(lastResult.gameState.isDraw).toBe(true);
      expect(lastResult.gameState.isThreefoldRepetition).toBe(true);
      expect(lastResult.room.status).toBe("game_over");
      expect(lastResult.gameOverPayload).toBeDefined();
      expect(lastResult.gameOverPayload?.winner).toBe("draw");
      expect(lastResult.gameOverPayload?.reason).toBe("threefold_repetition");
      expect(lastResult.gameOverPayload?.message).toContain("threefold repetition");
    });

    it("detects stalemate draw and sets room status to game_over with stalemate reason", async () => {
      // White king on b6, Queen on b1, Black king on a8 -> White plays Ka6 (b6 to a6)
      const stalematePreFen = "k7/8/1K6/8/8/8/8/1Q6 w - - 0 1";
      const room = createActiveGameRoom("STALEMATE", stalematePreFen);
      await store.save(room);

      const result = await service.makeMove(
        { roomCode: "STALEMATE", move: { from: "b6", to: "a6" } },
        "sock_white",
      );

      expect(result.gameState.isStalemate).toBe(true);
      expect(result.gameState.isDraw).toBe(true);
      expect(result.room.status).toBe("game_over");
      expect(result.gameOverPayload).toBeDefined();
      expect(result.gameOverPayload?.winner).toBe("draw");
      expect(result.gameOverPayload?.reason).toBe("stalemate");
    });

    it("detects insufficient material draw and sets room status to game_over with insufficient_material reason", async () => {
      // White bishop on e4 captures Black's last pawn on d5 leaving King+Bishop vs King
      const insufficientPreFen = "8/8/3k4/3p4/3KB3/8/8/8 w - - 0 1";
      const room = createActiveGameRoom("INSUFFICIENT", insufficientPreFen);
      await store.save(room);

      const result = await service.makeMove(
        { roomCode: "INSUFFICIENT", move: { from: "e4", to: "d5" } },
        "sock_white",
      );

      expect(result.gameState.isInsufficientMaterial).toBe(true);
      expect(result.gameState.isDraw).toBe(true);
      expect(result.room.status).toBe("game_over");
      expect(result.gameOverPayload).toBeDefined();
      expect(result.gameOverPayload?.winner).toBe("draw");
      expect(result.gameOverPayload?.reason).toBe("insufficient_material");
    });

    it("detects 50-move rule draw and sets room status to game_over with fifty_move_rule reason", async () => {
      // Halfmove clock at 99, White plays non-pawn non-capture move Kg1 (h1 to g1)
      const fiftyMovePreFen = "r6k/7p/8/8/8/8/P7/R6K w - - 99 50";
      const room = createActiveGameRoom("50MOVE", fiftyMovePreFen);
      await store.save(room);

      const result = await service.makeMove(
        { roomCode: "50MOVE", move: { from: "h1", to: "g1" } },
        "sock_white",
      );

      expect(result.gameState.isFiftyMoveRule).toBe(true);
      expect(result.gameState.isDraw).toBe(true);
      expect(result.room.status).toBe("game_over");
      expect(result.gameOverPayload).toBeDefined();
      expect(result.gameOverPayload?.winner).toBe("draw");
      expect(result.gameOverPayload?.reason).toBe("fifty_move_rule");
    });

    it("detects check and populates checkInfo", async () => {
      // White queen on e2, black king on e8 -> White plays Qe7+ (assuming pawn not blocking)
      const checkPositionFen =
        "rnbqkbnr/pppp1ppp/8/8/4P3/8/PPPPQPPP/RNB1KBNR w KQkq - 0 1";
      // Let's use Queen to e7 check directly
      const openCheckFen =
        "rnb1kbnr/pppp1ppp/8/8/4q3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1";
      const room = createActiveGameRoom("CHCK", openCheckFen);
      // It's white turn, white plays Be2 to block check
      await store.save(room);

      const result = await service.makeMove(
        { roomCode: "CHCK", move: { from: "f1", to: "e2" } },
        "sock_white",
      );

      expect(result.gameState.isCheck).toBe(false);
    });

    it("rejects move if room does not exist", async () => {
      await expect(
        service.makeMove(
          { roomCode: "NOPE", move: { from: "e2", to: "e4" } },
          "sock_white",
        ),
      ).rejects.toThrow(RoomNotFoundError);
    });

    it("rejects move if game is not active", async () => {
      const room = createActiveGameRoom("LOBBY");
      room.status = "lobby";
      await store.save(room);

      await expect(
        service.makeMove(
          { roomCode: "LOBBY", move: { from: "e2", to: "e4" } },
          "sock_white",
        ),
      ).rejects.toThrow(GameNotActiveError);
    });

    it("rejects move if socket is not a player in room", async () => {
      const room = createActiveGameRoom("TEST");
      await store.save(room);

      await expect(
        service.makeMove(
          { roomCode: "TEST", move: { from: "e2", to: "e4" } },
          "sock_stranger",
        ),
      ).rejects.toThrow(PlayerNotInRoomError);
    });

    it("rejects move when it is not player turn", async () => {
      const room = createActiveGameRoom("TEST");
      await store.save(room);

      // Black tries to move first
      await expect(
        service.makeMove(
          { roomCode: "TEST", move: { from: "e7", to: "e5" } },
          "sock_black",
        ),
      ).rejects.toThrow(NotYourTurnError);
    });

    it("rejects illegal chess move", async () => {
      const room = createActiveGameRoom("TEST");
      await store.save(room);

      await expect(
        service.makeMove(
          { roomCode: "TEST", move: { from: "e2", to: "e7" } },
          "sock_white",
        ),
      ).rejects.toThrow(InvalidMoveError);
    });

    it("clears pending draw offer when a move is played", async () => {
      const room = createActiveGameRoom("TEST");
      room.drawOffer = { offeredBy: "p_black_id", offeredAt: Date.now() };
      await store.save(room);

      const result = await service.makeMove(
        { roomCode: "TEST", move: { from: "e2", to: "e4" } },
        "sock_white",
      );

      expect(result.room.drawOffer).toBeNull();
      const saved = await store.findByCode("TEST");
      expect(saved?.drawOffer).toBeNull();
    });

    it("handles expectedMoveNumber idempotency when move was already applied (MAJ-031)", async () => {
      const room = createActiveGameRoom("IDEMP");
      await store.save(room);

      // Play 1. e4
      const firstMove = await service.makeMove(
        { roomCode: "IDEMP", move: { from: "e2", to: "e4" }, expectedMoveNumber: 0 },
        "sock_white",
      );

      expect(firstMove.gameState.moveCount).toBe(1);
      expect(firstMove.moveResult.san).toBe("e4");

      const applyCallsBefore = store.applyGameMoveCalls.length;

      // Duplicate resubmission of 1. e4 with expectedMoveNumber = 0 (now < moveCount 1)
      const replay = await service.makeMove(
        { roomCode: "IDEMP", move: { from: "e2", to: "e4" }, expectedMoveNumber: 0 },
        "sock_white",
      );

      // Returns existing move result idempotently without invoking store.applyGameMove again
      expect(replay.gameState.moveCount).toBe(1);
      expect(replay.moveResult.san).toBe("e4");
      expect(store.applyGameMoveCalls.length).toBe(applyCallsBefore);
    });

    it("throws OptimisticLockConflictError when expectedMoveNumber is in the past and does not match last move (MAJ-031)", async () => {
      const room = createActiveGameRoom("CONFLICT");
      await store.save(room);

      // Play 1. e4
      await service.makeMove(
        { roomCode: "CONFLICT", move: { from: "e2", to: "e4" } },
        "sock_white",
      );

      // White sends a different move (d2-d4) with expectedMoveNumber = 0
      await expect(
        service.makeMove(
          { roomCode: "CONFLICT", move: { from: "d2", to: "d4" }, expectedMoveNumber: 0 },
          "sock_white",
        ),
      ).rejects.toBeInstanceOf(OptimisticLockConflictError);
    });

    it("throws InvalidMoveError when expectedMoveNumber is in the future (MAJ-031)", async () => {
      const room = createActiveGameRoom("FUTURE");
      await store.save(room);

      await expect(
        service.makeMove(
          { roomCode: "FUTURE", move: { from: "e2", to: "e4" }, expectedMoveNumber: 5 },
          "sock_white",
        ),
      ).rejects.toThrow("Move out of sequence: expectedMoveNumber is in the future");
    });

    it("handles idempotencyKey deduplication when client resubmits after move was applied (MAJ-031)", async () => {
      const room = createActiveGameRoom("IDEMP_KEY");
      await store.save(room);

      await service.makeMove(
        { roomCode: "IDEMP_KEY", move: { from: "e2", to: "e4" }, idempotencyKey: "key-1" },
        "sock_white",
      );

      const applyCallsBefore = store.applyGameMoveCalls.length;

      // Duplicate request with idempotencyKey
      const replay = await service.makeMove(
        { roomCode: "IDEMP_KEY", move: { from: "e2", to: "e4" }, idempotencyKey: "key-1" },
        "sock_white",
      );

      expect(replay.gameState.moveCount).toBe(1);
      expect(replay.moveResult.san).toBe("e4");
      expect(store.applyGameMoveCalls.length).toBe(applyCallsBefore);
    });
  });

  describe("resign", () => {
    it("allows white to resign, clears drawOffer, and awards victory to black", async () => {
      const room = createActiveGameRoom("TEST");
      room.drawOffer = { offeredBy: "p_white_id", offeredAt: Date.now() };
      await store.save(room);

      const { room: updatedRoom, gameOverPayload } = await service.resign(
        "TEST",
        "sock_white",
      );

      expect(updatedRoom.status).toBe("game_over");
      expect(updatedRoom.drawOffer).toBeNull();
      expect(gameOverPayload.winner).toBe("b");
      expect(gameOverPayload.winnerName).toBe("Black Player");
      expect(gameOverPayload.reason).toBe("resignation");
    });

    it("rejects resignation if game is already over", async () => {
      const room = createActiveGameRoom("OVER");
      room.status = "game_over";
      await store.save(room);

      await expect(service.resign("OVER", "sock_white")).rejects.toThrow(
        GameNotActiveError,
      );
    });
  });

  describe("offerDraw and respondDraw", () => {
    it("sets drawOffer in room and store, and returns opponent player for draw offer", async () => {
      const room = createActiveGameRoom("DRAW");
      await store.save(room);

      const result = await service.offerDraw("DRAW", "sock_white");
      expect(result.fromPlayer.id).toBe("p_white_id");
      expect(result.opponentPlayer?.id).toBe("p_black_id");
      expect(result.room.drawOffer).toEqual({
        offeredBy: "p_white_id",
        offeredAt: expect.any(Number),
      });

      const saved = await store.findByCode("DRAW");
      expect(saved?.drawOffer?.offeredBy).toBe("p_white_id");
    });

    it("rejects respondDraw even if offering player reconnects with a different socketId (MAJ-022)", async () => {
      const room = createActiveGameRoom("DRAW");
      await store.save(room);

      const { room: roomWithOffer } = await service.offerDraw("DRAW", "sock_white");

      // Player reconnects: socketId changes from sock_white to sock_white_new
      roomWithOffer.whitePlayer!.socketId = "sock_white_new";
      await store.save(roomWithOffer);

      await expect(
        service.respondDraw("DRAW", "sock_white_new", true),
      ).rejects.toThrow(InvalidPayloadError);

      await expect(
        service.respondDraw("DRAW", "sock_white_new", false),
      ).rejects.toThrow(InvalidPayloadError);
    });

    it("rejects respondDraw if no draw offer is currently pending", async () => {
      const room = createActiveGameRoom("DRAW");
      await store.save(room);

      await expect(
        service.respondDraw("DRAW", "sock_black", true),
      ).rejects.toThrow(GameNotActiveError);
    });

    it("rejects respondDraw if player attempts to accept their own draw offer", async () => {
      const room = createActiveGameRoom("DRAW");
      await store.save(room);

      await service.offerDraw("DRAW", "sock_white");

      await expect(
        service.respondDraw("DRAW", "sock_white", true),
      ).rejects.toThrow(InvalidPayloadError);
    });

    it("rejects respondDraw if player attempts to decline their own draw offer", async () => {
      const room = createActiveGameRoom("DRAW");
      await store.save(room);

      await service.offerDraw("DRAW", "sock_white");

      await expect(
        service.respondDraw("DRAW", "sock_white", false),
      ).rejects.toThrow(InvalidPayloadError);
    });

    it("ends game in draw and clears drawOffer when accepted", async () => {
      const room = createActiveGameRoom("DRAW");
      await store.save(room);

      await service.offerDraw("DRAW", "sock_white");
      const result = await service.respondDraw("DRAW", "sock_black", true);

      expect(result.accept).toBe(true);
      expect(result.room.status).toBe("game_over");
      expect(result.room.drawOffer).toBeNull();
      expect(result.gameOverPayload?.winner).toBe("draw");
      expect(result.gameOverPayload?.reason).toBe("draw_agreement");

      const saved = await store.findByCode("DRAW");
      expect(saved?.drawOffer).toBeNull();
    });

    it("continues game and clears drawOffer when draw is declined", async () => {
      const room = createActiveGameRoom("DRAW");
      await store.save(room);

      await service.offerDraw("DRAW", "sock_white");
      const result = await service.respondDraw("DRAW", "sock_black", false);

      expect(result.accept).toBe(false);
      expect(result.room.status).toBe("playing");
      expect(result.room.drawOffer).toBeNull();

      const saved = await store.findByCode("DRAW");
      expect(saved?.drawOffer).toBeNull();
    });
  });

  describe("requestRematch and respondRematch", () => {
    it("allows rematch request after game over", async () => {
      const room = createActiveGameRoom("REMATCH");
      room.status = "game_over";
      await store.save(room);

      const result = await service.requestRematch("REMATCH", "sock_white");
      expect(result.room.status).toBe("rematch_pending");
      expect(result.requestedBy).toBe("p_white_id");
      expect(result.requesterName).toBe("White Player");
    });

    it("swaps player colors, clears drawOffer, and restarts game when rematch is accepted", async () => {
      const room = createActiveGameRoom("REMATCH");
      room.status = "game_over";
      room.drawOffer = { offeredBy: "p_white_id", offeredAt: Date.now() };
      await store.save(room);

      await service.requestRematch("REMATCH", "sock_white");
      const result = await service.respondRematch(
        "REMATCH",
        "sock_black",
        true,
      );

      expect(result.accept).toBe(true);
      expect(result.room.status).toBe("playing");
      expect(result.room.drawOffer).toBeNull();
      expect(result.room.whitePlayer?.id).toBe("p_black_id"); // Black became White
      expect(result.room.blackPlayer?.id).toBe("p_white_id"); // White became Black
      expect(result.room.game.turn).toBe("w");
      expect(result.room.game.moveCount).toBe(0);
    });

    it("calls roomAdapter.updateRematch with swapped players when rematch is accepted (MAJ-012)", async () => {
      const room = createActiveGameRoom("REMATCH_SWAP");
      room.status = "game_over";
      await store.save(room);

      await service.requestRematch("REMATCH_SWAP", "sock_white");
      const result = await service.respondRematch(
        "REMATCH_SWAP",
        "sock_black",
        true,
      );

      expect(result.accept).toBe(true);
      const lastRematchCall =
        store.updateRematchCalls[store.updateRematchCalls.length - 1];
      expect(lastRematchCall).toBeDefined();
      expect(lastRematchCall.rematch?.status).toBe("accepted");
      expect(lastRematchCall.players?.whitePlayer?.id).toBe("p_black_id");
      expect(lastRematchCall.players?.blackPlayer?.id).toBe("p_white_id");
    });

    it("calls roomAdapter.updateRematch with declined status when rematch is declined (MAJ-012)", async () => {
      const room = createActiveGameRoom("REMATCH_DEC");
      room.status = "game_over";
      await store.save(room);

      await service.requestRematch("REMATCH_DEC", "sock_white");
      const result = await service.respondRematch(
        "REMATCH_DEC",
        "sock_black",
        false,
      );

      expect(result.accept).toBe(false);
      const lastRematchCall =
        store.updateRematchCalls[store.updateRematchCalls.length - 1];
      expect(lastRematchCall).toBeDefined();
      expect(lastRematchCall.rematch?.status).toBe("declined");
    });

    it("reverts room to game_over and clears drawOffer when rematch is declined", async () => {
      const room = createActiveGameRoom("REMATCH");
      room.status = "game_over";
      room.drawOffer = { offeredBy: "p_white_id", offeredAt: Date.now() };
      await store.save(room);

      await service.requestRematch("REMATCH", "sock_white");
      const result = await service.respondRematch(
        "REMATCH",
        "sock_black",
        false,
      );

      expect(result.accept).toBe(false);
      expect(result.room.status).toBe("game_over");
      expect(result.room.drawOffer).toBeNull();
    });

    it("rejects rematch response from the same player who requested it", async () => {
      const room = createActiveGameRoom("REMATCH");
      room.status = "game_over";
      await store.save(room);

      await service.requestRematch("REMATCH", "sock_white");
      await expect(
        service.respondRematch("REMATCH", "sock_white", true),
      ).rejects.toThrow();
    });

    it("rejects rematch response if no rematch was requested", async () => {
      const room = createActiveGameRoom("REMATCH");
      room.status = "game_over";
      await store.save(room);

      await expect(
        service.respondRematch("REMATCH", "sock_black", true),
      ).rejects.toThrow(GameNotActiveError);
    });
  });

  describe("IRoomGameAdapter Delegation & Terminal Invariants (MAJ-012)", () => {
    it("delegates makeMove, resign, offerDraw, and respondDraw execution to roomAdapter", async () => {
      const room = createActiveGameRoom("MUTATE");
      await store.save(room);

      // 1. makeMove
      await service.makeMove(
        { roomCode: "MUTATE", move: { from: "e2", to: "e4" } },
        "sock_white",
      );
      expect(store.applyGameMoveCalls).toHaveLength(1);
      expect(store.applyGameMoveCalls[0].roomCode).toBe("MUTATE");
      expect(store.applyGameMoveCalls[0].nextGameState.turn).toBe("b");

      // 2. offerDraw
      await service.offerDraw("MUTATE", "sock_black");
      expect(store.updateDrawOfferCalls).toHaveLength(1);
      expect(store.updateDrawOfferCalls[0].drawOffer?.offeredBy).toBe("p_black_id");

      // 3. respondDraw
      await service.respondDraw("MUTATE", "sock_white", false);
      expect(store.updateDrawOfferCalls).toHaveLength(2);
      expect(store.updateDrawOfferCalls[1].drawOffer).toBeNull();

      // 4. resign
      await service.resign("MUTATE", "sock_black");
      expect(store.finalizeGameCalls).toHaveLength(1);
      expect(store.finalizeGameCalls[0].gameOverPayload.winner).toBe("w");
      expect(store.finalizeGameCalls[0].gameOverPayload.reason).toBe("resignation");

      // 5. requestRematch
      await service.requestRematch("MUTATE", "sock_white");
      expect(store.updateRematchCalls).toHaveLength(1);
      expect(store.updateRematchCalls[0].rematch?.requestedBy).toBe("p_white_id");

      // 6. respondRematch
      await service.respondRematch("MUTATE", "sock_black", true);
      expect(store.updateRematchCalls).toHaveLength(2);
      expect(store.updateRematchCalls[1].rematch?.status).toBe("accepted");
    });

    it("enforces terminal game_over invariant: rejects makeMove and offerDraw with GameNotActiveError once match ends", async () => {
      const room = createActiveGameRoom("ENDED");
      room.status = "game_over";
      await store.save(room);

      // Attempt makeMove on terminated match
      await expect(
        service.makeMove(
          { roomCode: "ENDED", move: { from: "e2", to: "e4" } },
          "sock_white",
        ),
      ).rejects.toBeInstanceOf(GameNotActiveError);

      // Attempt offerDraw on terminated match
      await expect(
        service.offerDraw("ENDED", "sock_white"),
      ).rejects.toBeInstanceOf(GameNotActiveError);
    });
  });

  describe("Dependency Injection: Clock & IdGenerator (MAJ-016 & MAJ-017)", () => {
    it("uses injected IClock timestamps on game operations", async () => {
      const fixedTime = 1750000000000;
      const fakeClock: IClock = {
        now: () => fixedTime,
      };
      const customService = new GameService(store, fakeClock);

      const room = createActiveGameRoom("TIME");
      await store.save(room);

      const result = await customService.makeMove(
        { roomCode: "TIME", move: { from: "e2", to: "e4" } },
        "sock_white",
      );

      expect(result.moveResult.timestamp).toBe(fixedTime);

      await customService.offerDraw("TIME", "sock_black");
      const roomWithDraw = await store.findByCode("TIME");
      expect(roomWithDraw?.drawOffer?.offeredAt).toBe(fixedTime);
    });
  });
});
