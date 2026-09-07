import type {
  CreateRoomRequest,
  JoinRoomRequest,
  Player,
  ReconnectRequest,
  RoomState,
  GameOverPayload,
} from "@fun-chess/shared";

/**
 * Public service contract for room lifecycle management.
 */
export interface IRoomService {
  createRoom(
    req: CreateRoomRequest,
    socketId: string,
  ): Promise<{ room: RoomState; sessionToken: string }>;

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

  handleDisconnect(socketId: string): Promise<{
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
