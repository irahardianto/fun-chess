import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createHttpServer } from "../../apps/server/src/platform/http/index.js";
import {
  createSocketServer,
  SocketRateLimiter,
  TypedSocketServer,
} from "../../apps/server/src/platform/socket/index.js";
import { NullLogger } from "../../apps/server/src/platform/logger/index.js";
import {
  InMemoryRoomStore,
  InMemorySessionRegistry,
  RoomService,
  registerRoomSocketHandlers,
  handleSocketDisconnect,
  clearAllDisconnectTimers,
} from "../../apps/server/src/features/rooms/index.js";
import {
  GameService,
  registerGameSocketHandlers,
} from "../../apps/server/src/features/game/index.js";
import { RelayAddressService } from "../../apps/server/src/features/lan/index.js";

export interface TestServerInstance {
  server: http.Server;
  io: TypedSocketServer;
  port: number;
  url: string;
  roomStore: InMemoryRoomStore;
  sessionRegistry: InMemorySessionRegistry;
  roomService: RoomService;
  gameService: GameService;
  close: () => Promise<void>;
}

/**
 * Creates, configures, and starts a test server using the real production server modules.
 * Replaces the former 1,146-line shadow server implementation to ensure contract and integration
 * tests exercise production backend behavior directly (CRIT-004).
 */
export async function createTestServer(
  customPort = 0,
): Promise<TestServerInstance> {
  const logger = new NullLogger();
  const roomStore = new InMemoryRoomStore();
  const sessionRegistry = new InMemorySessionRegistry();
  const roomService = new RoomService(roomStore, sessionRegistry);
  const gameService = new GameService(roomStore);

  // Rate limiter for tests: high capacity and disabled background interval to prevent timer leaks
  const rateLimiter = new SocketRateLimiter({
    maxRequests: 10_000,
    windowMs: 60_000,
    pruneIntervalMs: 0,
  });

  // Delegate request listener so HTTP requests can route to createHttpServer
  // after the ephemeral port has been bound.
  let httpHandler: http.RequestListener = (_req, res) => {
    res.writeHead(503);
    res.end("Server initializing");
  };

  const server = http.createServer((req, res) => {
    httpHandler(req, res);
  });

  const io = createSocketServer(server, {
    allowedOrigins: ["*"],
  });

  io.on("connection", (socket) => {
    registerRoomSocketHandlers(io, socket, roomService, logger, rateLimiter);
    registerGameSocketHandlers(io, socket, gameService, logger);

    socket.on("disconnect", async () => {
      await handleSocketDisconnect(io, socket.id, roomService, logger);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(customPort, "127.0.0.1", () => resolve());
  });

  const address = server.address() as net.AddressInfo;
  const assignedPort = address.port;
  const url = `http://127.0.0.1:${assignedPort}`;

  const relayAddressService = new RelayAddressService({
    host: "127.0.0.1",
    port: assignedPort,
    lanIp: "127.0.0.1",
  });

  httpHandler = createHttpServer({
    roomStore,
    relayAddressService,
    logger,
    port: assignedPort,
    distPath: path.resolve(process.cwd(), "apps/client/dist"),
    allowedOrigins: ["*"],
    getActiveSocketCount: () => (io ? io.sockets.sockets.size : 0),
  });

  const close = async () => {
    clearAllDisconnectTimers();
    const sockets = await io.fetchSockets();
    for (const s of sockets) {
      s.disconnect(true);
    }
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return {
    server,
    io,
    port: assignedPort,
    url,
    roomStore,
    sessionRegistry,
    roomService,
    gameService,
    close,
  };
}
