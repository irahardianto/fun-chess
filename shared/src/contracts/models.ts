import type { Square as ChessSquare } from "chess.js";

/**
 * Algebraic chess square notation (a1 through h8).
 * Directly aligned with chess.js Square type.
 */
export type Square = ChessSquare;

/**
 * Chess piece color identifier ('w' for White, 'b' for Black).
 */
export type PieceColor = "w" | "b";

/**
 * Chess piece type symbol ('p'=pawn, 'n'=knight, 'b'=bishop, 'r'=rook, 'q'=queen, 'k'=king).
 */
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

/**
 * Multiplayer room lifecycle status.
 */
export type RoomStatus =
  | "lobby"
  | "playing"
  | "paused_disconnect"
  | "game_over"
  | "rematch_pending"
  | "abandoned";

/**
 * Reason explaining how a chess game terminated.
 */
export type GameOverReason =
  | "checkmate"
  | "stalemate"
  | "threefold_repetition"
  | "insufficient_material"
  | "fifty_move_rule"
  | "resignation"
  | "draw_agreement"
  | "abandonment";

/**
 * Public representation of a player inside a room.
 * MUST NEVER contain private session credentials or secret tokens (CRIT-001).
 */
export interface Player {
  /** Unique UUID v4 identifier for the player */
  id: string;
  /** Ephemeral Socket.io connection identifier */
  socketId: string;
  /** Player display name (1-20 characters, sanitized) */
  name: string;
  /** Selected emoji avatar (e.g. 🦁, 🚀, 🦄, ⚡, 👑, 🐼) */
  avatar?: string;
  /** Active piece color assignment ('w' or 'b') */
  color: PieceColor;
  /** Indicates whether the player is the room creator */
  isHost: boolean;
  /** Real-time socket connectivity state */
  isConnected: boolean;
  /** Epoch timestamp (milliseconds) when the player joined */
  connectedAt: number;
}

/**
 * Semantic alias for Player explicitly denoting public view visibility.
 */
export type PublicPlayer = Player;

/**
 * Private authentication credential stored server-side and client-side (sessionStorage).
 * Exchanged ONLY over initial private room establishment and reconnection handshakes.
 */
export interface SessionInfo {
  /** Cryptographic secret UUID token used to authenticate reconnection */
  sessionToken: string;
  /** Player ID associated with this session */
  playerId: string;
  /** Room code associated with this session */
  roomCode: string;
  /** Epoch timestamp (milliseconds) when session was created */
  createdAt: number;
  /** Epoch timestamp (milliseconds) of last observed activity */
  lastSeenAt: number;
}

/**
 * Client-persisted session data stored in browser sessionStorage.
 */
export interface SavedSession {
  /** 4-letter uppercase room code */
  roomCode: string;
  /** Unique UUID identifier for the player */
  playerId: string;
  /** Cryptographic secret token */
  sessionToken: string;
}

import type { MovePayload } from "./schemas.js";
export type { MovePayload };

/**
 * Full details of an executed chess move.
 */
export interface MoveResult {
  /** Source square */
  from: string;
  /** Destination square */
  to: string;
  /** Standard Algebraic Notation, e.g. "Nf3", "e4", "O-O", "Qxf7#" */
  san: string;
  /** Piece type moved */
  piece: PieceType;
  /** Color of player making move */
  color: PieceColor;
  /** Captured piece type, if any */
  captured?: PieceType;
  /** Promoted piece type, if any */
  promotion?: PieceType;
  /** Move flags, e.g. 'c' (capture), 'e' (en passant), 'k' (kingside castle) */
  flags: string;
  /** FEN string immediately after this move */
  fen: string;
  /** 1-based move counter */
  moveNumber: number;
  /** Epoch timestamp ms */
  timestamp: number;
}

/**
 * Complete authoritative state of a chess match.
 */
export interface GameState {
  /** Standard FEN representation of current board position */
  fen: string;
  /** Active side to move ('w' or 'b') */
  turn: PieceColor;
  /** True if active side's king is attacked */
  isCheck: boolean;
  /** True if checkmate reached */
  isCheckmate: boolean;
  /** True if draw reached */
  isDraw: boolean;
  /** True if stalemate reached */
  isStalemate: boolean;
  /** True if threefold repetition reached */
  isThreefoldRepetition: boolean;
  /** True if insufficient material reached */
  isInsufficientMaterial: boolean;
  /** True if fifty move rule reached */
  isFiftyMoveRule: boolean;
  /** List of all moves made in the game */
  moveHistory: MoveResult[];
  /** Pieces captured from White */
  capturedWhite: PieceType[];
  /** Pieces captured from Black */
  capturedBlack: PieceType[];
  /** Net material score calculation */
  materialAdvantage: {
    white: number;
    black: number;
  };
  /** Last move executed, if any */
  lastMove: { from: string; to: string } | null;
  /** Total half-moves (plies) */
  moveCount: number;
}

/**
 * State of a rematch proposal.
 */
export interface RematchState {
  /** Player ID who proposed rematch */
  requestedBy: string;
  /** Epoch timestamp ms of proposal */
  requestedAt: number;
  /** Current status of rematch request */
  status: "pending" | "accepted" | "declined";
}

/**
 * Full state of a game room.
 * All Player objects within RoomState are strictly free of private credentials (CRIT-001).
 */
export interface RoomState {
  /** 4-character uppercase alphanumeric code */
  roomCode: string;
  /** Monotonically increasing sequence version (starts at 1) */
  version?: number;
  /** Room lifecycle phase */
  status: RoomStatus;
  /** Player ID of host */
  hostId: string;
  /** Assigned white player (clean of session secrets) */
  whitePlayer: Player | null;
  /** Assigned black player (clean of session secrets) */
  blackPlayer: Player | null;
  /** Spectators in the room (clean of session secrets) */
  spectators: Player[];
  /** Authoritative chess match state */
  game: GameState;
  /** Active rematch proposal state */
  rematch: RematchState | null;
  /** Active draw offer state */
  drawOffer?: { offeredBy: string; offeredAt: number } | null;
  /** Epoch timestamp of room creation */
  createdAt: number;
  /** Epoch timestamp of last mutation */
  lastActivityAt: number;
}

/**
 * Broadcast payload emitted when a game completes.
 */
export interface GameOverPayload {
  /** Winner color or 'draw' */
  winner: PieceColor | "draw";
  /** Display name of winner */
  winnerName?: string;
  /** Official termination reason */
  reason: GameOverReason;
  /** Human-readable game over banner message */
  message: string;
  /** Final position FEN */
  finalFen: string;
  /** Total moves in game */
  totalMoves: number;
  /** Game duration in seconds */
  durationSeconds: number;
}
