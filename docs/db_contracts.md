---
spec_id: DB-CONTRACT-2026-09-10
title: "Data Model & Storage Contracts: Fun Chess Audit Remediation"
doc_type: tsd
status: approved
created_at: "2026-09-10"
updated_at: "2026-09-10"
version: 1.0.0
owner: database-expert
dependencies:
  specs:
    - .agentwork/brief.md
---

# Data Model & Storage Contracts: Fun Chess Audit Remediation

## Executive Overview

This contract document defines authoritative data models, in-memory store invariants, storage interface signatures, and client-side persistence lifecycle protocols for the Fun Chess audit remediation (`docs/audits/review-findings-codebase-2026-09-10-0553.md`).

These specifications are frozen design contracts consumed by builders in Scope Cards SC-1, SC-2, SC-3, SC-4, and SC-5. All implementations must conform strictly to these interfaces, invariants, and migration protocols.

### Audit Findings Addressed

| Finding ID | Severity | Dimension | Domain | Target Files | Description |
|---|---|---|---|---|---|
| **MIN-025** | Minor | F (Integration/DB) | Shared Models | `shared/src/contracts/models.ts`, `schemas.ts` | Absence of base entity audit timestamps (`createdAt`, `updatedAt`) on `Player`. |
| **MIN-028** | Minor | F (Integration/DB) | Server Store | `apps/server/src/features/rooms/in_memory_room.store.ts` | Secondary reverse index memory retention in `findBySocketId` fallback lookup. |
| **ENH-013** | Enhancement | F (Integration/DB) | Server Store | `apps/server/src/features/rooms/in_memory_room.store.ts` | Deep cloning on high-frequency read queries creating excessive GC pressure. |
| **CRIT-002** | Critical | A/B/D (Security/Obs) | Server Sessions | `in_memory_session_registry.ts`, `http_server.ts` | Sensitive session token credential leakage in logs and storage metadata. |
| **MAJ-004** | Major | A (Security/Config) | Shared/Server | `shared/src/contracts/schemas.ts`, `in_memory_session_registry.ts` | `SESSION_SECRET` documented but unused; session tokens un-signed. |
| **ENH-015** | Enhancement | F (Integration/DB) | Storage Interfaces | `room.store.ts`, `session_registry.ts` | Absence of cancellation `AbortSignal` in data store interfaces. |
| **ENH-014** | Enhancement | F (Integration/DB) | Client Storage | `apps/client/src/platform/storage/migration.ts` | Client storage key deprecation pruning requires user visit after 30 days (ADR). |
| **MIN-004** | Minor | C (Architecture) | Client Stores | `local_storage_progress.store.ts` | Module-level stateful singletons and eager execution at import time. |
| **MIN-015** | Minor | E (Code Quality) | Client Stores | `local_storage_progress.store.ts`, `puzzle_progress.store.ts` | Constructor parameter inconsistency and asymmetric interface contracts. |
| **MIN-016** | Minor | E (Code Quality) | Client Stores | `local_storage_unified.store.ts` | Duplicated fallback scenario restoration block in `LocalStorageUnifiedStore`. |

---

## 1. Data Model Contracts: `Player` Entity Audit Timestamps (MIN-025)

<!-- contract: player-audit-timestamps -->
<!-- requirement: MIN-025 -->

### 1.1 Motivation & Architectural Rule

Per `database-design-principles.md` (lines 22-26):
> **Required columns for all tables/entities:**
> - `id` — primary key (UUID v4)
> - `created_at` — timestamp, set on creation, never updated
> - `updated_at` — timestamp, updated on every modification

The `Player` entity in `shared/src/contracts/models.ts` previously recorded only `connectedAt: number`, lacking standard audit lifecycle timestamps. This caused asymmetric auditing between server sessions and client player state, hindered distributed debugging of player reconnection sequences, and made it impossible to detect stale player objects during concurrent room state synchronization.

### 1.2 TypeScript Contract: `Player`

**File:** `shared/src/contracts/models.ts`

```typescript
/**
 * Public representation of a player inside a room.
 * MUST NEVER contain private session credentials or secret tokens (CRIT-001).
 * Adheres to database-design-principles.md entity audit standards (MIN-025).
 */
export interface Player {
  /** Unique UUID v4 identifier for the player */
  id: string;
  /** Ephemeral Socket.io connection identifier (omitted from public client broadcasts per ENH-001) */
  socketId?: string;
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
  /** Epoch timestamp (milliseconds) when socket connection was established or last reconnected */
  connectedAt: number;
  /**
   * Epoch timestamp (milliseconds) when the player entity was first instantiated.
   * STRICTLY IMMUTABLE: set once at creation and never mutated thereafter.
   */
  readonly createdAt: number;
  /**
   * Epoch timestamp (milliseconds) when player metadata, connection state, or attributes were last updated.
   * Monotonically non-decreasing: updatedAt >= createdAt.
   */
  updatedAt: number;
}
```

### 1.3 Zod Schema Contract: `PlayerSchema`

**File:** `shared/src/contracts/schemas.ts`

```typescript
/**
 * Public player representation schema.
 * All Player objects are strictly free of private credentials (CRIT-001)
 * and raw transport socket identifiers in client broadcasts (ENH-001).
 * Enforces non-negative epoch milliseconds for audit timestamps (MIN-025).
 */
export const PlayerSchema = z.object({
  id: z.string().uuid("Player ID must be a valid UUID"),
  name: PlayerNameSchema,
  avatar: AvatarEmojiSchema.optional(),
  color: PieceColorSchema,
  isHost: z.boolean(),
  isConnected: z.boolean(),
  connectedAt: z.number().nonnegative("connectedAt must be a non-negative epoch timestamp"),
  createdAt: z.number().nonnegative("createdAt must be a non-negative epoch timestamp"),
  updatedAt: z.number().nonnegative("updatedAt must be a non-negative epoch timestamp"),
}).refine((data) => data.updatedAt >= data.createdAt, {
  message: "updatedAt must be greater than or equal to createdAt",
  path: ["updatedAt"],
});

export type PlayerDto = z.infer<typeof PlayerSchema>;
```

### 1.4 Default Population & Immutability Rules

1. **Creation Time Population (`createRoom` / `joinRoom`):**
   - When a player entity is constructed:
     ```typescript
     const now = clock.now();
     const player: Player = {
       id: playerId,
       socketId,
       name: sanitizedName,
       avatar: req.avatar || "🦁",
       color: assignedColor,
       isHost: isRoomHost,
       isConnected: true,
       connectedAt: now,
       createdAt: now,
       updatedAt: now,
     };
     ```
2. **Immutability of `createdAt`:**
   - `createdAt` is typed as `readonly`.
   - Mutation functions, reconnect transitions, color inversion logic, and serialization mappers MUST NEVER overwrite `createdAt`.
   - During room transitions (e.g. `disconnectPlayerTransition`, `reconnectPlayerTransition`, `addPlayerToRoom`), `createdAt` must be copied verbatim from the existing player entity.
3. **Mutation Rules for `updatedAt`:**
   - `updatedAt` MUST be updated to `clock.now()` whenever any of the following events occur:
     - Player connects or reconnects (`isConnected: true`, updated `socketId`, updated `connectedAt`).
     - Player disconnects (`isConnected: false`, cleared or retained `socketId`).
     - Player piece color changes (e.g. rematch color switch).
     - Player avatar or display name is updated.
4. **Backward Compatibility & Ingress Normalization:**
   - When deserializing legacy client or test payloads that lack `createdAt` or `updatedAt`:
     - If `createdAt` is undefined: fallback to `connectedAt` if valid, otherwise `clock.now()`.
     - If `updatedAt` is undefined: fallback to `connectedAt` if valid, otherwise `clock.now()`.
   - In unit test fixture helpers (e.g. `createDummyRoom`):
     ```typescript
     connectedAt: now,
     createdAt: now,
     updatedAt: now,
     ```

---

## 2. In-Memory Store Contracts: Server Persistence Invariants

<!-- contract: server-in-memory-stores -->
<!-- requirement: MIN-028, ENH-013, CRIT-002, MAJ-004 -->

### 2.1 `InMemoryRoomStore` Architecture & State Model

**File:** `apps/server/src/features/rooms/in_memory_room.store.ts`

```
┌────────────────────────────────────────────────────────────────────────┐
│                          InMemoryRoomStore                             │
│                                                                        │
│   rooms: Map<RoomCode, Readonly<RoomState>>                            │
│     │ (pre-frozen snapshots stored per CAS version)                    │
│     ▼                                                                  │
│   socketIndex: Map<SocketId, { roomCode: string, playerId: string }>   │
│     │ (O(1) primary socket reverse lookup)                             │
│     ▼                                                                  │
│   roomSockets: Map<RoomCode, Set<SocketId>>                            │
│     │ (O(1) cascade unindexing map)                                    │
│     ▼                                                                  │
│   lockQueues: Map<RoomCode, { tail: Promise<void>, waitersCount: n }>  │
│     (serialized async FIFO mutex per roomCode)                         │
└────────────────────────────────────────────────────────────────────────┘
```

#### Dual Index Invariants:
1. **Primary Room Index:** `rooms` maps normalized uppercase 4-character room codes (`"ABCD"`) to immutable `Readonly<RoomState>`.
2. **Reverse Socket Index (`socketIndex`):** Maps `socketId` directly to `{ roomCode, playerId }`.
3. **Room-to-Sockets Secondary Index (`roomSockets`):** Maps `roomCode` to `Set<socketId>`. Tracks all sockets associated with white player, black player, and active spectators in that room.
4. **Consistency Invariant:**
   $$\forall s \in \text{Domain}(socketIndex): \quad socketIndex(s) = (R, P) \implies s \in roomSockets(R) \land \text{PlayerHasSocket}(R, P, s)$$
5. **Zero Memory Retention Invariant:**
   On room deletion (`delete(roomCode)`), room expiry, or socket reassignment, all matching keys in `socketIndex` and `roomSockets` MUST be removed. No disconnected socket or stale room entry may persist in memory.

### 2.2 Fallback Socket Lookup Re-Indexing Rule (MIN-028)

#### Problem Analysis
In `InMemoryRoomStore.findBySocketId(socketId: string)`, if `this.socketIndex.get(socketId)` returns `undefined` (or returns a stale pointer invalidated during socket cleanup), the method falls back to a linear scan across `this.rooms.values()`.

Previously (lines 302–316):
```typescript
// VULNERABLE CODE (MIN-028):
for (const room of this.rooms.values()) {
  if (room.whitePlayer?.socketId === socketId) {
    return { room: structuredClone(room), playerId: room.whitePlayer.id };
  }
  // ... black player & spectator checks
}
```
When a match was found in the fallback scan:
1. The store returned the room without re-populating `this.socketIndex` or `this.roomSockets`.
2. Subsequent queries for that same socket had to execute another $O(N)$ linear scan, wasting CPU cycles.
3. If stale entries existed in `socketIndex` from previous reconnect attempts for that room, they were retained indefinitely, causing progressive memory leaks.

#### Contractual Re-Indexing Rule
Whenever the fallback scan matches an active player or spectator in a room, the store **MUST execute `this.indexSockets(room)` immediately before returning**.

```typescript
// AUTHORITATIVE FALLBACK SCAN PATTERN (MIN-028):
public async findBySocketId(
  socketId: string,
  options?: StorageQueryOptions,
): Promise<{ room: Readonly<RoomState>; playerId: string } | null> {
  this.assertNotAborted(options?.signal);

  // 1. O(1) Fast path: check reverse socketIndex
  const indexed = this.socketIndex.get(socketId);
  if (indexed) {
    const room = this.rooms.get(indexed.roomCode);
    if (room) {
      const isPlayerSocket =
        room.whitePlayer?.socketId === socketId ||
        room.blackPlayer?.socketId === socketId ||
        room.spectators?.some((s) => s.socketId === socketId);

      if (isPlayerSocket) {
        return { room, playerId: indexed.playerId };
      }
    }
    // Stale index detected: purge invalid entry
    this.socketIndex.delete(socketId);
    const sockets = this.roomSockets.get(indexed.roomCode);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.roomSockets.delete(indexed.roomCode);
      }
    }
  }

  // 2. Fallback scan across all active rooms
  for (const room of this.rooms.values()) {
    this.assertNotAborted(options?.signal);

    if (room.whitePlayer?.socketId === socketId) {
      // SELF-HEALING INVARIANT: Re-index immediately (MIN-028)
      this.indexSockets(room);
      return { room, playerId: room.whitePlayer.id };
    }
    if (room.blackPlayer?.socketId === socketId) {
      // SELF-HEALING INVARIANT: Re-index immediately (MIN-028)
      this.indexSockets(room);
      return { room, playerId: room.blackPlayer.id };
    }
    const spectator = room.spectators?.find((s) => s.socketId === socketId);
    if (spectator) {
      // SELF-HEALING INVARIANT: Re-index immediately (MIN-028)
      this.indexSockets(room);
      return { room, playerId: spectator.id };
    }
  }

  return null;
}
```

### 2.3 Deep Freeze / Copy Invariants for Read Queries (ENH-013)

#### Problem Analysis
`findByCode` and `findBySocketId` are executed at high frequency (heartbeats, client polls, move validations, socket message ingress). Calling `structuredClone(room)` on every read allocated hundreds of thousands of heap objects per second in active multiplayer benchmarks, triggering heavy V8 garbage collection pauses (5–25ms GC stop-the-world spikes).

#### Contractual Zero-Allocation Read Invariant
1. **Write-Path Deep Freezing:**
   When persisting a room state via `save()`, `createIfAbsent()`, or `mutate()`, the store creates an isolated clone, recursively freezes it via `deepFreeze()`, and stores the immutable reference in `this.rooms`.
2. **Read-Path Direct Reference Return:**
   High-frequency read queries (`findByCode`, `findBySocketId`, `listActiveRooms`) return the pre-frozen `Readonly<RoomState>` reference directly without invoking `structuredClone()`.
3. **Mutation Isolation:**
   The only pathway to mutate room state is via `store.mutate(roomCode, mutator)` or inside `store.withLock(roomCode, action)`. The `mutate` implementation clones the frozen state *once* before passing it to the mutator, ensuring user mutations operate on a private mutable draft.

#### Recursive Deep Freeze Specification
```typescript
/**
 * Recursively freezes an object and its nested properties to enforce immutability at runtime.
 * Guarantees zero runtime allocations on read queries while preventing state corruption.
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) {
    return obj;
  }

  Object.freeze(obj);

  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && (typeof val === "object" || typeof val === "function")) {
      deepFreeze(val);
    }
  }

  return obj;
}
```

#### Read vs. Mutate Performance Contract:
- **`findByCode(code)`:** $O(1)$ lookup, 0 heap allocations, returns frozen pointer.
- **`findBySocketId(socketId)`:** $O(1)$ map lookup on index hit, 0 heap allocations, returns frozen pointer.
- **`mutate(code, mutator)`:** Mutates isolated draft inside room lock, increments version, deep-freezes result, updates `this.rooms`, re-indexes sockets.

---

## 3. In-Memory Session Registry: HMAC-SHA256 & Credential Scrubbing

<!-- contract: session-storage-and-redaction -->
<!-- requirement: CRIT-002, MAJ-004 -->

### 3.1 HMAC-SHA256 Signed Session Tokens (MAJ-004)

#### Token Format Specification
Session tokens authenticate WebSocket reconnection and API operations. Tokens must be cryptographically tamper-resistant.

$$\text{SessionToken} = \text{SessionId} \,\|\, \texttt{"."} \,\|\, \text{HMAC-SHA256}_{\text{SESSION\_SECRET}}(\text{SessionId})$$

- **`SessionId`:** Standard RFC 4122 UUID v4 (36 ASCII characters, e.g. `c7b98f21-8f5c-482a-9290-0e10b14b8a7f`).
- **Delimiter:** Literal period (`.`).
- **`Signature`:** 64-character lowercase hexadecimal string representing the HMAC-SHA256 digest of the `SessionId` using `SESSION_SECRET`.
- **Total Token Length:** Exactly 101 characters (36 + 1 + 64).

#### Secret Key Handling & Fallback
- `SESSION_SECRET` is obtained from `env.SESSION_SECRET`.
- If `SESSION_SECRET` is omitted in non-production environments (`NODE_ENV !== "production"`), a deterministic development secret is used, and a startup warning is logged.
- In production (`NODE_ENV === "production"`), if `SESSION_SECRET` is missing or shorter than 32 characters, server bootstrap MUST fail fast with `ConfigurationError`.

#### Signing & Verification Utilities Contract

**File:** `shared/src/utils/session_token.ts`

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionTokenPayload {
  sessionId: string;
  signature: string;
  token: string;
}

/**
 * Signs a session ID with HMAC-SHA256 using the provided secret.
 */
export function signSessionToken(sessionId: string, secret: string): string {
  if (!secret) {
    throw new Error("Cannot sign session token: secret is required");
  }
  const hmac = createHmac("sha256", secret);
  hmac.update(sessionId);
  const signature = hmac.digest("hex");
  return `${sessionId}.${signature}`;
}

/**
 * Validates the cryptographic HMAC-SHA256 signature of a session token in constant time.
 */
export function verifySessionToken(token: string, secret: string): boolean {
  if (!token || !secret) return false;

  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return false;

  const sessionId = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  if (!sessionId || !signature || signature.length !== 64) {
    return false;
  }

  const expectedSignature = createHmac("sha256", secret).update(sessionId).digest("hex");

  const sigBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Parses a signed session token, returning null if structurally invalid.
 */
export function parseSessionToken(token: string): { sessionId: string; signature: string } | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || parts[1].length !== 64) {
    return null;
  }
  return { sessionId: parts[0], signature: parts[1] };
}
```

### 3.2 Registry Storage & Indexing Contract

**File:** `apps/server/src/features/rooms/in_memory_session_registry.ts`

```typescript
export class InMemorySessionRegistry implements SessionRegistry {
  // Primary index: full signed sessionToken -> SessionRecord
  private readonly sessions = new Map<string, SessionRecord>();

  // Secondary index: roomCode -> Set<signedSessionToken> (cascade delete)
  private readonly roomIndex = new Map<string, Set<string>>();

  // Secondary index: `${roomCode}:${playerId}` -> signedSessionToken
  private readonly playerIndex = new Map<string, string>();

  constructor(
    private readonly clock: IClock = new SystemClock(),
    private readonly idGenerator: IIdGenerator = new UuidGenerator(),
    private readonly logger: Logger = defaultLogger,
    private readonly sessionSecret: string = process.env.SESSION_SECRET ?? "default-fun-chess-dev-secret-key-32b",
  ) {}
  // ...
}
```

#### Verification Lifecycle in `validateSession`
When validating a session for reconnection:
1. Verify token cryptographic integrity: `verifySessionToken(sessionToken, this.sessionSecret)`. If false, reject immediately (fail-closed, return `null`).
2. Lookup session record by `sessionToken`. If missing, return `null`.
3. Validate room code and player ID match: `record.roomCode === roomCode.toUpperCase() && record.playerId === playerId`.
4. Validate expiration threshold: `this.clock.now() <= record.expiresAt`. If expired, delete session and return `null`.
5. On success, return `structuredClone(record)` (or frozen record).

### 3.3 Log Scrubbing & Credential Masking (CRIT-002)

#### Security Vulnerability Remediated
Previously, `in_memory_session_registry.ts` passed raw `sessionToken` directly into log metadata:
```typescript
// VULNERABLE LOGGING (CRIT-002):
this.logger.debug("Session created", {
  operation: "session_storage_create",
  roomCode: code,
  playerId: params.playerId,
  sessionToken, // LEAKS RAW BEARER CREDENTIAL TO LOGS (CWE-532)
});
```
Furthermore, `http_server.ts` extracted session tokens from headers and query parameters into `userId`, which bypassed Pino redaction and leaked to access logs.

#### Mandatory Masking & Redaction Rules
1. **Never Log Cleartext Tokens:** Raw session tokens MUST NEVER be included in log messages, debug payloads, trace metadata, or error properties.
2. **Fingerprint / Masking Standards:**
   - Use irreversible truncated SHA-256 fingerprint:
     ```typescript
     import { createHash } from "node:crypto";
     export function maskSessionToken(token: string): string {
       if (!token || token.length < 8) return "***";
       return `${token.slice(0, 4)}...${token.slice(-4)}`;
     }
     export function tokenFingerprint(token: string): string {
       return createHash("sha256").update(token).digest("hex").slice(0, 10);
     }
     ```
3. **Structured Log Payload Contract:**

| Operation | Allowed Metadata Fields | Prohibited Fields |
|---|---|---|
| `session_storage_create` | `operation`, `roomCode`, `playerId`, `tokenFingerprint`, `expiresInMs` | `sessionToken` (raw) |
| `session_storage_touch` | `operation`, `tokenFingerprint`, `newSocketId`, `extendedTtlMs` | `sessionToken` (raw) |
| `session_storage_delete` | `operation`, `tokenFingerprint`, `roomCode`, `playerId`, `reason` | `sessionToken` (raw) |
| `session_storage_validate` | `operation`, `roomCode`, `playerId`, `isValid`, `failureReason` | `sessionToken` (raw) |

4. **HTTP Ingress Scrubbing:**
   In `http_server.ts:extractHttpUserId`, remove all extraction of `x-session-token`, `session-token`, `sessionToken`, and `session_token` into `userId`. `userId` must strictly represent public player IDs or authenticated subjects.

---

## 4. Storage Interface Contracts: Query Cancellation (ENH-015)

<!-- contract: storage-query-cancellation -->
<!-- requirement: ENH-015 -->

### 4.1 Options Types Specification

```typescript
/**
 * Standard query options for data store operations.
 * Supports cooperative request cancellation via standard AbortSignal (ENH-015).
 */
export interface StorageQueryOptions {
  /** Optional AbortSignal for aborting in-flight or queued queries */
  signal?: AbortSignal;
}

/**
 * Standard mutation options for data store operations.
 * Combines distributed tracing correlationId with cooperative AbortSignal.
 */
export interface StorageMutationOptions extends StorageQueryOptions {
  /** Correlation ID for distributed tracing across service boundaries */
  correlationId?: string;
}
```

### 4.2 Authoritative `RoomStore` Interface

**File:** `apps/server/src/features/rooms/room.store.ts`

```typescript
import { RoomState } from "@fun-chess/shared";

export type RoomMutator<T> = (
  current: RoomState,
) => Promise<{ updatedRoom: RoomState; result: T }> | { updatedRoom: RoomState; result: T };

export interface StorageQueryOptions {
  signal?: AbortSignal;
}

export interface StorageMutationOptions extends StorageQueryOptions {
  correlationId?: string;
}

/**
 * Storage boundary abstraction for room persistence.
 * Adheres to Architectural Patterns Rule 1: I/O Isolation.
 * Supports AbortSignal query cancellation across all asynchronous methods (ENH-015).
 */
export interface RoomStore {
  /**
   * Retrieves a read-only snapshot of the room state.
   */
  findByCode(
    roomCode: string,
    options?: StorageQueryOptions,
  ): Promise<Readonly<RoomState> | null>;

  /**
   * Finds room and player by socket ID with index self-healing.
   */
  findBySocketId(
    socketId: string,
    options?: StorageQueryOptions,
  ): Promise<{ room: Readonly<RoomState>; playerId: string } | null>;

  /**
   * Atomically executes a mutator function within the room's exclusive lock.
   */
  mutate<T>(
    roomCode: string,
    mutator: RoomMutator<T>,
    options?: StorageMutationOptions,
  ): Promise<T>;

  /**
   * Executes an arbitrary asynchronous callback within the room's exclusive lock.
   */
  withLock<T>(
    roomCode: string,
    action: () => Promise<T>,
    correlationId?: string,
    options?: StorageQueryOptions,
  ): Promise<T>;

  /**
   * Saves a room state with CAS version validation.
   */
  save(
    room: RoomState,
    expectedVersion?: number,
    options?: StorageMutationOptions,
  ): Promise<void>;

  /**
   * Atomically creates and persists a room if no room with this roomCode exists.
   */
  createIfAbsent(
    room: RoomState,
    options?: StorageMutationOptions,
  ): Promise<void>;

  /**
   * Deletes a room from storage and clears its pending lock queue and socket indexes.
   */
  delete(
    roomCode: string,
    options?: StorageMutationOptions,
  ): Promise<boolean>;

  /**
   * Lists all active rooms.
   */
  listActiveRooms(
    options?: StorageQueryOptions,
  ): Promise<Readonly<RoomState>[]>;

  /**
   * Returns current active room count.
   */
  count(
    options?: StorageQueryOptions,
  ): Promise<number>;

  /**
   * Clears all room entries and releases all pending lock chains.
   */
  clear(
    options?: StorageMutationOptions,
  ): Promise<void>;
}

export type IRoomStore = RoomStore;
```

### 4.3 Authoritative `SessionRegistry` Interface

**File:** `apps/server/src/features/rooms/session_registry.ts`

```typescript
import { PieceColor } from "@fun-chess/shared";
import type { StorageQueryOptions, StorageMutationOptions } from "./room.store.js";

export interface SessionRecord {
  readonly sessionToken: string;
  readonly playerId: string;
  readonly roomCode: string;
  color: PieceColor;
  readonly isHost: boolean;
  socketId: string;
  readonly createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface SessionRegistry {
  createSession(
    params: {
      playerId: string;
      roomCode: string;
      color: PieceColor;
      isHost: boolean;
      socketId: string;
      ttlMs?: number;
    },
    options?: StorageMutationOptions,
  ): Promise<SessionRecord>;

  validateSession(
    sessionToken: string,
    roomCode: string,
    playerId: string,
    options?: StorageQueryOptions,
  ): Promise<SessionRecord | null>;

  getSessionByToken(
    sessionToken: string,
    options?: StorageQueryOptions,
  ): Promise<SessionRecord | null>;

  getSessionTokenForPlayer(
    roomCode: string,
    playerId: string,
    options?: StorageQueryOptions,
  ): Promise<string | null>;

  touchSession(
    sessionToken: string,
    newSocketId: string,
    extensionTtlMs?: number,
    options?: StorageMutationOptions,
  ): Promise<void>;

  deleteSession(
    sessionToken: string,
    options?: StorageMutationOptions,
  ): Promise<boolean>;

  deleteSessionForPlayer(
    roomCode: string,
    playerId: string,
    options?: StorageMutationOptions,
  ): Promise<boolean>;

  deleteSessionsForRoom(
    roomCode: string,
    options?: StorageMutationOptions,
  ): Promise<number>;

  cleanupExpiredSessions(
    options?: StorageMutationOptions,
  ): Promise<number>;

  updateSessionColor(
    roomCode: string,
    playerId: string,
    newColor: PieceColor,
    options?: StorageMutationOptions,
  ): Promise<void>;

  clear(
    options?: StorageMutationOptions,
  ): Promise<void>;
}

export type ISessionRegistry = SessionRegistry;
```

### 4.4 Cancellation Semantics & In-Flight Abort Handling

1. **Pre-Flight Abort Check:**
   Every method must begin with a check:
   ```typescript
   private assertNotAborted(signal?: AbortSignal): void {
     if (signal?.aborted) {
       throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
     }
   }
   ```
2. **Lock Queue Race Cancellation:**
   In `acquireLock(code, ticket, correlationId, signal)`:
   If `signal` is provided, race the acquisition promise against an abort listener:
   ```typescript
   if (signal) {
     const abortPromise = new Promise<never>((_, reject) => {
       const onAbort = () => {
         signal.removeEventListener("abort", onAbort);
         reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
       };
       signal.addEventListener("abort", onAbort, { once: true });
     });
     // Race prevTail vs acquireTimer vs abortPromise
   }
   ```
   If aborted while queued:
   - Cancel the acquisition timer.
   - Decrement `waitersCount` and delete entry if 0.
   - Record cancelled ticket to prevent stale lock execution.
   - Throw `AbortError`.

---

## 5. Client-Side Storage Contracts

<!-- contract: client-storage-lifecycle -->
<!-- requirement: ENH-014, MIN-004, MIN-015, MIN-016 -->

### 5.1 Architecture Decision Record: 30-Day Opportunistic Deprecation Pruning (ENH-014)

```
Title: ADR-0004: Client-Side Storage 30-Day Opportunistic Deprecation Pruning
Status: Approved
Context:
  Fun Chess migrated puzzle progress storage from legacy v1 keys (`fun_chess_puzzle_progress`,
  `fun_chess_puzzle_progress_v1`) to the canonical v2 schema (`fun_chess_puzzle_progress_v2`).
  A destructive migration would permanently destroy user progress if a client reverted to
  an earlier cached PWA service worker or if a sync anomaly occurred.
  However, browser web applications have no background daemon or cron process when tabs are
  closed. Therefore, legacy storage retention and eventual pruning must be opportunistic.

Decision:
  1. Non-Destructive Initial Migration:
     When v1 data is detected and v2 is absent, v1 data is migrated to v2. The legacy keys are
     NOT deleted immediately. Instead, a deprecation timestamp is recorded:
     `STORAGE_KEYS.PUZZLE_PROGRESS_DEPRECATED_AT = Date.now()`
  2. Retention Window:
     A grace retention window of 30 days is enforced:
     `LEGACY_STORAGE_DEPRECATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000` (2,592,000,000 ms).
  3. Opportunistic Evaluation:
     At client application bootstrap (inside `migrateStorageV1ToV2`), if v2 data exists and
     legacy keys exist:
     - If `referenceNowMs - deprecatedAt < 30 days`: Retain legacy keys for safety.
     - If `referenceNowMs - deprecatedAt >= 30 days`: Safely prune all legacy keys:
       - `storage.removeItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1)`
       - `storage.removeItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY)`
       - `storage.removeItem(STORAGE_KEYS.PUZZLE_PROGRESS_DEPRECATED_AT)`
       - `storage.removeItem(STORAGE_KEYS.MIGRATION_V1_V2_TIMESTAMP)`
  4. Observability:
     Every migration and pruning action emits structured telemetry with duration, correlationId,
     and retention duration metrics.

Consequences:
  - Users have 30 days of rollback tolerance.
  - Zero server overhead or background daemon requirements.
  - After 30 days, device localStorage is cleaned up automatically on the user's next visit.
```

### 5.2 Two-Phase Commit (2PC) Protocol in `LocalStorageUnifiedStore`

The `LocalStorageUnifiedStore.overwriteAll` method coordinates simultaneous overwrites of Academy progress (`ScenarioProgressStore`) and Puzzle progress (`PuzzleProgressStore`) using a strict 2PC protocol with pre-write snapshot and compensating rollback.

```
       Client Trigger: overwriteAll(payload)
                       │
                       ▼
         ┌───────────────────────────┐
         │ Phase 0: Pre-Validation   │ (assertValidProgress(payload))
         └─────────────┬─────────────┘
                       │ (Schema valid)
                       ▼
         ┌───────────────────────────┐
         │ Phase 1: Snapshot Capture │ (deep clone existing state of both stores)
         └─────────────┬─────────────┘
                       │
                       ▼
         ┌───────────────────────────┐
         │ Phase 2: Staged Write     │
         │ - Write Scenario Store    │
         │ - Write Puzzle Store      │
         └─────────────┬─────────────┘
                       │
        ┌──────────────┴──────────────┐
        │ Success                     │ Catch (writeErr)
        ▼                             ▼
┌───────────────┐           ┌───────────────────────────────┐
│ Commit Done   │           │ Compensating Rollback         │
│ Emit log.info │           │ - Restore Scenario from Snap  │
└───────────────┘           │ - Restore Puzzle from Snap    │
                            │ - Dispatch Quota Exceeded Msg │
                            │ - Throw StorageCommitError    │
                            └───────────────────────────────┘
```

#### Deduplication of Scenario Restoration (MIN-016)
Previously, lines 93–104 and 112–123 of `local_storage_unified.store.ts` duplicated the exact same 12-line fallback scenario restoration loop.

**Authoritative Helper Extraction:**
```typescript
/**
 * Restores scenario progress map using atomic batch method when supported,
 * or itemized fallback loop for basic store implementations (MIN-016).
 */
private async applyScenarioProgress(scenarios: ScenarioProgressMap): Promise<void> {
  if (typeof this.scenarioStore.restoreProgressMap === "function") {
    await this.scenarioStore.restoreProgressMap(scenarios);
  } else {
    await this.scenarioStore.resetAllProgress();
    for (const [id, progress] of Object.entries(scenarios)) {
      await this.scenarioStore.saveProgress(
        id,
        progress.starsEarned,
        progress.hintsUsedTotal,
      );
    }
  }
}
```
This helper MUST be called identically in both Phase 2 staged write and Phase 2 compensating rollback.

### 5.3 Progress Store Constructor Standardization & Factories (MIN-004, MIN-015)

#### Problem Analysis
1. **Asymmetric Signatures (MIN-015):**
   - `LocalStoragePuzzleProgressStore`: `(storageKey, storage, clock, logger)`
   - `LocalStorageProgressStore`: `(storageKey, storage, logger, clock)`
   This parameter inversion led to subtle test bugs where a mock clock was passed as a logger or vice versa.
2. **Eager Singletons (MIN-004):**
   - `export const defaultLocalStorageProgressStore = createDefaultLocalStorageProgressStore();`
   Executed at module import time, preventing clean test isolation and risking DOM/localStorage access in non-browser execution contexts.

#### Standardized Options Contract: `StorageOptions`
**File:** `apps/client/src/features/scenarios/store/local_storage_progress.store.ts`

```typescript
export interface ProgressStoreOptions {
  storageKey?: string;
  storage?: KeyValueStorage;
  logger?: ILogger;
  clock?: IClock;
}

export class LocalStorageProgressStore implements ScenarioProgressStore {
  private readonly storageKey: string;
  private readonly storage: KeyValueStorage;
  private readonly logger: ILogger;
  private readonly clock: IClock;

  /**
   * Standard constructor accepting unified options bag (MIN-015),
   * with positional fallback overload for backward compatibility.
   */
  constructor(options?: ProgressStoreOptions);
  constructor(
    storageKey?: string,
    storage?: KeyValueStorage,
    logger?: ILogger,
    clock?: IClock,
  );
  constructor(
    optionsOrKey: ProgressStoreOptions | string = SCENARIO_PROGRESS_STORAGE_KEY,
    storage: KeyValueStorage = safeLocalStorage,
    logger: ILogger = defaultLogger,
    clock?: IClock,
  ) {
    if (typeof optionsOrKey === "object" && optionsOrKey !== null) {
      this.storageKey = optionsOrKey.storageKey ?? SCENARIO_PROGRESS_STORAGE_KEY;
      this.storage = optionsOrKey.storage ?? safeLocalStorage;
      this.logger = optionsOrKey.logger ?? defaultLogger;
      this.clock = optionsOrKey.clock ?? new SystemClock();
    } else {
      this.storageKey = optionsOrKey;
      this.storage = storage;
      this.logger = logger;
      this.clock = clock ?? new SystemClock();
    }
  }
  // ...
}
```

#### Factory Pattern & Elimination of Module-Level Singletons (MIN-004)
1. **Remove Eager Singletons:**
   Remove top-level instantiation:
   ```typescript
   // DELETE (MIN-004):
   // export const defaultLocalStorageProgressStore = createDefaultLocalStorageProgressStore();
   ```
2. **Export Pure Factories:**
   ```typescript
   export function createLocalStorageProgressStore(
     options?: ProgressStoreOptions,
   ): LocalStorageProgressStore {
     return new LocalStorageProgressStore(options);
   }
   ```
3. **Dependency Injection Wiring:**
   Instantiate stores inside `createFunChessApp()` or within Vue `provide`:
   ```typescript
   export const SCENARIO_PROGRESS_STORE_KEY: InjectionKey<ScenarioProgressStore> =
     Symbol("ScenarioProgressStore");
   export const UNIFIED_PROGRESS_STORE_KEY: InjectionKey<ProgressStorage> =
     Symbol("UnifiedProgressStore");
   ```

---

## 6. Implementation Traceability Matrix & Builder Task Assignments

| Scope Card | Target File | Contract Section | Finding IDs | Builder Instructions |
|---|---|---|---|---|
| **SC-1** | `shared/src/contracts/models.ts` | §1.2 | MIN-025 | Update `Player` interface with `readonly createdAt: number` and `updatedAt: number`. |
| **SC-1** | `shared/src/contracts/schemas.ts` | §1.3 | MIN-025 | Add `createdAt` and `updatedAt` non-negative number validations to `PlayerSchema`. |
| **SC-1** | `shared/src/utils/session_token.ts` | §3.1 | MAJ-004 | Implement `signSessionToken` and `verifySessionToken` using HMAC-SHA256 and constant-time comparison. |
| **SC-2** | `apps/server/src/platform/http/http_server.ts` | §3.3 | CRIT-002 | Remove session tokens from `extractHttpUserId`; ensure user IDs are never bearer tokens. |
| **SC-2** | `apps/server/src/platform/logger/pino_logger.ts` | §3.3 | CRIT-002, ENH-007 | Add `x-session-token`, `session-token` to redaction paths. |
| **SC-3** | `apps/server/src/features/rooms/room.store.ts` | §4.2 | ENH-015 | Add `options?: StorageQueryOptions` / `options?: StorageMutationOptions` with `signal?: AbortSignal`. |
| **SC-3** | `apps/server/src/features/rooms/session_registry.ts` | §4.3 | ENH-015 | Add `options?: StorageQueryOptions` / `options?: StorageMutationOptions` with `signal?: AbortSignal`. |
| **SC-3** | `apps/server/src/features/rooms/in_memory_room.store.ts` | §2.2, §2.3, §4.4 | MIN-028, ENH-013, ENH-015 | Re-index on fallback lookup (`this.indexSockets(room)`); deep-freeze on write and return frozen pointers on read; support `AbortSignal`. |
| **SC-3** | `apps/server/src/features/rooms/in_memory_session_registry.ts` | §3.1, §3.2, §3.3, §4.3 | CRIT-002, MAJ-004, ENH-015 | Integrate HMAC-SHA256 signing and verification; scrub cleartext session tokens from all logs; support `AbortSignal`. |
| **SC-4** | `apps/client/src/platform/storage/migration.ts` | §5.1 | ENH-014 | Document 30-day opportunistic deprecation pruning in ADR; ensure graceful retention. |
| **SC-4** | `apps/client/src/features/portability/store/local_storage_unified.store.ts` | §5.2 | MIN-016 | Extract `applyScenarioProgress` helper to deduplicate fallback scenario restoration. |
| **SC-5** | `apps/client/src/features/scenarios/store/local_storage_progress.store.ts` | §5.3 | MIN-004, MIN-015 | Support standardized `ProgressStoreOptions`; export factory `createLocalStorageProgressStore`; eliminate eager singleton. |

---

## 7. Verification & Acceptance Criteria

Every builder implementing components specified in this contract must verify:
1. **Typecheck:** `pnpm run typecheck` passes with zero errors across all workspaces (`shared`, `apps/server`, `apps/client`, `apps/e2e`).
2. **Lint:** `pnpm run lint` passes with zero errors and zero warnings.
3. **Unit Tests:**
   - `in_memory_room.store.spec.ts`: Tests verify fallback lookup re-indexing, read-query immutability (`Object.isFrozen`), and `AbortSignal` cancellation.
   - `session_registry.spec.ts`: Tests verify HMAC-SHA256 signature verification, rejection of tampered tokens, token masking in logger spies, and `AbortSignal` cancellation.
   - `local_storage_unified.store.spec.ts` & `local_storage_unified_store_2pc.spec.ts`: Tests verify 2PC commit, compensating rollback, and deduplicated scenario restoration.
   - `create_puzzle_progress_store.spec.ts` & scenario store specs: Tests verify factory instantiation and options bag initialization.
4. **Coverage Gate:** Server branch coverage meets or exceeds the mandatory >= 85.00% threshold.
