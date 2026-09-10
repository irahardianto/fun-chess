import {
  type GameOverPayload,
  type GameState,
  type MakeMoveRequest,
  type Player,
  type RoomState,
  systemClock,
  type IClock,
  type IIdGenerator,
} from "@fun-chess/shared";
import type { IRoomGameAdapter, ISessionRegistry } from "../rooms/index.js";
import { type Logger, defaultLogger } from "../../platform/logger/index.js";
import {
  type IGameService,
  type MoveApplicationResult,
} from "./game.interface.js";
import {
  type IGamePlayerResolver,
  GamePlayerResolver,
} from "./game_player_resolver.js";
import {
  type IGameMoveCoordinator,
  GameMoveCoordinator,
} from "./game_move_coordinator.js";
import {
  type IGameActionCoordinator,
  GameActionCoordinator,
} from "./game_action_coordinator.js";

export type { MoveApplicationResult };

/**
 * Service orchestrating chess game actions (moves, resignations, draws, and rematches).
 * Delegates all room persistence and mutation operations strictly through IRoomGameAdapter (MAJ-012).
 * Architectural coordinator delegating to GamePlayerResolver, GameMoveCoordinator, and GameActionCoordinator.
 */
export class GameService implements IGameService {
  public readonly playerResolver: IGamePlayerResolver;
  public readonly moveCoordinator: IGameMoveCoordinator;
  public readonly actionCoordinator: IGameActionCoordinator;

  constructor(
    roomAdapter: IRoomGameAdapter,
    clock: IClock,
    idGenerator: IIdGenerator,
    logger: Logger,
    sessionRegistry?: ISessionRegistry,
    playerResolver?: IGamePlayerResolver,
    moveCoordinator?: IGameMoveCoordinator,
    actionCoordinator?: IGameActionCoordinator,
  );
  /**
   * @deprecated Legacy signature for interim compatibility prior to SC-5 composition root wiring.
   */
  constructor(
    roomAdapter: IRoomGameAdapter,
    clock?: IClock,
    idGenerator?: IIdGenerator,
    loggerOrSessionRegistry?: Logger | ISessionRegistry,
    sessionRegistry?: ISessionRegistry,
    playerResolver?: IGamePlayerResolver,
    moveCoordinator?: IGameMoveCoordinator,
    actionCoordinator?: IGameActionCoordinator,
  );
  constructor(
    roomAdapter: IRoomGameAdapter,
    clock?: IClock,
    _idGenerator?: IIdGenerator,
    loggerOrSessionRegistry?: Logger | ISessionRegistry,
    sessionRegistry?: ISessionRegistry,
    playerResolver?: IGamePlayerResolver,
    moveCoordinator?: IGameMoveCoordinator,
    actionCoordinator?: IGameActionCoordinator,
  ) {
    const resolvedClock = clock ?? systemClock;
    let resolvedLogger: Logger;
    let resolvedSessionRegistry: ISessionRegistry | undefined;

    if (
      loggerOrSessionRegistry &&
      "info" in loggerOrSessionRegistry &&
      typeof loggerOrSessionRegistry.info === "function"
    ) {
      resolvedLogger = loggerOrSessionRegistry as Logger;
      resolvedSessionRegistry = sessionRegistry;
    } else {
      resolvedLogger = defaultLogger;
      resolvedSessionRegistry = loggerOrSessionRegistry as
        ISessionRegistry | undefined;
    }

    this.playerResolver =
      playerResolver ??
      new GamePlayerResolver(
        roomAdapter,
        resolvedSessionRegistry,
        resolvedLogger,
      );

    this.moveCoordinator =
      moveCoordinator ??
      new GameMoveCoordinator(
        roomAdapter,
        resolvedClock,
        resolvedLogger,
        this.playerResolver,
        resolvedSessionRegistry,
      );

    this.actionCoordinator =
      actionCoordinator ??
      new GameActionCoordinator(
        roomAdapter,
        resolvedClock,
        resolvedLogger,
        this.playerResolver,
      );
  }

  /**
   * Validates and applies a move from a player socket through GameMoveCoordinator.
   */
  public makeMove(
    req: MakeMoveRequest,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<MoveApplicationResult> {
    return this.moveCoordinator.makeMove(
      req,
      socketId,
      correlationId,
      sessionToken,
    );
  }

  /**
   * Concedes active match to the opponent through GameActionCoordinator.
   */
  public resign(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload }> {
    return this.actionCoordinator.resign(
      roomCode,
      socketId,
      correlationId,
      sessionToken,
    );
  }

  /**
   * Proposes a peaceful draw to opponent through GameActionCoordinator.
   */
  public offerDraw(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{
    room: RoomState;
    fromPlayer: Player;
    opponentPlayer: Player | null;
  }> {
    return this.actionCoordinator.offerDraw(
      roomCode,
      socketId,
      correlationId,
      sessionToken,
    );
  }

  /**
   * Responds to draw offer through GameActionCoordinator.
   */
  public respondDraw(
    roomCode: string,
    socketId: string,
    accept: boolean,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{
    room: RoomState;
    accept: boolean;
    byPlayerId: string;
    gameOverPayload?: GameOverPayload;
  }> {
    return this.actionCoordinator.respondDraw(
      roomCode,
      socketId,
      accept,
      correlationId,
      sessionToken,
    );
  }

  /**
   * Initiates a rematch request following game over through GameActionCoordinator.
   */
  public requestRematch(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{ room: RoomState; requestedBy: string; requesterName: string }> {
    return this.actionCoordinator.requestRematch(
      roomCode,
      socketId,
      correlationId,
      sessionToken,
    );
  }

  /**
   * Accepts or declines rematch proposal through GameActionCoordinator.
   */
  public respondRematch(
    roomCode: string,
    socketId: string,
    accept: boolean,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{
    room: RoomState;
    accept: boolean;
    byPlayerId: string;
    nextGameState?: GameState;
  }> {
    return this.actionCoordinator.respondRematch(
      roomCode,
      socketId,
      accept,
      correlationId,
      sessionToken,
    );
  }
}
