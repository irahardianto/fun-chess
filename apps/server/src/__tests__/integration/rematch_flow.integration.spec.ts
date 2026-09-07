import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { createTestServer, TestServerInstance } from "./helpers/test_server.js";
import {
  createConnectedSocketClient,
  disconnectSockets,
  emitAck,
  TypedSocketClient,
  waitForEvent,
} from "./helpers/socket_client_helper.js";
import {
  CreateRoomRequest,
  GameState,
  JoinRoomRequest,
  Player,
  RequestRematchRequest,
  ResignRequest,
  RespondRematchRequest,
  RoomState,
} from "@fun-chess/shared";

describe("Rematch Flow Integration Tests", () => {
  let serverInstance: TestServerInstance;
  let player1Client: TypedSocketClient;
  let player2Client: TypedSocketClient;
  let activeRoomCode: string;

  beforeAll(async () => {
    serverInstance = await createTestServer();
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  beforeEach(async () => {
    player1Client = await createConnectedSocketClient(serverInstance.url);
    player2Client = await createConnectedSocketClient(serverInstance.url);

    // Create room with player 1 as White
    const createRes = await emitAck<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(player1Client, "room:create", {
      playerName: "Player1",
      preferredColor: "w",
      avatar: "🦁",
    });
    activeRoomCode = createRes.room.roomCode;

    // Player 2 joins as Black
    await emitAck<
      JoinRoomRequest,
      { success: true; room: RoomState; player: Player; sessionToken: string }
    >(player2Client, "room:join", {
      roomCode: activeRoomCode,
      playerName: "Player2",
      avatar: "🦁",
    });

    // Conclude game to enter GAME_OVER state (Player 1 resigns)
    const gameOverPromise = waitForEvent(player2Client, "game:over");
    player1Client.emit("game:resign", {
      roomCode: activeRoomCode,
    } as ResignRequest);
    await gameOverPromise;
  });

  afterEach(() => {
    disconnectSockets(player1Client, player2Client);
  });

  it("should swap player colors, reset board, and broadcast game:rematch_started when rematch is accepted", async () => {
    // Arrange: Player 1 requests rematch
    const rematchRequestPromise = waitForEvent<{
      requestedBy: string;
      requesterName: string;
    }>(player2Client, "game:rematch_requested");

    player1Client.emit("game:request_rematch", {
      roomCode: activeRoomCode,
    } as RequestRematchRequest);
    const rematchReq = await rematchRequestPromise;
    expect(rematchReq.requesterName).toBe("Player1");

    // Act: Player 2 accepts rematch
    const p1RematchStartPromise = waitForEvent<{
      gameState: GameState;
      room: RoomState;
    }>(player1Client, "game:rematch_started");
    const p2RematchStartPromise = waitForEvent<{
      gameState: GameState;
      room: RoomState;
    }>(player2Client, "game:rematch_started");

    player2Client.emit("game:respond_rematch", {
      roomCode: activeRoomCode,
      accept: true,
    } as RespondRematchRequest);

    const p1RematchData = await p1RematchStartPromise;
    const p2RematchData = await p2RematchStartPromise;

    // Assert
    expect(p1RematchData.gameState.turn).toBe("w");
    expect(p1RematchData.gameState.moveCount).toBe(0);
    expect(p2RematchData.gameState.fen).toBe(p1RematchData.gameState.fen);

    // Verify both player 1 and player 2 receive the updated room and swapped colors
    expect(p1RematchData.room.status).toBe("playing");
    expect(p1RematchData.room.whitePlayer?.name).toBe("Player2");
    expect(p1RematchData.room.whitePlayer?.color).toBe("w");
    expect(p1RematchData.room.blackPlayer?.name).toBe("Player1");
    expect(p1RematchData.room.blackPlayer?.color).toBe("b");

    expect(p2RematchData.room.status).toBe("playing");
    expect(p2RematchData.room.whitePlayer?.name).toBe("Player2");
    expect(p2RematchData.room.whitePlayer?.color).toBe("w");
    expect(p2RematchData.room.blackPlayer?.name).toBe("Player1");
    expect(p2RematchData.room.blackPlayer?.color).toBe("b");

    // Verify room state in store: Player 2 should now be White, Player 1 should now be Black
    const updatedRoom =
      await serverInstance.roomStore.findByCode(activeRoomCode);
    expect(updatedRoom?.status).toBe("playing");
    expect(updatedRoom?.whitePlayer?.name).toBe("Player2");
    expect(updatedRoom?.blackPlayer?.name).toBe("Player1");
  });

  it("should broadcast game:rematch_declined when rematch is rejected", async () => {
    // Arrange: Player 1 requests rematch
    player1Client.emit("game:request_rematch", {
      roomCode: activeRoomCode,
    } as RequestRematchRequest);

    // Act: Player 2 declines rematch
    const rematchDeclinedPromise = waitForEvent<{ byPlayerId: string }>(
      player1Client,
      "game:rematch_declined",
    );

    player2Client.emit("game:respond_rematch", {
      roomCode: activeRoomCode,
      accept: false,
    } as RespondRematchRequest);

    const declined = await rematchDeclinedPromise;

    // Assert
    expect(declined.byPlayerId).toBeDefined();

    const room = await serverInstance.roomStore.findByCode(activeRoomCode);
    expect(room?.status).toBe("game_over");
    expect(room?.rematch?.status).toBe("declined");
  });
});
