import type {
  GameState,
  MakeMoveRequest,
  MoveResult,
  PieceColor,
  Player,
  RoomState,
  GameOverPayload,
} from "@fun-chess/shared";

export interface MoveApplicationResult {
  room: RoomState;
  moveResult: MoveResult;
  gameState: GameState;
  checkInfo?: { inCheck: PieceColor; kingSquare: string };
  gameOverPayload?: GameOverPayload;
}

/**
 * Public service contract for gameplay actions (moves, resignations, draws, and rematches).
 */
export interface IGameService {
  makeMove(
    req: MakeMoveRequest,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<MoveApplicationResult>;

  resign(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload }>;

  offerDraw(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{
    room: RoomState;
    fromPlayer: Player;
    opponentPlayer: Player | null;
  }>;

  respondDraw(
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
  }>;

  requestRematch(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{ room: RoomState; requestedBy: string; requesterName: string }>;

  respondRematch(
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
  }>;
}
