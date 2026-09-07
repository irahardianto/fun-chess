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
  GameState,
  JoinRoomRequest,
  MakeMoveRequest,
  MoveResult,
  Player,
  RoomState,
  SocketErrorPayload,
} from "@fun-chess/shared";

describe("Socket.io Lifecycle Contracts", () => {
  let serverInstance: TestServerInstance;
  let hostClient: TypedSocketClient;
  let joinerClient: TypedSocketClient;

  beforeAll(async () => {
    serverInstance = await createTestServer();
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  beforeEach(async () => {
    hostClient = await createConnectedSocketClient(serverInstance.url);
    joinerClient = await createConnectedSocketClient(serverInstance.url);
  });

  afterEach(() => {
    disconnectSockets(hostClient, joinerClient);
  });

  describe("room:create Contract", () => {
    it("should generate a valid 4-letter uppercase code and set status to lobby when host creates a room", async () => {
      // Arrange
      const createPayload: CreateRoomRequest = {
        playerName: "Alice",
        preferredColor: "w",
        avatar: "🦁",
      };

      // Act: Wait for both callback response and server event
      const eventPromise = waitForEvent<RoomState>(hostClient, "room:created");
      const response = await emitAck<
        CreateRoomRequest,
        | { success: true; room: RoomState; sessionToken: string }
        | { success: false; error: SocketErrorPayload }
      >(hostClient, "room:create", createPayload);
      const emittedRoom = await eventPromise;

      // Assert callback response
      expect(response.success).toBe(true);
      if (!response.success) return;

      const room = response.room;
      expect(room.roomCode).toMatch(/^[A-Z0-9]{4}$/);
      expect(room.status).toBe("lobby");
      expect(room.hostId).toBeDefined();
      expect(typeof response.sessionToken).toBe("string");
      expect(response.sessionToken.length).toBeGreaterThan(0);

      // Assert white player configuration (since preferredColor was 'w')
      expect(room.whitePlayer).toBeDefined();
      expect(room.whitePlayer?.name).toBe("Alice");
      expect(room.whitePlayer?.color).toBe("w");
      expect(room.whitePlayer?.isHost).toBe(true);
      expect(room.whitePlayer?.isConnected).toBe(true);
      expect(room.blackPlayer).toBeNull();
      expect(room.spectators).toEqual([]);

      // Assert initial game state
      expect(room.game.turn).toBe("w");
      expect(room.game.isCheck).toBe(false);
      expect(room.game.isCheckmate).toBe(false);
      expect(room.game.moveCount).toBe(0);

      // Assert emitted event matches callback payload
      expect(emittedRoom.roomCode).toBe(room.roomCode);
      expect(emittedRoom.status).toBe("lobby");
    });

    it("should reject room creation with ERR_INVALID_PAYLOAD when playerName is missing", async () => {
      // Arrange
      const invalidPayload = {} as CreateRoomRequest;

      // Act
      const response = await emitAck<
        CreateRoomRequest,
        | { success: true; room: RoomState; sessionToken: string }
        | { success: false; error: SocketErrorPayload }
      >(hostClient, "room:create", invalidPayload);

      // Assert
      expect(response.success).toBe(false);
      if (response.success) return;
      expect(response.error.code).toBe("ERR_INVALID_PAYLOAD");
    });
  });

  describe("room:join Contract", () => {
    it("should assign opposite color, transition room status to playing, and broadcast game:started when joiner connects", async () => {
      // Arrange: Host creates room
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; sessionToken: string }
      >(hostClient, "room:create", {
        playerName: "Alice",
        preferredColor: "w",
        avatar: "🦁",
      });
      expect(createRes.success).toBe(true);
      const roomCode = createRes.room.roomCode;

      // Act: Joiner joins room, listen for game:started on both host and joiner
      const hostGameStartPromise = waitForEvent<GameState>(
        hostClient,
        "game:started",
      );
      const joinerGameStartPromise = waitForEvent<GameState>(
        joinerClient,
        "game:started",
      );
      const hostPlayerJoinedPromise = waitForEvent<{
        player: Player;
        room: RoomState;
      }>(hostClient, "room:player_joined");

      const joinRes = await emitAck<
        JoinRoomRequest,
        | {
            success: true;
            room: RoomState;
            player: Player;
            sessionToken: string;
          }
        | { success: false; error: SocketErrorPayload }
      >(joinerClient, "room:join", { roomCode, playerName: "Bob", avatar: "🦁" });

      const hostGameState = await hostGameStartPromise;
      const joinerGameState = await joinerGameStartPromise;
      const playerJoinedData = await hostPlayerJoinedPromise;

      // Assert callback response
      expect(joinRes.success).toBe(true);
      if (!joinRes.success) return;

      expect(joinRes.room.status).toBe("playing");
      expect(joinRes.player.name).toBe("Bob");
      expect(joinRes.player.color).toBe("b"); // Opposite of Alice ('w')
      expect(joinRes.player.isHost).toBe(false);
      expect(typeof joinRes.sessionToken).toBe("string");

      // Assert broadcasts
      expect(hostGameState.fen).toBeDefined();
      expect(hostGameState.turn).toBe("w");
      expect(joinerGameState.fen).toBe(hostGameState.fen);
      expect(playerJoinedData.player.name).toBe("Bob");
      expect(playerJoinedData.room.status).toBe("playing");
    });

    it("should return ERR_ROOM_NOT_FOUND when joining with a non-existent room code", async () => {
      // Arrange & Act
      const response = await emitAck<
        JoinRoomRequest,
        | {
            success: true;
            room: RoomState;
            player: Player;
            sessionToken: string;
          }
        | { success: false; error: SocketErrorPayload }
      >(joinerClient, "room:join", { roomCode: "ZZZZ", playerName: "Bob", avatar: "🦁" });

      // Assert
      expect(response.success).toBe(false);
      if (response.success) return;
      expect(response.error.code).toBe("ERR_ROOM_NOT_FOUND");
    });
  });

  describe("game:move Contract", () => {
    let activeRoomCode: string;

    beforeEach(async () => {
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; sessionToken: string }
      >(hostClient, "room:create", {
        playerName: "Alice",
        preferredColor: "w",
        avatar: "🦁",
      });
      activeRoomCode = createRes.room.roomCode;

      await emitAck<
        JoinRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(joinerClient, "room:join", {
        roomCode: activeRoomCode,
        playerName: "Bob",
        avatar: "🦁",
      });
    });

    it("should accept legal move, update FEN, and broadcast game:moved when made on correct turn", async () => {
      // Arrange: White's turn (Alice on hostClient)
      const movePayload: MakeMoveRequest = {
        roomCode: activeRoomCode,
        move: { from: "e2", to: "e4" },
      };

      // Act
      const hostMovedPromise = waitForEvent<{
        move: MoveResult;
        gameState: GameState;
      }>(hostClient, "game:moved");
      const joinerMovedPromise = waitForEvent<{
        move: MoveResult;
        gameState: GameState;
      }>(joinerClient, "game:moved");

      const response = await emitAck<
        MakeMoveRequest,
        | { success: true; moveResult: MoveResult }
        | { success: false; error: SocketErrorPayload }
      >(hostClient, "game:move", movePayload);

      const hostMoved = await hostMovedPromise;
      const joinerMoved = await joinerMovedPromise;

      // Assert acknowledgment
      expect(response.success).toBe(true);
      if (!response.success) return;
      expect(response.moveResult.from).toBe("e2");
      expect(response.moveResult.to).toBe("e4");
      expect(response.moveResult.san).toBe("e4");
      expect(response.moveResult.color).toBe("w");

      // Assert broadcast
      expect(hostMoved.gameState.turn).toBe("b"); // Now Black's turn
      expect(hostMoved.gameState.moveCount).toBe(1);
      expect(hostMoved.gameState.lastMove).toEqual({ from: "e2", to: "e4" });
      expect(joinerMoved.gameState.fen).toBe(hostMoved.gameState.fen);
    });

    it("should reject move with ERR_NOT_YOUR_TURN when black attempts to move on whites turn", async () => {
      // Arrange: White's turn initially, but Black (joinerClient) attempts to move
      const movePayload: MakeMoveRequest = {
        roomCode: activeRoomCode,
        move: { from: "e7", to: "e5" },
      };

      // Act
      const response = await emitAck<
        MakeMoveRequest,
        | { success: true; moveResult: MoveResult }
        | { success: false; error: SocketErrorPayload }
      >(joinerClient, "game:move", movePayload);

      // Assert
      expect(response.success).toBe(false);
      if (response.success) return;
      expect(response.error.code).toBe("ERR_NOT_YOUR_TURN");
    });

    it("should reject illegal chess move with ERR_INVALID_MOVE when move violates chess rules", async () => {
      // Arrange: Alice attempts to move pawn backwards or illegally (e.g. e2 to e6 jumping across squares)
      const invalidMove: MakeMoveRequest = {
        roomCode: activeRoomCode,
        move: { from: "e2", to: "e6" },
      };

      // Act
      const response = await emitAck<
        MakeMoveRequest,
        | { success: true; moveResult: MoveResult }
        | { success: false; error: SocketErrorPayload }
      >(hostClient, "game:move", invalidMove);

      // Assert
      expect(response.success).toBe(false);
      if (response.success) return;
      expect(response.error.code).toBe("ERR_INVALID_MOVE");
    });
  });
});
