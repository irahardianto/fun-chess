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
  color: PieceColor;
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
   * Retrieves an active session record by its token.
   * Returns null if the session does not exist or has expired.
   */
  getSessionByToken(sessionToken: string): Promise<SessionRecord | null>;

  /**
   * Retrieves the active session token for a player in a room.
   * Returns null if no active session exists or if it has expired.
   */
  getSessionTokenForPlayer(
    roomCode: string,
    playerId: string,
  ): Promise<string | null>;

  /**
   * Updates the socket ID and lastSeenAt timestamp for an active session.
   * Extends the session expiration by extensionTtlMs or DEFAULT_TTL_MS (sliding TTL - MIN-023).
   */
  touchSession(
    sessionToken: string,
    newSocketId: string,
    extensionTtlMs?: number,
  ): Promise<void>;

  /**
   * Revokes and deletes a specific session token.
   */
  deleteSession(sessionToken: string): Promise<boolean>;

  /**
   * Deletes a player's session token from a specific room (e.g. when a guest leaves).
   * Returns true if a session was found and deleted, false otherwise.
   */
  deleteSessionForPlayer(roomCode: string, playerId: string): Promise<boolean>;

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
   * Updates the assigned piece color for a player's session (e.g. on rematch color inversion).
   */
  updateSessionColor(
    roomCode: string,
    playerId: string,
    newColor: PieceColor,
  ): Promise<void>;

  /**
   * Completely clears all sessions (for graceful shutdown and test isolation).
   */
  clear(): Promise<void>;
}

export type ISessionRegistry = SessionRegistry;
