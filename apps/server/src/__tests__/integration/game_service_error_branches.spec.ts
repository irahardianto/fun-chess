import { describe, it, expect, beforeEach } from "vitest";
import { GameService } from "../../features/game/game.service.js";
import { MockRoomGameAdapter } from "../../features/game/__tests__/mock_room_adapter.js";
import {
  type RoomState,
  type RoomStatus,
  type Player,
  PlayerNotInRoomError,
  GameNotActiveError,
  InvalidPayloadError,
} from "@fun-chess/shared";
import { ChessEngine } from "../../features/game/chess_engine.js";
import { Chess } from "chess.js";
import { SystemClock, UuidGenerator } from "../../platform/time/index.js";
import { NullLogger } from "../../platform/logger/null_logger.js";

describe("GameService Error Branches & State Machine Guards (MAJ-043)", () => {
  let adapter: MockRoomGameAdapter;
  let service: GameService;

  const createTestRoom = (
    status: RoomStatus = "playing",
    code = "ERRT",
  ): RoomState => {
    const chess = new Chess();
    const whitePlayer: Player = {
      id: "player_white_id",
      socketId: "sock_white",
      name: "White Player",
      color: "w",
      isHost: true,
      isConnected: true,
      connectedAt: Date.now(),
    };
    const blackPlayer: Player = {
      id: "player_black_id",
      socketId: "sock_black",
      name: "Black Player",
      color: "b",
      isHost: false,
      isConnected: true,
      connectedAt: Date.now(),
    };

    return {
      roomCode: code,
      status,
      hostId: whitePlayer.id,
      whitePlayer,
      blackPlayer,
      spectators: [],
      game: ChessEngine.extractGameState(chess, null),
      rematch: null,
      drawOffer: null,
      createdAt: Date.now() - 30_000,
      lastActivityAt: Date.now() - 5000,
    };
  };

  beforeEach(() => {
    adapter = new MockRoomGameAdapter();
    service = new GameService(
      adapter,
      new SystemClock(),
      new UuidGenerator(),
      new NullLogger(),
    );
  });

  // =========================================================================
  // 1. Table-Driven Test: PlayerNotInRoomError Across All Operations
  // =========================================================================
  describe("PlayerNotInRoomError guards across state machine operations", () => {
    const unknownSocketId = "sock_imposter_999";

    const operations: Array<{
      name: string;
      setupRoomStatus: RoomStatus;
      setupDrawOrRematch?: (room: RoomState) => void;
      execute: (service: GameService, code: string) => Promise<unknown>;
    }> = [
      {
        name: "makeMove",
        setupRoomStatus: "playing",
        execute: (svc, code) =>
          svc.makeMove(
            { roomCode: code, move: { from: "e2", to: "e4" } },
            unknownSocketId,
          ),
      },
      {
        name: "resignGame",
        setupRoomStatus: "playing",
        execute: (svc, code) => svc.resign(code, unknownSocketId),
      },
      {
        name: "offerDraw",
        setupRoomStatus: "playing",
        execute: (svc, code) => svc.offerDraw(code, unknownSocketId),
      },
      {
        name: "respondDraw",
        setupRoomStatus: "playing",
        setupDrawOrRematch: (room) => {
          room.drawOffer = {
            offeredBy: "player_white_id",
            offeredAt: Date.now(),
          };
        },
        execute: (svc, code) => svc.respondDraw(code, unknownSocketId, true),
      },
      {
        name: "requestRematch",
        setupRoomStatus: "game_over",
        execute: (svc, code) => svc.requestRematch(code, unknownSocketId),
      },
      {
        name: "respondRematch",
        setupRoomStatus: "game_over",
        setupDrawOrRematch: (room) => {
          room.rematch = {
            requestedBy: "player_white_id",
            requestedAt: Date.now(),
            status: "pending",
          };
        },
        execute: (svc, code) => svc.respondRematch(code, unknownSocketId, true),
      },
    ];

    it.each(operations)(
      "throws PlayerNotInRoomError on $name when socketId is not a participant",
      async ({ setupRoomStatus, setupDrawOrRematch, execute }) => {
        // Arrange
        const room = createTestRoom(setupRoomStatus);
        if (setupDrawOrRematch) {
          setupDrawOrRematch(room);
        }
        await adapter.save(room);

        // Act & Assert
        await expect(execute(service, room.roomCode)).rejects.toThrow(
          PlayerNotInRoomError,
        );
      },
    );
  });

  // =========================================================================
  // 2. Table-Driven Test: GameNotActiveError on Disallowed Room Status
  // =========================================================================
  describe("GameNotActiveError guards on invalid room status", () => {
    const activeGameOperations: Array<{
      name: string;
      invalidStatuses: RoomStatus[];
      execute: (service: GameService, code: string) => Promise<unknown>;
    }> = [
      {
        name: "makeMove",
        invalidStatuses: ["lobby", "game_over", "rematch_pending"],
        execute: (svc, code) =>
          svc.makeMove(
            { roomCode: code, move: { from: "e2", to: "e4" } },
            "sock_white",
          ),
      },
      {
        name: "resignGame",
        invalidStatuses: ["lobby", "game_over", "rematch_pending"],
        execute: (svc, code) => svc.resign(code, "sock_white"),
      },
      {
        name: "offerDraw",
        invalidStatuses: ["lobby", "game_over", "rematch_pending"],
        execute: (svc, code) => svc.offerDraw(code, "sock_white"),
      },
      {
        name: "respondDraw",
        invalidStatuses: ["lobby", "game_over", "rematch_pending"],
        execute: (svc, code) => svc.respondDraw(code, "sock_black", true),
      },
    ];

    for (const op of activeGameOperations) {
      it.each(op.invalidStatuses)(
        `${op.name} rejects with GameNotActiveError when room is '%s'`,
        async (status) => {
          // Arrange
          const room = createTestRoom(status);
          room.drawOffer = {
            offeredBy: "player_white_id",
            offeredAt: Date.now(),
          };
          await adapter.save(room);

          // Act & Assert
          await expect(op.execute(service, room.roomCode)).rejects.toThrow(
            GameNotActiveError,
          );
        },
      );
    }

    const postGameStatuses: RoomStatus[] = ["lobby", "playing"];
    it.each(postGameStatuses)(
      "requestRematch rejects with GameNotActiveError when room is '%s'",
      async (status) => {
        // Arrange
        const room = createTestRoom(status);
        await adapter.save(room);

        // Act & Assert
        await expect(
          service.requestRematch(room.roomCode, "sock_white"),
        ).rejects.toThrow(GameNotActiveError);
      },
    );
  });

  // =========================================================================
  // 3. Draw Offer Specific Error Paths
  // =========================================================================
  describe("Draw offer state transition error branches", () => {
    it("throws GameNotActiveError when respondDraw is called without a pending draw offer", async () => {
      // Arrange: Active game with no draw offer
      const room = createTestRoom("playing");
      room.drawOffer = null;
      await adapter.save(room);

      // Act & Assert
      await expect(
        service.respondDraw(room.roomCode, "sock_black", true),
      ).rejects.toThrow(GameNotActiveError);
    });

    it("throws InvalidPayloadError when player attempts to respond to their own draw offer", async () => {
      // Arrange: White offers draw
      const room = createTestRoom("playing");
      room.drawOffer = {
        offeredBy: "player_white_id",
        offeredAt: Date.now(),
      };
      await adapter.save(room);

      // Act & Assert: White tries to accept their own offer
      await expect(
        service.respondDraw(room.roomCode, "sock_white", true),
      ).rejects.toThrow(InvalidPayloadError);
    });
  });

  // =========================================================================
  // 4. Rematch Response Specific Error Paths (MAJ-043)
  // =========================================================================
  describe("Rematch response state transition error branches", () => {
    it("throws GameNotActiveError when respondRematch is called without a rematch record", async () => {
      // Arrange
      const room = createTestRoom("game_over");
      room.rematch = null;
      await adapter.save(room);

      // Act & Assert
      await expect(
        service.respondRematch(room.roomCode, "sock_black", true),
      ).rejects.toThrow(GameNotActiveError);
    });

    it("throws GameNotActiveError when rematch status is not 'pending'", async () => {
      // Arrange: Already accepted or declined
      const room = createTestRoom("game_over");
      room.rematch = {
        requestedBy: "player_white_id",
        requestedAt: Date.now(),
        status: "declined",
      };
      await adapter.save(room);

      // Act & Assert
      await expect(
        service.respondRematch(room.roomCode, "sock_black", true),
      ).rejects.toThrow(GameNotActiveError);
    });

    it("throws InvalidPayloadError when player attempts to accept their own rematch request", async () => {
      // Arrange: White requested rematch
      const room = createTestRoom("game_over");
      room.rematch = {
        requestedBy: "player_white_id",
        requestedAt: Date.now(),
        status: "pending",
      };
      await adapter.save(room);

      // Act & Assert: White attempts to respond to own request
      await expect(
        service.respondRematch(room.roomCode, "sock_white", true),
      ).rejects.toThrow(InvalidPayloadError);
    });

    const disconnectedPlayerCases = [
      {
        scenario: "white player is disconnected",
        responderSocketId: "sock_black",
        requestedBy: "player_white_id",
        mutate: (room: RoomState) => {
          if (room.whitePlayer) room.whitePlayer.isConnected = false;
        },
      },
      {
        scenario: "black player is disconnected",
        responderSocketId: "sock_white",
        requestedBy: "player_black_id",
        mutate: (room: RoomState) => {
          if (room.blackPlayer) room.blackPlayer.isConnected = false;
        },
      },
      {
        scenario: "white player is null",
        responderSocketId: "sock_black",
        requestedBy: "player_white_id",
        mutate: (room: RoomState) => {
          room.whitePlayer = null;
        },
      },
      {
        scenario: "black player is null",
        responderSocketId: "sock_white",
        requestedBy: "player_black_id",
        mutate: (room: RoomState) => {
          room.blackPlayer = null;
        },
      },
    ];

    it.each(disconnectedPlayerCases)(
      "throws GameNotActiveError when accepting rematch but $scenario (line 487)",
      async ({ mutate, responderSocketId, requestedBy }) => {
        // Arrange
        const room = createTestRoom("game_over");
        room.rematch = {
          requestedBy,
          requestedAt: Date.now(),
          status: "pending",
        };
        mutate(room);
        await adapter.save(room);

        // Act & Assert
        await expect(
          service.respondRematch(room.roomCode, responderSocketId, true),
        ).rejects.toThrow(GameNotActiveError);
      },
    );
  });
});
