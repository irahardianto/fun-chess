import type {
  CreateRoomRequest,
  JoinRoomRequest,
  Player,
  ReconnectRequest,
  RoomState,
  GameOverPayload,
  GameState,
} from "@fun-chess/shared";

import type { IDisconnectTimerRegistry } from "./disconnect_timer_registry.js";

/**
 * Public service contract for room lifecycle management.
 */
export interface IRoomService {
  createRoom(
    req: CreateRoomRequest,
    socketId: string,
  ): Promise<{ room: RoomState; player: Player; sessionToken: string }>;

  joinRoom(
    req: JoinRoomRequest,
    socketId: string,
  ): Promise<{ room: RoomState; player: Player; sessionToken: string }>;

  reconnect(
    req: ReconnectRequest,
    socketId: string,
  ): Promise<{ room: RoomState; player: Player }>;

  leaveRoom(
    roomCode: string,
    socketId: string,
  ): Promise<{
    room: RoomState;
    player: Player;
    shouldDelete: boolean;
    gameOverPayload?: GameOverPayload;
  }>;

  handleDisconnect(
    socketId: string,
    onForfeit?: (room: RoomState, gameOverPayload: GameOverPayload) => void | Promise<void>,
    gracePeriodMs?: number,
    timerRegistry?: IDisconnectTimerRegistry,
  ): Promise<{
    room: RoomState;
    player: Player;
    wasActiveGame: boolean;
  } | null>;

  handleAbandonmentForfeit(
    roomCode: string,
    disconnectedPlayerId: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload } | null>;

  getRoom(roomCode: string): Promise<RoomState | null>;

  cleanupAbandonedRooms(maxAgeMs?: number): Promise<number>;
}

/**
 * Explicit contract exposed by the Rooms feature for Game execution.
 * Prevents GameService from touching RoomStore directly (MAJ-017).
 */
export interface IRoomGameAdapter {
  /**
   * Retrieves a read-only snapshot of current room state.
   */
  getRoom(roomCode: string): Promise<RoomState | null>;

  /**
   * Applies an executed chess move and state update to the room under exclusive lock.
   */
  applyGameMove(
    roomCode: string,
    nextGameState: GameState,
    gameOverPayload?: GameOverPayload,
  ): Promise<RoomState>;

  /**
   * Finalizes a match with an explicit game-over payload (resignation, timeout, draw).
   */
  finalizeGame(
    roomCode: string,
    gameOverPayload: GameOverPayload,
  ): Promise<RoomState>;

  /**
   * Records a proposed draw offer or response in the room state.
   */
  updateDrawOffer(
    roomCode: string,
    drawOffer: RoomState["drawOffer"],
  ): Promise<RoomState>;

  /**
   * Records a rematch proposal or acceptance in the room state.
   */
  updateRematch(
    roomCode: string,
    rematch: RoomState["rematch"],
    newGameState?: GameState,
    players?: { whitePlayer: Player | null; blackPlayer: Player | null },
  ): Promise<RoomState>;
}
