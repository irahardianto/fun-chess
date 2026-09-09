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
} from "../helpers/test_server.js";
import {
  createConnectedSocketClient,
  disconnectSockets,
  emitAck,
  TypedSocketClient,
  waitForEvent,
} from "../helpers/socket_client_helper.js";
import {
  CreateRoomRequest,
  GameState,
  JoinRoomRequest,
  MakeMoveRequest,
  MoveResult,
  Player,
  RoomState,
  SocketErrorPayload,
  LeaveRoomRequest,
  ReconnectRequest,
  RoomStatus,
  OfferDrawRequest,
  RespondDrawRequest,
  RequestRematchRequest,
  RespondRematchRequest,
  GameOverPayload,
  ResignRequest,
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
    resetTestRateLimiters();
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

      // Act: Wait for callback response; verify dual-delivery elimination (ack-only delivery)
      let roomCreatedEmitted = false;
      hostClient.on("room:created", () => {
        roomCreatedEmitted = true;
      });

      const response = await emitAck<
        CreateRoomRequest,
        | {
            success: true;
            room: RoomState;
            player: Player;
            sessionToken: string;
          }
        | { success: false; error: SocketErrorPayload }
      >(hostClient, "room:create", createPayload);

      // Assert callback response
      expect(response.success).toBe(true);
      if (!response.success) return;

      const room = response.room;
      expect(room.roomCode).toMatch(/^[A-Z0-9]{4}$/);
      expect(room.status).toBe("lobby");
      expect(room.hostId).toBeDefined();
      expect(typeof response.sessionToken).toBe("string");
      expect(response.sessionToken.length).toBeGreaterThan(0);

      // Assert player object in full 4-field ack payload (MIN-024)
      expect(response.player).toBeDefined();
      expect(response.player.id).toBe(room.hostId);
      expect(response.player.name).toBe("Alice");
      expect(response.player.color).toBe("w");
      expect(response.player.isHost).toBe(true);
      expect(response.player.isConnected).toBe(true);

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

      // Assert ack-only delivery: server MUST NOT emit deprecated room:created event to creator (MAJ-008)
      expect(roomCreatedEmitted).toBe(false);
    });

    it("should reject room creation with ERR_INVALID_PAYLOAD when playerName is missing", async () => {
      // Arrange
      const invalidPayload = {} as CreateRoomRequest;

      // Act
      const response = await emitAck<
        CreateRoomRequest,
        | {
            success: true;
            room: RoomState;
            player: Player;
            sessionToken: string;
          }
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
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(hostClient, "room:create", {
        playerName: "Alice",
        preferredColor: "w",
        avatar: "🦁",
      });
      expect(createRes.success).toBe(true);
      const roomCode = createRes.room.roomCode;

      // Act: Joiner joins room, listen for game:started on both host and joiner
      let joinerRoomJoinedEmitted = false;
      joinerClient.on("room:joined", () => {
        joinerRoomJoinedEmitted = true;
      });

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
      >(joinerClient, "room:join", {
        roomCode,
        playerName: "Bob",
        avatar: "🦁",
      });

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

      // Assert ack-only delivery: server MUST NOT emit deprecated room:joined event to joiner (MAJ-008)
      expect(joinerRoomJoinedEmitted).toBe(false);

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
      >(joinerClient, "room:join", {
        roomCode: "ZZZZ",
        playerName: "Bob",
        avatar: "🦁",
      });

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
        { success: true; room: RoomState; player: Player; sessionToken: string }
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

  describe("room:leave Contract (MAJ-026)", () => {
    it("should acknowledge room:leave with { success: true } and notify peers with game:over on active game forfeit", async () => {
      // Arrange: Host creates room, Joiner joins (transitions to 'playing')
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(hostClient, "room:create", {
        playerName: "Alice",
        preferredColor: "w",
        avatar: "🦁",
      });
      expect(createRes.success).toBe(true);
      const roomCode = createRes.room.roomCode;

      const joinRes = await emitAck<
        JoinRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(joinerClient, "room:join", {
        roomCode,
        playerName: "Bob",
        avatar: "🦁",
      });
      expect(joinRes.success).toBe(true);

      // Act: Joiner voluntarily leaves active game with acknowledgement callback
      const hostGameOverPromise = waitForEvent<GameOverPayload>(
        hostClient,
        "game:over",
      );

      const leaveRes = await emitAck<
        LeaveRoomRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(joinerClient, "room:leave", { roomCode });

      // Assert: Acknowledgement callback returns { success: true }
      expect(leaveRes.success).toBe(true);

      // Assert: Peer received game:over notification due to forfeit/abandonment
      const gameOver = await hostGameOverPromise;
      expect(gameOver.reason).toBe("abandonment");
      expect(gameOver.winner).toBe("w"); // Alice wins by abandonment
    });
  });

  describe("room:player_disconnected Contract (MAJ-008)", () => {
    it("should broadcast room:player_disconnected with { playerId, gracePeriodMs, roomStatus } to remaining peers on disconnect", async () => {
      // Arrange: Host creates room, Joiner joins -> transitions to 'playing'
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(hostClient, "room:create", {
        playerName: "Alice",
        preferredColor: "w",
        avatar: "🦁",
      });
      expect(createRes.success).toBe(true);
      const roomCode = createRes.room.roomCode;

      const joinRes = await emitAck<
        JoinRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(joinerClient, "room:join", {
        roomCode,
        playerName: "Bob",
        avatar: "🦁",
      });
      expect(joinRes.success).toBe(true);
      const bobPlayerId = joinRes.player.id;

      // Host listens for room:player_disconnected
      const disconnectPromise = waitForEvent<{
        playerId: string;
        gracePeriodMs?: number;
        roomStatus: RoomStatus;
      }>(hostClient, "room:player_disconnected");

      // Act: Disconnect joiner client abruptly
      joinerClient.disconnect();

      // Assert: Host receives room:player_disconnected matching MAJ-008 contract
      const disconnectPayload = await disconnectPromise;
      expect(disconnectPayload.playerId).toBe(bobPlayerId);
      expect(typeof disconnectPayload.gracePeriodMs).toBe("number");
      expect(disconnectPayload.gracePeriodMs).toBeGreaterThan(0);
      expect(disconnectPayload.roomStatus).toBe("paused_disconnect");
    });
  });

  describe("room:reconnect Contract (MAJ-027)", () => {
    it("should acknowledge room:reconnect with { success: true, room, player, roomStatus } and broadcast roomStatus to peer", async () => {
      // Arrange: Host creates room, Joiner joins
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(hostClient, "room:create", {
        playerName: "Alice",
        preferredColor: "w",
        avatar: "🦁",
      });
      expect(createRes.success).toBe(true);
      const roomCode = createRes.room.roomCode;

      const joinRes = await emitAck<
        JoinRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(joinerClient, "room:join", {
        roomCode,
        playerName: "Bob",
        avatar: "🦁",
      });
      expect(joinRes.success).toBe(true);

      const bobPlayerId = joinRes.player.id;
      const bobSessionToken = joinRes.sessionToken;

      // Disconnect joiner socket to simulate network blip
      joinerClient.disconnect();

      // Create a fresh socket client for reconnection
      const reconnectingClient = await createConnectedSocketClient(
        serverInstance.url,
      );

      try {
        const peerReconnectedPromise = waitForEvent<{
          playerId: string;
          playerName: string;
          roomStatus?: RoomStatus;
        }>(hostClient, "room:player_reconnected");

        // Act: Reconnect using stored credentials
        const reconnectRes = await emitAck<
          ReconnectRequest,
          | {
              success: true;
              room: RoomState;
              player: Player;
              roomStatus: RoomStatus;
            }
          | { success: false; error: SocketErrorPayload }
        >(reconnectingClient, "room:reconnect", {
          roomCode,
          playerId: bobPlayerId,
          sessionToken: bobSessionToken,
        });

        // Assert acknowledgement contains roomStatus
        expect(reconnectRes.success).toBe(true);
        if (!reconnectRes.success) return;

        expect(reconnectRes.room.roomCode).toBe(roomCode);
        expect(reconnectRes.player.id).toBe(bobPlayerId);
        expect(reconnectRes.roomStatus).toBe("playing");

        // Assert peer broadcast received by host includes roomStatus
        const peerBroadcast = await peerReconnectedPromise;
        expect(peerBroadcast.playerId).toBe(bobPlayerId);
        expect(peerBroadcast.playerName).toBe("Bob");
        expect(peerBroadcast.roomStatus).toBe("playing");
      } finally {
        reconnectingClient.disconnect();
      }
    });
  });

  describe("game:offer_draw & game:respond_draw Contracts (Draw Negotiation - ENH-017)", () => {
    let activeRoomCode: string;
    let alicePlayerId: string;
    let bobPlayerId: string;

    beforeEach(async () => {
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(hostClient, "room:create", {
        playerName: "Alice",
        preferredColor: "w",
        avatar: "🦁",
      });
      activeRoomCode = createRes.room.roomCode;
      alicePlayerId = createRes.player.id;

      const joinRes = await emitAck<
        JoinRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(joinerClient, "room:join", {
        roomCode: activeRoomCode,
        playerName: "Bob",
        avatar: "🦁",
      });
      bobPlayerId = joinRes.player.id;
    });

    it("should allow Player 1 to offer draw and Player 2 to decline, emitting game:draw_declined and acknowledging", async () => {
      // 1. Player 1 offers draw
      const drawOfferedPromise = waitForEvent<{
        fromPlayerId: string;
        fromPlayerName: string;
      }>(joinerClient, "game:draw_offered");

      const offerRes = await emitAck<
        OfferDrawRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(hostClient, "game:offer_draw", {
        roomCode: activeRoomCode,
      });
      expect(offerRes.success).toBe(true);

      const offeredData = await drawOfferedPromise;
      expect(offeredData.fromPlayerId).toBe(alicePlayerId);
      expect(offeredData.fromPlayerName).toBe("Alice");

      // 2. Player 2 declines draw
      const hostDeclinedPromise = waitForEvent<{ byPlayerId: string }>(
        hostClient,
        "game:draw_declined",
      );
      const joinerDeclinedPromise = waitForEvent<{ byPlayerId: string }>(
        joinerClient,
        "game:draw_declined",
      );

      const respondRes = await emitAck<
        RespondDrawRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(joinerClient, "game:respond_draw", {
        roomCode: activeRoomCode,
        accept: false,
      });

      expect(respondRes.success).toBe(true);

      const hostDeclined = await hostDeclinedPromise;
      const joinerDeclined = await joinerDeclinedPromise;
      expect(hostDeclined.byPlayerId).toBe(bobPlayerId);
      expect(joinerDeclined.byPlayerId).toBe(bobPlayerId);
    });

    it("should allow Player 1 to offer draw and Player 2 to accept, emitting game:over with reason draw_agreement", async () => {
      // 1. Player 1 offers draw
      const drawOfferedPromise = waitForEvent<{
        fromPlayerId: string;
        fromPlayerName: string;
      }>(joinerClient, "game:draw_offered");

      const offerRes = await emitAck<
        OfferDrawRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(hostClient, "game:offer_draw", {
        roomCode: activeRoomCode,
      });
      expect(offerRes.success).toBe(true);
      await drawOfferedPromise;

      // 2. Player 2 accepts draw
      const hostGameOverPromise = waitForEvent<GameOverPayload>(
        hostClient,
        "game:over",
      );
      const joinerGameOverPromise = waitForEvent<GameOverPayload>(
        joinerClient,
        "game:over",
      );

      const respondRes = await emitAck<
        RespondDrawRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(joinerClient, "game:respond_draw", {
        roomCode: activeRoomCode,
        accept: true,
      });

      expect(respondRes.success).toBe(true);

      const hostGameOver = await hostGameOverPromise;
      const joinerGameOver = await joinerGameOverPromise;

      expect(hostGameOver.winner).toBe("draw");
      expect(hostGameOver.reason).toBe("draw_agreement");
      expect(joinerGameOver.winner).toBe("draw");
      expect(joinerGameOver.reason).toBe("draw_agreement");
    });
  });

  describe("game:request_rematch & game:respond_rematch Contracts (Rematch Negotiation - ENH-017)", () => {
    let activeRoomCode: string;
    let alicePlayerId: string;
    let bobPlayerId: string;

    beforeEach(async () => {
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(hostClient, "room:create", {
        playerName: "Alice",
        preferredColor: "w",
        avatar: "🦁",
      });
      activeRoomCode = createRes.room.roomCode;
      alicePlayerId = createRes.player.id;

      const joinRes = await emitAck<
        JoinRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(joinerClient, "room:join", {
        roomCode: activeRoomCode,
        playerName: "Bob",
        avatar: "🦁",
      });
      bobPlayerId = joinRes.player.id;

      // Finish game by resignation so the room is in game_over state
      const p2GameOverPromise = waitForEvent<GameOverPayload>(
        joinerClient,
        "game:over",
      );
      const resignRes = await emitAck<
        ResignRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(hostClient, "game:resign", {
        roomCode: activeRoomCode,
      });
      expect(resignRes.success).toBe(true);
      await p2GameOverPromise;
    });

    it("should allow Player 1 to request rematch and Player 2 to decline, emitting game:rematch_declined and acknowledging", async () => {
      // 1. Player 1 requests rematch
      const rematchRequestedPromise = waitForEvent<{
        requestedBy: string;
        requesterName: string;
      }>(joinerClient, "game:rematch_requested");

      const reqRes = await emitAck<
        RequestRematchRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(hostClient, "game:request_rematch", {
        roomCode: activeRoomCode,
      });
      expect(reqRes.success).toBe(true);

      const rematchReq = await rematchRequestedPromise;
      expect(rematchReq.requestedBy).toBe(alicePlayerId);
      expect(rematchReq.requesterName).toBe("Alice");

      // 2. Player 2 declines rematch
      const hostRematchDeclinedPromise = waitForEvent<{ byPlayerId: string }>(
        hostClient,
        "game:rematch_declined",
      );
      const joinerRematchDeclinedPromise = waitForEvent<{ byPlayerId: string }>(
        joinerClient,
        "game:rematch_declined",
      );

      const respondRes = await emitAck<
        RespondRematchRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(joinerClient, "game:respond_rematch", {
        roomCode: activeRoomCode,
        accept: false,
      });
      expect(respondRes.success).toBe(true);

      const hostDeclined = await hostRematchDeclinedPromise;
      const joinerDeclined = await joinerRematchDeclinedPromise;
      expect(hostDeclined.byPlayerId).toBe(bobPlayerId);
      expect(joinerDeclined.byPlayerId).toBe(bobPlayerId);
    });

    it("should allow Player 1 to request rematch and Player 2 to accept, emitting game:rematch_started with swapped player colors", async () => {
      // 1. Player 1 requests rematch
      const rematchRequestedPromise = waitForEvent<{
        requestedBy: string;
        requesterName: string;
      }>(joinerClient, "game:rematch_requested");

      const reqRes = await emitAck<
        RequestRematchRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(hostClient, "game:request_rematch", {
        roomCode: activeRoomCode,
      });
      expect(reqRes.success).toBe(true);
      await rematchRequestedPromise;

      // 2. Player 2 accepts rematch
      const hostRematchStartedPromise = waitForEvent<{
        gameState: GameState;
        room: RoomState;
      }>(hostClient, "game:rematch_started");
      const joinerRematchStartedPromise = waitForEvent<{
        gameState: GameState;
        room: RoomState;
      }>(joinerClient, "game:rematch_started");

      const respondRes = await emitAck<
        RespondRematchRequest,
        { success: true } | { success: false; error: SocketErrorPayload }
      >(joinerClient, "game:respond_rematch", {
        roomCode: activeRoomCode,
        accept: true,
      });
      expect(respondRes.success).toBe(true);

      const hostRematch = await hostRematchStartedPromise;
      const joinerRematch = await joinerRematchStartedPromise;

      // Verify new game state reset
      expect(hostRematch.gameState.turn).toBe("w");
      expect(hostRematch.gameState.moveCount).toBe(0);
      expect(joinerRematch.gameState.fen).toBe(hostRematch.gameState.fen);

      // Verify player colors swapped: Bob is now White ('w'), Alice is now Black ('b')
      expect(hostRematch.room.status).toBe("playing");
      expect(hostRematch.room.whitePlayer?.id).toBe(bobPlayerId);
      expect(hostRematch.room.whitePlayer?.name).toBe("Bob");
      expect(hostRematch.room.blackPlayer?.id).toBe(alicePlayerId);
      expect(hostRematch.room.blackPlayer?.name).toBe("Alice");

      expect(joinerRematch.room.status).toBe("playing");
      expect(joinerRematch.room.whitePlayer?.id).toBe(bobPlayerId);
      expect(joinerRematch.room.blackPlayer?.id).toBe(alicePlayerId);
    });
  });
});
