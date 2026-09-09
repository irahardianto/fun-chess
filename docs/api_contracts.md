---
spec_id: tsd-fun-chess-remediation-contracts
doc_type: tsd
version: 1.0.0
status: frozen
title: "Fun-Chess Monorepo API & WebSocket Contracts Specification"
created_at: "2026-09-09T07:00:00Z"
updated_at: "2026-09-09T07:00:00Z"
authors:
  - "@architect"
reviewers:
  - "@conductor"
  - "@tech-lead[shared-contracts]"
  - "@tech-lead[server-platform]"
  - "@tech-lead[server-gameplay]"
  - "@tech-lead[client-features]"
dependencies:
  specs:
    - ".agentwork/brief.md"
  audit_findings:
    - "MIN-024"
    - "MAJ-002"
    - "MAJ-003"
    - "MIN-025"
    - "MAJ-005"
    - "MAJ-006"
    - "MIN-023"
---

# Fun-Chess Monorepo API & WebSocket Contracts Specification

## 1. Overview and Executive Summary

<!-- requirement: REQ-CONTRACT-001 -->
This document serves as the **authoritative, frozen integration contract** for all inter-package communication, WebSocket event exchanges, concurrency control semantics, and serialization schemas across the Fun-Chess monorepo (`@fun-chess/shared`, `@fun-chess/server`, and `@fun-chess/client`).

All Tech-Leads and Builders executing Waves 1 through 4 MUST conform strictly to the interfaces, payloads, schemas, error codes, and lifecycle invariants documented herein. Any deviation is considered a breaking change and will fail the independent `@reviewer` verification gate.
<!-- end requirement -->

---

## 2. WebSocket Event Interfaces and Payloads

### 2.1 `room:create` Ack Response Contract (MIN-024)

<!-- requirement: REQ-CONTRACT-MIN-024 -->
#### 2.1.1 Problem Statement & Asymmetry Analysis
Prior to remediation, the Socket.IO acknowledgement callback for `room:create` returned only `{ success: true, room: RoomState, sessionToken: string }`, whereas `room:join` and `room:reconnect` returned `{ success: true, room: RoomState, player: Player, sessionToken: string }`. 

This asymmetry forced client transport composables to either invent placeholder `Player` objects or parse `room.players` to locate the creator's identity, violating the single source of truth and leading to potential race conditions during initial lobby mount.
<!-- end requirement -->

<!-- contract: CONTRACT-ROOM-CREATE-EVENT -->
#### 2.1.2 Interface Contract Definition

In `shared/src/contracts/events.ts`:

```typescript
export interface ClientToServerEvents {
  /**
   * Creates a new game room; returns private session credentials and authoritative player profile in ack callback.
   * Conforms to MIN-024 contract symmetry with room:join and room:reconnect.
   */
  "room:create": (
    req: CreateRoomRequest,
    callback?: (
      res:
        | {
            success: true;
            room: RoomState;
            player: Player;
            sessionToken: string;
          }
        | {
            success: false;
            error: SocketErrorPayload;
          },
    ) => void,
  ) => void;
  
  // ... other client-to-server events
}
```

#### 2.1.3 Server Execution & Ack Emission Contract

In `apps/server/src/features/rooms/room.socket_handler.ts`:

```typescript
// Operation: room:create
const handleCreate = createRoomHandler<
  CreateRoomRequest,
  { success: true; room: RoomState; player: Player; sessionToken: string }
>(
  logger,
  "room:create",
  socket,
  {
    schema: CreateRoomRequestSchema as any,
    rateLimiter: roomCreateRateLimiter, // MAJ-006 differential limiter
  },
  async (req, context) => {
    const result = await roomService.createRoom(
      {
        playerName: req.playerName,
        avatar: req.avatar,
        preferredColor: req.preferredColor,
      },
      socket.id,
    );

    // Bind authenticated userId to socket session context for subsequent telemetry (MAJ-023)
    socket.data.userId = result.player.id;
    socket.data.roomCode = result.room.code;

    // Join Socket.io room channel
    await socket.join(result.room.code);

    return {
      success: true,
      room: result.room,
      player: result.player,
      sessionToken: result.sessionToken,
    };
  },
);
```

#### 2.1.4 Client Handling Contract

In `apps/client/src/features/multiplayer/composables/useRoomSession.ts` and `useSocketTransport.ts`:

1. Upon receiving `{ success: true, room, player, sessionToken }`, client MUST:
   - Store `player` in reactive state `currentLocalPlayer.value = res.player`.
   - Store session token via `storage.setItem(SESSION_STORAGE_KEY, { roomCode: room.code, playerId: player.id, sessionToken })`.
   - Mount local lobby view with player identity confirmed without querying room arrays.
<!-- end contract -->

---

### 2.2 `room:player_left` Broadcast on Host Lobby Departure (MAJ-002)

<!-- requirement: REQ-CONTRACT-MAJ-002 -->
#### 2.2.1 Problem Statement & Ghost Room Deadlock
When a room host voluntarily leaves during the `lobby` phase (prior to game start), `room.logic.ts` evaluates `result.shouldDelete === true`. In `room.socket_handler.ts`, the handler correctly purged timers and deleted the room from `roomStore` and `sessionRegistry`, but **skipped emitting any notification to the guest player sitting in the room**.

As a consequence, the guest remained trapped in a dead lobby view. Subsequent interactions by the guest triggered `ERR_ROOM_NOT_FOUND` (404), producing a stranded, broken UX.
<!-- end requirement -->

<!-- contract: CONTRACT-ROOM-PLAYER-LEFT-BROADCAST -->
#### 2.2.2 Event Contract Specification

In `shared/src/contracts/events.ts`:

```typescript
export interface ServerToClientEvents {
  /**
   * Broadcast to room members when a player leaves the room.
   * When a host leaves in the lobby phase, this event is dispatched to all remaining occupants
   * before the room channel is torn down (MAJ-002).
   */
  "room:player_left": (data: {
    playerId: string;
    playerName: string;
    reason: "player_left" | "host_left" | "kicked" | "room_closed";
  }) => void;
  
  // ... other server-to-client events
}
```

#### 2.2.3 Server Emission Sequence Contract

In `apps/server/src/features/rooms/room.socket_handler.ts`:

When `roomService.leaveRoom` completes:
1. Extract `roomCode = req.roomCode.toUpperCase()`.
2. Inspect `result.shouldDelete`:
   - If `result.shouldDelete === true`:
     - **MANDATORY BROADCAST**: Server MUST broadcast `room:player_left` to all other sockets in the room channel *before* clearing room state:
       ```typescript
       socket.to(roomCode).emit("room:player_left", {
         playerId: result.player.id,
         playerName: result.player.name,
         reason: result.player.isHost ? "host_left" : "player_left",
       });
       ```
     - Cancel all disconnect timers for `roomCode`: `timerRegistry.cancelAllForRoom(roomCode)`.
     - Force remaining sockets in `roomCode` to leave the Socket.io room channel:
       ```typescript
       const socketsInRoom = await io.in(roomCode).fetchSockets();
       for (const s of socketsInRoom) {
         await s.leave(roomCode);
       }
       ```
   - If `result.gameOverPayload` is present (in-game resignation / forfeit):
     - Broadcast `game:over` to `io.to(roomCode).emit("game:over", result.gameOverPayload)`.
   - Otherwise (guest leaves lobby, match continues or returns to waiting):
     - Broadcast `room:player_left` to `socket.to(roomCode)`.

3. Finally, execute `await socket.leave(roomCode)` for the leaving player and return `{ success: true }`.

#### 2.2.4 Client Reaction & State Cleanup Contract

In `apps/client/src/features/multiplayer/composables/useSocketTransport.ts` / `LobbyView.vue`:

```typescript
// Registered via createInboundHandler("room:player_left", ...)
onPlayerLeft((payload) => {
  logger.info("Room player left notification received", {
    operation: "socket_player_left",
    playerId: payload.playerId,
    reason: payload.reason,
  });

  if (payload.reason === "host_left") {
    // Notify user host has disbanded the room
    showNotification({
      type: "warning",
      message: "The host has left and closed this game room.",
    });
    // Teardown local session and transition to lobby browser/home
    resetRoomSession();
    router.push({ name: "lobby" });
  } else {
    // Standard guest departure in active room: update player slot in state
    removePlayerFromRoom(payload.playerId);
  }
});
```
<!-- end contract -->

---

### 2.3 Move Submission & Idempotency Key Ingress Contract (MAJ-003)

<!-- requirement: REQ-CONTRACT-MAJ-003 -->
#### 2.3.1 Problem Statement & Client Validation Bypass
`MakeMoveRequestSchema` in `shared/src/contracts/schemas.ts` previously defined `idempotencyKey: z.string().uuid().optional()`. 

In `apps/client/src/features/multiplayer/composables/useGameActions.ts`, client-side code generated or accepted non-UUID tokens, caught the schema validation error, and forcibly bypassed validation via `as any`. When the raw payload reached the server, `MakeMoveRequestSchema.safeParse` strictly enforced `.uuid()`, dropping moves with `ERR_INVALID_PAYLOAD`.
<!-- end requirement -->

<!-- contract: CONTRACT-MAKE-MOVE-SCHEMA -->
#### 2.3.2 Shared Schema Specification

In `shared/src/contracts/schemas.ts`:

```typescript
/**
 * Socket request schema for submitting a move in an active game room.
 * Accepts RFC 4122 UUID or any safe unique client string token (1-64 chars)
 * to support UUID, nanoid, or cryptographic hex digests without client bypass (MAJ-003).
 */
export const MakeMoveRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  move: MovePayloadSchema,
  /**
   * Expected move counter (half-moves / plies count before applying this move).
   * Used by server for linearizability validation and idempotency deduplication.
   */
  expectedMoveNumber: z.number().int().nonnegative().optional(),
  /**
   * Client-generated idempotency token.
   * Can be a standard UUIDv4 or any alphanumeric/hyphenated token (1 to 64 chars).
   */
  idempotencyKey: z
    .string()
    .min(1, "Idempotency key must not be empty")
    .max(64, "Idempotency key cannot exceed 64 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Idempotency key must be alphanumeric, hyphen, or underscore")
    .optional(),
});
export type MakeMoveRequest = z.infer<typeof MakeMoveRequestSchema>;
```

#### 2.3.3 Client Ingress Remediation Contract

In `apps/client/src/features/multiplayer/composables/useGameActions.ts`:

1. **REMOVE COMPLETELY** the bypass block:
   ```typescript
   // DELETED:
   // if (!validationResult.success && typeof idempotencyKey === 'string') { ... as any }
   ```
2. Parse payload directly and strictly with `MakeMoveRequestSchema`:
   ```typescript
   const validationPayload: MakeMoveRequest = {
     roomCode,
     move,
     expectedMoveNumber,
     idempotencyKey,
   };

   const validationResult = MakeMoveRequestSchema.safeParse(validationPayload);
   if (!validationResult.success) {
     const err = createValidationError(validationResult.error);
     transport.lastError.value = err;
     logger.warn("Make move validation failed", {
       operation: "socket_game_move",
       correlationId,
       issues: validationResult.error.issues,
     });
     return { success: false, error: err };
   }
   ```
<!-- end contract -->

---

### 2.4 Promotion Piece Model & Schema Reconciliation (MIN-025)

<!-- requirement: REQ-CONTRACT-MIN-025 -->
#### 2.4.1 Type Drift Analysis
In standard chess (FIDE laws), a pawn can only promote to Queen (`q`), Rook (`r`), Bishop (`b`), or Knight (`n`).
- `shared/src/contracts/schemas.ts` defined:
  `PromotionPieceSchema = z.enum(["q", "r", "b", "n"])`
- But `shared/src/contracts/models.ts` defined:
  `MoveResult.promotion?: PieceType` where `PieceType = "p" | "n" | "b" | "r" | "q" | "k"`

This allowed `p` (pawn) and `k` (king) as promotion targets at the TypeScript interface layer, causing type drift, unsafe type assertions (`as PieceType` in `chess_engine.ts`), and discrepancies in piece valuation engines.
<!-- end requirement -->

<!-- contract: CONTRACT-PROMOTION-TYPES -->
#### 2.4.2 Canonical Type Definition

In `shared/src/contracts/models.ts`:

```typescript
/**
 * Pawn promotion piece target symbol strictly limited to legal chess promotion targets ('q', 'r', 'b', 'n').
 * Conforms to FIDE laws and reconciles with PromotionPieceSchema (MIN-025).
 */
export type PromotionPiece = "q" | "r" | "b" | "n";

/**
 * Result of an executed chess move.
 */
export interface MoveResult {
  from: string;
  to: string;
  san: string;
  piece: PieceType;
  color: PieceColor;
  captured?: PieceType;
  /** Promoted piece type, if this move was a legal pawn promotion */
  promotion?: PromotionPiece;
  flags: string;
  fen: string;
  moveNumber: number;
  timestamp: number;
}
```

In `shared/src/contracts/schemas.ts`:

```typescript
export const PromotionPieceSchema = z.enum(["q", "r", "b", "n"]);
export type PromotionPieceDto = z.infer<typeof PromotionPieceSchema>;
```

In `apps/server/src/features/game/chess_engine.ts`:

```typescript
// Casting promotion piece strictly to PromotionPiece instead of PieceType
promotion: moveResultObj.promotion
  ? (moveResultObj.promotion as PromotionPiece)
  : undefined,
```
<!-- end contract -->

---

## 3. Concurrency & Error Prototype Contracts

### 3.1 Single Source of Truth `OptimisticLockConflictError` (MAJ-005)

<!-- requirement: REQ-CONTRACT-MAJ-005 -->
#### 3.1.1 Root Cause & Prototype Pollution
Two independent definitions of `OptimisticLockConflictError` existed:
1. `shared/src/contracts/errors.ts`
2. `apps/server/src/features/rooms/room.errors.ts`

Because JavaScript `instanceof` verifies prototype identity across the inheritance chain, an error thrown by `InMemoryRoomStore` or `RoomStore` failed `instanceof OptimisticLockConflictError` checks inside `GameService` or socket controllers, treating transient 409 concurrency conflicts as unhandled 500 crashes.
<!-- end requirement -->

<!-- contract: CONTRACT-OPTIMISTIC-LOCK-ERROR -->
#### 3.1.2 Canonical Error Contract

In `shared/src/contracts/errors.ts`:

```typescript
/**
 * Error thrown when an optimistic concurrency control version check fails during a room mutation.
 * Single source of truth for prototype identity across all monorepo packages (MAJ-005).
 */
export class OptimisticLockConflictError extends AppError {
  public readonly roomCode: string;
  public readonly expectedVersion: number;
  public readonly actualVersion: number;

  constructor(roomCode: string, expectedVersion: number, actualVersion: number) {
    super(
      "ERR_CONFLICT",
      `State conflict for room '${roomCode}': expected version ${expectedVersion}, found ${actualVersion}. The room was updated concurrently.`,
      409,
      { roomCode, expectedVersion, actualVersion },
    );
    this.name = "OptimisticLockConflictError";
    this.roomCode = roomCode;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;

    // Explicitly restore prototype chain for transpiled ES5/CommonJS/ESM interop
    Object.setPrototypeOf(this, OptimisticLockConflictError.prototype);
  }
}
```

#### 3.1.3 Package Re-export Contract

In `apps/server/src/features/rooms/room.errors.ts`:

```typescript
// DELETE the duplicate class declaration!
// RE-EXPORT directly from shared contracts:
export { OptimisticLockConflictError } from "@fun-chess/shared";
```

Any code handling CAS concurrency failures MUST import `OptimisticLockConflictError` directly from `@fun-chess/shared` or through `apps/server/src/features/rooms/index.ts`.
<!-- end contract -->

---

## 4. Differential Rate Limiting & DoS Protection Contracts (MAJ-006, MAJ-011)

<!-- requirement: REQ-CONTRACT-MAJ-006 -->
#### 4.1 Threat Model & Capacity Analysis
The Fun-Chess server maintains an in-memory limit of 10,000 concurrent rooms (`MAX_ROOMS = 10_000` in `InMemoryRoomStore`). 

Prior to remediation, a single rate limiter configured with 60 requests / 10 seconds was applied across all operations. An attacker sending 6 `room:create` requests per second could allocate all 10,000 rooms in ~27 minutes, exhausting server heap memory and locking out all legitimate players until the 10-minute idle cleanup job ran.
<!-- end requirement -->

<!-- contract: CONTRACT-RATE-LIMITING -->
### 4.2 Differential Rate Limiter Specifications

The system enforces **two distinct rate limit tiers**:

| Limiter Scope | Target Operations | Max Requests | Sliding Window | Prune Interval | Max Keys (LRU) |
|---|---|---|---|---|---|
| **Room Creation Tier** | `room:create` | **3 requests** | **60,000 ms (1 min)** | 60,000 ms | 10,000 |
| **Gameplay & Socket Tier** | `game:move`, `room:join`, `room:reconnect`, `room:leave` | **60 requests** | **10,000 ms (10 sec)** | 60,000 ms | 10,000 |

#### 4.3 Architecture & Singleton Lifecycle Contract (MAJ-011)

To prevent resource leaks caused by default argument instantiation (`rateLimiter = createSocketRateLimiter()` in function signatures), rate limiters MUST be instantiated as **shared singletons** or constructor-injected instances:

In `apps/server/src/platform/socket/socket_rate_limiter.ts`:

```typescript
/**
 * Dedicated rate limiter for room creation (expensive resource allocation).
 * Limit: 3 rooms per minute per IP address (MAJ-006).
 */
export const roomCreateRateLimiter = new SocketRateLimiter({
  maxRequests: 3,
  windowMs: 60_000,
  maxKeys: 10_000,
  pruneIntervalMs: 60_000,
});

/**
 * Shared rate limiter for gameplay actions and general socket interactions.
 * Limit: 60 operations per 10 seconds per IP address.
 */
export const defaultSocketRateLimiter = new SocketRateLimiter({
  maxRequests: 60,
  windowMs: 10_000,
  maxKeys: 10_000,
  pruneIntervalMs: 60_000,
});
```

#### 4.4 Rate Limit Error Wire Format

When rate limit is exceeded, the server returns a standardized `SocketErrorPayload`:

```json
{
  "success": false,
  "error": {
    "code": "ERR_RATE_LIMITED",
    "message": "Rate limit exceeded for room creation. Maximum 3 requests per 60 seconds allowed.",
    "statusCode": 429,
    "details": {
      "retryAfterMs": 18450
    }
  }
}
```
<!-- end contract -->

---

## 5. Sliding TTL Session Registry Contract (MIN-023)

<!-- requirement: REQ-CONTRACT-MIN-023 -->
#### 5.1 Root Cause Analysis
`InMemorySessionRegistry` allocated a hard expiration timestamp upon session creation: `expiresAt = now + DEFAULT_TTL_MS` (2 hours). 

In `touchSession(sessionToken, newSocketId)`, the registry updated `socketId` and `lastSeenAt`, but **never extended `expiresAt`**. In matches exceeding 2 hours or games with reconnection intervals, valid active sessions were prematurely expired by `validateSession` and purged, disconnecting ongoing players.
<!-- end requirement -->

<!-- contract: CONTRACT-SLIDING-TTL -->
### 5.2 Session Registry Method Contract

In `apps/server/src/features/rooms/session_registry.ts` & `in_memory_session_registry.ts`:

```typescript
export interface SessionRegistry {
  createSession(params: {
    playerId: string;
    roomCode: string;
    color: PieceColor;
    isHost: boolean;
    socketId: string;
    ttlMs?: number;
  }): Promise<SessionRecord>;

  validateSession(
    sessionToken: string,
    roomCode: string,
    playerId: string,
  ): Promise<SessionRecord | null>;

  /**
   * Refreshes socket binding and slides the expiration window forward by ttlMs (MIN-023).
   * Guarantees active players in long matches are never purged.
   *
   * @param sessionToken - Private session token
   * @param newSocketId - Current active socket connection ID
   * @param extensionTtlMs - Duration to extend expiration from current time (defaults to 2 hours)
   */
  touchSession(
    sessionToken: string,
    newSocketId: string,
    extensionTtlMs?: number,
  ): Promise<void>;

  updateSessionColor(
    roomCode: string,
    playerId: string,
    newColor: PieceColor,
  ): Promise<void>;

  deleteSession(sessionToken: string): Promise<boolean>;
  deleteSessionsByRoom(roomCode: string): Promise<number>;
  cleanupExpiredSessions(): Promise<number>;
}
```

#### 5.3 Implementation Invariants

In `apps/server/src/features/rooms/in_memory_session_registry.ts`:

```typescript
public async touchSession(
  sessionToken: string,
  newSocketId: string,
  extensionTtlMs?: number,
): Promise<void> {
  const record = this.sessions.get(sessionToken);
  if (!record) return;

  const now = this.clock.now();
  const ttl = extensionTtlMs ?? this.DEFAULT_TTL_MS;

  record.socketId = newSocketId;
  record.lastSeenAt = now;
  // Sliding expiration window: extend from current active timestamp
  record.expiresAt = now + ttl;
}
```

#### 5.4 Ingress Touch Points
`touchSession` MUST be invoked during:
1. `room:reconnect` socket handling.
2. `room:join` socket handling (if session already exists).
3. `game:move` handling to keep session alive during active gameplay.
<!-- end contract -->

---

## 6. Contract Verification Checklist

| Contract Area | Finding Ref | Test Suite | Verification Command |
|---|---|---|---|
| Room Create Ack `player` | MIN-024 | `apps/server/src/features/rooms/__tests__/room.socket_handler.spec.ts` | `pnpm --filter @fun-chess/server test` |
| Host Lobby Leave Broadcast | MAJ-002 | `apps/server/src/features/rooms/__tests__/room.socket_handler.spec.ts` | `pnpm --filter @fun-chess/server test` |
| Idempotency Key Ingress | MAJ-003 | `apps/client/src/features/multiplayer/__tests__/useGameActions.spec.ts` | `pnpm --filter @fun-chess/client test` |
| Promotion Type Reconciliation | MIN-025 | `shared/src/__tests__/schemas.spec.ts` | `pnpm --filter @fun-chess/shared test` |
| Single Error Prototype | MAJ-005 | `apps/server/src/features/rooms/__tests__/room.errors.spec.ts` | `pnpm --filter @fun-chess/server test` |
| Differential Rate Limiting | MAJ-006, MAJ-011 | `apps/server/src/platform/socket/__tests__/socket_rate_limiter.spec.ts` | `pnpm --filter @fun-chess/server test` |
| Sliding TTL Session | MIN-023 | `apps/server/src/features/rooms/__tests__/in_memory_session_registry.spec.ts` | `pnpm --filter @fun-chess/server test` |
