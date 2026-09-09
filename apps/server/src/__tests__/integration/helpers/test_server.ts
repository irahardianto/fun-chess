import type http from "node:http";
import type { HttpRateLimiter } from "../../../platform/http/index.js";
import {
  SocketRateLimiter,
  type TypedSocketServer,
} from "../../../platform/socket/index.js";
import { NullLogger } from "../../../platform/logger/index.js";
import type { Logger } from "../../../platform/logger/index.js";
import type { ServerEnv } from "../../../platform/config/index.js";
import type {
  InMemoryRoomStore,
  InMemorySessionRegistry,
  RoomService,
  IDisconnectTimerRegistry,
} from "../../../features/rooms/index.js";
import type { GameService } from "../../../features/game/index.js";
import {
  startServer,
  type ServerInstance,
} from "../../../index.js";

export interface TestServerInstance extends ServerInstance {
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
  roomCreateRateLimiter?: SocketRateLimiter;
}

export const defaultTestRoomCreateRateLimiter = new SocketRateLimiter({
  maxRequests: 3,
  windowMs: 60_000,
  pruneIntervalMs: 0,
});

/**
 * Resets socket rate limiter tracking entries to prevent cross-test interference.
 */
export function resetTestRateLimiters(): void {
  defaultTestRoomCreateRateLimiter.clear();
}

/**
 * Creates, configures, and starts a test server using the production composition root (ENH-007).
 * Deduplicates shared test server creation logic, ensuring it uses consistent factory patterns
 * aligned with the production composition root.
 */
export async function createTestServer(
  customPortOrOptions: number | CreateTestServerOptions = 0,
): Promise<TestServerInstance> {
  resetTestRateLimiters();
  const options: CreateTestServerOptions =
    typeof customPortOrOptions === "number"
      ? { customPort: customPortOrOptions }
      : customPortOrOptions;

  const testLogger = (options.logger as NullLogger) ?? new NullLogger();

  // Test rate limiter with high capacity and disabled prune interval to prevent timer leaks
  const testSocketRateLimiter = new SocketRateLimiter({
    maxRequests: 10_000,
    windowMs: 60_000,
    pruneIntervalMs: 0,
  });

  const roomCreateLimiter =
    options.roomCreateRateLimiter ?? defaultTestRoomCreateRateLimiter;

  const serverInstance = await startServer({
    port: options.customPort ?? 0,
    host: "127.0.0.1",
    logger: testLogger,
    config: {
      NODE_ENV: "test",
      ...options.env,
    },
    allowedOrigins: options.allowedOrigins,
    httpRateLimiter: options.rateLimiter,
    socketRateLimiter: testSocketRateLimiter,
    roomCreateRateLimiter: roomCreateLimiter,
  });

  return {
    ...serverInstance,
    roomStore: serverInstance.roomStore as InMemoryRoomStore,
    sessionRegistry: serverInstance.sessionRegistry as InMemorySessionRegistry,
    roomService: serverInstance.roomService as RoomService,
    gameService: serverInstance.gameService as GameService,
    timerRegistry: serverInstance.timerRegistry,
    logger: testLogger,
  };
}
