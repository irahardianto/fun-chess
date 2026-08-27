import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerRoomSocketHandlers,
  handleSocketDisconnect,
  cancelDisconnectTimer,
  clearAllDisconnectTimers,
} from "../room.socket_handler.js";
import { RoomService } from "../room.service.js";
import { MockRoomStore } from "../mock_room.store.js";
import { NullLogger } from "../../../platform/logger/null_logger.js";
import { TypedSocketServer } from "../../../platform/socket/socket_server.js";
import { Socket } from "socket.io";

class TestSocket {
  public id: string;
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
  let service: RoomService;
  let logger: NullLogger;
  let io: TestIo;
  let socket: TestSocket;

  beforeEach(() => {
    store = new MockRoomStore();
    service = new RoomService(store);
    logger = new NullLogger();
    io = new TestIo();
    socket = new TestSocket("sock_host");
    clearAllDisconnectTimers();

    registerRoomSocketHandlers(
      io as unknown as TypedSocketServer,
      socket as unknown as Socket,
      service,
      logger,
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
  });

  describe("room:reconnect", () => {
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
  });

  describe("room:leave", () => {
    it("leaves room channel, removes player, and emits room:player_left if non-host leaves", async () => {
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

      const leftEmit = bobSocket.toEmits.find(
        (e) => e.event === "room:player_left",
      );
      expect(leftEmit).toBeDefined();
      expect((leftEmit?.payload as any).playerName).toBe("Bob");
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
  });
});
