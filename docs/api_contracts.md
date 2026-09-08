# Frozen API & Network Contracts: Fun Chess Remediation

**Status**: FROZEN CONTRACT  
**Author**: @architect (System Architecture)  
**Date**: 2026-09-08  
**Scope**: Full Monorepo Audit Remediation (Findings MAJ-026, MAJ-027, MAJ-028, ENH-003, CRIT-002, CRIT-003, F-MAJ-005, E-ENH-004)  
**Target Locations**: `@fun-chess/shared`, `apps/server`, `apps/client`

---

## 1. Executive Summary & Design Scope

This document establishes the authoritative, frozen network, error, and API contracts for the Fun Chess platform audit remediation. All builders, tech leads, and test automation engineers implementing Scope Cards 1 through 5 (`SC-1-SHARED`, `SC-2-SERVER`, `SC-3-CLIENT-CORE`, `SC-4-CLIENT-FEATURES`, `SC-5-DEVOPS-E2E`) must adhere strictly to the types, signatures, schemas, wire protocols, and status codes specified herein.

### Architectural Invariants:
1. **Contract Integrity**: Every client-to-server and server-to-client interaction is explicitly typed in `@fun-chess/shared`. No `(socket as any).emit(...)` casts are permitted.
2. **Deterministic Error Responses**: All HTTP error responses adhere to a unified error response envelope formatted by a centralized `formatHttpError` helper. All Socket.IO error responses adhere to `SocketErrorPayload`.
3. **Defense-in-Depth Observability**: Operational metrics and internal process telemetry are strictly partitioned from unauthenticated container health checks (`/health` vs `/metrics` or `/health/detail`).
4. **State Machine Synchronization**: Reconnection handshakes provide complete, strongly-typed room lifecycle status (`RoomStatus`) to eliminate UI state guessing across network blips.

---

## 2. Socket Event Contract Updates

### 2.1 `room:leave` Acknowledgement Callback Contract (MAJ-026)

#### Problem
In `shared/src/contracts/events.ts`, `ClientToServerEvents["room:leave"]` previously declared a signature with no acknowledgement callback:
```typescript
// Legacy declaration (caused client cast: (s as any).emit('room:leave', ..., callback))
"room:leave": (req: LeaveRoomRequest) => void;
```
Because the client (`apps/client/src/composables/useSocket.ts`) requires acknowledgement to finalize room departures and clean up local session state, callers were forced to bypass TypeScript type safety with `(s as any).emit(...)`.

#### Updated Wire Contract (`shared/src/contracts/events.ts`)

```typescript
export interface ClientToServerEvents {
  // ...

  /**
   * Voluntarily leaves a room.
   * Acknowledged upon server room state mutation, socket room detachment,
   * and timer cancellation.
   */
  "room:leave": (
    req: LeaveRoomRequest,
    callback?: (
      res:
        | { success: true }
        | { success: false; error: SocketErrorPayload },
    ) => void,
  ) => void;

  // ...
}
```

#### Payload Specifications

1. **Request Schema (`LeaveRoomRequest`)**:
   ```typescript
   export const LeaveRoomRequestSchema = z.object({
     roomCode: RoomCodeSchema,
   });
   export type LeaveRoomRequest = z.infer<typeof LeaveRoomRequestSchema>;
   ```

2. **Acknowledgement Responses**:
   - **Success (200 equivalent)**:
     ```typescript
     { success: true }
     ```
   - **Failure (4xx/5xx equivalent)**:
     ```typescript
     {
       success: false,
       error: {
         code: ErrorCode,
         message: string,
         roomCode?: string,
         correlationId?: string,
         details?: Record<string, unknown>
       }
     }
     ```

#### Server Implementation Semantics (`apps/server/src/features/rooms/room.socket_handler.ts`)
```typescript
const handleLeave = createRoomHandler<LeaveRoomRequest, { success: true }>(
  logger,
  "room:leave",
  socket,
  { schema: LeaveRoomRequestSchema, rateLimiter },
  async (req) => {
    const result = await roomService.leaveRoom(req.roomCode, socket.id);
    const roomCode = req.roomCode.toUpperCase();
    await socket.leave(roomCode);

    // Cancel pending disconnect timers for this leaving player
    timerRegistry.cancel(roomCode, result.player.id);

    if (result.gameOverPayload) {
      timerRegistry.cancelAllForRoom(roomCode);
      io.to(roomCode).emit("game:over", result.gameOverPayload);
    } else if (result.shouldDelete) {
      timerRegistry.cancelAllForRoom(roomCode);
    } else {
      socket.to(roomCode).emit("room:player_left", {
        playerId: result.player.id,
        playerName: result.player.name,
      });
    }

    return { success: true };
  },
);
socket.on("room:leave", handleLeave);
```

#### Client Implementation Semantics (`apps/client/src/composables/useSocket.ts`)
1. Remove `(s as any)` cast when emitting `room:leave`.
2. Remove hardcoded `'shared_socket_456'` test backdoor shim (CRIT-003).
3. Execute teardown via a 2000ms race timeout:
```typescript
export function leaveRoom(): Promise<void> {
  return new Promise((resolve) => {
    const s = socket.value;
    const code = currentRoom.value?.roomCode;

    if (!s || !code) {
      clearSession();
      resolve();
      return;
    }

    let finalized = false;
    const finalize = (success: boolean) => {
      if (finalized) return;
      finalized = true;
      clearTimeout(timer);
      clearSession();
      resolve();
    };

    const timer = setTimeout(() => {
      finalize(true);
    }, 2000);

    // Strongly typed call with ack callback
    s.emit("room:leave", { roomCode: code }, (res) => {
      finalize(res?.success !== false);
    });
  });
}
```

---

### 2.2 `room:reconnect` Acknowledgement Signature & `room:player_reconnected` Broadcast Contract (MAJ-026, MAJ-027)

#### Problem
1. `ClientToServerEvents["room:reconnect"]` acknowledgement callback did not declare `roomStatus: RoomStatus`, even though the server was already providing it.
2. In `ServerToClientEvents["room:player_reconnected"]`, the broadcast payload omitted `roomStatus: RoomStatus`. When a disconnected opponent reconnected, the remaining client received `{ playerId, playerName }` without authoritative room status, requiring fragile heuristics in the client UI.

#### Updated Wire Contract (`shared/src/contracts/events.ts`)

```typescript
import type { RoomStatus, RoomState, Player } from "./models.js";

export interface ClientToServerEvents {
  /**
   * Re-authenticates an interrupted session using private credentials.
   * Returns complete RoomState, authenticated Player, and authoritative RoomStatus.
   */
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
}

export interface ServerToClientEvents {
  /**
   * Broadcast when a previously disconnected player successfully re-establishes connection.
   * Includes authoritative room status so peers know whether the match has resumed from pause.
   */
  "room:player_reconnected": (data: {
    playerId: string;
    playerName: string;
    roomStatus: RoomStatus;
  }) => void;

  /**
   * Emitted directly to the reconnecting client upon successful reconnection.
   */
  "room:reconnected": (data: {
    room: RoomState;
    player: Player;
    roomStatus: RoomStatus;
  }) => void;
}
```

#### Server Implementation Semantics (`apps/server/src/features/rooms/room.socket_handler.ts`)

```typescript
const handleReconnect = createRoomHandler<
  ReconnectRequest,
  {
    room: RoomState;
    player: Player;
    roomStatus: RoomStatus;
  }
>(
  logger,
  "room:reconnect",
  socket,
  { schema: ReconnectRequestSchema, rateLimiter },
  async (req) => {
    const result = await roomService.reconnect(req, socket.id);
    const roomCode = result.room.roomCode;
    await socket.join(roomCode);

    // Cancel any pending disconnect timer for this reconnected player
    timerRegistry.cancel(roomCode, result.player.id);

    // Broadcast to opponent with authoritative roomStatus (MAJ-027)
    socket.to(roomCode).emit("room:player_reconnected", {
      playerId: result.player.id,
      playerName: result.player.name,
      roomStatus: result.room.status,
    });

    // Unicast to reconnecting client
    socket.emit("room:reconnected", {
      room: result.room,
      player: result.player,
      roomStatus: result.room.status,
    });

    return {
      success: true,
      room: result.room,
      player: result.player,
      roomStatus: result.room.status,
    };
  },
);
socket.on("room:reconnect", handleReconnect);
```

#### Client State Reconciliation (`apps/client/src/composables/useSocket.ts`)
```typescript
function handlePlayerReconnected(data: {
  playerId: string;
  playerName: string;
  roomStatus: RoomStatus;
}) {
  if (currentRoom.value) {
    // Authoritative room status from server broadcast
    currentRoom.value.status = data.roomStatus;

    if (currentRoom.value.whitePlayer?.id === data.playerId) {
      currentRoom.value.whitePlayer.isConnected = true;
    }
    if (currentRoom.value.blackPlayer?.id === data.playerId) {
      currentRoom.value.blackPlayer.isConnected = true;
    }
  }

  if (currentPlayer.value?.id === data.playerId) {
    currentPlayer.value.isConnected = true;
  }
}

function handleRoomReconnected(data: {
  room: RoomState;
  player: Player;
  roomStatus: RoomStatus;
}) {
  if (data?.room) {
    currentRoom.value = data.room;
    currentRoom.value.status = data.roomStatus;

    // Restore pending offers from authoritative room state (CRIT-003)
    if (data.room.drawOffer) {
      drawOfferedBy.value = data.room.drawOffer.offeredBy;
    } else {
      drawOfferedBy.value = null;
    }

    if (data.room.rematch) {
      rematchRequestedBy.value = data.room.rematch.requestedBy;
    } else {
      rematchRequestedBy.value = null;
    }
  }
  if (data?.player) {
    currentPlayer.value = data.player;
  }
}
```

---

## 3. Error Contracts & Normalized Wire Schemas

### 3.1 Domain Error Code Definition (`shared/src/contracts/errors.ts`)

#### Problem (F-MAJ-005, E-ENH-004)
`OptimisticLockConflictError` in `apps/server/src/features/rooms/room.errors.ts` was forced to use `"ERR_CONFLICT" as ErrorCode` because `ERR_CONFLICT` was missing from `ErrorCode` in `@fun-chess/shared`.

#### Contract Definition
Add `ERR_CONFLICT` directly to `ErrorCode`:

```typescript
/**
 * Standardized domain error codes across client and server.
 */
export type ErrorCode =
  | "ERR_ROOM_NOT_FOUND"
  | "ERR_ROOM_FULL"
  | "ERR_ROOM_ALREADY_EXISTS"
  | "ERR_INVALID_ROOM_CODE"
  | "ERR_INVALID_MOVE"
  | "ERR_NOT_YOUR_TURN"
  | "ERR_GAME_NOT_ACTIVE"
  | "ERR_PLAYER_NOT_IN_ROOM"
  | "ERR_UNAUTHORIZED"
  | "ERR_INVALID_PAYLOAD"
  | "ERR_RATE_LIMITED"
  | "ERR_SOCKET_TIMEOUT"
  | "ERR_CONFLICT"            // Added: optimistic concurrency conflict / state conflict
  | "ERR_INTERNAL_SERVER";
```

### 3.2 Standard Socket Error Payload Schema

```typescript
/**
 * Normalized wire error payload transmitted over Socket.io acknowledgements or error events.
 */
export interface SocketErrorPayload {
  /** Domain error classification code */
  readonly code: ErrorCode;
  /** Human-readable error description safe for client display */
  readonly message: string;
  /** Associated room code, if applicable */
  readonly roomCode?: string;
  /** UUID tracing correlation identifier */
  readonly correlationId?: string;
  /** Additional structured error diagnostics (redacted in production) */
  readonly details?: Record<string, unknown>;
}
```

### 3.3 Domain Exception Hierarchy (`shared/src/contracts/errors.ts`)

```typescript
export abstract class AppError extends Error {
  public readonly isAppError = true;

  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an optimistic concurrency control version check fails during a room mutation.
 */
export class OptimisticLockConflictError extends AppError {
  constructor(roomCode: string, expectedVersion: number, actualVersion: number) {
    super(
      "ERR_CONFLICT",
      `State conflict for room '${roomCode}': expected version ${expectedVersion}, found ${actualVersion}. The room was updated concurrently.`,
      409,
      { roomCode, expectedVersion, actualVersion },
    );
  }
}
```

### 3.4 Error Code to HTTP Status & Client Action Mapping

| Error Code | HTTP Status | Meaning | Client Presentation / Action |
|---|---|---|---|
| `ERR_INVALID_PAYLOAD` | 400 | Malformed schema, invalid string lengths | Highlight input field, display validation message |
| `ERR_INVALID_ROOM_CODE`| 400 | Room code not 4 uppercase chars | Show invalid room code error on lobby input |
| `ERR_GAME_NOT_ACTIVE`  | 400 | Move/draw attempted while in lobby or game over | Dismiss action banner, sync room status |
| `ERR_UNAUTHORIZED`     | 401 | Invalid or expired session token | Clear local session storage, redirect to lobby |
| `ERR_NOT_YOUR_TURN`    | 403 | Move submitted out of turn | Reset selected piece, play illegal move sound |
| `ERR_PLAYER_NOT_IN_ROOM`| 403 | Socket is spectator attempting player action | Disable player control buttons |
| `ERR_ROOM_NOT_FOUND`   | 404 | Room does not exist or expired | Show "Room not found" toast, return to lobby |
| `ERR_ROOM_FULL`        | 409 | Room already has 2 active players | Show "Room full" dialog, offer spectator mode |
| `ERR_CONFLICT`         | 409 | Concurrent mutation or version mismatch | Re-fetch latest room state and retry action |
| `ERR_INVALID_MOVE`     | 422 | Move violates chess rules (e.g. king in check) | Snap piece back to source square |
| `ERR_RATE_LIMITED`     | 429 | Exceeded request threshold | Show "Too many requests. Please wait." banner |
| `ERR_SOCKET_TIMEOUT`   | 408 / 504 | Lock wait or socket ack timed out | Retry with exponential backoff |
| `ERR_INTERNAL_SERVER`  | 500 | Unhandled server exception | Show generic error toast with correlation ID |

---

## 4. HTTP Standard Error Response Envelope (MAJ-028)

### 4.1 Problem
`apps/server/src/platform/http/http_server.ts` generated ad-hoc error formats across rate limiting (429), not found (404), and server error (500) handlers, lacking top-level transport status `code`, timestamps, or consistent error properties.

### 4.2 Error Response Envelope Schema

```typescript
/**
 * Canonical HTTP error response envelope returned by all HTTP routes.
 * Strictly compliant with api-design-principles.md and rugged-software-constitution.md.
 */
export interface HttpErrorResponse {
  /** Redundant HTTP transport status code (e.g. 400, 404, 409, 429, 500) */
  code: number;
  /** Machine-readable domain error code (UPPER_SNAKE_CASE) */
  error: string;
  /** Human-readable, safe error message */
  message: string;
  /** Request tracing UUID for cross-system correlation */
  correlationId?: string;
  /** Unix epoch timestamp in milliseconds when the error was generated */
  timestamp: number;
}
```

### 4.3 Helper Contract: `formatHttpError` (`apps/server/src/platform/http/http_server.ts`)

```typescript
/**
 * Formats a standardized HTTP error response envelope.
 *
 * @param code - HTTP status code (4xx or 5xx)
 * @param error - Machine-readable error code (e.g. "ERR_NOT_FOUND", "ERR_RATE_LIMITED")
 * @param message - Human-readable error message safe for client presentation
 * @param correlationId - Optional request tracing correlation ID
 * @param timestamp - Optional timestamp (defaults to Date.now())
 */
export function formatHttpError(
  code: number,
  error: string,
  message: string,
  correlationId?: string,
  timestamp: number = Date.now(),
): HttpErrorResponse {
  return {
    code,
    error,
    message,
    ...(correlationId ? { correlationId } : {}),
    timestamp,
  };
}

/**
 * Maps any AppError or native Error into a standardized HttpErrorResponse.
 */
export function formatHttpErrorFromException(
  err: unknown,
  correlationId?: string,
  timestamp: number = Date.now(),
): { statusCode: number; payload: HttpErrorResponse } {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      payload: formatHttpError(
        err.statusCode,
        err.code,
        err.message,
        correlationId,
        timestamp,
      ),
    };
  }

  // Generic unhandled exception (never leak stack trace in production)
  const isProduction = process.env.NODE_ENV === "production";
  const message = isProduction
    ? "Internal server error"
    : err instanceof Error
      ? err.message
      : "Internal server error";

  return {
    statusCode: 500,
    payload: formatHttpError(
      500,
      "ERR_INTERNAL_SERVER",
      message,
      correlationId,
      timestamp,
    ),
  };
}
```

### 4.4 HTTP Server Handler Usage Examples

#### 1. Rate Limiting (429)
```typescript
if (rateLimiter && !rateLimiter.consume(clientIp)) {
  const limitDesc = rateLimiter.getLimitDescription?.() || "Rate limit exceeded. Please wait before retrying.";
  sendJsonResponse(
    429,
    formatHttpError(429, "ERR_RATE_LIMITED", limitDesc, correlationId),
  );
  return;
}
```

#### 2. Not Found (404)
```typescript
sendJsonResponse(
  404,
  formatHttpError(404, "ERR_NOT_FOUND", `Cannot ${method} ${pathname}`, correlationId),
);
```

#### 3. Unhandled Server Exceptions (500)
```typescript
catch (err) {
  const { statusCode, payload } = formatHttpErrorFromException(err, correlationId);
  if (!res.headersSent) {
    sendJsonResponse(statusCode, payload);
  }
}
```

---

## 5. Observability Endpoints: `/health` vs `/metrics` / `/health/detail` (ENH-003)

### 5.1 Problem
`HealthController` in `apps/server/src/platform/http/controllers/health.controller.ts` exposed internal process memory metrics (`rss`, `heapTotal`, `heapUsed`), active socket counts, and room counts on the public, unauthenticated `/health` endpoint, presenting an information disclosure risk (CWE-200).

### 5.2 Endpoint Partitioning

```
                          ┌───────────────────────────┐
                          │   Incoming HTTP Request   │
                          └─────────────┬─────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼                                             ▼
       GET /health, /api/health                   GET /metrics, /health/detail
  ┌───────────────────────────────┐             ┌───────────────────────────────┐
  │ Liveness & Readiness Probe    │             │ Deep Operational Telemetry    │
  │ • Public / Unauthenticated    │             │ • Internal / Authenticated    │
  │ • Status, uptime, timestamp   │             │ • Memory, sockets, rooms,     │
  │ • Minimal footprint (<100 B)  │             │   relay network addressing    │
  └───────────────────────────────┘             └───────────────────────────────┘
```

### 5.3 `/health` & `/api/health` — Lightweight Container Liveness Probe

- **Target Audience**: Kubernetes Liveness/Readiness probes, Cloud Run healthchecks, load balancers.
- **Authentication**: None (Public).
- **HTTP Status**:
  - `200 OK`: Server is accepting traffic.
  - `503 Service Unavailable`: Server is shutting down or in an unrecoverable state.
- **Response Schema (`LivenessHealthResponse`)**:
  ```typescript
  export const LivenessHealthResponseSchema = z.object({
    status: z.enum(["ok", "degraded"]),
    uptimeSeconds: z.number().nonnegative(),
    timestamp: z.string().datetime(),
  });
  export type LivenessHealthResponse = z.infer<typeof LivenessHealthResponseSchema>;
  ```
- **Example Response Body**:
  ```json
  {
    "status": "ok",
    "uptimeSeconds": 342.5,
    "timestamp": "2026-09-08T07:45:00.000Z"
  }
  ```

### 5.4 `/metrics` & `/health/detail` — Deep Operational Telemetry

- **Target Audience**: Prometheus scrapers, internal diagnostic dashboards, cluster monitoring agents.
- **Authentication**:
  - Development / Test: Accessible on localhost / LAN.
  - Production: Restricted via internal network binding or optional basic auth/bearer token header if exposed publicly.
- **HTTP Status**:
  - `200 OK`: Normal operation.
  - `401 Unauthorized` / `403 Forbidden`: Unauthenticated access in production.
- **Response Schema (`DetailedHealthResponse`)**:
  ```typescript
  export const DetailedHealthResponseSchema = z.object({
    status: z.enum(["ok", "degraded"]),
    uptimeSeconds: z.number().nonnegative(),
    timestamp: z.string().datetime(),
    activeRooms: z.number().int().nonnegative(),
    activeSockets: z.number().int().nonnegative(),
    memoryUsageMb: z.object({
      rss: z.number().nonnegative(),
      heapTotal: z.number().nonnegative(),
      heapUsed: z.number().nonnegative(),
    }),
    relay: z
      .object({
        mode: z.enum(["cloud", "lan"]),
        publicUrl: z.string().url().optional(),
      })
      .optional(),
  });
  export type DetailedHealthResponse = z.infer<typeof DetailedHealthResponseSchema>;
  ```
- **Example Response Body**:
  ```json
  {
    "status": "ok",
    "uptimeSeconds": 342.5,
    "timestamp": "2026-09-08T07:45:00.000Z",
    "activeRooms": 3,
    "activeSockets": 6,
    "memoryUsageMb": {
      "rss": 48.2,
      "heapTotal": 24.5,
      "heapUsed": 18.3
    },
    "relay": {
      "mode": "lan"
    }
  }
  ```

### 5.5 HealthController Interface Specification (`apps/server/src/platform/http/controllers/health.controller.ts`)

```typescript
export interface HealthControllerOptions {
  roomStore: IRoomCountProvider;
  addressService: IAddressingInfoProvider;
  port: number;
  getActiveSocketCount: () => number;
  isProduction?: boolean;
  startTime?: number;
}

export class HealthController {
  // ...
  public getLiveness(): LivenessHealthResponse {
    return {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 100) / 10,
      timestamp: new Date().toISOString(),
    };
  }

  public async getDetailedHealth(): Promise<DetailedHealthResponse> {
    const mem = process.memoryUsage();
    const activeRooms = await this.roomStore.count();
    const activeSockets = this.getActiveSocketCount();
    const isCloud = this.addressService.isCloudRelay
      ? this.addressService.isCloudRelay()
      : false;
    const addrInfo = this.addressService.getAddressingInfo(this.port);

    return {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 100) / 10,
      timestamp: new Date().toISOString(),
      activeRooms,
      activeSockets,
      memoryUsageMb: {
        rss: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
        heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      },
      relay: {
        mode: isCloud ? "cloud" : "lan",
        ...(addrInfo.publicUrl ? { publicUrl: addrInfo.publicUrl } : {}),
      },
    };
  }
}
```

---

## 6. Implementation Checklist by Scope Card

### `SC-1-SHARED` (@backend-engineer)
- [ ] Add `ERR_CONFLICT` to `ErrorCode` union in `shared/src/contracts/errors.ts`.
- [ ] Export `OptimisticLockConflictError` from `shared/src/contracts/errors.ts`.
- [ ] Add acknowledgement callback signature to `ClientToServerEvents["room:leave"]` in `shared/src/contracts/events.ts`.
- [ ] Update `ClientToServerEvents["room:reconnect"]` acknowledgement callback with `roomStatus: RoomStatus`.
- [ ] Update `ServerToClientEvents["room:player_reconnected"]` with `roomStatus: RoomStatus`.
- [ ] Update `ServerToClientEvents["room:reconnected"]` with `roomStatus: RoomStatus`.
- [ ] Add `LivenessHealthResponseSchema` and `DetailedHealthResponseSchema` to `shared/src/contracts/schemas.ts`.
- [ ] Export updated types from `shared/src/contracts/index.ts` and `shared/src/index.ts`.

### `SC-2-SERVER` (@tech-lead[server])
- [ ] Update `handleLeave` in `apps/server/src/features/rooms/room.socket_handler.ts` to return `{ success: true }`.
- [ ] Update `handleReconnect` to include `roomStatus: result.room.status` in `room:player_reconnected` broadcast.
- [ ] Implement `formatHttpError` and `formatHttpErrorFromException` in `apps/server/src/platform/http/http_server.ts`.
- [ ] Route `404`, `429`, and `500` through `formatHttpError`.
- [ ] Implement `getLiveness()` and `getDetailedHealth()` on `HealthController`.
- [ ] Route `/health` and `/api/health` to `getLiveness()`; route `/metrics` and `/health/detail` to `getDetailedHealth()`.

### `SC-3-CLIENT-CORE` (@tech-lead[client-core])
- [ ] Update `leaveRoom` in `apps/client/src/composables/useSocket.ts` to consume the typed `room:leave` ack callback without casts.
- [ ] Remove hardcoded test backdoor `'shared_socket_456'` in `useSocket.ts` (CRIT-003).
- [ ] Update `handlePlayerReconnected` in `useSocket.ts` to reconcile `currentRoom.value.status = data.roomStatus`.
- [ ] Update `handleRoomReconnected` in `useSocket.ts` to re-hydrate `drawOfferedBy` and `rematchRequestedBy` (CRIT-003).
