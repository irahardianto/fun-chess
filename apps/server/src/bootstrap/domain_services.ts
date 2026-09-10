import {
  type IClock,
  type IIdGenerator,
} from "@fun-chess/shared";
import {
  SystemClock,
  UuidGenerator,
} from "../platform/time/index.js";
import {
  InMemoryRoomStore,
  type RoomStore,
  MAX_ROOMS,
  RoomService,
  type IRoomService,
  DisconnectTimerRegistry,
  type IDisconnectTimerRegistry,
  InMemorySessionRegistry,
  type SessionRegistry,
  type ITimerService,
  SystemTimerService,
} from "../features/rooms/index.js";
import {
  GameService,
  type IGameService,
} from "../features/game/index.js";
import {
  RelayAddressService,
  type IRelayAddressService,
} from "../features/lan/index.js";
import {
  type Logger,
  defaultLogger,
} from "../platform/logger/index.js";
import type { ServerEnv } from "../platform/config/index.js";
import type { IFileStorage, HttpRateLimiter } from "../platform/http/index.js";
import type { SocketRateLimiter } from "../platform/socket/index.js";

export interface StartServerOptions {
  config?: Partial<ServerEnv>;
  port?: number;
  host?: string;
  logger?: Logger;
  roomStore?: RoomStore;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  sessionRegistry?: SessionRegistry;
  distPath?: string;
  fileStorage?: IFileStorage;
  autoListen?: boolean;
  timerRegistry?: IDisconnectTimerRegistry;
  timerService?: ITimerService;
  onExit?: (code: number) => void;
  relayAddressService?: IRelayAddressService;
  allowedOrigins?: string[];
  httpRateLimiter?: HttpRateLimiter;
  socketRateLimiter?: SocketRateLimiter;
  roomCreateRateLimiter?: SocketRateLimiter;
}

export interface DomainServices {
  timerRegistry: IDisconnectTimerRegistry;
  timerService: ITimerService;
  roomStore: RoomStore;
  clock: IClock;
  idGenerator: IIdGenerator;
  sessionRegistry: SessionRegistry;
  roomService: IRoomService;
  gameService: IGameService;
  relayAddressService: IRelayAddressService;
}

/**
 * Initializes domain storage adapters, business logic services, and network addressing (MAJ-031).
 */
export function setupDomainServices(
  options: StartServerOptions,
  env: ServerEnv,
  port: number,
  logger?: Logger,
): DomainServices {
  const resolvedLogger = logger ?? options.logger ?? defaultLogger;
  const timerRegistry = options.timerRegistry ?? new DisconnectTimerRegistry();
  const timerService = options.timerService ?? new SystemTimerService();
  const clock = options.clock ?? new SystemClock();
  const idGenerator = options.idGenerator ?? new UuidGenerator();
  const sessionSecret =
    env.SESSION_SECRET ?? "default-fun-chess-dev-secret-key-32b";
  const sessionRegistry =
    options.sessionRegistry ??
    new InMemorySessionRegistry(
      clock,
      idGenerator,
      resolvedLogger,
      sessionSecret,
      env.NODE_ENV === "production",
    );
  const roomStore =
    options.roomStore ??
    new InMemoryRoomStore({
      clock,
      logger: resolvedLogger,
      maxRooms: env.MAX_ROOMS ?? MAX_ROOMS,
      maxCancelledTickets: 5_000,
    });
  const roomService = new RoomService(
    roomStore,
    sessionRegistry,
    clock,
    idGenerator,
    timerRegistry,
    resolvedLogger,
    timerService,
  );
  const gameService = new GameService(
    roomService,
    clock,
    idGenerator,
    resolvedLogger,
    sessionRegistry,
  );
  const relayAddressService =
    options.relayAddressService ??
    new RelayAddressService({
      publicUrl: env.PUBLIC_URL,
      host: env.HOST,
      port,
      lanIp: env.LAN_IP,
      hostIp: env.HOST_IP,
    });

  return {
    timerRegistry,
    timerService,
    roomStore,
    clock,
    idGenerator,
    sessionRegistry,
    roomService,
    gameService,
    relayAddressService,
  };
}
