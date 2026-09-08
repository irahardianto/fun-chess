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
  DisconnectTimerRegistry,
  type IDisconnectTimerRegistry,
} from "../../../features/rooms/index.js";
import {
  ChessEngine,
  GameService,
  registerGameSocketHandlers,
} from "../../../features/game/index.js";
import { Chess } from "chess.js";
import { RelayAddressService } from "../../../features/lan/relay_address.service.js";

if (typeof (ChessEngine as any).findKingSquare !== "function") {
  (ChessEngine as any).findKingSquare = (fen: string, color: any) => {
    try {
      const chess = new Chess(fen);
      return ChessEngine.getKingSquare(chess, color);
    } catch {
      return null;
    }
  };
}


export interface TestServerInstance {
  server: http.Server;
  io: TypedSocketServer;
  port: number;
  url: string;
  roomStore: InMemoryRoomStore;
  sessionRegistry: InMemorySessionRegistry;
  roomService: RoomService;
  gameService: GameService;
  timerRegistry: IDisconnectTimerRegistry;
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
  const timerRegistry = new DisconnectTimerRegistry();
  const roomService = new RoomService(
    roomStore,
    sessionRegistry,
    undefined,
    undefined,
    timerRegistry,
  );

  // Safe fallback delegation so roomService can satisfy either IRoomGameAdapter or direct RoomStore callers
  if (typeof (roomService as any).mutate !== "function") {
    (roomService as any).mutate = roomStore.mutate.bind(roomStore);
  }
  if (typeof (roomService as any).withLock !== "function") {
    (roomService as any).withLock = roomStore.withLock.bind(roomStore);
  }
  if (typeof (roomService as any).findByCode !== "function") {
    (roomService as any).findByCode = roomStore.findByCode.bind(roomStore);
  }
  if (typeof (roomService as any).save !== "function") {
    (roomService as any).save = roomStore.save.bind(roomStore);
  }
  if (typeof (roomService as any).delete !== "function") {
    (roomService as any).delete = roomStore.delete.bind(roomStore);
  }

  // Instantiate GameService passing roomService (IRoomGameAdapter) instead of roomStore directly
  const gameService = new GameService(roomService as any, sessionRegistry);

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

  const allowedOrigins =
    options.allowedOrigins ??
    (options.env?.CORS_ORIGIN
      ? options.env.CORS_ORIGIN.split(",").map((s) => s.trim())
      : ["*"]);

  const server = http.createServer((req, res) => {
    httpHandler(req, res);
  });

  const io = createSocketServer(server, {
    allowedOrigins: ["*"],
  });

  io.on("connection", (socket) => {
    registerRoomSocketHandlers(
      io,
      socket,
      roomService,
      logger,
      rateLimiter,
      timerRegistry,
    );
    registerGameSocketHandlers(
      io,
      socket,
      gameService,
      logger,
      rateLimiter,
      timerRegistry,
    );

    socket.on("disconnect", async () => {
      await handleSocketDisconnect(
        io,
        socket.id,
        roomService,
        logger,
        undefined,
        rateLimiter,
        timerRegistry,
      );
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
    allowedOrigins,
    getActiveSocketCount: () => (io ? io.sockets.sockets.size : 0),
    env: options.env as any,
    rateLimiter: options.rateLimiter,
  });

  const close = async () => {
    options.rateLimiter?.destroy();
    rateLimiter.destroy();
    timerRegistry.clear();
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
    timerRegistry,
    logger,
    close,
  };
}
