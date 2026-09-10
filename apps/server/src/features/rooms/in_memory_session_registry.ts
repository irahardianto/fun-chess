import type { PieceColor, IClock, IIdGenerator } from "@fun-chess/shared";
import {
  verifySessionToken,
  generateSessionToken,
  tokenFingerprint,
} from "@fun-chess/shared";
import { SessionRecord, SessionRegistry } from "./session_registry.js";
import type { StorageQueryOptions, StorageMutationOptions } from "./room.store.js";
import { SystemClock, UuidGenerator } from "../../platform/time/index.js";
import { type Logger, defaultLogger } from "../../platform/logger/index.js";

/**
 * In-memory production implementation of SessionRegistry.
 * Indexes sessions by sessionToken, roomCode, and `${roomCode}:${playerId}`.
 * Scrub/mask session tokens in debug logs (CRIT-002).
 * Verifies HMAC-SHA256 signatures via verifySessionToken (MAJ-004).
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
    private readonly sessionSecret: string = process.env.SESSION_SECRET ??
      "default-fun-chess-dev-secret-key-32b",
  ) {
    if (
      process.env.NODE_ENV === "production" &&
      this.sessionSecret === "default-fun-chess-dev-secret-key-32b"
    ) {
      this.logger.error(
        "CRITICAL: Default development session secret used in production mode (MAJ-004). Set SESSION_SECRET.",
        { operation: "session_registry_init" },
      );
    }
  }

  private assertNotAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw (
        signal.reason ??
        new DOMException("The operation was aborted", "AbortError")
      );
    }
  }

  public now(): number {
    return this.clock.now();
  }

  public async createSession(
    params: {
      playerId: string;
      roomCode: string;
      color: PieceColor;
      isHost: boolean;
      socketId: string;
      ttlMs?: number;
    },
    options?: StorageMutationOptions,
  ): Promise<SessionRecord> {
    this.assertNotAborted(options?.signal);

    const code = params.roomCode.toUpperCase();
    const rawId = this.idGenerator.generateId();
    let sessionToken = rawId;
    try {
      sessionToken = generateSessionToken(rawId, this.sessionSecret);
    } catch {
      sessionToken = rawId;
    }
    const now = this.clock.now();
    const expiresInMs = params.ttlMs || this.DEFAULT_TTL_MS;
    const expiresAt = now + expiresInMs;

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

    // CRIT-002: Scrub raw session token from debug log metadata
    this.logger.debug("Session created", {
      operation: "session_storage_create",
      roomCode: code,
      playerId: params.playerId,
      tokenFingerprint: tokenFingerprint(sessionToken),
      expiresInMs,
      ...(options?.correlationId ? { correlationId: options.correlationId } : {}),
    });

    return structuredClone(record);
  }

  public async validateSession(
    sessionToken: string,
    roomCode: string,
    playerId: string,
    options?: StorageQueryOptions,
  ): Promise<SessionRecord | null> {
    this.assertNotAborted(options?.signal);

    const isTestOrDev =
      process.env.NODE_ENV === "test" ||
      process.env.NODE_ENV === "development" ||
      !process.env.NODE_ENV;

    const verification = verifySessionToken(sessionToken, this.sessionSecret, {
      allowUnsignedInDev: isTestOrDev,
    });

    if (!verification.valid) {
      if (
        isTestOrDev &&
        !sessionToken.includes(".") &&
        this.sessions.has(sessionToken)
      ) {
        // Allowed in test/dev for arbitrary mock tokens
      } else {
        return null;
      }
    }

    const record = this.sessions.get(sessionToken);
    if (!record) return null;

    if (
      record.roomCode !== roomCode.toUpperCase() ||
      record.playerId !== playerId
    ) {
      return null;
    }

    if (this.clock.now() > record.expiresAt) {
      await this.deleteSession(sessionToken, options);
      return null;
    }

    return structuredClone(record);
  }

  public async getSessionByToken(
    sessionToken: string,
    options?: StorageQueryOptions,
  ): Promise<SessionRecord | null> {
    this.assertNotAborted(options?.signal);

    const record = this.sessions.get(sessionToken);
    if (!record) return null;

    if (this.clock.now() > record.expiresAt) {
      await this.deleteSession(sessionToken, options);
      return null;
    }

    return structuredClone(record);
  }

  public async getSessionTokenForPlayer(
    roomCode: string,
    playerId: string,
    options?: StorageQueryOptions,
  ): Promise<string | null> {
    this.assertNotAborted(options?.signal);

    const code = roomCode.toUpperCase();
    const token = this.playerIndex.get(`${code}:${playerId}`);
    if (!token) return null;

    const record = this.sessions.get(token);
    if (!record) {
      this.playerIndex.delete(`${code}:${playerId}`);
      return null;
    }

    if (this.clock.now() > record.expiresAt) {
      await this.deleteSession(token, options);
      return null;
    }

    return token;
  }

  public async touchSession(
    sessionToken: string,
    newSocketId: string,
    extensionTtlMs?: number,
    options?: StorageMutationOptions,
  ): Promise<void> {
    this.assertNotAborted(options?.signal);

    const record = this.sessions.get(sessionToken);
    if (record) {
      const now = this.clock.now();
      const extendedTtl = extensionTtlMs ?? this.DEFAULT_TTL_MS;
      record.socketId = newSocketId;
      record.lastSeenAt = now;
      record.expiresAt = now + extendedTtl;

      // CRIT-002: Scrub raw session token from debug log metadata
      this.logger.debug("Session touched", {
        operation: "session_storage_touch",
        tokenFingerprint: tokenFingerprint(sessionToken),
        newSocketId,
        extendedTtlMs: extendedTtl,
        ...(options?.correlationId ? { correlationId: options.correlationId } : {}),
      });
    }
  }

  public async updateSessionColor(
    roomCode: string,
    playerId: string,
    newColor: PieceColor,
    options?: StorageMutationOptions,
  ): Promise<void> {
    this.assertNotAborted(options?.signal);

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
          ...(options?.correlationId ? { correlationId: options.correlationId } : {}),
        });
      }
    }
  }

  public async deleteSession(
    sessionToken: string,
    options?: StorageMutationOptions,
  ): Promise<boolean> {
    this.assertNotAborted(options?.signal);

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

    // CRIT-002: Scrub raw session token from debug log metadata
    this.logger.debug("Session deleted", {
      operation: "session_storage_delete",
      tokenFingerprint: tokenFingerprint(sessionToken),
      roomCode: record.roomCode,
      playerId: record.playerId,
      ...(options?.correlationId ? { correlationId: options.correlationId } : {}),
    });

    return true;
  }

  public async deleteSessionForPlayer(
    roomCode: string,
    playerId: string,
    options?: StorageMutationOptions,
  ): Promise<boolean> {
    this.assertNotAborted(options?.signal);

    const code = roomCode.toUpperCase();
    const token = this.playerIndex.get(`${code}:${playerId}`);
    if (!token) return false;
    return this.deleteSession(token, options);
  }

  public async deleteSessionsForRoom(
    roomCode: string,
    options?: StorageMutationOptions,
  ): Promise<number> {
    this.assertNotAborted(options?.signal);

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

  public async cleanupExpiredSessions(
    options?: StorageMutationOptions,
  ): Promise<number> {
    this.assertNotAborted(options?.signal);

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
      const deleted = await this.deleteSession(token, options);
      if (deleted) {
        cleaned++;
      }
    }

    this.logger.debug("Expired sessions cleaned up", {
      operation: "session_storage_cleanup_expired",
      cleanedCount: cleaned,
      ...(options?.correlationId ? { correlationId: options.correlationId } : {}),
    });

    return cleaned;
  }

  public async clear(options?: StorageMutationOptions): Promise<void> {
    this.assertNotAborted(options?.signal);

    this.sessions.clear();
    this.roomIndex.clear();
    this.playerIndex.clear();
  }
}
