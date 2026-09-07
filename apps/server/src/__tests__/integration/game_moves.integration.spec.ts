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
  MakeMoveRequest,
  MoveResult,
  PieceColor,
  Player,
  RoomState,
  SocketErrorPayload,
} from "@fun-chess/shared";
import { CHECK_SEQUENCE } from "./helpers/fixtures.js";

describe("Game Moves & Rules Integration Tests", () => {
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

  it("should process multi-ply move exchange and maintain accurate move history and turn state", async () => {
    // Arrange: Moves 1. e4 e5 2. Nf3 Nc6
    const moves: {
      client: TypedSocketClient;
      from: string;
      to: string;
      expectedTurn: PieceColor;
    }[] = [
      { client: whiteClient, from: "e2", to: "e4", expectedTurn: "b" },
      { client: blackClient, from: "e7", to: "e5", expectedTurn: "w" },
      { client: whiteClient, from: "g1", to: "f3", expectedTurn: "b" },
      { client: blackClient, from: "b8", to: "c6", expectedTurn: "w" },
    ];

    // Act & Assert each move
    for (let i = 0; i < moves.length; i++) {
      const { client, from, to, expectedTurn } = moves[i];
      const moveEventPromise = waitForEvent<{
        move: MoveResult;
        gameState: GameState;
      }>(whiteClient, "game:moved");

      const ack = await emitAck<
        MakeMoveRequest,
        | { success: true; moveResult: MoveResult }
        | { success: false; error: SocketErrorPayload }
      >(client, "game:move", {
        roomCode: activeRoomCode,
        move: { from, to },
      });

      const eventData = await moveEventPromise;

      expect(ack.success).toBe(true);
      expect(eventData.gameState.turn).toBe(expectedTurn);
      expect(eventData.gameState.moveCount).toBe(i + 1);
      expect(eventData.gameState.moveHistory).toHaveLength(i + 1);
    }
  });

  it("should emit game:check when a move places the opponent king in check", async () => {
    // Move 1: White 1. e4
    await emitAck(whiteClient, "game:move", {
      roomCode: activeRoomCode,
      move: CHECK_SEQUENCE.move1_white,
    });

    // Move 2: Black 1... f6
    await emitAck(blackClient, "game:move", {
      roomCode: activeRoomCode,
      move: CHECK_SEQUENCE.move1_black,
    });

    // Act: White 2. Qh5+ (Gives check)
    const checkEventPromise = waitForEvent<{
      inCheck: PieceColor;
      kingSquare: string;
    }>(blackClient, "game:check");

    const moveAck = await emitAck<
      MakeMoveRequest,
      { success: true; moveResult: MoveResult }
    >(whiteClient, "game:move", {
      roomCode: activeRoomCode,
      move: CHECK_SEQUENCE.move2_white,
    });

    const checkData = await checkEventPromise;

    // Assert
    expect(moveAck.success).toBe(true);
    expect(checkData.inCheck).toBe("b");
    expect(checkData.kingSquare).toBe("e8");
  });

  it("should track captured pieces and update material balance when pieces are captured", async () => {
    // 1. e4 d5 (Center pawn challenge)
    const move1Promise = waitForEvent(whiteClient, "game:moved");
    await emitAck(whiteClient, "game:move", {
      roomCode: activeRoomCode,
      move: { from: "e2", to: "e4" },
    });
    await move1Promise;

    const move2Promise = waitForEvent(whiteClient, "game:moved");
    await emitAck(blackClient, "game:move", {
      roomCode: activeRoomCode,
      move: { from: "d7", to: "d5" },
    });
    await move2Promise;

    // Act: White captures Black pawn on d5 (2. exd5)
    const move3Promise = waitForEvent<{
      move: MoveResult;
      gameState: GameState;
    }>(whiteClient, "game:moved");

    const captureAck = await emitAck<
      MakeMoveRequest,
      { success: true; moveResult: MoveResult }
    >(whiteClient, "game:move", {
      roomCode: activeRoomCode,
      move: { from: "e4", to: "d5" },
    });

    const { move, gameState } = await move3Promise;

    // Assert
    expect(captureAck.success).toBe(true);
    expect(move.captured).toBe("p");
    expect(gameState.capturedBlack).toContain("p");
    expect(gameState.materialAdvantage.white).toBe(1); // White +1 pawn
  });
});
