import { PieceColor } from "@fun-chess/shared";

/**
 * Server-private session record.
 * Never exposed over API, WebSocket broadcasts, or client payloads.
 */
export interface SessionRecord {
  /** Cryptographically secure token (UUIDv4) */
  readonly sessionToken: string;
  /** Player UUID */
  readonly playerId: string;
  /** Normalized 4-letter uppercase room code */
  readonly roomCode: string;
  /** Assigned player piece color */
  readonly color: PieceColor;
  /** Indicates whether player is the room creator */
  readonly isHost: boolean;
  /** Current active socket connection ID */
  socketId: string;
  /** Epoch ms when session was initialized */
  readonly createdAt: number;
  /** Epoch ms of last observed socket interaction */
  lastSeenAt: number;
  /** Epoch ms expiration threshold */
  expiresAt: number;
}

/**
 * Interface contract for server-side private session storage.
 * Adheres to Architectural Patterns Rule 1: I/O Isolation.
 */
export interface SessionRegistry {
  /**
   * Creates and registers a new private session token for a player in a room.
   */
  createSession(params: {
    playerId: string;
    roomCode: string;
    color: PieceColor;
    isHost: boolean;
    socketId: string;
    ttlMs?: number;
  }): Promise<SessionRecord>;

  /**
   * Validates a session token for reconnection.
   * Verifies that the token matches the expected roomCode and playerId, and has not expired.
   */
  validateSession(
    sessionToken: string,
    roomCode: string,
    playerId: string,
  ): Promise<SessionRecord | null>;

  /**
   * Updates the socket ID and lastSeenAt timestamp for an active session.
   */
  touchSession(sessionToken: string, newSocketId: string): Promise<void>;

  /**
   * Revokes and deletes a specific session token.
   */
  deleteSession(sessionToken: string): Promise<boolean>;

  /**
   * Deletes all sessions associated with a specific room code (cascade delete on room destruction).
   * Returns the count of deleted sessions.
   */
  deleteSessionsForRoom(roomCode: string): Promise<number>;

  /**
   * Purges all expired sessions past their expiresAt threshold.
   */
  cleanupExpiredSessions(): Promise<number>;

  /**
   * Completely clears all sessions (for graceful shutdown and test isolation).
   */
  clear(): Promise<void>;
}
