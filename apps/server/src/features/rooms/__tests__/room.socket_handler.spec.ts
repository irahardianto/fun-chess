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
import type { Player, RoomState } from "@fun-chess/shared";

interface TestAckResponse {
  success?: boolean;
  room?: RoomState;
  player?: Player;
  sessionToken?: string;
  roomStatus?: string;
  error?: {
    code: string;
    message: string;
    correlationId?: string;
    details?: unknown;
  };
}

type TestHandler = (
  payload: unknown,
  callback?: (res: TestAckResponse) => void,
) => Promise<unknown>;

function asRecord(val: unknown): Record<string, unknown> {
  return (val && typeof val === "object" ? val : {}) as Record<string, unknown>;
}

class TestSocket {
  public id: string;
  public handshake: {
    address: string;
    headers?: Record<string, string | string[] | undefined>;
  } = { address: "127.0.0.1" };
  public rooms = new Set<string>();
  public data: Record<string, unknown> = {};
  public handlers = new Map<string, TestHandler>();
  public emittedEvents: { event: string; payload: unknown }[] = [];
  public toEmits: { room: string; event: string; payload: unknown }[] = [];

  constructor(id = "sock_test_1") {
    this.id = id;
  }

  on(event: string, handler: TestHandler) {
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
    callback?: (res: TestAckResponse) => void,
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

  in(_room: string) {
    return {
      fetchSockets: async () => {
        return [];
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
  let createRateLimiter: SocketRateLimiter;

  beforeEach(() => {
    store = new MockRoomStore();
    sessionRegistry = new InMemorySessionRegistry("test-secret-at-least-16-chars-long", false);
    service = new RoomService(store, sessionRegistry);
    logger = new NullLogger();
    io = new TestIo();
    socket = new TestSocket("sock_host");
    rateLimiter = new SocketRateLimiter({
      maxRequests: 5,
      windowMs: 10_000,
      pruneIntervalMs: 0,
    });
    createRateLimiter = new SocketRateLimiter({
      maxRequests: 3,
      windowMs: 60_000,
      pruneIntervalMs: 0,
    });
    clearAllDisconnectTimers();

    registerRoomSocketHandlers(
      io as unknown as TypedSocketServer,
      socket as unknown as Socket,
      service,
      logger,
      rateLimiter,
      undefined,
      createRateLimiter,
    );
  });

  afterEach(() => {
    clearAllDisconnectTimers();
    rateLimiter.destroy();
    createRateLimiter.destroy();
    vi.restoreAllMocks();
  });

  describe("room:create", () => {
    it("creates a room, joins socket to room channel, and responds with success ack and event", async () => {
      let ackResponse: TestAckResponse | undefined;
      await socket.trigger(
        "room:create",
        { playerName: "Alice", preferredColor: "w" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse?.success).toBe(true);
      expect(ackResponse?.room?.roomCode).toBeDefined();
      expect(ackResponse?.sessionToken).toBeDefined();
      expect(ackResponse?.player?.socketId).toBeUndefined();
      expect(ackResponse?.room?.whitePlayer?.socketId).toBeUndefined();
      expect(ackResponse?.room?.blackPlayer?.socketId).toBeUndefined();
      expect(socket.rooms.has(ackResponse?.room?.roomCode || "")).toBe(true);

      // Dual delivery eliminated: room:created is not emitted to the creating socket (MAJ-008)
      const createdEvent = socket.emittedEvents.find(
        (e) => e.event === "room:created",
      );
      expect(createdEvent).toBeUndefined();
    });

    it("rejects room creation with ERR_RATE_LIMITED when rate limit is exceeded (SEC-01)", async () => {
      // Consume 3 allowed requests (MAJ-006: 3 req/min)
      for (let i = 0; i < 3; i++) {
        let ack: TestAckResponse | undefined;
        await socket.trigger(
          "room:create",
          { playerName: `User${i}`, preferredColor: "w" },
          (res) => {
            ack = res;
          },
        );
        expect(ack?.success).toBe(true);
      }

      // 4th attempt must be rejected
      let rateLimitAck: TestAckResponse | undefined;
      await socket.trigger(
        "room:create",
        { playerName: "Flooder", preferredColor: "w" },
        (res) => {
          rateLimitAck = res;
        },
      );

      expect(rateLimitAck?.success).toBe(false);
      expect(rateLimitAck?.error?.code).toBe("ERR_RATE_LIMITED");
      expect(rateLimitAck?.error?.message).toContain("Rate limit exceeded");
    });

    it("ensures sessionToken is returned in ack but never leaked in room:created event or room state", async () => {
      let ackResponse: TestAckResponse | undefined;
      await socket.trigger(
        "room:create",
        { playerName: "Alice", preferredColor: "w" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse?.success).toBe(true);
      expect(ackResponse?.sessionToken).toBeDefined();
      expect(typeof ackResponse?.sessionToken).toBe("string");

      // Verify sessionToken is NOT in room state or player objects
      expect(
        (ackResponse?.room as unknown as Record<string, unknown>)?.sessionToken,
      ).toBeUndefined();
      const hostPlayer =
        ackResponse?.room?.whitePlayer ?? ackResponse?.room?.blackPlayer;
      expect(hostPlayer).toBeDefined();
      expect(
        (hostPlayer as unknown as Record<string, unknown>)?.sessionToken,
      ).toBeUndefined();

      // Dual delivery eliminated: room:created is not emitted to the creating socket (MAJ-008)
      const createdEvent = socket.emittedEvents.find(
        (e) => e.event === "room:created",
      );
      expect(createdEvent).toBeUndefined();
    });

    it("rejects malformed room:create payload with ERR_INVALID_PAYLOAD via ack", async () => {
      let ackResponse: TestAckResponse | undefined;
      await socket.trigger(
        "room:create",
        { playerName: "", preferredColor: "w" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
      expect(ackResponse?.error?.message).toBeDefined();
      expect(ackResponse?.error?.correlationId).toBeDefined();
    });

    it("emits contracted error event when unacknowledged room:create fails schema validation", async () => {
      await socket.trigger("room:create", { playerName: "A".repeat(25) });

      const errorEvent = socket.emittedEvents.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect(asRecord(errorEvent?.payload).code).toBe("ERR_INVALID_PAYLOAD");
      expect(asRecord(errorEvent?.payload).correlationId).toBeDefined();
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

      let ackResponse: TestAckResponse | undefined;
      await joinerSocket.trigger(
        "room:join",
        { roomCode: created.roomCode, playerName: "Bob" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse?.success).toBe(true);
      expect(ackResponse?.player?.name).toBe("Bob");
      expect(ackResponse?.player?.color).toBe("b");
      expect(ackResponse?.player?.socketId).toBeUndefined();
      expect(ackResponse?.room?.whitePlayer?.socketId).toBeUndefined();
      expect(ackResponse?.room?.blackPlayer?.socketId).toBeUndefined();
      expect(joinerSocket.rooms.has(created.roomCode)).toBe(true);

      // Dual delivery eliminated: room:joined is not emitted to joiner (MAJ-008)
      const joinedEvent = joinerSocket.emittedEvents.find(
        (e) => e.event === "room:joined",
      );
      expect(joinedEvent).toBeUndefined();

      // Broadcast to room: player joined and game started
      const playerJoinedEmit = joinerSocket.toEmits.find(
        (e) => e.event === "room:player_joined",
      );
      expect(playerJoinedEmit).toBeDefined();
      expect(playerJoinedEmit?.room).toBe(created.roomCode);
      const playerJoinedData = asRecord(playerJoinedEmit?.payload);
      expect((asRecord(playerJoinedData.player))?.socketId).toBeUndefined();
      expect((asRecord(asRecord(playerJoinedData.room).whitePlayer))?.socketId).toBeUndefined();
      expect((asRecord(asRecord(playerJoinedData.room).blackPlayer))?.socketId).toBeUndefined();

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
      let rateLimitAck: TestAckResponse | undefined;
      await joinerSocket.trigger(
        "room:join",
        { roomCode: "NONEXISTENT", playerName: "Bob" },
        (res) => {
          rateLimitAck = res;
        },
      );

      expect(rateLimitAck?.success).toBe(false);
      expect(rateLimitAck?.error?.code).toBe("ERR_RATE_LIMITED");
      expect(rateLimitAck?.error?.message).toContain("Rate limit exceeded");
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

      let ackResponse: TestAckResponse | undefined;
      await joinerSocket.trigger(
        "room:join",
        { roomCode: created.roomCode, playerName: "Bob" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse?.success).toBe(true);
      expect(ackResponse?.sessionToken).toBeDefined();
      expect(typeof ackResponse?.sessionToken).toBe("string");
      expect(
        (ackResponse?.player as unknown as Record<string, unknown>)
          ?.sessionToken,
      ).toBeUndefined();

      const broadcastJoined = joinerSocket.toEmits.find(
        (e) => e.event === "room:player_joined",
      );
      expect(broadcastJoined).toBeDefined();
      expect(
        (
          asRecord(broadcastJoined?.payload).player as unknown as Record<
            string,
            unknown
          >
        )?.sessionToken,
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

      let ackResponse: TestAckResponse | undefined;
      await joinerSocket.trigger(
        "room:join",
        { roomCode: "INVALID_LENGTH_CODE", playerName: "Bob" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
      expect(ackResponse?.error?.message).toBeDefined();
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
      expect(asRecord(errorEvent?.payload).code).toBe("ERR_INVALID_PAYLOAD");
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
        rateLimiter,
      );

      let ackResponse: TestAckResponse | undefined;
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

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("emits error event when unacknowledged room:reconnect fails schema validation", async () => {
      const reconnSocket = new TestSocket("sock_reconn_unack");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        reconnSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      await reconnSocket.trigger("room:reconnect", { roomCode: "ABCD" });

      const errorEvent = reconnSocket.emittedEvents.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect(asRecord(errorEvent?.payload).code).toBe("ERR_INVALID_PAYLOAD");
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
        rateLimiter,
      );

      let ackResponse: TestAckResponse | undefined;
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

      expect(ackResponse?.success).toBe(true);
      expect(ackResponse?.sessionToken).toBe(sessionToken);
      expect(ackResponse?.room?.status).toBe("playing");
      expect(ackResponse?.player?.socketId).toBeUndefined();
      expect(ackResponse?.room?.whitePlayer?.socketId).toBeUndefined();
      expect(ackResponse?.room?.blackPlayer?.socketId).toBeUndefined();
      expect(reconnSocket.rooms.has(created.roomCode)).toBe(true);

      const reconnectedEmit = reconnSocket.toEmits.find(
        (e) => e.event === "room:player_reconnected",
      );
      expect(reconnectedEmit).toBeDefined();
      expect(asRecord(reconnectedEmit?.payload).playerId).toBe(created.hostId);

      // MAJ-003: Re-establish room:reconnected socket event emission (unicast to the reconnecting socket)
      const reconnectedSelfEmit = reconnSocket.emittedEvents.find(
        (e) => e.event === "room:reconnected",
      );
      expect(reconnectedSelfEmit).toBeDefined();
      const reconPayload = asRecord(reconnectedSelfEmit?.payload);
      expect(reconPayload.room).toBeDefined();
      expect(reconPayload.player).toBeDefined();
      expect(reconPayload.roomStatus).toBe("playing");
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
        let ack: TestAckResponse | undefined;
        await reconnSocket.trigger(
          "room:reconnect",
          { roomCode: "ABCD", playerId: "not-a-valid-uuid", sessionToken: "" },
          (res) => {
            ack = res;
          },
        );
        expect(ack?.success).toBe(false);
        // Payload validation fails, but permit was consumed
        expect(ack?.error?.code).toBe("ERR_INVALID_PAYLOAD");
      }

      // 6th attempt must be rejected by rate limiter
      let rateLimitAck: TestAckResponse | undefined;
      await reconnSocket.trigger(
        "room:reconnect",
        { roomCode: "ABCD", playerId: "not-a-valid-uuid", sessionToken: "" },
        (res) => {
          rateLimitAck = res;
        },
      );

      expect(rateLimitAck?.success).toBe(false);
      expect(rateLimitAck?.error?.code).toBe("ERR_RATE_LIMITED");
      expect(rateLimitAck?.error?.message).toContain("Rate limit exceeded for room reconnection");
    });

    it("keys rate limits strictly by client IP so reconnecting or co-located sockets share quota preventing disconnect evasion (MAJ-001)", async () => {
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
        undefined,
        sharedLimiter,
      );

      // Consume 5 requests with socket1
      for (let i = 0; i < 5; i++) {
        let ack: TestAckResponse | undefined;
        await socket1.trigger(
          "room:create",
          { playerName: `User${i}`, preferredColor: "w" },
          (res) => {
            ack = res;
          },
        );
        expect(ack?.success).toBe(true);
      }

      // 6th attempt on socket1 must be rate limited
      let socket1Ack: TestAckResponse | undefined;
      await socket1.trigger(
        "room:create",
        { playerName: "UserExceeded", preferredColor: "w" },
        (res) => {
          socket1Ack = res;
        },
      );
      expect(socket1Ack?.success).toBe(false);
      expect(socket1Ack?.error?.code).toBe("ERR_RATE_LIMITED");

      // Socket1 disconnects
      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        socket1.id,
        service,
        logger,
        60_000,
        sharedLimiter,
      );

      // Socket2 connects with NEW socket ID but SAME client IP (reconnection or evasion attempt)
      const socket2 = new TestSocket("sock_ephemeral_2");
      socket2.handshake.address = ip;

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        socket2 as unknown as Socket,
        service,
        logger,
        sharedLimiter,
        undefined,
        sharedLimiter,
      );

      // Attempt on socket2 must be RATE LIMITED because rate limit is keyed strictly by IP (MAJ-001)
      let socket2Ack: TestAckResponse | undefined;
      await socket2.trigger(
        "room:create",
        { playerName: "ColocatedPlayer", preferredColor: "w" },
        (res) => {
          socket2Ack = res;
        },
      );

      expect(socket2Ack?.success).toBe(false);
      expect(socket2Ack?.error?.code).toBe("ERR_RATE_LIMITED");
    });
  });

  describe("room:leave", () => {
    it("rejects malformed room:leave payload with ERR_INVALID_PAYLOAD via ack", async () => {
      let ackResponse: TestAckResponse | undefined;
      await socket.trigger(
        "room:leave",
        { roomCode: "INVALID_LENGTH" },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse?.success).toBe(false);
      expect(ackResponse?.error?.code).toBe("ERR_INVALID_PAYLOAD");
    });

    it("emits error event when unacknowledged room:leave fails schema validation", async () => {
      await socket.trigger("room:leave", {});

      const errorEvent = socket.emittedEvents.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect(asRecord(errorEvent?.payload).code).toBe("ERR_INVALID_PAYLOAD");
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
        rateLimiter,
      );

      let ackResponse: TestAckResponse | undefined;
      await bobSocket.trigger(
        "room:leave",
        { roomCode: created.roomCode },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse?.success).toBe(true);
      expect(bobSocket.rooms.has(created.roomCode)).toBe(false);

      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeDefined();
      expect(asRecord(gameOverEmit?.payload).reason).toBe("abandonment");
      expect(asRecord(gameOverEmit?.payload).winner).toBe("w");
      expect(asRecord(gameOverEmit?.payload).winnerName).toBe("Alice");
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
        rateLimiter,
      );

      let ackResponse: TestAckResponse | undefined;
      await specSocket.trigger(
        "room:leave",
        { roomCode: created.roomCode },
        (res) => {
          ackResponse = res;
        },
      );

      expect(ackResponse?.success).toBe(true);
      expect(specSocket.rooms.has(created.roomCode)).toBe(false);

      const leftEmit = specSocket.toEmits.find(
        (e) => e.event === "room:player_left",
      );
      expect(leftEmit).toBeDefined();
      expect(asRecord(leftEmit?.payload).playerName).toBe("Charlie");
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
      let ack: TestAckResponse | undefined;
      await testSocket.trigger("room:leave", { roomCode: "LEAV" }, (res) => {
        ack = res;
      });

      expect(ack?.success).toBe(false);
      expect(ack?.error?.code).toBe("ERR_RATE_LIMITED");
      expect(ack?.error?.message).toContain("Rate limit exceeded for room leave");

      const warnLog = logger.warnLogs.find(
        (l) => l.message === "Operation rate limit exceeded",
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
      expect(asRecord(discEmit?.payload).playerId).toBe(created.hostId);
      expect(asRecord(discEmit?.payload).gracePeriodMs).toBe(20);

      // Wait for the 20ms timer to fire
      await new Promise((resolve) => setTimeout(resolve, 50));

      const gameOverEmit = io.toEmits.find((e) => e.event === "game:over");
      expect(gameOverEmit).toBeDefined();
      expect(asRecord(gameOverEmit?.payload).reason).toBe("abandonment");
      expect(asRecord(gameOverEmit?.payload).winner).toBe("b");
      expect(asRecord(gameOverEmit?.payload).winnerName).toBe("Bob");
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
      expect(asRecord(gameOverEmit?.payload).reason).toBe("abandonment");
      expect(asRecord(gameOverEmit?.payload).winner).toBe("draw");
      expect(asRecord(gameOverEmit?.payload).winnerName).toBeUndefined();
      expect(asRecord(gameOverEmit?.payload).message).toBe(
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
      let ackResult: TestAckResponse | undefined;
      await reconnectHandler(
        {
          roomCode: created.roomCode,
          playerId: created.hostId,
          sessionToken: aliceToken,
        },
        (res: TestAckResponse) => {
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
      expect(asRecord(gameOverEmit?.payload).winner).toBe("w");
      expect(asRecord(gameOverEmit?.payload).winnerName).toBe("Alice");
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
      let leaveAck: TestAckResponse | undefined;
      await leaveHandler({ roomCode: created.roomCode }, (res: TestAckResponse) => {
        leaveAck = res;
      });

      expect(leaveAck?.success).toBe(true);

      // Invariant: room:player_left was broadcast to the room
      const playerLeftEmit = guestSocket.toEmits.find(
        (e) => e.event === "room:player_left",
      );
      expect(playerLeftEmit).toBeDefined();
      expect(asRecord(playerLeftEmit?.payload).playerId).toBe("bob_guest_id");
      expect(asRecord(playerLeftEmit?.payload).playerName).toBe("GuestBob");
      expect(asRecord(playerLeftEmit?.payload).reason).toBe("player_left");

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
      expect(asRecord(discEmit?.payload).roomStatus).toBe("paused_disconnect");

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
      let ackPayload: TestAckResponse | undefined;
      await reconnectHandler(
        {
          roomCode: created.roomCode,
          playerId: created.hostId,
          sessionToken,
        },
        (res: TestAckResponse) => {
          ackPayload = res;
        },
      );

      expect(ackPayload?.roomStatus).toBe("playing");

      // MAJ-003: Authoritative roomStatus sent in unicast room:reconnected
      const reconEvent = reconnectSocket.emittedEvents.find(
        (e) => e.event === "room:reconnected",
      );
      expect(reconEvent).toBeDefined();
      expect(asRecord(reconEvent?.payload).roomStatus).toBe("playing");
    });
  });

  describe("SC-4 Reliability, Observability & Rate Limiting Enhancements", () => {
    it("broadcasts room:player_left with host_left reason and cancels timers when host leaves in lobby (MAJ-002)", async () => {
      const { room: created } = await service.createRoom(
        { playerName: "HostHero", preferredColor: "w" },
        "sock_host_1",
      );

      const hostSocket = new TestSocket("sock_host_1");
      hostSocket.rooms.add(created.roomCode);

      const timerRegistry = new DisconnectTimerRegistry();
      const mockTimer = setTimeout(() => {}, 10_000);
      timerRegistry.set(created.roomCode, created.hostId, mockTimer);

      let leftChannel = false;
      const mockPeerSocket = {
        id: "sock_peer",
        leave: async (r: string) => {
          if (r === created.roomCode) leftChannel = true;
        },
      };

      const customIo = {
        toEmits: [] as { room: string; event: string; payload: unknown }[],
        to(room: string) {
          return {
            emit: (event: string, payload: unknown) => {
              this.toEmits.push({ room, event, payload });
              return true;
            },
          };
        },
        in(room: string) {
          return {
            fetchSockets: async () => {
              return room === created.roomCode ? [mockPeerSocket] : [];
            },
          };
        },
      };

      registerRoomSocketHandlers(
        customIo as unknown as TypedSocketServer,
        hostSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
        timerRegistry,
      );

      const leaveHandler = hostSocket.handlers.get("room:leave")!;
      let leaveAck: TestAckResponse | undefined;
      await leaveHandler({ roomCode: created.roomCode }, (res: TestAckResponse) => {
        leaveAck = res;
      });

      expect(leaveAck?.success).toBe(true);

      // Verify broadcast to room with reason: "host_left"
      const broadcastLeft = hostSocket.toEmits.find(
        (e) => e.event === "room:player_left",
      );
      expect(broadcastLeft).toBeDefined();
      expect(asRecord(broadcastLeft?.payload).reason).toBe("host_left");
      expect(asRecord(broadcastLeft?.payload).playerId).toBe(created.hostId);

      // Verify timers cancelled
      expect(timerRegistry.size()).toBe(0);

      // Verify peer socket was evicted from room channel
      expect(leftChannel).toBe(true);

      clearTimeout(mockTimer);
    });

    it("populates socket.data.userId and socket.data.roomCode on create, join, reconnect (MAJ-023)", async () => {
      const testSock = new TestSocket("sock_context");
      testSock.data = {};

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        testSock as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      // 1. Create Room
      const createHandler = testSock.handlers.get("room:create")!;
      let createAck: TestAckResponse | undefined;
      await createHandler(
        { playerName: "ContextUser", preferredColor: "w" },
        (res: TestAckResponse) => {
          createAck = res;
        },
      );

      expect(testSock.data.userId).toBe(createAck?.player?.id);
      expect(testSock.data.roomCode).toBe(createAck?.room?.roomCode);
      expect(testSock.data.sessionToken).toBe(createAck?.sessionToken);

      // 2. Join Room
      const joinerSock = new TestSocket("sock_context_join");
      joinerSock.data = {};
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        joinerSock as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      const joinHandler = joinerSock.handlers.get("room:join")!;
      let joinAck: TestAckResponse | undefined;
      await joinHandler(
        { roomCode: createAck?.room?.roomCode || "", playerName: "ContextJoiner" },
        (res: TestAckResponse) => {
          joinAck = res;
        },
      );

      expect(joinerSock.data.userId).toBe(joinAck?.player?.id);
      expect(joinerSock.data.roomCode).toBe(createAck?.room?.roomCode);
      expect(joinerSock.data.sessionToken).toBe(joinAck?.sessionToken);

      // 3. Reconnect
      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        joinerSock.id,
        service,
        logger,
        60_000,
      );

      const reconnSock = new TestSocket("sock_context_recon");
      reconnSock.data = {};
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        reconnSock as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      const reconnHandler = reconnSock.handlers.get("room:reconnect")!;
      let reconnAck: TestAckResponse | undefined;
      await reconnHandler(
        {
          roomCode: createAck?.room?.roomCode || "",
          playerId: joinAck?.player?.id || "",
          sessionToken: joinAck?.sessionToken || "",
        },
        (res: TestAckResponse) => {
          reconnAck = res;
        },
      );

      expect(reconnSock.data.userId).toBe(reconnAck?.player?.id);
      expect(reconnSock.data.roomCode).toBe(createAck?.room?.roomCode);
      expect(reconnSock.data.sessionToken).toBe(joinAck?.sessionToken);
    });

    it("enforces differential rate limit of 3 creations / min / IP (MAJ-006)", async () => {
      const specificCreateLimiter = new SocketRateLimiter({
        maxRequests: 3,
        windowMs: 60_000,
        pruneIntervalMs: 0,
      });
      const createSocket = new TestSocket("sock_diff_create");
      createSocket.handshake.address = "172.16.0.5";

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        createSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
        undefined,
        specificCreateLimiter,
      );

      // 3 room:create requests succeed
      for (let i = 0; i < 3; i++) {
        let ack: TestAckResponse | undefined;
        await createSocket.trigger(
          "room:create",
          { playerName: `Player${i}`, preferredColor: "w" },
          (res) => {
            ack = res;
          },
        );
        expect(ack?.success).toBe(true);
      }

      // 4th room:create is rejected
      let fourthAck: TestAckResponse | undefined;
      await createSocket.trigger(
        "room:create",
        { playerName: "PlayerBlocked", preferredColor: "w" },
        (res) => {
          fourthAck = res;
        },
      );
      expect(fourthAck?.success).toBe(false);
      expect(fourthAck?.error?.code).toBe("ERR_RATE_LIMITED");
      expect(fourthAck?.error?.message).toContain("Rate limit exceeded for room creation");

      // Verify that room:join is NOT blocked by room:create quota
      let joinAck: TestAckResponse | undefined;
      await createSocket.trigger(
        "room:join",
        { roomCode: "NONEXISTENT", playerName: "Joiner" },
        (res) => {
          joinAck = res;
        },
      );
      // Join should fail with RoomNotFoundError / ERR_ROOM_NOT_FOUND, NOT ERR_RATE_LIMITED!
      expect(joinAck?.error?.code).not.toBe("ERR_RATE_LIMITED");

      specificCreateLimiter.destroy();
    });

    it("logs structured error when disconnect grace period forfeit fails (MIN-007)", async () => {
      const mockService = {
        handleDisconnect: async (
          _sockId: string,
          onForfeit?: (room: RoomState, gameOverPayload: unknown) => Promise<void>,
        ) => {
          // Simulate calling onForfeit where error happens in background job
          if (onForfeit) {
            try {
              await onForfeit(
                { roomCode: "TEST" } as unknown as RoomState,
                { winner: "w" },
              );
            } catch (error) {
              // Simulated background job runner absorbs error after logging (MAJ-012)
              void error;
            }
          }
          return null;
        },
      } as unknown as IRoomService;

      const failingLogger = new NullLogger();
      // Force io.to to throw to trigger catch block in onForfeit
      const failingIo = {
        to: () => {
          throw new Error("Socket emit network failure");
        },
      } as unknown as TypedSocketServer;

      await handleSocketDisconnect(
        failingIo,
        "sock_err",
        mockService,
        failingLogger,
      );

      const errorLogs = failingLogger.errorLogs.filter(
        (l) => l.context?.operation === "game_abandoned",
      );
      expect(errorLogs.length).toBeGreaterThan(0);
    });
  });

  describe("SEC/DEV-001 and SEC-002: trustProxy Forwarding & Session Token Attachment", () => {
    it("respects trustProxy=true by using x-forwarded-for header for rate limiting (SEC/DEV-001)", async () => {
      const customRateLimiter = new SocketRateLimiter({
        maxRequests: 1,
        windowMs: 60_000,
        pruneIntervalMs: 0,
      });

      const proxySocket = new TestSocket("sock_proxy_test");
      proxySocket.handshake.address = "10.0.0.1";
      proxySocket.handshake.headers = { "x-forwarded-for": "203.0.113.50" };

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        proxySocket as unknown as Socket,
        service,
        logger,
        customRateLimiter,
        undefined,
        customRateLimiter,
        true, // trustProxy = true
      );

      // First create under IP 203.0.113.50 succeeds
      let ack1: TestAckResponse | undefined;
      await proxySocket.trigger(
        "room:create",
        { playerName: "User1", preferredColor: "w" },
        (res) => {
          ack1 = res;
        },
      );
      expect(ack1?.success).toBe(true);

      // Second create with a different forwarded IP succeeds because trustProxy is active
      proxySocket.handshake.headers = { "x-forwarded-for": "203.0.113.99" };
      let ack2: TestAckResponse | undefined;
      await proxySocket.trigger(
        "room:create",
        { playerName: "User2", preferredColor: "w" },
        (res) => {
          ack2 = res;
        },
      );
      expect(ack2?.success).toBe(true);

      // Third create returning to IP 203.0.113.50 gets rate limited
      proxySocket.handshake.headers = { "x-forwarded-for": "203.0.113.50" };
      let ack3: TestAckResponse | undefined;
      await proxySocket.trigger(
        "room:create",
        { playerName: "User3", preferredColor: "w" },
        (res) => {
          ack3 = res;
        },
      );
      expect(ack3?.success).toBe(false);
      expect(ack3?.error?.code).toBe("ERR_RATE_LIMITED");
    });

    it("ignores x-forwarded-for when trustProxy=false (SEC/DEV-001)", async () => {
      const customRateLimiter = new SocketRateLimiter({
        maxRequests: 1,
        windowMs: 60_000,
        pruneIntervalMs: 0,
      });

      const untrustedSocket = new TestSocket("sock_untrusted_test");
      untrustedSocket.handshake.address = "10.0.0.1";
      untrustedSocket.handshake.headers = { "x-forwarded-for": "203.0.113.50" };

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        untrustedSocket as unknown as Socket,
        service,
        logger,
        customRateLimiter,
        undefined,
        customRateLimiter,
        false, // trustProxy = false
      );

      // First create succeeds
      let ack1: TestAckResponse | undefined;
      await untrustedSocket.trigger(
        "room:create",
        { playerName: "User1", preferredColor: "w" },
        (res) => {
          ack1 = res;
        },
      );
      expect(ack1?.success).toBe(true);

      // Changing x-forwarded-for has NO effect; rate limited on direct address 10.0.0.1
      untrustedSocket.handshake.headers = { "x-forwarded-for": "203.0.113.99" };
      let ack2: TestAckResponse | undefined;
      await untrustedSocket.trigger(
        "room:create",
        { playerName: "User2", preferredColor: "w" },
        (res) => {
          ack2 = res;
        },
      );
      expect(ack2?.success).toBe(false);
      expect(ack2?.error?.code).toBe("ERR_RATE_LIMITED");
    });

    it("attaches sessionToken to socket.data on room:create, room:join, and room:reconnect (SEC-002)", async () => {
      // 1. Create room
      const creatorSocket = new TestSocket("sock_sec002_create");
      creatorSocket.data = {};
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        creatorSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let createAck: TestAckResponse | undefined;
      await creatorSocket.trigger(
        "room:create",
        { playerName: "HostP1", preferredColor: "w" },
        (res) => {
          createAck = res;
        },
      );

      expect(createAck?.success).toBe(true);
      expect(creatorSocket.data.sessionToken).toBe(createAck?.sessionToken);

      // 2. Join room
      const joinerSocket = new TestSocket("sock_sec002_join");
      joinerSocket.data = {};
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        joinerSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let joinAck: TestAckResponse | undefined;
      await joinerSocket.trigger(
        "room:join",
        { roomCode: createAck?.room?.roomCode || "", playerName: "GuestP2" },
        (res) => {
          joinAck = res;
        },
      );

      expect(joinAck?.success).toBe(true);
      expect(joinerSocket.data.sessionToken).toBe(joinAck?.sessionToken);

      // 3. Reconnect
      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        joinerSocket.id,
        service,
        logger,
        60_000,
      );

      const reconnSocket = new TestSocket("sock_sec002_recon");
      reconnSocket.data = {};
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        reconnSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let reconnAck: TestAckResponse | undefined;
      await reconnSocket.trigger(
        "room:reconnect",
        {
          roomCode: createAck?.room?.roomCode || "",
          playerId: joinAck?.player?.id || "",
          sessionToken: joinAck?.sessionToken || "",
        },
        (res) => {
          reconnAck = res;
        },
      );

      expect(reconnAck?.success).toBe(true);
      expect(reconnAck?.sessionToken).toBe(joinAck?.sessionToken);
      expect(reconnSocket.data.sessionToken).toBe(joinAck?.sessionToken);
    });
  });

  describe("Socket membership error isolation (ENH-005)", () => {
    it("isolates socket.join() error on room:create without failing operation ack", async () => {
      const socket = new TestSocket("sock_join_fail_create");
      vi.spyOn(socket, "join").mockRejectedValueOnce(new Error("Socket transport join error"));

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        socket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let ack: TestAckResponse | undefined;
      await socket.trigger(
        "room:create",
        { playerName: "Alice" },
        (res) => {
          ack = res;
        },
      );

      expect(ack?.success).toBe(true);
      expect(ack?.room).toBeDefined();

      const warnLog = logger.warnLogs.find(
        (l) =>
          l.context?.operation === "socket_room_membership_error" &&
          l.context?.action === "join",
      );
      expect(warnLog).toBeDefined();
    });

    it("isolates socket.join() error on room:join without failing operation ack", async () => {
      const { room } = await service.createRoom(
        { playerName: "Host", preferredColor: "w" },
        "sock_host",
      );

      const socket = new TestSocket("sock_join_fail_join");
      vi.spyOn(socket, "join").mockRejectedValueOnce(new Error("Socket transport join error"));

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        socket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let ack: TestAckResponse | undefined;
      await socket.trigger(
        "room:join",
        { roomCode: room.roomCode, playerName: "Guest" },
        (res) => {
          ack = res;
        },
      );

      expect(ack?.success).toBe(true);
      expect(ack?.room).toBeDefined();

      const warnLog = logger.warnLogs.find(
        (l) =>
          l.context?.operation === "socket_room_membership_error" &&
          l.context?.action === "join",
      );
      expect(warnLog).toBeDefined();
    });

    it("isolates socket.join() error on room:reconnect without failing operation ack and returns sessionToken (ENH-005, ENH-015)", async () => {
      const { room, player, sessionToken } = await service.createRoom(
        { playerName: "Host", preferredColor: "w" },
        "sock_host",
      );

      const socket = new TestSocket("sock_join_fail_recon");
      vi.spyOn(socket, "join").mockRejectedValueOnce(new Error("Socket transport reconnect join error"));

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        socket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let ack: TestAckResponse | undefined;
      await socket.trigger(
        "room:reconnect",
        { roomCode: room.roomCode, playerId: player.id, sessionToken },
        (res) => {
          ack = res;
        },
      );

      expect(ack?.success).toBe(true);
      expect(ack?.room).toBeDefined();
      expect(ack?.sessionToken).toBe(sessionToken);

      const warnLog = logger.warnLogs.find(
        (l) =>
          l.context?.operation === "socket_room_membership_error" &&
          l.context?.action === "join",
      );
      expect(warnLog).toBeDefined();
    });

    it("isolates socket.leave() error on room:leave without failing operation ack", async () => {
      const { room } = await service.createRoom(
        { playerName: "Host", preferredColor: "w" },
        "sock_leave_fail",
      );

      const socket = new TestSocket("sock_leave_fail");
      vi.spyOn(socket, "leave").mockRejectedValueOnce(new Error("Socket transport leave error"));

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        socket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let ack: TestAckResponse | undefined;
      await socket.trigger(
        "room:leave",
        { roomCode: room.roomCode },
        (res) => {
          ack = res;
        },
      );

      expect(ack?.success).toBe(true);

      const warnLog = logger.warnLogs.find(
        (l) =>
          l.context?.operation === "socket_room_membership_error" &&
          l.context?.action === "leave",
      );
      expect(warnLog).toBeDefined();
    });

    it("propagates context.correlationId into roomService methods (MAJ-017)", async () => {
      const createSpy = vi.spyOn(service, "createRoom");
      const joinSpy = vi.spyOn(service, "joinRoom");
      const reconnectSpy = vi.spyOn(service, "reconnect");
      const leaveSpy = vi.spyOn(service, "leaveRoom");

      let ack: TestAckResponse | undefined;
      await socket.trigger(
        "room:create",
        { playerName: "CorrelationHost", preferredColor: "w" },
        (res) => {
          ack = res;
        },
      );
      expect(createSpy).toHaveBeenCalledWith(
        expect.anything(),
        socket.id,
        expect.any(String),
      );
      const roomCode = ack?.room?.roomCode ?? "";

      const joinSocket = new TestSocket("sock_join_corr");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        joinSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let joinAck: TestAckResponse | undefined;
      await joinSocket.trigger(
        "room:join",
        { roomCode, playerName: "CorrelationGuest" },
        (res) => {
          joinAck = res;
        },
      );
      expect(joinSpy).toHaveBeenCalledWith(
        expect.anything(),
        joinSocket.id,
        expect.any(String),
      );

      await joinSocket.trigger(
        "room:reconnect",
        {
          roomCode,
          playerId: joinAck?.player?.id ?? "",
          sessionToken: joinAck?.sessionToken ?? "",
        },
        () => {},
      );
      expect(reconnectSpy).toHaveBeenCalledWith(
        expect.anything(),
        joinSocket.id,
        expect.any(String),
      );

      await joinSocket.trigger(
        "room:leave",
        { roomCode },
        () => {},
      );
      expect(leaveSpy).toHaveBeenCalledWith(
        roomCode,
        joinSocket.id,
        expect.any(String),
      );
    });

    it("logs 3-point lifecycle logs for game_abandoned in handleSocketDisconnect (MAJ-018)", async () => {
      const customLogger = new NullLogger();
      const mockService = {
        handleDisconnect: vi.fn().mockImplementation(
          async (_sockId, onForfeit) => {
            await onForfeit(
              {
                roomCode: "ABAND1",
                whitePlayer: { id: "p_white" },
                blackPlayer: { id: "p_black" },
              },
              { winner: "w", reason: "abandonment" },
              "job-corr-123",
              "p_black",
            );
            return {
              room: { roomCode: "ABAND1", status: "finished" },
              player: { id: "p_black", name: "Bob" },
              wasActiveGame: true,
            };
          },
        ),
      } as unknown as RoomService;

      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        "sock_disc_test",
        mockService,
        customLogger,
        60_000,
        undefined,
        undefined,
        "parent-corr-456",
      );

      const startLog = customLogger.infoLogs.find(
        (l) =>
          l.context?.operation === "game_abandoned" &&
          l.message === "Game forfeit processing started",
      );
      expect(startLog).toBeDefined();
      expect(startLog?.context?.correlationId).toBe("job-corr-123");
      expect(startLog?.context?.disconnectedPlayerId).toBe("p_black");

      const successLog = customLogger.infoLogs.find(
        (l) =>
          l.context?.operation === "game_abandoned" &&
          l.message === "Game forfeited by abandonment",
      );
      expect(successLog).toBeDefined();
      expect(successLog?.context?.durationMs).toBeDefined();

      expect(mockService.handleDisconnect).toHaveBeenCalledWith(
        "sock_disc_test",
        expect.any(Function),
        60_000,
        expect.anything(),
        "parent-corr-456",
      );
    });

    it("handles non-Error objects in safeSocketJoin and safeSocketLeave gracefully", async () => {
      const errSocket = new TestSocket("sock_non_error");
      vi.spyOn(errSocket, "join").mockRejectedValueOnce("non-error-string");
      vi.spyOn(errSocket, "leave").mockRejectedValueOnce({ custom: "fail" });

      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        errSocket as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let createAck: TestAckResponse | undefined;
      await errSocket.trigger(
        "room:create",
        { playerName: "NonErrHost", preferredColor: "w" },
        (res) => {
          createAck = res;
        },
      );
      const roomCode = createAck?.room?.roomCode ?? "";

      const joinWarn = logger.warnLogs.find(
        (l) =>
          l.context?.operation === "socket_room_membership_error" &&
          l.context?.action === "join" &&
          (l.context?.error as { raw?: unknown })?.raw === "non-error-string",
      );
      expect(joinWarn).toBeDefined();

      await errSocket.trigger(
        "room:leave",
        { roomCode },
        () => {},
      );

      const leaveWarn = logger.warnLogs.find(
        (l) =>
          l.context?.operation === "socket_room_membership_error" &&
          l.context?.action === "leave" &&
          (l.context?.error as { raw?: unknown })?.raw !== undefined,
      );
      expect(leaveWarn).toBeDefined();
    });

    it("handles fetchSockets error on room deletion when host leaves", async () => {
      const failingIo = {
        to: () => ({ emit: () => true }),
        in: () => ({
          fetchSockets: async () => {
            throw new Error("Cluster fetchSockets error");
          },
        }),
      } as unknown as TypedSocketServer;

      const { room } = await service.createRoom(
        { playerName: "HostFetchErr", preferredColor: "w" },
        "sock_host_fetch_err",
      );

      const hostSock = new TestSocket("sock_host_fetch_err");
      registerRoomSocketHandlers(
        failingIo,
        hostSock as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let ack: TestAckResponse | undefined;
      await hostSock.trigger(
        "room:leave",
        { roomCode: room.roomCode },
        (res) => {
          ack = res;
        },
      );

      expect(ack?.success).toBe(true);
      const warnLog = logger.warnLogs.find(
        (l) =>
          l.context?.operation === "socket_room_membership_error" &&
          l.context?.action === "fetch_and_leave",
      );
      expect(warnLog).toBeDefined();
      expect(warnLog?.context?.error).toEqual(
        expect.objectContaining({
          name: "Error",
          message: "Cluster fetchSockets error",
        }),
      );
    });

    it("evicts all fetched sockets from room when room is deleted on host leave", async () => {
      const s1 = { id: "s1", leave: vi.fn() };
      const s2 = { id: "s2", leave: vi.fn() };
      const multiIo = {
        to: () => ({ emit: () => true }),
        in: () => ({
          fetchSockets: async () => [s1, s2],
        }),
      } as unknown as TypedSocketServer;

      const { room } = await service.createRoom(
        { playerName: "HostEvict", preferredColor: "w" },
        "sock_host_evict",
      );

      const hostSock = new TestSocket("sock_host_evict");
      registerRoomSocketHandlers(
        multiIo,
        hostSock as unknown as Socket,
        service,
        logger,
        rateLimiter,
      );

      let ack: TestAckResponse | undefined;
      await hostSock.trigger(
        "room:leave",
        { roomCode: room.roomCode },
        (res) => {
          ack = res;
        },
      );

      expect(ack?.success).toBe(true);
      expect(s1.leave).toHaveBeenCalledWith(room.roomCode);
      expect(s2.leave).toHaveBeenCalledWith(room.roomCode);
    });

    it("evaluates winner === 'b' and undefined when forfeitedPlayerId is omitted in onForfeit", async () => {
      const customLogger = new NullLogger();
      let capturedOnForfeit: ((room: RoomState, payload: GameOverPayload) => Promise<void>) | undefined;
      const mockService = {
        handleDisconnect: vi.fn().mockImplementation(
          async (_sockId, onForfeit) => {
            capturedOnForfeit = onForfeit;
            return {
              room: { roomCode: "ROOMB", status: "finished" },
              player: { id: "p_white", name: "Alice" },
              wasActiveGame: true,
            };
          },
        ),
      } as unknown as RoomService;

      await handleSocketDisconnect(
        io as unknown as TypedSocketServer,
        "sock_b_test",
        mockService,
        customLogger,
      );

      expect(capturedOnForfeit).toBeDefined();

      // Case 1: winner is "b", whitePlayer forfeited
      await capturedOnForfeit!(
        {
          roomCode: "ROOMB",
          whitePlayer: { id: "p_white" },
          blackPlayer: { id: "p_black" },
        } as unknown as RoomState,
        { winner: "b", reason: "abandonment" },
      );

      const logB = customLogger.infoLogs.find(
        (l) =>
          l.context?.roomCode === "ROOMB" &&
          l.context?.disconnectedPlayerId === "p_white",
      );
      expect(logB).toBeDefined();

      // Case 2: winner is undefined / draw
      await capturedOnForfeit!(
        {
          roomCode: "ROOMB2",
          whitePlayer: { id: "p_white" },
          blackPlayer: { id: "p_black" },
        } as unknown as RoomState,
        { winner: undefined, reason: "abandonment" } as unknown as GameOverPayload,
      );

      const logDraw = customLogger.infoLogs.find(
        (l) =>
          l.context?.roomCode === "ROOMB2" &&
          l.context?.disconnectedPlayerId === undefined,
      );
      expect(logDraw).toBeDefined();
    });

    it("falls back to req.sessionToken in reconnect handler when result.sessionToken is undefined", async () => {
      const mockService = {
        reconnect: vi.fn().mockResolvedValue({
          room: { roomCode: "FALL", status: "playing" },
          player: { id: "p_recon", name: "Recon" },
          sessionToken: undefined,
        }),
      } as unknown as RoomService;

      const reconnSock = new TestSocket("sock_recon_fallback");
      registerRoomSocketHandlers(
        io as unknown as TypedSocketServer,
        reconnSock as unknown as Socket,
        mockService,
        logger,
        rateLimiter,
      );

      let ack: TestAckResponse | undefined;
      await reconnSock.trigger(
        "room:reconnect",
        {
          roomCode: "FALL",
          playerId: "4e8b6ec1-49b3-4bef-bef0-8eed1df14a50",
          sessionToken: "client_req_token",
        },
        (res) => {
          ack = res;
        },
      );

      expect(ack?.success).toBe(true);
      expect(ack?.sessionToken).toBe("client_req_token");
      expect(reconnSock.data.sessionToken).toBe("client_req_token");
    });
  });
});
