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
  JoinRoomRequest,
  LeaveRoomRequest,
  Player,
  ReconnectRequest,
  ResignRequest,
  RoomState,
  SocketErrorPayload,
} from "@fun-chess/shared";

describe("Room Lifecycle Integration Tests", () => {
  let serverInstance: TestServerInstance;
  let hostClient: TypedSocketClient;
  let joinerClient: TypedSocketClient;
  let spectatorClient: TypedSocketClient;

  beforeAll(async () => {
    serverInstance = await createTestServer();
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  beforeEach(async () => {
    hostClient = await createConnectedSocketClient(serverInstance.url);
    joinerClient = await createConnectedSocketClient(serverInstance.url);
    spectatorClient = await createConnectedSocketClient(serverInstance.url);
  });

  afterEach(() => {
    disconnectSockets(hostClient, joinerClient, spectatorClient);
  });

  it("should assign a valid color when preferredColor is random", async () => {
    // Arrange & Act
    const response = await emitAck<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(hostClient, "room:create", {
      playerName: "Sam",
      preferredColor: "random",
      avatar: "🦁",
    });

    // Assert
    expect(response.success).toBe(true);
    const playerColor = response.room.whitePlayer ? "w" : "b";
    expect(["w", "b"]).toContain(playerColor);
    if (playerColor === "w") {
      expect(response.room.whitePlayer?.name).toBe("Sam");
      expect(response.room.blackPlayer).toBeNull();
    } else {
      expect(response.room.blackPlayer?.name).toBe("Sam");
      expect(response.room.whitePlayer).toBeNull();
    }
  });

  it("should reject a third player with ERR_ROOM_FULL when room already has two players", async () => {
    // Arrange: Create room and join second player
    const createRes = await emitAck<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(hostClient, "room:create", {
      playerName: "Player 1",
      preferredColor: "w",
      avatar: "🦁",
    });
    const roomCode = createRes.room.roomCode;

    await emitAck<
      JoinRoomRequest,
      { success: true; room: RoomState; player: Player; sessionToken: string }
    >(joinerClient, "room:join", { roomCode, playerName: "Player 2", avatar: "🦁" });

    // Act: Third player attempts to join
    const thirdJoinRes = await emitAck<
      JoinRoomRequest,
      | { success: true; room: RoomState; player: Player; sessionToken: string }
      | { success: false; error: SocketErrorPayload }
    >(spectatorClient, "room:join", { roomCode, playerName: "Player 3", avatar: "🦁" });

    // Assert
    expect(thirdJoinRes.success).toBe(false);
    if (thirdJoinRes.success) return;
    expect(thirdJoinRes.error.code).toBe("ERR_ROOM_FULL");
  });

  it("should broadcast room:player_left when a player leaves the room", async () => {
    // Arrange: Setup active room
    const createRes = await emitAck<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(hostClient, "room:create", {
      playerName: "Player 1",
      preferredColor: "w",
      avatar: "🦁",
    });
    const roomCode = createRes.room.roomCode;

    await emitAck<
      JoinRoomRequest,
      { success: true; room: RoomState; player: Player; sessionToken: string }
    >(joinerClient, "room:join", { roomCode, playerName: "Player 2", avatar: "🦁" });

    // Conclude match first (host resigns so status becomes game_over)
    const gameOverPromise = waitForEvent(joinerClient, "game:over");
    hostClient.emit("game:resign", { roomCode } as ResignRequest);
    await gameOverPromise;

    // Act: Player 2 leaves, Player 1 listens
    const playerLeftPromise = waitForEvent<{
      playerId: string;
      playerName: string;
      reason: string;
    }>(hostClient, "room:player_left");

    joinerClient.emit("room:leave", { roomCode } as LeaveRoomRequest);
    const leftData = await playerLeftPromise;

    // Assert
    expect(leftData.playerName).toBe("Player 2");
    expect(leftData.reason).toBeDefined();
  });

  it("should restore session with room:reconnect when valid sessionToken and playerId are supplied", async () => {
    // Arrange: Create room
    const createRes = await emitAck<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(hostClient, "room:create", {
      playerName: "Reconnector",
      preferredColor: "w",
      avatar: "🦁",
    });
    const roomCode = createRes.room.roomCode;
    const playerId = createRes.room.whitePlayer!.id;
    const sessionToken = createRes.sessionToken;

    // Disconnect host client and create fresh client to simulate reconnect
    hostClient.disconnect();
    const newClient = await createConnectedSocketClient(serverInstance.url);

    // Act: Reconnect with session credentials
    const reconnectRes = await emitAck<
      ReconnectRequest,
      | { success: true; room: RoomState; player: Player }
      | { success: false; error: SocketErrorPayload }
    >(newClient, "room:reconnect", { roomCode, playerId, sessionToken });

    // Assert
    expect(reconnectRes.success).toBe(true);
    if (!reconnectRes.success) return;

    expect(reconnectRes.player.id).toBe(playerId);
    expect(reconnectRes.player.socketId).toBe(newClient.id);
    expect(reconnectRes.player.isConnected).toBe(true);
    expect(reconnectRes.room.roomCode).toBe(roomCode);

    newClient.disconnect();
  });

  it("should reject reconnect with ERR_UNAUTHORIZED when sessionToken does not match", async () => {
    // Arrange: Create room
    const createRes = await emitAck<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(hostClient, "room:create", { playerName: "Host", preferredColor: "w", avatar: "🦁" });
    const roomCode = createRes.room.roomCode;
    const playerId = createRes.room.whitePlayer!.id;

    // Act: Attempt reconnect with wrong session token
    const reconnectRes = await emitAck<
      ReconnectRequest,
      | { success: true; room: RoomState; player: Player }
      | { success: false; error: SocketErrorPayload }
    >(joinerClient, "room:reconnect", {
      roomCode,
      playerId,
      sessionToken: "wrong-token",
    });

    // Assert
    expect(reconnectRes.success).toBe(false);
    if (reconnectRes.success) return;
    expect(reconnectRes.error.code).toBe("ERR_UNAUTHORIZED");
  });
});
