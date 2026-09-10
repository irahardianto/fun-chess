# Project Conventions & Architectural Standards

> **Status:** FROZEN ARCHITECTURAL CONTRACT
> **Phase:** DESIGN Phase (Tier 3 Remediation)
> **Author:** System Architect (`@architect`)
> **Authority:** Binding on all domain implementers (`@tech-lead`, `@backend-engineer`, `@frontend-engineer`, `@reviewer`). Deviations strictly prohibited without an ADR.
> **Scope Cards Addressed:** SC-1 through SC-10
> **Audit Findings Addressed:** CRIT-002, CRIT-003, MAJ-004, MAJ-005, MAJ-006, MAJ-008, MAJ-009, MAJ-010, MAJ-011, MAJ-012, MAJ-014, MAJ-016, MAJ-017, MAJ-018, MAJ-019, MAJ-020, MIN-004, MIN-005, MIN-007, MIN-008, MIN-010, MIN-011, MIN-013, MIN-014, MIN-016, MIN-018, MIN-019, MIN-020, ENH-003, ENH-004, ENH-006, ENH-007, ENH-008

---

## 1. Monorepo Architecture & Feature Directory Layout (`project-structure.md`)

### 1.1 Architectural Philosophy: Context → Feature → Layer
Fun Chess organizes code strictly **by vertical business feature slices**, never by horizontal technical layers at the package root.

- **Level 1 (Repository Context):** Distinct deployable applications (`apps/server`, `apps/client`, `apps/e2e`), common libraries (`shared/`), and infrastructure (`infra/terraform/`).
- **Level 2 (Feature Vertical Slices):** Each business domain is self-contained within its feature directory (e.g., `rooms/`, `game/`, `lan/` in server; `multiplayer/`, `puzzles/`, `scenarios/`, `ai/`, `lobby/`, `pwa/` in client).
- **Level 3 (Internal Feature Layers):** Domain models, storage interfaces, state stores, controllers/handlers, pure calculation engines, and UI components reside directly inside their respective feature folder.

### 1.2 Module Boundaries & Public API Barrel Export Enforcement (MAJ-019)
1. **Single Public Entry Point:** Every feature directory MUST expose an `index.ts` barrel file. Only symbols exported from `index.ts` form the public API of that feature.
2. **Private Encapsulation:** Internal implementation files (`*.service.ts`, `*.store.ts`, `*.coordinator.ts`, `*.socket_handler.ts`, private composables) are strictly private to the feature.
3. **Cross-Feature Imports:** Other features, platform layers, and test suites MUST import exclusively from the feature barrel:
   - **Correct:** `import { RoomService, InMemoryRoomStore } from "../features/rooms/index.js";`
   - **Prohibited:** `import { RoomService } from "../features/rooms/room.service.js";` (Violates MAJ-019)
4. **Acyclic Dependency Invariant:** Dependencies point inward toward business logic. If feature A requires feature B, and feature B requires feature A, extract the shared contract to `@fun-chess/shared` or inject an interface contract at the composition root.

### 1.3 Complete Reference Skeleton: Decomposed Server Feature (`apps/server/src/features/rooms/`)
```
apps/server/src/features/rooms/
├── index.ts                      # Public API barrel export ONLY
├── room.interface.ts             # Domain interfaces, options, and error contracts
├── room.service.ts               # Core orchestrator (< 400 lines, delegates to coordinators)
├── room_code_generator.ts        # Extracted pure room code generator (entropy & collision retry)
├── rematch_coordinator.ts        # Extracted rematch negotiation coordinator
├── draw_coordinator.ts           # Extracted draw negotiation coordinator
├── room.logic.ts                 # Pure state transition functions (zero I/O, mandatory `now: number`)
├── room.socket_handler.ts        # Socket.IO ingress controller (thin pipeline adapter)
├── room.store.ts                 # Storage abstraction contract & constants (MAX_ROOMS)
├── in_memory_room.store.ts       # In-memory production storage implementation
├── mock_room.store.ts            # Test double storage implementation
├── session_registry.ts           # Session storage abstraction contract
├── in_memory_session_registry.ts # Session storage implementation (injected secret & isProduction)
├── disconnect_timer_registry.ts  # Disconnect grace period manager
└── __tests__/                    # Co-located unit and contract test suites
    ├── room.service.spec.ts
    ├── room_code_generator.spec.ts
    ├── rematch_coordinator.spec.ts
    ├── draw_coordinator.spec.ts
    ├── room.logic.spec.ts
    ├── room.socket_handler.spec.ts
    ├── in_memory_room.store.spec.ts
    └── disconnect_timer_registry.spec.ts
```

### 1.4 Complete Reference Skeleton: Decomposed Client Multiplayer Feature (`apps/client/src/features/multiplayer/`)
```
apps/client/src/features/multiplayer/
├── index.ts                      # Public API barrel export ONLY
├── components/                   # Feature UI components (Vue SFCs)
│   ├── MultiplayerArena.vue
│   └── RoomLobby.vue
├── composables/                  # Single-purpose composables (CC < 10, lines 10–60)
│   ├── useMultiplayer.ts         # Facade composable exposing high-level arena API
│   ├── useRoomSession.ts         # Session lifecycle & reconnect state
│   ├── useGameActions.ts         # Player action dispatch (moves, resign, draw, rematch)
│   ├── useSocketTransport.ts     # Facade transport composable (< 200 lines)
│   ├── socket_connection_manager.ts # Extracted socket lifecycle & heartbeat latency manager
│   └── socket_request_client.ts     # Extracted typed request/response emitter with timeout
└── __tests__/                    # Co-located unit test suites
    ├── useMultiplayer.spec.ts
    ├── useRoomSession.spec.ts
    ├── useGameActions.spec.ts
    ├── socket_connection_manager.spec.ts
    └── socket_request_client.spec.ts
```

### 1.5 Complete Reference Skeleton: Client Puzzles Feature (`apps/client/src/features/puzzles/`)
```
apps/client/src/features/puzzles/
├── index.ts                      # Public API barrel export ONLY
├── components/                   # Feature UI components (Vue SFCs)
│   ├── PuzzleArena.vue
│   ├── PuzzleHubView.vue
│   └── completion/               # Extracted sub-components (< 100 lines each)
│       ├── PuzzleCelebrationHeader.vue
│       ├── PuzzleCoachBreakdown.vue
│       └── PuzzleDockedBar.vue
├── store/                        # Pinia State Management
│   ├── puzzle_progress.store.ts  # Pinia Setup Store (defineStore with createDefaultPuzzleProgress)
│   └── puzzle_progress.store.spec.ts # Dedicated Pinia store unit tests
├── composables/                  # Feature composables consuming Pinia store & pure engine
│   ├── usePuzzleProgress.ts      # Composable adapter over puzzle progress Pinia store
│   ├── usePuzzleRunner.ts        # Puzzle execution coordinator
│   └── usePuzzleRushTimer.ts     # Timer coordinator using shared ITimerService
├── engine/                       # Pure mathematical chess calculation engines (ZERO I/O, ZERO logger)
│   ├── puzzle_validator.ts       # Pure puzzle move validator (returns structured ValidationOutcome)
│   ├── puzzle_analysis_engine.ts # Pure chess analysis & mistake classifier (returns AnalysisOutcome)
│   ├── material_delta.ts         # Pure material evaluator
│   └── theme_detector.ts         # Pure motif detector
└── __tests__/                    # Co-located unit test suites
    ├── usePuzzleProgress.spec.ts
    ├── puzzle_validator.spec.ts
    └── puzzle_analysis_engine.spec.ts
```

---

## 2. File Naming & Code Idiom Conventions

### 2.1 File Postfixes & Architectural Responsibility Table
Every TypeScript source file in the monorepo MUST adhere strictly to this naming taxonomy:

| File Postfix | Purpose / Responsibility | Permitted Dependencies | Prohibited Content |
|---|---|---|---|
| `*.interface.ts` | TypeScript types, interfaces, options, and error contracts | None or `@fun-chess/shared` | Implementations, side effects, I/O |
| `*.service.ts` | Domain orchestration & workflow logic | Injected interfaces, pure logic, `executeServiceOperation` | Native timers, global `process.env`, DB drivers |
| `*.logic.ts` | Pure calculation functions, state transforms | Domain types | Native timers, `Date.now()`, I/O, logging |
| `*.store.ts` | Storage abstraction contract (server) or Pinia store (client) | Injected interfaces, Pinia | Un-isolated global singletons |
| `in_memory_*.store.ts` | In-memory production storage implementation | `*.store.ts`, `IClock`, `Logger` | Un-isolated global variables |
| `mock_*.store.ts` | In-memory test double for unit testing | `*.store.ts` | Real I/O, network sockets |
| `*.coordinator.ts` | Focused sub-domain orchestrator extracted from monolith | Injected interfaces, pure logic | Outer framework coupling, direct DB access |
| `*.generator.ts` | Pure or entropy-based token/code generator | `IIdGenerator`, `IClock` | Inline business workflows |
| `*.pipeline.ts` | Middleware pipeline composition | Middleware stages, context types | Monolithic bloated handlers |
| `*.sanitizer.ts` | Pure data masking and credential redaction | Domain types | Network I/O, logging |
| `*.socket_handler.ts` | Socket.IO event ingress adapter | Feature service, socket pipeline | Direct database queries, business rules |
| `*.controller.ts` | HTTP endpoint ingress adapter | Feature service, HTTP helpers | Inline business logic, direct DB queries |
| `*.spec.ts` | Unit or contract test suite | Target unit, test doubles | Live network servers, real timeouts |
| `*.integration.spec.ts`| Live integration test against in-memory stack | Real HTTP/socket loopback | Heavy external cloud infrastructure |
| `*.e2e.test.ts` | Playwright browser E2E test | Playwright test fixtures | Private server internals |

---

## 3. Client State Management Conventions (Pinia Setup Stores)

### 3.1 Architectural Decision: Pinia Adoption (ADR-001)
Per finding **MAJ-018** and `docs/adr/ADR-001-pinia-state-management.md`, Pinia is formally adopted as the official client state management architecture for Fun Chess.
- Replaces fragmented patterns: OO repository classes, module-singleton reactive variables, and uncoordinated per-instance composable state.
- Registered globally at application bootstrap in `apps/client/src/main.ts`:
  ```typescript
  import { createPinia } from 'pinia';
  app.use(createPinia());
  ```

### 3.2 Pinia Setup Store Conventions (`defineStore`)
All Pinia stores MUST use the **Setup Store** syntax (`defineStore('id', () => { ... })`).

#### Invariants for Setup Stores:
1. **State:** Declared via `ref()` or `shallowRef()`.
2. **Getters:** Declared via `computed()`.
3. **Actions:** Declared as standard functions (synchronous or asynchronous).
4. **Deterministic Initial State Factory:** Stores MUST use an explicit factory function `createDefaultState(clock?: IClock)` to prevent `Date.now()` evaluation at module import time (remediating MIN-010).
5. **State Resetting:** Stores MUST expose an explicit `$reset()` or `resetState()` method to ensure clean teardown between tests.
6. **Lazy Hydration & Migration:** Storage migrations MUST NOT run at top-level module load time. They must be invoked lazily during store initialization or app bootstrap.

#### Standard Pinia Setup Store Pattern (`puzzle_progress.store.ts`):
```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  PuzzleProgress,
  AdaptiveRatingState,
  PuzzleAttemptResult,
  IClock,
} from '@fun-chess/shared';
import { SystemClock } from '@fun-chess/shared';
import { STORAGE_KEYS } from '@/platform/storage';

export const DEFAULT_ADAPTIVE_RATING: AdaptiveRatingState = {
  rating: 800,
  ratingDeviation: 350,
  peakRating: 800,
  totalAttempted: 0,
  totalSolved: 0,
  bestStreak: 0,
  ratingHistory: [],
};

/**
 * Factory creating deterministic initial puzzle progress state.
 * Accepts an optional IClock to guarantee test reproducibility (MIN-010).
 */
export function createDefaultPuzzleProgress(clock: IClock = new SystemClock()): PuzzleProgress {
  const timestamp = clock.now();
  return {
    ratingProfile: { ...DEFAULT_ADAPTIVE_RATING },
    themeMastery: {},
    arcadeStats: {
      puzzleRushHighScore: 0,
      puzzleRushBestStreak: 0,
      streakSurvivorHighScore: 0,
      totalRushRuns: 0,
    },
    solvedPuzzles: {},
    createdAt: timestamp,
    lastActiveAt: timestamp,
  };
}

export const usePuzzleProgressStore = defineStore('puzzleProgress', () => {
  const progress = ref<PuzzleProgress>(createDefaultPuzzleProgress());
  const isLoaded = ref<boolean>(false);
  const isSaving = ref<boolean>(false);

  // Getters
  const currentRating = computed(() => progress.value.ratingProfile.rating);
  const totalSolved = computed(() => Object.keys(progress.value.solvedPuzzles).length);
  const rushHighScore = computed(() => progress.value.arcadeStats.puzzleRushHighScore);

  // Actions
  function setProgress(newProgress: PuzzleProgress): void {
    progress.value = newProgress;
    isLoaded.value = true;
  }

  function recordAttempt(result: PuzzleAttemptResult, clock: IClock = new SystemClock()): void {
    progress.value.lastActiveAt = clock.now();
    // Pure progress transformation logic...
  }

  function resetState(clock: IClock = new SystemClock()): void {
    progress.value = createDefaultPuzzleProgress(clock);
    isLoaded.value = false;
  }

  return {
    progress,
    isLoaded,
    isSaving,
    currentRating,
    totalSolved,
    rushHighScore,
    setProgress,
    recordAttempt,
    resetState,
    $reset: resetState,
  };
});
```

### 3.3 Composable Integration Pattern
Composables act as lightweight UI facades and controllers. They consume Pinia stores for reactive state, and consume platform services via dependency injection:

```typescript
// apps/client/src/features/puzzles/composables/usePuzzleProgress.ts
import { computed } from 'vue';
import { usePuzzleProgressStore } from '../store/puzzle_progress.store';
import { useInjectTimerService } from '@/platform/di';

export function usePuzzleProgress() {
  const store = usePuzzleProgressStore();
  const timerService = useInjectTimerService();

  return {
    progress: computed(() => store.progress),
    isLoaded: computed(() => store.isLoaded),
    currentRating: store.currentRating,
    totalSolved: store.totalSolved,
    recordAttempt: store.recordAttempt,
    resetState: store.resetState,
  };
}
```

### 3.4 Dependency Injection for Platform Capabilities
State management is decoupled from hardware and browser I/O using Vue `provide` / `inject` with strongly typed `InjectionKey` tokens.

#### Tokens (`apps/client/src/platform/di/tokens.ts`):
```typescript
import type { InjectionKey } from 'vue';
import type { ITimerService, IClock } from '@fun-chess/shared';
import type { ILocationProvider } from '../browser/location_provider.interface';
import type { INetworkMonitor } from '../hardware/network_monitor.interface';
import type { TypedSocket } from '../socket/socket_client';

export const LOCATION_PROVIDER_KEY: InjectionKey<ILocationProvider> = Symbol('LOCATION_PROVIDER');
export const NETWORK_MONITOR_KEY: InjectionKey<INetworkMonitor> = Symbol('NETWORK_MONITOR');
export const TIMER_SERVICE_KEY: InjectionKey<ITimerService> = Symbol('TIMER_SERVICE');
export const SOCKET_CLIENT_KEY: InjectionKey<TypedSocket> = Symbol('SOCKET_CLIENT');
export const CLOCK_KEY: InjectionKey<IClock> = Symbol('CLOCK');
```

#### Mandatory Provision at Composition Root (`apps/client/src/main.ts`):
Under finding **MAJ-011**, `createFunChessApp()` MUST register production platform adapters for every token:
```typescript
app.provide(LOCATION_PROVIDER_KEY, new BrowserLocationProvider());
app.provide(NETWORK_MONITOR_KEY, new BrowserNetworkMonitor());
app.provide(TIMER_SERVICE_KEY, new BrowserTimerService());
app.provide(CLOCK_KEY, new SystemClock());
```

### 3.5 Zero Module-Level Mutable Singletons & Elimination of Test Backdoors
1. **Strict Prohibition:** Module-level mutable variables (`let customLogger`, `let currentSocket`, `let defaultStore`) are banned across the entire codebase.
2. **Elimination of Test Backdoors:**
   - **`setPwaInstallStorage`** in `usePwaInstall.ts` → Removed. Pass storage via DI or composable parameters.
   - **`setGameActionsLogger`** in `useGameActions.ts` → Removed. Inject logger via `useInjectLogger()`.
   - **`setSocketTransportLogger`** in `useSocketTransport.ts` → Removed. Inject logger via `useInjectLogger()`.
3. **Testing Doubles Pattern:**
   In unit tests, isolate state by instantiating fresh Pinia instances and injecting test doubles:
   ```typescript
   import { setActivePinia, createPinia } from 'pinia';
   import { MockTimerService, MockClock } from '@fun-chess/shared/testing';

   beforeEach(() => {
     setActivePinia(createPinia());
   });

   test('increments score using mock timer and store', () => {
     const mockTimer = new MockTimerService();
     const store = usePuzzleProgressStore();
     // Test execution with zero global singleton contamination
   });
   ```

---

## 4. Server Service Pattern: Unified `executeServiceOperation` Helper

### 4.1 Motivation & Rationale (MAJ-012, `logging-and-observability-mandate.md`)
Across `RoomService` and `GameService`, identical 20-line try/catch logging boilerplate was duplicated across 9 service methods. Furthermore, `GameService.makeMove` logged expected client domain errors (`GameNotActiveError`, `RoomInactiveError`, `UnauthorizedError`) at `ERROR` level, generating false-positive SRE alerts.

The `executeServiceOperation` helper standardizes:
1. **Structured 3-Point Observability:** Operation start (optional for mutators), completion with duration, and failure with duration.
2. **Semantic Log Level Demotion:** Expected domain rejections (`err instanceof AppError && err.statusCode < 500`) are logged at `WARN`, while unexpected server faults (`statusCode >= 500` or non-`AppError`) are logged at `ERROR`.
3. **Traceability:** Unbroken propagation of `correlationId`.
4. **DRY Compliance:** Eliminates 180+ lines of duplicated catch blocks.

### 4.2 Specification of `executeServiceOperation`
Located at `apps/server/src/platform/service/service_executor.ts`:

```typescript
import { serializeError, AppError, type IClock } from "@fun-chess/shared";
import type { Logger } from "../logger/logger.interface.js";

export interface ServiceOperationContext {
  /** Operation identifier in snake_case (e.g. "room_create", "game_move") */
  readonly operation: string;
  /** Injected logger instance */
  readonly logger: Logger;
  /** Injected system clock for precise duration measurement */
  readonly clock: IClock;
  /** UUID correlation tracing identifier */
  readonly correlationId?: string;
  /** Structured metadata contextual to the operation (e.g. roomCode, playerId) */
  readonly metadata?: Record<string, unknown>;
  /** Set to true for mutators requiring an operation start log (default: false) */
  readonly logStart?: boolean;
}

/**
 * Standardized service-layer operation executor.
 * Wraps domain logic with duration measurement, correlation tracing,
 * and semantic error demotion (4xx -> WARN, 500 -> ERROR).
 */
export async function executeServiceOperation<T>(
  context: ServiceOperationContext,
  action: () => Promise<T>,
): Promise<T> {
  const { operation, logger, clock, correlationId, metadata, logStart } = context;
  const startTime = clock.now();

  if (logStart) {
    logger.info(`Operation started: ${operation}`, {
      operation: `${operation}_started`,
      ...(correlationId ? { correlationId } : {}),
      ...(metadata ? metadata : {}),
    });
  }

  try {
    const result = await action();
    const duration = clock.now() - startTime;

    logger.info(`Operation completed: ${operation}`, {
      operation: `${operation}_success`,
      duration,
      durationMs: duration,
      ...(correlationId ? { correlationId } : {}),
      ...(metadata ? metadata : {}),
    });

    return result;
  } catch (err: unknown) {
    const duration = clock.now() - startTime;
    const isDomainRejection = err instanceof AppError && err.statusCode < 500;

    const logPayload = {
      operation: `${operation}_failed`,
      duration,
      durationMs: duration,
      error: serializeError(err),
      ...(correlationId ? { correlationId } : {}),
      ...(metadata ? metadata : {}),
      ...(err instanceof AppError
        ? { statusCode: err.statusCode, errorCode: err.code }
        : {}),
    };

    if (isDomainRejection) {
      logger.warn(`Operation rejected by domain policy: ${operation}`, logPayload);
    } else {
      logger.error(`Operation failed with internal error: ${operation}`, logPayload);
    }

    throw err;
  }
}
```

### 4.3 Concrete Implementation Example: `RoomService.createRoom`

#### Before (Boilerplate Duplication):
```typescript
try {
  // 30 lines of creation logic...
  const duration = this.clock.now() - startTime;
  this.logger.info("Room created", { ... });
  return result;
} catch (err) {
  const duration = this.clock.now() - startTime;
  const isClientError = err instanceof AppError && err.statusCode < 500;
  if (isClientError) {
    this.logger.warn("Room creation rejected", { ... });
  } else {
    this.logger.error("Room creation failed", { ... });
  }
  throw err;
}
```

#### After (Clean & Standardized):
```typescript
public async createRoom(
  req: CreateRoomRequest,
  socketId: string,
  correlationId?: string,
): Promise<{ room: RoomState; player: Player; sessionToken: string }> {
  return executeServiceOperation(
    {
      operation: "room_create",
      logger: this.logger,
      clock: this.clock,
      correlationId,
      logStart: true,
      metadata: { socketId },
    },
    async () => {
      // Pure workflow steps: validate, acquire lock, persist, return result
      return this.performCreateRoom(req, socketId, correlationId);
    },
  );
}
```

### 4.4 Concrete Implementation Example: `GameService.makeMove` (MAJ-012 Remediated)
```typescript
public async makeMove(
  params: MakeMoveParams,
  correlationId?: string,
): Promise<MakeMoveResult> {
  return executeServiceOperation(
    {
      operation: "game_move",
      logger: this.logger,
      clock: this.clock,
      correlationId,
      metadata: { roomCode: params.roomCode, playerId: params.playerId },
    },
    async () => {
      // Execute chess move under optimistic lock...
      // All AppError instances (InvalidMoveError, NotYourTurnError, GameNotActiveError)
      // are cleanly caught and logged at WARN level by executeServiceOperation!
      return this.performMakeMove(params, correlationId);
    },
  );
}
```

---

## 5. Monolith Decomposition Architectures (>1000 lines, MAJ-017)

### 5.1 Monolith 1: `apps/server/src/features/rooms/room.service.ts` (1,118 lines)

#### Problem
`room.service.ts` bundled five distinct responsibilities:
1. Room orchestration & persistence
2. Alphanumeric room code entropy & collision retry loops
3. Rematch negotiation lifecycle
4. Draw negotiation lifecycle
5. Disconnect grace periods & abandonment timers

#### Decomposition Architecture
```
              ┌───────────────────────────┐
              │        RoomService        │  (Orchestrator, ~350 lines)
              └─────────────┬─────────────┘
                            │
      ┌─────────────────────┼─────────────────────┐
      ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌─────────────────┐
│  Room Code   │    │   Rematch    │    │      Draw       │
│  Generator   │    │ Coordinator  │    │   Coordinator   │
│ (<100 lines) │    │ (<250 lines) │    │  (<250 lines)   │
└──────────────┘    └──────────────┘    └─────────────────┘
```

1. **`room_code_generator.ts`:**
   - **Responsibility:** Pure generation of 4-character uppercase alphanumeric room codes using `IIdGenerator` and recursive collision checking against `IRoomStore`.
   - **Interface:**
     ```typescript
     export interface IRoomCodeGenerator {
       generateAvailableCode(store: IRoomStore, maxAttempts?: number): Promise<string>;
     }
     ```
2. **`rematch_coordinator.ts`:**
   - **Responsibility:** Handles rematch requests, acceptances, rejections, board color swaps, and new game state initialization under room locks.
   - **Interface:**
     ```typescript
     export interface IRematchCoordinator {
       requestRematch(roomCode: string, playerId: string, correlationId?: string): Promise<RoomState>;
       acceptRematch(roomCode: string, playerId: string, correlationId?: string): Promise<{ room: RoomState; newGame: GameState }>;
       declineRematch(roomCode: string, playerId: string, correlationId?: string): Promise<RoomState>;
     }
     ```
3. **`draw_coordinator.ts`:**
   - **Responsibility:** Handles draw offers, acceptances, declines, auto-cancellation upon move submission, and timeout expiration.
   - **Interface:**
     ```typescript
     export interface IDrawCoordinator {
       offerDraw(roomCode: string, playerId: string, correlationId?: string): Promise<RoomState>;
       acceptDraw(roomCode: string, playerId: string, correlationId?: string): Promise<{ room: RoomState; gameOver: GameOverPayload }>;
       declineDraw(roomCode: string, playerId: string, correlationId?: string): Promise<RoomState>;
       cancelDrawOnMove(room: RoomState): RoomState;
     }
     ```

---

### 5.2 Monolith 2: `apps/server/src/platform/socket/socket_logging_middleware.ts` (1,044 lines)

#### Problem
Bundled payload sanitization, client IP parsing, rate limit checking, Zod schema validation, and middleware pipeline composition into a single massive file with cyclomatic complexity exceeding 30.

#### Decomposition Architecture
Decomposed into three cohesive, single-responsibility files in `apps/server/src/platform/socket/`:

```
┌────────────────────────────────────────────────────────┐
│                   socket_pipeline.ts                   │  (Pipeline composer & context)
│  composeSocketMiddleware, wrapSocketHandler            │
└───────────▲───────────────────────────────▲────────────┘
            │                               │
┌───────────┴──────────┐        ┌───────────┴────────────┐
│  socket_sanitizer.ts │        │ socket_rate_limiter.ts │
│  sanitizeSocketPayload│        │ checkSocketRateLimit,  │
│  SENSITIVE_KEYS      │        │ extractClientIp        │
└──────────────────────┘        └────────────────────────┘
```

1. **`socket_sanitizer.ts`:**
   - **Responsibility:** Pure credential scrubbing (`sessionToken`, `password`, `secret`), WeakSet recursion cycle guarding, deep object redaction for structured logs.
   - **Public API:** `sanitizeSocketPayload<T>(payload: T): T`. Zero side effects, zero I/O.
2. **`socket_rate_limiter.ts`:**
   - **Responsibility:** Client IP resolution with `trustProxy` support, sliding window quota consumption, concurrent open socket count tracking, rate limit error generation.
   - **Public API:** `SocketRateLimiter`, `extractClientIp`, `checkSocketRateLimit`.
3. **`socket_pipeline.ts`:**
   - **Responsibility:** Functional middleware composition (`composeSocketMiddleware`), context assembly (`SocketMiddlewareContext`), stage interceptors (`withLogging`, `withValidation`, `withRateLimit`, `withErrorMapping`), and `wrapSocketHandler`.

---

### 5.3 Monolith 3: `apps/client/src/features/multiplayer/composables/useSocketTransport.ts` (1,025 lines)

#### Problem
Bundled Socket.IO connection lifecycle, reconnection backoff loops, ping/pong latency measurement, typed request/response promise timeouts, and event dispatching into a 1,000+ line composable.

#### Decomposition Architecture
Decomposed into submodules in `apps/client/src/features/multiplayer/composables/`:

```
┌────────────────────────────────────────────────────────┐
│                 useSocketTransport.ts                  │  (Facade Composable, <200 lines)
└───────────▲───────────────────────────────▲────────────┘
            │                               │
┌───────────┴───────────────────┐ ┌─────────┴────────────────────┐
│  socket_connection_manager.ts │ │    socket_request_client.ts    │
│  Connection lifecycle, backoff│ │    emitWithTimeout, timeouts,│
│  ping/pong latency refs       │ │    correlation IDs, acks     │
└───────────────────────────────┘ └──────────────────────────────┘
```

1. **`socket_connection_manager.ts`:**
   - **Responsibility:** Socket instance connection, reconnection with exponential jittered backoff, periodic ping latency measurement, and reactive connection status refs (`isConnected`, `isReconnecting`, `latencyMs`, `connectionError`).
   - **Public API:** `useSocketConnectionManager(socketClient: TypedSocket, timerService: ITimerService)`.
2. **`socket_request_client.ts`:**
   - **Responsibility:** Typed request/response emission over sockets with configurable timeout (`emitWithTimeout`), correlation ID tagging, promise settlement, and standardized timeout error formatting.
   - **Public API:** `useSocketRequestClient(socketClient: TypedSocket, timerService: ITimerService)`.
3. **`useSocketTransport.ts`:**
   - **Responsibility:** Thin facade composable uniting the connection manager and request client to preserve backward-compatible consumption by `useRoomSession` and `useGameActions`.

---

## 6. Pure Chess Engine Boundary Rules (MAJ-009)

### 6.1 Architectural Mandate: Rule 2 (Pure Business Logic)
Per `architectural-pattern.md` (Rule 2: Pure Business Logic, Rule 3: Dependency Direction):
- Calculation, validation, and transformation modules MUST be pure functions: `(State, Input) → Outcome`.
- **Zero I/O. Zero Side Effects. Zero Telemetry Singletons.**

### 6.2 Prohibited Patterns in `engine/` Modules
1. **NO Logger Imports:** `import { logger } from '@/platform/telemetry'` is strictly forbidden in any file located inside an `engine/` directory.
2. **NO Console Calls:** `console.log`, `console.debug`, `console.error` are strictly forbidden.
3. **NO Global State Reads:** No `window`, `localStorage`, `process.env`, or `Date.now()`. Pass timestamps via parameters.
4. **NO Network or Sockets:** Zero HTTP or socket dependencies.

### 6.3 Affected Pure Engine Files
The following files MUST have all `logger` imports removed and be converted to pure functions:
1. `apps/client/src/features/scenarios/engine/scenario_validator.ts`
2. `apps/client/src/features/puzzles/engine/puzzle_validator.ts`
3. `apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts`
4. `apps/client/src/features/puzzles/engine/material_delta.ts`
5. `apps/client/src/features/puzzles/engine/rules_of_thumb.ts`
6. `apps/client/src/features/puzzles/engine/theme_detector.ts`
7. `apps/client/src/features/ai/engine/minimax_engine.ts`

### 6.4 Structured Outcome Pattern
Instead of logging side-effects when a validation or evaluation fails, engine functions MUST return typed, structured outcomes:

```typescript
/**
 * Canonical outcome returned by pure scenario and move validation engines.
 */
export interface StepMoveValidationOutcome {
  readonly valid: boolean;
  readonly reason?: string;
  readonly deliveredCheckmate?: boolean;
}

/**
 * Pure validation function adhering strictly to Rule 2.
 */
export function validateStepMove(
  step: TutorialStep,
  move: PlayerMoveInput,
  chess?: { fen(): string } | null,
): StepMoveValidationOutcome {
  if (!step) {
    return { valid: false, reason: "No active tutorial step" };
  }
  if (!move || !move.from || !move.to) {
    return { valid: false, reason: "Invalid move input" };
  }

  // Pure mathematical / constraint evaluation...
  if (isConstraintMatched) {
    return { valid: true };
  }

  // Pure checkmate verification without any outer logger calls
  if (isSoundCheckmate) {
    return { valid: true, deliveredCheckmate: true };
  }

  return { valid: false, reason: "Move does not match required step constraints" };
}
```

### 6.5 Caller-Side Telemetry Logging
Logging belongs exclusively at the **operation entry point** (the calling composable or controller), never within the pure engine:

```typescript
// In calling composable (apps/client/src/features/scenarios/composables/useTutorialScenario.ts)
const outcome = validateStepMove(step, move, chess);
if (!outcome.valid) {
  logger.debug("Step move rejected by scenario engine", {
    operation: "scenario_step_move",
    reason: outcome.reason,
    stepId: step.id,
  });
}
```

---

## 7. Builder Verification & Quality Gate Checklist

Before submitting code for review, every builder MUST verify compliance with these conventions:

- [ ] **No Monolithic Files:** Zero files exceeding 1,000 lines of code.
- [ ] **No Pure Engine Logging:** Zero `logger` imports in any `engine/` subdirectories.
- [ ] **No Module Singletons:** Zero mutable module-level state (`let foo = ...`) and zero test backdoors (`setPwaInstallStorage`, etc.).
- [ ] **Canonical Timers:** All timers use `ITimerService` and `TimerHandle` from `@fun-chess/shared`.
- [ ] **Service Operation Pattern:** Domain mutators and workflows use `executeServiceOperation`, demoting 4xx rejections to `WARN`.
- [ ] **Pinia Setup Stores:** Client state uses `defineStore` setup stores with `createDefaultState(clock)` factories.
- [ ] **Clean Encapsulation:** Cross-feature imports consume `index.ts` barrels only; zero deep module imports.
- [ ] **Strict Typing:** Zero `as unknown as` double casts; zero TypeScript type errors.
- [ ] **Full Test Coverage:** Unit tests co-located in `__tests__/` with 100% pass rates across all test suites.
