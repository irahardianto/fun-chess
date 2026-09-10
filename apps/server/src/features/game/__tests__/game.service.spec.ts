import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameService } from "../game.service.js";
import type { MoveApplicationResult } from "../game.interface.js";
import { MockRoomGameAdapter } from "./mock_room_adapter.js";
import { MockSessionRegistry } from "../../rooms/index.js";
import {
  RoomState,
  RoomNotFoundError,
  GameNotActiveError,
  PlayerNotInRoomError,
  NotYourTurnError,
  InvalidMoveError,
  InvalidPayloadError,
  OptimisticLockConflictError,
  type IClock,
  type IIdGenerator,
} from "@fun-chess/shared";
import { ChessEngine } from "../chess_engine.js";
import { Chess } from "chess.js";
import { NullLogger } from "../../../platform/logger/null_logger.js";
import { SystemClock, UuidGenerator } from "../../../platform/time/index.js";

describe("GameService", () => {
  let store: MockRoomGameAdapter;
  let clock: IClock;
  let idGenerator: IIdGenerator;
  let logger: NullLogger;
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
    clock = new SystemClock();
    idGenerator = new UuidGenerator();
    logger = new NullLogger();
    service = new GameService(store, clock, idGenerator, logger);
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

      let lastResult: MoveApplicationResult | undefined;
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
      expect(lastResult.gameOverPayload?.message).toContain(
        "threefold repetition",
      );
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
        {
          roomCode: "IDEMP",
          move: { from: "e2", to: "e4" },
          expectedMoveNumber: 0,
        },
        "sock_white",
      );

      expect(firstMove.gameState.moveCount).toBe(1);
      expect(firstMove.moveResult.san).toBe("e4");

      const applyCallsBefore = store.applyGameMoveCalls.length;

      // Duplicate resubmission of 1. e4 with expectedMoveNumber = 0 (now < moveCount 1)
      const replay = await service.makeMove(
        {
          roomCode: "IDEMP",
          move: { from: "e2", to: "e4" },
          expectedMoveNumber: 0,
        },
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
          {
            roomCode: "CONFLICT",
            move: { from: "d2", to: "d4" },
            expectedMoveNumber: 0,
          },
          "sock_white",
        ),
      ).rejects.toBeInstanceOf(OptimisticLockConflictError);
    });

    it("throws InvalidMoveError when expectedMoveNumber is in the future (MAJ-031)", async () => {
      const room = createActiveGameRoom("FUTURE");
      await store.save(room);

      await expect(
        service.makeMove(
          {
            roomCode: "FUTURE",
            move: { from: "e2", to: "e4" },
            expectedMoveNumber: 5,
          },
          "sock_white",
        ),
      ).rejects.toThrow(
        "Move out of sequence: expectedMoveNumber is in the future",
      );
    });

    it("handles idempotencyKey deduplication when client resubmits after move was applied (MAJ-031)", async () => {
      const room = createActiveGameRoom("IDEMP_KEY");
      await store.save(room);

      await service.makeMove(
        {
          roomCode: "IDEMP_KEY",
          move: { from: "e2", to: "e4" },
          idempotencyKey: "key-1",
        },
        "sock_white",
      );

      const applyCallsBefore = store.applyGameMoveCalls.length;

      // Duplicate request with idempotencyKey
      const replay = await service.makeMove(
        {
          roomCode: "IDEMP_KEY",
          move: { from: "e2", to: "e4" },
          idempotencyKey: "key-1",
        },
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

      const { room: roomWithOffer } = await service.offerDraw(
        "DRAW",
        "sock_white",
      );

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
      expect(store.updateDrawOfferCalls[0].drawOffer?.offeredBy).toBe(
        "p_black_id",
      );

      // 3. respondDraw
      await service.respondDraw("MUTATE", "sock_white", false);
      expect(store.updateDrawOfferCalls).toHaveLength(2);
      expect(store.updateDrawOfferCalls[1].drawOffer).toBeNull();

      // 4. resign
      await service.resign("MUTATE", "sock_black");
      expect(store.finalizeGameCalls).toHaveLength(1);
      expect(store.finalizeGameCalls[0].gameOverPayload.winner).toBe("w");
      expect(store.finalizeGameCalls[0].gameOverPayload.reason).toBe(
        "resignation",
      );

      // 5. requestRematch
      await service.requestRematch("MUTATE", "sock_white");
      expect(store.updateRematchCalls).toHaveLength(1);
      expect(store.updateRematchCalls[0].rematch?.requestedBy).toBe(
        "p_white_id",
      );

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
      const customService = new GameService(
        store,
        fakeClock,
        idGenerator,
        logger,
      );

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

  describe("Session Sliding TTL (CRIT-002)", () => {
    it("calls touchSession on sessionRegistry when a valid move is applied", async () => {
      const mockSessionRegistry = new MockSessionRegistry();
      const sessionRecord = await mockSessionRegistry.createSession({
        roomCode: "SESS",
        playerId: "p_white_id",
        socketId: "sock_white",
      });
      const touchSessionSpy = vi.spyOn(mockSessionRegistry, "touchSession");

      const customService = new GameService(
        store,
        clock,
        idGenerator,
        logger,
        mockSessionRegistry,
      );

      const room = createActiveGameRoom("SESS");
      await store.save(room);

      const result = await customService.makeMove(
        { roomCode: "SESS", move: { from: "e2", to: "e4" } },
        "sock_white",
      );

      expect(result.moveResult.from).toBe("e2");
      expect(result.moveResult.to).toBe("e4");
      expect(touchSessionSpy).toHaveBeenCalledWith(
        sessionRecord.sessionToken,
        "sock_white",
      );
    });
  });

  describe("Service-Level Operational Logging (MAJ-003)", () => {
    it("emits debug start and info success logs for makeMove with operation, roomCode, playerId, duration, and durationMs", async () => {
      const debugSpy = vi.spyOn(logger, "debug");
      const infoSpy = vi.spyOn(logger, "info");
      const room = createActiveGameRoom("LOG1");
      await store.save(room);

      await service.makeMove(
        { roomCode: "LOG1", move: { from: "e2", to: "e4" } },
        "sock_white",
      );

      expect(debugSpy).toHaveBeenCalledWith(
        "Applying chess move",
        expect.objectContaining({
          operation: "game_move",
          roomCode: "LOG1",
          playerId: "p_white_id",
          move: { from: "e2", to: "e4" },
        }),
      );

      expect(infoSpy).toHaveBeenCalledWith(
        "Chess move applied",
        expect.objectContaining({
          operation: "game_move",
          roomCode: "LOG1",
          playerId: "p_white_id",
          san: "e4",
          duration: expect.any(Number),
          durationMs: expect.any(Number),
          isGameOver: false,
        }),
      );
    });

    it("emits warn log on invalid move rejection with operation, roomCode, playerId, duration, and durationMs", async () => {
      const warnSpy = vi.spyOn(logger, "warn");
      const room = createActiveGameRoom("LOG2");
      await store.save(room);

      await expect(
        service.makeMove(
          { roomCode: "LOG2", move: { from: "e2", to: "e5" } },
          "sock_white",
        ),
      ).rejects.toBeInstanceOf(InvalidMoveError);

      expect(warnSpy).toHaveBeenCalledWith(
        "Invalid move rejected",
        expect.objectContaining({
          operation: "game_move_rejected",
          roomCode: "LOG2",
          playerId: "p_white_id",
          reason: expect.any(String),
          duration: expect.any(Number),
          durationMs: expect.any(Number),
        }),
      );
    });

    it("emits info log on resign with operation, roomCode, playerId, winnerColor, duration, and durationMs", async () => {
      const infoSpy = vi.spyOn(logger, "info");
      const room = createActiveGameRoom("LOG3");
      await store.save(room);

      await service.resign("LOG3", "sock_white");

      expect(infoSpy).toHaveBeenCalledWith(
        "Player resigned",
        expect.objectContaining({
          operation: "game_resign",
          roomCode: "LOG3",
          playerId: "p_white_id",
          winnerColor: "b",
          duration: expect.any(Number),
          durationMs: expect.any(Number),
        }),
      );
    });

    it("emits info log on offerDraw with operation, roomCode, playerId, action: offer, duration, and durationMs", async () => {
      const infoSpy = vi.spyOn(logger, "info");
      const room = createActiveGameRoom("LOG4");
      await store.save(room);

      await service.offerDraw("LOG4", "sock_white");

      expect(infoSpy).toHaveBeenCalledWith(
        "Draw offer processed",
        expect.objectContaining({
          operation: "game_draw_action",
          roomCode: "LOG4",
          playerId: "p_white_id",
          action: "offer",
          duration: expect.any(Number),
          durationMs: expect.any(Number),
        }),
      );
    });

    it("emits info log on respondDraw (accept and decline) with operation, roomCode, playerId, action, duration, and durationMs", async () => {
      const room = createActiveGameRoom("LOG5");
      await store.save(room);
      await service.offerDraw("LOG5", "sock_white");

      const infoSpy = vi.spyOn(logger, "info");

      // Decline
      await service.respondDraw("LOG5", "sock_black", false);
      expect(infoSpy).toHaveBeenCalledWith(
        "Draw offer processed",
        expect.objectContaining({
          operation: "game_draw_action",
          roomCode: "LOG5",
          playerId: "p_black_id",
          action: "decline",
          duration: expect.any(Number),
          durationMs: expect.any(Number),
        }),
      );

      // Offer again and accept
      await service.offerDraw("LOG5", "sock_white");
      await service.respondDraw("LOG5", "sock_black", true);
      expect(infoSpy).toHaveBeenCalledWith(
        "Draw offer processed",
        expect.objectContaining({
          operation: "game_draw_action",
          roomCode: "LOG5",
          playerId: "p_black_id",
          action: "accept",
          duration: expect.any(Number),
          durationMs: expect.any(Number),
        }),
      );
    });

    it("emits info log on requestRematch and respondRematch with operation, roomCode, playerId, status, duration, and durationMs", async () => {
      const room = createActiveGameRoom("LOG6");
      await store.save(room);
      await service.resign("LOG6", "sock_white");

      const infoSpy = vi.spyOn(logger, "info");

      // Request rematch
      await service.requestRematch("LOG6", "sock_white");
      expect(infoSpy).toHaveBeenCalledWith(
        "Rematch action processed",
        expect.objectContaining({
          operation: "game_rematch_action",
          roomCode: "LOG6",
          playerId: "p_white_id",
          status: "pending",
          duration: expect.any(Number),
          durationMs: expect.any(Number),
        }),
      );

      // Respond rematch (accepted)
      await service.respondRematch("LOG6", "sock_black", true);
      expect(infoSpy).toHaveBeenCalledWith(
        "Rematch action processed",
        expect.objectContaining({
          operation: "game_rematch_action",
          roomCode: "LOG6",
          playerId: "p_black_id",
          status: "accepted",
          duration: expect.any(Number),
          durationMs: expect.any(Number),
        }),
      );
    });

    it("propagates correlationId into logs and roomAdapter calls across all operations", async () => {
      const debugSpy = vi.spyOn(logger, "debug");
      const infoSpy = vi.spyOn(logger, "info");
      const getRoomSpy = vi.spyOn(store, "getRoom");

      const room = createActiveGameRoom("CORR1");
      await store.save(room);

      // 1. makeMove
      await service.makeMove(
        { roomCode: "CORR1", move: { from: "e2", to: "e4" } },
        "sock_white",
        "test-corr-1",
      );
      expect(debugSpy).toHaveBeenCalledWith(
        "Applying chess move",
        expect.objectContaining({ correlationId: "test-corr-1" }),
      );
      expect(infoSpy).toHaveBeenCalledWith(
        "Chess move applied",
        expect.objectContaining({ correlationId: "test-corr-1" }),
      );
      expect(getRoomSpy).toHaveBeenCalledWith("CORR1", "test-corr-1");

      // 2. offerDraw
      await service.offerDraw("CORR1", "sock_white", "test-corr-2");
      expect(infoSpy).toHaveBeenCalledWith(
        "Draw offer processed",
        expect.objectContaining({ correlationId: "test-corr-2" }),
      );

      // 3. respondDraw (decline)
      await service.respondDraw("CORR1", "sock_black", false, "test-corr-3");
      expect(infoSpy).toHaveBeenCalledWith(
        "Draw offer processed",
        expect.objectContaining({ correlationId: "test-corr-3" }),
      );

      // 4. resign
      await service.resign("CORR1", "sock_white", "test-corr-4");
      expect(infoSpy).toHaveBeenCalledWith(
        "Player resigned",
        expect.objectContaining({ correlationId: "test-corr-4" }),
      );

      // 5. requestRematch
      await service.requestRematch("CORR1", "sock_white", "test-corr-5");
      expect(infoSpy).toHaveBeenCalledWith(
        "Rematch action processed",
        expect.objectContaining({ correlationId: "test-corr-5" }),
      );

      // 6. respondRematch (accepted)
      await service.respondRematch("CORR1", "sock_black", true, "test-corr-6");
      expect(infoSpy).toHaveBeenCalledWith(
        "Rematch action processed",
        expect.objectContaining({ correlationId: "test-corr-6" }),
      );
    });

    it("logs error with serializeError when roomAdapter throws during game operations", async () => {
      const errorSpy = vi.spyOn(logger, "error");
      const room = createActiveGameRoom("ERR1");
      await store.save(room);

      vi.spyOn(store, "applyGameMove").mockRejectedValueOnce(
        new Error("Database lock timeout"),
      );

      await expect(
        service.makeMove(
          { roomCode: "ERR1", move: { from: "e2", to: "e4" } },
          "sock_white",
          "err-corr-1",
        ),
      ).rejects.toThrow("Database lock timeout");

      expect(errorSpy).toHaveBeenCalledWith(
        "Chess move failed",
        expect.objectContaining({
          operation: "game_move",
          correlationId: "err-corr-1",
          error: expect.objectContaining({ message: "Database lock timeout" }),
        }),
      );
    });

    it("handles edge cases for rematch: unknown socket, rematch_pending, and disconnected player", async () => {
      const room = createActiveGameRoom("REMEDGE");
      room.status = "game_over";
      await store.save(room);

      // Unknown socket requesting rematch
      await expect(
        service.requestRematch("REMEDGE", "sock_unknown"),
      ).rejects.toBeInstanceOf(PlayerNotInRoomError);

      // Valid request rematch
      await service.requestRematch("REMEDGE", "sock_white");

      // Request rematch when status is rematch_pending (allowed to update request)
      await service.requestRematch("REMEDGE", "sock_white");

      // Unknown socket responding rematch
      await expect(
        service.respondRematch("REMEDGE", "sock_unknown", true),
      ).rejects.toBeInstanceOf(PlayerNotInRoomError);

      // When one player is disconnected
      const roomWithDisc = await store.getRoom("REMEDGE");
      roomWithDisc!.blackPlayer!.isConnected = false;
      await store.save(roomWithDisc!);

      await expect(
        service.respondRematch("REMEDGE", "sock_black", true),
      ).rejects.toThrow(GameNotActiveError);
    });
  });

  describe("Mid-Game Session Token Auto-Healing & 4xx Domain Error Logging (MAJ-004, MAJ-007)", () => {
    it("auto-heals socket ID when player submits action with valid sessionToken but new socketId", async () => {
      const mockSessionRegistry = new MockSessionRegistry();
      const sessionRecord = await mockSessionRegistry.createSession({
        roomCode: "HEAL",
        playerId: "p_white_id",
        socketId: "sock_white_old",
        color: "w",
        isHost: true,
      });

      const customService = new GameService(
        store,
        clock,
        idGenerator,
        logger,
        mockSessionRegistry,
      );

      const room = createActiveGameRoom("HEAL");
      await store.save(room);

      const infoSpy = vi.spyOn(logger, "info");

      // Move with new socketId and valid sessionToken
      const result = await customService.makeMove(
        { roomCode: "HEAL", move: { from: "e2", to: "e4" } },
        "sock_white_new",
        "corr-heal-1",
        sessionRecord.sessionToken,
      );

      expect(result.moveResult.from).toBe("e2");
      expect(result.moveResult.to).toBe("e4");

      // Verify auto-heal log
      expect(infoSpy).toHaveBeenCalledWith(
        "Player socket auto-healed",
        expect.objectContaining({
          operation: "player_socket_auto_healed",
          roomCode: "HEAL",
          playerId: "p_white_id",
          oldSocketId: "sock_white",
          newSocketId: "sock_white_new",
          correlationId: "corr-heal-1",
        }),
      );

      // Verify roomAdapter updated player socket
      const updated = await store.getRoom("HEAL");
      expect(updated?.whitePlayer?.socketId).toBe("sock_white_new");
    });

    it("auto-heals socket ID on mid-game resign with valid sessionToken", async () => {
      const mockSessionRegistry = new MockSessionRegistry();
      const sessionRecord = await mockSessionRegistry.createSession({
        roomCode: "HRES",
        playerId: "p_white_id",
        socketId: "sock_white_old",
        color: "w",
        isHost: true,
      });

      const customService = new GameService(
        store,
        clock,
        idGenerator,
        logger,
        mockSessionRegistry,
      );

      const room = createActiveGameRoom("HRES");
      await store.save(room);

      const { room: updatedRoom, gameOverPayload } = await customService.resign(
        "HRES",
        "sock_white_new",
        "corr-heal-resign",
        sessionRecord.sessionToken,
      );

      expect(updatedRoom.status).toBe("game_over");
      expect(gameOverPayload.winner).toBe("b");
      expect(gameOverPayload.reason).toBe("resignation");

      const savedRoom = await store.getRoom("HRES");
      expect(savedRoom?.whitePlayer?.socketId).toBe("sock_white_new");
    });

    it("emits logger.warn instead of logger.error for expected 4xx domain errors across mid-game actions", async () => {
      const warnSpy = vi.spyOn(logger, "warn");
      const errorSpy = vi.spyOn(logger, "error");

      // 1. RoomNotFoundError on resign
      await expect(
        service.resign("NONEXIST", "sock_any", "corr-warn-1"),
      ).rejects.toBeInstanceOf(RoomNotFoundError);

      expect(warnSpy).toHaveBeenCalledWith(
        "Player resignation rejected",
        expect.objectContaining({
          operation: "game_resign",
          correlationId: "corr-warn-1",
        }),
      );
      expect(errorSpy).not.toHaveBeenCalledWith(
        "Player resignation failed",
        expect.anything(),
      );

      // 2. GameNotActiveError on offerDraw
      const gameOverRoom = createActiveGameRoom("DONE");
      gameOverRoom.status = "game_over";
      await store.save(gameOverRoom);

      await expect(
        service.offerDraw("DONE", "sock_white", "corr-warn-2"),
      ).rejects.toBeInstanceOf(GameNotActiveError);

      expect(warnSpy).toHaveBeenCalledWith(
        "Draw offer rejected",
        expect.objectContaining({
          operation: "game_draw_action",
          correlationId: "corr-warn-2",
        }),
      );
      expect(errorSpy).not.toHaveBeenCalledWith(
        "Draw offer failed",
        expect.anything(),
      );

      // 3. PlayerNotInRoomError on respondDraw
      const activeRoom = createActiveGameRoom("DRAW404");
      activeRoom.drawOffer = { offeredBy: "p_white_id", offeredAt: 1000 };
      await store.save(activeRoom);

      await expect(
        service.respondDraw("DRAW404", "sock_unknown", true, "corr-warn-3"),
      ).rejects.toBeInstanceOf(PlayerNotInRoomError);

      expect(warnSpy).toHaveBeenCalledWith(
        "Draw response rejected",
        expect.objectContaining({
          operation: "game_draw_action",
          correlationId: "corr-warn-3",
        }),
      );
      expect(errorSpy).not.toHaveBeenCalledWith(
        "Draw response failed",
        expect.anything(),
      );

      // 4. GameNotActiveError on requestRematch when room is still playing
      await expect(
        service.requestRematch("DRAW404", "sock_white", "corr-warn-4"),
      ).rejects.toBeInstanceOf(GameNotActiveError);

      expect(warnSpy).toHaveBeenCalledWith(
        "Rematch request rejected",
        expect.objectContaining({
          operation: "game_rematch_action",
          correlationId: "corr-warn-4",
        }),
      );
      expect(errorSpy).not.toHaveBeenCalledWith(
        "Rematch request failed",
        expect.anything(),
      );
    });
  });
});
