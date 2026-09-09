# Code Audit: Full Codebase
Date: 2026-09-09
Auditor: AI Code Audit (multi-dimensional, 7 parallel subagents)

## Executive Summary
- **Dimensions activated:** A, B, C, D, E, F, G (All dimensions active)
- **Dimensions skipped:** None
- **Files scanned:** 590 total files (376 non-test source files across `shared`, `apps/server`, `apps/client`, and `apps/e2e`)
- **Findings:** 64 total (5 critical [escalated via cross-dimension correlation], 19 major, 29 minor, 11 enhancement)
- **Automated verification:**
  - Lint: PASS (eslint 10.10.0, 0 errors, 0 warnings across all workspaces)
  - Typecheck: PASS (tsc and vue-tsc passed across all 4 workspaces)
  - Tests: PASS (161 test files passed, 2,259 tests passed, 0 failed)
  - Build: PASS (All packages built successfully; PWA client bundle generated)
  - Coverage: FAIL (Branch coverage threshold 85% unmet: Server 83.35%, Client 80.83%, Shared 85.17%)
- **Overall codebase health:** NEEDS ATTENTION (Strong type coverage and 2,259 passing tests, but branch coverage fails global threshold, and critical concurrency and lifecycle state issues exist in WebSocket room management)

---

## Critical Issues
Vulnerabilities, severe race conditions, or defects that cause state corruption, match abandonment, memory leaks, or unbootable configurations. Escalated via cross-dimension convergence. Must be fixed immediately.

- [ ] **[CRIT-001]** Concurrency Race Condition in `handleDisconnect` Overriding Active Reconnected Sockets — [apps/server/src/features/rooms/room.service.ts:362-415](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L362-L415)
  - **Dimensions:** F (Integration Contracts) + D (Observability & Logging)
  - **Rule Source:** `database-design-principles.md` (State Consistency & Concurrency Control), `logging-and-observability-mandate.md`
  - **Description:** When a player drops socket connection $S_1$ and quickly reconnects on $S_2$, `roomService.reconnect(...)` updates the room under lock, sets `player.socketId = S_2`, sets `player.isConnected = true`, and cancels timers. However, the disconnect event for $S_1$ was queued asynchronously. When `handleDisconnect` runs, it matches the player prior to lock acquisition. Inside `withLock`, `disconnectPlayerTransition` unconditionally marks the player disconnected without checking if `currentPlayer.socketId === socketId`. It arms a 60s abandonment timer that forfeits the reconnected, active player. Compounding this, the timer execution runs a double-nested `runLoggedJob` with conflicting correlation IDs that swallows broadcast errors and misleadingly reports success.
  - **Impact:** Fast reconnections (Wi-Fi/cellular handover, browser reload) cause active matches to pause and unfairly forfeit players 60 seconds later while errors are hidden in telemetry.
  - **Evidence:**
    ```typescript
    // apps/server/src/features/rooms/room.service.ts:372-406
    const match = await this.store.findBySocketId(socketId);
    if (!match) return null;
    return this.store.withLock(matchedRoom.roomCode, async () => {
      const room = await this.store.findByCode(matchedRoom.roomCode);
      const { nextRoom, paused } = disconnectPlayerTransition(room, playerId, now);
      await this.store.save(nextRoom);
      if (paused) {
        const timer = setTimeout(async () => {
          await this.handleAbandonmentForfeit(...);
        }, gracePeriodMs);
        targetTimerRegistry.register(matchedRoom.roomCode, playerId, timer);
      }
    });
    ```
  - **Remediation:** Inside `withLock` in `handleDisconnect`, verify that the player's current `socketId` matches the disconnecting `socketId`. If `currentPlayer.socketId !== socketId`, log a debug message and abort immediately as a stale event. Remove the redundant inner `runLoggedJob` in `onForfeit`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-002]** Zombie Session Token Retention on Player Leave Combined with Sliding TTL Expiry in Long Matches — [apps/server/src/features/rooms/room.service.ts:342-348](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L342-L348) and [apps/server/src/features/game/game.socket_handler.ts:44-75](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.socket_handler.ts#L44-L75)
  - **Dimensions:** A (Security & Configuration) + F (Integration Contracts) + C (Testability & Architecture)
  - **Rule Source:** `security-principles.md` (Session Lifecycle), `database-design-principles.md`, `architectural-pattern.md`
  - **Description:**
    1. In `room.service.ts:leaveRoom`, session tokens are only purged if `shouldDelete` is true (entire room deleted). When a guest leaves, `shouldDelete` is false, leaving the session token active in `sessionRegistry` for the 2-hour TTL, leaking memory.
    2. Conversely, `touchSession` is only ever called during `reconnect`. Neither `GameService` nor `game.socket_handler.ts` interacts with `SessionRegistry`. Matches lasting >2 hours expire in `InMemorySessionRegistry`. A player dropping connection after 2 hours is rejected with `ERR_UNAUTHORIZED` upon reconnecting.
    3. `SessionRegistry` is not wired through `setupDomainServices` in `index.ts` (passed as `undefined`), meaning mock clocks cannot control session expiry during tests.
  - **Impact:** Memory accumulation of zombie session tokens for departed players, coupled with premature lockout of legitimate players in long-running matches.
  - **Evidence:**
    ```typescript
    // apps/server/src/features/rooms/room.service.ts:342-348
    if (shouldDelete) {
      await this.store.delete(normalizedCode);
      await this.sessionRegistry.deleteSessionsForRoom(normalizedCode);
    } else {
      await this.store.save(nextRoom);
      // Missing: await this.sessionRegistry.deleteSessionForPlayer(...)
    }
    ```
  - **Remediation:** In `leaveRoom`, call `deleteSessionForPlayer(normalizedCode, leavingPlayer.id)` when `shouldDelete` is false. Pass `sessionRegistry` into `registerGameSocketHandlers` (or `GameService`) to renew sliding TTL on valid moves. Wire `sessionRegistry` with injected `clock` in `index.ts`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-003]** Eager Module Import of Configuration Loader & Singleton Rate Limiter Bypassing Dependency Injection — [apps/server/src/platform/config/env.ts:184](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L184), [apps/server/src/features/rooms/room.socket_handler.ts:51-54](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L51-L54), [apps/server/src/index.ts:365-367](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L365-L367)
  - **Dimensions:** A (Security & Configuration) + C (Testability & Architecture) + F (Integration Contracts)
  - **Rule Source:** `configuration-management-principles.md`, `architectural-pattern.md` (Rule 3: Dependency Direction)
  - **Description:** `env: ServerEnv = loadServerConfig()` is evaluated eagerly at module load time. `room.socket_handler.ts` statically imports it to construct `roomCreateRateLimiter`. When `startServer({ config })` is executed with overrides, the overrides are ignored. When `shutdownCoordinator` destroys `roomCreateRateLimiter`, its pruning timer is killed. Re-starting the server in the same Node.js process reuses the destroyed rate limiter with dead timers. In addition, independent socket rate limiters are instantiated across room and game handlers instead of sharing a tier limit.
  - **Impact:** Custom configurations cannot be injected cleanly; embedded servers or integration tests re-invoking `startServer` fail or leak dead background intervals; IP rate limiting splits across handlers.
  - **Evidence:**
    ```typescript
    // apps/server/src/features/rooms/room.socket_handler.ts:51-54
    export const roomCreateRateLimiter = createSocketRateLimiter({
      maxRequests: env.RATE_LIMIT_ROOM_CREATE_MAX,
      windowMs: 60_000,
    });
    ```
  - **Remediation:** Remove eager `export const env = loadServerConfig()`. Make config loading explicit at application bootstrap. Instantiate `rateLimiter` and `roomCreateRateLimiter` in `startServer` using the resolved configuration, and pass them down through `setupSocketGateway` into handlers.
  - **Fix workflow:** `/refactor` or `/bugfix`

- [ ] **[CRIT-004]** Stranded Client State on Host Lobby Departure with Loosely Typed Contract and Unchecked Join into Concluded Games — [apps/server/src/features/rooms/room.logic.ts:77-107](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.logic.ts#L77-L107), [shared/src/contracts/events.ts:50-54](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/events.ts#L50-L54), [apps/client/src/features/multiplayer/composables/useRoomSession.ts:196-213](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useRoomSession.ts#L196-L213)
  - **Dimensions:** A (Security & Configuration) + F (Integration Contracts)
  - **Rule Source:** `security-principles.md` (Broken Access Control), `api-design-principles.md` (Explicit Contracts)
  - **Description:**
    1. In `room.logic.ts:addPlayerToRoom`, room capacity is checked but `room.status === "lobby"` is NOT checked. If a player leaves a completed match (`status === "game_over"`), an external client can join via `room:join` and be admitted into a dead game without board reset.
    2. When a host leaves a lobby, the server deletes the room and emits `room:player_left` with `reason: "host_left"`. However, the event in `events.ts` loosely types `reason?: string`, and `useRoomSession.ts` ignores `data.reason`. It merely sets `whitePlayer = null`. The guest is stranded in an orphaned lobby pointing to a deleted room, causing confusing errors on subsequent clicks.
  - **Impact:** Broken access control allowing unauthorized joins into completed games, and stranded guest clients experiencing broken UI state when hosts depart.
  - **Evidence:**
    ```typescript
    // apps/server/src/features/rooms/room.logic.ts:77-80
    if (room.whitePlayer && room.blackPlayer) {
      throw new RoomFullError(room.roomCode);
    }
    // No check for room.status === "lobby"!
    ```
  - **Remediation:** Enforce `if (room.status !== "lobby") throw new GameNotActiveError(...)` in `addPlayerToRoom`. Type `reason: "player_left" | "host_left" | "kicked" | "room_closed"` in `events.ts`. In `useRoomSession.ts`, if `reason === 'host_left' || reason === 'room_closed'`, clear session and redirect to `/multiplayer`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-005]** Empty Catch Blocks Swallowing Filesystem & URI Errors in Critical HTTP / Static Server Pipeline — [apps/server/src/platform/http/http_server.ts:120-126](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L120-L126), [apps/server/src/platform/http/static_handler.ts:54-58](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L54-L58), [apps/server/src/platform/http/static_handler.ts:266-360](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L266-L360)
  - **Dimensions:** B (Reliability & Error Handling) + D (Observability) + E (Code Quality) + G (Dependencies & Tests)
  - **Rule Source:** `error-handling-principles.md` (Rule 1: Never Fail Silently), `logging-and-observability-mandate.md`, `code-organization-principles.md`
  - **Description:** In `http_server.ts`, `resolveClientDistDir()` catches filesystem access check errors with an empty catch block (`// Ignore filesystem access check errors`). In `static_handler.ts`, secondary URI decoding errors during traversal detection are swallowed empty (`// Ignore secondary decoding failure`). In addition, `static_handler.ts` spans 235 lines with cyclomatic complexity 49, three critical 500 error catch blocks have 0% test coverage, and the HTTP request lifecycle mutates `operation` between `"http_request"`, `"http_response"`, `"http_static"`, and `"http_error"`, causing double logging on errors.
  - **Impact:** Zero-tolerance error swallowing policy violated in core HTTP serving; directory traversal probes and filesystem permission issues are hidden; 500 error paths are untested; telemetry metrics are inaccurate.
  - **Evidence:**
    ```typescript
    // apps/server/src/platform/http/http_server.ts:120-125
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Ignore filesystem access check errors and continue
    }
    ```
  - **Remediation:** Replace empty catch blocks with structured debug logs. Standardize the HTTP request `operation` key to `"http_request"`. Add unit tests asserting 500 responses on disk errors. Decompose `serveStaticFile` into smaller single-responsibility helpers.
  - **Fix workflow:** `/bugfix`

---

## Major Issues
Structural violations, test coverage gaps, broken contracts, or high-complexity modules. Fix before release.

- [ ] **[MAJ-001]** Global Branch Coverage Threshold Failure in Server and Client Test Suites — [apps/server/vitest.config.ts:18](file:///home/irahardianto/works/projects/fun-chess/apps/server/vitest.config.ts#L18) & [apps/client/vite.config.ts:156](file:///home/irahardianto/works/projects/fun-chess/apps/client/vite.config.ts#L156)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` (Coverage Requirements: branches 85%)
  - **Description:** `pnpm test:coverage` fails with exit code 1. `@fun-chess/server` achieves only **83.35%** branch coverage, and `@fun-chess/client` achieves only **80.83%** branch coverage against the mandatory 85% threshold. Test doubles located in `src/` (e.g. `mock_room.store.ts` at 65.8% branch coverage) drag down coverage.
  - **Remediation:** Add targeted tests for uncovered branches and add test doubles to `coverage.exclude` in `vitest.config.ts`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-002]** Floating Dependency Version Overrides in Root Manifest Violating Reproducible Build Principles — [package.json:48-49](file:///home/irahardianto/works/projects/fun-chess/package.json#L48-L49)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `dependency-management-principles.md` §Version Pinning
  - **Description:** Root `package.json` contains floating range overrides: `"@vitest/mocker": ">=4.1.11"` and `"vitest": ">=4.1.11"`.
  - **Remediation:** Pin exact versions: `"@vitest/mocker": "4.1.11"` and `"vitest": "4.1.11"`.
  - **Fix workflow:** `/bugfix` or direct edit

- [ ] **[MAJ-003]** Client `createRoom` Ack Response Type Drift & Fragile Local Player Identification — [apps/client/src/features/multiplayer/composables/useRoomSession.ts:374-429](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useRoomSession.ts#L374-L429)
  - **Dimension:** F (Integration Contracts & Database)
  - **Rule Source:** `api-design-principles.md` Rule 1, `shared/src/contracts/events.ts`
  - **Description:** `events.ts` defines `room:create` ack as `{ success: true; room: RoomState; player: Player; sessionToken: string }`. Server returns all 4 fields. However, `useRoomSession.ts` discards `player: Player` from its return type and uses a brittle `res.room.whitePlayer?.socketId === s.id` heuristic, which breaks if socket IDs cycle during setup.
  - **Remediation:** Update `createRoom` return type to include `player: Player` and bind `currentPlayer.value = res.player`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-004]** Explicit `any` Types with Linter Rule Suppression in `useCameraStream.ts` — [useCameraStream.ts:145](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useCameraStream.ts#L145), [eslint.config.js:88-93](file:///home/irahardianto/works/projects/fun-chess/eslint.config.js#L88-L93)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-idioms-and-conventions.md`, `code-review/languages/typescript.md`
  - **Description:** Catch clauses in `useCameraStream.ts` use `firstErr: any`, and `eslint.config.js` disables `@typescript-eslint/no-explicit-any` for this file to force checks to pass.
  - **Remediation:** Remove the file-level lint override. Use `catch (firstErr: unknown)` with `firstErr instanceof Error` type narrowing.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-005]** Unchecked Non-Null Assertions in Async UI Confirmation Dialog Callbacks — [apps/client/src/App.vue:374, 394](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L374-L394)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-review/languages/typescript.md`, `rugged-software-constitution.md`
  - **Description:** `App.vue` invokes `currentRoom.value!.roomCode` inside async `onConfirm` callbacks for resign and leave. If the room becomes null while the dialog is open, this throws an uncaught TypeError.
  - **Remediation:** Add null guard `const activeRoom = currentRoom.value; if (!activeRoom) return;`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-006]** Excessive Cyclomatic Complexity (CC 80) & SRP Violation in `useRovingTabindex` — [apps/client/src/platform/ui/useRovingTabindex.ts:54-277](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/ui/useRovingTabindex.ts#L54-L277)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md` (Functions: CC < 10)
  - **Description:** 224-line composable with cyclomatic complexity 80. Bundles 1D, 2D matrix navigation, DOM focus management, and key listeners with heavily duplicated clamping logic.
  - **Remediation:** Extract pure calculation helpers `getLinearNextIndex` and `getGridNextIndex`. Let composable handle DOM binding only.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-007]** Monolithic Pedagogical and Heuristic Code with Excessive Complexity in `puzzle_analysis_engine.ts` — [apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts:1-1084](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts#L1-L1084)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md`, `core-design-principles.md` (SRP)
  - **Description:** Monolithic 1,084-line engine bundling kid-friendly UI text, raycasting attack geometry, material delta calculation (CC 21), mistake refutation (CC 23), and tactical classification.
  - **Remediation:** Decompose into `geometry/attack_rays.ts`, `eval/material_delta.ts`, `tactics/theme_detector.ts`, and `pedagogy/rules_of_thumb.ts`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-008]** High Cyclomatic Complexity (CC 33) & Multiple Responsibilities in `GameService.makeMove` — [apps/server/src/features/game/game.service.ts:51-223](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L51-L223)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md`, `core-design-principles.md`
  - **Description:** 173-line method with CC 33 combining ingress validation, sequence retransmission, idempotency replay, move application, game-over classification, and check square derivation (duplicated 3 times).
  - **Remediation:** Decompose into private methods: `validateMoveIngress`, `checkIdempotentReplay`, `classifyGameOverOutcome`, `resolveCheckInfo`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-009]** Unwired `ProgressStorage` Dependency and Hardcoded Sibling Feature Instantiation in Unified Portability Store — [apps/client/src/main.ts:38-51](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L38-L51), [apps/client/src/features/portability/store/local_storage_unified.store.ts:176-184](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/store/local_storage_unified.store.ts#L176-L184)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 3: Dependency Direction), `code-organization-principles.md`
  - **Description:** `PROGRESS_STORAGE_KEY` is never provided in `main.ts`. `local_storage_unified.store.ts` constructs a fallback singleton importing concrete stores from `@/features/scenarios` and `@/features/puzzles`. As a result, portability operates on separate instances from those provided in `main.ts`, leading to stale state.
  - **Remediation:** Wire `PROGRESS_STORAGE_KEY` in `main.ts` with injected stores. Remove static singleton creation from `local_storage_unified.store.ts`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-010]** Pure Business Logic Contaminated with Framework and Logging Side Effects in `scenario_validator.ts` — [apps/client/src/features/scenarios/engine/scenario_validator.ts:1-7, 25-31](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/engine/scenario_validator.ts#L1-L7)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 2: Pure Business Logic), `logging-and-observability-mandate.md`
  - **Description:** Documented as pure business logic, `validateStepMove` imports `getCurrentInstance` from Vue and calls `logger.debug` on failures. Pure validators must have zero framework dependencies and zero logging side effects.
  - **Remediation:** Remove Vue and logger imports. Return a structured `{ valid: boolean; reason?: string }` result and perform logging in caller composables.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-011]** Event Listener Leak in Module-Singleton Socket Transport State — [apps/client/src/features/multiplayer/composables/useSocketTransport.ts:68, 834-844](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L68)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Unit Testability Compliance), `resources-and-memory-management-principles.md`
  - **Description:** `resetTransportState()` resets reactive refs but fails to clear `eventSubscribers.clear()`. Handlers registered in prior tests persist in the static map and intercept events in subsequent tests.
  - **Remediation:** Add `eventSubscribers.clear()` to `resetTransportState()`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-012]** Missing Centralized Clock and Time Abstraction in Frontend Architecture — [apps/client/src/platform/di/tokens.ts:21-35](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/di/tokens.ts#L21-L35), [apps/client/src/main.ts:38-51](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L38-L51)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation)
  - **Description:** Unlike the server, the client lacks a centralized `IClock` abstraction in its platform DI container. Stores and composables invoke raw `Date.now()`, preventing deterministic time mocking in unit tests.
  - **Remediation:** Define `CLOCK_KEY` in `tokens.ts`, provide `SystemClock` in `main.ts`, and inject `IClock` into stores.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-013]** Empty Catch Block Suppressing Window Event Listener Teardown in `AppAudioProvider` — [apps/client/src/components/layout/AppAudioProvider.vue:138-143](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/AppAudioProvider.vue#L138-L143)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `error-handling-principles.md` (Rule 1: Never Fail Silently)
  - **Description:** `removeUnlockListeners` catches errors from `window.removeEventListener` with an empty catch block without logging, whereas listener attachment properly logs warnings.
  - **Remediation:** Log listener removal errors via `logger.debug` for parity with attachment.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-014]** Missing Failure Log Point for `server_bootstrap` Lifecycle Operation — [apps/server/src/index.ts:426-435](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L426-L435)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md` (3 mandatory log points)
  - **Description:** When `startServer` encounters a bootstrap error, cleanup routines run and the error is rethrown without emitting a failure log containing the initial `bootstrapCorrelationId` and elapsed duration.
  - **Remediation:** Log `logger.error("Fun Chess server bootstrap failed", { operation: "server_bootstrap", correlationId, duration, error })` in the catch block.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-015]** Silently Swallowed Failure in Rate Limiter Background Pruning Job — [apps/server/src/platform/socket/socket_rate_limiter.ts:70-84, 192-202](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L70-L84)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md`, `error-handling-principles.md`
  - **Description:** `this.prune()` catches iteration errors locally, logs with a detached random UUID, and returns `0`. Consequently, `runLoggedJob` logs the background job as a success (`status: "success"`), hiding eviction failures.
  - **Remediation:** Re-throw the error or pass `correlationId` from `runLoggedJob` into `prune` so failure is recorded accurately.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-016]** Missing Correlation ID Propagation in Emergency Shutdown Handlers — [apps/server/src/platform/lifecycle/shutdown_coordinator.ts:217-236](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L217-L236)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md` (Mandatory context: `correlationId`)
  - **Description:** `uncaughtExceptionHandler` and `serverErrorHandler` generate a correlation ID to log the crash, but call `this.shutdown("uncaughtException")` without passing the ID, causing shutdown logs to generate a disconnected ID.
  - **Remediation:** Pass `correlationId` into `this.shutdown("uncaughtException", correlationId)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-017]** Unexercised Critical Error Path: `RoomCapacityExceededError` Untested in Storage Layer — [apps/server/src/features/rooms/in_memory_room.store.ts:442, 473](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L442)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md`, `rugged-software-constitution.md`
  - **Description:** `InMemoryRoomStore` enforces `this.maxRooms` throwing `RoomCapacityExceededError`. This error path and the error class itself in `room.errors.ts` have 0% test coverage.
  - **Remediation:** Add unit tests asserting `RoomCapacityExceededError` when `maxRooms` limit is reached.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-018]** Untested Storage Adapter Methods on `MockRoomStore` Test Double — [apps/server/src/features/rooms/mock_room.store.ts:159-219](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/mock_room.store.ts#L159-L219)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` §Test Pyramid
  - **Description:** `MockRoomStore` implements `applyGameMove`, `finalizeGame`, `updateDrawOffer`, `updateRematch`, and `clear` with 0% test coverage, creating risk of divergent test behavior.
  - **Remediation:** Add a dedicated test spec or share a contract verification suite across both `InMemoryRoomStore` and `MockRoomStore`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-019]** Unexercised Error Handling Paths in Client Data Sync and Progress Portability — [apps/client/src/features/portability/composables/useProgressSync.ts:230-238, 276-281, 406-415](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useProgressSync.ts#L230-L238)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `rugged-software-constitution.md`, `testing-strategy.md`
  - **Description:** Catch blocks during QR export generation, JSON payload parse errors on import, and merge strategy execution failures have 0% branch test coverage.
  - **Remediation:** Add tests injecting corrupted JSON payloads and failing storage writes to verify `syncError` reactivity.
  - **Fix workflow:** `/bugfix`

---

## Minor Issues
Code maintainability, function length, minor test gaps, and pattern inconsistencies. Fix in near term.

- [ ] **[MIN-001]** Configuration Drift: Undocumented `RATE_LIMIT_ROOM_CREATE_MAX` and Dead `DEFAULT_RATE_LIMIT_MAX_REQUESTS` — [.env.template:62-67](file:///home/irahardianto/works/projects/fun-chess/.env.template#L62-L67)
  - **Dimension:** A | Document `RATE_LIMIT_ROOM_CREATE_MAX=3` in `.env.template` and `.env.example`; remove dead `DEFAULT_RATE_LIMIT_MAX_REQUESTS`.
- [ ] **[MIN-002]** Permissive Wildcard CORS Origin Allowed in Terraform Variables Contrary to Server Production Policy — [infra/terraform/variables.tf:69-71](file:///home/irahardianto/works/projects/fun-chess/infra/terraform/variables.tf#L69-L71)
  - **Dimension:** A | Disallow `*` in Terraform variable validation regex to match server production fail-fast policy.
- [ ] **[MIN-003]** Empty Catch Block Swallowing URL Parse Errors during Cloud Relay Hostname Resolution — [apps/client/src/features/lobby/lobby_url_builder.ts:80-89](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/lobby_url_builder.ts#L80-L89)
  - **Dimension:** B | Add debug logger warning when URL parsing fails in `determineHostForQr()`.
- [ ] **[MIN-004]** Unhandled Canvas Context Acquisition Failure Silently Swallowed in `QrExportView` — [apps/client/src/features/portability/components/QrExportView.vue:58-63](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/components/QrExportView.vue#L58-L63)
  - **Dimension:** B | Surface a reactive error message and fallback download button when 2D canvas context acquisition fails.
- [ ] **[MIN-005]** Silent Exception Swallowing Without Logging in Chess Engine King Square Lookup — [apps/server/src/features/game/chess_engine.ts:303-310](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L303-L310)
  - **Dimension:** B | Log a debug warning when FEN parsing fails instead of masking format errors.
- [ ] **[MIN-006]** Silent Browser Storage Type Access Exception Suppression in `BrowserStorageAdapter` — [apps/client/src/platform/storage/browser_storage_adapter.ts:48-52](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/browser_storage_adapter.ts#L48-L52)
  - **Dimension:** B | Catch `SecurityError` and log storage access denial at debug level before falling back to memory.
- [ ] **[MIN-007]** Cross-Module Boundary Violations via Direct Internal File Imports — Multiple files (e.g. [apps/client/src/features/puzzles/components/PuzzleCompletionModal.vue:4-5](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/components/PuzzleCompletionModal.vue#L4-L5))
  - **Dimension:** C | Import through public barrel `index.ts` files and configure ESLint `no-restricted-imports`.
- [ ] **[MIN-008]** Feature Module Re-Exporting Platform Infrastructure as Domain API in `features/rooms/index.ts` — [apps/server/src/features/rooms/index.ts:28-31](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/index.ts#L28-L31)
  - **Dimension:** C | Remove re-exports of `SystemClock` and `UuidGenerator` from `features/rooms/index.ts`.
- [ ] **[MIN-009]** Bypassed Dependency Injection in Core Client Composables (`useAudio`, `useConfetti`, `useTheme`) — [apps/client/src/composables/useAudio.ts:8-14](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useAudio.ts#L8-L14)
  - **Dimension:** C | Use `useInject*` helpers when running within Vue setup context.
- [ ] **[MIN-010]** Desynchronized Reactive Audio State Models Between Provider and Views — [apps/client/src/components/layout/AppAudioProvider.vue:6-29](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/AppAudioProvider.vue#L6-L29)
  - **Dimension:** C | Consume `useAudioContext()` across feature views to share reactive mute state.
- [ ] **[MIN-011]** Direct Coupling to Third-Party QR Code Libraries Without Service Abstractions — [apps/client/src/features/portability/components/QrExportView.vue:4](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/components/QrExportView.vue#L4)
  - **Dimension:** C | Define `IQrEncoder` and `IQrDecoder` interfaces in platform hardware.
- [ ] **[MIN-012]** Client Core Multiplayer Action Start Logs Suppressed by `DEBUG` Log Level — [apps/client/src/features/multiplayer/composables/useRoomSession.ts:379-383](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useRoomSession.ts#L379-L383)
  - **Dimension:** D | Elevate public user operation start logs from `logger.debug` to `logger.info`.
- [ ] **[MIN-013]** Unstructured String Formatting and Dynamic Interpolation in `chess_factory.ts` — [shared/src/utils/chess_factory.ts:117-138](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/chess_factory.ts#L117-L138)
  - **Dimension:** D | Use static template messages and move dynamic FEN/error values into metadata.
- [ ] **[MIN-014]** Inbound WebSocket Event Handlers Lack 3-Point Mandatory Logging in Client Transport — [apps/client/src/features/multiplayer/composables/useSocketTransport.ts:379-418](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L379-L418)
  - **Dimension:** D | Add timing, correlation propagation, and error logging to `createInboundHandler`.
- [ ] **[MIN-015]** Missing Correlation IDs and Duration in Puzzle Rush Gameplay Lifecycle — [apps/client/src/features/puzzles/composables/usePuzzleRush.ts:127-132](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleRush.ts#L127-L132)
  - **Dimension:** D | Propagate `correlationId` and record `durationMs` across start, solve, and end events.
- [ ] **[MIN-016]** Duplicated King Check Detection Logic in `GameService.makeMove` — [apps/server/src/features/game/game.service.ts:86-97, 133-144, 199-208](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L86-L97)
  - **Dimension:** E | Extract private `resolveCheckInfo(gameState)` helper.
- [ ] **[MIN-017]** Duplicated Algebraic Square Coordinate Math Across 8+ Files — [apps/client/src/features/ai/engine/hint_engine.ts:51](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/engine/hint_engine.ts#L51)
  - **Dimension:** E | Centralize in `@fun-chess/shared/utils/chess_evaluation.ts`.
- [ ] **[MIN-018]** Duplicated Scoped CSS for Screen-Reader Accessibility (`.sr-only`) — [apps/client/src/features/ai/SoloAiArena.vue:623-630](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/SoloAiArena.vue#L623-L630)
  - **Dimension:** E | Remove scoped `.sr-only` overrides and use the global utility in `design-tokens.css`.
- [ ] **[MIN-019]** Inconsistent Logger Acquisition Pattern in Vue Composables (<80% Consistency) — [apps/client/src/features/multiplayer/composables/useRoomSession.ts:64](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useRoomSession.ts#L64)
  - **Dimension:** E | Introduce a unified `resolveLogger()` helper in `platform/di`.
- [ ] **[MIN-020]** Dead Code & Unused Injected Class Properties in Server Services — [apps/server/src/features/rooms/room.service.ts:683](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L683)
  - **Dimension:** E | Remove unused `generateUniqueRoomCode()` and unread `idGenerator` fields.
- [ ] **[MIN-021]** Dead QR Code Generation Methods & Unnecessary Dependency in `RelayAddressService` — [apps/server/src/features/lan/relay_address.service.ts:377-401](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/relay_address.service.ts#L377-L401)
  - **Dimension:** E | Remove unused `generateQrCodeSvg` from server and prune `qrcode` dependency.
- [ ] **[MIN-022]** Duplicated Legal Move Extraction Logic Across Run Composables — [apps/client/src/features/board/useChessBoard.ts:125-140](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/board/useChessBoard.ts#L125-L140)
  - **Dimension:** E | Extract `getLegalTargetSquares(chess, square)` into shared utility.
- [ ] **[MIN-023]** Missing Error Code `"ERR_STALE_LOCK_EXECUTION"` in Shared Union — [shared/src/contracts/errors.ts:4-18](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/errors.ts#L4-L18)
  - **Dimension:** F | Add `"ERR_STALE_LOCK_EXECUTION"` to `ErrorCode` union and eliminate `as unknown as ErrorCode` cast.
- [ ] **[MIN-024]** Server Integration Test Suite Asserts Stale `room:create` Contract — [apps/server/src/__tests__/integration/contracts/socket_lifecycle.contract.spec.ts:70-74](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/__tests__/integration/contracts/socket_lifecycle.contract.spec.ts#L70-L74)
  - **Dimension:** F | Update contract test fixture to assert full 4-field ack payload.
- [ ] **[MIN-025]** Client-Side Redundant Inbound Schemas Bypassing Strict Shared Validation — [apps/client/src/features/multiplayer/composables/useSocketTransport.ts:201-260](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L201-L260)
  - **Dimension:** F | Replace permissive local schemas with authoritative schemas from `@fun-chess/shared`.
- [ ] **[MIN-026]** Workspace Manifest Vitest Version Inconsistency Across Packages — [shared/package.json:25](file:///home/irahardianto/works/projects/fun-chess/shared/package.json#L25)
  - **Dimension:** G | Update `vitest` to `"4.1.11"` across all workspace manifests.
- [ ] **[MIN-027]** Untested Factory Functions and Wrapper Components in Client Puzzles Module — [apps/client/src/features/puzzles/store/index.ts:16-24](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/index.ts#L16-L24)
  - **Dimension:** G | Add unit tests for `createPuzzleProgressStore` and `PuzzleHubView.vue`.
- [ ] **[MIN-028]** Missing End-to-End Test for "Streak Survivor" Tactical Puzzle Mode — [apps/e2e/ui/puzzle.e2e.test.ts:149-228](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/puzzle.e2e.test.ts#L149-L228)
  - **Dimension:** G | Add E2E user journey test for Streak Survivor mode.
- [ ] **[MIN-029]** Missing Mobile Viewport Device Profile in Playwright Configuration — [apps/e2e/playwright.config.ts:28-43](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/playwright.config.ts#L28-L43)
  - **Dimension:** G | Add `Pixel 5` / mobile Chrome device emulation project to Playwright config.

---

## Enhancement Issues
Non-critical suggestions, defense-in-depth, documentation, or minor clarity refactorings.

- [ ] **[ENH-001]** Socket ID Exposure in Public Player Representation — [shared/src/contracts/schemas.ts:74-83](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L74-L83) (Dim A)
- [ ] **[ENH-002]** Absence of Granular URL Format Validation for Individual Origins in `CORS_ORIGIN` — [apps/server/src/platform/config/env.ts:75-84](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L75-L84) (Dim A)
- [ ] **[ENH-003]** Direct Browser Global Access (`matchMedia`, `window.location.search`) in App Composables — [apps/client/src/features/pwa/composables/usePwaInstall.ts:60-69](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/pwa/composables/usePwaInstall.ts#L60-L69) (Dim C)
- [ ] **[ENH-004]** Missing Duration Metric in Security Violation Directory Traversal Warnings — [apps/server/src/platform/http/static_handler.ts:160-165](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L160-L165) (Dim D)
- [ ] **[ENH-005]** Unstructured `console.*` Logging in Dataset Compilation and Verification Tools — [tools/puzzle-generators/validator.mjs:239](file:///home/irahardianto/works/projects/fun-chess/tools/puzzle-generators/validator.mjs#L239) (Dim D)
- [ ] **[ENH-006]** Missing Dedicated `typecheck` Script in `apps/client/package.json` — [apps/client/package.json:6-13](file:///home/irahardianto/works/projects/fun-chess/apps/client/package.json#L6-L13) (Dim E)
- [ ] **[ENH-007]** Convoluted Polymorphic Constructor Signatures in `InMemoryRoomStore` and `PinoLogger` — [apps/server/src/features/rooms/in_memory_room.store.ts:71-123](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L71-L123) (Dim E)
- [ ] **[ENH-008]** Brittle E2E Strike Incurrence Bypassing UI Chess Interaction in `puzzle.e2e.test.ts` — [apps/e2e/ui/puzzle.e2e.test.ts:184-209](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/puzzle.e2e.test.ts#L184-L209) (Dim G)
- [ ] **[ENH-009]** Audio Synthesizer Sound Playback Catch Blocks Unexercised by Unit Tests — [apps/client/src/platform/audio/audio_synthesizer.ts:233-804](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/audio/audio_synthesizer.ts#L233-L804) (Dim G)
- [ ] **[ENH-010]** Unbounded Timer in File Downloader Object URL Revocation — [apps/client/src/platform/hardware/file_downloader.ts:50-55](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/hardware/file_downloader.ts#L50-L55) (Dim B)
- [ ] **[ENH-011]** RTCPeerConnection Event Listener Cleanup on Timeout in `BrowserWebRtcDiscovery` — [apps/client/src/platform/hardware/webrtc_discovery.ts:36-48](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/hardware/webrtc_discovery.ts#L36-L48) (Dim B)

---

## Verification Suite Results
- **Linter & Static Analysis:** PASS (eslint 10.10.0, 0 errors, 0 warnings across all 4 packages)
- **Automated Tests:** PASS (161 test files passed, 2,259 tests passed, 0 failed)
  - Unit tests: 152 test files passed, 2,165 tests passed
  - Integration tests: 9 test files passed, 94 tests passed
- **Build Verification:** PASS (Full monorepo build succeeded; Vite PWA bundle built with workbox service worker)
- **Test Coverage:** FAIL (Branch threshold: 85%)
  - `@fun-chess/shared`: Statements 97.78%, Branches 85.17%, Functions 99.15%, Lines 98.59% (PASS)
  - `@fun-chess/server`: Statements 90.82%, Branches 83.35%, Functions 89.01%, Lines 91.38% (FAIL)
  - `@fun-chess/client`: Statements 93.63%, Branches 80.83%, Functions 91.43%, Lines 94.75% (FAIL)

---

## Cross-Dimension Correlations
Findings from multiple dimensions that converged on common modules, resulting in escalated severity:

1. **Room Disconnect & Reconnect Concurrency Race Condition** (Escalated to **CRITICAL**):
   - Dimension F discovered that stale disconnect events match rooms before acquiring mutexes, overwriting reconnected active players as disconnected and forfeiting them.
   - Dimension D discovered that the disconnect timer runs double-nested `runLoggedJob` with conflicting correlation IDs, swallows socket broadcast errors, and emits false success logs.
   - Dimension D discovered missing completion and latency metrics on socket disconnects.
2. **Zombie Session Retention & Premature Token Expiry** (Escalated to **CRITICAL**):
   - Dimension A identified that guest departures never purge session tokens from `InMemorySessionRegistry`, leaking memory.
   - Dimension F revealed that `touchSession` is never invoked during gameplay, causing valid player sessions to expire after 2 hours and permanently locking out reconnecting players.
   - Dimension C discovered that `setupDomainServices` does not wire `sessionRegistry` with injected clocks, precluding testability.
3. **Static Environment Config Import & Stateful Rate Limiter Leak** (Escalated to **CRITICAL**):
   - Dimension A found that module-singleton rate limiters ignore injected server options and break on process restart.
   - Dimension C discovered top-level eager execution in `env.ts` violating dependency direction.
   - Dimension F found duplicate rate limiter instances across room and game handlers.
4. **Room Lifecycle State Machine Drift & Orphaned Guests** (Escalated to **CRITICAL**):
   - Dimension F identified loosely typed `room:player_left` contracts stranding guests in ghost lobbies when hosts leave.
   - Dimension A found missing room status validation in `addPlayerToRoom` allowing clients to join concluded games.
5. **HTTP Server Pipeline Error Swallowing & High Complexity** (Escalated to **CRITICAL**):
   - Dimension B flagged zero-tolerance empty catch blocks swallowing filesystem and URI errors.
   - Dimension D flagged mutating `operation` keys (`http_request` vs `http_response` vs `http_error`) causing double-logging.
   - Dimension E identified excessive cyclomatic complexity (CC 49) in `serveStaticFile`.
   - Dimension G found 0% test coverage on 500 error catch blocks.

---

## Dimensions Covered
| Dimension | Status | Files / Queries Examined |
|---|---|---|
| A. Security & Configuration | ✅ Checked | 164 files scanned for injection, XSS, SSRF, IDOR, path traversal, gitleaks (74 commits clean), .env completeness, CORS validation |
| B. Reliability & Error Handling | ✅ Checked | 184 files scanned for swallowed errors, empty catch blocks, resource leaks, timeouts, graceful degradation |
| C. Testability & Architecture | ✅ Checked | 590 files scanned for I/O isolation, pure business logic, dependency direction, DI wiring, circular dependencies, barrel boundaries |
| D. Observability & Logging | ✅ Checked | 90 files scanned for operation entry point logging, 3 mandatory log points, correlation IDs, structured formatting, log levels |
| E. Code Quality & Patterns | ✅ Checked | 135 files scanned for SRP violations, cyclomatic complexity (>10), function length (>50), DRY threshold, dead code, typing |
| F. Integration Contracts & DB | ✅ Checked | 184 files scanned for cross-boundary API alignment, socket events, in-memory store concurrency, state machine transitions, session TTL |
| G. Dependencies & Tests | ✅ Checked | 124 files scanned for dependency health, unpinned versions, lockfiles, CVEs, test pyramid ratios, branch coverage gaps, E2E paths |

---

## Rules Applied
- `security-mandate.md` / `security-principles.md`
- `rugged-software-constitution.md`
- `error-handling-principles.md`
- `architectural-pattern.md`
- `logging-and-observability-mandate.md`
- `code-organization-principles.md`
- `core-design-principles.md`
- `api-design-principles.md` / `database-design-principles.md`
- `dependency-management-principles.md` / `testing-strategy.md`

---

## Remediation Action Plan
Findings ranked by priority for resolution:

1. **[CRIT-001]** Fix stale disconnect race condition in `RoomService.handleDisconnect` by validating `currentPlayer.socketId === socketId` inside `withLock`, and remove inner nested `runLoggedJob` → `/bugfix`
2. **[CRIT-002]** Delete leaving player session tokens in `RoomService.leaveRoom`, touch session sliding TTL on valid moves in `GameService`, and wire `SessionRegistry` with injected clock in `index.ts` → `/bugfix`
3. **[CRIT-003]** Eliminate eager evaluation of `env.ts`, inject rate limiters through `startServer`, and share a unified socket rate limiter instance → `/bugfix` or `/refactor`
4. **[CRIT-004]** Validate `room.status === "lobby"` in `addPlayerToRoom`, type `reason` enum in `events.ts`, and handle host departure redirection in `useRoomSession.ts` → `/bugfix`
5. **[CRIT-005]** Replace empty catch blocks with structured debug logging in `http_server.ts` and `static_handler.ts`, standardize HTTP operation names, and decompose static file serving → `/bugfix`
6. **[MAJ-001]** Address branch coverage deficit in server (83.35%) and client (80.83%) by writing tests for uncovered branches and excluding test doubles from coverage → `/bugfix`
7. **[MAJ-002]** Pin exact versions for Vitest overrides in root `package.json` → `/bugfix`
8. **[MAJ-003]** Fix `createRoom` return type to include `player: Player` and bind `currentPlayer.value = res.player` directly → `/bugfix`
9. **[MAJ-004]** Remove linter override for `useCameraStream.ts` in `eslint.config.js` and properly narrow unknown error types → `/bugfix`
10. **[MAJ-005]** Guard against null `currentRoom.value` in async dialog confirmations in `App.vue` → `/bugfix`
11. **[MAJ-006] - [MAJ-008]** Decompose high-complexity functions in `useRovingTabindex`, `puzzle_analysis_engine.ts`, and `GameService.makeMove` → `/refactor`
12. **[MAJ-009] - [MAJ-012]** Wire `PROGRESS_STORAGE_KEY` and client `IClock` in `main.ts`, purify `scenario_validator.ts`, and clear event subscribers on transport reset → `/refactor`
13. **[MAJ-013] - [MAJ-019]** Fix logging, error paths, and untested capacity errors across server and client → `/bugfix`
14. **[MIN-001] - [MIN-029]** Address configuration drift, barrel imports, duplicated code, and test coverage gaps → `/bugfix`
