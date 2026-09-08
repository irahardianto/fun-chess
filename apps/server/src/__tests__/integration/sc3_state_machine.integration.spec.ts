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
  GameOverPayload,
  GameState,
  JoinRoomRequest,
  LeaveRoomRequest,
  MakeMoveRequest,
  MoveResult,
  OfferDrawRequest,
  Player,
  ReconnectRequest,
  RequestRematchRequest,
  ResignRequest,
  RespondDrawRequest,
  RespondRematchRequest,
  RoomState,
  SocketErrorPayload,
} from "@fun-chess/shared";
import {
  clearAllDisconnectTimers,
  handleSocketDisconnect,
} from "../../features/rooms/index.js";
import { NullLogger } from "../../platform/logger/index.js";

describe("SC-3: Server Multiplayer Rooms, Sessions & Concurrency State Machine Integration Suite", () => {
  let serverInstance: TestServerInstance;
  let client1: TypedSocketClient;
  let client2: TypedSocketClient;
  let client3: TypedSocketClient;

  beforeAll(async () => {
    serverInstance = await createTestServer();
  });

  afterAll(async () => {
    clearAllDisconnectTimers();
    await serverInstance.close();
  });

  beforeEach(async () => {
    clearAllDisconnectTimers();
    client1 = await createConnectedSocketClient(serverInstance.url);
    client2 = await createConnectedSocketClient(serverInstance.url);
    client3 = await createConnectedSocketClient(serverInstance.url);
  });

  afterEach(() => {
    clearAllDisconnectTimers();
    disconnectSockets(client1, client2, client3);
  });

  // =========================================================================
  // 1. Spectator Disconnect Match Invariance (CRIT-001)
  // =========================================================================
  describe("1. Spectator Disconnect Match Invariance (CRIT-001)", () => {
    it("preserves active match status as 'playing', does not forfeit players, and allows match continuation when spectator disconnects", async () => {
      // 1. Host creates room as White
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; sessionToken: string }
      >(client1, "room:create", {
        playerName: "PlayerOne",
        preferredColor: "w",
        avatar: "🦁",
      });
      expect(createRes.success).toBe(true);
      const roomCode = createRes.room.roomCode;

      // 2. Player 2 joins as Black -> room transitions to 'playing'
      const p1GameStartedPromise = waitForEvent<GameState>(client1, "game:started");
      const joinRes = await emitAck<
        JoinRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(client2, "room:join", {
        roomCode,
        playerName: "PlayerTwo",
        avatar: "🚀",
      });
      expect(joinRes.success).toBe(true);
      await p1GameStartedPromise;

      const roomBefore = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomBefore?.status).toBe("playing");

      // 3. Register client3 as an active Spectator in the room
      const spectator: Player = {
        id: "spec-charlie-id",
        socketId: client3.id!,
        name: "SpectatorCharlie",
        avatar: "👑",
        color: "w",
        isHost: false,
        isConnected: true,
        connectedAt: Date.now(),
      };

      await serverInstance.roomStore.mutate(roomCode, (r) => {
        r.spectators.push(spectator);
        return { updatedRoom: r, result: undefined };
      });

      const roomWithSpectator = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomWithSpectator?.spectators).toHaveLength(1);
      expect(roomWithSpectator?.spectators[0]?.id).toBe("spec-charlie-id");

      // 4. Spectator disconnects
      client3.disconnect();

      // Wait a short tick for server transport disconnect handler to process
      await new Promise((resolve) => setTimeout(resolve, 80));

      // 5. Verify room invariants:
      // a. Room status remains 'playing'
      const roomAfterSpectatorDrop = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomAfterSpectatorDrop?.status).toBe("playing");

      // b. Neither player was forfeited
      expect(roomAfterSpectatorDrop?.whitePlayer?.isConnected).toBe(true);
      expect(roomAfterSpectatorDrop?.blackPlayer?.isConnected).toBe(true);

      // c. No disconnect grace timer was scheduled for the spectator
      const specTimer = serverInstance.timerRegistry.get(roomCode, spectator.id);
      expect(specTimer).toBeUndefined();

      // d. Match continues without interruption: White plays e4, Black plays e5
      const p1MovedPromise = waitForEvent(client1, "game:moved");
      const p2MovedPromise = waitForEvent(client2, "game:moved");

      const moveRes = await emitAck<
        MakeMoveRequest,
        { success: true; moveResult: MoveResult }
      >(client1, "game:move", {
        roomCode,
        move: { from: "e2", to: "e4" },
      });
      expect(moveRes.success).toBe(true);
      await Promise.all([p1MovedPromise, p2MovedPromise]);

      const roomAfterMove = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomAfterMove?.status).toBe("playing");
      expect(roomAfterMove?.game.turn).toBe("b");
    });
  });

  // =========================================================================
  // 2. Sequential Dual Player Disconnection & Reconnection (CRIT-002)
  // =========================================================================
  describe("2. Sequential Dual Player Disconnection & Reconnection State Machine (CRIT-002)", () => {
    it("handles sequential drops and reconnects: schedules timers for both, pauses game until both reconnect, and resumes to playing", async () => {
      // 1. Host creates room
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; sessionToken: string }
      >(client1, "room:create", {
        playerName: "Alice Host",
        preferredColor: "w",
        avatar: "🦁",
      });
      const roomCode = createRes.room.roomCode;
      const p1Id = createRes.room.whitePlayer!.id;
      const p1Token = createRes.sessionToken;

      // 2. Player 2 joins
      const joinRes = await emitAck<
        JoinRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(client2, "room:join", {
        roomCode,
        playerName: "Bob Joiner",
        avatar: "🚀",
      });
      const p2Id = joinRes.player.id;
      const p2Token = joinRes.sessionToken;

      // Initial state: playing
      const roomInitial = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomInitial?.status).toBe("playing");

      // 3. Player 1 drops -> room transitions to 'paused_disconnect' and disconnect timer starts
      const p2ReceiveDisconnectPromise = waitForEvent<{
        playerId: string;
        gracePeriodMs: number;
      }>(client2, "room:player_disconnected");

      client1.disconnect();
      const discEvent = await p2ReceiveDisconnectPromise;
      expect(discEvent.playerId).toBe(p1Id);

      const roomAfterP1Drop = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomAfterP1Drop?.status).toBe("paused_disconnect");
      expect(roomAfterP1Drop?.whitePlayer?.isConnected).toBe(false);

      // Verify timer is scheduled for Player 1
      const p1Timer = serverInstance.timerRegistry.get(roomCode, p1Id);
      expect(p1Timer).toBeDefined();

      // 4. Player 2 drops while room is already 'paused_disconnect'
      client2.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 80));

      const roomAfterBothDrop = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomAfterBothDrop?.status).toBe("paused_disconnect");
      expect(roomAfterBothDrop?.blackPlayer?.isConnected).toBe(false);

      // Verify disconnect timer is ALSO scheduled for Player 2 (CRIT-002 key invariant!)
      const p2Timer = serverInstance.timerRegistry.get(roomCode, p2Id);
      expect(p2Timer).toBeDefined();

      // 5. Player 1 reconnects while Player 2 is still offline
      const client1Reconnected = await createConnectedSocketClient(serverInstance.url);
      const reconnectP1Res = await emitAck<
        ReconnectRequest,
        { success: true; room: RoomState; player: Player }
      >(client1Reconnected, "room:reconnect", {
        roomCode,
        playerId: p1Id,
        sessionToken: p1Token,
      });

      expect(reconnectP1Res.success).toBe(true);

      // Room MUST remain 'paused_disconnect' because Player 2 is still offline
      const roomAfterP1Reconnect = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomAfterP1Reconnect?.status).toBe("paused_disconnect");
      expect(roomAfterP1Reconnect?.whitePlayer?.isConnected).toBe(true);
      expect(roomAfterP1Reconnect?.blackPlayer?.isConnected).toBe(false);

      // Player 1 timer cancelled, Player 2 timer still active
      expect(serverInstance.timerRegistry.get(roomCode, p1Id)).toBeUndefined();
      expect(serverInstance.timerRegistry.get(roomCode, p2Id)).toBeDefined();

      // 6. Player 2 reconnects
      const client2Reconnected = await createConnectedSocketClient(serverInstance.url);
      const reconnectP2Res = await emitAck<
        ReconnectRequest,
        { success: true; room: RoomState; player: Player }
      >(client2Reconnected, "room:reconnect", {
        roomCode,
        playerId: p2Id,
        sessionToken: p2Token,
      });

      expect(reconnectP2Res.success).toBe(true);

      // Room transitions back to 'playing' now that both players are connected!
      const roomFullyResumed = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomFullyResumed?.status).toBe("playing");
      expect(roomFullyResumed?.whitePlayer?.isConnected).toBe(true);
      expect(roomFullyResumed?.blackPlayer?.isConnected).toBe(true);

      // Both timers cancelled
      expect(serverInstance.timerRegistry.get(roomCode, p2Id)).toBeUndefined();

      // 7. Verify match is playable
      const moveRes = await emitAck<
        MakeMoveRequest,
        { success: true; moveResult: MoveResult }
      >(client1Reconnected, "game:move", {
        roomCode,
        move: { from: "e2", to: "e4" },
      });
      expect(moveRes.success).toBe(true);

      disconnectSockets(client1Reconnected, client2Reconnected);
    });

    it("triggers draw abandonment forfeit when both players disconnect and grace timer expires", async () => {
      // 1. Host creates and Joiner joins
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; sessionToken: string }
      >(client1, "room:create", {
        playerName: "ForfeitP1",
        preferredColor: "w",
        avatar: "🦁",
      });
      const roomCode = createRes.room.roomCode;
      const p1Id = createRes.room.whitePlayer!.id;

      const joinRes = await emitAck<
        JoinRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(client2, "room:join", {
        roomCode,
        playerName: "ForfeitP2",
        avatar: "🚀",
      });
      const p2Id = joinRes.player.id;

      // 2. Both disconnect with short grace period (40ms) using handleSocketDisconnect
      const logger = new NullLogger();
      await handleSocketDisconnect(
        serverInstance.io,
        client1.id!,
        serverInstance.roomService,
        logger,
        40,
        undefined,
        serverInstance.timerRegistry,
      );
      await handleSocketDisconnect(
        serverInstance.io,
        client2.id!,
        serverInstance.roomService,
        logger,
        40,
        undefined,
        serverInstance.timerRegistry,
      );

      // Room transitions to paused_disconnect
      const roomPaused = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomPaused?.status).toBe("paused_disconnect");

      // Verify timers are scheduled for both
      expect(serverInstance.timerRegistry.get(roomCode, p1Id)).toBeDefined();
      expect(serverInstance.timerRegistry.get(roomCode, p2Id)).toBeDefined();

      // 3. Wait for grace timer to expire (100ms)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 4. Verify room transitions to game_over with draw by abandonment
      const roomEnded = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomEnded?.status).toBe("game_over");
    });
  });

  // =========================================================================
  // 3. Lobby Guest Leave Room Retention (CRIT-008)
  // =========================================================================
  describe("3. Lobby Guest Leave Room Retention (CRIT-008)", () => {
    it("retains room in store, notifies host via room:player_left, and keeps host in room when guest leaves lobby", async () => {
      // 1. Host creates room (status starts as 'lobby')
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; sessionToken: string }
      >(client1, "room:create", {
        playerName: "HostPlayer",
        preferredColor: "w",
        avatar: "🦁",
      });
      const roomCode = createRes.room.roomCode;
      const hostId = createRes.room.hostId;
      expect(createRes.room.status).toBe("lobby");

      // 2. Guest joins lobby while room status is 'lobby'
      const guestId = "guest-player-uuid";
      const serverSocket2 = serverInstance.io.sockets.sockets.get(client2.id!);
      serverSocket2?.join(roomCode);

      const guestPlayer: Player = {
        id: guestId,
        socketId: client2.id!,
        name: "GuestPlayer",
        avatar: "🚀",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: Date.now(),
      };

      await serverInstance.roomStore.mutate(roomCode, (r) => {
        r.blackPlayer = guestPlayer;
        r.status = "lobby";
        return { updatedRoom: r, result: undefined };
      });

      // 3. Setup listener on host socket for room:player_left
      const playerLeftPromise = waitForEvent<{
        playerId: string;
        playerName: string;
        reason: string;
      }>(client1, "room:player_left");

      // 4. Guest voluntarily leaves lobby via room:leave
      const leaveRes = await emitAck<
        LeaveRoomRequest,
        { success: true }
      >(client2, "room:leave", { roomCode });
      expect(leaveRes.success).toBe(true);

      // 5. Host receives room:player_left event
      const leftEvent = await playerLeftPromise;
      expect(leftEvent.playerId).toBe(guestId);
      expect(leftEvent.playerName).toBe("GuestPlayer");

      // 6. Verify room is NOT deleted from store (CRIT-008 key invariant!)
      const roomInStore = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomInStore).not.toBeNull();
      expect(roomInStore?.roomCode).toBe(roomCode);
      expect(roomInStore?.status).toBe("lobby");

      // 7. Verify host remains in room
      expect(roomInStore?.hostId).toBe(hostId);
      expect(roomInStore?.whitePlayer?.id).toBe(hostId);
      expect(roomInStore?.whitePlayer?.name).toBe("HostPlayer");
      expect(roomInStore?.blackPlayer).toBeNull();

      // 8. Verify a new guest can now join the preserved room
      const newGuestJoinRes = await emitAck<
        JoinRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(client3, "room:join", {
        roomCode,
        playerName: "NewGuestPlayer",
        avatar: "🦄",
      });
      expect(newGuestJoinRes.success).toBe(true);
      expect(newGuestJoinRes.player.color).toBe("b");

      const roomWithNewGuest = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomWithNewGuest?.status).toBe("playing");
      expect(roomWithNewGuest?.blackPlayer?.name).toBe("NewGuestPlayer");
    });
  });

  // =========================================================================
  // 4. Draw Offer by Player ID (MAJ-022)
  // =========================================================================
  describe("4. Draw Offer by Player ID (MAJ-022)", () => {
    it("keys draw offer by domain playerId, prevents offerer self-acceptance even across socket reconnection, and allows opponent to accept", async () => {
      // 1. Host creates room and Joiner joins
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; sessionToken: string }
      >(client1, "room:create", {
        playerName: "WhiteDraw",
        preferredColor: "w",
        avatar: "🦁",
      });
      const roomCode = createRes.room.roomCode;
      const whitePlayerId = createRes.room.whitePlayer!.id;
      const whiteSessionToken = createRes.sessionToken;

      await emitAck<
        JoinRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(client2, "room:join", {
        roomCode,
        playerName: "BlackDraw",
        avatar: "🚀",
      });

      // 2. White offers draw
      const opponentDrawOfferedPromise = waitForEvent<{
        fromPlayerId: string;
        fromPlayerName: string;
      }>(client2, "game:draw_offered");

      client1.emit("game:offer_draw", { roomCode } as OfferDrawRequest);
      const drawOfferEvent = await opponentDrawOfferedPromise;

      // Assert event carries domain playerId
      expect(drawOfferEvent.fromPlayerId).toBe(whitePlayerId);
      expect(drawOfferEvent.fromPlayerName).toBe("WhiteDraw");

      // Verify draw offer in store is keyed by domain playerId (MAJ-022)
      const roomWithOffer = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomWithOffer?.drawOffer).toBeDefined();
      expect(roomWithOffer?.drawOffer?.offeredBy).toBe(whitePlayerId);

      // 3. Offering player attempts to accept their own offer on same socket -> rejected
      const selfAcceptErrorPromise = waitForEvent<SocketErrorPayload>(
        client1,
        "error",
      );
      client1.emit("game:respond_draw", {
        roomCode,
        accept: true,
      } as RespondDrawRequest);
      const selfAcceptErr = await selfAcceptErrorPromise;
      expect(selfAcceptErr.code).toBe("ERR_INVALID_PAYLOAD");

      // 4. Offering player reconnects with a fresh socket (new socket.id)
      client1.disconnect();
      const client1NewSocket = await createConnectedSocketClient(serverInstance.url);
      const reconnectRes = await emitAck<
        ReconnectRequest,
        { success: true; room: RoomState; player: Player }
      >(client1NewSocket, "room:reconnect", {
        roomCode,
        playerId: whitePlayerId,
        sessionToken: whiteSessionToken,
      });
      expect(reconnectRes.success).toBe(true);

      // Verify the offering player STILL cannot accept on the new socket (MAJ-022 key protection!)
      const reconnectedSelfAcceptError = waitForEvent<SocketErrorPayload>(
        client1NewSocket,
        "error",
      );
      client1NewSocket.emit("game:respond_draw", {
        roomCode,
        accept: true,
      } as RespondDrawRequest);
      const reconnectedErr = await reconnectedSelfAcceptError;
      expect(reconnectedErr.code).toBe("ERR_INVALID_PAYLOAD");

      // Verify match is still ongoing
      const roomStillPlaying = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomStillPlaying?.status).toBe("playing");

      // 5. Opponent (Black) accepts the draw offer
      const p1GameOverPromise = waitForEvent<GameOverPayload>(
        client1NewSocket,
        "game:over",
      );
      const p2GameOverPromise = waitForEvent<GameOverPayload>(
        client2,
        "game:over",
      );

      client2.emit("game:respond_draw", {
        roomCode,
        accept: true,
      } as RespondDrawRequest);

      const [p1GameOver, p2GameOver] = await Promise.all([
        p1GameOverPromise,
        p2GameOverPromise,
      ]);

      expect(p1GameOver.winner).toBe("draw");
      expect(p1GameOver.reason).toBe("draw_agreement");
      expect(p2GameOver.winner).toBe("draw");
      expect(p2GameOver.reason).toBe("draw_agreement");

      // Verify room status in store is game_over
      const finalRoom = await serverInstance.roomStore.findByCode(roomCode);
      expect(finalRoom?.status).toBe("game_over");
      expect(finalRoom?.drawOffer).toBeNull();

      disconnectSockets(client1NewSocket);
    });
  });

  // =========================================================================
  // 5. Rematch Flow and Color Swap Integration (MIN-033)
  // =========================================================================
  describe("5. Rematch Flow and Color Swap Integration (MIN-033)", () => {
    it("swaps piece colors on room and updates session registry metadata to reflect inverted colors", async () => {
      // 1. Host creates room as White
      const createRes = await emitAck<
        CreateRoomRequest,
        { success: true; room: RoomState; sessionToken: string }
      >(client1, "room:create", {
        playerName: "PlayerOneWhite",
        preferredColor: "w",
        avatar: "🦁",
      });
      const roomCode = createRes.room.roomCode;
      const p1Id = createRes.room.whitePlayer!.id;
      const p1SessionToken = createRes.sessionToken;

      // 2. Joiner joins as Black
      const joinRes = await emitAck<
        JoinRoomRequest,
        { success: true; room: RoomState; player: Player; sessionToken: string }
      >(client2, "room:join", {
        roomCode,
        playerName: "PlayerTwoBlack",
        avatar: "🚀",
      });
      const p2Id = joinRes.player.id;
      const p2SessionToken = joinRes.sessionToken;

      // Verify initial session metadata in SessionRegistry
      const p1InitialSession = await serverInstance.sessionRegistry.validateSession(
        p1SessionToken,
        roomCode,
        p1Id,
      );
      const p2InitialSession = await serverInstance.sessionRegistry.validateSession(
        p2SessionToken,
        roomCode,
        p2Id,
      );
      expect(p1InitialSession?.color).toBe("w");
      expect(p2InitialSession?.color).toBe("b");

      // 3. Conclude game via resignation
      const gameOverPromise = waitForEvent<GameOverPayload>(client2, "game:over");
      client1.emit("game:resign", { roomCode } as ResignRequest);
      await gameOverPromise;

      const roomAfterResign = await serverInstance.roomStore.findByCode(roomCode);
      expect(roomAfterResign?.status).toBe("game_over");

      // 4. Rematch requested by Player 1
      const rematchRequestedPromise = waitForEvent<{
        requestedBy: string;
        requesterName: string;
      }>(client2, "game:rematch_requested");

      client1.emit("game:request_rematch", { roomCode } as RequestRematchRequest);
      await rematchRequestedPromise;

      // 5. Rematch accepted by Player 2
      const p1RematchStartedPromise = waitForEvent<{
        gameState: GameState;
        room: RoomState;
      }>(client1, "game:rematch_started");
      const p2RematchStartedPromise = waitForEvent<{
        gameState: GameState;
        room: RoomState;
      }>(client2, "game:rematch_started");

      client2.emit("game:respond_rematch", {
        roomCode,
        accept: true,
      } as RespondRematchRequest);

      const [p1RematchData, p2RematchData] = await Promise.all([
        p1RematchStartedPromise,
        p2RematchStartedPromise,
      ]);

      // 6. Verify room state reflects inverted colors and reset board
      expect(p1RematchData.room.status).toBe("playing");
      expect(p1RematchData.room.whitePlayer?.id).toBe(p2Id);
      expect(p1RematchData.room.whitePlayer?.name).toBe("PlayerTwoBlack");
      expect(p1RematchData.room.whitePlayer?.color).toBe("w");

      expect(p1RematchData.room.blackPlayer?.id).toBe(p1Id);
      expect(p1RematchData.room.blackPlayer?.name).toBe("PlayerOneWhite");
      expect(p1RematchData.room.blackPlayer?.color).toBe("b");

      expect(p1RematchData.gameState.turn).toBe("w");
      expect(p1RematchData.gameState.moveCount).toBe(0);

      // Verify room in store
      const updatedRoomInStore = await serverInstance.roomStore.findByCode(roomCode);
      expect(updatedRoomInStore?.whitePlayer?.id).toBe(p2Id);
      expect(updatedRoomInStore?.blackPlayer?.id).toBe(p1Id);

      // 7. Verify session metadata in SessionRegistry reflects inverted colors (MIN-033 key invariant!)
      const p1UpdatedSession = await serverInstance.sessionRegistry.validateSession(
        p1SessionToken,
        roomCode,
        p1Id,
      );
      const p2UpdatedSession = await serverInstance.sessionRegistry.validateSession(
        p2SessionToken,
        roomCode,
        p2Id,
      );
      expect(p1UpdatedSession?.color).toBe("b");
      expect(p2UpdatedSession?.color).toBe("w");

      // 8. Verify the new White player (Player 2) can legally execute the opening move
      const moveRes = await emitAck<
        MakeMoveRequest,
        { success: true; moveResult: MoveResult }
      >(client2, "game:move", {
        roomCode,
        move: { from: "d2", to: "d4" },
      });
      expect(moveRes.success).toBe(true);
    });
  });
});
