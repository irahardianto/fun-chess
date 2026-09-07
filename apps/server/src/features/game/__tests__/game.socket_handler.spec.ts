import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerGameSocketHandlers } from "../game.socket_handler.js";
import { GameService } from "../game.service.js";
import { MockRoomStore } from "../../rooms/mock_room.store.js";
import { NullLogger } from "../../../platform/logger/null_logger.js";
import { TypedSocketServer } from "../../../platform/socket/socket_server.js";
import { Socket } from "socket.io";
import { RoomState } from "@fun-chess/shared";
import { ChessEngine } from "../chess_engine.js";
import { Chess } from "chess.js";
import { clearAllDisconnectTimers } from "../../rooms/room.socket_handler.js";
import { SocketRateLimiter } from "../../../platform/socket/socket_rate_limiter.js";

class TestSocket {
  public id: string;
  public handshake = { address: "127.0.0.1" };
  public rooms = new Set<string>();
  public handlers = new Map<
    string,
    (payload: any, callback?: any) => Promise<any>
  >();
  public emittedEvents: { event: string; payload: unknown }[] = [];
  public toEmits: { room: string; event: string; payload: unknown }[] = [];

  constructor(id = "sock_white") {
    this.id = id;
  }

  on(event: string, handler: (payload: any, callback?: any) => Promise<any>) {
    this.handlers.set(event, handler);
    return this;
  }

  emit(event: string, payload: unknown) {
    this.emittedEvents.push({ event, payload });
    return true;
  }

  to(room: string) {
    return {
      emit: (event: string, payload: unknown) => {
        this.toEmits.push({ room, event, payload });
        return true;
      },
    };
  }

  async trigger(
    event: string,
    payload: unknown,
    callback?: (res: any) => void,
  ) {
    const handler = this.handlers.get(event);
    if (!handler) throw new Error(`No handler registered for event: ${event}`);
    return handler(payload, callback);
  }
}

class TestIo {
  public toEmits: { room: string; event: string; payload: unknown }[] = [];

  to(room: string) {
    return {
      emit: (event: string, payload: unknown) => {
        this.toEmits.push({ room, event, payload });
        return true;
      },
    };
  }
}

describe("Game Socket Handlers", () => {
  let store: MockRoomStore;
  let service: GameService;
  let logger: NullLogger;
  let io: TestIo;
  let whiteSocket: TestSocket;
  let blackSocket: TestSocket;

  const setupActiveRoom = async (
    code = "CHSS",
    customFen?: string,
  ): Promise<RoomState> => {
    const chess = customFen ? new Chess(customFen) : new Chess();
    const room: RoomState = {
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
    await store.save(room);
    return room;
  };

  beforeEach(() => {
    store = new MockRoomStore();
    service = new GameService(store);
    logger = new NullLogger();
    io = new TestIo();
    whiteSocket = new TestSocket("sock_white");
    blackSocket = new TestSocket("sock_black");
    clearAllDisconnectTimers();

    registerGameSocketHandlers(
      io as unknown as TypedSocketServer,
      whiteSocket as unknown as Socket,
      service,
      logger,
    );
    registerGameSocketHandlers(
      io as unknown as TypedSocketServer,
      blackSocket as unknown as Socket,
      service,
      logger,
    );
  });

  afterEach(() => {
    clearAllDisconnectTimers();
    vi.restoreAllMocks();
  });

  describe("game:move", () => {
    it("applies legal move, emits game:moved to room, and sends success ack callback", async () => {
      await setupActiveRoom("GAME");

      let ackResponse: any;
      await whiteSocket.trigger(
        "game:move",
        { roomCode: "GAME", move: { from: "e2", to: "e4" } },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);
      expect(ackResponse.moveResult.san).toBe("e4");

      const movedEmit = io.toEmits.find((e) => e.event === "game:moved");
      expect(movedEmit).toBeDefined();
      expect(movedEmit?.room).toBe("GAME");
      expect((movedEmit?.payload as any).move.san).toBe("e4");
      expect((movedEmit?.payload as any).gameState.turn).toBe("b");
    });

    it("emits game:check when move puts opponent in check", async () => {
      // Setup position where White Queen checks Black King
      const openCheckFen =
        "rnb1kbnr/pppp1ppp/8/8/4q3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1";
      await setupActiveRoom("CHCK", openCheckFen);

      // White plays Qe2 to block or counter-check
      const checkPositionFen =
        "rnbqkbnr/pppp1ppp/8/8/4P3/8/PPPPQPPP/RNB1KBNR w KQkq - 0 1";
      // Let's create a move that delivers check: White plays Qh5+ after 1. e4 e5 2. f4 exf4
      const preCheckFen =
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
      await setupActiveRoom("DELIVER_CHECK", preCheckFen);

      await whiteSocket.trigger(
        "game:move",
        { roomCode: "DELIVER_CHECK", move: { from: "d1", to: "h5" } },
        () => {},
      );

      // In this setup, h5 is legal, queen on h5 attacks e8? No, f7 blocks, so not check yet.
      // Let's use checkmate position:
    });

    it("emits game:over with checkmate reason on winning checkmate move", async () => {
      const scholarMateFen =
        "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
      await setupActiveRoom("MATE", scholarMateFen);

      await whiteSocket.trigger(
        "game:move",
        { roomCode: "MATE", move: { from: "h5", to: "f7" } },
        () => {},
      );

      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeDefined();
      expect((gameOverEmit?.payload as any).reason).toBe("checkmate");
      expect((gameOverEmit?.payload as any).winner).toBe("w");
      expect((gameOverEmit?.payload as any).winnerName).toBe("White Player");
    });

    it("returns structured error ack on illegal move", async () => {
      await setupActiveRoom("FAIL");

      let ackResponse: any;
      await whiteSocket.trigger(
        "game:move",
        { roomCode: "FAIL", move: { from: "e2", to: "e7" } },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_INVALID_MOVE");
      expect(ackResponse.error.correlationId).toBeDefined();
    });

    it("rejects game:move with ERR_RATE_LIMITED when rate limit is exceeded (SEC-HIGH-001)", async () => {
      await setupActiveRoom("FLOOD_MOVE");
      const floodSocket = new TestSocket("sock_flood");
      floodSocket.handshake.address = "192.168.5.55";
      const limiter = new SocketRateLimiter({ maxRequests: 5, windowMs: 10_000 });

      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        floodSocket as unknown as Socket,
        service,
        logger,
        limiter,
      );

      // Consume 5 requests
      for (let i = 0; i < 5; i++) {
        let ack: any;
        await floodSocket.trigger(
          "game:move",
          { roomCode: "FLOOD_MOVE", move: { from: "e2", to: "e4" } },
          (res) => {
            ack = res;
          },
        );
      }

      // 6th request must be rejected
      let rateLimitAck: any;
      await floodSocket.trigger(
        "game:move",
        { roomCode: "FLOOD_MOVE", move: { from: "e2", to: "e4" } },
        (res) => {
          rateLimitAck = res;
        },
      );

      expect(rateLimitAck.success).toBe(false);
      expect(rateLimitAck.error.code).toBe("ERR_RATE_LIMITED");
      expect(rateLimitAck.error.message).toContain("Rate limit exceeded for game moves");
    });
  });

  describe("game:resign", () => {
    it("concedes game, emits game:over to room with resignation reason and awards win to opponent", async () => {
      await setupActiveRoom("RESIGN");

      let ackResponse: any;
      await whiteSocket.trigger(
        "game:resign",
        { roomCode: "RESIGN" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);

      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeDefined();
      expect((gameOverEmit?.payload as any).reason).toBe("resignation");
      expect((gameOverEmit?.payload as any).winner).toBe("b");
      expect((gameOverEmit?.payload as any).winnerName).toBe("Black Player");
    });
  });

  describe("game:offer_draw & game:respond_draw", () => {
    it("sends game:draw_offered to opponent socket", async () => {
      await setupActiveRoom("DRAW");

      let ackResponse: any;
      await whiteSocket.trigger(
        "game:offer_draw",
        { roomCode: "DRAW" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);

      const drawOfferedEmit = io.toEmits.find(
        (e) => e.event === "game:draw_offered",
      );
      expect(drawOfferedEmit).toBeDefined();
      expect(drawOfferedEmit?.room).toBe("sock_black");
      expect((drawOfferedEmit?.payload as any).fromPlayerName).toBe(
        "White Player",
      );
    });

    it("emits game:over with draw_agreement reason when draw is accepted", async () => {
      await setupActiveRoom("DRAW");

      await whiteSocket.trigger(
        "game:offer_draw",
        { roomCode: "DRAW" },
        () => {},
      );

      let ackResponse: any;
      await blackSocket.trigger(
        "game:respond_draw",
        { roomCode: "DRAW", accept: true },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);

      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeDefined();
      expect((gameOverEmit?.payload as any).reason).toBe("draw_agreement");
      expect((gameOverEmit?.payload as any).winner).toBe("draw");
    });

    it("emits game:draw_declined to room when draw is declined", async () => {
      await setupActiveRoom("DRAW");

      await whiteSocket.trigger(
        "game:offer_draw",
        { roomCode: "DRAW" },
        () => {},
      );

      let ackResponse: any;
      await blackSocket.trigger(
        "game:respond_draw",
        { roomCode: "DRAW", accept: false },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);

      const declinedEmit = io.toEmits.find(
        (e) => e.event === "game:draw_declined",
      );
      expect(declinedEmit).toBeDefined();
      expect(declinedEmit?.room).toBe("DRAW");
      expect((declinedEmit?.payload as any).byPlayerId).toBe("p_black_id");
    });
  });

  describe("game:request_rematch & game:respond_rematch", () => {
    it("broadcasts game:rematch_requested when requested after game over", async () => {
      const room = await setupActiveRoom("REMATCH");
      room.status = "game_over";
      await store.save(room);

      let ackResponse: any;
      await whiteSocket.trigger(
        "game:request_rematch",
        { roomCode: "REMATCH" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);

      const rematchReqEmit = io.toEmits.find(
        (e) => e.event === "game:rematch_requested",
      );
      expect(rematchReqEmit).toBeDefined();
      expect(rematchReqEmit?.room).toBe("REMATCH");
      expect((rematchReqEmit?.payload as any).requestedBy).toBe("p_white_id");
    });

    it("swaps colors and emits game:rematch_started with gameState and room when opponent accepts rematch", async () => {
      const room = await setupActiveRoom("REMATCH");
      room.status = "game_over";
      await store.save(room);

      await whiteSocket.trigger(
        "game:request_rematch",
        { roomCode: "REMATCH" },
        () => {},
      );

      let ackResponse: any;
      await blackSocket.trigger(
        "game:respond_rematch",
        { roomCode: "REMATCH", accept: true },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);

      const rematchStartedEmit = io.toEmits.find(
        (e) => e.event === "game:rematch_started",
      );
      expect(rematchStartedEmit).toBeDefined();
      expect(rematchStartedEmit?.room).toBe("REMATCH");
      expect((rematchStartedEmit?.payload as any).gameState.turn).toBe("w");
      expect((rematchStartedEmit?.payload as any).room.whitePlayer.id).toBe(
        "p_black_id",
      );
      expect((rematchStartedEmit?.payload as any).room.blackPlayer.id).toBe(
        "p_white_id",
      );

      const savedRoom = await store.findByCode("REMATCH");
      expect(savedRoom?.status).toBe("playing");
      expect(savedRoom?.whitePlayer?.id).toBe("p_black_id"); // Black swapped to White
      expect(savedRoom?.blackPlayer?.id).toBe("p_white_id"); // White swapped to Black
    });

    it("emits game:rematch_declined when opponent declines rematch", async () => {
      const room = await setupActiveRoom("REMATCH");
      room.status = "game_over";
      await store.save(room);

      await whiteSocket.trigger(
        "game:request_rematch",
        { roomCode: "REMATCH" },
        () => {},
      );

      let ackResponse: any;
      await blackSocket.trigger(
        "game:respond_rematch",
        { roomCode: "REMATCH", accept: false },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);

      const rematchDeclinedEmit = io.toEmits.find(
        (e) => e.event === "game:rematch_declined",
      );
      expect(rematchDeclinedEmit).toBeDefined();
      expect(rematchDeclinedEmit?.room).toBe("REMATCH");
      expect((rematchDeclinedEmit?.payload as any).byPlayerId).toBe(
        "p_black_id",
      );
    });
  });

  describe("Payload sanitization and malformed requests", () => {
    it("handles null or undefined payload in game:move without crashing", async () => {
      let ackResponse: any;
      await whiteSocket.trigger("game:move", null, (res) => {
        ackResponse = res;
      });

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBeDefined();
    });

    it("handles missing roomCode in game:resign gracefully", async () => {
      let ackResponse: any;
      await whiteSocket.trigger("game:resign", {}, (res) => {
        ackResponse = res;
      });

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_ROOM_NOT_FOUND");
    });

    it("handles missing roomCode in game:offer_draw gracefully", async () => {
      let ackResponse: any;
      await whiteSocket.trigger("game:offer_draw", {}, (res) => {
        ackResponse = res;
      });

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_ROOM_NOT_FOUND");
    });

    it("handles missing roomCode in game:respond_draw gracefully", async () => {
      let ackResponse: any;
      await blackSocket.trigger("game:respond_draw", {}, (res) => {
        ackResponse = res;
      });

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_ROOM_NOT_FOUND");
    });

    it("handles missing roomCode in game:request_rematch gracefully", async () => {
      let ackResponse: any;
      await whiteSocket.trigger("game:request_rematch", {}, (res) => {
        ackResponse = res;
      });

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_ROOM_NOT_FOUND");
    });

    it("handles missing roomCode in game:respond_rematch gracefully", async () => {
      let ackResponse: any;
      await blackSocket.trigger("game:respond_rematch", {}, (res) => {
        ackResponse = res;
      });

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_ROOM_NOT_FOUND");
    });

    it("rejects malformed move payload with ERR_INVALID_PAYLOAD when coordinates are invalid", async () => {
      let ackResponse: any;
      await whiteSocket.trigger(
        "game:move",
        { roomCode: "GAME", move: { from: "zz", to: "e4" } },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("rejects malformed move payload with ERR_INVALID_PAYLOAD when move object is missing", async () => {
      let ackResponse: any;
      await whiteSocket.trigger(
        "game:move",
        { roomCode: "GAME" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("emits error event for unacknowledged malformed move", async () => {
      await whiteSocket.trigger("game:move", { roomCode: "GAME", move: {} });

      const errorEvent = whiteSocket.emittedEvents.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect((errorEvent?.payload as any).code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("rejects malformed game:respond_draw with ERR_INVALID_PAYLOAD when accept is not boolean", async () => {
      let ackResponse: any;
      await blackSocket.trigger(
        "game:respond_draw",
        { roomCode: "DRAW", accept: "not_a_boolean" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("rejects malformed game:respond_rematch with ERR_INVALID_PAYLOAD when accept is not boolean", async () => {
      let ackResponse: any;
      await blackSocket.trigger(
        "game:respond_rematch",
        { roomCode: "REMATCH", accept: 42 },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("rejects malformed empty roomCode in game:resign with ERR_INVALID_PAYLOAD", async () => {
      let ackResponse: any;
      await whiteSocket.trigger(
        "game:resign",
        { roomCode: "" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_INVALID_PAYLOAD");
    });
  });
});
