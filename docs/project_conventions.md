# Project Conventions & Architectural Standards: Fun Chess Audit Remediation

> **Status: FROZEN ARCHITECTURAL CONVENTIONS**
> **Phase: DESIGN (Remediation)**
> **Author: System Architect (@architect)**
> **Audience: All Builders (@backend-engineer, @frontend-engineer, @tech-lead, @test-automation-engineer)**
> **Scope: Project-wide Conventions & Standardization (MAJ-011, MAJ-012, MAJ-015, MAJ-017, MAJ-018, MAJ-022, ENH-005, MIN-005)**
> **Compliance: Mandatory across all workspace packages (`@fun-chess/shared`, `apps/server`, `apps/client`, `apps/e2e`).**

---

## 1. Feature Directory Layout & Module Boundaries (`project-structure.md`)

### 1.1 Universal Architecture Philosophy: Context → Feature → Layer
Fun Chess organizes code **by vertical business feature slices**, never by technical layer at the module root.
- **Top Level:** Monorepo apps (`apps/server`, `apps/client`, `apps/e2e`) and shared library (`shared/`).
- **Feature Level:** Each business capability is isolated in its own feature directory (e.g., `rooms/`, `game/`, `lan/` in server; `multiplayer/`, `puzzles/`, `scenarios/`, `ai/`, `pwa/` in client).
- **Layer Level:** Storage, domain services, socket gateways, and UI components reside within their respective feature folder.

### 1.2 Public API Barrel Export & Strict Boundary Enforcement (MIN-005)
1. **The Rule:** Every feature directory MUST expose a single entry point `index.ts`. Only symbols exported from `index.ts` form the public API of that feature.
2. **Private Internal Files:** Files such as `room.service.ts`, `room.socket_handler.ts`, `in_memory_room.store.ts` are strictly private to the feature module.
3. **Cross-Feature Imports:** Other features and integration test suites MUST import exclusively from the feature barrel:
   - **Correct:** `import { RoomService, InMemoryRoomStore } from "../features/rooms/index.js";`
   - **Prohibited:** `import { RoomService } from "../features/rooms/room.service.js";` (Violates module boundary)
4. **No Circular Feature Coupling (MAJ-009):** If feature A requires feature B, and feature B requires feature A, extract the shared contract to `@fun-chess/shared` or create an explicit domain adapter interface (e.g. `IRoomGameAdapter`).

### 1.3 Canonical Server Feature Skeleton (`apps/server/src/features/{feature}/`)
```
apps/server/src/features/rooms/
├── index.ts                     # Public API barrel export ONLY
├── room.interface.ts            # Domain interfaces, options, and error contracts
├── room.service.ts              # Pure business logic orchestrator
├── room.logic.ts                # Referentially transparent calculation rules
├── room.socket_handler.ts       # Socket.IO ingress controller (thin adapter)
├── room.store.ts                # Storage abstraction contract & constants (MAX_ROOMS)
├── in_memory_room.store.ts      # In-memory production storage implementation
├── mock_room.store.ts           # Test double storage implementation
├── session_registry.ts          # Session storage abstraction contract
├── in_memory_session_registry.ts# Session storage implementation
├── disconnect_timer_registry.ts # Timer grace period manager
└── __tests__/                   # Co-located unit and contract test suites
    ├── room.service.spec.ts
    ├── room.socket_handler.spec.ts
    ├── in_memory_room.store.spec.ts
    ├── mock_room.store.spec.ts
    ├── in_memory_session_registry.spec.ts
    └── disconnect_timer_registry.spec.ts
```

### 1.4 Canonical Client Feature Skeleton (`apps/client/src/features/{feature}/`)
```
apps/client/src/features/multiplayer/
├── index.ts                     # Public API barrel export ONLY
├── components/                  # Feature UI components (Vue SFCs)
│   ├── MultiplayerLobby.vue
│   └── RoomCard.vue
├── composables/                 # Single-purpose composables (CC < 10, lines 10–50)
│   ├── useRoomSession.ts        # Session lifecycle and auto-reconnection
│   ├── useGameActions.ts        # In-game actions (moves, draw, resign)
│   ├── useSocketTransport.ts    # Transport-level socket emitter and listener
│   └── room_session_state.ts    # Reactive state container
├── engine/                      # Pure calculation engines (zero I/O, zero loggers)
└── __tests__/                   # Co-located unit test suites
    ├── useRoomSession.spec.ts
    ├── useGameActions.spec.ts
    └── useSocketTransport.spec.ts
```

---

## 2. Error Handling & Serialization Pattern (MAJ-022)

### 2.1 Problem & Mandate
Previously, a 3-line error serialization snippet:
`error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { raw: err }`
was duplicated verbatim across 33 distinct files.

All error serialization, normalization, and logging across the entire codebase MUST use the canonical utility functions exported from `@fun-chess/shared/utils`:
1. `serializeError(err: unknown): SerializedError`
2. `toErrorMessage(err: unknown, fallback?: string): string`

### 2.2 Canonical Type Definitions & Implementations (`shared/src/utils/error_utils.ts`)
```typescript
export interface SerializedError {
  name?: string;
  message: string;
  stack?: string;
  code?: string | number;
  raw?: unknown;
}

/**
 * Standardizes an unknown error into a structured object suitable for JSON serialization and logging.
 * Replaces duplicated 3-line pattern across 33 files per MAJ-022.
 */
export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    const serialized: SerializedError = {
      name: err.name,
      message: err.message,
    };
    if (err.stack) {
      serialized.stack = err.stack;
    }
    if ("code" in err && (typeof err.code === "string" || typeof err.code === "number")) {
      serialized.code = err.code;
    }
    return serialized;
  }

  if (typeof err === "string") {
    return {
      message: err,
      raw: err,
    };
  }

  if (typeof err === "object" && err !== null) {
    const candidate = err as Record<string, unknown>;
    const message =
      typeof candidate.message === "string"
        ? candidate.message
        : typeof candidate.error === "string"
          ? candidate.error
          : JSON.stringify(err);
    return {
      message,
      raw: err,
    };
  }

  return {
    message: String(err),
    raw: err,
  };
}

/**
 * Extracts a human-readable error message string from an unknown error instance.
 */
export function toErrorMessage(
  err: unknown,
  fallback = "An unexpected error occurred",
): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "string" && err.trim().length > 0) {
    return err.trim();
  }
  if (typeof err === "object" && err !== null) {
    const candidate = err as Record<string, unknown>;
    if (typeof candidate.message === "string" && candidate.message.trim().length > 0) {
      return candidate.message.trim();
    }
  }
  return fallback;
}
```

### 2.3 Usage Conventions
- **In Structured Logging:**
  ```typescript
  import { serializeError } from "@fun-chess/shared";

  logger.error("Database operation failed", {
    operation: "room_save",
    correlationId,
    roomCode,
    duration,
    error: serializeError(err),
  });
  ```
- **In Client UI Notifications:**
  ```typescript
  import { toErrorMessage } from "@fun-chess/shared";

  notificationStore.showError(toErrorMessage(err, "Failed to connect to game room"));
  ```

---

## 3. Clock & Time Abstraction Pattern (MAJ-012, ENH-005)

### 3.1 I/O Isolation Principle for Time
In accordance with `architectural-pattern.md` (Rule 1: I/O Isolation), business logic, rate limiters, timeout checkers, and expiration registries MUST NOT call `Date.now()`, `new Date()`, or global `setTimeout` directly. Time must be injected via the `IClock` abstraction to enable 100% deterministic testing without sleep delays.

### 3.2 Canonical Interface & Implementations
Located in `@fun-chess/shared`:
```typescript
/**
 * Time abstraction interface for isolating system clock I/O.
 */
export interface IClock {
  /** Returns current milliseconds since Unix epoch */
  now(): number;
}
```

Exported implementations in `@fun-chess/shared/utils/system_clock.ts`:
```typescript
/**
 * Production system clock using Date.now().
 */
export class SystemClock implements IClock {
  public now(): number {
    return Date.now();
  }
}

export const systemClock = new SystemClock();

/**
 * Deterministic test clock for unit and integration testing.
 */
export class MockClock implements IClock {
  constructor(private currentTime = 0) {}

  public now(): number {
    return this.currentTime;
  }

  public advance(ms: number): void {
    this.currentTime += ms;
  }

  public setTime(ms: number): void {
    this.currentTime = ms;
  }
}
```

### 3.3 Injection Conventions
1. **Server Services & Stores (`RoomService`, `InMemoryRoomStore`, `InMemorySessionRegistry`):**
   - Inject via constructor parameter: `clock: IClock = systemClock`.
   - Never call `Date.now()`. Use `this.clock.now()`.
2. **Rate Limiters (`HttpRateLimiter`, `SocketRateLimiter`, `SlidingWindowRateLimiter`):**
   - Accept `clock?: IClock` in options: `this.clock = options?.clock ?? systemClock`.
3. **Client Composables (`usePuzzleRush`, `usePwaInstall`):**
   - Accept optional parameter or resolve from Vue DI via `CLOCK_KEY`:
     ```typescript
     const clock = injectedClock ?? (getCurrentInstance() ? inject(CLOCK_KEY, systemClock) : systemClock);
     ```

---

## 4. Network Status Abstraction Pattern (MAJ-011)

### 4.1 Strict Prohibition of Browser Monkey-Patching
- **Anti-Pattern Remediated:** `useNetworkStatus.ts` previously mutated `Object.defineProperty(navigator, 'onLine', ...)` and dispatched synthetic events to `window`. This contaminated global test runner environments and created unpredictable behavior.
- **Architectural Mandate:** Abstract network connectivity detection behind `INetworkMonitor`. Zero direct mutation of `window` or `navigator` in production or test code.

### 4.2 Canonical Interface & Implementations (`apps/client/src/platform/network/`)
```typescript
export interface INetworkMonitor {
  /** Current reactive connectivity status */
  readonly isOnline: boolean;
  /** Registers a listener callback invoked when network status transitions */
  addListener(callback: (isOnline: boolean) => void): () => void;
  /** Actively probes connectivity against an endpoint */
  checkConnectivity(probeUrl?: string): Promise<boolean>;
  /** Tears down event listeners */
  destroy(): void;
}
```

1. **`BrowserNetworkMonitor` (Production Implementation):**
   - Reads `navigator.onLine` safely (with fallback to `true` if undefined).
   - Binds `window.addEventListener('online', ...)` and `window.addEventListener('offline', ...)`.
   - Returns an unsubscribe function from `addListener`.
2. **`MockNetworkMonitor` (Test Implementation):**
   - Backed by an internal `_isOnline: boolean` (default `true`).
   - Exposes `setOnline(status: boolean): void` which triggers registered listeners synchronously.
   - Zero interactions with browser global objects.

### 4.3 Composable Consumption Contract
```typescript
export function useNetworkStatus(
  customMonitor?: INetworkMonitor,
  apiClient?: IApiClient,
  logger?: ILogger,
) {
  const monitor = customMonitor ?? useInjectNetworkMonitor();
  const isOnline = ref(monitor.isOnline);

  const unsubscribe = monitor.addListener((online) => {
    isOnline.value = online;
  });

  onScopeDispose(() => {
    unsubscribe();
  });

  return {
    isOnline: computed(() => isOnline.value),
    isOffline: computed(() => !isOnline.value),
    // ...
  };
}
```

---

## 5. Vue Dependency Injection Tokens & Wiring (MAJ-015)

### 5.1 Problem Statement & Architectural Rule
Stateful singletons exported at module scope (e.g., singleton `socket`, `networkStatus`, `localStorageProgressStore`) cause state leakage across test cases and prevent hosting multiple isolated client instances.
In accordance with Rule 3 (Dependency Direction), infrastructure services must be wired at the application composition root (`createFunChessApp` in `apps/client/src/main.ts`) and injected via Vue Dependency Injection.

### 5.2 Authoritative DI Tokens (`apps/client/src/platform/di/tokens.ts`)
```typescript
import type { InjectionKey } from 'vue';
import type { Socket } from 'socket.io-client';
import type { INetworkMonitor } from '../network/network_monitor.interface';
import type { IClock } from '@fun-chess/shared';

// Core Ingress & Transport Tokens (MAJ-011, MAJ-015)
export const SOCKET_CLIENT_KEY: InjectionKey<Socket> = Symbol('SOCKET_CLIENT');
export const NETWORK_MONITOR_KEY: InjectionKey<INetworkMonitor> = Symbol('NETWORK_MONITOR');
export const CLOCK_KEY: InjectionKey<IClock> = Symbol('CLOCK');
```

### 5.3 Injection Resolvers (`apps/client/src/platform/di/resolvers.ts`)
```typescript
export function useInjectSocketClient(fallback?: Socket): Socket {
  if (hasInjectionContext()) {
    const injected = inject(SOCKET_CLIENT_KEY, fallback);
    if (injected) return injected;
  }
  if (fallback) return fallback;
  throw new Error("Socket client requested outside injection context without fallback.");
}

export function useInjectNetworkMonitor(fallback?: INetworkMonitor): INetworkMonitor {
  if (hasInjectionContext()) {
    const injected = inject(NETWORK_MONITOR_KEY, fallback);
    if (injected) return injected;
  }
  return fallback ?? defaultBrowserNetworkMonitor;
}
```

### 5.4 Composition Root Wiring (`apps/client/src/main.ts`)
```typescript
export function createFunChessApp(options?: AppBootstrapOptions) {
  const app = createApp(App);

  const socket = options?.socket ?? defaultSocketInstance;
  const networkMonitor = options?.networkMonitor ?? new BrowserNetworkMonitor();
  const clock = options?.clock ?? new SystemClock();

  app.provide(SOCKET_CLIENT_KEY, socket);
  app.provide(NETWORK_MONITOR_KEY, networkMonitor);
  app.provide(CLOCK_KEY, clock);
  // ...
  return app;
}
```

---

## 6. Distributed Tracing & CorrelationId Propagation Pattern (MAJ-017, MAJ-018)

### 6.1 End-to-End Tracing Mandate
Every external request entering the system (HTTP request or WebSocket event) is assigned a `correlationId`. This `correlationId` MUST be propagated across all layer boundaries:
```
Client Request (HTTP Header / Socket Payload)
       │
       ▼
Platform Gateway Middleware (withCorrelation)
  [Extracts or generates correlationId]
       │
       ▼
Feature Socket Controller (room.socket_handler.ts / game.socket_handler.ts)
  [Extracts context.correlationId from middleware wrapper]
       │
       ▼
Domain Service (RoomService / GameService)
  [Receives correlationId as parameter; binds to all logs and storage operations]
```

### 6.2 Forwarding Contract from Socket Handlers to Domain Services
1. **Controller Handler Wrapper:**
   The socket handler receives `SocketHandlerContext` containing `correlationId`:
   ```typescript
   const handleCreate = createRoomHandler<CreateRoomRequest, CreateRoomResponse>(
     logger,
     "room:create",
     socket,
     options,
     async (req, context) => {
       // context.correlationId MUST be passed to roomService
       const result = await roomService.createRoom(req, socket.id, context.correlationId);
       return result;
     }
   );
   ```
2. **Domain Service Method Signatures:**
   All domain methods in `IRoomService` and `IGameService` MUST accept an optional `correlationId?: string`:
   ```typescript
   export interface IRoomService {
     createRoom(req: CreateRoomRequest, socketId: string, correlationId?: string): Promise<CreateRoomResult>;
     joinRoom(req: JoinRoomRequest, socketId: string, correlationId?: string): Promise<JoinRoomResult>;
     reconnect(req: ReconnectRequest, socketId: string, correlationId?: string): Promise<ReconnectResult>;
     leaveRoom(req: LeaveRoomRequest, socketId: string, correlationId?: string): Promise<LeaveRoomResult>;
   }

   export interface IGameService {
     makeMove(roomCode: string, playerId: string, move: MovePayload, correlationId?: string): Promise<MakeMoveResult>;
     resign(roomCode: string, playerId: string, correlationId?: string): Promise<ResignResult>;
     offerDraw(roomCode: string, playerId: string, correlationId?: string): Promise<DrawResult>;
     respondDraw(roomCode: string, playerId: string, accept: boolean, correlationId?: string): Promise<DrawResult>;
   }
   ```

### 6.3 Mandatory 3-Point Lifecycle Logging Mandate (MAJ-018)
Every domain and operational entry point MUST log exactly three lifecycle events:
1. **Operation Start (Entry Point):**
   - Log Level: `info` (or `debug` for high-frequency move calculations)
   - Mandatory Fields: `operation`, `correlationId`, plus relevant entity identifiers (`roomCode`, `playerId`).
2. **Operation Success (Exit Point):**
   - Log Level: `info`
   - Mandatory Fields: `operation`, `correlationId`, `duration` (integer ms), `durationMs` (integer ms), `status: "success"`.
3. **Operation Failure (Catch Block):**
   - Log Level: `error`
   - Mandatory Fields: `operation`, `correlationId`, `duration` (integer ms), `durationMs` (integer ms), `error: serializeError(err)`.

### 6.4 Abandonment Forfeiture Remediation Specification (MAJ-018)
- **Defect Remediated:** Disconnect grace period forfeiture in `room.socket_handler.ts:395-433` lacked an entry start log, omitted `duration`, and used conflicting operation names (`game_abandoned` on success vs `disconnect_grace_period_abandonment` on error).
- **Unified Operation Name:** `"game_abandoned"`.
- **Authoritative Implementation:**
  ```typescript
  const onForfeit = async (
    room: RoomState,
    gameOverPayload: GameOverPayload,
    jobCorrelationId?: string,
    forfeitedPlayerId?: string,
  ): Promise<void> => {
    const activeCorrelationId = jobCorrelationId ?? randomUUID();
    const startTime = performance.now();
    const disconnectedPlayerId =
      forfeitedPlayerId ??
      (gameOverPayload.winner === "w"
        ? room.blackPlayer?.id
        : gameOverPayload.winner === "b"
          ? room.whitePlayer?.id
          : undefined);

    // Point 1: Operation Start
    logger.info("Processing game abandonment forfeit", {
      operation: "game_abandoned",
      correlationId: activeCorrelationId,
      roomCode: room.roomCode,
      disconnectedPlayerId,
      winnerColor: gameOverPayload.winner,
    });

    try {
      io.to(room.roomCode).emit("game:over", gameOverPayload);
      const duration = Math.round(performance.now() - startTime);

      // Point 2: Operation Success
      logger.info("Game forfeited by abandonment", {
        operation: "game_abandoned",
        correlationId: activeCorrelationId,
        roomCode: room.roomCode,
        disconnectedPlayerId,
        winnerColor: gameOverPayload.winner,
        duration,
        durationMs: duration,
        status: "success",
      });
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);

      // Point 3: Operation Failure
      logger.error("Failed to process disconnect grace period abandonment", {
        operation: "game_abandoned",
        correlationId: activeCorrelationId,
        roomCode: room.roomCode,
        disconnectedPlayerId,
        duration,
        durationMs: duration,
        error: serializeError(err),
      });
      throw err;
    }
  };
  ```

---

## 7. Quality Gate Checklist for Implementers

Before submitting any code changes for verification, builders MUST verify:
- [ ] No direct calls to `Date.now()`, `new Date()`, or `Math.random()` in pure logic or controllers without injected `IClock` or `randomFn`.
- [ ] No calls to `serializeError` were hand-rolled with ternary chains; all 33 instances migrated to `@fun-chess/shared`.
- [ ] No monkey-patching of `navigator.onLine` or `window` in client code.
- [ ] `correlationId` passed from socket middleware through socket handler into domain services.
- [ ] Every operation emits consistent 3-point lifecycle logs with `duration` and matching `operation` identifier.
- [ ] Cross-module imports target feature `index.ts` exclusively.
- [ ] `pnpm run lint` reports 0 errors and 0 warnings.
- [ ] `pnpm run test:coverage` in `apps/server` meets or exceeds the mandatory 85.00% branch threshold.
