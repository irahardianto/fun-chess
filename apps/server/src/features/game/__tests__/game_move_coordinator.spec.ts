import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameMoveCoordinator } from "../game_move_coordinator.js";
import { GamePlayerResolver } from "../game_player_resolver.js";
import { MockRoomGameAdapter } from "./mock_room_adapter.js";
import { MockSessionRegistry } from "../../rooms/index.js";
import {
  type RoomState,
  RoomNotFoundError,
  GameNotActiveError,
  PlayerNotInRoomError,
  NotYourTurnError,
  InvalidMoveError,
  OptimisticLockConflictError,
  type IClock,
} from "@fun-chess/shared";
import { ChessEngine } from "../chess_engine.js";
import { Chess } from "chess.js";
import { NullLogger } from "../../../platform/logger/null_logger.js";
import { SystemClock } from "../../../platform/time/index.js";

describe("GameMoveCoordinator", () => {
  let store: MockRoomGameAdapter;
  let sessionRegistry: MockSessionRegistry;
  let clock: IClock;
  let logger: NullLogger;
  let playerResolver: GamePlayerResolver;
  let coordinator: GameMoveCoordinator;

  const createActiveGameRoom = (
    code = "MOVE",
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
    coordinator = new GameMoveCoordinator(
      store,
      clock,
      logger,
      playerResolver,
      sessionRegistry,
    );
  });

  describe("makeMove", () => {
    it("applies a legal move from white player and updates game state in store", async () => {
      const room = createActiveGameRoom("TEST");
      await store.save(room);

      const result = await coordinator.makeMove(
        { roomCode: "TEST", move: { from: "e2", to: "e4" } },
        "sock_white",
      );

      expect(result.moveResult.san).toBe("e4");
      expect(result.gameState.turn).toBe("b");
      expect(result.gameState.moveCount).toBe(1);
      expect(result.room.game.moveCount).toBe(1);
      expect(store.applyGameMoveCalls).toHaveLength(1);
    });

    it("throws RoomNotFoundError when room does not exist", async () => {
      await expect(
        coordinator.makeMove(
          { roomCode: "NONEXIST", move: { from: "e2", to: "e4" } },
          "sock_white",
        ),
      ).rejects.toThrow(RoomNotFoundError);
    });

    it("throws GameNotActiveError when room is not in playing state", async () => {
      const room = createActiveGameRoom("WAIT");
      room.status = "lobby";
      await store.save(room);

      await expect(
        coordinator.makeMove(
          { roomCode: "WAIT", move: { from: "e2", to: "e4" } },
          "sock_white",
        ),
      ).rejects.toThrow(GameNotActiveError);
    });

    it("throws PlayerNotInRoomError when socket does not belong to any player", async () => {
      const room = createActiveGameRoom("INTRUDER");
      await store.save(room);

      await expect(
        coordinator.makeMove(
          { roomCode: "INTRUDER", move: { from: "e2", to: "e4" } },
          "sock_stranger",
        ),
      ).rejects.toThrow(PlayerNotInRoomError);
    });

    it("throws NotYourTurnError when player tries to move out of turn", async () => {
      const room = createActiveGameRoom("TURN");
      await store.save(room);

      await expect(
        coordinator.makeMove(
          { roomCode: "TURN", move: { from: "e7", to: "e5" } },
          "sock_black",
        ),
      ).rejects.toThrow(NotYourTurnError);
    });

    it("throws InvalidMoveError when move is illegal", async () => {
      const room = createActiveGameRoom("ILLEGAL");
      await store.save(room);

      await expect(
        coordinator.makeMove(
          { roomCode: "ILLEGAL", move: { from: "e2", to: "e5" } },
          "sock_white",
        ),
      ).rejects.toThrow(InvalidMoveError);
    });

    it("detects check state and king coordinate", async () => {
      // Scholar's mate prelude setup where Qh5+ checks black
      // 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#
      // Position before Qxf7+ giving check
      const room = createActiveGameRoom(
        "CHECK",
        "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
      );
      room.game.turn = "w";
      await store.save(room);

      const result = await coordinator.makeMove(
        { roomCode: "CHECK", move: { from: "h5", to: "f7" } },
        "sock_white",
      );

      expect(result.gameOverPayload).toBeDefined();
      expect(result.gameOverPayload?.reason).toBe("checkmate");
      expect(result.gameOverPayload?.winner).toBe("w");
    });

    it("handles idempotent replay of last move with expectedMoveNumber", async () => {
      const room = createActiveGameRoom("REPLAY");
      await store.save(room);

      // Make first move
      const firstResult = await coordinator.makeMove(
        { roomCode: "REPLAY", move: { from: "e2", to: "e4" } },
        "sock_white",
      );

      // Re-send same move with expectedMoveNumber = 0 (before move 1 was applied)
      const replayResult = await coordinator.makeMove(
        {
          roomCode: "REPLAY",
          move: { from: "e2", to: "e4" },
          expectedMoveNumber: 0,
        },
        "sock_white",
      );

      expect(replayResult.moveResult.san).toBe("e4");
      expect(replayResult.gameState.moveCount).toBe(
        firstResult.gameState.moveCount,
      );
      // Ensure applyGameMove was not invoked a second time
      expect(store.applyGameMoveCalls).toHaveLength(1);
    });

    it("throws OptimisticLockConflictError when expectedMoveNumber < current moveCount and not last move", async () => {
      const room = createActiveGameRoom("CONFLICT");
      await store.save(room);

      await coordinator.makeMove(
        { roomCode: "CONFLICT", move: { from: "e2", to: "e4" } },
        "sock_white",
      );

      await expect(
        coordinator.makeMove(
          {
            roomCode: "CONFLICT",
            move: { from: "d2", to: "d4" },
            expectedMoveNumber: 0,
          },
          "sock_white",
        ),
      ).rejects.toThrow(OptimisticLockConflictError);
    });

    it("throws InvalidMoveError when expectedMoveNumber is in the future", async () => {
      const room = createActiveGameRoom("FUTURE");
      await store.save(room);

      await expect(
        coordinator.makeMove(
          {
            roomCode: "FUTURE",
            move: { from: "e2", to: "e4" },
            expectedMoveNumber: 5,
          },
          "sock_white",
        ),
      ).rejects.toThrow(InvalidMoveError);
    });

    it("touches session in sessionRegistry when move is applied", async () => {
      const sessionRecord = await sessionRegistry.createSession({
        roomCode: "TOUCH",
        playerId: "p_white_id",
        socketId: "sock_white",
        color: "w",
        isHost: true,
      });
      const touchSpy = vi.spyOn(sessionRegistry, "touchSession");

      const room = createActiveGameRoom("TOUCH");
      await store.save(room);

      await coordinator.makeMove(
        { roomCode: "TOUCH", move: { from: "e2", to: "e4" } },
        "sock_white",
        "corr-touch-1",
        sessionRecord.sessionToken,
      );

      expect(touchSpy).toHaveBeenCalledWith(
        sessionRecord.sessionToken,
        "sock_white",
        undefined,
        { correlationId: "corr-touch-1" },
      );
    });

    it("uses injected IClock timestamps on applied move", async () => {
      const fixedTime = 1750000000000;
      const fakeClock: IClock = { now: () => fixedTime };
      const timedCoordinator = new GameMoveCoordinator(
        store,
        fakeClock,
        logger,
        playerResolver,
      );

      const room = createActiveGameRoom("TIMED");
      await store.save(room);

      const result = await timedCoordinator.makeMove(
        { roomCode: "TIMED", move: { from: "e2", to: "e4" } },
        "sock_white",
      );

      expect(result.moveResult.timestamp).toBe(fixedTime);
    });
  });
});
