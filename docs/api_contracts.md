# API & Integration Contracts

> **Status: FROZEN ARCHITECTURAL CONTRACT**
> **Phase: DESIGN**
> **Author: System Architect (@architect)**
> **Audience: Builders (@backend-engineer, @frontend-engineer, @tech-lead, @test-automation-engineer)**
> **Context: Remediating Full Codebase Audit Findings (CRIT-001, MAJ-001 through MAJ-013, MIN-001 through MIN-027)**

---

## 1. HTTP Ingress Security & Observability Contract

### 1.1 `x-correlation-id` Header Validation & Sanitization (MAJ-001)

#### Threat Model & Rationale
Untrusted HTTP clients can supply arbitrary headers. Reflected headers or headers passed directly to structured logging without validation risk CRLF injection, log format disruption, and payload expansion attacks.

#### Contract Specification
- **Allowlist Regular Expression**: `/^[a-zA-Z0-9_-]{8,64}$/`
- **Behavior**:
  1. Inspect `req.headers["x-correlation-id"]`. If header is an array, inspect the first element `header[0]`.
  2. If the trimmed string strictly matches `/^[a-zA-Z0-9_-]{8,64}$/`, accept it as the authoritative `correlationId`.
  3. If missing, empty, invalid type, or failing regex validation, discard it and generate a cryptographically secure fallback via `randomUUID()` (`node:crypto`).
- **Response Header**: Echo the sanitized/fallback `x-correlation-id` on all responses via `res.setHeader("x-correlation-id", correlationId)`.
- **Log Context**: All HTTP logs (access logs, rejection logs, error logs) MUST bind this sanitized `correlationId`.

#### Canonical Implementation Reference
```typescript
import { randomUUID } from "node:crypto";

export const CORRELATION_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

export function sanitizeCorrelationId(headerValue?: string | string[]): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof candidate === "string" && CORRELATION_ID_REGEX.test(candidate.trim())) {
    return candidate.trim();
  }
  return randomUUID();
}
```

---

### 1.2 Health & Telemetry Endpoints Pipeline (MAJ-002, MIN-007, MIN-008)

#### Routing Order & Middleware Sequence
To prevent unmetered denial-of-service on health and telemetry endpoints, rate limiting MUST execute **before** health/telemetry route handlers.

The HTTP request handler in `apps/server/src/platform/http/http_server.ts` MUST enforce the following linear pipeline:
```
1. Extract & Sanitize correlationId (/^[a-zA-Z0-9_-]{8,64}$/ -> randomUUID)
2. Record startTime (performance.now())
3. Apply Security Headers (CSP, X-Content-Type-Options, etc.)
4. Apply CORS & Handle Preflight OPTIONS (Early 204 Return)
5. EVALUATE RATE LIMITING (handleRateLimitCheck)
   └── If limit exceeded: log "http_rate_limited" (with durationMs) -> return 429
6. EVALUATE HEALTH & TELEMETRY ROUTES (handleHealthRoutes)
   ├── /healthz              -> 200 "OK" (Operation: "health_readiness")
   ├── /health, /api/health  -> 200 JSON (Operation: "health_liveness")
   └── /metrics, /health/detail -> Guard Check -> 200 JSON (Operation: "health_telemetry")
7. EVALUATE STATIC ASSETS / SPA FALLBACK (handleStaticRoutes)
8. EVALUATE LAN INFO ROUTE (/api/lan-info)
9. UNHANDLED ROUTE -> 404 Standard Error Envelope
```

#### Telemetry Authorization Contract (`/metrics` and `/health/detail`)
Access to operational telemetry disclosing active room count, active socket count, and memory metrics must be restricted:

1. **Authorization Rule**:
   - Callers are authorized if ANY of the following conditions are met:
     a. **Loopback Address**: Client IP matches IPv4 loopback (`127.0.0.1`), IPv6 loopback (`::1`), or IPv4-mapped IPv6 loopback (`::ffff:127.0.0.1`).
     b. **Secret Header Match**: If `METRICS_SECRET` is configured in environment/config, the request supplies matching credentials via either `x-metrics-secret: <secret>` or `Authorization: Bearer <secret>`.
     c. **Open in Non-Production without Secret**: If `NODE_ENV !== "production"` and `METRICS_SECRET` is unset, access is permitted for local development.
2. **Rejection Response**:
   - If unauthorized: HTTP `403 Forbidden`
   - Content-Type: `application/json; charset=utf-8`
   - Standard Error Envelope:
     ```json
     {
       "error": {
         "code": "ERR_UNAUTHORIZED",
         "message": "Telemetry access restricted to authorized callers or loopback",
         "statusCode": 403,
         "correlationId": "<correlationId>",
         "timestamp": "2026-09-09T19:40:00.000Z"
       }
     }
     ```

#### Telemetry Guard Helper Specification
```typescript
export interface TelemetryAuthParams {
  clientIp: string;
  headers: Record<string, string | string[] | undefined>;
  metricsSecret?: string;
  isProduction: boolean;
}

export function isTelemetryAuthorized(params: TelemetryAuthParams): boolean {
  const { clientIp, headers, metricsSecret, isProduction } = params;

  // 1. Loopback check
  const isLoopback =
    clientIp === "127.0.0.1" ||
    clientIp === "::1" ||
    clientIp === "::ffff:127.0.0.1";
  if (isLoopback) return true;

  // 2. Secret token match
  if (metricsSecret) {
    const rawSecretHeader = headers["x-metrics-secret"];
    const secretHeader = Array.isArray(rawSecretHeader)
      ? rawSecretHeader[0]
      : rawSecretHeader;
    if (secretHeader && secretHeader === metricsSecret) return true;

    const rawAuth = headers["authorization"];
    const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token === metricsSecret) return true;
    }
    return false;
  }

  // 3. Permitted in non-production if no secret configured
  return !isProduction;
}
```

#### Standardized Health Operation Names & Duration Logging (MIN-007, MIN-008)
- All health route completions MUST emit specific `operation` names instead of generic `"http_request"`:
  - `/healthz` -> `operation: "health_readiness"`
  - `/health` or `/api/health` -> `operation: "health_liveness"`
  - `/metrics` or `/health/detail` -> `operation: "health_telemetry"`
- `handleRateLimitCheck` MUST receive `startTime: number` and include both `duration: number` and `durationMs: number` in the `http_rate_limited` log record.

---

## 2. Socket.io Event & Callback Contracts

### 2.1 `room:player_disconnected` Event Contract Alignment (MAJ-008)

#### Divergence Resolved
In previous iterations, `shared/src/contracts/events.ts` defined optional fields `player?: Player` and `disconnectedAt?: number` which were never populated by the server. This created dead branches in client code (`useRoomSession.ts:136`).

#### Authoritative Contract (`shared/src/contracts/events.ts`)
```typescript
export interface PlayerDisconnectedPayload {
  playerId: string;
  gracePeriodMs?: number;
  roomStatus: RoomStatus;
}

export interface ServerToClientEvents {
  // ...
  /** Broadcast when a player disconnects, specifying reconnection grace period and authoritative room status */
  "room:player_disconnected": (data: {
    playerId: string;
    gracePeriodMs?: number;
    roomStatus: RoomStatus;
  }) => void;
  // ...
}
```

#### Server Emission Contract (`room.socket_handler.ts`)
```typescript
io.to(room.roomCode).emit("room:player_disconnected", {
  playerId: player.id,
  gracePeriodMs,
  roomStatus: room.status,
});
```

#### Client Consumption Contract (`useRoomSession.ts`)
```typescript
function handleRoomPlayerDisconnected(data: {
  playerId: string;
  gracePeriodMs?: number;
  roomStatus: RoomStatus;
}) {
  if (!currentRoom.value) return;
  const disconnectedId = data.playerId;
  // Authoritatively update disconnected player connectivity and room status
  // ...
}
```

---

### 2.2 `room:reconnect` Ack Return Type Narrowing (MAJ-008)

#### Divergence Resolved
The server-side ack callback for `room:reconnect` used `roomStatus?: string` instead of the constrained `RoomStatus` union, weakening type safety across the boundary.

#### Authoritative Contract (`shared/src/contracts/events.ts`)
```typescript
export interface ClientToServerEvents {
  // ...
  /** Re-authenticates an interrupted session using private credentials */
  "room:reconnect": (
    req: ReconnectRequest,
    callback?: (
      res:
        | {
            success: true;
            room: RoomState;
            player: Player;
            roomStatus: RoomStatus;
          }
        | { success: false; error: SocketErrorPayload },
    ) => void,
  ) => void;
  // ...
}
```

---

### 2.3 `room:create` and `room:join` Emission Semantics (Dual-Delivery Elimination, MAJ-008)

#### Architecture Decision: Single Authoritative Ingress Channel
When a socket issues `room:create` or `room:join` with an acknowledgment callback, sending the room state via both the callback and a separate socket event (`room:created` / `room:joined`) causes dual delivery, leading to race conditions and unpredictable state assignment order on high-latency networks.

#### Authoritative Emission Semantics
1. **Creator / Joiner State Delivery**:
   - The creator or joiner receives their initial `room`, `player`, and `sessionToken` **strictly through the acknowledgment callback**.
   - The server **MUST NOT** emit `"room:created"` or `"room:joined"` to the initiating socket (`socket.emit` calls removed).
2. **Peer Socket Notification**:
   - For `room:join`, other participants already in the room receive the update via peer broadcast:
     ```typescript
     socket.to(roomCode).emit("room:player_joined", {
       player: sanitizePublicPlayer(result.player),
       room: sanitizePublicRoom(result.room),
     });
     ```
   - If the room becomes full (status transition to `"playing"`), all sockets in the room (including the joiner) receive the game start broadcast:
     ```typescript
     io.to(roomCode).emit("game:started", result.room.game);
     ```
3. **Deprecation Status of `room:created` and `room:joined`**:
   - `"room:created"` and `"room:joined"` in `ServerToClientEvents` are marked `@deprecated` and retained for backwards compatibility with older client stubs, but will no longer be emitted by the server during standard room creation/join flows.

---

## 3. Feature Service & Dependency Injection Contracts

### 3.1 `RoomService` Constructor & Dependencies (MAJ-005)

#### Architecture Rule: Rule 3 (Dependency Direction)
Business logic services must not self-wire concrete infrastructure or default adapters in constructors. All dependencies are injected via constructor arguments wired in the composition root (`apps/server/src/index.ts`).

#### Authoritative Constructor Signature (`apps/server/src/features/rooms/room.service.ts`)
```typescript
export class RoomService implements IRoomService, IRoomGameAdapter {
  constructor(
    private readonly store: IRoomStore,
    private readonly sessionRegistry: ISessionRegistry,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly timerRegistry: IDisconnectTimerRegistry,
    private readonly logger: Logger,
  ) {
    // Zero fallback instantiation. All dependencies are strictly required.
  }
  // ...
}
```

#### Required Operational Logging in `RoomService` (MAJ-005)
Every domain method in `RoomService` MUST log entry, completion with duration, and failure:
- `createRoom`:
  - Start: `logger.info("Creating room", { operation: "room_create", playerName })`
  - Success: `logger.info("Room created", { operation: "room_create", roomCode, playerId, duration })`
  - Collision fallback: `logger.warn("Room code collision, generating fallback", { operation: "room_code_collision_retry", attempts })`
  - Failure: `logger.error("Room creation failed", { operation: "room_create", error })`
- `joinRoom`:
  - Start: `logger.info("Joining room", { operation: "room_join", roomCode, playerName })`
  - Success: `logger.info("Room joined", { operation: "room_join", roomCode, playerId, role, duration })`
- `reconnect`:
  - Start: `logger.info("Reconnecting player", { operation: "room_reconnect", roomCode, playerId })`
  - Success: `logger.info("Player reconnected", { operation: "room_reconnect", roomCode, playerId, duration })`
- `leaveRoom`:
  - Start: `logger.info("Leaving room", { operation: "room_leave", roomCode, playerId })`
  - Success: `logger.info("Room left", { operation: "room_leave", roomCode, playerId, shouldDelete, duration })`

---

### 3.2 `GameService` Constructor & Dependencies (MAJ-003)

#### Architecture Rule: Decoupling & Observability
`GameService` must not import concrete `SystemClock` or `UuidGenerator`, must accept an injected `Logger`, and must log all gameplay domain operations.

#### Authoritative Constructor Signature (`apps/server/src/features/game/game.service.ts`)
```typescript
export class GameService implements IGameService {
  constructor(
    private readonly roomAdapter: IRoomGameAdapter,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly logger: Logger,
    private readonly sessionRegistry?: ISessionRegistry,
  ) {
    // All core dependencies required. Zero self-wiring concrete defaults.
  }
  // ...
}
```
*Note: `roomAdapter` implements `IRoomGameAdapter` (defined in `features/rooms`), ensuring `GameService` interacts with room persistence exclusively via the explicit feature contract rather than touching `RoomStore` directly.*

#### Required Operational Logging in `GameService` (MAJ-003)
Every gameplay method in `GameService` MUST emit structured logs:
- `makeMove`:
  - Start: `logger.debug("Applying chess move", { operation: "game_move", roomCode, playerId, move })`
  - Success: `logger.info("Chess move applied", { operation: "game_move", roomCode, playerId, san: moveResult.san, duration, isGameOver: Boolean(gameOverPayload) })`
  - Invalid Move: `logger.warn("Invalid move rejected", { operation: "game_move_rejected", roomCode, playerId, reason })`
- `resign`:
  - `logger.info("Player resigned", { operation: "game_resign", roomCode, playerId, winnerColor, duration })`
- `offerDraw` / `respondDraw`:
  - `logger.info("Draw offer processed", { operation: "game_draw_action", roomCode, playerId, action, duration })`
- `requestRematch` / `respondRematch`:
  - `logger.info("Rematch action processed", { operation: "game_rematch_action", roomCode, playerId, status, duration })`

---

### 3.3 `InMemoryRoomStore` Options Interface & Eviction Fix (MAJ-007)

#### Authoritative Options Contract (`apps/server/src/features/rooms/in_memory_room.store.ts`)
```typescript
export interface InMemoryRoomStoreOptions {
  clock?: IClock;
  logger?: Logger;
  maxRooms?: number;
  maxCancelledTickets?: number;
  lockTimeoutMs?: number;
  executionTimeoutMs?: number;
}
```

#### Constructor Contract
```typescript
export class InMemoryRoomStore implements RoomStore {
  constructor(options?: InMemoryRoomStoreOptions) {
    this.clock = options?.clock ?? new SystemClock();
    this.logger = options?.logger ?? defaultLogger;
    this.maxRooms = options?.maxRooms ?? MAX_ROOMS;
    this.MAX_CANCELLED_TICKETS = options?.maxCancelledTickets ?? 5_000;
    this.LOCK_TIMEOUT_MS = options?.lockTimeoutMs ?? 5_000;
    this.EXECUTION_TIMEOUT_MS = options?.executionTimeoutMs ?? 5_000;
  }
}
```
*(Builders may retain overloaded constructor signatures if needed to preserve backward compatibility across test files, but `options?: InMemoryRoomStoreOptions` is the primary authoritative signature).*

#### `trackCancelledTicket` Eviction Contract
```typescript
private trackCancelledTicket(ticket: number): void {
  this.cancelledTickets.add(ticket);
  while (this.cancelledTickets.size > this.MAX_CANCELLED_TICKETS) {
    const oldest = this.cancelledTickets.values().next().value;
    if (oldest === undefined) break;
    this.cancelledTickets.delete(oldest);
  }
}
```

---

### 3.4 `MockRoomStore` Clock Injection (MAJ-013)

#### Authoritative Constructor Contract (`apps/server/src/features/rooms/mock_room.store.ts`)
```typescript
export class MockRoomStore implements RoomStore {
  private readonly clock: IClock;

  constructor(clock?: IClock) {
    this.clock = clock ?? new SystemClock();
  }

  // All Date.now() occurrences replaced with this.clock.now():
  // - save(): lastActivityAt: room.lastActivityAt ?? this.clock.now()
  // - createIfAbsent(): room.createdAt ?? this.clock.now()
  // - mutate(): lastActivityAt: this.clock.now()
}
```

---

### 3.5 `MAX_ROOMS` Relocation to Interface Contract (MIN-014)

- Move constant declaration to `apps/server/src/features/rooms/room.store.ts`:
  ```typescript
  export const MAX_ROOMS = 10_000;
  ```
- Export `MAX_ROOMS` from `apps/server/src/features/rooms/index.ts`.
- `in_memory_room.store.ts` and `room.service.ts` must import `MAX_ROOMS` from `./room.store.js`.

---

### 3.6 Shared Normalization Helpers (MAJ-009)

Shared normalization helpers MUST be exported from `@fun-chess/shared`:

#### `shared/src/utils/normalization.ts`
```typescript
import { PlayerNameSchema, RoomCodeSchema } from "../contracts/schemas.js";

/**
 * Normalizes a 4-letter room code by trimming whitespace and converting to uppercase.
 */
export function normalizeRoomCode(code: string): string {
  return (code || "").trim().toUpperCase();
}

/**
 * Validates and normalizes a player display name according to PlayerNameSchema allowlist.
 * Throws ZodError if invalid.
 */
export function validatePlayerName(name: string): string {
  return PlayerNameSchema.parse(name);
}
```

Exported through `shared/src/utils/index.ts` and `shared/src/index.ts`. All server services (`room.service.ts`, `game.service.ts`, `room.socket_handler.ts`) and client composables MUST use these shared helpers instead of inline regexes or `.trim().toUpperCase()`.

---

## 4. Frozen Contract Summary Matrix

| Finding | Contract Target | Change Summary |
|---------|-----------------|----------------|
| **MAJ-001** | `apps/server/src/platform/http/http_server.ts` | Regex check `/^[a-zA-Z0-9_-]{8,64}$/`, fallback to `randomUUID()` |
| **MAJ-002** | `apps/server/src/platform/http/http_server.ts` | Rate limiting evaluated before `/health`, `/metrics`; telemetry auth guard |
| **MAJ-003** | `apps/server/src/features/game/game.service.ts` | Required dependencies (`roomAdapter`, `clock`, `idGen`, `logger`), domain logging |
| **MAJ-005** | `apps/server/src/features/rooms/room.service.ts` | Required dependencies (`store`, `sessionReg`, `clock`, `idGen`, `timers`, `logger`), lifecycle logging |
| **MAJ-007** | `apps/server/src/features/rooms/in_memory_room.store.ts` | `InMemoryRoomStoreOptions` object, `while` loop eviction in `trackCancelledTicket` |
| **MAJ-008** | `shared/src/contracts/events.ts` | Clean `room:player_disconnected` payload; typed `RoomStatus` in reconnect ack; ack-only room state delivery |
| **MAJ-009** | `shared/src/utils/normalization.ts` | Shared `normalizeRoomCode` & `validatePlayerName` utilities |
| **MAJ-013** | `apps/server/src/features/rooms/mock_room.store.ts` | Injectable `clock?: IClock`, eliminate wall-clock `Date.now()` calls |
| **MIN-007** | `apps/server/src/platform/http/http_server.ts` | Specific health operations: `health_readiness`, `health_liveness`, `health_telemetry` |
| **MIN-008** | `apps/server/src/platform/http/http_server.ts` | Pass `startTime` into rate limiter check and log `durationMs` |
| **MIN-014** | `apps/server/src/features/rooms/room.store.ts` | `MAX_ROOMS = 10_000` defined in `room.store.ts` interface module |
