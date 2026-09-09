import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import {
  createTestServer,
  TestServerInstance,
  resetTestRateLimiters,
} from "./helpers/test_server.js";
import {
  createConnectedSocketClient,
  disconnectSockets,
  emitAck,
  TypedSocketClient,
  waitForEvent,
} from "./helpers/socket_client_helper.js";
import {
  CreateRoomRequest,
  GameOverPayload,
  JoinRoomRequest,
  LeaveRoomRequest,
  MakeMoveRequest,
  MoveResult,
  OfferDrawRequest,
  Player,
  ResignRequest,
  RespondDrawRequest,
  RoomState,
  SocketErrorPayload,
} from "@fun-chess/shared";
import { FOOLS_MATE_SEQUENCE } from "./helpers/fixtures.js";

describe("Game Completion Integration Tests", () => {
  let serverInstance: TestServerInstance;
  let whiteClient: TypedSocketClient;
  let blackClient: TypedSocketClient;
  let activeRoomCode: string;

  beforeAll(async () => {
    serverInstance = await createTestServer();
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  beforeEach(async () => {
    resetTestRateLimiters();
    whiteClient = await createConnectedSocketClient(serverInstance.url);
    blackClient = await createConnectedSocketClient(serverInstance.url);

    const createRes = await emitAck<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(whiteClient, "room:create", {
      playerName: "WhitePlayer",
      preferredColor: "w",
      avatar: "🦁",
    });
    activeRoomCode = createRes.room.roomCode;

    await emitAck<
      JoinRoomRequest,
      { success: true; room: RoomState; player: Player; sessionToken: string }
    >(blackClient, "room:join", {
      roomCode: activeRoomCode,
      playerName: "BlackPlayer",
      avatar: "🦁",
    });
  });

  afterEach(() => {
    disconnectSockets(whiteClient, blackClient);
  });

  it("should broadcast game:over with reason checkmate and declare Black winner after Fools Mate", async () => {
    // 1. White: f3
    const move1Promise = waitForEvent(whiteClient, "game:moved");
    await emitAck(whiteClient, "game:move", {
      roomCode: activeRoomCode,
      move: FOOLS_MATE_SEQUENCE[0].white,
    });
    await move1Promise;

    // 2. Black: e5
    const move2Promise = waitForEvent(whiteClient, "game:moved");
    await emitAck(blackClient, "game:move", {
      roomCode: activeRoomCode,
      move: FOOLS_MATE_SEQUENCE[0].black,
    });
    await move2Promise;

    // 3. White: g4
    const move3Promise = waitForEvent(whiteClient, "game:moved");
    await emitAck(whiteClient, "game:move", {
      roomCode: activeRoomCode,
      move: FOOLS_MATE_SEQUENCE[1].white,
    });
    await move3Promise;

    // Act: 4. Black: Qh4# (Checkmate)
    const whiteGameOverPromise = waitForEvent<GameOverPayload>(
      whiteClient,
      "game:over",
    );
    const blackGameOverPromise = waitForEvent<GameOverPayload>(
      blackClient,
      "game:over",
    );

    const moveAck = await emitAck<
      MakeMoveRequest,
      { success: true; moveResult: MoveResult }
    >(blackClient, "game:move", {
      roomCode: activeRoomCode,
      move: FOOLS_MATE_SEQUENCE[1].black,
    });

    const whiteGameOver = await whiteGameOverPromise;
    const blackGameOver = await blackGameOverPromise;

    // Assert
    expect(moveAck.success).toBe(true);
    expect(whiteGameOver.winner).toBe("b");
    expect(whiteGameOver.reason).toBe("checkmate");
    expect(whiteGameOver.winnerName).toBe("BlackPlayer");
    expect(blackGameOver.winner).toBe("b");
    expect(blackGameOver.reason).toBe("checkmate");
    expect(whiteGameOver.totalMoves).toBe(4);

    // Verify room state is updated to game_over in store
    const roomInStore =
      await serverInstance.roomStore.findByCode(activeRoomCode);
    expect(roomInStore?.status).toBe("game_over");
  });

  it("should broadcast game:over with reason resignation when a player resigns", async () => {
    // Act: White resigns
    const gameOverPromise = waitForEvent<GameOverPayload>(
      blackClient,
      "game:over",
    );

    whiteClient.emit("game:resign", {
      roomCode: activeRoomCode,
    } as ResignRequest);
    const gameOver = await gameOverPromise;

    // Assert
    expect(gameOver.reason).toBe("resignation");
    expect(gameOver.winner).toBe("b");
    expect(gameOver.winnerName).toBe("BlackPlayer");
  });

  it("should broadcast game:over with reason draw_agreement when mutual draw is accepted", async () => {
    // Arrange: White offers draw
    const drawOfferPromise = waitForEvent<{
      fromPlayerId: string;
      fromPlayerName: string;
    }>(blackClient, "game:draw_offered");

    whiteClient.emit("game:offer_draw", {
      roomCode: activeRoomCode,
    } as OfferDrawRequest);
    const drawOffer = await drawOfferPromise;
    expect(drawOffer.fromPlayerName).toBe("WhitePlayer");

    // Act: Black accepts draw
    const gameOverPromise = waitForEvent<GameOverPayload>(
      whiteClient,
      "game:over",
    );

    blackClient.emit("game:respond_draw", {
      roomCode: activeRoomCode,
      accept: true,
    } as RespondDrawRequest);

    const gameOver = await gameOverPromise;

    // Assert
    expect(gameOver.winner).toBe("draw");
    expect(gameOver.reason).toBe("draw_agreement");
  });

  it("should emit game:draw_declined when draw offer is rejected", async () => {
    // Arrange: White offers draw
    whiteClient.emit("game:offer_draw", {
      roomCode: activeRoomCode,
    } as OfferDrawRequest);

    // Act: Black declines draw
    const drawDeclinedPromise = waitForEvent<{ byPlayerId: string }>(
      whiteClient,
      "game:draw_declined",
    );

    blackClient.emit("game:respond_draw", {
      roomCode: activeRoomCode,
      accept: false,
    } as RespondDrawRequest);

    const declined = await drawDeclinedPromise;

    // Assert
    expect(declined.byPlayerId).toBeDefined();
  });

  it("should prevent unilateral draw forgery and return error when responding to draw without an active offer", async () => {
    // Act: Black tries to accept a draw when no draw offer was made
    const errorPromise = waitForEvent<SocketErrorPayload>(
      blackClient,
      "error",
    );

    blackClient.emit("game:respond_draw", {
      roomCode: activeRoomCode,
      accept: true,
    } as RespondDrawRequest);

    const err = await errorPromise;
    expect(err.code).toBe("ERR_GAME_NOT_ACTIVE");

    // Assert room is still playing
    const room = await serverInstance.roomStore.findByCode(activeRoomCode);
    expect(room?.status).toBe("playing");
  });

  it("should prevent a player from accepting their own draw offer", async () => {
    // Arrange: White offers draw and wait for it to be processed
    const drawOfferedPromise = waitForEvent(blackClient, "game:draw_offered");
    whiteClient.emit("game:offer_draw", {
      roomCode: activeRoomCode,
    } as OfferDrawRequest);
    await drawOfferedPromise;

    // Act: White tries to accept their own draw offer
    const errorPromise = waitForEvent<SocketErrorPayload>(
      whiteClient,
      "error",
    );

    whiteClient.emit("game:respond_draw", {
      roomCode: activeRoomCode,
      accept: true,
    } as RespondDrawRequest);

    const err = await errorPromise;
    expect(err.code).toBe("ERR_INVALID_PAYLOAD");

    // Assert room is still playing
    const room = await serverInstance.roomStore.findByCode(activeRoomCode);
    expect(room?.status).toBe("playing");
  });

  it("should conclude active game with abandonment and award win to remaining player when player 2 leaves", async () => {
    // Arrange: Verify room is playing
    const roomBefore =
      await serverInstance.roomStore.findByCode(activeRoomCode);
    expect(roomBefore?.status).toBe("playing");

    // Act: Black (Player 2) leaves active game
    const gameOverPromise = waitForEvent<GameOverPayload>(
      whiteClient,
      "game:over",
    );

    blackClient.emit("room:leave", {
      roomCode: activeRoomCode,
    } as LeaveRoomRequest);

    const gameOver = await gameOverPromise;

    // Assert
    expect(gameOver.reason).toBe("abandonment");
    expect(gameOver.winner).toBe("w");
    expect(gameOver.winnerName).toBe("WhitePlayer");

    const roomAfter =
      await serverInstance.roomStore.findByCode(activeRoomCode);
    expect(roomAfter?.status).toBe("game_over");
  });
});
