import type { PieceColor, IClock, IIdGenerator } from "@fun-chess/shared";
import type { SessionRecord, SessionRegistry } from "./session_registry.js";
import { SystemClock, UuidGenerator } from "../../platform/time/index.js";

export interface MockSessionRegistryOptions {
  clock?: IClock;
  idGenerator?: IIdGenerator;
  defaultTtlMs?: number;
}

/**
 * Unit test double for SessionRegistry.
 * Provides in-memory storage without background timers and inspectable spy arrays
 * for verifying session lifecycle interactions.
 */
export class MockSessionRegistry implements SessionRegistry {
  public readonly sessions = new Map<string, SessionRecord>();
  public readonly roomIndex = new Map<string, Set<string>>();
  public readonly playerIndex = new Map<string, string>();

  // Spy tracking arrays
  public createCalls: Parameters<SessionRegistry["createSession"]>[0][] = [];
  public touchCalls: {
    sessionToken: string;
    newSocketId: string;
    extensionTtlMs?: number;
  }[] = [];
  public deleteCalls: string[] = [];
  public deleteForPlayerCalls: { roomCode: string; playerId: string }[] = [];
  public deleteForRoomCalls: string[] = [];

  private readonly clock: IClock;
  private readonly idGenerator: IIdGenerator;
  private readonly defaultTtlMs: number;

  constructor(options: MockSessionRegistryOptions = {}) {
    this.clock = options.clock ?? new SystemClock();
    this.idGenerator = options.idGenerator ?? new UuidGenerator();
    this.defaultTtlMs = options.defaultTtlMs ?? 2 * 60 * 60 * 1000;
  }

  public async createSession(params: {
    playerId: string;
    roomCode: string;
    color: PieceColor;
    isHost: boolean;
    socketId: string;
    ttlMs?: number;
  }): Promise<SessionRecord> {
    this.createCalls.push({ ...params });

    const code = params.roomCode.toUpperCase();
    const sessionToken = this.idGenerator.generateId();
    const now = this.clock.now();
    const expiresAt = now + (params.ttlMs ?? this.defaultTtlMs);

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

    let roomTokens = this.roomIndex.get(code);
    if (!roomTokens) {
      roomTokens = new Set<string>();
      this.roomIndex.set(code, roomTokens);
    }
    roomTokens.add(sessionToken);

    this.playerIndex.set(`${code}:${params.playerId}`, sessionToken);

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
    this.touchCalls.push({ sessionToken, newSocketId, extensionTtlMs });

    const record = this.sessions.get(sessionToken);
    if (record) {
      const now = this.clock.now();
      record.socketId = newSocketId;
      record.lastSeenAt = now;
      record.expiresAt = now + (extensionTtlMs ?? this.defaultTtlMs);
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
      }
    }
  }

  public async deleteSession(sessionToken: string): Promise<boolean> {
    this.deleteCalls.push(sessionToken);

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
    this.deleteForPlayerCalls.push({ roomCode, playerId });

    const code = roomCode.toUpperCase();
    const token = this.playerIndex.get(`${code}:${playerId}`);
    if (!token) return false;
    return this.deleteSession(token);
  }

  public async deleteSessionsForRoom(roomCode: string): Promise<number> {
    this.deleteForRoomCalls.push(roomCode);

    const code = roomCode.toUpperCase();
    const tokens = this.roomIndex.get(code);
    if (!tokens) return 0;

    let deleted = 0;
    for (const token of [...tokens]) {
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
    return cleaned;
  }

  public async clear(): Promise<void> {
    this.sessions.clear();
    this.roomIndex.clear();
    this.playerIndex.clear();
    this.createCalls = [];
    this.touchCalls = [];
    this.deleteCalls = [];
    this.deleteForPlayerCalls = [];
    this.deleteForRoomCalls = [];
  }
}
