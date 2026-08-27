export type PieceColor = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export type Square =
  | "a1"
  | "a2"
  | "a3"
  | "a4"
  | "a5"
  | "a6"
  | "a7"
  | "a8"
  | "b1"
  | "b2"
  | "b3"
  | "b4"
  | "b5"
  | "b6"
  | "b7"
  | "b8"
  | "c1"
  | "c2"
  | "c3"
  | "c4"
  | "c5"
  | "c6"
  | "c7"
  | "c8"
  | "d1"
  | "d2"
  | "d3"
  | "d4"
  | "d5"
  | "d6"
  | "d7"
  | "d8"
  | "e1"
  | "e2"
  | "e3"
  | "e4"
  | "e5"
  | "e6"
  | "e7"
  | "e8"
  | "f1"
  | "f2"
  | "f3"
  | "f4"
  | "f5"
  | "f6"
  | "f7"
  | "f8"
  | "g1"
  | "g2"
  | "g3"
  | "g4"
  | "g5"
  | "g6"
  | "g7"
  | "g8"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "h7"
  | "h8";

export type RoomStatus =
  | "lobby"
  | "playing"
  | "paused_disconnect"
  | "game_over"
  | "rematch_pending"
  | "abandoned";

export type GameOverReason =
  | "checkmate"
  | "stalemate"
  | "threefold_repetition"
  | "insufficient_material"
  | "fifty_move_rule"
  | "resignation"
  | "draw_agreement"
  | "abandonment";

export interface Player {
  id: string; // UUID
  socketId: string; // Socket.io connection ID
  name: string; // Nickname
  color: PieceColor; // 'w' or 'b'
  isHost: boolean; // True if created the room
  isConnected: boolean; // Connection status
  sessionToken: string; // Secret token for session restoration
  connectedAt: number; // Epoch ms
}

export interface MovePayload {
  from: Square | string;
  to: Square | string;
  promotion?: "q" | "r" | "b" | "n";
}

export interface MoveResult {
  from: string;
  to: string;
  san: string; // Standard Algebraic Notation, e.g. "Nf3", "e4", "O-O", "Qxf7#"
  piece: PieceType;
  color: PieceColor;
  captured?: PieceType;
  promotion?: PieceType;
  flags: string; // e.g. 'c' (capture), 'e' (en passant), 'k' (kingside castle)
  fen: string; // FEN string immediately after this move
  moveNumber: number;
  timestamp: number;
}

export interface GameState {
  fen: string; // Standard FEN representation
  turn: PieceColor; // Active side to move
  isCheck: boolean; // True if active side's king is attacked
  isCheckmate: boolean; // True if checkmate reached
  isDraw: boolean; // True if draw reached
  isStalemate: boolean; // True if stalemate reached
  isThreefoldRepetition: boolean;
  isInsufficientMaterial: boolean;
  isFiftyMoveRule: boolean;
  moveHistory: MoveResult[]; // List of all moves made
  capturedWhite: PieceType[]; // Pieces captured from White
  capturedBlack: PieceType[]; // Pieces captured from Black
  materialAdvantage: {
    white: number; // Net material score for White (+3, 0, etc.)
    black: number; // Net material score for Black
  };
  lastMove: { from: string; to: string } | null;
  moveCount: number; // Total half-moves (plies)
}

export interface RematchState {
  requestedBy: string; // Player ID
  requestedAt: number; // Epoch ms
  status: "pending" | "accepted" | "declined";
}

export interface RoomState {
  roomCode: string; // 4-letter uppercase code
  status: RoomStatus;
  hostId: string;
  whitePlayer: Player | null;
  blackPlayer: Player | null;
  spectators: Player[];
  game: GameState;
  rematch: RematchState | null;
  createdAt: number;
  lastActivityAt: number;
}

export interface GameOverPayload {
  winner: PieceColor | "draw";
  winnerName?: string;
  reason: GameOverReason;
  message: string;
  finalFen: string;
  totalMoves: number;
  durationSeconds: number;
}
