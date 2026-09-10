# Project Conventions & Architectural Standards: Fun Chess Remediation

> **Status:** FROZEN ARCHITECTURAL CONVENTIONS
> **Phase:** Wave 0 (Design Phase)
> **Author:** System Architect (`@architect`)
> **Audience:** All Domain Implementers (`@backend-engineer`, `@frontend-engineer`, `@tech-lead`, `@test-automation-engineer`, `@reviewer`)
> **Authority:** Preempts all individual builder decisions. Any deviation requires formal ADR and Architect approval.
> **Audit Findings Addressed:** CRIT-002, CRIT-003, MAJ-004, MAJ-005, MAJ-006, MAJ-010, MAJ-011, MAJ-012, MAJ-013, MAJ-014, MAJ-015, MAJ-016, MAJ-017, MAJ-018, MAJ-019, MAJ-020, MAJ-025, MAJ-027, MAJ-028, MIN-003, MIN-004, MIN-005, MIN-006, MIN-007, MIN-008, MIN-009, MIN-010, MIN-011, MIN-012, MIN-013, MIN-014, ENH-001, ENH-002, ENH-003, ENH-005, ENH-006, ENH-008

---

## 1. Monorepo Architecture & Feature Directory Layout (`project-structure.md`)

### 1.1 Universal Architectural Philosophy: Context → Feature → Layer
Fun Chess organizes code strictly **by vertical business feature slices**, never by technical layer at the package root.
- **Context (Monorepo Root):** Independent deployable applications (`apps/server`, `apps/client`, `apps/e2e`), common libraries (`shared/`), and infrastructure (`infra/terraform/`).
- **Feature Level:** Each business domain is self-contained in its feature directory (e.g., `rooms/`, `game/`, `lan/` in server; `multiplayer/`, `puzzles/`, `scenarios/`, `ai/`, `hud/`, `lobby/`, `pwa/` in client).
- **Layer Level:** Storage, domain services, socket gateways, controllers, and UI components reside within their respective feature folder.

### 1.2 Module Boundaries & Public API Barrel Export Enforcement (MAJ-019)
1. **Single Entry Point:** Every feature directory MUST expose an `index.ts`. Only symbols exported from `index.ts` form the public API of that feature.
2. **Encapsulation:** Internal files (`*.service.ts`, `*.socket_handler.ts`, `*.store.ts`, private composables) are strictly private to the feature.
3. **Cross-Feature Imports:** Other features, platform layers, and test suites MUST import exclusively from the feature barrel:
   - **Correct:** `import { RoomService, InMemoryRoomStore } from "../features/rooms/index.js";`
   - **Prohibited:** `import { RoomService } from "../features/rooms/room.service.js";` (MAJ-019 violation)
4. **Acyclic Dependency Invariant:** Dependencies point inward toward business logic. If feature A requires feature B, and feature B requires feature A, extract the shared contract to `@fun-chess/shared` or inject an interface contract at the composition root.

### 1.3 Complete Reference Skeleton: Server Feature Directory (`apps/server/src/features/rooms/`)
```
apps/server/src/features/rooms/
├── index.ts                     # Public API barrel export ONLY
├── room.interface.ts            # Domain interfaces, options, and error contracts
├── room.service.ts              # Business logic orchestrator (constructor-injected dependencies)
├── room.logic.ts                # Pure domain functions (zero I/O, mandatory `now: number` parameter)
├── room.socket_handler.ts       # Socket.IO ingress controller (thin pipeline adapter)
├── room.store.ts                # Storage abstraction contract & constants (MAX_ROOMS)
├── in_memory_room.store.ts      # In-memory production storage implementation
├── mock_room.store.ts           # Test double storage implementation
├── session_registry.ts          # Session storage abstraction contract
├── in_memory_session_registry.ts# Session storage implementation (injected secret & isProduction)
├── disconnect_timer_registry.ts # Timer grace period manager
└── __tests__/                   # Co-located unit and contract test suites
    ├── room.service.spec.ts
    ├── room.socket_handler.spec.ts
    ├── in_memory_room.store.spec.ts
    ├── mock_room.store.spec.ts
    ├── in_memory_session_registry.spec.ts
    └── disconnect_timer_registry.spec.ts
```

### 1.4 Complete Reference Skeleton: Client Feature Directory (`apps/client/src/features/multiplayer/`)
```
apps/client/src/features/multiplayer/
├── index.ts                     # Public API barrel export ONLY
├── components/                  # Feature UI components (Vue SFCs)
│   ├── MultiplayerArena.vue
│   └── RoomLobby.vue
├── composables/                 # Single-purpose composables (CC < 10, lines 10–50)
│   ├── useRoomSession.ts        # Session lifecycle & reconnection
│   ├── useGameActions.ts        # Game actions (moves, resign, draw, rematch)
│   ├── useSocketTransport.ts    # Transport-level socket emitter and listener
│   └── room_session_state.ts    # Reactive state container (factory/DI scoped)
├── engine/                      # Pure calculation engines (zero I/O, deterministic)
└── __tests__/                   # Co-located unit test suites
    ├── useRoomSession.spec.ts
    ├── useGameActions.spec.ts
    └── useSocketTransport.spec.ts
```

---

## 2. File Naming & Code Idiom Conventions

### 2.1 File Postfixes & Responsibility Table
Every TypeScript source file in the monorepo MUST adhere to this naming taxonomy:

| File Postfix | Purpose / Content | Permitted Dependencies | Prohibited Content |
|---|---|---|---|
| `*.interface.ts` | TypeScript types, interfaces, options, domain errors | None or `@fun-chess/shared` | Implementations, side effects |
| `*.service.ts` | Domain orchestration & workflow logic | Injected interfaces, pure logic | Native timers, global `process.env` |
| `*.logic.ts` | Pure calculation functions, state transforms | Domain types | Native timers, `Date.now()`, I/O |
| `*.store.ts` | Storage abstraction contract & constants | Domain types, `StorageOptions` | In-memory maps, DB drivers |
| `in_memory_*.store.ts` | In-memory production storage implementation | `*.store.ts`, `IClock`, `Logger` | Un-isolated global state |
| `mock_*.store.ts` | Test double for unit testing | `*.store.ts` | External network or disk I/O |
| `*.socket_handler.ts` | Socket.IO event ingress adapter | Feature service, socket middleware | Direct database/store queries |
| `*.controller.ts` | HTTP endpoint ingress adapter | Feature service, HTTP helpers | Inline business logic |
| `*.spec.ts` | Unit or contract test suite | Target unit, test doubles | Live network servers, real timeouts |
| `*.integration.spec.ts` | Live integration test against in-memory stack | Real HTTP/socket loopback | Heavy external cloud infrastructure |
| `*.e2e.test.ts` | Playwright browser E2E test | Playwright test fixtures | Private server internals |

---

## 3. Modular Server Bootstrap Architecture (MAJ-027)

### 3.1 Problem & Architectural Decomposition
`apps/server/src/index.ts` previously spanned 846 lines, bundling configuration validation, domain storage instantiation, Socket.IO gateway listeners, HTTP route registration, graceful shutdown coordination, and periodic cron jobs inline. This made testing server bootstrap difficult without triggering cascading side effects.

Under **MAJ-027**, bootstrap is decomposed into four modular files under `apps/server/src/bootstrap/`:

```
apps/server/src/
├── index.ts                     # Lean Composition Root & CLI Entry Point (< 80 lines)
└── bootstrap/
    ├── index.ts                 # Bootstrap module barrel
    ├── domain_services.ts       # Storage, registries, clocks, and domain service wiring
    ├── socket_gateway.ts        # Socket.IO connection handling & feature handler registration
    ├── http_layer.ts            # Node HTTP server, controllers, routing & static assets
    └── lifecycle.ts             # ShutdownCoordinator, signal handling & background jobs
```

### 3.2 Module Specifications

#### 3.2.1 `apps/server/src/bootstrap/domain_services.ts`
- **Purpose:** Pure dependency injection wiring of domain services and storage adapters.
- **Responsibilities:**
  - Instantiates `IClock`, `IIdGenerator`, `ITimerService`.
  - Instantiates `InMemorySessionRegistry` passing `sessionSecret` and `isProduction` directly into the constructor (remediating MAJ-005).
  - Instantiates `InMemoryRoomStore`, `RoomService`, `GameService`, `RelayAddressService`.
- **Contract:**
```typescript
export interface DomainServices {
  clock: IClock;
  idGenerator: IIdGenerator;
  timerService: ITimerService;
  timerRegistry: IDisconnectTimerRegistry;
  sessionRegistry: SessionRegistry;
  roomStore: RoomStore;
  roomService: IRoomService;
  gameService: IGameService;
  relayAddressService: IRelayAddressService;
}

export function setupDomainServices(
  options: StartServerOptions,
  env: ServerEnv,
  port: number,
  logger: Logger,
): DomainServices;
```

#### 3.2.2 `apps/server/src/bootstrap/socket_gateway.ts`
- **Purpose:** Socket.IO gateway configuration, ingress rate limiting, and event registration.
- **Responsibilities:**
  - Sets up the `connection` listener on `TypedSocketServer`.
  - Attaches correlation tracing, socket rate limiting, and transport error listeners.
  - Registers room socket handlers (`registerRoomSocketHandlers`) and game socket handlers (`registerGameSocketHandlers`).
  - Implements socket disconnection handling with structured logging and duration tracking.
- **Contract:**
```typescript
export function setupSocketGateway(
  io: TypedSocketServer,
  domainServices: DomainServices,
  rateLimiter: SocketRateLimiter,
  env: ServerEnv,
  logger: Logger,
  roomCreateRateLimiter?: SocketRateLimiter,
): void;
```

#### 3.2.3 `apps/server/src/bootstrap/http_layer.ts`
- **Purpose:** HTTP transport layer, REST controllers, and SPA static delivery.
- **Responsibilities:**
  - Configures native Node `http.Server` with request and headers timeout limits (`configureServerTimeouts`).
  - Instantiates `HealthController`, `LanInfoController`, and `StaticController`.
  - Configures route handling via `HttpRouter` (`/health`, `/health/detail`, `/api/v1/lan-info`, `/api/lan-info` 307 redirect, static assets).
  - Configures security headers, HTTP rate limiting, and 404 scanning defense (ENH-001).
- **Contract:**
```typescript
export interface HttpLayerSetupParams {
  domainServices: DomainServices;
  bootstrapConfig: ServerBootstrapConfig;
  fileStorage?: IFileStorage;
  httpRateLimiter?: HttpRateLimiter;
  getActiveSocketCount: () => number;
}

export function setupHttpLayer(params: HttpLayerSetupParams): http.Server;
```

#### 3.2.4 `apps/server/src/bootstrap/lifecycle.ts`
- **Purpose:** Process lifecycle, signal traps, background jobs, and graceful shutdown.
- **Responsibilities:**
  - Configures `ShutdownCoordinator` with phase-ordered shutdown hooks (1. stop ingress, 2. drain connections, 3. flush logs, 4. close storage).
  - Registers `SIGINT`, `SIGTERM`, `uncaughtException`, and `unhandledRejection` traps.
  - Schedules background cleanup jobs (`setupBackgroundJobs`) using `ITimerService`, propagating `jobCorrelationId` to `roomService.cleanupAbandonedRooms(ttl, jobCorrelationId)` (MAJ-010).
- **Contract:**
```typescript
export function setupLifecycle(
  server: http.Server,
  io: TypedSocketServer,
  domainServices: DomainServices,
  cleanupInterval: TimerHandle,
  logger: Logger,
  onExit?: (code: number) => void,
): ShutdownCoordinator;

export function setupBackgroundJobs(
  roomService: IRoomService,
  timerService: ITimerService,
  logger: Logger,
): TimerHandle;
```

#### 3.2.5 Lean Composition Root (`apps/server/src/index.ts`)
`apps/server/src/index.ts` is strictly a composition root wiring the bootstrap modules together:

```typescript
import { fileURLToPath } from "node:url";
import {
  resolveServerBootstrapConfig,
  setupDomainServices,
  setupSocketGateway,
  setupHttpLayer,
  setupBackgroundJobs,
  setupLifecycle,
  type StartServerOptions,
  type ServerInstance,
} from "./bootstrap/index.js";

export async function startServer(options: StartServerOptions = {}): Promise<ServerInstance> {
  const config = resolveServerBootstrapConfig(options);
  const domainServices = setupDomainServices(options, config.env, config.port, config.logger);
  const server = setupHttpLayer({ domainServices, bootstrapConfig: config, ... });
  const io = createSocketServer(server, { ... });
  setupSocketGateway(io, domainServices, rateLimiter, config.env, config.logger);
  const cleanupJob = setupBackgroundJobs(domainServices.roomService, domainServices.timerService, config.logger);
  const shutdownCoordinator = setupLifecycle(server, io, domainServices, cleanupJob, config.logger, options.onExit);

  if (options.autoListen !== false) {
    await new Promise<void>((resolve) => server.listen(config.port, config.host, resolve));
  }

  return { server, io, shutdownCoordinator, ...domainServices, close: () => shutdownCoordinator.shutdown() };
}

// Direct CLI execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
}
```

---

## 4. Timer & Clock Abstraction Conventions (MAJ-014, ENH-008)

### 4.1 Canonical Clock Consolidation (ENH-008)
All time-querying code MUST depend on the canonical `IClock` contract in `@fun-chess/shared`.
- **Interface:** `IClock` (`now(): number`) in `shared/src/contracts/system.ts`.
- **Implementations:** `SystemClock` and `MockClock` in `shared/src/utils/system_clock.ts`.
- **Rule:** Triplicated implementations in `apps/server/src/platform/time/clock.ts` and `apps/client/src/platform/time/clock.ts` are DEPRECATED and MUST re-export or consume `@fun-chess/shared`.

### 4.2 Timer Service Contract (`ITimerService`, MAJ-014)
Native `setTimeout`, `clearTimeout`, `setInterval`, and `clearInterval` violate Rule 1 (I/O Isolation) when invoked directly in business services or composables. They MUST be abstracted behind `ITimerService`:

```typescript
/**
 * Opaque handle representing an active scheduled timer.
 */
export interface TimerHandle {
  /** Prevents the Node.js event loop from exiting while timer is active */
  ref?(): void;
  /** Allows the Node.js event loop to exit even if timer is active */
  unref?(): void;
  /** Opaque underlying runtime identifier */
  readonly id?: unknown;
}

/**
 * Interface contract isolating timer scheduling behind an abstract boundary (MAJ-014).
 * Enables deterministic fast-forwarding in unit tests without global mock pollution.
 */
export interface ITimerService {
  /** Schedules a one-shot timer after delayMs */
  setTimeout(callback: () => void | Promise<void>, delayMs: number): TimerHandle;
  /** Cancels an active one-shot timer */
  clearTimeout(handle: TimerHandle | unknown): void;
  /** Schedules a recurring periodic timer */
  setInterval(callback: () => void | Promise<void>, intervalMs: number): TimerHandle;
  /** Cancels an active recurring periodic timer */
  clearInterval(handle: TimerHandle | unknown): void;
}
```

### 4.3 Implementations in Shared / Platform Layers
1. **`SystemTimerService` (Production):**
   ```typescript
   export class SystemTimerService implements ITimerService {
     public setTimeout(callback: () => void | Promise<void>, delayMs: number): TimerHandle {
       const timer = setTimeout(callback, delayMs);
       return { ref: () => timer.ref?.(), unref: () => timer.unref?.(), id: timer };
     }
     public clearTimeout(handle: TimerHandle | unknown): void {
       const timer = handle && typeof handle === 'object' && 'id' in handle ? handle.id : handle;
       clearTimeout(timer as NodeJS.Timeout);
     }
     public setInterval(callback: () => void | Promise<void>, intervalMs: number): TimerHandle {
       const timer = setInterval(callback, intervalMs);
       return { ref: () => timer.ref?.(), unref: () => timer.unref?.(), id: timer };
     }
     public clearInterval(handle: TimerHandle | unknown): void {
       const timer = handle && typeof handle === 'object' && 'id' in handle ? handle.id : handle;
       clearInterval(timer as NodeJS.Timeout);
     }
   }
   ```
2. **`MockTimerService` (Testing):**
   Maintains a virtual queue of scheduled tasks, ordered by execution timestamp, and allows tests to advance time deterministically via `mockTimerService.advance(ms)` without real-world waiting or flaky timeouts.

### 4.4 Mandatory Refactoring Sites:
- **Server:**
  - `RoomService.scheduleAbandonmentTimer` (remediates MAJ-014).
  - `setupBackgroundJobs` (remediates MAJ-014, MAJ-010).
- **Client:**
  - `usePuzzleRushTimer.ts` (remediates MAJ-014).
  - `useSocketTransport.ts` (reconnection countdowns).

---

## 5. Platform DOM Provider Abstractions in Vue DI (MAJ-015)

### 5.1 Problem Statement
Direct references to `window.location`, `window.matchMedia`, and `navigator.onLine` in Vue components (`QrCodeModal.vue`) and composables (`useNetworkStatus.ts`) violate Rule 1 (I/O Isolation). They prevent unit testing in headless environments and require brittle global window stubs.

### 5.2 Contracts (`apps/client/src/platform/browser/`)

#### 5.2.1 `ILocationProvider`
```typescript
/**
 * Interface contract isolating browser location and URL navigation (MAJ-015).
 */
export interface ILocationProvider {
  readonly href: string;
  readonly origin: string;
  readonly host: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly protocol: string;
  assign(url: string): void;
  replace(url: string): void;
  reload(): void;
}

export class BrowserLocationProvider implements ILocationProvider {
  get href(): string { return window.location.href; }
  get origin(): string { return window.location.origin; }
  get host(): string { return window.location.host; }
  get hostname(): string { return window.location.hostname; }
  get port(): string { return window.location.port; }
  get pathname(): string { return window.location.pathname; }
  get protocol(): string { return window.location.protocol; }
  assign(url: string): void { window.location.assign(url); }
  replace(url: string): void { window.location.replace(url); }
  reload(): void { window.location.reload(); }
}

export class MockLocationProvider implements ILocationProvider {
  private url: URL;
  constructor(initialUrl = "http://localhost:3000/") {
    this.url = new URL(initialUrl);
  }
  get href(): string { return this.url.href; }
  get origin(): string { return this.url.origin; }
  get host(): string { return this.url.host; }
  get hostname(): string { return this.url.hostname; }
  get port(): string { return this.url.port; }
  get pathname(): string { return this.url.pathname; }
  get protocol(): string { return this.url.protocol; }
  assign(url: string): void { this.url = new URL(url, this.url.origin); }
  replace(url: string): void { this.url = new URL(url, this.url.origin); }
  reload(): void { /* no-op in tests */ }
}
```

#### 5.2.2 `INetworkMonitor`
Formalized in `apps/client/src/platform/hardware/network_monitor.interface.ts`:
```typescript
export interface INetworkMonitor {
  isOnline(): boolean;
  addListener(listener: (isOnline: boolean) => void): () => void;
  setOnlineStatus?(isOnline: boolean): void;
}
```

### 5.3 Vue Dependency Injection Tokens (`apps/client/src/platform/di/`)
Add the new capability token to `apps/client/src/platform/di/tokens.ts`:
```typescript
export const LOCATION_PROVIDER_KEY: InjectionKey<ILocationProvider> = Symbol('LOCATION_PROVIDER');
export const NETWORK_MONITOR_KEY: InjectionKey<INetworkMonitor> = Symbol('NETWORK_MONITOR');
```

Add resolution helpers to `apps/client/src/platform/di/resolvers.ts`:
```typescript
export function useInjectLocationProvider(): ILocationProvider {
  return inject(LOCATION_PROVIDER_KEY, () => new BrowserLocationProvider(), true);
}

export function useInjectNetworkMonitor(): INetworkMonitor {
  return inject(NETWORK_MONITOR_KEY, () => new BrowserNetworkMonitor(), true);
}
```

### 5.4 Component & Composable Migration:
- **`QrCodeModal.vue`:** Inject `locationProvider = useInjectLocationProvider()`. Replace `window.location.hostname` with `locationProvider.hostname`.
- **`useNetworkStatus.ts`:** Inject `networkMonitor = useInjectNetworkMonitor()`. Eliminate direct `navigator.onLine` reads and window listener attachments.

---

## 6. Service Logging & Error Level Conventions (MAJ-004)

### 6.1 Logging Level Hierarchy & Semantic Meaning
All structured logs across the monorepo MUST follow strict severity semantics:

| Level | When to Use | Examples | Alerting Policy |
|---|---|---|---|
| `DEBUG` | Low-level developer tracing, masked token fingerprints, cache hits | `session_storage_create`, `minimax_leaf_eval` | Ignored by SRE alerts |
| `INFO` | Operation entry points and successful completions | `room_created`, `game_move_completed`, `client_connected` | Aggregated for KPI metrics |
| `WARN` | Expected client rejections (4xx errors), rate limiting, degraded state | `RoomNotFoundError` (404), `GameNotActiveError` (400), `InvalidPayloadError` (400), rate limit hit | Dashboard warning, no paging |
| `ERROR` | Unexpected internal server faults (500 errors), crashes, corrupted state | Database storage failure, crypto exception, stream corruption | Immediate SRE page / alert |

### 6.2 Service vs. Transport Layer Logging Separation (MAJ-004)
- **The Anti-Pattern (MAJ-004):** `GameService` and `RoomService` catch blocks logged expected domain exceptions at `this.logger.error()` before rethrowing. The transport layer middleware caught the rethrown error and logged it again as `this.logger.warn()`, creating false-positive SRE alerts for every user typo or invalid move.
- **The Mandate:**
  1. **Transport Layer Owns Error Logging:** Transport ingress middleware (`createFeatureSocketHandler`, `HttpRouter`) is the designated operation boundary that logs client rejections at `warn` and unhandled exceptions at `error`.
  2. **Service Layer Rethrow Rule:** Domain services (`GameService`, `RoomService`) should generally NOT catch-and-log expected domain errors before rethrowing.
  3. **Conditional Service Logging:** If a service MUST log upon catch, it MUST inspect the error type:
     ```typescript
     // apps/server/src/features/rooms/room.service.ts
     } catch (err: unknown) {
       const duration = this.clock.now() - startTime;
       if (err instanceof AppError && err.statusCode < 500) {
         this.logger.warn("Room operation rejected by domain rule", {
           operation: "room_create",
           duration,
           durationMs: duration,
           statusCode: err.statusCode,
           errorCode: err.code,
           ...(correlationId ? { correlationId } : {}),
         });
       } else {
         this.logger.error("Room operation failed unexpectedly", {
           operation: "room_create",
           duration,
           durationMs: duration,
           error: serializeError(err),
           ...(correlationId ? { correlationId } : {}),
         });
       }
       throw err;
     }
     ```

---

## 7. Error Serialization Standard (MAJ-028)

### 7.1 Canonical Serialization Standard
All logging statements, error responses, and audit trails across all monorepo packages MUST use the canonical serialization utility exported from `@fun-chess/shared`:

```typescript
import { serializeError } from "@fun-chess/shared";
```

### 7.2 Prohibited Anti-Pattern
The 3-line inline ternary pattern is strictly banned across all workspaces:
```typescript
// ❌ PROHIBITED (MAJ-028 Violation)
error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { raw: err }

// ❌ PROHIBITED (Swallows stack trace and error properties)
error: err instanceof Error ? err.message : String(err)

// ✅ MANDATORY (Complies with MAJ-028)
error: serializeError(err)
```

### 7.3 Remediated Files (14 Identified Call Sites):
1. `apps/server/src/features/rooms/in_memory_room.store.ts`
2. `apps/server/src/features/rooms/room.socket_handler.ts`
3. `apps/server/src/platform/http/http_router.ts`
4. `apps/server/src/platform/http/static_handler.ts`
5. `apps/server/src/platform/http/http_helpers.ts`
6. `apps/server/src/platform/lifecycle/shutdown_coordinator.ts`
7. `apps/server/src/platform/logger/job_runner.ts`
8. `apps/server/src/features/lan/relay_address.service.ts`
9. `apps/server/src/platform/socket/socket_logging_middleware.ts`
10. `apps/server/src/bootstrap/lifecycle.ts`
11. `apps/server/src/bootstrap/socket_gateway.ts`
12. `apps/client/src/platform/api/fetch_api_client.ts`
13. `apps/client/src/platform/socket/socket_client.ts`
14. `apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts`

---

## 8. Defense-in-Depth Conventions

### 8.1 Fail-Closed Session Token Creation (CRIT-002)
- **Defect:** `InMemorySessionRegistry.createSession()` silently caught cryptographic exceptions and returned an un-signed raw UUID.
- **Mandate:** Empty catch blocks and insecure fallbacks are strictly prohibited (`rugged-software-constitution.md`). If token signing fails, the registry MUST log an error and throw an exception to fail closed:

```typescript
// apps/server/src/features/rooms/in_memory_session_registry.ts
public async createSession(
  params: { playerId: string; roomCode: string; color: PieceColor; isHost: boolean; socketId: string; ttlMs?: number },
  options?: StorageMutationOptions,
): Promise<SessionRecord> {
  this.assertNotAborted(options?.signal);

  const code = params.roomCode.toUpperCase();
  const rawId = this.idGenerator.generateId();

  let sessionToken: string;
  try {
    sessionToken = generateSessionToken(rawId, this.sessionSecret);
  } catch (cryptoErr) {
    this.logger.error("Cryptographic session token generation failed", {
      operation: "session_storage_create",
      roomCode: code,
      playerId: params.playerId,
      error: serializeError(cryptoErr),
      ...(options?.correlationId ? { correlationId: options.correlationId } : {}),
    });
    throw new AppError(500, "ERR_SESSION_GENERATION_FAILED", "Failed to securely initialize player session token");
  }

  // Proceed with validated signed token...
```

### 8.2 Safe Stream Reading in Fetch API Client (CRIT-003)
- **Defect:** `FetchApiClient.parseResponseBody` called `response.json()` and on error called `(response as any).text()`. Because `.json()` consumes the stream (`bodyUsed = true`), the secondary `.text()` threw `TypeError: body stream already read`, caught by an empty catch block that returned `null`.
- **Mandate:** The response body MUST be read exactly once as raw text, and subsequently parsed in memory. Zero empty catch blocks:

```typescript
// apps/client/src/platform/api/fetch_api_client.ts
private async parseResponseBody<T>(response: Response): Promise<T> {
  if (!response || response.status === 204 || response.status === 205) {
    return null as T;
  }

  let text: string;
  try {
    text = await response.text();
  } catch (streamErr) {
    this.logger.error("Failed to read HTTP response stream", {
      operation: "http_parse_body",
      error: serializeError(streamErr),
    });
    throw streamErr;
  }

  if (!text || text.trim().length === 0) {
    return null as T;
  }

  const contentType = response.headers?.get?.('content-type') ?? '';
  const isJson = !contentType || contentType.includes('json');

  if (isJson) {
    try {
      return JSON.parse(text) as T;
    } catch (parseErr) {
      this.logger.warn("Failed to parse JSON response body, returning raw text", {
        operation: "http_parse_body",
        error: serializeError(parseErr),
      });
      return text as unknown as T;
    }
  }

  return text as unknown as T;
}
```

### 8.3 Prototype Pollution Protection in Compact Decoding (MAJ-006)
- **Defect:** `DefaultDictionaryMapper.fromCompact` populated scenario maps with untrusted keys from imported QR codes / files without checking for dangerous prototype keys.
- **Mandate:** All deserializers decoding untrusted key-value dictionaries MUST:
  1. Initialize maps using `Object.create(null)` to eliminate prototype inheritance.
  2. Filter keys against a forbidden key allowlist before assignment.

```typescript
// shared/src/utils/dictionary_mapper.ts
const FORBIDDEN_PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

public fromCompact(compact: CompactProgress): DecodedProgress {
  const scenarios: ScenarioProgressMap = Object.create(null);

  if (Array.isArray(compact.scenarios)) {
    for (const tuple of compact.scenarios) {
      if (!Array.isArray(tuple) || tuple.length < 6) continue;
      const [id, stars, attempts, hints, firstSec, lastSec] = tuple;
      if (!id || typeof id !== "string") continue;

      const cleanId = id.trim();
      if (FORBIDDEN_PROTOTYPE_KEYS.has(cleanId)) {
        continue; // Discard prototype poisoning attempt (MAJ-006)
      }

      scenarios[cleanId] = {
        scenarioId: cleanId,
        starsEarned: stars === 3 ? 3 : stars === 2 ? 2 : 1,
        attemptsCount: Math.max(0, Math.floor(attempts ?? 0)),
        hintsUsedTotal: Math.max(0, Math.floor(hints ?? 0)),
        firstCompletedAt: Math.max(0, Math.floor((firstSec ?? 0) * 1000)),
        lastCompletedAt: Math.max(0, Math.floor((lastSec ?? 0) * 1000)),
      };
    }
  }
  return { scenarios, ... };
}
```

### 8.4 Functional Socket Middleware Pipeline (MAJ-025)
- **Defect:** `wrapSocketHandler` spanned 179 lines with 5 overloaded positional parameters, cyclomatic complexity of 31, doing IP parsing, rate limiting, logging, Zod validation, and ack serialization in one monolithic function.
- **Mandate:** Refactor into a clean, functional middleware pipeline:

```typescript
// apps/server/src/platform/socket/socket_middleware_pipeline.ts

export type SocketMiddlewareContext = {
  socket: Socket;
  operationName: string;
  correlationId: string;
  clientIp: string;
  startTime: number;
  logger: Logger;
  trustProxy?: boolean;
};

export type SocketMiddleware<TReq = unknown, TRes = unknown> = (
  req: TReq,
  context: SocketMiddlewareContext,
  next: (req: TReq) => Promise<TRes>,
) => Promise<TRes>;

/**
 * Composes socket middleware functions into a single pipeline executor (MAJ-025).
 */
export function composeSocketMiddleware<TReq, TRes>(
  ...middlewares: SocketMiddleware<TReq, TRes>[]
): (
  handler: (req: TReq, context: SocketMiddlewareContext) => Promise<TRes>,
) => (req: TReq, context: SocketMiddlewareContext) => Promise<TRes> {
  return (handler) => {
    return (initialReq, context) => {
      let index = -1;
      const dispatch = async (i: number, currentReq: TReq): Promise<TRes> => {
        if (i <= index) throw new Error("next() called multiple times");
        index = i;
        if (i === middlewares.length) {
          return handler(currentReq, context);
        }
        const fn = middlewares[i];
        return fn(currentReq, context, (nextReq) => dispatch(i + 1, nextReq));
      };
      return dispatch(0, initialReq);
    };
  };
}
```

#### Individual Focused Middleware Units (CC < 8 each):
1. **`withLogging(logger)`:** Logs entry, measures duration, logs completion/failure with `serializeError`.
2. **`withRateLimit(rateLimiter)`:** Checks client IP rate limiter and rejects with 429 when throttled.
3. **`withValidation(schema)`:** Parses request against Zod schema and throws `InvalidPayloadError` (400) on validation failure.
4. **`withErrorMapping`:** Catches domain exceptions and maps them to standard `{ success: false, error: ... }` ack responses.

---

## 9. Verification & Compliance Checklist for Builders

Before reporting handoff, each domain builder MUST verify compliance with these frozen conventions:

- [ ] **Zero unabstracted timers:** No `setTimeout` / `setInterval` in business services or composables (must use `ITimerService` or `IClock`).
- [ ] **Zero `Date.now()` fallbacks in pure domain logic:** Mandatory `now: number` parameter supplied by callers (MAJ-016).
- [ ] **Zero empty catch blocks:** All caught errors are logged or rethrown (CRIT-002, CRIT-003, MIN-003, MIN-004, MIN-006).
- [ ] **Zero direct `process.env` in domain classes:** Injected via constructor from composition root (MAJ-005).
- [ ] **Zero inline error ternary duplication:** All logging sites use `serializeError(err)` (MAJ-028).
- [ ] **Zero deep module imports:** Cross-feature imports consume `index.ts` barrels only (MAJ-019).
- [ ] **Server bootstrap files decomposed:** `apps/server/src/index.ts` delegates to `bootstrap/` modules (MAJ-027).
- [ ] **HTTP API endpoints aligned:** `/api/v1/lan-info` returns `{ data: LanInfoResponse }`, legacy redirect configured (MAJ-009, MIN-010).
- [ ] **Mid-game actions accept `sessionToken`:** Verification and auto-healing in `GameService` (MAJ-007).
- [ ] **`room:reconnected` emitted and parsed:** Restores pending draw and rematch state upon reconnect (MAJ-003).
