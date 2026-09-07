import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerRoomSocketHandlers,
  handleSocketDisconnect,
  cancelDisconnectTimer,
  clearAllDisconnectTimers,
  DisconnectTimerRegistry,
} from "../room.socket_handler.js";
import { SocketRateLimiter } from "../../../platform/socket/socket_rate_limiter.js";
import { RoomService } from "../room.service.js";
import { MockRoomStore } from "../mock_room.store.js";
import { InMemorySessionRegistry } from "../in_memory_session_registry.js";
import { NullLogger } from "../../../platform/logger/null_logger.js";
import { TypedSocketServer } from "../../../platform/socket/socket_server.js";
import { Socket } from "socket.io";

class TestSocket {
  public id: string;
  public handshake = { address: "127.0.0.1" };
  public rooms = new Set<string>();
  public handlers = new Map<
    string,
    (payload: any, callback?: any) => Promise<any>
  >();
  public emittedEvents: { event: string; payload: unknown }[] = [];
  public toEmits: { room: string; event: string; payload: unknown }[] = [];

  constructor(id = "sock_test_1") {
    this.id = id;
  }

  on(event: string, handler: (payload: any, callback?: any) => Promise<any>) {
    this.handlers.set(event, handler);
    return this;
  }

  emit(event: string, payload: unknown) {
    this.emittedEvents.push({ event, payload });
    return true;
  }

  async join(room: string) {
    this.rooms.add(room);
  }

  async leave(room: string) {
    this.rooms.delete(room);
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
    callback?: (res: any) => void,
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

describe("Room Socket Handlers", () => {
  let store: MockRoomStore;
  let sessionRegistry: InMemorySessionRegistry;
  let service: RoomService;
  let logger: NullLogger;
  let io: TestIo;
  let socket: TestSocket;
  let rateLimiter: SocketRateLimiter;

  beforeEach(() => {
    store = new MockRoomStore();
    sessionRegistry = new InMemorySessionRegistry();
    service = new RoomService(store, sessionRegistry);
    logger = new NullLogger();
    io = new TestIo();
    socket = new TestSocket("sock_host");
    rateLimiter = new SocketRateLimiter({ maxRequests: 5, windowMs: 10_000 });
    clearAllDisconnectTimers();

    registerRoomSocketHandlers(
      io as unknown as TypedSocketServer,
      socket as unknown as Socket,
      service,
      logger,
      rateLimiter,
    );
  });

  afterEach(() => {
    clearAllDisconnectTimers();
    vi.restoreAllMocks();
  });

  describe("room:create", () => {
    it("creates a room, joins socket to room channel, and responds with success ack and event", async () => {
      let ackResponse: any;
      await socket.trigger(
        "room:create",
        { playerName: "Alice", preferredColor: "w" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);
      expect(ackResponse.room.roomCode).toBeDefined();
      expect(ackResponse.sessionToken).toBeDefined();
      expect(socket.rooms.has(ackResponse.room.roomCode)).toBe(true);

      const createdEvent = socket.emittedEvents.find(
        (e) => e.event === "room:created",
      );
      expect(createdEvent).toBeDefined();
      expect((createdEvent?.payload as any).roomCode).toBe(
        ackResponse.room.roomCode,
      );
    });

    it("rejects room creation with ERR_RATE_LIMITED when rate limit is exceeded (SEC-01)", async () => {
      // Consume 5 allowed requests
      for (let i = 0; i < 5; i++) {
        let ack: any;
        await socket.trigger(
          "room:create",
          { playerName: `User${i}`, preferredColor: "w" },
          (res) => {
            ack = res;
          },
        );
        expect(ack.success).toBe(true);
      }

      // 6th attempt must be rejected
      let rateLimitAck: any;
      await socket.trigger(
        "room:create",
        { playerName: "Flooder", preferredColor: "w" },
        (res) => {
          rateLimitAck = res;
        },
      );

      expect(rateLimitAck.success).toBe(false);
      expect(rateLimitAck.error.code).toBe("ERR_RATE_LIMITED");
      expect(rateLimitAck.error.message).toContain("Rate limit exceeded");
    });

    it("ensures sessionToken is returned in ack but never leaked in room:created event or room state", async () => {
      let ackResponse: any;
      await socket.trigger(
        "room:create",
        { playerName: "Alice", preferredColor: "w" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);
      expect(ackResponse.sessionToken).toBeDefined();
      expect(typeof ackResponse.sessionToken).toBe("string");

      // Verify sessionToken is NOT in room state or player objects
      expect((ackResponse.room as any).sessionToken).toBeUndefined();
      const hostPlayer = ackResponse.room.whitePlayer ?? ackResponse.room.blackPlayer;
      expect(hostPlayer).toBeDefined();
      expect((hostPlayer as any).sessionToken).toBeUndefined();

      const createdEvent = socket.emittedEvents.find(
        (e) => e.event === "room:created",
      );
      expect(createdEvent).toBeDefined();
      expect((createdEvent?.payload as any).sessionToken).toBeUndefined();
      const eventPlayer = (createdEvent?.payload as any).whitePlayer ?? (createdEvent?.payload as any).blackPlayer;
      expect((eventPlayer as any).sessionToken).toBeUndefined();
    });

    it("rejects malformed room:create payload with ERR_INVALID_PAYLOAD via ack", async () => {
      let ackResponse: any;
      await socket.trigger(
        "room:create",
        { playerName: "", preferredColor: "w" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_INVALID_PAYLOAD");
      expect(ackResponse.error.message).toBeDefined();
      expect(ackResponse.error.correlationId).toBeDefined();
    });

    it("emits contracted error event when unacknowledged room:create fails schema validation", async () => {
      await socket.trigger("room:create", { playerName: "A".repeat(25) });

      const errorEvent = socket.emittedEvents.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect((errorEvent?.payload as any).code).toBe("ERR_INVALID_PAYLOAD");
      expect((errorEvent?.payload as any).correlationId).toBeDefined();
    });
  });

  describe("room:join", () => {
    it("allows player 2 to join, broadcasts room:player_joined and game:started", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_host",
      );

      const joinerSocket = new TestSocket("sock_joiner");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        joinerSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let ackResponse: any;
      await joinerSocket.trigger(
        "room:join",
        { roomCode: created.roomCode, playerName: "Bob" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);
      expect(ackResponse.player.name).toBe("Bob");
      expect(ackResponse.player.color).toBe("b");
      expect(joinerSocket.rooms.has(created.roomCode)).toBe(true);


      // Joined event emitted to joiner
      const joinedEvent = joinerSocket.emittedEvents.find(
        (e) => e.event === "room:joined",
      );
      expect(joinedEvent).toBeDefined();

      // Broadcast to room: player joined and game started
      const playerJoinedEmit = joinerSocket.toEmits.find(
        (e) => e.event === "room:player_joined",
      );
      expect(playerJoinedEmit).toBeDefined();
      expect(playerJoinedEmit?.room).toBe(created.roomCode);

      const gameStartedEmit = io.toEmits.find(
        (e) => e.event === "game:started",
      );
      expect(gameStartedEmit).toBeDefined();
      expect(gameStartedEmit?.room).toBe(created.roomCode);
    });

    it("rejects room join with ERR_RATE_LIMITED when rate limit is exceeded (SEC-01)", async () => {
      const joinerSocket = new TestSocket("sock_join_flooder");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        joinerSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      // 5 rapid attempts
      for (let i = 0; i < 5; i++) {
        await joinerSocket.trigger(
          "room:join",
          { roomCode: "NONEXISTENT", playerName: "Bob" },
          () => {},
        );
      }

      // 6th attempt
      let rateLimitAck: any;
      await joinerSocket.trigger(
        "room:join",
        { roomCode: "NONEXISTENT", playerName: "Bob" },
        (res) => {
          rateLimitAck = res;
        },
      );

      expect(rateLimitAck.success).toBe(false);
      expect(rateLimitAck.error.code).toBe("ERR_RATE_LIMITED");
      expect(rateLimitAck.error.message).toContain("Rate limit exceeded");
    });

    it("ensures sessionToken is returned to joiner in ack but never leaked in room:player_joined broadcast", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_host",
      );

      const joinerSocket = new TestSocket("sock_joiner_secret");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        joinerSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let ackResponse: any;
      await joinerSocket.trigger(
        "room:join",
        { roomCode: created.roomCode, playerName: "Bob" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);
      expect(ackResponse.sessionToken).toBeDefined();
      expect(typeof ackResponse.sessionToken).toBe("string");
      expect((ackResponse.player as any).sessionToken).toBeUndefined();

      const broadcastJoined = joinerSocket.toEmits.find(
        (e) => e.event === "room:player_joined",
      );
      expect(broadcastJoined).toBeDefined();
      expect(
        ((broadcastJoined?.payload as any).player as any).sessionToken,
      ).toBeUndefined();
    });

    it("rejects malformed room:join payload with ERR_INVALID_PAYLOAD via ack", async () => {
      const joinerSocket = new TestSocket("sock_join_invalid");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        joinerSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let ackResponse: any;
      await joinerSocket.trigger(
        "room:join",
        { roomCode: "INVALID_LENGTH_CODE", playerName: "Bob" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_INVALID_PAYLOAD");
      expect(ackResponse.error.message).toBeDefined();
    });

    it("emits error event when unacknowledged room:join fails schema validation", async () => {
      const joinerSocket = new TestSocket("sock_join_unack");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        joinerSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      await joinerSocket.trigger("room:join", { roomCode: "1234", playerName: "" });

      const errorEvent = joinerSocket.emittedEvents.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect((errorEvent?.payload as any).code).toBe("ERR_INVALID_PAYLOAD");
    });
  });

  describe("room:reconnect", () => {
    it("rejects malformed room:reconnect payload with ERR_INVALID_PAYLOAD via ack", async () => {
      const reconnSocket = new TestSocket("sock_reconn_invalid");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        reconnSocket as unknown as Socket,
        service,
        logger,
      );

      let ackResponse: any;
      await reconnSocket.trigger(
        "room:reconnect",
        {
          roomCode: "ABCD",
          playerId: "not-a-valid-uuid",
          sessionToken: "",
        },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("emits error event when unacknowledged room:reconnect fails schema validation", async () => {
      const reconnSocket = new TestSocket("sock_reconn_unack");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        reconnSocket as unknown as Socket,
        service,
        logger,
      );

      await reconnSocket.trigger("room:reconnect", { roomCode: "ABCD" });

      const errorEvent = reconnSocket.emittedEvents.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect((errorEvent?.payload as any).code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("reconnects dropped player, joins socket, cancels disconnect timer, and broadcasts room:player_reconnected", async () => {
      const { room: created, sessionToken } = await service.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_host",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );

      // Alice disconnects
      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        "sock_host",
        service,
        logger,
      );

      const reconnSocket = new TestSocket("sock_alice_new");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        reconnSocket as unknown as Socket,
        service,
        logger,
      );

      let ackResponse: any;
      await reconnSocket.trigger(
        "room:reconnect",
        {
          roomCode: created.roomCode,
          playerId: created.hostId,
          sessionToken,
        },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);
      expect(ackResponse.room.status).toBe("playing");
      expect(reconnSocket.rooms.has(created.roomCode)).toBe(true);

      const reconnectedEmit = reconnSocket.toEmits.find(
        (e) => e.event === "room:player_reconnected",
      );
      expect(reconnectedEmit).toBeDefined();
      expect((reconnectedEmit?.payload as any).playerId).toBe(created.hostId);
    });

    it("rejects room:reconnect with ERR_RATE_LIMITED when rate limit is exceeded (SEC-HIGH-001)", async () => {
      const reconnLimiter = new SocketRateLimiter({ maxRequests: 5, windowMs: 10_000 });
      const reconnSocket = new TestSocket("sock_reconn_flood");
      reconnSocket.handshake.address = "192.168.10.99";

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        reconnSocket as unknown as Socket,
        service,
        logger,
        reconnLimiter,
      );

      // Consume 5 requests
      for (let i = 0; i < 5; i++) {
        let ack: any;
        await reconnSocket.trigger(
          "room:reconnect",
          { roomCode: "ABCD", playerId: "not-a-valid-uuid", sessionToken: "" },
          (res) => {
            ack = res;
          },
        );
        expect(ack.success).toBe(false);
        // Payload validation fails, but permit was consumed
        expect(ack.error.code).toBe("ERR_INVALID_PAYLOAD");
      }

      // 6th attempt must be rejected by rate limiter
      let rateLimitAck: any;
      await reconnSocket.trigger(
        "room:reconnect",
        { roomCode: "ABCD", playerId: "not-a-valid-uuid", sessionToken: "" },
        (res) => {
          rateLimitAck = res;
        },
      );

      expect(rateLimitAck.success).toBe(false);
      expect(rateLimitAck.error.code).toBe("ERR_RATE_LIMITED");
      expect(rateLimitAck.error.message).toContain("Rate limit exceeded for room reconnection");
    });

    it("enforces rate limit across socket disconnections keyed by client IP (SEC-HIGH-001, MAJ-001)", async () => {
      const sharedLimiter = new SocketRateLimiter({ maxRequests: 5, windowMs: 10_000 });
      const ip = "10.200.1.42";

      const socket1 = new TestSocket("sock_ephemeral_1");
      socket1.handshake.address = ip;

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        socket1 as unknown as Socket,
        service,
        logger,
        sharedLimiter,
      );

      // Consume 5 requests with socket1
      for (let i = 0; i < 5; i++) {
        let ack: any;
        await socket1.trigger(
          "room:create",
          { playerName: `User${i}`, preferredColor: "w" },
          (res) => {
            ack = res;
          },
        );
        expect(ack.success).toBe(true);
      }

      // Socket1 disconnects
      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        socket1.id,
        service,
        logger,
        60_000,
        sharedLimiter,
      );

      // Socket2 connects with NEW socket ID but SAME client IP
      const socket2 = new TestSocket("sock_ephemeral_2");
      socket2.handshake.address = ip;

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        socket2 as unknown as Socket,
        service,
        logger,
        sharedLimiter,
      );

      // Attempt on socket2 must STILL be rate limited because IP is blocked
      let rateLimitAck: any;
      await socket2.trigger(
        "room:create",
        { playerName: "AttackerNewSocket", preferredColor: "w" },
        (res) => {
          rateLimitAck = res;
        },
      );

      expect(rateLimitAck.success).toBe(false);
      expect(rateLimitAck.error.code).toBe("ERR_RATE_LIMITED");
    });
  });

  describe("room:leave", () => {
    it("rejects malformed room:leave payload with ERR_INVALID_PAYLOAD via ack", async () => {
      let ackResponse: any;
      await socket.trigger(
        "room:leave",
        { roomCode: "INVALID_LENGTH" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(false);
      expect(ackResponse.error.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("emits error event when unacknowledged room:leave fails schema validation", async () => {
      await socket.trigger("room:leave", {});

      const errorEvent = socket.emittedEvents.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect((errorEvent?.payload as any).code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("leaves room channel, cancels disconnect timers, and emits game:over with abandonment reason when active player leaves", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_host",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );

      const bobSocket = new TestSocket("sock_bob");
      bobSocket.rooms.add(created.roomCode);
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        bobSocket as unknown as Socket,
        service,
        logger,
      );

      let ackResponse: any;
      await bobSocket.trigger(
        "room:leave",
        { roomCode: created.roomCode },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);
      expect(bobSocket.rooms.has(created.roomCode)).toBe(false);

      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeDefined();
      expect((gameOverEmit?.payload as any).reason).toBe("abandonment");
      expect((gameOverEmit?.payload as any).winner).toBe("w");
      expect((gameOverEmit?.payload as any).winnerName).toBe("Alice");
    });

    it("emits room:player_left when a spectator leaves during an active game", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_host",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );
      const roomWithPlayers = (await store.findByCode(created.roomCode))!;
      const specPlayer = {
        id: "p_spec_id",
        socketId: "sock_spec",
        name: "Charlie",
        color: "w" as const,
        isHost: false,
        isConnected: true,
        connectedAt: Date.now(),
      };
      roomWithPlayers.spectators.push(specPlayer);
      await store.save(roomWithPlayers);

      const specSocket = new TestSocket("sock_spec");
      specSocket.rooms.add(created.roomCode);
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        specSocket as unknown as Socket,
        service,
        logger,
      );

      let ackResponse: any;
      await specSocket.trigger(
        "room:leave",
        { roomCode: created.roomCode },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse.success).toBe(true);
      expect(specSocket.rooms.has(created.roomCode)).toBe(false);

      const leftEmit = specSocket.toEmits.find(
        (e) => e.event === "room:player_left",
      );
      expect(leftEmit).toBeDefined();
      expect((leftEmit?.payload as any).playerName).toBe("Charlie");
    });

    it("rejects room:leave with ERR_RATE_LIMITED and logs structured warning when rate limit is exceeded (MAJ-006)", async () => {
      const leaveLimiter = new SocketRateLimiter({ maxRequests: 2, windowMs: 10_000 });
      const testSocket = new TestSocket("sock_rate_leave");
      testSocket.handshake.address = "192.168.1.100";

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        testSocket as unknown as Socket,
        service,
        logger,
        leaveLimiter,
      );

      // Consume 2 requests
      for (let i = 0; i < 2; i++) {
        await testSocket.trigger("room:leave", { roomCode: "LEAV" }, () => {});
      }

      // 3rd attempt must be rate limited
      let ack: any;
      await testSocket.trigger("room:leave", { roomCode: "LEAV" }, (res) => {
        ack = res;
      });

      expect(ack.success).toBe(false);
      expect(ack.error.code).toBe("ERR_RATE_LIMITED");
      expect(ack.error.message).toContain("Rate limit exceeded for room leave");

      const warnLog = logger.warnLogs.find(
        (l) => l.message === "Rate limit exceeded for room:leave",
      );
      expect(warnLog).toBeDefined();
      expect(warnLog?.context?.operation).toBe("room:leave");
      expect(warnLog?.context?.clientIp).toBe("192.168.1.100");
    });
  });

  describe("handleSocketDisconnect & Abandonment Grace Timer", () => {
    it("emits room:player_disconnected and triggers game:over abandonment when timer expires", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_alice",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );

      // Alice disconnects with a 20ms grace period for fast test verification
      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        "sock_alice",
        service,
        logger,
        20,
      );

      const discEmit = io.toEmits.find(
        (e) => e.event === "room:player_disconnected",
      );
      expect(discEmit).toBeDefined();
      expect((discEmit?.payload as any).playerId).toBe(created.hostId);
      expect((discEmit?.payload as any).gracePeriodMs).toBe(20);

      // Wait for the 20ms timer to fire
      await new Promise((resolve) => setTimeout(resolve, 50));

      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeDefined();
      expect((gameOverEmit?.payload as any).reason).toBe("abandonment");
      expect((gameOverEmit?.payload as any).winner).toBe("b");
      expect((gameOverEmit?.payload as any).winnerName).toBe("Bob");
    });

    it("does not trigger abandonment game:over if player reconnects within grace period", async () => {
      const { room: created, sessionToken } = await service.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_alice",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );

      // Alice disconnects with a 50ms grace period
      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        "sock_alice",
        service,
        logger,
        50,
      );

      // Alice reconnects at 10ms
      await new Promise((resolve) => setTimeout(resolve, 10));
      await service.reconnect(
        { roomCode: created.roomCode, playerId: created.hostId, sessionToken },
        "sock_alice_2",
      );
      cancelDisconnectTimer(created.roomCode, created.hostId);

      // Wait beyond original 50ms timeout
      await new Promise((resolve) => setTimeout(resolve, 60));

      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeUndefined();
    });

    it("emits game:over with draw when BOTH players disconnect and grace timer expires", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_alice",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );

      // Both Alice and Bob disconnect with 20ms grace period
      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        "sock_alice",
        service,
        logger,
        20,
      );
      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        "sock_bob",
        service,
        logger,
        20,
      );

      // Wait for the 20ms timer to fire
      await new Promise((resolve) => setTimeout(resolve, 50));

      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeDefined();
      expect((gameOverEmit?.payload as any).reason).toBe("abandonment");
      expect((gameOverEmit?.payload as any).winner).toBe("draw");
      expect((gameOverEmit?.payload as any).winnerName).toBeUndefined();
      expect((gameOverEmit?.payload as any).message).toBe(
        "Both players disconnected. Game ended by abandonment.",
      );
    });
  });

  describe("DisconnectTimerRegistry (MIN-007)", () => {
    it("tracks, cancels, and clears timers isolated from global scope", () => {
      const registry = new DisconnectTimerRegistry();
      const t1 = setTimeout(() => {}, 10_000);
      const t2 = setTimeout(() => {}, 10_000);
      const t3 = setTimeout(() => {}, 10_000);

      try {
        registry.set("ROOM", "p1", t1);
        registry.set("ROOM", "p2", t2);
        registry.set("OTHER", "p3", t3);

        expect(registry.size()).toBe(3);
        expect(registry.get("room", "p1")).toBe(t1);

        // Cancel specific timer
        expect(registry.cancel("room", "p1")).toBe(true);
        expect(registry.size()).toBe(2);
        expect(registry.cancel("room", "p1")).toBe(false);

        // Cancel all for ROOM
        registry.cancelAllForRoom("room");
        expect(registry.size()).toBe(1);
        expect(registry.get("OTHER", "p3")).toBe(t3);

        // Clear all
        registry.clear();
        expect(registry.size()).toBe(0);
      } finally {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      }
    });
  });

  describe("SC-3 Remediations", () => {
    it("spectator disconnect does NOT schedule a forfeit timer and game continues playing (CRIT-001)", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_alice",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );

      // Add spectator
      const playingRoom = (await service.getRoom(created.roomCode))!;
      playingRoom.spectators = [
        {
          id: "spec_1",
          socketId: "sock_spec",
          name: "Spectator",
          color: "w",
          isHost: false,
          isConnected: true,
          connectedAt: Date.now(),
        },
      ];
      await store.save(playingRoom);

      const timerReg = new DisconnectTimerRegistry();

      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        "sock_spec",
        service,
        logger,
        20,
        undefined,
        timerReg,
      );

      // Verify no forfeit timer was scheduled for spectator
      expect(timerReg.get(created.roomCode, "spec_1")).toBeUndefined();
      expect(timerReg.size()).toBe(0);

      // Wait 50ms to ensure no abandonment timer triggers
      await new Promise((resolve) => setTimeout(resolve, 50));
      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeUndefined();

      // Room status remains playing
      const roomAfter = await service.getRoom(created.roomCode);
      expect(roomAfter?.status).toBe("playing");
    });

    it("schedules forfeit timers for both players on sequential disconnect, and awards win if one reconnects (CRIT-002)", async () => {
      const { room: created, sessionToken: aliceToken } = await service.createRoom(
        { playerName: "Alice", preferredColor: "w" },
        "sock_alice",
      );
      const { player: bobPlayer } = await service.joinRoom(
        { roomCode: created.roomCode, playerName: "Bob" },
        "sock_bob",
      );

      const timerReg = new DisconnectTimerRegistry();

      // 1. Alice drops
      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        "sock_alice",
        service,
        logger,
        50,
        undefined,
        timerReg,
      );
      expect(timerReg.get(created.roomCode, created.hostId)).toBeDefined();

      // 2. Bob drops while room is already paused_disconnect
      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        "sock_bob",
        service,
        logger,
        50,
        undefined,
        timerReg,
      );
      expect(timerReg.get(created.roomCode, bobPlayer.id)).toBeDefined();
      expect(timerReg.size()).toBe(2);

      // 3. Alice reconnects via socket handler
      const aliceSocket = new TestSocket("sock_alice_new");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        aliceSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
        timerReg,
      );

      const reconnectHandler = aliceSocket.handlers.get("room:reconnect")!;
      let ackResult: any;
      await reconnectHandler(
        {
          roomCode: created.roomCode,
          playerId: created.hostId,
          sessionToken: aliceToken,
        },
        (res: any) => {
          ackResult = res;
        },
      );

      expect(ackResult?.success).toBe(true);
      expect(ackResult?.roomStatus).toBe("paused_disconnect");

      // Alice's timer must be cancelled, Bob's timer must STILL be active
      expect(timerReg.get(created.roomCode, created.hostId)).toBeUndefined();
      expect(timerReg.get(created.roomCode, bobPlayer.id)).toBeDefined();

      // 4. Bob's 50ms timer expires -> game forfeited to Alice
      await new Promise((resolve) => setTimeout(resolve, 80));

      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeDefined();
      expect((gameOverEmit?.payload as any).winner).toBe("w");
      expect((gameOverEmit?.payload as any).winnerName).toBe("Alice");
    });

    it("guest leaving lobby emits room:player_left and does not delete host room (CRIT-008 & MAJ-021)", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "HostAlice", preferredColor: "w" },
        "sock_host",
      );

      // Put room in lobby state with guest Bob
      const roomInLobby = (await service.getRoom(created.roomCode))!;
      roomInLobby.status = "lobby";
      roomInLobby.blackPlayer = {
        id: "bob_guest_id",
        socketId: "sock_guest_bob",
        name: "GuestBob",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: Date.now(),
      };
      await store.save(roomInLobby);

      const guestSocket = new TestSocket("sock_guest_bob");
      guestSocket.rooms.add(created.roomCode);

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        guestSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      const leaveHandler = guestSocket.handlers.get("room:leave")!;
      let leaveAck: any;
      await leaveHandler({ roomCode: created.roomCode }, (res: any) => {
        leaveAck = res;
      });

      expect(leaveAck?.success).toBe(true);

      // Invariant: room:player_left was broadcast to the room
      const playerLeftEmit = guestSocket.toEmits.find(
        (e) => e.event === "room:player_left",
      );
      expect(playerLeftEmit).toBeDefined();
      expect((playerLeftEmit?.payload as any).playerId).toBe("bob_guest_id");
      expect((playerLeftEmit?.payload as any).playerName).toBe("GuestBob");
      expect((playerLeftEmit?.payload as any).reason).toBe("player_left");

      // Invariant: Host room was NOT deleted
      const roomAfter = await service.getRoom(created.roomCode);
      expect(roomAfter).not.toBeNull();
      expect(roomAfter?.whitePlayer?.id).toBe(created.hostId);
      expect(roomAfter?.blackPlayer).toBeNull();
    });

    it("authoritative roomStatus sent in room:player_disconnected and room:reconnected (MAJ-001)", async () => {
      const { room: created, sessionToken } = await service.createRoom(
        { playerName: "P1", preferredColor: "w" },
        "sock_p1",
      );
      await service.joinRoom(
        { roomCode: created.roomCode, playerName: "P2" },
        "sock_p2",
      );

      // Disconnect P1
      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        "sock_p1",
        service,
        logger,
        60_000,
      );

      const discEmit = io.toEmits.find(
        (e) => e.event === "room:player_disconnected",
      );
      expect(discEmit).toBeDefined();
      expect((discEmit?.payload as any).roomStatus).toBe("paused_disconnect");

      // Reconnect P1
      const reconnectSocket = new TestSocket("sock_p1_recon");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        reconnectSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      const reconnectHandler = reconnectSocket.handlers.get("room:reconnect")!;
      let ackPayload: any;
      await reconnectHandler(
        {
          roomCode: created.roomCode,
          playerId: created.hostId,
          sessionToken,
        },
        (res: any) => {
          ackPayload = res;
        },
      );

      expect(ackPayload?.roomStatus).toBe("playing");

      const reconEvent = reconnectSocket.emittedEvents.find(
        (e) => e.event === "room:reconnected",
      );
      expect(reconEvent).toBeDefined();
      expect((reconEvent?.payload as any).roomStatus).toBe("playing");
    });
  });
});
