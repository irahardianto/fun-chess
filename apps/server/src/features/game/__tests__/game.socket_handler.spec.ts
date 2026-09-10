import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerGameSocketHandlers } from "../game.socket_handler.js";
import { GameService } from "../game.service.js";
import { MockRoomGameAdapter } from "./mock_room_adapter.js";
import { NullLogger } from "../../../platform/logger/null_logger.js";
import { TypedSocketServer } from "../../../platform/socket/socket_server.js";
import { Socket } from "socket.io";
import {
  type RoomState,
  type MoveResult,
  type GameState,
  type GameOverPayload,
} from "@fun-chess/shared";
import { ChessEngine } from "../chess_engine.js";
import { Chess } from "chess.js";
import {
  clearAllDisconnectTimers,
  type IDisconnectTimerRegistry,
  MockSessionRegistry,
} from "../../rooms/index.js";
import { SocketRateLimiter } from "../../../platform/socket/socket_rate_limiter.js";
import { SystemClock, UuidGenerator } from "../../../platform/time/index.js";

interface SocketAckResponse {
  success: boolean;
  moveResult?: MoveResult;
  error?: {
    code: string;
    message?: string;
    correlationId?: string;
    details?: unknown;
  };
}

interface GameMovedPayload {
  move: MoveResult;
  gameState: GameState;
}

interface DrawOfferedPayload {
  fromPlayerName: string;
}

interface DrawDeclinedPayload {
  byPlayerId: string;
}

interface RematchRequestedPayload {
  requestedBy: string;
}

interface RematchStartedPayload {
  gameState: GameState;
  room: RoomState;
}

interface RematchDeclinedPayload {
  byPlayerId: string;
}

interface ErrorPayload {
  code: string;
  message?: string;
}

type SocketHandlerFn = (
  payload: unknown,
  callback?: (res: unknown) => void,
) => Promise<unknown>;

class TestSocket {
  public id: string;
  public handshake = { address: "127.0.0.1" };
  public rooms = new Set<string>();
  public handlers = new Map<string, SocketHandlerFn>();
  public emittedEvents: { event: string; payload: unknown }[] = [];
  public toEmits: { room: string; event: string; payload: unknown }[] = [];

  constructor(id = "sock_white") {
    this.id = id;
  }

  on(event: string, handler: SocketHandlerFn) {
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
    callback?: (res: unknown) => void,
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
  let store: MockRoomGameAdapter;
  let service: GameService;
  let logger: NullLogger;
  let io: TestIo;
  let whiteSocket: TestSocket;
  let blackSocket: TestSocket;
  let rateLimiter: SocketRateLimiter;

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
    store = new MockRoomGameAdapter();
    logger = new NullLogger();
    const clock = new SystemClock();
    const idGenerator = new UuidGenerator();
    service = new GameService(store, clock, idGenerator, logger);
    io = new TestIo();
    whiteSocket = new TestSocket("sock_white");
    blackSocket = new TestSocket("sock_black");
    rateLimiter = new SocketRateLimiter({
      maxRequests: 60,
      windowMs: 10_000,
      pruneIntervalMs: 0,
    });
    clearAllDisconnectTimers();

    registerGameSocketHandlers(
      io as unknown as TypedSocketServer,
      whiteSocket as unknown as Socket,
      service,
      logger,
      rateLimiter,
    );
    registerGameSocketHandlers(
      io as unknown as TypedSocketServer,
      blackSocket as unknown as Socket,
      service,
      logger,
      rateLimiter,
    );
  });

  afterEach(() => {
    clearAllDisconnectTimers();
    rateLimiter.destroy();
    vi.restoreAllMocks();
  });

  describe("game:move", () => {
    it("applies legal move, emits game:moved to room, and sends success ack callback", async () => {
      await setupActiveRoom("GAME");

      let ackResponse: SocketAckResponse | undefined;
      await whiteSocket.trigger(
        "game:move",
        { roomCode: "GAME", move: { from: "e2", to: "e4" } },
        (res) => {
          ackResponse = res as SocketAckResponse;
        },
      );

      expect(ackResponse?.success).toBe(true);
      expect(ackResponse?.moveResult?.san).toBe("e4");

      const movedEmit = io.toEmits.find((e) => e.event === "game:moved");
      expect(movedEmit).toBeDefined();
      expect(movedEmit?.room).toBe("GAME");
      const movedPayload = movedEmit?.payload as GameMovedPayload | undefined;
      expect(movedPayload?.move.san).toBe("e4");
      expect(movedPayload?.gameState.turn).toBe("b");
    });

    it("emits game:check when move puts opponent in check", async () => {
      // Setup position where White Queen checks Black King
      const openCheckFen =
        "rnb1kbnr/pppp1ppp/8/8/4q3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1";
      await setupActiveRoom("CHCK", openCheckFen);

      // Let's create a move that delivers check: White plays Qh5+ after 1. e4 e5 2. f4 exf4
      const preCheckFen =
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
      await setupActiveRoom("DCHK", preCheckFen);

      await whiteSocket.trigger(
        "game:move",
        { roomCode: "DCHK", move: { from: "d1", to: "h5" } },
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
      const gameOverPayload = gameOverEmit?.payload as
        GameOverPayload | undefined;
      expect(gameOverPayload?.reason).toBe("checkmate");
      expect(gameOverPayload?.winner).toBe("w");
      expect(gameOverPayload?.winnerName).toBe("White Player");
    });

    it("returns structured error ack on illegal move", async () => {
      await setupActiveRoom("FAIL");

      let ackResponse: SocketAckResponse | undefined;
      await whiteSocket.trigger(
        "game:move",
        { roomCode: "FAIL", move: { from: "e2", to: "e7" } },
        (res) => {
          ackResponse = res as SocketAckResponse;
        },
      );

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_MOVE");
      expect(ackResponse?.error?.correlationId).toBeDefined();
    });

    it("rejects game:move with ERR_RATE_LIMITED when rate limit is exceeded (SEC-HIGH-001)", async () => {
      await setupActiveRoom("FLOD");
      const floodSocket = new TestSocket("sock_flood");
      floodSocket.handshake.address = "192.168.5.55";
      const limiter = new SocketRateLimiter({
        maxRequests: 5,
        windowMs: 10_000,
      });

      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        floodSocket as unknown as Socket,
        service,
        logger,
        limiter,
      );

      // Consume 5 requests
      for (let i = 0; i < 5; i++) {
        await floodSocket.trigger(
          "game:move",
          { roomCode: "FLOD", move: { from: "e2", to: "e4" } },
          () => {},
        );
      }

      // 6th request must be rejected
      let rateLimitAck: SocketAckResponse | undefined;
      await floodSocket.trigger(
        "game:move",
        { roomCode: "FLOD", move: { from: "e2", to: "e4" } },
        (res) => {
          rateLimitAck = res as SocketAckResponse;
        },
      );

      expect(rateLimitAck?.success).toBe(false);
      expect(rateLimitAck?.error?.code).toBe("ERR_RATE_LIMITED");
      expect(rateLimitAck?.error?.message).toContain(
        "Maximum 5 requests per 10 seconds allowed.",
      );
    });
  });

  describe("game:resign", () => {
    it("concedes game, emits game:over to room with resignation reason and awards win to opponent", async () => {
      await setupActiveRoom("RSGN");

      let ackResponse: SocketAckResponse | undefined;
      await whiteSocket.trigger("game:resign", { roomCode: "RSGN" }, (res) => {
        ackResponse = res as SocketAckResponse;
      });

      expect(ackResponse?.success).toBe(true);

      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeDefined();
      const gameOverPayload = gameOverEmit?.payload as
        GameOverPayload | undefined;
      expect(gameOverPayload?.reason).toBe("resignation");
      expect(gameOverPayload?.winner).toBe("b");
      expect(gameOverPayload?.winnerName).toBe("Black Player");
    });
  });

  describe("game:offer_draw & game:respond_draw", () => {
    it("sends game:draw_offered to opponent socket", async () => {
      await setupActiveRoom("DRAW");

      let ackResponse: SocketAckResponse | undefined;
      await whiteSocket.trigger(
        "game:offer_draw",
        { roomCode: "DRAW" },
        (res) => {
          ackResponse = res as SocketAckResponse;
        },
      );

      expect(ackResponse?.success).toBe(true);

      const drawOfferedEmit = io.toEmits.find(
        (e) => e.event === "game:draw_offered",
      );
      expect(drawOfferedEmit).toBeDefined();
      expect(drawOfferedEmit?.room).toBe("sock_black");
      const drawOfferedPayload = drawOfferedEmit?.payload as
        DrawOfferedPayload | undefined;
      expect(drawOfferedPayload?.fromPlayerName).toBe("White Player");
    });

    it("emits game:over with draw_agreement reason when draw is accepted", async () => {
      await setupActiveRoom("DRAW");

      await whiteSocket.trigger(
        "game:offer_draw",
        { roomCode: "DRAW" },
        () => {},
      );

      let ackResponse: SocketAckResponse | undefined;
      await blackSocket.trigger(
        "game:respond_draw",
        { roomCode: "DRAW", accept: true },
        (res) => {
          ackResponse = res as SocketAckResponse;
        },
      );

      expect(ackResponse?.success).toBe(true);

      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeDefined();
      const gameOverPayload = gameOverEmit?.payload as
        GameOverPayload | undefined;
      expect(gameOverPayload?.reason).toBe("draw_agreement");
      expect(gameOverPayload?.winner).toBe("draw");
    });

    it("emits game:draw_declined to room when draw is declined", async () => {
      await setupActiveRoom("DRAW");

      await whiteSocket.trigger(
        "game:offer_draw",
        { roomCode: "DRAW" },
        () => {},
      );

      let ackResponse: SocketAckResponse | undefined;
      await blackSocket.trigger(
        "game:respond_draw",
        { roomCode: "DRAW", accept: false },
        (res) => {
          ackResponse = res as SocketAckResponse;
        },
      );

      expect(ackResponse?.success).toBe(true);

      const declinedEmit = io.toEmits.find(
        (e) => e.event === "game:draw_declined",
      );
      expect(declinedEmit).toBeDefined();
      expect(declinedEmit?.room).toBe("DRAW");
      const declinedPayload = declinedEmit?.payload as
        DrawDeclinedPayload | undefined;
      expect(declinedPayload?.byPlayerId).toBe("p_black_id");
    });
  });

  describe("game:request_rematch & game:respond_rematch", () => {
    it("broadcasts game:rematch_requested when requested after game over", async () => {
      const room = await setupActiveRoom("MTCH");
      room.status = "game_over";
      await store.save(room);

      let ackResponse: SocketAckResponse | undefined;
      await whiteSocket.trigger(
        "game:request_rematch",
        { roomCode: "MTCH" },
        (res) => {
          ackResponse = res as SocketAckResponse;
        },
      );

      expect(ackResponse?.success).toBe(true);

      const rematchReqEmit = io.toEmits.find(
        (e) => e.event === "game:rematch_requested",
      );
      expect(rematchReqEmit).toBeDefined();
      expect(rematchReqEmit?.room).toBe("MTCH");
      const rematchReqPayload = rematchReqEmit?.payload as
        RematchRequestedPayload | undefined;
      expect(rematchReqPayload?.requestedBy).toBe("p_white_id");
    });

    it("swaps colors and emits game:rematch_started with gameState and room when opponent accepts rematch", async () => {
      const room = await setupActiveRoom("MTCH");
      room.status = "game_over";
      await store.save(room);

      await whiteSocket.trigger(
        "game:request_rematch",
        { roomCode: "MTCH" },
        () => {},
      );

      let ackResponse: SocketAckResponse | undefined;
      await blackSocket.trigger(
        "game:respond_rematch",
        { roomCode: "MTCH", accept: true },
        (res) => {
          ackResponse = res as SocketAckResponse;
        },
      );

      expect(ackResponse?.success).toBe(true);

      const rematchStartedEmit = io.toEmits.find(
        (e) => e.event === "game:rematch_started",
      );
      expect(rematchStartedEmit).toBeDefined();
      expect(rematchStartedEmit?.room).toBe("MTCH");
      const rematchStartedPayload = rematchStartedEmit?.payload as
        RematchStartedPayload | undefined;
      expect(rematchStartedPayload?.gameState.turn).toBe("w");
      expect(rematchStartedPayload?.room.whitePlayer?.id).toBe("p_black_id");
      expect(rematchStartedPayload?.room.blackPlayer?.id).toBe("p_white_id");
      expect(rematchStartedPayload?.room.whitePlayer?.socketId).toBeUndefined();
      expect(rematchStartedPayload?.room.blackPlayer?.socketId).toBeUndefined();

      const savedRoom = await store.findByCode("MTCH");
      expect(savedRoom?.status).toBe("playing");
      expect(savedRoom?.whitePlayer?.id).toBe("p_black_id"); // Black swapped to White
      expect(savedRoom?.blackPlayer?.id).toBe("p_white_id"); // White swapped to Black
    });

    it("emits game:rematch_declined when opponent declines rematch", async () => {
      const room = await setupActiveRoom("MTCH");
      room.status = "game_over";
      await store.save(room);

      await whiteSocket.trigger(
        "game:request_rematch",
        { roomCode: "MTCH" },
        () => {},
      );

      let ackResponse: SocketAckResponse | undefined;
      await blackSocket.trigger(
        "game:respond_rematch",
        { roomCode: "MTCH", accept: false },
        (res) => {
          ackResponse = res as SocketAckResponse;
        },
      );

      expect(ackResponse?.success).toBe(true);

      const rematchDeclinedEmit = io.toEmits.find(
        (e) => e.event === "game:rematch_declined",
      );
      expect(rematchDeclinedEmit).toBeDefined();
      expect(rematchDeclinedEmit?.room).toBe("MTCH");
      const rematchDeclinedPayload = rematchDeclinedEmit?.payload as
        RematchDeclinedPayload | undefined;
      expect(rematchDeclinedPayload?.byPlayerId).toBe("p_black_id");
    });

    it("cancels all disconnect timers for the room when rematch is accepted", async () => {
      const room = await setupActiveRoom("MTCH");
      room.status = "game_over";
      await store.save(room);

      const mockTimers: IDisconnectTimerRegistry = {
        set: vi.fn(),
        get: vi.fn(),
        cancelAllForRoom: vi.fn(),
        cancel: vi.fn(),
        clear: vi.fn(),
        size: vi.fn(() => 0),
      };

      const customWhiteSocket = new TestSocket("sock_white");
      const customBlackSocket = new TestSocket("sock_black");

      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        customWhiteSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
        mockTimers,
      );
      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        customBlackSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
        mockTimers,
      );

      await customWhiteSocket.trigger(
        "game:request_rematch",
        { roomCode: "MTCH" },
        () => {},
      );

      await customBlackSocket.trigger(
        "game:respond_rematch",
        { roomCode: "MTCH", accept: true },
        () => {},
      );

      expect(mockTimers.cancelAllForRoom).toHaveBeenCalledWith("MTCH");
    });
  });

  describe("Payload sanitization and malformed requests", () => {
    it("handles null or undefined payload in game:move without crashing", async () => {
      let ackResponse: SocketAckResponse | undefined;
      await whiteSocket.trigger("game:move", null, (res) => {
        ackResponse = res as SocketAckResponse;
      });

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBeDefined();
    });

    it("handles missing roomCode in game:resign gracefully", async () => {
      let ackResponse: SocketAckResponse | undefined;
      await whiteSocket.trigger("game:resign", {}, (res) => {
        ackResponse = res as SocketAckResponse;
      });

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("handles missing roomCode in game:offer_draw gracefully", async () => {
      let ackResponse: SocketAckResponse | undefined;
      await whiteSocket.trigger("game:offer_draw", {}, (res) => {
        ackResponse = res as SocketAckResponse;
      });

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("handles missing roomCode in game:respond_draw gracefully", async () => {
      let ackResponse: SocketAckResponse | undefined;
      await blackSocket.trigger("game:respond_draw", {}, (res) => {
        ackResponse = res as SocketAckResponse;
      });

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("handles missing roomCode in game:request_rematch gracefully", async () => {
      let ackResponse: SocketAckResponse | undefined;
      await whiteSocket.trigger("game:request_rematch", {}, (res) => {
        ackResponse = res as SocketAckResponse;
      });

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("handles missing roomCode in game:respond_rematch gracefully", async () => {
      let ackResponse: SocketAckResponse | undefined;
      await blackSocket.trigger("game:respond_rematch", {}, (res) => {
        ackResponse = res as SocketAckResponse;
      });

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("rejects malformed move payload with ERR_INVALID_PAYLOAD when coordinates are invalid", async () => {
      let ackResponse: SocketAckResponse | undefined;
      await whiteSocket.trigger(
        "game:move",
        { roomCode: "GAME", move: { from: "zz", to: "e4" } },
        (res) => {
          ackResponse = res as SocketAckResponse;
        },
      );

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("rejects malformed move payload with ERR_INVALID_PAYLOAD when move object is missing", async () => {
      let ackResponse: SocketAckResponse | undefined;
      await whiteSocket.trigger("game:move", { roomCode: "GAME" }, (res) => {
        ackResponse = res as SocketAckResponse;
      });

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("emits error event for unacknowledged malformed move", async () => {
      await whiteSocket.trigger("game:move", { roomCode: "GAME", move: {} });

      const errorEvent = whiteSocket.emittedEvents.find(
        (e) => e.event === "error",
      );
      expect(errorEvent).toBeDefined();
      const errorPayload = errorEvent?.payload as ErrorPayload | undefined;
      expect(errorPayload?.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("rejects malformed game:respond_draw with ERR_INVALID_PAYLOAD when accept is not boolean", async () => {
      let ackResponse: SocketAckResponse | undefined;
      await blackSocket.trigger(
        "game:respond_draw",
        { roomCode: "DRAW", accept: "not_a_boolean" },
        (res) => {
          ackResponse = res as SocketAckResponse;
        },
      );

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("rejects malformed game:respond_rematch with ERR_INVALID_PAYLOAD when accept is not boolean", async () => {
      let ackResponse: SocketAckResponse | undefined;
      await blackSocket.trigger(
        "game:respond_rematch",
        { roomCode: "REMATCH", accept: 42 },
        (res) => {
          ackResponse = res as SocketAckResponse;
        },
      );

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("rejects malformed empty roomCode in game:resign with ERR_INVALID_PAYLOAD", async () => {
      let ackResponse: SocketAckResponse | undefined;
      await whiteSocket.trigger("game:resign", { roomCode: "" }, (res) => {
        ackResponse = res as SocketAckResponse;
      });

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
    });
  });

  describe("Rate limiting across game operations (MAJ-006)", () => {
    it("enforces rate limit and emits structured logger.warn on game:resign", async () => {
      const limiter = new SocketRateLimiter({
        maxRequests: 1,
        windowMs: 10_000,
      });
      const testSocket = new TestSocket("sock_rate_resign");
      testSocket.handshake.address = "192.168.10.10";

      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        testSocket as unknown as Socket,
        service,
        logger,
        limiter,
      );

      // Consume 1 permit
      await testSocket.trigger("game:resign", { roomCode: "RSGN" }, () => {});

      // 2nd should be blocked
      let ack: SocketAckResponse | undefined;
      await testSocket.trigger("game:resign", { roomCode: "RSGN" }, (res) => {
        ack = res as SocketAckResponse;
      });

      expect(ack?.success).toBe(false);
      expect(ack?.error?.code).toBe("ERR_RATE_LIMITED");

      const warnLog = logger.warnLogs.find(
        (l) => l.message === "Operation rate limit exceeded",
      );
      expect(warnLog).toBeDefined();
      expect(warnLog?.context?.operation).toBe("game:resign");
      expect(warnLog?.context?.clientIp).toBe("192.168.10.10");
    });

    it("enforces rate limit and emits structured logger.warn on game:offer_draw", async () => {
      const limiter = new SocketRateLimiter({
        maxRequests: 1,
        windowMs: 10_000,
      });
      const testSocket = new TestSocket("sock_rate_draw");
      testSocket.handshake.address = "192.168.10.11";

      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        testSocket as unknown as Socket,
        service,
        logger,
        limiter,
      );

      await testSocket.trigger(
        "game:offer_draw",
        { roomCode: "DRAW" },
        () => {},
      );

      let ack: SocketAckResponse | undefined;
      await testSocket.trigger(
        "game:offer_draw",
        { roomCode: "DRAW" },
        (res) => {
          ack = res as SocketAckResponse;
        },
      );

      expect(ack?.success).toBe(false);
      expect(ack?.error?.code).toBe("ERR_RATE_LIMITED");

      const warnLog = logger.warnLogs.find(
        (l) => l.message === "Operation rate limit exceeded",
      );
      expect(warnLog).toBeDefined();
    });

    it("enforces rate limit and emits structured logger.warn on game:respond_draw", async () => {
      const limiter = new SocketRateLimiter({
        maxRequests: 1,
        windowMs: 10_000,
      });
      const testSocket = new TestSocket("sock_rate_resp_draw");
      testSocket.handshake.address = "192.168.10.12";

      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        testSocket as unknown as Socket,
        service,
        logger,
        limiter,
      );

      await testSocket.trigger(
        "game:respond_draw",
        { roomCode: "DRAW", accept: true },
        () => {},
      );

      let ack: SocketAckResponse | undefined;
      await testSocket.trigger(
        "game:respond_draw",
        { roomCode: "DRAW", accept: true },
        (res) => {
          ack = res as SocketAckResponse;
        },
      );

      expect(ack?.success).toBe(false);
      expect(ack?.error?.code).toBe("ERR_RATE_LIMITED");

      const warnLog = logger.warnLogs.find(
        (l) => l.message === "Operation rate limit exceeded",
      );
      expect(warnLog).toBeDefined();
    });

    it("enforces rate limit and emits structured logger.warn on game:request_rematch", async () => {
      const limiter = new SocketRateLimiter({
        maxRequests: 1,
        windowMs: 10_000,
      });
      const testSocket = new TestSocket("sock_rate_rematch");
      testSocket.handshake.address = "192.168.10.13";

      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        testSocket as unknown as Socket,
        service,
        logger,
        limiter,
      );

      await testSocket.trigger(
        "game:request_rematch",
        { roomCode: "MTCH" },
        () => {},
      );

      let ack: SocketAckResponse | undefined;
      await testSocket.trigger(
        "game:request_rematch",
        { roomCode: "MTCH" },
        (res) => {
          ack = res as SocketAckResponse;
        },
      );

      expect(ack?.success).toBe(false);
      expect(ack?.error?.code).toBe("ERR_RATE_LIMITED");

      const warnLog = logger.warnLogs.find(
        (l) => l.message === "Operation rate limit exceeded",
      );
      expect(warnLog).toBeDefined();
    });

    it("enforces rate limit and emits structured logger.warn on game:respond_rematch", async () => {
      const limiter = new SocketRateLimiter({
        maxRequests: 1,
        windowMs: 10_000,
      });
      const testSocket = new TestSocket("sock_rate_resp_rematch");
      testSocket.handshake.address = "192.168.10.14";

      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        testSocket as unknown as Socket,
        service,
        logger,
        limiter,
      );

      await testSocket.trigger(
        "game:respond_rematch",
        { roomCode: "MTCH", accept: true },
        () => {},
      );

      let ack: SocketAckResponse | undefined;
      await testSocket.trigger(
        "game:respond_rematch",
        { roomCode: "MTCH", accept: true },
        (res) => {
          ack = res as SocketAckResponse;
        },
      );

      expect(ack?.success).toBe(false);
      expect(ack?.error?.code).toBe("ERR_RATE_LIMITED");

      const warnLog = logger.warnLogs.find(
        (l) => l.message === "Operation rate limit exceeded",
      );
      expect(warnLog).toBeDefined();
    });
  });

  describe("Session Sliding TTL on Valid Move (CRIT-002, F-04)", () => {
    it("does not directly invoke sessionRegistry.touchSession in the socket handler on game:move (F-04)", async () => {
      await setupActiveRoom("SESS");
      const touchSessionSpy = vi.fn().mockResolvedValue(undefined);
      const _mockSessionRegistry = {
        touchSession: touchSessionSpy,
      } as unknown as import("../../rooms/index.js").SessionRegistry;

      const customSocket = new TestSocket("sock_white");
      customSocket.data = {
        sessionToken: "token-socket-123",
        userId: "p_white_id",
        roomCode: "SESS",
      };

      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        customSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let ack: SocketAckResponse | undefined;
      await customSocket.trigger(
        "game:move",
        { roomCode: "SESS", move: { from: "e2", to: "e4" } },
        (res) => {
          ack = res as SocketAckResponse;
        },
      );

      expect(ack?.success).toBe(true);
      expect(touchSessionSpy).not.toHaveBeenCalled();
    });

    it("does not call getSessionTokenForPlayer or touchSession from socket handler when sessionToken is absent", async () => {
      await setupActiveRoom("SES2");
      const touchSessionSpy = vi.fn().mockResolvedValue(undefined);
      const getSessionTokenSpy = vi.fn().mockReturnValue("token-lookup-456");
      const _mockSessionRegistry = {
        touchSession: touchSessionSpy,
        getSessionTokenForPlayer: getSessionTokenSpy,
      } as unknown as import("../../rooms/index.js").SessionRegistry;

      const customSocket = new TestSocket("sock_white");
      customSocket.data = {
        userId: "p_white_id",
        roomCode: "SES2",
      };

      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        customSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let ack: SocketAckResponse | undefined;
      await customSocket.trigger(
        "game:move",
        { roomCode: "SES2", move: { from: "e2", to: "e4" } },
        (res) => {
          ack = res as SocketAckResponse;
        },
      );

      expect(ack?.success).toBe(true);
      expect(touchSessionSpy).not.toHaveBeenCalled();
      expect(getSessionTokenSpy).not.toHaveBeenCalled();
    });

    it("does not call touchSession on MockSessionRegistry directly from socket handler", async () => {
      await setupActiveRoom("SES3");
      const mockSessionRegistry = new MockSessionRegistry();
      await mockSessionRegistry.createSession({
        roomCode: "SES3",
        playerId: "p_white_id",
        socketId: "sock_white",
      });
      const touchSpy = vi.spyOn(mockSessionRegistry, "touchSession");

      const customSocket = new TestSocket("sock_white");
      customSocket.data = {
        userId: "p_white_id",
        roomCode: "SES3",
      };

      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        customSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
        undefined,
        mockSessionRegistry,
      );

      let ack: SocketAckResponse | undefined;
      await customSocket.trigger(
        "game:move",
        { roomCode: "SES3", move: { from: "e2", to: "e4" } },
        (res) => {
          ack = res as SocketAckResponse;
        },
      );

      expect(ack?.success).toBe(true);
      expect(touchSpy).not.toHaveBeenCalled();
    });

    it("does not call touchSession when no sessionToken or userId is present", async () => {
      await setupActiveRoom("SES4");
      const touchSessionSpy = vi.fn().mockResolvedValue(undefined);
      const _mockSessionRegistry = {
        touchSession: touchSessionSpy,
      } as unknown as import("../../rooms/index.js").SessionRegistry;

      const customSocket = new TestSocket("sock_white");
      customSocket.data = undefined;

      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        customSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let ack: SocketAckResponse | undefined;
      await customSocket.trigger(
        "game:move",
        { roomCode: "SES4", move: { from: "e2", to: "e4" } },
        (res) => {
          ack = res as SocketAckResponse;
        },
      );

      expect(ack?.success).toBe(true);
      expect(touchSessionSpy).not.toHaveBeenCalled();
    });

    it("emits game:check when move puts opponent king in check", async () => {
      // Mock gameService.makeMove to return checkInfo
      const mockGameService = {
        makeMove: vi.fn().mockResolvedValue({
          room: { roomCode: "CHK1", status: "playing" },
          moveResult: { from: "d1", to: "h5", san: "Qh5+" },
          gameState: { turn: "b", fen: "fen-check" },
          checkInfo: { inCheck: "b", kingSquare: "e8" },
        }),
      } as unknown as GameService;

      const checkSocket = new TestSocket("sock_check");
      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        checkSocket as unknown as Socket,
        mockGameService,
        logger,
        rateLimiter,
      );

      let ack: SocketAckResponse | undefined;
      await checkSocket.trigger(
        "game:move",
        { roomCode: "CHK1", move: { from: "d1", to: "h5" } },
        (res) => {
          ack = res as SocketAckResponse;
        },
      );

      expect(ack?.success).toBe(true);
      const checkEmit = io.toEmits.find((e) => e.event === "game:check");
      expect(checkEmit).toBeDefined();
      expect((checkEmit?.payload as { inCheck?: string })?.inCheck).toBe("b");
    });

    it("propagates context.correlationId to all gameService operations from socket handlers", async () => {
      const mockGameService = {
        makeMove: vi.fn().mockResolvedValue({
          room: { roomCode: "COR2", status: "playing" },
          moveResult: { from: "e2", to: "e4", san: "e4" },
          gameState: { turn: "b" },
        }),
        resign: vi.fn().mockResolvedValue({
          room: { roomCode: "COR2", status: "game_over" },
          gameOverPayload: { winner: "b", reason: "resignation" },
        }),
        offerDraw: vi.fn().mockResolvedValue({
          room: { roomCode: "COR2", status: "playing" },
          fromPlayer: { id: "p1", name: "Alice" },
          opponentPlayer: { socketId: "sock_opp" },
        }),
        respondDraw: vi.fn().mockResolvedValue({
          room: { roomCode: "COR2", status: "playing" },
          accept: false,
          byPlayerId: "p2",
        }),
        requestRematch: vi.fn().mockResolvedValue({
          room: { roomCode: "COR2", status: "rematch_pending" },
          requestedBy: "p1",
          requesterName: "Alice",
        }),
        respondRematch: vi.fn().mockResolvedValue({
          room: { roomCode: "COR2", status: "game_over" },
          accept: false,
          byPlayerId: "p2",
        }),
      } as unknown as GameService;

      const sock = new TestSocket("sock_corr_ops");
      registerGameSocketHandlers(
        io as unknown as TypedSocketServer,
        sock as unknown as Socket,
        mockGameService,
        logger,
        rateLimiter,
      );

      // 1. game:move
      await sock.trigger(
        "game:move",
        { roomCode: "COR2", move: { from: "e2", to: "e4" } },
        () => {},
      );
      expect(mockGameService.makeMove).toHaveBeenCalledWith(
        expect.anything(),
        sock.id,
        expect.any(String),
      );

      // 2. game:resign
      await sock.trigger("game:resign", { roomCode: "COR2" }, () => {});
      expect(mockGameService.resign).toHaveBeenCalledWith(
        "COR2",
        sock.id,
        expect.any(String),
      );

      // 3. game:offer_draw
      await sock.trigger("game:offer_draw", { roomCode: "COR2" }, () => {});
      expect(mockGameService.offerDraw).toHaveBeenCalledWith(
        "COR2",
        sock.id,
        expect.any(String),
      );

      // 4. game:respond_draw
      await sock.trigger(
        "game:respond_draw",
        { roomCode: "COR2", accept: false },
        () => {},
      );
      expect(mockGameService.respondDraw).toHaveBeenCalledWith(
        "COR2",
        sock.id,
        false,
        expect.any(String),
      );

      // 5. game:request_rematch
      await sock.trigger(
        "game:request_rematch",
        { roomCode: "COR2" },
        () => {},
      );
      expect(mockGameService.requestRematch).toHaveBeenCalledWith(
        "COR2",
        sock.id,
        expect.any(String),
      );

      // 6. game:respond_rematch
      await sock.trigger(
        "game:respond_rematch",
        { roomCode: "COR2", accept: false },
        () => {},
      );
      expect(mockGameService.respondRematch).toHaveBeenCalledWith(
        "COR2",
        sock.id,
        false,
        expect.any(String),
      );
    });
  });
});
