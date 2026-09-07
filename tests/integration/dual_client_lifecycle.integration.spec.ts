import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { createTestServer, TestServerInstance } from "../helpers/test_server";
import {
  createConnectedSocketClient,
  disconnectSockets,
  emitAck,
  TypedSocketClient,
  waitForEvent,
} from "../helpers/socket_client_helper";
import {
  CreateRoomRequest,
  GameOverPayload,
  GameState,
  JoinRoomRequest,
  MakeMoveRequest,
  MoveResult,
  OfferDrawRequest,
  Player,
  RequestRematchRequest,
  RespondDrawRequest,
  RespondRematchRequest,
  RoomState,
  SocketErrorPayload,
} from "@fun-chess/shared";

describe("Dual-Client Full Game Lifecycle Integration Suite", () => {
  let serverInstance: TestServerInstance;
  let player1: TypedSocketClient;
  let player2: TypedSocketClient;

  beforeAll(async () => {
    serverInstance = await createTestServer();
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  beforeEach(async () => {
    player1 = await createConnectedSocketClient(serverInstance.url);
    player2 = await createConnectedSocketClient(serverInstance.url);
  });

  afterEach(() => {
    disconnectSockets(player1, player2);
  });

  it("should execute a full 2-player match with turn enforcement, check, and checkmate (Scholar's Mate)", async () => {
    // 1. Host creates room preferring White
    const createRes = await emitAck<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(player1, "room:create", {
      playerName: "Leo Host",
      preferredColor: "w",
      avatar: "🦁",
    });

    expect(createRes.success).toBe(true);
    const roomCode = createRes.room.roomCode;
    expect(roomCode).toHaveLength(4);
    expect(createRes.room.status).toBe("lobby");

    // 2. Setup game:started listeners
    const p1GameStartedPromise = waitForEvent<GameState>(
      player1,
      "game:started",
    );
    const p2GameStartedPromise = waitForEvent<GameState>(
      player2,
      "game:started",
    );

    // 3. Player 2 joins room via room code
    const joinRes = await emitAck<
      JoinRoomRequest,
      { success: true; room: RoomState; player: Player; sessionToken: string }
    >(player2, "room:join", { roomCode, playerName: "Maya Joiner", avatar: "🦁" });

    expect(joinRes.success).toBe(true);
    expect(joinRes.player.color).toBe("b");

    // Both players receive game:started
    const p1GameState = await p1GameStartedPromise;
    const p2GameState = await p2GameStartedPromise;
    expect(p1GameState.turn).toBe("w");
    expect(p2GameState.turn).toBe("w");

    // 4. Test Turn Enforcement: Player 2 (Black) attempts to move on White's turn
    const illegalTurnRes = await emitAck<
      MakeMoveRequest,
      | { success: true; moveResult: MoveResult }
      | { success: false; error: SocketErrorPayload }
    >(player2, "game:move", { roomCode, move: { from: "e7", to: "e5" } });

    expect(illegalTurnRes.success).toBe(false);
    if (!illegalTurnRes.success) {
      expect(illegalTurnRes.error.code).toBe("ERR_NOT_YOUR_TURN");
    }

    // Helper to play a move and wait for broadcast on both sockets
    async function playMove(
      socket: TypedSocketClient,
      from: string,
      to: string,
      promotion?: "q" | "r" | "b" | "n",
    ) {
      const p1Moved = waitForEvent<{ move: MoveResult; gameState: GameState }>(
        player1,
        "game:moved",
      );
      const p2Moved = waitForEvent<{ move: MoveResult; gameState: GameState }>(
        player2,
        "game:moved",
      );

      const ack = await emitAck<
        MakeMoveRequest,
        | { success: true; moveResult: MoveResult }
        | { success: false; error: SocketErrorPayload }
      >(socket, "game:move", { roomCode, move: { from, to, promotion } });

      expect(ack.success).toBe(true);
      const [p1Event, p2Event] = await Promise.all([p1Moved, p2Moved]);
      return { ack, p1Event, p2Event };
    }

    // Move 1: 1. e4 e5
    await playMove(player1, "e2", "e4");
    await playMove(player2, "e7", "e5");

    // Move 2: 2. Bc4 Nc6
    await playMove(player1, "f1", "c4");
    await playMove(player2, "b8", "c6");

    // Move 3: 3. Qh5 Nf6
    await playMove(player1, "d1", "h5");
    await playMove(player2, "g8", "f6");

    // Move 4: 4. Qxf7# (Checkmate!)
    const p1GameOver = waitForEvent<GameOverPayload>(player1, "game:over");
    const p2GameOver = waitForEvent<GameOverPayload>(player2, "game:over");

    const checkmateResult = await playMove(player1, "h5", "f7");
    expect(checkmateResult.ack.success).toBe(true);

    const [gameOverP1, gameOverP2] = await Promise.all([
      p1GameOver,
      p2GameOver,
    ]);

    expect(gameOverP1.winner).toBe("w");
    expect(gameOverP1.reason).toBe("checkmate");
    expect(gameOverP1.winnerName).toBe("Leo Host");
    expect(gameOverP2.winner).toBe("w");
    expect(gameOverP2.totalMoves).toBe(7);
  });

  it("should execute draw agreement lifecycle", async () => {
    // 1. Create and join room
    const createRes = await emitAck<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(player1, "room:create", { playerName: "Player A", preferredColor: "w", avatar: "🦁" });
    const roomCode = createRes.room.roomCode;

    await emitAck<
      JoinRoomRequest,
      { success: true; room: RoomState; player: Player; sessionToken: string }
    >(player2, "room:join", { roomCode, playerName: "Player B", avatar: "🦁" });

    // 2. Player 1 offers draw
    const drawOfferedPromise = waitForEvent<{
      fromPlayerId: string;
      fromPlayerName: string;
    }>(player2, "game:draw_offered");

    player1.emit("game:offer_draw", { roomCode } as OfferDrawRequest);
    const drawOffer = await drawOfferedPromise;
    expect(drawOffer.fromPlayerName).toBe("Player A");

    // 3. Player 2 accepts draw
    const p1GameOver = waitForEvent<GameOverPayload>(player1, "game:over");
    const p2GameOver = waitForEvent<GameOverPayload>(player2, "game:over");

    player2.emit("game:respond_draw", {
      roomCode,
      accept: true,
    } as RespondDrawRequest);

    const [p1Result, p2Result] = await Promise.all([p1GameOver, p2GameOver]);
    expect(p1Result.winner).toBe("draw");
    expect(p1Result.reason).toBe("draw_agreement");
    expect(p2Result.winner).toBe("draw");
  });

  it("should handle rematch request with color swap and fresh game start", async () => {
    // 1. Create and join room
    const createRes = await emitAck<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(player1, "room:create", { playerName: "Alice", preferredColor: "w", avatar: "🦁" });
    const roomCode = createRes.room.roomCode;

    await emitAck<
      JoinRoomRequest,
      { success: true; room: RoomState; player: Player; sessionToken: string }
    >(player2, "room:join", { roomCode, playerName: "Bob", avatar: "🦁" });

    // 2. Resign to conclude game
    const gameOverPromise = waitForEvent<GameOverPayload>(player1, "game:over");
    player1.emit("game:resign", { roomCode });
    await gameOverPromise;

    // 3. Alice requests rematch
    const rematchReqPromise = waitForEvent<{
      requestedBy: string;
      requesterName: string;
    }>(player2, "game:rematch_requested");
    player1.emit("game:request_rematch", { roomCode } as RequestRematchRequest);
    const rematchReq = await rematchReqPromise;
    expect(rematchReq.requesterName).toBe("Alice");

    // 4. Bob accepts rematch
    const p1RematchStarted = waitForEvent<{
      gameState: GameState;
      room: RoomState;
    }>(player1, "game:rematch_started");
    const p2RematchStarted = waitForEvent<{
      gameState: GameState;
      room: RoomState;
    }>(player2, "game:rematch_started");

    player2.emit("game:respond_rematch", {
      roomCode,
      accept: true,
    } as RespondRematchRequest);

    const [p1Data, p2Data] = await Promise.all([
      p1RematchStarted,
      p2RematchStarted,
    ]);
    expect(p1Data.gameState.fen).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
    expect(p1Data.gameState.turn).toBe("w");
    expect(p1Data.room.whitePlayer?.name).toBe("Bob");
    expect(p1Data.room.blackPlayer?.name).toBe("Alice");
    expect(p2Data.room.whitePlayer?.name).toBe("Bob");

    // 5. Verify Bob is now White and can make the opening move!
    const moveAck = await emitAck<
      MakeMoveRequest,
      | { success: true; moveResult: MoveResult }
      | { success: false; error: SocketErrorPayload }
    >(player2, "game:move", { roomCode, move: { from: "d2", to: "d4" } });

    expect(moveAck.success).toBe(true);
  });
});
