# Code Audit: Full Codebase
Date: 2026-09-09
Auditor: AI Code Audit (multi-dimensional, 7 parallel subagents)

## Executive Summary
- **Dimensions activated:** A (Security & Configuration), B (Reliability & Error Handling), C (Testability & Architecture), D (Observability & Logging), E (Code Quality & Patterns), F (Integration Contracts & Client-Server Boundaries), G (Dependencies & Test Coverage Gaps)
- **Dimensions skipped:** None (all 7 dimensions fully scanned across `shared`, `apps/server`, `apps/client`, `apps/e2e`)
- **Files scanned:** 573 files across the monorepo (205 core application source files, 170 test suites, build and deployment manifests)
- **Findings:** 54 total (0 Critical, 26 Major, 19 Minor, 9 Enhancement)
- **Automated verification:** Lint: PASS (0 warnings, `--no-inline-config`) | Typecheck: PASS | Tests: PASS (170/170 test files, 2,478/2,478 tests passed, 0 failed) | Build: PASS | Coverage: Statements 94.05%, Branches 85.27%, Functions 93.52%
- **Overall codebase health:** HEALTHY (defensible security posture, comprehensive type checking, clean secrets scan, high test pass rate, with specific structural and observability remediations required)

## Critical Issues
*No Critical security vulnerabilities, active exploits, or data loss bugs were identified.*
- Scanned 76 git commits and working directory with `gitleaks`: zero credentials or tokens detected.
- Evaluated runtime paths for SQL/NoSQL injection, SSRF, command injection, and path traversal: all validated clean.

## Major Issues
Structural violations, missing I/O error handling, untested critical paths, or broken contracts. Must be fixed before release.

- [ ] **[MAJ-001]** Module-Scope Configuration Evaluation & Stateful Shadow Rate Limiter Instantiation in Socket Handlers — [apps/server/src/features/rooms/room.socket_handler.ts:50-54](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L50-L54) and [apps/server/src/features/game/game.socket_handler.ts:32-45](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.socket_handler.ts#L32-L45)
  - **Dimension:** A & C (Cross-Dimension Convergence)
  - **Rule Source:** `configuration-management-principles.md` (Separation of Configuration and Code), `architectural-pattern.md` (Rule 3: Dependency Direction)
  - **Description:** `room.socket_handler.ts` and `game.socket_handler.ts` import the `env` proxy and instantiate module-scope rate limiters (`defaultSocketRateLimiter`, `roomCreateRateLimiter`) at import time. Accessing `env.RATE_LIMIT_ROOM_CREATE_MAX` immediately triggers `loadServerConfig(process.env)`. If required production environment variables are passed programmatically via `startServer({ config })`, module import throws an unhandled fatal validation error before `startServer` runs. Furthermore, each instance spins up an unmanaged background pruning interval (`setInterval`), creating redundant shadow limiters that persist alongside the limiters instantiated in `index.ts`.
  - **Impact:** Bypasses injected configuration, leaks interval timers in memory, and causes crashes during programmatic server startups.
  - **Evidence:**
    ```typescript
    export const defaultSocketRateLimiter = createSocketRateLimiter();
    export const roomCreateRateLimiter = createSocketRateLimiter({
      maxRequests: env.RATE_LIMIT_ROOM_CREATE_MAX,
      windowMs: 60_000,
    });
    ```
  - **Remediation:** Remove module-level instances from socket handler modules. Require `rateLimiter`, `createRateLimiter`, and `trustProxy` as explicit parameters in `registerRoomSocketHandlers` and `registerGameSocketHandlers`, with instances constructed and owned by `startServer` in `index.ts`.
  - **Fix workflow:** `/bugfix` or `/refactor`

- [ ] **[MAJ-002]** Synchronous Failure During Server Shutdown Sequence Bypasses Catch Block and Traps Server in Unclosable State — [apps/server/src/platform/lifecycle/shutdown_coordinator.ts:89-166](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L89-L166)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `error-handling-principles.md` (Rule 1: Never Fail Silently, Rule 5: Clean Up in Finally Blocks), `resources-and-memory-management-principles.md` (Rule 1: Universal Cleanup)
  - **Description:** In `ShutdownCoordinator.shutdown()`, lines 89–155 (executing `additionalCleanups`, arming `forceExitTimer`, disconnecting sockets via `io.disconnectSockets(true)`, and closing connections) execute outside the `try/catch` block that surrounds `Promise.race`. If any synchronous exception occurs during these steps, the error throws out of `shutdown()`. Because signal handlers call `void this.shutdown(...)`, the rejected promise goes to `unhandledRejection`, `this.onExit(1)` is never called, and `this.isShuttingDown` remains permanently `true`, causing subsequent OS signals to be ignored.
  - **Impact:** Server process becomes an unclosable zombie upon teardown exceptions, requiring manual `SIGKILL`.
  - **Evidence:**
    ```typescript
    this.io.disconnectSockets(true);
    // ... connections closed outside try/catch ...
    try {
      await Promise.race([shutdownPromise, timeoutPromise]);
    } catch (error) { ... }
    ```
  - **Remediation:** Wrap the entire shutdown sequence in a top-level `try/catch/finally` block. Wrap each item in `additionalCleanups` in an isolated sub-`try/catch` block so one failing teardown callback does not abort the remaining cleanup steps.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-003]** Unhandled Code Collision on Exhaustion Fallback in Room Creation — [apps/server/src/features/rooms/room.service.ts:140-151](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L140-L151)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `error-handling-principles.md` (Rule 1: Never Fail Silently, Rule 2: Fail Fast)
  - **Description:** When 100 random room code collisions occur, `createRoom` executes fallback code generation derived from `now.toString(36).toUpperCase().slice(-3)` (only 36^3 = 46,656 possible values). The resulting `await this.store.createIfAbsent(createdRoom)` is executed outside any retry loop or try/catch. If collision occurs, `RoomAlreadyExistsError` escapes as an unhandled domain error.
  - **Impact:** High-concurrency room creation throws uncaught domain exceptions that convert to generic 500 errors.
  - **Evidence:**
    ```typescript
    const fallbackCode = `R${now.toString(36).toUpperCase().slice(-3)}`;
    const createdRoom = createRoomEntity({ code: fallbackCode, hostPlayerId: player.id, now });
    return await this.store.createIfAbsent(createdRoom); // Uncaught on collision
    ```
  - **Remediation:** Throw an explicit `RoomCapacityExceededError` or generate a collision-free UUID-backed fallback code wrapped in defensive error handling.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-004]** RoomCapacityExceededError Maps to Generic 500 Internal Server Error, Masking Capacity Backpressure — [apps/server/src/platform/socket/socket_logging_middleware.ts:182-194](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L182-L194) and [apps/server/src/features/rooms/room.errors.ts:83-93](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.errors.ts#L83-L93)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `error-handling-principles.md` (Rule 3: Differentiate Error Types), `resources-and-memory-management-principles.md` (Rule 5: Handle Backpressure)
  - **Description:** `RoomCapacityExceededError` defines status code `507` (HTTP Insufficient Storage) and code `"ERR_INTERNAL_SERVER"`. `buildErrorPayload` in `socket_logging_middleware.ts` treats any error with `statusCode >= 500` as an internal server error and replaces the message with `"An internal server error occurred"`.
  - **Impact:** Clients receive a generic internal server error and cannot notify users that server room capacity is temporarily saturated.
  - **Evidence:**
    ```typescript
    message: error.statusCode >= 500 ? "An internal server error occurred" : error.message
    ```
  - **Remediation:** Change `RoomCapacityExceededError` status code to `429` (or use code `"ERR_ROOM_CAPACITY_EXCEEDED"`) and permit its descriptive message to pass through to clients.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-005]** Circular Dependency Cycle Between DI Index and DI Helpers — [apps/client/src/platform/di/index.ts:46](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/di/index.ts#L46) and [apps/client/src/platform/di/helpers.ts:34](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/di/helpers.ts#L34)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `code-organization-principles.md` § Avoid Circular Dependencies
  - **Description:** A circular dependency exists in the client DI subsystem: `index.ts` re-exports everything from `helpers.ts` (`export * from './helpers'`), while `helpers.ts` imports injection resolver functions directly from `./index`.
  - **Impact:** Risk of uninitialized module bindings, bundler tree-shaking failures, and undefined runtime references.
  - **Evidence:** `apps/client/src/platform/di/index.ts -> apps/client/src/platform/di/helpers.ts -> apps/client/src/platform/di/index.ts`
  - **Remediation:** Define injection resolver functions directly in `tokens.ts` or a separate `resolvers.ts`, and re-export without back-referencing `index.ts`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-006]** Hard Browser Navigation Side Effect in Room Session Composable — [apps/client/src/features/multiplayer/composables/useRoomSession.ts:203-207](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useRoomSession.ts#L203-L207)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation, Rule 2: Pure Business Logic)
  - **Description:** When a room session terminates due to host departure or room closure, `useRoomSession` performs hard browser navigation by directly assigning `window.location.assign('/multiplayer')` or `window.location.href = '/multiplayer'`.
  - **Impact:** Full page reload destroys SPA state, sound playback context, and in-flight telemetry. Unit tests must destructively delete and monkey-patch `window.location`.
  - **Evidence:**
    ```typescript
    if (typeof window.location?.assign === 'function') {
      window.location.assign('/multiplayer');
    } else if (window.location) {
      window.location.href = '/multiplayer';
    }
    ```
  - **Remediation:** Emit a room closed event or invoke an injected navigation callback (`onRoomClosed?: () => void`) managed by the view router.
  - **Fix workflow:** `/bugfix` or `/refactor`

- [ ] **[MAJ-007]** Cross-Feature Boundary Violations Bypassing Public APIs in Client — [apps/client/src/features/portability/composables/useProgressSync.ts:22-23](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useProgressSync.ts#L22-L23), [apps/client/src/main.ts:35](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L35), [apps/client/src/components/arena/index.ts:1-2](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/arena/index.ts#L1-L2), [apps/client/src/composables/index.ts:20](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/index.ts#L20)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `code-organization-principles.md` § Module Boundaries & Feature Interaction
  - **Description:** Modules bypass the public `index.ts` of feature packages and import internal store and component files directly (e.g. `useProgressSync.ts` imports `@/features/scenarios/store/local_storage_progress.store`, `main.ts` imports `./features/portability/store/local_storage_unified.store`).
  - **Impact:** Couples features to internal file layout; internal refactoring breaks consuming modules.
  - **Evidence:** `import { defaultLocalStorageProgressStore } from '@/features/scenarios/store/local_storage_progress.store';`
  - **Remediation:** Re-export necessary public stores in feature root barrels and update import paths to use package barrels.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-008]** Pervasive Direct `Date.now()` Calls in Business Logic Bypassing `IClock` — [apps/client/src/features/puzzles/PuzzleArena.vue:115](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/PuzzleArena.vue#L115), [apps/client/src/features/puzzles/composables/usePuzzleRunner.ts:240](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleRunner.ts#L240), [apps/client/src/features/ai/composables/useAiMoveExecution.ts:73](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiMoveExecution.ts#L73), [apps/client/src/features/portability/store/local_storage_unified.store.ts:46](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/store/local_storage_unified.store.ts#L46)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation - Time/Randomness)
  - **Description:** Over 20 client production files invoke `Date.now()` directly instead of injecting `IClock` via `useInjectClock()` or constructor arguments, despite `IClock` and `CLOCK_KEY` being available in the application.
  - **Impact:** Nondeterministic test execution; tests cannot simulate expiration windows or speed-run timing without monkey-patching global `Date`.
  - **Evidence:** `const solveStartTime = ref<number>(Date.now());`, `let matchStartTime = Date.now();`, `exportedAt: Date.now()`
  - **Remediation:** Inject `IClock` into composables and stores, replacing `Date.now()` with `clock.now()`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-009]** Incomplete Dependency Injection and Concrete Typing in Server Bootstrap — [apps/server/src/index.ts:52-65, 83-93, 118-124](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L52-L65)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 3: Dependency Direction), `testability-patterns` skill
  - **Description:** `StartServerOptions` does not allow injecting `relayAddressService?: IRelayAddressService`. `setupDomainServices` hardcodes `new RelayAddressService(...)`, ignoring existing `MockRelayAddressService`. Additionally, `DomainServices` and `ServerInstance` type services with concrete classes rather than interfaces (`IRoomService`, `IGameService`, `IRelayAddressService`).
  - **Impact:** Prevents zero-I/O testing of server startup and exposes concrete implementations across package boundaries.
  - **Evidence:** `relayAddressService: RelayAddressService;`, `new RelayAddressService({ ... })`
  - **Remediation:** Add `relayAddressService?: IRelayAddressService` to `StartServerOptions` and annotate `DomainServices` with interface contracts.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-010]** Interface Abstraction Violation: `GameService` Accesses Private Implementation Field of `SessionRegistry` — [apps/server/src/features/game/game.service.ts:226-230](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L226-L230)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation, Rule 3: Dependency Direction)
  - **Description:** In `GameService.touchPlayerSession`, `this.sessionRegistry` is cast to `{ playerIndex?: Map<string, string> }` to access the private in-memory map of `InMemorySessionRegistry`.
  - **Impact:** Subverts interface contract; any alternative `SessionRegistry` implementation (or test double) fails or returns undefined.
  - **Evidence:**
    ```typescript
    token = (this.sessionRegistry as { playerIndex?: Map<string, string> }).playerIndex?.get(
      `${roomCode.toUpperCase()}:${playerId}`,
    );
    ```
  - **Remediation:** Remove the type cast and private field access. Rely solely on `await this.sessionRegistry.getSessionTokenForPlayer(roomCode, playerId)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-011]** Missing Test Double: `SessionRegistry` Lacks a Test Adapter — [apps/server/src/features/rooms/session_registry.ts:32-121](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/session_registry.ts#L32-L121)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: "Implement a production adapter AND a test adapter for every I/O boundary")
  - **Description:** While `RoomStore`, `IFileStorage`, and `IRelayAddressService` provide mock adapters, `SessionRegistry` only has `InMemorySessionRegistry` and lacks a dedicated `MockSessionRegistry` test double.
  - **Impact:** Test suites must instantiate production registry state with background timers or write ad-hoc mocks.
  - **Evidence:** `in_memory_session_registry.ts` exists, but no `mock_session_registry.ts`.
  - **Remediation:** Create `MockSessionRegistry` implementing `SessionRegistry` and export from `features/rooms/index.ts`.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MAJ-012]** False Success Reporting and Silent Error Swallowing in Abandonment Forfeit Background Job — [apps/server/src/features/rooms/room.service.ts:435-475](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L435-L475) and [apps/server/src/features/rooms/room.socket_handler.ts:318-342](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L318-L342)
  - **Dimension:** D & B (Cross-Dimension Convergence)
  - **Rule Source:** `logging-and-observability-mandate.md` (No silent failures, operation failure must log error), `error-handling-principles.md` (Rule 1: Never Fail Silently)
  - **Description:** In `handleSocketDisconnect`, the `onForfeit` callback swallows all broadcast and game-over notification exceptions without rethrowing. Because `onForfeit` resolves, `runLoggedJob` records `status: "success"` and logs `Background job succeeded`. Monitoring registers false-positive success while game-over notifications are failing. Furthermore, `onForfeit` uses a stale `correlationId` from 60 seconds prior, and if `runLoggedJob` fails, an outer catch logs a duplicate error with no correlation ID.
  - **Impact:** 100% false-positive success reporting in metrics while background jobs fail.
  - **Evidence:** Local catch block in `room.socket_handler.ts:333-341` swallows `err` without rethrowing.
  - **Remediation:** Pass active `jobCorrelationId` into `onForfeit`, rethrow caught errors in `onForfeit`, and eliminate redundant outer error logs.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-013]** Mutating Operation Keys, Missing Error Diagnostics, and Duplicate Logging in HTTP Server Pipeline — [apps/server/src/platform/http/http_server.ts:310-327, 552-570, 674-707](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L310)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md` (Mandatory context: invariant operation name, 3-point logging), `logging-implementation` skill
  - **Description:** In `createHttpServer`, when an unhandled exception occurs, the catch block logs `HTTP request error` with `operation: "http_error"`, then calls `sendJsonResponse(statusCode, payload)`. `sendJsonResponse` unconditionally emits a second log with `operation: "http_request"`. The second log omits the error object and stack trace. In addition, static requests start with `operation: "http_request"` but complete with `operation: "http_static"`.
  - **Impact:** Log aggregators cannot correlate request lifecycle; error rate metrics double-count failures.
  - **Evidence:**
    ```typescript
    logger.error("HTTP request error", { operation: "http_error", ... });
    sendJsonResponse(statusCode, payload); // Emits second log with operation: "http_request"
    ```
  - **Remediation:** Standardize `operation: "http_request"` across all HTTP pipeline stages and prevent duplicate response logging.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-014]** Missing Success Log Point and Latency Measurement on Socket Disconnection Lifecycle — [apps/server/src/index.ts:200-233](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L200-L233)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md` (3 mandatory log points: start, success with duration, failure)
  - **Description:** Socket.IO `disconnect` handler logs start (`operation: "socket_disconnected"`) and catches errors, but completely omits the success completion log and duration metric when `handleSocketDisconnect` finishes cleanly.
  - **Impact:** Disconnection operations perform room state mutations and timer cleanup completely unmeasured for latency.
  - **Evidence:** `try { await handleSocketDisconnect(...); /* No success log, no duration */ }`
  - **Remediation:** Add `const startTime = performance.now();` and emit success log with `duration` and `durationMs` upon completion.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-015]** Premature Operation Start Log Level Silencing Ingress Telemetry in Game Action Dispatcher — [apps/client/src/features/multiplayer/composables/useGameActions.ts:327-331](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useGameActions.ts#L327-L331)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md` (Public operations log INFO on start)
  - **Description:** `dispatchGameAction` logs initiation of user game operations (`game:move`, `game:resign`, etc.) with `logger.debug` instead of `logger.info`. Under default production client configuration (`level: 'info'`), entry logging is dropped. If network timeouts occur, the error log appears without an initial start log.
  - **Impact:** Client gameplay telemetry lacks the mandatory start log point, obscuring request drop diagnosis.
  - **Evidence:** `logger.debug(startLogMessage, { operation, correlationId, ... });`
  - **Remediation:** Elevate start log to `logger.info`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-016]** Explicit `any` Type Cast Suppressing Type Safety in Modal Router — [apps/client/src/components/layout/AppModalContainer.vue:235](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/AppModalContainer.vue#L235)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-idioms-and-conventions.md`, `code-review/languages/typescript.md`
  - **Description:** In `AppModalContainer.vue`, the `diffPreview` prop is bound to `ProgressConflictModal` with an explicit `:diff-preview="(diffPreview as any)"` cast, bypassing compiler type checking due to loose union typing in `Props`.
  - **Impact:** Weakens template type guarantees; progress sync diff structural changes won't trigger compile errors.
  - **Evidence:** `:diff-preview="(diffPreview as any)"`
  - **Remediation:** Type `diffPreview` strictly as `ProgressDiffPreview | null` in `Props` and remove `as any`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-017]** Silent Exception Swallowing via `void err;` Empty Catch Blocks Across Validation and Evaluation Engines — [apps/client/src/features/scenarios/engine/scenario_validator.ts:66, 109, 158](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/engine/scenario_validator.ts#L66), [apps/client/src/features/puzzles/engine/puzzle_validator.ts:35, 52, 66, 125, 142, 311](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_validator.ts#L35), [apps/client/src/features/board/useChessBoard.ts:59](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/board/useChessBoard.ts#L59), [apps/server/src/features/game/chess_engine.ts:58](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L58)
  - **Dimension:** E & B (Cross-Dimension Escalation: MINOR -> MAJOR)
  - **Rule Source:** `rugged-software-constitution.md` (No Silent Failures), `error-handling-principles.md` (Rule 1: Never Fail Silently)
  - **Description:** Multiple game engines and composables catch errors with `catch (err) { void err; }` or empty `catch {}` blocks to bypass linters without logging. If chess move validation or FEN parsing throws a `TypeError` or runtime error, the exception is discarded without telemetry.
  - **Impact:** Hides engine corruption, invalid FEN structures, and unexpected chess engine crashes during move validation.
  - **Evidence:** `try { ... } catch (err) { void err; }` in `scenario_validator.ts`.
  - **Remediation:** Log caught exceptions at `debug` or `warn` level with structured context before returning fallback results.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-018]** Unchecked Non-Null Assertions `!` Across Game Engines and Infrastructure Without Comments — [apps/server/src/features/game/chess_engine.ts:282](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L282), [apps/server/src/features/game/game.service.ts:116, 151](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L116), [apps/client/src/platform/api/fetch_api_client.ts:132, 183, 256](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L132), [apps/client/src/features/ai/engine/minimax_engine.ts:106, 112](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/engine/minimax_engine.ts#L106), [apps/client/src/features/ai/composables/useTakebackHistory.ts:69](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useTakebackHistory.ts#L69)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-review/languages/typescript.md` (Non-null assertion `!` without comment)
  - **Description:** Non-null assertions (`!`) are used on array indexing and URL manipulation without comments explaining why the value is guaranteed to exist.
  - **Impact:** If an empty array or unexpected input arrives, an uncaught runtime `TypeError` is thrown.
  - **Evidence:** `moveHistory[moveHistory.length - 1]!.from`, `fullUrl.split('?')[0]!`
  - **Remediation:** Replace non-null assertions with explicit guard clauses or optional chaining.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-019]** Monolithic God Component (725 lines) Bundling Cross-Cutting Subsystems in Root `App.vue` — [apps/client/src/App.vue:1-725](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L1-L725)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md` (Single Purpose, Component Size), `core-design-principles.md` (SRP)
  - **Description:** `App.vue` directly imports and coordinates 10+ distinct subsystems: WebSockets, local game state, notifications, routing, audio/haptics, progress sync, PWA banners, confetti, and multiple confirmation modals in 725 lines.
  - **Impact:** High coupling, large cognitive burden, and fragile root component maintenance.
  - **Evidence:** 725 lines in `App.vue` orchestrating entire application state.
  - **Remediation:** Extract confirmation modal orchestration into `useGameConfirmation`, PWA logic into `AppPwaManager.vue`, and keep `App.vue` under 150 lines.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-020]** Excessive Cyclomatic Complexity (CC 42) & Mixed Responsibilities in `generateProgressiveHint` — [apps/client/src/features/puzzles/engine/hint_generator.ts:55-175](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/hint_generator.ts#L55-L175)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md` (Cyclomatic Complexity < 10, Lines < 50), `core-design-principles.md` (SRP)
  - **Description:** 120-line function combining UCI coordinate parsing, engine moves, tactical extraction, dialogue generation, and square highlight derivation (CC = 42).
  - **Impact:** Difficult to test and maintain; changes to hint text risk breaking engine move processing.
  - **Evidence:** Single function with CC = 42.
  - **Remediation:** Split into `resolveHintPieceDetails`, `formatHintByLevel`, and a coordinator function.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-021]** High Cyclomatic Complexity (CC 37) & Bloated Pipeline in `wrapSocketHandler` — [apps/server/src/platform/socket/socket_logging_middleware.ts:251-438](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L251-L438)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md` (Cyclomatic Complexity < 10), `core-design-principles.md` (SRP)
  - **Description:** 163-line inner handler closure combining rate limiting, IP resolution, correlation propagation, PII scrubbing, Zod parsing, timing, error mapping, and socket callbacks (CC = 37).
  - **Impact:** Extremely fragile socket middleware where logging, rate limiting, and validation cannot be maintained independently.
  - **Evidence:** Inner handler closure of 163 lines with CC = 37.
  - **Remediation:** Decompose into distinct pipeline functions (`checkSocketRateLimit`, `validateSocketPayload`, `formatSocketErrorResponse`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-022]** Client API Adapter Discards Structured `HttpErrorEnvelope` on HTTP Failures — [apps/client/src/platform/api/fetch_api_client.ts:231-247](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L231-L247)
  - **Dimension:** F (Integration Contracts & Database)
  - **Rule Source:** `api-design-principles.md` (API Error Response Format), `error-handling-principles.md`
  - **Description:** `FetchApiClient.getLanInfo()`, `checkHealth()`, and `getDetailedHealth()` discard `res.data` on `!res.ok` and throw a flat `new Error('Failed to fetch LAN info: HTTP ' + res.status)`.
  - **Impact:** Drops server error code (`ERR_RATE_LIMITED`), server correlation ID, and diagnostic message. Client cannot perform exponential backoff or participate in distributed tracing.
  - **Evidence:** `if (!res.ok) throw new Error('Failed to fetch LAN info: HTTP ' + res.status);`
  - **Remediation:** Parse error envelope using `HttpErrorEnvelopeSchema.safeParse` and throw a typed `ApiClientError` containing code, status, and `correlationId`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-023]** Missing `UnifiedProgressEnvelopeSchema` Validation in `DefaultProgressCodec.decodeFromEnvelopeJson` — [shared/src/utils/progress_codec.ts:309-352](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_codec.ts#L309-L352)
  - **Dimension:** F (Integration Contracts & Database)
  - **Rule Source:** `rugged-software-constitution.md` (Every input is malformed until validated at system boundary)
  - **Description:** `decodeFromEnvelopeJson` performs manual checks on `magic` and `payload`, bypassing `UnifiedProgressEnvelopeSchema.safeParse()`. Fields like `schemaVersion` and `exportedAt` are never verified for valid types or positive integers before CRC check and decompression.
  - **Impact:** Malformed backup envelopes bypass schema validation at the system boundary.
  - **Evidence:** `if (!parsed || parsed.magic !== "FC_PROGRESS_V1")` without running Zod schema validation.
  - **Remediation:** Validate parsed JSON using `UnifiedProgressEnvelopeSchema.safeParse(parsed)` at the beginning of `decodeFromEnvelopeJson`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-024]** Schema Drift Between TypeScript Model `ThemeMasteryProgress` and Zod Contract `ThemeMasteryProgressSchema` — [shared/src/contracts/schemas.ts:605-612](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L605-L612) vs [shared/src/contracts/puzzle.ts:501-508](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/puzzle.ts#L501-L508)
  - **Dimension:** F (Integration Contracts & Database)
  - **Rule Source:** `code-idioms-and-conventions.md`, `data-serialization-and-interchange-principles.md`
  - **Description:** `ThemeMasteryProgress.theme` is strongly typed to `PuzzleTheme` literal union in `puzzle.ts`, while `ThemeMasteryProgressSchema` defines `theme: z.string().min(1)`.
  - **Impact:** Arbitrary invalid theme strings pass validation; downstream UI indexing with `PuzzleTheme` encounters runtime undefined property lookups.
  - **Evidence:** `theme: z.string().min(1)` instead of `PuzzleThemeSchema`.
  - **Remediation:** Constrain `ThemeMasteryProgressSchema.theme` with `PuzzleThemeSchema`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-025]** Core Domain Branch Coverage Threshold Diluted to 75% in Shared Vitest Configuration — [shared/vitest.config.ts:15](file:///home/irahardianto/works/projects/fun-chess/shared/vitest.config.ts#L15)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` §Test Pyramid (>85% coverage mandate)
  - **Description:** `shared/vitest.config.ts` sets `branches: 75`. `game_over.ts` has 71.9% branch coverage (lines 64, 69, 72, 73, 92 unhit), `chess_factory.ts` has 80%, and `dictionary_mapper.ts` has 81%.
  - **Impact:** Untested edge cases in match termination, resignation messages, and dictionary mapping.
  - **Evidence:** `branches: 75` in `shared/vitest.config.ts`.
  - **Remediation:** Restore `branches: 85` and add unit tests covering fallback message generation in `game_over.spec.ts`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-026]** Playwright E2E Suite, Template Typechecking, and Linting Omitted from CI Workflow — [.github/workflows/ci.yml:60-111](file:///home/irahardianto/works/projects/fun-chess/.github/workflows/ci.yml#L60-L111)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` §Test Pyramid, `code-idioms-and-conventions.md` §Code Completion Workflow
  - **Description:** CI runs `pnpm test` (unit/integration only); the Playwright E2E suite (`pnpm run test:e2e`) is omitted. `pnpm run lint` is omitted. Typecheck step runs `tsc` instead of `vue-tsc`, ignoring `.vue` template typing errors.
  - **Impact:** Broken E2E flows, lint rule violations, and Vue template type errors can be merged into `main` without failing CI.
  - **Evidence:** Missing `pnpm run test:e2e` and `pnpm run lint` in `.github/workflows/ci.yml`.
  - **Remediation:** Add lint step, update typecheck to `pnpm run typecheck`, and add Playwright E2E job.
  - **Fix workflow:** `/workflow-solo`

## Minor Issues
Code maintainability issues, function length/complexity violations, or minor test gaps. Fix in near term.

- [ ] **[MIN-001]** Direct `process.env` Read in `resolveDistPath` Bypassing Configuration Layer — [apps/server/src/platform/http/http_server.ts:107-109](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L107-L109)
  - **Dimension:** A
  - **Description:** `resolveDistPath` checks `process.env["CLIENT_DIST_PATH"]` directly rather than relying on validated `config.env`.
  - **Remediation:** Remove `process.env` fallback; rely strictly on `config.distPath` and `config.env.CLIENT_DIST_PATH`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-002]** Configuration Drift in Auxiliary Deployment Manifests — [apps/server/.env.example:47-58](file:///home/irahardianto/works/projects/fun-chess/apps/server/.env.example#L47-L58) and [docker-compose.yml:19-22](file:///home/irahardianto/works/projects/fun-chess/docker-compose.yml#L19-L22)
  - **Dimension:** A
  - **Description:** `apps/server/.env.example` lacks documentation for `CLIENT_DIST_PATH` and `RATE_LIMIT_ROOM_CREATE_MAX`. `docker-compose.yml` references obsolete `DEFAULT_RATE_LIMIT_MAX_REQUESTS`.
  - **Remediation:** Synchronize `.env.example` and update `docker-compose.yml`.
  - **Fix workflow:** Direct edit

- [ ] **[MIN-003]** Explicit Disabling of Anti-XSS Linter Security Rule in `eslint.config.js` — [eslint.config.js:63](file:///home/irahardianto/works/projects/fun-chess/eslint.config.js#L63)
  - **Dimension:** A
  - **Description:** `'vue/no-v-html': 'off'` disables detection of unescaped HTML injection. Zero files use `v-html`.
  - **Remediation:** Remove override or set to `'error'`.
  - **Fix workflow:** Direct edit

- [ ] **[MIN-004]** Server Unhandled Promise Rejections Log Without Initiating Controlled Graceful Shutdown — [apps/server/src/platform/lifecycle/shutdown_coordinator.ts:206-215](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L206-L215)
  - **Dimension:** B
  - **Description:** `unhandledRejection` handler logs an error but does not call `this.shutdown("unhandledRejection")`.
  - **Remediation:** Trigger graceful shutdown upon unhandled rejections to prevent zombie processes with corrupted state.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-005]** Pure Business Logic Impurity: Logging Side Effects Inside Pure Validators — [apps/server/src/features/game/chess_engine.ts:313](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L313) and [apps/server/src/platform/http/static_handler.ts:58, 66](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L58)
  - **Dimension:** C
  - **Description:** `ChessEngine.findKingSquare` and `checkPathTraversal` log side effects using `defaultLogger`.
  - **Remediation:** Remove logger parameters and logging calls from pure calculations.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-006]** Cross-Module Boundary Violation: Server Handlers Bypassing Platform Socket Public API — [apps/server/src/features/game/game.socket_handler.ts:24](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.socket_handler.ts#L24)
  - **Dimension:** C
  - **Description:** Handlers import directly from internal `socket_handler.utils.js` rather than `platform/socket/index.js`.
  - **Remediation:** Standardize import to `platform/socket/index.js`.
  - **Fix workflow:** Direct edit

- [ ] **[MIN-007]** Redundant Triple-Logging and Discordant Correlation IDs in Rate Limiter Cache Pruning Job — [apps/server/src/platform/socket/socket_rate_limiter.ts:70-80, 192-202](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L70-L80)
  - **Dimension:** D
  - **Description:** Prune failures trigger three separate error logs across `prune()`, `runLoggedJob`, and the outer `.catch()`.
  - **Remediation:** Remove local error logging from `prune()`; let `runLoggedJob` handle standard 3-point logging.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-008]** Mutating Operation Names and Invariant Violations in Graceful Shutdown Sequence — [apps/server/src/platform/lifecycle/shutdown_coordinator.ts:83](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L83)
  - **Dimension:** D
  - **Description:** Operation name changes from `server_shutdown` to `server_shutdown_complete`, `server_shutdown_timeout`, and `server_shutdown_error`.
  - **Remediation:** Retain invariant `operation: "server_shutdown"` and record status in `status`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-009]** String Formatting and Incorrect Log Level for Inbound Socket Validation in Client Transport — [apps/client/src/features/multiplayer/composables/useSocketTransport.ts:401](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L401)
  - **Dimension:** D
  - **Description:** Uses string template interpolation in log messages and logs expected validation rejections at `ERROR` level instead of `WARN`.
  - **Remediation:** Use static message templates, `WARN` level, and structured validation details.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-010]** Missing Duration Metric and Inconsistent Field Naming in Client Progress Portability Telemetry — [apps/client/src/features/portability/composables/useProgressSync.ts:156](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useProgressSync.ts#L156)
  - **Dimension:** D
  - **Description:** Telemetry records `durationMs` but omits canonical `duration`.
  - **Remediation:** Emit both `duration` and `durationMs` on completion logs.
  - **Fix workflow:** Direct edit

- [ ] **[MIN-011]** Unlogged Operation Entry Point in Solo AI Resignation — [apps/client/src/features/ai/composables/useAiMoveExecution.ts:311-339](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiMoveExecution.ts#L311-L339)
  - **Dimension:** D
  - **Description:** `resign()` executes game outcome without emitting start or completion logs.
  - **Remediation:** Instrument `resign()` with 3-point structured logging.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-012]** Missing Correlation ID and Duration in In-Memory Room Store Lock Contention Logs — [apps/server/src/features/rooms/in_memory_room.store.ts:257](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L257)
  - **Dimension:** D
  - **Description:** Lock logs omit active `correlationId` and hold duration.
  - **Remediation:** Propagate optional `correlationId` into `withLock` and record hold duration.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-013]** Duplicated Algebraic Coordinate Math Across 10+ Files — [apps/client/src/features/puzzles/components/ProgressiveHintLayer.vue:17](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/components/ProgressiveHintLayer.vue#L17)
  - **Dimension:** E
  - **Description:** Character code math (`charCodeAt(0) - 97`) repeated across 10+ files.
  - **Remediation:** Export `squareToCoords` and `coordsToSquare` from `@fun-chess/shared`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-014]** Leakage of Test Double `MockRoomStore` Through Server Production Public Barrel Export — [apps/server/src/features/rooms/index.ts:14](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/index.ts#L14)
  - **Dimension:** E
  - **Description:** `MockRoomStore` is re-exported from `features/rooms/index.ts`, bundling test doubles into production builds.
  - **Remediation:** Remove from public barrel; import directly in tests.
  - **Fix workflow:** Direct edit

- [ ] **[MIN-015]** Inappropriate Colocation of Hardware Composable `useHaptics` in `useAudio.ts` — [apps/client/src/composables/useAudio.ts:42-105](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useAudio.ts#L42-L105)
  - **Dimension:** E
  - **Description:** Device vibration composable is colocated inside audio synthesis module.
  - **Remediation:** Move to dedicated `apps/client/src/composables/useHaptics.ts`.
  - **Fix workflow:** Direct edit

- [ ] **[MIN-016]** Storage Migration Business Logic Colocated in Configuration File `keys.ts` — [apps/client/src/platform/storage/keys.ts:33-108](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/keys.ts#L33-L108)
  - **Dimension:** E
  - **Description:** 75-line `migrateStorageV1ToV2` routine is defined in storage key definition file.
  - **Remediation:** Extract into `apps/client/src/platform/storage/migration.ts`.
  - **Fix workflow:** Direct edit

- [ ] **[MIN-017]** Dead Code & Unused Exports in Shared and Application Workspaces — [shared/src/utils/dictionary_mapper.ts:407](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/dictionary_mapper.ts#L407)
  - **Dimension:** E
  - **Description:** Unused aliases and contracts (`dictionaryMapper`, `PuzzleSessionState`, `PublicPlayer`, `AppShellEventMap`).
  - **Remediation:** Prune dead type aliases and unreferenced exports.
  - **Fix workflow:** Direct edit

- [ ] **[MIN-018]** Divergence from Deprecation Architecture Specification in `migrateStorageV1ToV2` — [apps/client/src/platform/storage/keys.ts:49-68](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/keys.ts#L49-L68) vs [docs/db_contracts.md:138-163](file:///home/irahardianto/works/projects/fun-chess/docs/db_contracts.md#L138-L163)
  - **Dimension:** F
  - **Description:** If `v2Data` exists without a migration timestamp, legacy keys are never pruned.
  - **Remediation:** Stamp `MIGRATION_V1_V2_TIMESTAMP` when legacy keys exist alongside v2 data.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-019]** Server Bootstrap Integration Test Mislocated in Unit Test Scope and Omitted from Integration Suite — [apps/server/src/__tests__/server_bootstrap.integration.spec.ts:19](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/__tests__/server_bootstrap.integration.spec.ts#L19)
  - **Dimension:** G
  - **Description:** Live socket/http bootstrap test sits in `__tests__/` instead of `__tests__/integration/`, running in `test:unit` and skipped in `test:integration`.
  - **Remediation:** Move to `apps/server/src/__tests__/integration/server_bootstrap.integration.spec.ts`.
  - **Fix workflow:** Direct edit

## Enhancement Issues
Non-critical suggestions, defense-in-depth, documentation, or minor clarity refactorings.

- [ ] **[ENH-001]** Internal Transport Socket ID Exposure in Public Domain Entity Representation — [shared/src/contracts/schemas.ts:74-83](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L74-L83)
  - **Dimension:** A
  - **Suggestion:** Omit raw `socketId` from client-facing player broadcast payloads.
  - **Fix workflow:** `/workflow-solo` or backlog

- [ ] **[ENH-002]** Absence of Granular URL Format Validation for Individual Origins in `CORS_ORIGIN` — [apps/server/src/platform/config/env.ts:75-84](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L75-L84)
  - **Dimension:** A
  - **Suggestion:** Validate comma-separated CORS origins with `safeParseUrl` during startup.
  - **Fix workflow:** Backlog

- [ ] **[ENH-003]** Missing Explicit Node.js HTTP Server Timeout Limits (Slowloris Resistance) — [apps/server/src/platform/http/http_server.ts:7-14](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L7-L14)
  - **Dimension:** B
  - **Suggestion:** Configure explicit `server.requestTimeout = 30_000` and `server.headersTimeout = 35_000`.
  - **Fix workflow:** Backlog

- [ ] **[ENH-004]** Full Payload Logged at INFO Level by Default in Socket Ingress Middleware — [apps/server/src/platform/socket/socket_logging_middleware.ts:307-317](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L307-L317)
  - **Dimension:** D
  - **Suggestion:** Restrict full request payload logging to `DEBUG` level to reduce production log volume.
  - **Fix workflow:** Backlog

- [ ] **[ENH-005]** Inconsistent Object Deep-Cloning Patterns (`JSON.parse(JSON.stringify)` vs `structuredClone`) — [apps/client/src/features/puzzles/store/local_storage_puzzle_progress.store.ts:110](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/local_storage_puzzle_progress.store.ts#L110)
  - **Dimension:** E
  - **Suggestion:** Standardize on native `structuredClone(toRaw(data))` across client stores.
  - **Fix workflow:** Backlog

- [ ] **[ENH-006]** Redundant Duplicate Implementation of `SystemClock` Across Client and Server — [apps/client/src/platform/time/clock.ts:9-13](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/time/clock.ts#L9-L13) and [apps/server/src/platform/time/clock.ts:9-13](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/time/clock.ts#L9-L13)
  - **Dimension:** E
  - **Suggestion:** Export single `SystemClock` implementation directly from `@fun-chess/shared`.
  - **Fix workflow:** Backlog

- [ ] **[ENH-007]** Missing Forwarding of Session/Auth Token in Client HTTP Layer for Protected Probes — [apps/client/src/platform/api/fetch_api_client.ts:147](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L147) & [apps/server/src/platform/http/controllers/health.controller.ts:54-61](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/health.controller.ts#L54-L61)
  - **Dimension:** F
  - **Suggestion:** Add optional bearer token authentication for accessing unredacted memory stats on `/health/detail`.
  - **Fix workflow:** Backlog

- [ ] **[ENH-008]** Missing E2E Journeys for Theme Persistence, Camera QR Scan, and Keyboard A11y — [apps/e2e/ui/sync.e2e.test.ts:6](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/sync.e2e.test.ts#L6)
  - **Dimension:** G
  - **Suggestion:** Add E2E tests for theme toggling across reloads and keyboard board navigation.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-009]** Missing `engines` Constraints in Workspace Subpackage Manifests — [apps/server/package.json:1](file:///home/irahardianto/works/projects/fun-chess/apps/server/package.json#L1)
  - **Dimension:** G
  - **Suggestion:** Replicate `"engines": { "node": ">=22.0.0", "pnpm": ">=9.0.0" }` into subpackage `package.json` manifests.
  - **Fix workflow:** Direct edit

## Verification Suite Results
- **Linter & Static Analysis:** PASS (ESLint flat config with zero warnings, `--no-inline-config`)
- **Automated Tests:** PASS (170/170 test files, 2,478/2,478 tests passed, 0 failed, 0 skipped)
  - Unit Tests: 161 test files, 2,384 passed
  - Integration Tests: 9 test files, 94 passed
- **Build Verification:** PASS (All workspaces `@fun-chess/shared`, `@fun-chess/server`, `@fun-chess/client` built cleanly)
- **Test Coverage:**
  - Overall Statements: 94.05% (11,485 / 12,211)
  - Overall Branches: 85.27% (8,119 / 9,521)
  - Overall Functions: 93.52% (2,251 / 2,407)
  - Package Breakdown:
    - `@fun-chess/shared`: Statements 97.80%, Branches 85.35%, Functions 99.15%
    - `@fun-chess/server`: Statements 94.98%, Branches 86.37%, Functions 94.60%
    - `@fun-chess/client`: Statements 93.48%, Branches 85.03%, Functions 93.01%

## Cross-Dimension Correlations
Findings that span multiple dimensions, with escalated severity:
1. **Module-Scope Rate Limiting & Config Evaluation (Dim A [MAJOR-001] + Dim C [MINOR-005]):**
   Evaluating `env.RATE_LIMIT_ROOM_CREATE_MAX` in `room.socket_handler.ts` and `game.socket_handler.ts` couples module import to process environment state while creating unmanaged background pruning intervals. Escalated to high-priority **MAJOR**.
2. **Empty Catch Blocks & Silent Failure Suppression (Dim B [MINOR-001] + Dim E [MAJ-002]):**
   `scenario_validator.ts`, `puzzle_validator.ts`, `useChessBoard.ts`, and `chess_engine.ts` use empty `catch {}` or `catch (err) { void err; }` blocks to suppress linter warnings without logging. Per the Rugged Software Constitution, silent failures are forbidden. Escalated from MINOR to **MAJOR [MAJ-017]**.
3. **Server Shutdown Teardown and Telemetry Invariants (Dim B [MAJOR-001] + Dim B [MINOR-002] + Dim D [MINOR-002]):**
   `shutdown_coordinator.ts` contains synchronous exception traps outside `try/catch`, ignores unhandled rejections during shutdown, and mutates operation names across status changes. High-priority **MAJOR** convergence.
4. **HTTP Pipeline Error Logging & Client Response Handling (Dim D [MAJOR-002] + Dim F [MAJOR-001]):**
   The server emits duplicate error logs with mutating operation names while the client `FetchApiClient` drops the structured `HttpErrorEnvelope` and correlation ID, breaking end-to-end operational traceability.
5. **Background Disconnect Abandonment Job (Dim D [MAJOR-001] + Dim G [MINOR-001]):**
   `room.service.ts` and `room.socket_handler.ts` report false-positive success for failed abandonment broadcasts while rethrow paths remain untested.

## Dimensions Covered
| Dimension | Status | Files / Queries Examined |
|---|---|---|
| A. Security & Configuration | ✅ Checked | Audited 52 files: SQL/NoSQL injection, XSS/templates, SSRF, command injection, path traversal, IDOR, secrets (76 git commits via gitleaks), .env sync, startup validation. |
| B. Reliability & Error Handling | ✅ Checked | Audited server shutdown coordinator, room code generation, error categorization, empty catch blocks, unhandled promise rejections, connection timeouts, and resource teardowns. |
| C. Testability & Architecture | ✅ Checked | Analyzed 573 files: dependency cycles, I/O isolation, browser navigation side effects, cross-module boundary violations, `Date.now()` calls, DI wiring, and test doubles. |
| D. Observability & Logging | ✅ Checked | Audited operation logging across all HTTP endpoints, Socket.IO event handlers, background jobs, graceful shutdown, client action dispatchers, and structured context fields. |
| E. Code Quality & Patterns | ✅ Checked | Audited 205 core application source files: cyclomatic complexity, function length, SRP violations, type safety (`any`, `!`), coordinate math duplication, and dead code. |
| F. Integration Contracts & DB | ✅ Checked | Audited 37 files: HTTP contracts, error envelopes, Socket.IO event symmetry (21 events), LocalStorage schema migrations, and Zod vs TypeScript type parity. |
| G. Dependencies & Tests | ✅ Checked | Audited package manifests, pnpm lockfile, Vitest configs, coverage thresholds, unexercised error paths, integration test coverage, and CI workflow jobs. |

## Rules Applied
- `security-mandate.md` / `security-principles.md`
- `rugged-software-constitution.md`
- `error-handling-principles.md`
- `architectural-pattern.md`
- `logging-and-observability-mandate.md`
- `code-organization-principles.md`
- `api-design-principles.md` / `database-design-principles.md`
- `dependency-management-principles.md` / `testing-strategy.md`

## Remediation Action Plan
Findings ranked by priority for resolution:
1. **[MAJ-002]** — Wrap full shutdown sequence in `try/catch/finally` to prevent zombie server processes → `/bugfix`
2. **[MAJ-001]** — Remove module-scope rate limiter and config instantiation in socket handlers → `/bugfix`
3. **[MAJ-012]** — Fix false success reporting and rethrow errors in abandonment background job → `/bugfix`
4. **[MAJ-017]** — Eliminate `void err;` and empty catch blocks across scenario and puzzle validators → `/bugfix`
5. **[MAJ-005]** — Resolve circular dependency between client DI `index.ts` and `helpers.ts` → `/refactor`
6. **[MAJ-006]** — Replace hard `window.location` redirect in `useRoomSession.ts` with navigation event → `/bugfix`
7. **[MAJ-010]** — Remove private `playerIndex` access on `SessionRegistry` in `GameService` → `/bugfix`
8. **[MAJ-022]** — Preserve structured `HttpErrorEnvelope` and correlation ID in `FetchApiClient` → `/bugfix`
9. **[MAJ-023]** — Validate `UnifiedProgressEnvelopeSchema` in `DefaultProgressCodec.decodeFromEnvelopeJson` → `/bugfix`
10. **[MAJ-024]** — Fix schema drift in `ThemeMasteryProgressSchema.theme` using `PuzzleThemeSchema` → `/bugfix`
11. **[MAJ-025]** — Restore 85% branch coverage threshold in `shared/vitest.config.ts` with tests for `game_over.ts` → `/bugfix`
12. **[MAJ-026]** — Add Playwright E2E suite, `vue-tsc`, and linting to `.github/workflows/ci.yml` → `/workflow-solo`
13. **[MAJ-019]** — Decompose 725-line `App.vue` God component into focused feature subcomponents → `/refactor`
14. **[MAJ-020] & [MAJ-021]** — Decompose high cyclomatic complexity functions (`generateProgressiveHint` CC 42, `wrapSocketHandler` CC 37) → `/refactor`
