# API & Integration Contracts: Fun Chess Audit Remediation

> **Status: FROZEN ARCHITECTURAL CONTRACT**
> **Phase: DESIGN (Remediation)**
> **Author: System Architect (@architect)**
> **Audience: All Builders (@backend-engineer, @frontend-engineer, @tech-lead, @test-automation-engineer)**
> **Scope: Remediation of Audit Findings (CRIT-001, MIN-001, CRIT-002, MAJ-004, MAJ-007, MAJ-014, MAJ-017, MAJ-018, MAJ-019, MAJ-020, MAJ-025, MIN-024, MIN-026, MIN-027)**
> **Contract Rule: Once published in DESIGN phase, this specification is binding. Builders must implement to these exact signatures, behaviors, error codes, and formats.**

---

## 1. HTTP Ingress Routing & Unversioned Policy (MIN-026, MIN-027)

### 1.1 Architecture Decision Record: Retention of Unversioned Endpoints
- **Context:** Finding MIN-026 observed that native HTTP endpoints (`/api/lan-info`, `/health`, `/health/detail`, `/metrics`, `/healthz`) do not have `/api/v1/...` prefixes. Finding MIN-027 noted that `/api/lan-info` returns a flat JSON object rather than a `{ data: ... }` envelope.
- **User Directive & Decision:** **Strictly retain existing unversioned routes without path aliases or wrapper mutations.**
- **Rationale:**
  1. **Operational Stability:** Infrastructure orchestrators (Google Cloud Run probes, Kubernetes readiness/liveness probes, container health checkers) are actively configured against `/healthz` and `/health`. Adding alias redirects or shifting to `/api/v1/health` introduces infrastructure failure points and redundant routing table entries.
  2. **LAN Discovery Protocol Compatibility:** The client PWA, WebRTC signaling layer, and local QR code generator expect the authoritative addressing metadata directly at `GET /api/lan-info`. Wrapping this response in a `{ data: ... }` envelope would break existing mobile clients and cached PWA service worker offline fallbacks.
  3. **Simplicity (KISS/YAGNI):** The Fun Chess HTTP surface is a compact utility and telemetry plane (WebSocket Socket.IO handles the core game domain). Route aliases (e.g., exposing both `/api/lan-info` and `/api/v1/lan-info`) add dead code maintenance overhead.

### 1.2 Authoritative HTTP Route Specification

| Method | Path | Auth Required | Operation Name | Success Response Payload | Error Responses |
|---|---|---|---|---|---|
| `GET`, `HEAD` | `/healthz` | None (Public) | `health_readiness` | `200 "OK"` (`text/plain; charset=utf-8`) | `500` JSON Error Envelope |
| `GET`, `HEAD` | `/health` | None (Public) | `health_liveness` | `200` JSON `LivenessHealthResponse` (`application/json`) | `500` JSON Error Envelope |
| `GET`, `HEAD` | `/api/health` | None (Public) | `health_liveness` | `200` JSON `LivenessHealthResponse` (`application/json`) | `500` JSON Error Envelope |
| `GET`, `HEAD` | `/metrics` | Yes (`isTelemetryAuthorized`) | `health_telemetry` | `200` JSON `DetailedHealthResponse` | `403` `ERR_UNAUTHORIZED`, `500` Error Envelope |
| `GET`, `HEAD` | `/health/detail` | Yes (`isTelemetryAuthorized`) | `health_telemetry` | `200` JSON `DetailedHealthResponse` | `403` `ERR_UNAUTHORIZED`, `500` Error Envelope |
| `GET`, `HEAD` | `/api/lan-info` | None (Public) | `lan_info` | `200` JSON `LanAddressingInfo` | `429` `ERR_RATE_LIMITED`, `500` Error Envelope |
| `GET`, `HEAD` | Static / SPA routes | None (Public) | `static_serve` | `200`/`304` Static file content or fallback HTML | `404` (if no fallback), `500` Error Envelope |
| Any | Unmatched paths | None | `http_not_found` | None | `404` JSON Error Envelope (`ERR_NOT_FOUND`) |

### 1.3 HTTP Response Envelope Schemas
- **Public LAN Info Response Contract (`GET /api/lan-info`):**
  Flat JSON structure per `LanAddressingInfo` schema (no envelope):
  ```json
  {
    "lanIp": "192.168.1.50",
    "port": 3000,
    "localUrl": "http://localhost:3000",
    "joinUrl": "http://192.168.1.50:3000",
    "interfaces": ["192.168.1.50"],
    "relayMode": "lan",
    "isCloudRelay": false
  }
  ```
- **Standard HTTP Error Response Contract:**
  All error responses (403, 404, 429, 500) MUST conform to the unified error envelope:
  ```json
  {
    "error": {
      "code": "ERR_UNAUTHORIZED",
      "message": "Telemetry access restricted to authorized callers or loopback",
      "statusCode": 403,
      "correlationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "timestamp": "2026-09-10T06:00:00.000Z"
    }
  }
  ```

---

## 2. Telemetry Ingress Authorization & IP Security Contract (CRIT-001, MIN-001)

### 2.1 IP Normalization Contract (`normalizeIp` in `ip_utils.ts`)
- **Vulnerability Remediated (CRIT-001):** Previously, `normalizeIp` defaulted unparseable/invalid IPs to `"127.0.0.1"`, enabling remote callers with malformed headers to bypass telemetry authorization.
- **Fail-Closed Guarantee:** `normalizeIp` MUST return `"unknown"` for any missing, empty, whitespace-only, non-string, or syntactically invalid IP string (`net.isIP(trimmed) === 0`).
- **IPv4-Mapped IPv6 Prefix:** Strips `::ffff:` prefix before validation.
- **Canonical Specification:**
  ```typescript
  import net from "node:net";

  export function normalizeIp(rawIp: string | undefined): string {
    if (!rawIp || typeof rawIp !== "string") {
      return "unknown";
    }
    let trimmed = rawIp.trim();
    if (trimmed.startsWith("::ffff:")) {
      trimmed = trimmed.slice(7);
    }
    if (!trimmed || net.isIP(trimmed) === 0) {
      return "unknown";
    }
    return trimmed;
  }
  ```

### 2.2 Client IP Extraction Contract (`extractClientIp` in `ip_utils.ts`)
- When `trustProxy === false`:
  - `extractClientIp` strictly evaluates direct TCP socket remote address (`req.socket?.remoteAddress` or `socket.conn?.remoteAddress`).
  - `x-forwarded-for` and all proxy headers are strictly ignored.
  - Passes direct address through `normalizeIp`. If socket address is missing or invalid, returns `"unknown"`.
- When `trustProxy === true`:
  - Evaluates the rightmost entry in `x-forwarded-for` (the client IP immediately prior to the trusted ingress reverse proxy).
  - Passes candidate through `normalizeIp`. If the header value is invalid, returns `"unknown"`.

### 2.3 Telemetry Authorization Contract (`isTelemetryAuthorized` in `health.controller.ts`)
- **Protected Endpoints:** `/metrics`, `/health/detail`.
- **Authorization Parameters Interface:**
  ```typescript
  export interface TelemetryAuthParams {
    clientIp: string;
    directSocketIp?: string; // Direct remote TCP IP from req.socket.remoteAddress
    headers: Record<string, string | string[] | undefined>;
    metricsSecret?: string;
    isProduction: boolean;
  }
  ```
- **Rules of Authorization (Evaluated in Strict Order):**
  1. **Strict Loopback Evaluation (Anti-Spoofing Rule):**
     - Loopback access privilege (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) is ONLY granted if the physical TCP connection (`directSocketIp`) is a verified loopback address.
     - **Remote Loopback Spoofing Denial:** If an incoming request arrives over a non-loopback TCP socket (or `directSocketIp` is `"unknown"`), but provides an `X-Forwarded-For: 127.0.0.1` header, loopback privilege is **STRICTLY DENIED**. Loopback cannot be claimed via proxy headers.
  2. **Timing-Safe `METRICS_SECRET` Verification (MIN-001):**
     - If `metricsSecret` is configured (non-empty string):
       - Candidate secret is extracted from `x-metrics-secret` header (first array item if array) or `Authorization: Bearer <token>`.
       - If no candidate token is provided, authorization fails.
       - Candidate token comparison against `metricsSecret` MUST use `crypto.timingSafeEqual` with matching byte lengths to prevent timing side-channel attacks.
       - If byte lengths differ, constant-time SHA-256 digest comparison must be performed to avoid leaking length:
         ```typescript
         import crypto from "node:crypto";

         function timingSafeStringEqual(a: string, b: string): boolean {
           const hashA = crypto.createHash("sha256").update(a).digest();
           const hashB = crypto.createHash("sha256").update(b).digest();
           return crypto.timingSafeEqual(hashA, hashB);
         }
         ```
  3. **Non-Production Fallback:**
     - If `!isProduction` and `!metricsSecret`: Permitted for local development.
     - If `isProduction` and `!metricsSecret`: Denied by default (fail closed, warning emitted at startup).

---

## 3. HMAC-SHA256 Cryptographic Session Token Contract (MAJ-004, CRIT-002)

### 3.1 Token Format Specification
A Fun Chess session token is a tamper-evident, cryptographically signed string in two dot-separated segments:
```
<uuid>.<signature>
```
- **`uuid` segment:** 36-character canonical RFC 4122 UUID v4 (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`).
- **`signature` segment:** 64-character lowercase hex digest of the HMAC-SHA256 computed over the `uuid` segment:
  $$\text{signature} = \text{HMAC-SHA256}(\text{key} = \text{signingKey}, \text{data} = \text{uuid})$$
- **Total Token Length:** 36 + 1 + 64 = 101 characters. Satisfies `SessionTokenSchema` constraint (`min(1).max(128)`).
- **Entropy & Defense:** Guarantees that session tokens cannot be forged or guessable by brute-force room codes or player IDs.

### 3.2 Signing Key Derivation
- Canonical environment variable: `SESSION_SECRET`.
- **Derivation Algorithm:**
  ```typescript
  import crypto from "node:crypto";

  export function deriveSessionKey(secret: string): Buffer {
    return crypto.createHash("sha256").update(secret, "utf-8").digest();
  }
  ```
- **Environment & Startup Rules:**
  - In production (`NODE_ENV === "production"`): `SESSION_SECRET` MUST be defined and contain at least 16 characters. If missing, the server logs a critical configuration error and fails startup validation.
  - In development/testing: If unset, a deterministic development fallback (`"fun-chess-dev-session-secret-key-32b"`) is used with an explicit warning logged.

### 3.3 Core Shared Utility Contract (`@fun-chess/shared/utils/session_token.ts`)
```typescript
export interface SessionTokenResult {
  token: string;
  uuid: string;
}

export interface SessionTokenVerification {
  valid: boolean;
  uuid?: string;
  reason?: "invalid_format" | "invalid_signature" | "missing_secret";
}

/**
 * Generates a cryptographically signed session token.
 */
export function generateSessionToken(
  uuid: string,
  sessionSecret: string,
): string;

/**
 * Validates a session token signature using timing-safe comparison.
 * Supports backward compatibility for legacy unsigned UUID tokens when enabled.
 */
export function verifySessionToken(
  token: string,
  sessionSecret: string,
  options?: { allowUnsignedInDev?: boolean },
): SessionTokenVerification;
```

### 3.4 Verification & Reconnection Workflow
1. **Creation:**
   - In `RoomService.createRoom` and `RoomService.joinRoom`:
   - An ID generator generates `playerId` (UUID) and a session `uuid`.
   - The server calls `generateSessionToken(uuid, env.SESSION_SECRET)`.
   - The token is registered in `SessionRegistry` and returned to the client **only via the acknowledgment callback**.
2. **Reconnection Verification:**
   - In `room:reconnect`, the client transmits `{ roomCode, playerId, sessionToken }`.
   - `RoomService.reconnect` immediately executes `verifySessionToken(token, secret)`:
     - If `!verification.valid`: Fast cryptographic rejection with `ERR_UNAUTHORIZED`. The database/in-memory store is not even queried, mitigating DoS on session storage.
     - If `verification.valid`: Query `SessionRegistry.validateSession(token, roomCode, playerId)`.
3. **Backward Compatibility & Test Migration:**
   - If `options.allowUnsignedInDev === true` (allowed only when `NODE_ENV === "test"` or in development mode):
     - If the token is a valid UUIDv4 without a dot (`.`), it is accepted with `valid: true`.
   - In production mode: Unsigned tokens are unconditionally rejected.

### 3.5 Token Masking & Redaction Rules (CRIT-002)
- **Zero Cleartext Logging:** Raw session tokens MUST NEVER appear in application logs, HTTP access logs, query strings, or error messages.
- **`InMemorySessionRegistry` Metadata:** Replace all instances of `sessionToken` in debug/info logs with a masked fingerprint:
  ```typescript
  export function maskToken(token: string): string {
    if (!token || typeof token !== "string") return "[REDACTED]";
    if (token.length <= 12) return "[REDACTED]";
    return `${token.slice(0, 8)}...${token.slice(-6)}`;
  }
  ```
- **HTTP Ingress Scrubbing:** `extractHttpUserId` in `http_server.ts` MUST NOT inspect `x-session-token` or URL query parameter `sessionToken`. It only inspects `x-user-id` and `x-player-id`.

---

## 4. Socket Event Contracts & Reconnect Single-Delivery (MAJ-025, MIN-024)

### 4.1 Elimination of Dual-Delivery on `room:reconnect` (MAJ-025)
- **Problem Statement:** Previously, upon reconnection, `room.socket_handler.ts` emitted `"room:reconnected"` to the client socket and simultaneously returned the identical payload in the acknowledgment callback. Both handlers executed on the client, causing race conditions, state tearing, and duplicate render passes.
- **Architectural Mandate:**
  1. **Deprecate `room:reconnected` socket emit:** The server MUST NOT emit `"room:reconnected"` to `socket`.
  2. **Single Ingress Channel:** Reconnection state is delivered **exclusively through the acknowledgment callback**.
  3. **Peer Broadcast Preserved:** The peer player in the room is notified via:
     ```typescript
     socket.to(roomCode).emit("room:player_reconnected", {
       playerId: result.player.id,
       playerName: result.player.name,
       roomStatus: result.room.status,
     });
     ```
  4. **Event Declaration Deprecation:** Mark `"room:reconnected"` in `ServerToClientEvents` with `@deprecated`:
     ```typescript
     export interface ServerToClientEvents {
       /**
        * @deprecated Dual-delivery eliminated per MAJ-025.
        * State is delivered strictly via room:reconnect acknowledgment callback.
        * Retained as optional client listener for backward compatibility.
        */
       "room:reconnected": (data: {
         room: RoomState;
         player: Player;
         roomStatus?: RoomStatus;
       }) => void;
       // ...
     }
     ```

### 4.2 Reconnection Acknowledgment Response Contract (MIN-024)
- **Authoritative Type Contract (`shared/src/contracts/events.ts`):**
  ```typescript
  export interface ReconnectSuccessAck {
    success: true;
    room: RoomState;
    player: Player;
    roomStatus: RoomStatus;
    sessionToken: string;
  }

  export interface ReconnectErrorAck {
    success: false;
    error: SocketErrorPayload;
  }

  export type ReconnectAckPayload = ReconnectSuccessAck | ReconnectErrorAck;
  ```
- **Client Generic Typing (`useRoomSession.ts`):**
  ```typescript
  return transport.emitWithTimeout<ReconnectRequest, ReconnectAckPayload>(
    s,
    'room:reconnect',
    validationResult.data,
    {
      timeoutMs: 8000,
      operation: 'socket_room_reconnect',
      correlationId,
      onSuccess: (res) => {
        currentRoom.value = res.room;
        currentPlayer.value = res.player;
        sessionToken.value = res.sessionToken;
        saveSession({
          roomCode: res.room.roomCode,
          playerId: res.player.id,
          sessionToken: res.sessionToken,
        });
      },
      onError: (err) => {
        if (err.code === 'ERR_ROOM_NOT_FOUND' || err.code === 'ERR_UNAUTHORIZED') {
          resetRoomSessionState(true);
          clearSession();
          onRoomClosed?.();
        }
      },
    },
  );
  ```

---

## 5. Socket Middleware Pipeline Architecture (MAJ-007, MAJ-019)

### 5.1 Pipeline Decomposition Overview
The monolithic `wrapSocketHandler` (CC 31, 212 lines) is decomposed into 4 discrete, composable middleware stages:
```
Inbound Socket Event (rawPayload, callback)
  │
  ├── 1. withCorrelation
  │      └── Generate/sanitize correlationId, extract clientIp & userId, log "Operation started"
  │
  ├── 2. withRateLimit
  │      └── Evaluate rate limiter bucket; if exceeded, log reject & safeDispatchResponse(429)
  │
  ├── 3. withValidation
  │      └── Zod schema validation; if invalid, log reject & safeDispatchResponse(400)
  │
  └── 4. withLogging & Execution
         └── Execute domain handler, capture duration, log "Operation succeeded" / "Operation failed",
             safeDispatchResponse with defensive callback protection
```

### 5.2 Middleware Contracts & Signatures

```typescript
export interface SocketHandlerContext {
  correlationId: string;
  socketId: string;
  clientIp?: string;
  userId?: string;
  startTime: number;
}

export type SocketMiddlewareNext<TPayload, TRes> = (
  payload: TPayload,
  context: SocketHandlerContext,
) => Promise<TRes>;

export type SocketMiddleware<TPayloadIn, TPayloadOut, TRes> = (
  next: SocketMiddlewareNext<TPayloadOut, TRes>,
) => SocketMiddlewareNext<TPayloadIn, TRes>;
```

1. **`withCorrelation`:**
   - Initializes `correlationId` (`/^[a-zA-Z0-9_-]{8,64}$/` or `randomUUID()`).
   - Extracts and normalizes `clientIp` via `extractClientIp(socket, trustProxy)`.
   - Extracts `userId` from socket session data or payload metadata.
   - Logs `operation_started` at `info` level (sanitized payload at `debug`).
2. **`withRateLimit`:**
   - Injects `SocketRateLimiter`.
   - Verifies allowance against `clientIp` (or `socketId` fallback).
   - If blocked: returns `ERR_RATE_LIMITED` payload via acknowledgment.
3. **`withValidation`:**
   - Validates `rawReq` against `schema?: z.ZodType<TPayload>`.
   - If validation fails: formats issues, returns `ERR_INVALID_PAYLOAD`.
4. **`withLogging`:**
   - Wraps handler execution in high-resolution timer (`performance.now()`).
   - Emits structured `operation_succeeded` with `duration`, `durationMs`, and `status: "success"`.
   - On unhandled exception: formats sanitized error envelope and logs `operation_failed` with `duration` and `error: serializeError(err)`.

### 5.3 Defensive Client Callback Execution Contract (MAJ-007)
- **Vulnerability Remediated:** If a client acknowledgment callback throws a synchronous runtime exception, it must NOT escape into the outer catch block. Escaping exceptions previously caused the server to log a false "Operation failed" and invoke the callback a second time with an error.
- **Defensive Dispatch Specification:**
  ```typescript
  export function safeDispatchResponse<TRes>(
    callback: ((res: TRes) => void) | undefined,
    socketObj: SocketLike | undefined,
    success: boolean,
    dataOrError: unknown,
    logger: Logger,
    context: { operation: string; correlationId: string },
  ): void {
    if (typeof callback === "function") {
      try {
        if (success) {
          callback(dataOrError as TRes);
        } else {
          callback({
            success: false,
            error: dataOrError,
          } as unknown as TRes);
        }
      } catch (cbErr) {
        logger.warn("Client acknowledgment callback threw exception; double dispatch suppressed", {
          operation: context.operation,
          correlationId: context.correlationId,
          error: serializeError(cbErr),
        });
      }
      return;
    }

    // Fallback: emit error event to socket if no ack callback was provided
    if (!success && socketObj && typeof socketObj.emit === "function") {
      try {
        socketObj.emit("error", dataOrError);
      } catch (emitErr) {
        logger.warn("Failed to emit error to socket", {
          operation: context.operation,
          correlationId: context.correlationId,
          error: serializeError(emitErr),
        });
      }
    }
  }
  ```

---

## 6. HTTP Server Routing Architecture & IFileStorage (MAJ-014, MAJ-020)

### 6.1 `HttpRouter` Extraction Contract (`apps/server/src/platform/http/http_router.ts`)
The 326-line closure inside `createHttpServer` (CC 40) is replaced by an instantiated `HttpRouter` class (CC < 10 per method):

```typescript
export interface HttpRouterDependencies {
  roomStore: IRoomCountProvider;
  addressService: IAddressingInfoProvider;
  staticController: StaticController;
  healthController: HealthController;
  rateLimiter: HttpRateLimiter;
  logger: Logger;
  port: number;
  isProduction: boolean;
  metricsSecret?: string;
  allowedOrigins: string[];
  trustProxy: boolean;
  fileStorage?: IFileStorage;
}

export class HttpRouter {
  constructor(private readonly deps: HttpRouterDependencies) {}

  /**
   * Dispatches incoming HTTP requests through the middleware pipeline and route controllers.
   */
  public async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = performance.now();
    const correlationId = sanitizeCorrelationId(req.headers["x-correlation-id"]);
    const clientIp = extractClientIp(req, this.deps.trustProxy);

    // 1. Security Headers & CORS
    // 2. Rate Limiting Check
    // 3. Health & Telemetry Routes (/health, /healthz, /metrics, /health/detail)
    // 4. LAN Info Route (/api/lan-info)
    // 5. Static & SPA Routes
    // 6. 404 Fallback
  }
}
```

### 6.2 `IFileStorage` Exposure in `StartServerOptions` (MAJ-014)
- Add `fileStorage?: IFileStorage` to `StartServerOptions` in `apps/server/src/index.ts`.
- In `startServer`:
  ```typescript
  export interface StartServerOptions {
    // ...
    /** Abstracted file storage provider for static asset resolution */
    fileStorage?: IFileStorage;
    // ...
  }
  ```
- Pass `options.fileStorage` to `createHttpServer({ ..., fileStorage: options.fileStorage })`.
- In `resolveDistPath`: Check path existence using `fileStorage?.stat?.()` rather than direct Node `fs.existsSync()`, preserving pure I/O isolation.
