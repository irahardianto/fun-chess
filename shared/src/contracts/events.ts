import {
  GameState,
  GameOverPayload,
  MovePayload,
  MoveResult,
  PieceColor,
  Player,
  RoomState,
} from "./models.js";
import { SocketErrorPayload } from "./errors.js";

export interface CreateRoomRequest {
  playerName: string; // 1-20 characters, sanitized
  preferredColor?: "w" | "b" | "random"; // Default: 'random'
  avatar?: string; // Selected avatar emoji
}

export interface JoinRoomRequest {
  roomCode: string; // 4-character uppercase alphanumeric
  playerName: string; // 1-20 characters, sanitized
  avatar?: string; // Selected avatar emoji
}

export interface ReconnectRequest {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface LeaveRoomRequest {
  roomCode: string;
}

export interface MakeMoveRequest {
  roomCode: string;
  move: MovePayload;
}

export interface ResignRequest {
  roomCode: string;
}

export interface OfferDrawRequest {
  roomCode: string;
}

export interface RespondDrawRequest {
  roomCode: string;
  accept: boolean;
}

export interface RequestRematchRequest {
  roomCode: string;
}

export interface RespondRematchRequest {
  roomCode: string;
  accept: boolean;
}

export interface ServerToClientEvents {
  "room:created": (room: RoomState) => void;
  "room:joined": (room: RoomState) => void;
  "room:player_joined": (data: { player: Player; room: RoomState }) => void;
  "room:player_left": (data: {
    playerId: string;
    playerName: string;
    reason: string;
  }) => void;
  "room:player_disconnected": (data: {
    playerId: string;
    gracePeriodMs: number;
  }) => void;
  "room:player_reconnected": (data: {
    playerId: string;
    playerName: string;
  }) => void;
  "game:started": (gameState: GameState) => void;
  "game:moved": (data: { move: MoveResult; gameState: GameState }) => void;
  "game:check": (data: { inCheck: PieceColor; kingSquare: string }) => void;
  "game:over": (data: GameOverPayload) => void;
  "game:draw_offered": (data: {
    fromPlayerId: string;
    fromPlayerName: string;
  }) => void;
  "game:draw_declined": (data: { byPlayerId: string }) => void;
  "game:rematch_requested": (data: {
    requestedBy: string;
    requesterName: string;
  }) => void;
  "game:rematch_started": (data: {
    gameState: GameState;
    room: RoomState;
  }) => void;
  "game:rematch_declined": (data: { byPlayerId: string }) => void;
  error: (error: SocketErrorPayload) => void;
}

export interface ClientToServerEvents {
  "room:create": (
    req: CreateRoomRequest,
    callback?: (
      res:
        | { success: true; room: RoomState; sessionToken: string }
        | { success: false; error: SocketErrorPayload },
    ) => void,
  ) => void;
  "room:join": (
    req: JoinRoomRequest,
    callback?: (
      res:
        | {
            success: true;
            room: RoomState;
            player: Player;
            sessionToken: string;
          }
        | { success: false; error: SocketErrorPayload },
    ) => void,
  ) => void;
  "room:reconnect": (
    req: ReconnectRequest,
    callback?: (
      res:
        | { success: true; room: RoomState; player: Player }
        | { success: false; error: SocketErrorPayload },
    ) => void,
  ) => void;
  "room:leave": (req: LeaveRoomRequest) => void;
  "game:move": (
    req: MakeMoveRequest,
    callback?: (
      res:
        | { success: true; moveResult: MoveResult }
        | { success: false; error: SocketErrorPayload },
    ) => void,
  ) => void;
  "game:resign": (req: ResignRequest) => void;
  "game:offer_draw": (req: OfferDrawRequest) => void;
  "game:respond_draw": (req: RespondDrawRequest) => void;
  "game:request_rematch": (req: RequestRematchRequest) => void;
  "game:respond_rematch": (req: RespondRematchRequest) => void;
}
