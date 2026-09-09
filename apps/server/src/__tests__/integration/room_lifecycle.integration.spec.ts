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
    resetTestRateLimiters();
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

  it("should broadcast room:player_left with reason 'host_left' and teardown room when host leaves in lobby status (SC-4, MAJ-026)", async () => {
    // Arrange: Host creates room in lobby status
    const createRes = await emitAck<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(hostClient, "room:create", {
      playerName: "HostPlayer",
      preferredColor: "w",
      avatar: "🦁",
    });
    const roomCode = createRes.room.roomCode;
    const hostPlayerId = createRes.room.whitePlayer!.id;
    expect(createRes.room.status).toBe("lobby");

    // Add joiner socket to the room channel to observe host leave
    const serverJoinerSocket = serverInstance.io.sockets.sockets.get(
      joinerClient.id!,
    );
    expect(serverJoinerSocket).toBeDefined();
    await serverJoinerSocket?.join(roomCode);

    const playerLeftPromise = waitForEvent<{
      playerId: string;
      playerName: string;
      reason: string;
    }>(joinerClient, "room:player_left");

    // Act: Host voluntarily leaves lobby
    const leaveAck = await emitAck<LeaveRoomRequest, { success: true }>(
      hostClient,
      "room:leave",
      { roomCode },
    );
    expect(leaveAck.success).toBe(true);

    // Assert: Joiner receives player_left with reason 'host_left'
    const leftEvent = await playerLeftPromise;
    expect(leftEvent.playerId).toBe(hostPlayerId);
    expect(leftEvent.playerName).toBe("HostPlayer");
    expect(leftEvent.reason).toBe("host_left");

    // Assert: Room is torn down and deleted from storage
    const roomAfterLeave = await serverInstance.roomStore.findByCode(roomCode);
    expect(roomAfterLeave).toBeNull();
  });

  it("enforces differential rate limiting on room:create allowing 3 req/min and rejecting 4th with ERR_RATE_LIMITED (SC-4, MAJ-006)", async () => {
    resetTestRateLimiters();

    // 1st request -> permitted
    const res1 = await emitAck<
      CreateRoomRequest,
      | { success: true; room: RoomState; sessionToken: string }
      | { success: false; error: SocketErrorPayload }
    >(hostClient, "room:create", {
      playerName: "RateLimit1",
      preferredColor: "w",
      avatar: "🦁",
    });
    expect(res1.success).toBe(true);

    // 2nd request -> permitted
    const res2 = await emitAck<
      CreateRoomRequest,
      | { success: true; room: RoomState; sessionToken: string }
      | { success: false; error: SocketErrorPayload }
    >(hostClient, "room:create", {
      playerName: "RateLimit2",
      preferredColor: "w",
      avatar: "🦁",
    });
    expect(res2.success).toBe(true);

    // 3rd request -> permitted
    const res3 = await emitAck<
      CreateRoomRequest,
      | { success: true; room: RoomState; sessionToken: string }
      | { success: false; error: SocketErrorPayload }
    >(hostClient, "room:create", {
      playerName: "RateLimit3",
      preferredColor: "w",
      avatar: "🦁",
    });
    expect(res3.success).toBe(true);

    // 4th request -> rejected by rate limiter
    const res4 = await emitAck<
      CreateRoomRequest,
      | { success: true; room: RoomState; sessionToken: string }
      | { success: false; error: SocketErrorPayload }
    >(hostClient, "room:create", {
      playerName: "RateLimit4",
      preferredColor: "w",
      avatar: "🦁",
    });
    expect(res4.success).toBe(false);
    if (res4.success) return;
    expect(res4.error.code).toBe("ERR_RATE_LIMITED");
    expect(res4.error.message).toContain("Rate limit exceeded for room creation");
  });

  it("extends session TTL (sliding window) upon player reconnection (SC-4, MIN-023)", async () => {
    // Arrange: Create room
    const createRes = await emitAck<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(hostClient, "room:create", {
      playerName: "SlidingHost",
      preferredColor: "w",
      avatar: "🦁",
    });
    const roomCode = createRes.room.roomCode;
    const playerId = createRes.room.whitePlayer!.id;
    const sessionToken = createRes.sessionToken;

    // Fetch initial session record from registry
    const initialSession = await serverInstance.sessionRegistry.validateSession(
      sessionToken,
      roomCode,
      playerId,
    );
    expect(initialSession).not.toBeNull();
    const initialExpiresAt = initialSession!.expiresAt;

    // Disconnect host
    hostClient.disconnect();

    // Reconnect with new socket after small delay
    await new Promise((r) => setTimeout(r, 50));
    const newClient = await createConnectedSocketClient(serverInstance.url);

    const reconnectRes = await emitAck<
      ReconnectRequest,
      | { success: true; room: RoomState; player: Player }
      | { success: false; error: SocketErrorPayload }
    >(newClient, "room:reconnect", { roomCode, playerId, sessionToken });
    expect(reconnectRes.success).toBe(true);

    // Verify session TTL was extended (sliding window)
    const touchedSession = await serverInstance.sessionRegistry.validateSession(
      sessionToken,
      roomCode,
      playerId,
    );
    expect(touchedSession).not.toBeNull();
    expect(touchedSession!.socketId).toBe(newClient.id);
    expect(touchedSession!.expiresAt).toBeGreaterThanOrEqual(initialExpiresAt);

    newClient.disconnect();
  });
});
