import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createHttpServer, HttpRateLimiter } from "../../../platform/http/index.js";
import {
  createSocketServer,
  SocketRateLimiter,
  TypedSocketServer,
} from "../../../platform/socket/index.js";
import { NullLogger } from "../../../platform/logger/index.js";
import type { Logger } from "../../../platform/logger/index.js";
import type { ServerEnv } from "../../../platform/config/index.js";
import {
  InMemoryRoomStore,
  InMemorySessionRegistry,
  RoomService,
  registerRoomSocketHandlers,
  handleSocketDisconnect,
  clearAllDisconnectTimers,
} from "../../../features/rooms/index.js";
import {
  GameService,
  registerGameSocketHandlers,
} from "../../../features/game/index.js";
import { RelayAddressService } from "../../../features/lan/index.js";

export interface TestServerInstance {
  server: http.Server;
  io: TypedSocketServer;
  port: number;
  url: string;
  roomStore: InMemoryRoomStore;
  sessionRegistry: InMemorySessionRegistry;
  roomService: RoomService;
  gameService: GameService;
  logger: NullLogger;
  close: () => Promise<void>;
}

export interface CreateTestServerOptions {
  customPort?: number;
  env?: Partial<ServerEnv>;
  logger?: Logger;
  allowedOrigins?: string[];
  rateLimiter?: HttpRateLimiter;
}

/**
 * Creates, configures, and starts a test server using the real production server modules.
 * Replaces the former 1,146-line shadow server implementation to ensure contract and integration
 * tests exercise production backend behavior directly (CRIT-004).
 */
export async function createTestServer(
  customPortOrOptions: number | CreateTestServerOptions = 0,
): Promise<TestServerInstance> {
  const options: CreateTestServerOptions =
    typeof customPortOrOptions === "number"
      ? { customPort: customPortOrOptions }
      : customPortOrOptions;

  const customPort = options.customPort ?? 0;
  const logger = (options.logger as NullLogger) ?? new NullLogger();
  const roomStore = new InMemoryRoomStore();
  const sessionRegistry = new InMemorySessionRegistry();
  const roomService = new RoomService(roomStore, sessionRegistry);
  const gameService = new GameService(roomStore, sessionRegistry);

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

  const clientDistPath = path.resolve(
    process.cwd().endsWith("apps/server")
      ? path.resolve(process.cwd(), "../client/dist")
      : path.resolve(process.cwd(), "apps/client/dist"),
  );

  httpHandler = createHttpServer({
    roomStore,
    relayAddressService,
    logger,
    port: assignedPort,
    distPath: clientDistPath,
    allowedOrigins: options.allowedOrigins ?? ["*"],
    getActiveSocketCount: () => (io ? io.sockets.sockets.size : 0),
    env: options.env as any,
    rateLimiter: options.rateLimiter,
  });

  const close = async () => {
    options.rateLimiter?.destroy();
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
    logger,
    close,
  };
}
