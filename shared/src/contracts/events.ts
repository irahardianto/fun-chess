import {
  GameState,
  GameOverPayload,
  MoveResult,
  PieceColor,
  Player,
  RoomState,
} from "./models.js";
import { SocketErrorPayload } from "./errors.js";
import {
  CreateRoomRequest,
  JoinRoomRequest,
  ReconnectRequest,
  LeaveRoomRequest,
  MakeMoveRequest,
  ResignRequest,
  OfferDrawRequest,
  RespondDrawRequest,
  RequestRematchRequest,
  RespondRematchRequest,
} from "./schemas.js";

export type {
  CreateRoomRequest,
  JoinRoomRequest,
  ReconnectRequest,
  LeaveRoomRequest,
  MakeMoveRequest,
  ResignRequest,
  OfferDrawRequest,
  RespondDrawRequest,
  RequestRematchRequest,
  RespondRematchRequest,
};

/**
 * Contract defining all events pushed from Server to Client via Socket.io.
 */
export interface ServerToClientEvents {
  /** Emitted to the creator when a new room is successfully created */
  "room:created": (room: RoomState) => void;
  /** Emitted to joining client when room join succeeds */
  "room:joined": (room: RoomState) => void;
  /** Broadcast to room members when a player joins the room */
  "room:player_joined": (data: { player: Player; room: RoomState }) => void;
  /** Broadcast to room members when a player leaves the room */
  "room:player_left": (data: {
    playerId: string;
    playerName: string;
    reason: string;
  }) => void;
  /** Broadcast when a player disconnects, specifying the reconnection grace period */
  "room:player_disconnected": (data: {
    playerId: string;
    gracePeriodMs: number;
  }) => void;
  /** Broadcast when a previously disconnected player successfully re-establishes connection */
  "room:player_reconnected": (data: {
    playerId: string;
    playerName: string;
  }) => void;
  /** Broadcast when a match begins */
  "game:started": (gameState: GameState) => void;
  /** Broadcast after each valid move, containing move details and updated game state */
  "game:moved": (data: { move: MoveResult; gameState: GameState }) => void;
  /** Broadcast when a move places a king in check */
  "game:check": (data: { inCheck: PieceColor; kingSquare: string }) => void;
  /** Broadcast when a match reaches game over (checkmate, draw, resign, timeout) */
  "game:over": (data: GameOverPayload) => void;
  /** Broadcast to opponent when a draw offer is initiated */
  "game:draw_offered": (data: {
    fromPlayerId: string;
    fromPlayerName: string;
  }) => void;
  /** Broadcast when a draw offer is declined */
  "game:draw_declined": (data: { byPlayerId: string }) => void;
  /** Broadcast when a player requests a rematch */
  "game:rematch_requested": (data: {
    requestedBy: string;
    requesterName: string;
  }) => void;
  /** Broadcast when both players accept a rematch and a new game starts */
  "game:rematch_started": (data: {
    gameState: GameState;
    room: RoomState;
  }) => void;
  /** Broadcast when a rematch request is declined */
  "game:rematch_declined": (data: { byPlayerId: string }) => void;
  /** Emitted to client when an unacknowledged socket operation encounters an error */
  error: (error: SocketErrorPayload) => void;
}

/**
 * Contract defining all events sent from Client to Server via Socket.io.
 */
export interface ClientToServerEvents {
  /** Creates a new game room; returns private session credentials in ack callback */
  "room:create": (
    req: CreateRoomRequest,
    callback?: (
      res:
        | { success: true; room: RoomState; sessionToken: string }
        | { success: false; error: SocketErrorPayload },
    ) => void,
  ) => void;
  /** Joins an existing game room; returns private session credentials in ack callback */
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
  /** Re-authenticates an interrupted session using private credentials */
  "room:reconnect": (
    req: ReconnectRequest,
    callback?: (
      res:
        | { success: true; room: RoomState; player: Player }
        | { success: false; error: SocketErrorPayload },
    ) => void,
  ) => void;
  /** Voluntarily leaves a room */
  "room:leave": (req: LeaveRoomRequest) => void;
  /** Executes a chess move in an active match */
  "game:move": (
    req: MakeMoveRequest,
    callback?: (
      res:
        | { success: true; moveResult: MoveResult }
        | { success: false; error: SocketErrorPayload },
    ) => void,
  ) => void;
  /** Resigns from an active game */
  "game:resign": (req: ResignRequest) => void;
  /** Offers a draw to the opponent */
  "game:offer_draw": (req: OfferDrawRequest) => void;
  /** Accepts or declines a received draw offer */
  "game:respond_draw": (req: RespondDrawRequest) => void;
  /** Requests a rematch after game conclusion */
  "game:request_rematch": (req: RequestRematchRequest) => void;
  /** Accepts or declines a received rematch request */
  "game:respond_rematch": (req: RespondRematchRequest) => void;
}
