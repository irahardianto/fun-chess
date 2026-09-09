import type { PieceColor, IClock, IIdGenerator } from "@fun-chess/shared";
import { SessionRecord, SessionRegistry } from "./session_registry.js";
import { SystemClock, UuidGenerator } from "../../platform/time/index.js";
import { type Logger, defaultLogger } from "../../platform/logger/index.js";

/**
 * In-memory production implementation of SessionRegistry.
 * Indexes sessions by sessionToken, roomCode, and `${roomCode}:${playerId}`.
 */
export class InMemorySessionRegistry implements SessionRegistry {
  // Primary session lookup: sessionToken -> SessionRecord
  private readonly sessions = new Map<string, SessionRecord>();

  // Secondary index for O(1) cascade deletion: roomCode -> Set<sessionToken>
  private readonly roomIndex = new Map<string, Set<string>>();

  // Secondary index: `${roomCode}:${playerId}` -> sessionToken
  private readonly playerIndex = new Map<string, string>();

  private readonly DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

  constructor(
    private readonly clock: IClock = new SystemClock(),
    private readonly idGenerator: IIdGenerator = new UuidGenerator(),
    private readonly logger: Logger = defaultLogger,
  ) {}

  public now(): number {
    return this.clock.now();
  }

  public async createSession(params: {
    playerId: string;
    roomCode: string;
    color: PieceColor;
    isHost: boolean;
    socketId: string;
    ttlMs?: number;
  }): Promise<SessionRecord> {
    const code = params.roomCode.toUpperCase();
    const sessionToken = this.idGenerator.generateId();
    const now = this.clock.now();
    const expiresAt = now + (params.ttlMs || this.DEFAULT_TTL_MS);

    const record: SessionRecord = {
      sessionToken,
      playerId: params.playerId,
      roomCode: code,
      color: params.color,
      isHost: params.isHost,
      socketId: params.socketId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    };

    this.sessions.set(sessionToken, record);

    // Index by room
    let roomTokens = this.roomIndex.get(code);
    if (!roomTokens) {
      roomTokens = new Set<string>();
      this.roomIndex.set(code, roomTokens);
    }
    roomTokens.add(sessionToken);

    // Index by room + player
    this.playerIndex.set(`${code}:${params.playerId}`, sessionToken);

    this.logger.debug("Session created", {
      operation: "session_storage_create",
      roomCode: code,
      playerId: params.playerId,
      sessionToken,
    });

    return structuredClone(record);
  }

  public async validateSession(
    sessionToken: string,
    roomCode: string,
    playerId: string,
  ): Promise<SessionRecord | null> {
    const record = this.sessions.get(sessionToken);
    if (!record) return null;

    if (
      record.roomCode !== roomCode.toUpperCase() ||
      record.playerId !== playerId
    ) {
      return null;
    }

    if (this.clock.now() > record.expiresAt) {
      await this.deleteSession(sessionToken);
      return null;
    }

    return structuredClone(record);
  }

  public async getSessionByToken(
    sessionToken: string,
  ): Promise<SessionRecord | null> {
    const record = this.sessions.get(sessionToken);
    if (!record) return null;

    if (this.clock.now() > record.expiresAt) {
      await this.deleteSession(sessionToken);
      return null;
    }

    return structuredClone(record);
  }

  public async getSessionTokenForPlayer(
    roomCode: string,
    playerId: string,
  ): Promise<string | null> {
    const code = roomCode.toUpperCase();
    const token = this.playerIndex.get(`${code}:${playerId}`);
    if (!token) return null;

    const record = this.sessions.get(token);
    if (!record) {
      this.playerIndex.delete(`${code}:${playerId}`);
      return null;
    }

    if (this.clock.now() > record.expiresAt) {
      await this.deleteSession(token);
      return null;
    }

    return token;
  }

  public async touchSession(
    sessionToken: string,
    newSocketId: string,
    extensionTtlMs?: number,
  ): Promise<void> {
    const record = this.sessions.get(sessionToken);
    if (record) {
      const now = this.clock.now();
      record.socketId = newSocketId;
      record.lastSeenAt = now;
      record.expiresAt = now + (extensionTtlMs ?? this.DEFAULT_TTL_MS);
      this.logger.debug("Session touched", {
        operation: "session_storage_touch",
        sessionToken,
        newSocketId,
      });
    }
  }

  public async updateSessionColor(
    roomCode: string,
    playerId: string,
    newColor: PieceColor,
  ): Promise<void> {
    const code = roomCode.toUpperCase();
    const token = this.playerIndex.get(`${code}:${playerId}`);
    if (token) {
      const record = this.sessions.get(token);
      if (record) {
        record.color = newColor;
        record.lastSeenAt = this.clock.now();
        this.logger.debug("Session color updated", {
          operation: "session_storage_update_color",
          roomCode: code,
          playerId,
          newColor,
        });
      }
    }
  }

  public async deleteSession(sessionToken: string): Promise<boolean> {
    const record = this.sessions.get(sessionToken);
    if (!record) return false;

    this.sessions.delete(sessionToken);
    const roomTokens = this.roomIndex.get(record.roomCode);
    if (roomTokens) {
      roomTokens.delete(sessionToken);
      if (roomTokens.size === 0) {
        this.roomIndex.delete(record.roomCode);
      }
    }
    this.playerIndex.delete(`${record.roomCode}:${record.playerId}`);
    return true;
  }

  public async deleteSessionForPlayer(
    roomCode: string,
    playerId: string,
  ): Promise<boolean> {
    const code = roomCode.toUpperCase();
    const token = this.playerIndex.get(`${code}:${playerId}`);
    if (!token) return false;
    return this.deleteSession(token);
  }

  public async deleteSessionsForRoom(roomCode: string): Promise<number> {
    const code = roomCode.toUpperCase();
    const tokens = this.roomIndex.get(code);
    if (!tokens) return 0;

    let deleted = 0;
    for (const token of tokens) {
      const record = this.sessions.get(token);
      if (record) {
        this.playerIndex.delete(`${code}:${record.playerId}`);
        this.sessions.delete(token);
        deleted++;
      }
    }
    this.roomIndex.delete(code);
    return deleted;
  }

  public async cleanupExpiredSessions(): Promise<number> {
    const now = this.clock.now();
    // Synchronously snapshot expired tokens before deleting to prevent iterator desync (MAJ-034)
    const expiredTokens: string[] = [];
    for (const [token, record] of this.sessions.entries()) {
      if (now > record.expiresAt) {
        expiredTokens.push(token);
      }
    }

    let cleaned = 0;
    for (const token of expiredTokens) {
      const deleted = await this.deleteSession(token);
      if (deleted) {
        cleaned++;
      }
    }

    this.logger.debug("Expired sessions cleaned up", {
      operation: "session_storage_cleanup_expired",
      cleanedCount: cleaned,
    });

    return cleaned;
  }

  public async clear(): Promise<void> {
    this.sessions.clear();
    this.roomIndex.clear();
    this.playerIndex.clear();
  }
}
