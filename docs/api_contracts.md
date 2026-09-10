# API Contracts & System Interface Specifications

> **Status:** FROZEN ARCHITECTURAL CONTRACT
> **Phase:** DESIGN Phase (Tier 3 Remediation)
> **Author:** System Architect (`@architect`)
> **Authority:** Binding on all domain implementers (`@tech-lead`, `@backend-engineer`, `@frontend-engineer`, `@reviewer`). Deviations strictly prohibited without an ADR.
> **Scope Cards Addressed:** SC-1 (Shared Contracts), SC-4 (Server Platform), SC-5 (Server Socket Gateway), SC-6 (Server Features)
> **Audit Findings Addressed:** CRIT-002, CRIT-003, MAJ-002, MAJ-006, MAJ-008, MAJ-013, MAJ-014, MIN-001, MIN-002, MIN-011, MIN-022, MIN-023, MIN-024

---

## 1. Readiness Probe Contract (`GET /ready`)

### 1.1 Architectural Rationale & Rule Compliance
Per `monitoring-and-alerting-principles.md` § Health Checks, every service must expose independent health endpoints:
- **Liveness (`/health`, `/healthz`):** Verifies the process is alive and responsive.
- **Readiness (`/ready`):** Verifies the process is ready to receive and process user traffic.

During graceful shutdown (MAJ-013), `ShutdownCoordinator` begins draining existing socket connections and stops accepting new traffic. The server **must immediately degrade the `/ready` probe to HTTP 503**, prompting container orchestrators (Google Cloud Run, Kubernetes) and load balancers to route incoming requests away from this terminating instance without dropping in-flight games.

### 1.2 Endpoint Specification

- **HTTP Method:** `GET`, `HEAD`
- **Route Path:** `/ready`
- **Authentication:** Unauthenticated (public to infrastructure health check probes)
- **Rate Limiting:** Exempt from general client IP rate limiting (`isRateLimitExempt: true`)

#### State A: Healthy & Ready (Traffic Permitted)
- **Condition:** Server initialized, domain services wired, `shutdownCoordinator.isShuttingDown === false`.
- **HTTP Status:** `200 OK`
- **Headers:**
  ```http
  Content-Type: application/json; charset=utf-8
  Cache-Control: no-store, no-cache, must-revalidate
  ```
- **Response Body:**
  ```json
  {
    "status": "ready",
    "ready": true
  }
  ```

#### State B: Graceful Shutdown / Terminating (Traffic Draining)
- **Condition:** Graceful shutdown sequence initiated (`shutdownCoordinator.isShuttingDown === true`).
- **HTTP Status:** `503 Service Unavailable`
- **Headers:**
  ```http
  Content-Type: application/json; charset=utf-8
  Cache-Control: no-store, no-cache, must-revalidate
  Connection: close
  ```
- **Response Body:**
  ```json
  {
    "status": "terminating",
    "ready": false
  }
  ```

#### State C: Unhealthy / Storage Failure (Process Degraded)
- **Condition:** Critical subsystem failure (e.g., room store lock acquisition failure, unhandled event loop block).
- **HTTP Status:** `503 Service Unavailable`
- **Headers:**
  ```http
  Content-Type: application/json; charset=utf-8
  Cache-Control: no-store, no-cache, must-revalidate
  ```
- **Response Body:**
  ```json
  {
    "status": "unhealthy",
    "ready": false,
    "reason": "Subsystem failure: room store unreachable"
  }
  ```

### 1.3 TypeScript Interface Definition
```typescript
/**
 * Response payload for the Kubernetes / Cloud Run /ready readiness probe.
 */
export interface ReadinessResponse {
  readonly status: "ready" | "terminating" | "unhealthy";
  readonly ready: boolean;
  readonly reason?: string;
}
```

### 1.4 Integration with `ShutdownCoordinator` and `HttpRouter`
`ShutdownCoordinator` exposes a public getter:
```typescript
// apps/server/src/platform/lifecycle/shutdown_coordinator.ts
public get isTerminating(): boolean {
  return this.isShuttingDown;
}
```

In `apps/server/src/platform/http/http_helpers.ts` (`handleHealthRoutes`):
```typescript
if (pathname === "/ready") {
  const isShuttingDown = shutdownCoordinator?.isTerminating ?? false;
  if (isShuttingDown) {
    sendJsonResponse(503, { status: "terminating", ready: false }, {
      operation: "health_readiness",
      correlationId,
      headers: { "Connection": "close" },
    });
    return true;
  }
  sendJsonResponse(200, { status: "ready", ready: true }, {
    operation: "health_readiness",
    correlationId,
  });
  return true;
}
```

---

## 2. OpenMetrics / Prometheus RED Metrics Endpoint (`GET /metrics`)

### 2.1 Architectural Rationale & Rule Compliance
Per `monitoring-and-alerting-principles.md` § Metrics, production services must implement the **RED method** (Rate, Errors, Duration) and expose standard OpenMetrics / Prometheus exposition format.

Currently, `/metrics` outputs arbitrary JSON with memory stats. Under **MAJ-014**, `/metrics` will expose standard Prometheus text exposition format, while detailed diagnostic JSON is maintained at `/health/detail`.

### 2.2 Endpoint Specification

- **HTTP Method:** `GET`, `HEAD`
- **Route Path:** `/metrics`
- **Authentication:** Protected via `isTelemetryAuthorized` (loopback IP `127.0.0.1`, `::1` or `X-Metrics-Secret: <METRICS_SECRET>` header). Unauthorized requests receive `403 Forbidden` (`ERR_UNAUTHORIZED`).
- **Content-Type:** `text/plain; version=0.0.4; charset=utf-8`

### 2.3 Metric Definitions & Taxonomy

| Metric Name | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `path`, `status` | Total incoming HTTP requests partitioned by method, normalized path template, and status code. |
| `http_request_duration_seconds_bucket` | Histogram | `le`, `method`, `path` | Cumulative request latency buckets in seconds. |
| `http_request_duration_seconds_sum` | Summary | `method`, `path` | Total sum of all request durations in seconds. |
| `http_request_duration_seconds_count` | Summary | `method`, `path` | Total count of recorded request duration observations. |
| `http_requests_failed_total` | Counter | `method`, `path`, `error_code` | Total HTTP requests resulting in 4xx/5xx responses or domain exceptions. |
| `active_rooms` | Gauge | None | Number of currently active rooms in storage. |
| `active_connections` | Gauge | `transport` | Number of currently connected client sockets (`transport="websocket"`). |
| `error_rate` | Gauge | None | Real-time rolling error percentage: `(failed_requests / total_requests) * 100`. |
| `nodejs_eventloop_lag_seconds` | Gauge | None | Current Node.js event loop lag in seconds. |
| `process_resident_memory_bytes` | Gauge | None | Resident memory size (RSS) in bytes. |
| `process_heap_bytes` | Gauge | `type` (`"total"`, `"used"`) | Heap memory usage in bytes. |

#### Histogram Bucket Distribution
Histogram buckets for `http_request_duration_seconds_bucket` must cover standard API latencies:
`le` values: `0.005`, `0.01`, `0.025`, `0.05`, `0.1`, `0.25`, `0.5`, `1.0`, `2.5`, `5.0`, `10.0`, `+Inf`

#### Route Normalization Rules (High-Cardinality Prevention)
Dynamic path parameters MUST be normalized to route templates:
- `/api/v1/rooms/ABCD` → `/api/v1/rooms/:roomCode`
- `/` → `/`
- `/health` → `/health`
- `/ready` → `/ready`
- `/api/v1/health` → `/api/v1/health`
- `/api/v1/lan-info` → `/api/v1/lan-info`
- Static asset requests (`*.js`, `*.css`, `*.png`) → `/assets/*`

### 2.4 Verbatim Exposition Output Example
```prometheus
# HELP http_requests_total Total number of HTTP requests processed.
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/ready",status="200"} 1520
http_requests_total{method="GET",path="/api/v1/health",status="200"} 842
http_requests_total{method="GET",path="/api/v1/lan-info",status="200"} 120
http_requests_total{method="GET",path="/unknown-path",status="404"} 14

# HELP http_request_duration_seconds HTTP request latency in seconds.
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.005",method="GET",path="/api/v1/health"} 810
http_request_duration_seconds_bucket{le="0.01",method="GET",path="/api/v1/health"} 835
http_request_duration_seconds_bucket{le="0.025",method="GET",path="/api/v1/health"} 840
http_request_duration_seconds_bucket{le="0.05",method="GET",path="/api/v1/health"} 842
http_request_duration_seconds_bucket{le="+Inf",method="GET",path="/api/v1/health"} 842
http_request_duration_seconds_sum{method="GET",path="/api/v1/health"} 2.145
http_request_duration_seconds_count{method="GET",path="/api/v1/health"} 842

# HELP http_requests_failed_total Total number of failed HTTP requests.
# TYPE http_requests_failed_total counter
http_requests_failed_total{method="GET",path="/unknown-path",error_code="ERR_NOT_FOUND"} 14

# HELP active_rooms Number of currently active chess rooms in memory.
# TYPE active_rooms gauge
active_rooms 12

# HELP active_connections Number of active client connections.
# TYPE active_connections gauge
active_connections{transport="websocket"} 24

# HELP error_rate Rolling percentage of failed HTTP requests.
# TYPE error_rate gauge
error_rate 0.56

# HELP nodejs_eventloop_lag_seconds Current event loop lag in seconds.
# TYPE nodejs_eventloop_lag_seconds gauge
nodejs_eventloop_lag_seconds 0.0012

# HELP process_resident_memory_bytes Resident memory size in bytes.
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 68157440
```

---

## 3. Versioned Health Endpoint (`GET /api/v1/health`)

### 3.1 Architectural Rationale & Rule Compliance
Per `api-design-principles.md` (Uniform Response Envelopes) and finding MIN-023:
- REST API responses must wrap payload data inside a canonical `{ data: T }` envelope.
- Endpoints must be versioned under `/api/v1/` to distinguish them from raw infrastructure health checks (`/healthz`).

### 3.2 Endpoint Specification

- **HTTP Method:** `GET`, `HEAD`
- **Route Path:** `/api/v1/health`
- **Authentication:** Unauthenticated
- **Content-Type:** `application/json; charset=utf-8`
- **HTTP Status:** `200 OK` (when running), `503 Service Unavailable` (when terminating)

### 3.3 TypeScript Contract Types
```typescript
/**
 * Uniform top-level API envelope contract for REST responses.
 */
export interface ApiResponseEnvelope<T> {
  readonly data: T;
}

/**
 * Health telemetry payload delivered inside the API response envelope.
 */
export interface HealthPayload {
  readonly status: "ok" | "degraded" | "terminating";
  readonly uptimeSeconds: number;
  readonly timestamp: string;
  readonly version?: string;
}
```

### 3.4 Wire Response Body Example
```json
{
  "data": {
    "status": "ok",
    "uptimeSeconds": 142.5,
    "timestamp": "2026-09-10T14:25:00.000Z",
    "version": "1.0.0"
  }
}
```

### 3.5 Infrastructure & Legacy Health Routing Matrix

| Route | Purpose | Response Type | Status Codes | Auth Required |
|---|---|---|---|---|
| `/healthz` | Kubernetes / Cloud Run minimal liveness probe | `text/plain` ("OK") | `200` | No |
| `/ready` | Kubernetes / Cloud Run readiness probe | `application/json` (`{ status, ready }`) | `200`, `503` | No |
| `/api/v1/health` | Canonical versioned application health | `application/json` (`{ data: HealthPayload }`) | `200`, `503` | No |
| `/health` | Unversioned legacy liveness (redirect or backwards compat) | `application/json` | `200` | No |
| `/health/detail` | Comprehensive system diagnostics & relay info | `application/json` | `200`, `403` | Yes (`isTelemetryAuthorized`) |
| `/metrics` | RED Prometheus / OpenMetrics scrape target | `text/plain; version=0.0.4` | `200`, `403` | Yes (`isTelemetryAuthorized`) |

---

## 4. Shared Domain Error Contract Expansion: `ERR_ROOM_CAPACITY_EXCEEDED`

### 4.1 Architectural Rationale & Rule Compliance
Under **CRIT-002** and **MIN-001**, `ERR_ROOM_CAPACITY_EXCEEDED` was omitted from the shared `ErrorCode` union in `@fun-chess/shared/src/contracts/errors.ts`. This forced `apps/server/src/features/rooms/room.errors.ts:86` to use `as unknown as ErrorCode` double casting, subverting compile-time safety and breaking client-side error handling when server room capacity limits are reached.

### 4.2 Shared Contract Updates in `@fun-chess/shared`

#### `shared/src/contracts/errors.ts`
```typescript
export type ErrorCode =
  | "ERR_ROOM_NOT_FOUND"
  | "ERR_ROOM_FULL"
  | "ERR_ROOM_ALREADY_EXISTS"
  | "ERR_ROOM_CAPACITY_EXCEEDED" // CRIT-002: Added canonical error code
  | "ERR_INVALID_ROOM_CODE"
  | "ERR_INVALID_MOVE"
  | "ERR_NOT_YOUR_TURN"
  | "ERR_GAME_NOT_ACTIVE"
  | "ERR_PLAYER_NOT_IN_ROOM"
  | "ERR_UNAUTHORIZED"
  | "ERR_INVALID_PAYLOAD"
  | "ERR_RATE_LIMITED"
  | "ERR_SOCKET_TIMEOUT"
  | "ERR_SOCKET_DISCONNECTED"
  | "ERR_CONFLICT"
  | "ERR_STALE_LOCK_EXECUTION"
  | "ERR_INTERNAL_SERVER";
```

#### Shared `RoomCapacityExceededError` Definition
```typescript
/**
 * Error thrown when the server has reached its configured maximum active room capacity.
 * Maps to HTTP 429 Too Many Requests.
 */
export class RoomCapacityExceededError extends AppError {
  public readonly maxRooms: number;

  constructor(maxRooms: number) {
    super(
      "ERR_ROOM_CAPACITY_EXCEEDED",
      `Maximum room capacity reached (${maxRooms})`,
      429,
      { maxRooms },
    );
    this.name = "RoomCapacityExceededError";
    this.maxRooms = maxRooms;
    Object.setPrototypeOf(this, RoomCapacityExceededError.prototype);
  }
}
```

### 4.3 Wire Serialization in `SocketErrorPayload`
When emitted over Socket.IO acknowledgements or errors:
```json
{
  "code": "ERR_ROOM_CAPACITY_EXCEEDED",
  "message": "Maximum room capacity reached (100)",
  "details": {
    "maxRooms": 100
  },
  "correlationId": "c8f2a1b0-4e3d-4a2c-9a1b-0e2d3c4b5a6f"
}
```

### 4.4 Clean Import in Server Features
In `apps/server/src/features/rooms/room.errors.ts`:
Remove `as unknown as ErrorCode` cast and re-export `RoomCapacityExceededError` directly from `@fun-chess/shared`:
```typescript
export { RoomCapacityExceededError } from "@fun-chess/shared";
```

---

## 5. Canonical `ITimerService` & `TimerHandle` Interface Contract

### 5.1 Architectural Rationale & Rule Compliance
Per `architectural-pattern.md` (Rule 1: I/O Isolation, Rule 3: Dependency Direction) and **MAJ-008**:
- `ITimerService` was previously duplicated with diverging signatures between `apps/server/src/features/rooms/timer_service.ts` and `apps/client/src/features/puzzles/composables/usePuzzleRushTimer.ts`.
- `ShutdownCoordinator` in the platform layer suffered an architectural layer inversion by importing `ITimerService` inward from `features/rooms`.
- Under this contract, `ITimerService` and `TimerHandle` are centralized in `@fun-chess/shared/src/contracts/system.ts`. Both platform layers and feature modules depend strictly on shared contracts.

### 5.2 Canonical Interface Contract (`@fun-chess/shared/src/contracts/system.ts`)
```typescript
/**
 * Opaque handle representing an active scheduled timer across environments (Node.js & browser).
 */
export interface TimerHandle {
  /** Prevents runtime event loop from exiting while timer is active (Node.js only, no-op in browser) */
  ref?(): void;
  /** Allows runtime event loop to exit even if timer is active (Node.js only, no-op in browser) */
  unref?(): void;
  /** Underlying runtime timer identifier */
  readonly id?: unknown;
}

/**
 * Interface contract isolating timer scheduling behind an abstract boundary.
 * Enables deterministic virtual-time advancement in unit tests without global clock pollution.
 */
export interface ITimerService {
  /** Schedules a one-shot task to run after delayMs */
  setTimeout(
    callback: () => void | Promise<void>,
    delayMs: number,
  ): TimerHandle;

  /** Cancels an active one-shot timer */
  clearTimeout(handle: TimerHandle | unknown): void;

  /** Schedules a recurring periodic task every intervalMs */
  setInterval(
    callback: () => void | Promise<void>,
    intervalMs: number,
  ): TimerHandle;

  /** Cancels an active recurring periodic timer */
  clearInterval(handle: TimerHandle | unknown): void;
}
```

### 5.3 Implementation & Dependency Direction

```
        ┌────────────────────────────────────────┐
        │        @fun-chess/shared               │
        │   contracts/system.ts (ITimerService)  │
        └───────────────────▲────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
┌───────────┴──────────┐        ┌───────────┴──────────┐
│     apps/server      │        │     apps/client      │
│  platform/time/      │        │  platform/time/      │
│  SystemTimerService  │        │  BrowserTimerService │
│  (Node.js timers)    │        │  (window timers)     │
└───────────▲──────────┘        └───────────▲──────────┘
            │                               │
┌───────────┴──────────┐        ┌───────────┴──────────┐
│  features/rooms/     │        │  features/puzzles/   │
│  ShutdownCoordinator │        │  usePuzzleRushTimer  │
└──────────────────────┘        └──────────────────────┘
```

- **Layer Inversion Remediation:** `ShutdownCoordinator` imports `type { ITimerService, TimerHandle } from "@fun-chess/shared"`. Platform no longer depends on feature code.
- **Production Server Implementation:** Moved to `apps/server/src/platform/time/system_timer_service.ts`, thoroughly covered by unit tests.
- **Production Client Implementation:** Located in `apps/client/src/platform/time/browser_timer_service.ts`.
- **Test Doubles:** `MockTimerService` in test utilities implements `ITimerService` and exposes synchronous `advance(ms: number)` for deterministic test suites.

---

## 6. Socket.IO Handshake Rate Limiting & Concurrency Control Contract

### 6.1 Architectural Rationale & Rule Compliance
Per `security-principles.md` § Rate Limiting & Resource Exhaustion and **MAJ-002**:
- Standard HTTP endpoints are rate-limited, but WebSocket handshakes (`/socket.io/?...`) bypass the HTTP router rate limiter.
- Malicious clients could open thousands of concurrent WebSocket connections from a single IP, exhausting file descriptors and event loop memory.
- Ingress handshakes must enforce both **handshake IP rate limits** and **maximum concurrent open connections per client IP**.

### 6.2 Defense-in-Depth Handshake Architecture

```
Incoming Request (GET /socket.io/?...)
            │
            ▼
┌───────────────────────────────────────┐
│ Level 1: allowRequest Hook            │
│ - Validate CORS origin                │
│ - Check IP handshake rate limit       │
└───────────────────┬───────────────────┘
                    │ Pass
                    ▼
┌───────────────────────────────────────┐
│ Level 2: io.use Connection Middleware │
│ - Check active socket count for IP    │
│ - Cap concurrent connections (max 10) │
└───────────────────┬───────────────────┘
                    │ Pass
                    ▼
┌───────────────────────────────────────┐
│ Connection Established (io.on)        │
│ - Attach connection correlationId     │
│ - Register room & game event handlers │
└───────────────────────────────────────┘
```

### 6.3 Handshake Rate Limiting Specification (Level 1: `allowRequest`)

#### Configuration Parameters
- **Window:** 10,000 ms (10 seconds)
- **Max Handshakes per IP:** 30 attempts per window
- **Key:** Client IP extracted via `extractClientIp(req, trustProxy)`

#### Rejection Behavior (Engine.IO Handshake)
When `checkRateLimit(clientIp)` fails during `allowRequest`:
1. Reject the handshake cleanly using Engine.IO callback with a descriptive message:
   ```typescript
   callback("Handshake rate limit exceeded", false);
   ```
   *(Remediates CRIT-002: no more `callback(3 as unknown as string, false)`)*
2. Send HTTP `429 Too Many Requests` on polling handshakes:
   ```http
   HTTP/1.1 429 Too Many Requests
   Content-Type: application/json; charset=utf-8
   Retry-After: 10
   ```
   ```json
   {
     "code": "ERR_RATE_LIMITED",
     "message": "Too many connection attempts. Please wait before reconnecting.",
     "retryAfter": 10
   }
   ```

### 6.4 Concurrent Connection Cap Specification (Level 2: `io.use` Middleware)

#### Configuration Parameters
- **Max Concurrent Sockets per IP:** 10 active connections
- **Tracking:** Concurrent connection registry in `SocketServer` incremented on connection and decremented on `socket.on("disconnect")`.

#### Rejection Behavior (Socket.IO Connection Middleware)
When a client IP exceeds the concurrent connection threshold:
```typescript
io.use((socket, next) => {
  const clientIp = extractClientIp(socket.handshake, trustProxy);
  const activeCount = connectionTracker.getActiveCount(clientIp);

  if (activeCount >= MAX_CONCURRENT_SOCKETS_PER_IP) {
    const error = new Error("Maximum concurrent connections exceeded");
    (error as any).data = {
      code: "ERR_RATE_LIMITED",
      message: `Maximum concurrent connections exceeded (${MAX_CONCURRENT_SOCKETS_PER_IP} per IP). Close existing tabs.`,
      retryAfter: 30,
      details: {
        activeConnections: activeCount,
        maxAllowed: MAX_CONCURRENT_SOCKETS_PER_IP,
      },
    } satisfies SocketErrorPayload;

    next(error);
    return;
  }

  connectionTracker.increment(clientIp);
  socket.on("disconnect", () => connectionTracker.decrement(clientIp));
  next();
});
```

#### Client Error Delivery
The rejected client receives a `connect_error` event with the structured payload:
```typescript
socket.on("connect_error", (err: Error & { data?: SocketErrorPayload }) => {
  if (err.data?.code === "ERR_RATE_LIMITED") {
    // Surface user-friendly notification: "Too many open tabs or active connections."
  }
});
```

---

## 7. Static File Server Uniform Error Envelopes (`static_handler.ts`)

### 7.1 Architectural Rationale & Rule Compliance
Per finding **MIN-024**, `static_handler.ts` returned structured JSON error envelopes for HTTP 404, but returned raw `text/plain` for HTTP 403 and HTTP 500. All error responses across the server must adhere to the standardized `HttpErrorEnvelope` format.

### 7.2 Specification of `HttpErrorEnvelope`

```typescript
export interface HttpErrorEnvelope {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly statusCode: number;
    readonly correlationId?: string;
    readonly details?: Record<string, unknown>;
  };
}
```

### 7.3 Status Code & Payload Matrix in `static_handler.ts`

| Status | ErrorCode | Message | Content-Type |
|---|---|---|---|
| `403 Forbidden` | `ERR_UNAUTHORIZED` | "Access to requested resource is forbidden" | `application/json` |
| `404 Not Found` | `ERR_ROOM_NOT_FOUND` / `ERR_NOT_FOUND` | "The requested static resource was not found" | `application/json` |
| `500 Internal Error` | `ERR_INTERNAL_SERVER` | "An unexpected error occurred while serving static asset" | `application/json` |

---

## 8. Summary of API Changes & Validation Checklist

- [x] `/ready` endpoint added to `handleHealthRoutes` returning 200 (ready) or 503 (terminating).
- [x] `/metrics` endpoint updated to expose standard OpenMetrics / Prometheus text output with RED metrics and gauge saturation.
- [x] `/api/v1/health` added with `{ data: HealthPayload }` uniform envelope; `/healthz` preserved as raw text.
- [x] `"ERR_ROOM_CAPACITY_EXCEEDED"` added to `ErrorCode` union in `@fun-chess/shared/src/contracts/errors.ts`; double casts eliminated.
- [x] `ITimerService` and `TimerHandle` centralized in `@fun-chess/shared/src/contracts/system.ts`; `ShutdownCoordinator` layer inversion fixed.
- [x] Socket.IO handshake rate limiting and IP concurrency caps defined with 429 and `connect_error` `SocketErrorPayload` responses.
- [x] `static_handler.ts` standardized to return `HttpErrorEnvelope` across all 403, 404, and 500 error responses.
