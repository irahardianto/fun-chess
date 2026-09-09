# Code Audit: Fun-Chess Monorepo
Date: 2026-09-09
Auditor: AI Code Audit (multi-dimensional, 7 parallel subagents)

## Executive Summary
- **Dimensions activated:** A (Security & Configuration), B (Reliability & Error Handling), C (Testability & Architecture), D (Observability & Logging), E (Code Quality & Patterns), F (Integration Contracts & Stores), G (Dependencies & Test Coverage Gaps)
- **Dimensions skipped:** None (full codebase scope across `shared`, `apps/server`, `apps/client`, `apps/e2e`, and `infra`)
- **Files scanned:** 565 files audited across all workspaces
- **Findings:** 94 total (3 critical, 44 major, 33 minor, 14 enhancement)
- **Automated verification:** Lint: PASS (0 errors, 804 warnings) | Typecheck: PASS (4/4 packages) | Tests: PASS (2,090 passed: 2,028 unit, 62 integration, 0 failed) | Build: PASS | Coverage: ~91%+
- **Overall codebase health:** NEEDS ATTENTION (test suite and builds are clean, but critical background timer crashes, container asset paths, and architectural leaks require immediate remediation)

---

## Critical Issues
Vulnerabilities or severe defects that cause active security breaches, data loss, application crashes, or system compromise. Must be fixed immediately.

- [ ] **[CRIT-001]** Unhandled Promise Rejection in Background Abandonment Grace Timer Callback — [`apps/server/src/features/rooms/room.service.ts:396-408`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L396-L408)
  - **Dimension:** B (Reliability) & D (Observability) [Cross-Dimension Convergence]
  - **Rule Source:** `.agents/rules/error-handling-principles.md` (Principle 1: Never Fail Silently, Principle 2: Fail Fast), `.agents/rules/logging-and-observability-mandate.md`
  - **Description:** An asynchronous callback (`async () => { ... }`) is scheduled via `setTimeout` to process match abandonment when a disconnected player fails to reconnect within `gracePeriodMs`. Inside this callback, `await this.handleAbandonmentForfeit(...)` and `await onForfeit(...)` are executed without any `try/catch` wrapper, and the background task is unlogged.
  - **Impact:** If `handleAbandonmentForfeit` fails (e.g. lock acquisition timeout, store mutation error, or socket emit failure in `onForfeit`), the unhandled rejection crashes the Node.js server process in production.
  - **Evidence:**
    ```typescript
    const timer = setTimeout(async () => {
      targetTimerRegistry.cancel(matchedRoom.roomCode, playerId);
      if (targetTimerRegistry !== this.timerRegistry) {
        this.timerRegistry.cancel(matchedRoom.roomCode, playerId);
      }
      const forfeitResult = await this.handleAbandonmentForfeit(
        matchedRoom.roomCode,
        playerId,
      );
      if (forfeitResult && onForfeit) {
        await onForfeit(forfeitResult.room, forfeitResult.gameOverPayload);
      }
    }, gracePeriodMs);
    ```
  - **Remediation:** Wrap the body of the timer callback in `try/catch` and execute within `runLoggedJob(logger, "disconnect_grace_period_abandonment", ...)`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-002]** Orphaned Lock Action on Execution Timeout Leading to Unhandled Promise Rejection — [`apps/server/src/features/rooms/in_memory_room.store.ts:304-321`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L304-L321)
  - **Dimension:** B (Reliability), C (Architecture), & D (Observability) [Cross-Dimension Convergence]
  - **Rule Source:** `.agents/rules/resources-and-memory-management-principles.md` (Rule 1: Always Clean Up Resources), `.agents/rules/error-handling-principles.md` (Principle 1)
  - **Description:** In `withLock`, an execution race is established between `actionPromise` and `executionTimeoutPromise` via `Promise.race([actionPromise, executionTimeoutPromise])`. If `executionTimeoutPromise` triggers, `Promise.race` rejects with `LockExecutionTimeoutError` and releases the room lock. However, the orphaned `actionPromise` remains executing in the event loop without any attached rejection handler. When `actionPromise` completes its async work and subsequently executes `this.assertTicketValid(code, context)` on line 386, `assertTicketValid` detects that the ticket was invalidated and throws `StaleLockExecutionError`. Because `actionPromise` was abandoned by `Promise.race` and has no `.catch()` handler attached, this thrown exception becomes an unhandled promise rejection.
  - **Impact:** Any long-running or timed-out lock action that throws after the 5000ms execution timeout causes an unhandled promise rejection, threatening server stability.
  - **Evidence:**
    ```typescript
    const actionPromise = this.lockContextStorage.run(context, () => action(context));
    return await Promise.race([actionPromise, executionTimeoutPromise]);
    ```
  - **Remediation:** Attach an error suppression `.catch()` handler to `actionPromise` before the race to absorb post-timeout rejections.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-003]** Docker Production Container Static Asset Delivery Broken due to Relative `distPath` Path Resolution — [`apps/server/src/platform/http/http_server.ts:191`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L191), [`Dockerfile:39-59`](file:///home/irahardianto/works/projects/fun-chess/Dockerfile#L39-L59), [`docker-compose.yml:8-20`](file:///home/irahardianto/works/projects/fun-chess/docker-compose.yml#L8-L20)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `.agents/rules/configuration-management-principles.md` ("Fail Fast on Missing Configuration"), `.agents/rules/rugged-software-constitution.md`
  - **Description:** In `createHttpServer`, when `config.distPath` and `config.env?.CLIENT_DIST_PATH` are not provided, `distPath` defaults to `path.resolve(process.cwd(), "../client/dist")`. In the production container defined by `Dockerfile` (`WORKDIR /app`), `process.cwd()` is `/app`. Therefore, `path.resolve("/app", "../client/dist")` resolves to `/client/dist`. However, the client files are placed at `/app/apps/client/dist`. Neither `Dockerfile`, `docker-compose.yml`, nor Terraform config sets `CLIENT_DIST_PATH`.
  - **Impact:** In containerized production deployments, `distPath` points to a non-existent directory. All requests to the SPA root `/` or client static assets fail to find assets on disk, falling back to 404 or inline fallback HTML. The SPA web application is completely broken in production containers.
  - **Evidence:**
    ```typescript
    distPath = config.distPath ?? config.env?.CLIENT_DIST_PATH ?? path.resolve(process.cwd(), "../client/dist")
    ```
    vs `Dockerfile`:
    ```dockerfile
    WORKDIR /app
    COPY --chown=node:node --from=builder /app/apps/client/dist ./apps/client/dist
    ```
  - **Remediation:** Set `ENV CLIENT_DIST_PATH=/app/apps/client/dist` in `Dockerfile`, pass `CLIENT_DIST_PATH` in `docker-compose.yml`, and add candidate path fallback checks in `http_server.ts`.
  - **Fix workflow:** `/bugfix` — immediate priority

---

## Major Issues
Structural violations, missing I/O error handling, untested critical paths, or broken contracts. Must be fixed before release.

- [ ] **[MAJ-001]** Path Traversal Defense Lacks Filesystem Canonicalization (`realpath`) on Symlinks — [`apps/server/src/platform/http/static_handler.ts:45-102`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L45-L102), [`apps/server/src/platform/http/file_storage.ts:16-28`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/file_storage.ts#L16-L28)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `.agents/rules/security-mandate.md`, `.agents/rules/security-principles.md` (CWE-59 / CWE-22)
  - **Description:** Lexical path normalization checks exist in `checkPathTraversal`, but no filesystem canonicalization (`fs.realpath`) or symlink inspection (`fs.lstat`) is performed before calling `fs.readFile`. Any symlink inside the web root pointing outward bypasses lexical checks.
  - **Impact:** Potential arbitrary file read outside the static root if symlinks exist in the distribution directory.
  - **Remediation:** Resolve canonical path via `await fs.realpath(targetFilePath)` and verify it starts with `await fs.realpath(rootDir)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-002]** Unhandled Room Deletion on Host Leave in Lobby Causing Ghost Room Deadlock for Guest — [`apps/server/src/features/rooms/room.socket_handler.ts:218-230`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L218-L230), [`apps/server/src/features/rooms/room.logic.ts:288-299`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.logic.ts#L288-L299)
  - **Dimension:** F (Integration Contracts)
  - **Rule Source:** `.agents/rules/api-design-principles.md` (Lifecycle event notifications)
  - **Description:** When host leaves during the lobby phase, `result.shouldDelete` evaluates to `true`. Server deletes the room and sessions, but skips emitting any socket events (`room:player_left`) to the guest sitting in the room.
  - **Impact:** Guest is stranded in a ghost lobby indefinitely. Subsequent actions fail with `ERR_ROOM_NOT_FOUND`.
  - **Remediation:** In `room.socket_handler.ts`, broadcast `room:player_left` to `socket.to(roomCode)` when `result.shouldDelete` is true before clearing the room.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-003]** Client-Side Ingress Schema Bypass of `idempotencyKey` UUID Requirement Causing Server Validation Rejection — [`apps/client/src/features/multiplayer/composables/useGameActions.ts:272-288`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useGameActions.ts#L272-L288), [`shared/src/contracts/schemas.ts:271`](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L271)
  - **Dimension:** F (Integration Contracts)
  - **Rule Source:** `.agents/rules/data-serialization-and-interchange-principles.md`
  - **Description:** `useGameActions.ts` catches schema validation failure on non-UUID `idempotencyKey` and forcibly overrides `validationResult` via `as any`. When sent over WebSocket, server's strict `MakeMoveRequestSchema.safeParse` rejects it with `ERR_INVALID_PAYLOAD`.
  - **Impact:** Moves with non-UUID idempotency tokens silently drop on server ingress.
  - **Remediation:** Ensure clients only generate UUIDs or update `MakeMoveRequestSchema` in shared to accept `z.string().min(1).max(64).optional()`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-004]** Broken Socket Reconnection Lifecycle in Client: Inactive `isReconnecting` State & Misplaced Manager Listener — [`apps/client/src/features/multiplayer/composables/useSocketTransport.ts:41, 526, 555`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L41)
  - **Dimension:** F (Integration Contracts)
  - **Rule Source:** `.agents/rules/api-design-principles.md`
  - **Description:** `isReconnecting` is never set to `true` anywhere in `useSocketTransport.ts`. Also, `reconnect_failed` is attached to `socket` instead of `socket.io` (Manager) as required by Socket.IO client v4.
  - **Impact:** UI cannot observe reconnection state; disconnect banners/recovery modals never trigger.
  - **Remediation:** Listen on `s.io` for `reconnect_attempt` (setting `isReconnecting = true`) and `reconnect_failed` (handling terminal failure).
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-005]** Duplicate and Divergent `OptimisticLockConflictError` Class Definitions Across Package Boundaries — [`shared/src/contracts/errors.ts:204-213`](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/errors.ts#L204-L213), [`apps/server/src/features/rooms/room.errors.ts:52-61`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.errors.ts#L52-L61)
  - **Dimension:** F (Integration Contracts) & C (Architecture)
  - **Rule Source:** `.agents/rules/code-organization-principles.md` (Single source of truth)
  - **Description:** Independent definitions of `OptimisticLockConflictError` in `@fun-chess/shared` and `room.errors.ts` have different prototype identities.
  - **Impact:** Cross-module `err instanceof OptimisticLockConflictError` checks evaluate to `false`, treating concurrency conflicts as uncaught 500 internal errors.
  - **Remediation:** Deduplicate by re-exporting `OptimisticLockConflictError` directly from `@fun-chess/shared`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-006]** Global Shared Rate Limiter Allows Room Creation Resource Exhaustion (Denial of Service) — [`apps/server/src/features/rooms/room.socket_handler.ts:49, 99`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L49-L99), [`apps/server/src/features/rooms/in_memory_room.store.ts:35, 454-456`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L35-L456)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `.agents/rules/security-mandate.md`, `.agents/rules/rugged-software-constitution.md` (CWE-400)
  - **Description:** Server applies a single uniform rate limiter (60 req/10s per IP) across all operations. `InMemoryRoomStore` caps rooms at 10,000. A single untrusted client can spam `room:create` at 6 ops/sec, filling all 10,000 room slots in under 30 minutes.
  - **Impact:** Complete denial of service for room creation worldwide until the 10-minute idle room cleanup runs.
  - **Remediation:** Implement differential rate limiting (max 3 rooms created per minute per IP), while keeping 60 req/10s for active moves.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-007]** Programmatic `server.close()` Missing Timeout and Indefinite Hang Risk — [`apps/server/src/index.ts:365-415`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L365-L415)
  - **Dimension:** B (Reliability)
  - **Rule Source:** `.agents/rules/resources-and-memory-management-principles.md` (Rule 2: Timeout All I/O Operations)
  - **Description:** The `close()` function returned by `startServer()` awaits `io.close()` and `server.close()` without timeout bounds or calling `closeAllConnections()`.
  - **Impact:** Active keep-alive connections or hanging sockets block process termination indefinitely in programmatic test and deployment environments.
  - **Remediation:** Add 5000ms timeout race and call `closeAllConnections()`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-008]** Swallowed Teardown Errors in Programmatic Server Close — [`apps/server/src/index.ts:381, 390`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L381)
  - **Dimension:** B (Reliability)
  - **Rule Source:** `.agents/rules/error-handling-principles.md` (Principle 1: Never Fail Silently)
  - **Description:** Callbacks passed to `io.close(...)` and `server.close(...)` disregard `err`, unconditionally resolving.
  - **Impact:** Port release and teardown failures are masked.
  - **Remediation:** Reject promise or log error if `err` is passed to callback.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-009]** Missing Cleanup on Server Bootstrap Failure Leaks Intervals and Process Listeners — [`apps/server/src/index.ts:264-332`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L264-L332)
  - **Dimension:** B (Reliability)
  - **Rule Source:** `.agents/rules/resources-and-memory-management-principles.md` (Rule 1: Always Clean Up Resources)
  - **Description:** If `server.listen()` throws, `cleanupInterval` and process handlers remain registered.
  - **Impact:** Leaks intervals and process listeners on failed startup.
  - **Remediation:** Wrap startup in `try/catch` and clean up `cleanupInterval` and rate limiters on failure.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-010]** Process Event Listener Leak in ShutdownCoordinator — [`apps/server/src/platform/lifecycle/shutdown_coordinator.ts:188-226`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L188-L226)
  - **Dimension:** B (Reliability)
  - **Rule Source:** `.agents/rules/resources-and-memory-management-principles.md` (Rule 4: Avoid Resource Leaks)
  - **Description:** `installProcessHandlers()` attaches `SIGINT`, `SIGTERM`, `unhandledRejection`, etc., without providing an `uninstallProcessHandlers()` or `dispose()` method.
  - **Impact:** Causes `MaxListenersExceededWarning` and memory leaks across test suites and server restarts.
  - **Remediation:** Retain references and provide `dispose()` / `uninstallProcessHandlers()`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-011]** Resource Leak via Default Argument Instantiation of `SocketRateLimiter` — [`apps/server/src/features/game/game.socket_handler.ts:38`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.socket_handler.ts#L38)
  - **Dimension:** B (Reliability) & D (Observability)
  - **Rule Source:** `.agents/rules/resources-and-memory-management-principles.md`
  - **Description:** `rateLimiter: SocketRateLimiter = createSocketRateLimiter()` in function signature instantiates a new 60-second periodic timer on every invocation.
  - **Impact:** Unbounded timer leak if invoked without explicit rate limiter.
  - **Remediation:** Use module-level singleton default matching `room.socket_handler.ts`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-012]** Missing `finally` Block in Legacy Clipboard Fallback Leaks DOM Elements — [`apps/client/src/platform/hardware/clipboard.interface.ts:66-85`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/hardware/clipboard.interface.ts#L66-L85)
  - **Dimension:** B (Reliability)
  - **Rule Source:** `.agents/rules/error-handling-principles.md` (Principle 5: Resource Cleanup)
  - **Description:** `document.body.removeChild(textarea)` is placed outside `finally`. If clipboard execution throws, the textarea remains permanently attached to `document.body`.
  - **Impact:** DOM node leak on clipboard copy failures.
  - **Remediation:** Move removal to `finally` block.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-013]** Unhandled `os.networkInterfaces()` Call in Host Addressing Service — [`apps/server/src/features/lan/relay_address.service.ts:192`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/relay_address.service.ts#L192)
  - **Dimension:** B (Reliability)
  - **Rule Source:** `.agents/rules/error-handling-principles.md`
  - **Description:** `os.networkInterfaces()` called directly without `try/catch`. Restricted environments (e.g. strict container sandboxes) can throw `UV_ENOBUFS` or `EPERM`.
  - **Impact:** Crashing bootstrap or 500 errors on `/health` and `/api/lan-info`.
  - **Remediation:** Wrap in `try/catch` with fallback to `['127.0.0.1']`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-014]** Premature Synchronous `URL.revokeObjectURL` Aborts Browser File Download Stream — [`apps/client/src/platform/hardware/file_downloader.ts:46-53`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/hardware/file_downloader.ts#L46-L53)
  - **Dimension:** B (Reliability)
  - **Rule Source:** `.agents/rules/resources-and-memory-management-principles.md`
  - **Description:** `URL.revokeObjectURL(url)` is invoked synchronously in the same tick immediately after `link.click()`.
  - **Impact:** Browser download stream can abort, resulting in 0-byte downloaded save files.
  - **Remediation:** Defer `URL.revokeObjectURL` via `setTimeout(..., 1000)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-015]** Infrastructure Storage Adapter Implements Domain Service Adapter & Duplicates Business Logic — [`apps/server/src/features/rooms/in_memory_room.store.ts:10`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L10), [`apps/server/src/index.ts:136`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L136)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Rule 1: I/O Isolation & Rule 3: Dependency Direction)
  - **Description:** `InMemoryRoomStore` implements `IRoomGameAdapter`, embedding domain gameplay logic (`applyGameMove`, `finalizeGame`). In `index.ts`, `GameService` is injected with `roomStore` directly rather than `roomService`.
  - **Impact:** Couples domain service to infrastructure adapter; violates SRP and dependency inversion.
  - **Remediation:** Confine `InMemoryRoomStore` strictly to `RoomStore`. Inject `roomService` into `GameService`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-016]** Client Feature Modules Systematically Bypass Vue DI Tokens and Hardcode Platform Singletons — [`apps/client/src/main.ts:39-50`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L39-L50), [`apps/client/src/features/`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Rule 3: Dependency Direction)
  - **Description:** 24+ feature composables and components bypass Vue DI tokens and import singletons directly from `@/platform/telemetry`, `@/platform/storage`, and `@/platform/api`.
  - **Impact:** Prevents clean mock injection in component and unit testing.
  - **Remediation:** Consume dependencies via injection helpers (`useInjectLogger()`, `useInjectStorage()`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-017]** Direct Unabstracted Hardware & DOM I/O in `QrCodeModal.vue` — [`apps/client/src/features/lobby/QrCodeModal.vue:253-267`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/QrCodeModal.vue#L253-L267)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Rule 1: I/O Isolation)
  - **Description:** Bypasses `IClipboardService` and directly manipulates `navigator.clipboard` and `document.createElement('textarea')`.
  - **Impact:** Forces tests to stub global browser objects, risking cross-test contamination.
  - **Remediation:** Inject and use `IClipboardService`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-018]** Direct Session Storage Read Bypasses `KeyValueStorage` Abstraction in `useRoomSession.ts` — [`apps/client/src/features/multiplayer/composables/useRoomSession.ts:84-86`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useRoomSession.ts#L84-L86)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Rule 1: I/O Isolation)
  - **Description:** `getSavedSession` queries `window.sessionStorage` directly, ignoring the abstracted `storage` adapter.
  - **Impact:** Custom or mock storage instances are bypassed in tests.
  - **Remediation:** Read strictly through `storage.getItem(SESSION_STORAGE_KEY)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-019]** Non-Deterministic Time and Impure Default Parameters Across Pure Logic & Stores — [`apps/server/src/features/game/chess_engine.ts:98`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L98), [`shared/src/utils/dictionary_mapper.ts:40`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/dictionary_mapper.ts#L40), [`apps/client/src/features/puzzles/store/local_storage_puzzle_store.ts:116`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/local_storage_puzzle_store.ts#L116)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Rule 1 & Rule 2: Pure Business Logic)
  - **Description:** Pure calculation and transformation routines hardcode or default to `Date.now()`.
  - **Impact:** Non-deterministic test outcomes and inability to perform repeatable replay simulations.
  - **Remediation:** Mandate explicit timestamp parameters on pure functions and inject `IClock` into stores.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-020]** Incomplete Randomness Abstraction in `IIdGenerator` Causes Fallback to Concrete `node:crypto.randomInt` in `RoomService` — [`shared/src/contracts/system.ts:17`](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/system.ts#L17), [`apps/server/src/features/rooms/room.service.ts:91-96, 644-646`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L91-L96)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Rule 1: I/O Isolation)
  - **Description:** `IIdGenerator.generateRandomInt?` is optional; `RoomService` falls back to `node:crypto.randomInt`.
  - **Impact:** Non-deterministic room code collisions and color allocations during tests.
  - **Remediation:** Make `generateRandomInt` required on `IIdGenerator`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-021]** Technical Socket Handler Utility Placed in `features/common` Without Barrel Export and Deep-Imported Across Slices — [`apps/server/src/features/common/socket_handler.utils.ts:1`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/common/socket_handler.utils.ts#L1)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `.agents/rules/project-structure.md`, `.agents/rules/code-organization-principles.md`
  - **Description:** Technical infrastructure placed in `features/common` without `index.ts`, cross-imported deep by other feature slices.
  - **Impact:** Breaks vertical slice boundary architecture.
  - **Remediation:** Move to `apps/server/src/platform/socket/` or provide proper public barrel.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-022]** Unlogged Periodic Rate Limiter Key Pruning Background Job Under Default Configuration — [`apps/server/src/features/rooms/room.socket_handler.ts:49`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L49), [`apps/server/src/platform/socket/socket_rate_limiter.ts:68-81`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L68-L81)
  - **Dimension:** D (Observability)
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md`
  - **Description:** `SocketRateLimiter` prune timer executes unlogged when `logger` is undefined in default instances.
  - **Impact:** Unobserved background memory reclamation.
  - **Remediation:** Mandate logger passing or default to `defaultLogger`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-023]** Missing `userId` Context Across All Socket Gameplay Operations Due to Unpopulated `socket.data.userId` — [`apps/server/src/platform/socket/socket_logging_middleware.ts:109`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L109), [`apps/server/src/features/rooms/room.socket_handler.ts:113`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L113)
  - **Dimension:** D (Observability)
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md`
  - **Description:** `socket.data.userId` is never set during room creation, join, or reconnect. All subsequent game actions omit `userId` in logs.
  - **Impact:** Gameplay logs lack mandatory user context.
  - **Remediation:** Set `socket.data.userId = result.player.id` upon room join/create/reconnect.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-024]** Dynamic String Interpolation in Log Messages Violating Invariant Message Template Mandate — [`apps/client/src/features/multiplayer/composables/useSocketTransport.ts:306, 654`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L306), [`apps/server/src/platform/lifecycle/shutdown_coordinator.ts:77`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L77)
  - **Dimension:** D (Observability)
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md` (Structured logging only)
  - **Description:** Interpolates dynamic variables into log messages rather than using static strings with structured context.
  - **Impact:** High message cardinality prevents log aggregators from grouping events.
  - **Remediation:** Use static message templates and move variables to context objects.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-025]** Direct Raw `console.*` Calls Bypassing Structured Telemetry Logger in Client Modules — [`apps/client/src/features/multiplayer/composables/useGameActions.ts:121`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useGameActions.ts#L121), [`apps/client/src/features/multiplayer/composables/useRoomSession.ts:104`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useRoomSession.ts#L104), [`apps/client/src/platform/storage/storage_alert.ts:58`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/storage_alert.ts#L58)
  - **Dimension:** D (Observability) & C (Architecture) [Cross-Dimension Convergence]
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md`
  - **Description:** Raw `console.warn` and `console.error` calls bypass correlation IDs, log level filters, and PII scrubbing.
  - **Impact:** Unstructured log noise in browser consoles; unobservable in telemetry.
  - **Remediation:** Replace with structured logger invocations.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-026]** Silenced Production Background Job Failure via DEBUG Log Level in `room_cleanup` Rejection — [`apps/server/src/index.ts:273-279`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L273-L279)
  - **Dimension:** D (Observability)
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md`
  - **Description:** Rejection of periodic room cleanup job is logged at `logger.debug`, which is suppressed in production.
  - **Impact:** Silent accumulation of abandoned rooms and memory leaks.
  - **Remediation:** Log at `logger.error` with stack trace and correlation ID.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-027]** Unlogged State Store Mutations and Concurrency Starvation Due to Uninjected Store Logger — [`apps/server/src/index.ts:126`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L126), [`apps/server/src/features/rooms/in_memory_room.store.ts:82, 284, 310`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L82)
  - **Dimension:** D (Observability)
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md`
  - **Description:** `InMemoryRoomStore` instantiated without `logger`; lock timeout events logged at `DEBUG` instead of `WARN`/`ERROR`.
  - **Impact:** Concurrency bottlenecks and lock timeouts are completely invisible in production logs.
  - **Remediation:** Inject logger into store and elevate lock timeout logs to `WARN`/`ERROR`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-028]** Unlogged Operation Start and Incomplete 3-Point Logging in AI Game Engine Hint & Takeback — [`apps/client/src/features/ai/composables/useAiGame.ts:149, 174`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiGame.ts#L149)
  - **Dimension:** D (Observability)
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md`
  - **Description:** User operations `askForHint` and `handleTakeback` lack start and success logs and omit correlation IDs.
  - **Impact:** AI operations cannot be traced or benchmarked in client telemetry.
  - **Remediation:** Add standard 3-point structured logging.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-029]** Unlogged Puzzle Rush & Streak Survivor Game Loop and Background Timer — [`apps/client/src/features/puzzles/composables/usePuzzleRush.ts:106-160`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleRush.ts#L106-L160)
  - **Dimension:** D (Observability)
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md`
  - **Description:** Zero logging across entire 275-line arcade game mode loop and score submissions.
  - **Impact:** Arcade mode failures and timing desyncs produce zero telemetry.
  - **Remediation:** Inject `logger` and log run start, solved puzzles, strikes, and completion.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-030]** Monolithic God Composable in `useScenarioRunner.ts` Violating Single Responsibility & Complexity — [`apps/client/src/features/scenarios/composables/useScenarioRunner.ts:31`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/composables/useScenarioRunner.ts#L31)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/rules/code-organization-principles.md` (Functions: single purpose, 10–50 lines, cyclomatic complexity < 10)
  - **Description:** 516-line composable with cyclomatic complexity of 81 mixing 6 distinct domains.
  - **Impact:** Fragile state transitions; massive mocking required in all tests.
  - **Remediation:** Decompose into `useScenarioStepNavigation`, `useScenarioBot`, `useScenarioHints`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-031]** Monolithic Server Bootstrap in `apps/server/src/index.ts:startServer` — [`apps/server/src/index.ts:83`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L83)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/rules/code-organization-principles.md`
  - **Description:** 348-line function with cyclomatic complexity of 40 performing 9 distinct setup responsibilities.
  - **Impact:** Difficult to test and maintain server startup in isolation.
  - **Remediation:** Extract `setupDomainServices`, `setupSocketGateway`, `setupBackgroundJobs`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-032]** Monolithic Request Handler in `apps/server/src/platform/http/http_server.ts:createHttpServer` — [`apps/server/src/platform/http/http_server.ts:186`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L186)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/rules/code-organization-principles.md`
  - **Description:** Request listener closure spans 279 lines with cyclomatic complexity of 57 combining 7 concerns.
  - **Impact:** Difficult to trace request dispatch and audit middleware execution.
  - **Remediation:** Extract middleware functions (`withSecurityHeaders`, `withCors`, `withRateLimit`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-033]** Duplicated Transport Action Boilerplate Across 9 Multiplayer Actions (DRY Violation) — [`apps/client/src/features/multiplayer/composables/useGameActions.ts:338`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useGameActions.ts#L338)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/rules/core-design-principles.md` (DRY threshold — Rule of Three; 9 instances)
  - **Description:** 9 actions copy-paste identical 40–50 line validation, logging, timeout, and emission boilerplate.
  - **Impact:** High maintenance overhead and risk of behavioral drift.
  - **Remediation:** Extract `executeSocketAction<TReq, TRes>` helper.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-034]** Duplicated Inbound Socket Event Ingress Across 17 Handlers in `useSocketTransport.ts` (DRY Violation) — [`apps/client/src/features/multiplayer/composables/useSocketTransport.ts:317`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L317)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/rules/core-design-principles.md` (DRY threshold — Rule of Three; 17 instances)
  - **Description:** 17 inbound handlers replicate identical 4-step validate-log-dispatch sequence across 200+ lines.
  - **Impact:** Bloated transport file; high regression risk when updating event ingress rules.
  - **Remediation:** Create higher-order `createInboundHandler` factory.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-035]** Duplicated Piece Value Mapping & Board Material Calculation Across 3 Modules (DRY Violation) — [`apps/client/src/features/ai/engine/pst_evaluator.ts:38`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/engine/pst_evaluator.ts#L38)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/rules/core-design-principles.md` (DRY threshold — Rule of Three; 3 instances)
  - **Description:** `pst_evaluator.ts`, `puzzle_analysis_engine.ts`, and `shared/src/utils/chess_evaluation.ts` define duplicate piece point tables and identical board loops.
  - **Impact:** Fragmented chess valuation logic across client features.
  - **Remediation:** Import `calculateBoardMaterial` and `STANDARD_PIECE_POINTS` directly from `@fun-chess/shared`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-036]** Technical Layer God Component `App.vue` Violating Vue Idioms and Single Responsibility — [`apps/client/src/App.vue:1`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L1)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/skills/vue-idioms/SKILL.md` (One concern per component)
  - **Description:** 712 lines instantiating 12 composables and passing 30+ props into router.
  - **Impact:** Extreme testing overhead; single point of failure for UI changes.
  - **Remediation:** Split into `AppAudioProvider.vue`, `AppPwaBanner.vue`, and rely on Pinia/DI contexts.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-037]** Global ESLint Suppression of Non-Negotiable Type Safety Rules Generating 804 Warnings — [`eslint.config.js:51`](file:///home/irahardianto/works/projects/fun-chess/eslint.config.js#L51)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/skills/typescript-idioms/SKILL.md`, `.agents/rules/code-idioms-and-conventions.md`
  - **Description:** Disables `@typescript-eslint/no-explicit-any`, permits `warn` for unused vars, generating 804 warnings on `pnpm lint`.
  - **Impact:** Zero-warning quality gate disabled; type safety regressions accumulate silently.
  - **Remediation:** Re-enable `@typescript-eslint/no-explicit-any: error`, run `eslint --fix`, and clean up unused variables.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-038]** Known Moderate CVE Vulnerability in `vitest` and `@vitest/mocker` Pinned via `pnpm.overrides` — [`package.json:45-49`](file:///home/irahardianto/works/projects/fun-chess/package.json#L45-L49)
  - **Dimension:** G (Dependencies & Tests)
  - **Rule Source:** `.agents/rules/dependency-management-principles.md` (CVE GHSA-82fw-gwwq-j7x9)
  - **Description:** Vitest version `3.2.7` has a known path traversal / arbitrary file read vulnerability in `@vitest/mocker`.
  - **Impact:** Test runners exposed to mock-based path traversal in CI/CD.
  - **Remediation:** Upgrade `vitest` to `>=4.1.11` across manifests and remove root override.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-039]** Missing BrowserStorageAdapter Integration Tests Against Native Storage Infrastructure — [`apps/client/src/platform/storage/browser_storage_adapter.ts:5-204`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/browser_storage_adapter.ts#L5-L204)
  - **Dimension:** G (Dependencies & Tests)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Integration testability mandate)
  - **Description:** All storage adapter tests mock `window.localStorage` globally; never exercised against real jsdom or browser storage.
  - **Impact:** Native storage boundary conditions and quota exceptions remain untested against real APIs.
  - **Remediation:** Add unmocked `browser_storage_adapter.integration.spec.ts`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-040]** Missing E2E Tests for Primary User Journey: PWA Offline Capabilities and Install Prompt Flow — [`apps/e2e/ui/`](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/)
  - **Dimension:** G (Dependencies & Tests)
  - **Rule Source:** `.agents/rules/testing-strategy.md` (E2E Complete User Journeys)
  - **Description:** Application is branded as offline-first PWA, but zero Playwright tests verify offline transitions or installation.
  - **Impact:** Offline regressions in Service Worker or cache manifest pass undetected.
  - **Remediation:** Add `pwa.e2e.test.ts` testing `context.setOffline(true)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-041]** Missing E2E Tests for Negative Multiplayer Room Join Journeys — [`apps/e2e/ui/multiplayer.e2e.test.ts:1-71`](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/multiplayer.e2e.test.ts#L1-L71)
  - **Dimension:** G (Dependencies & Tests)
  - **Rule Source:** `.agents/rules/testing-strategy.md`
  - **Description:** Only tests happy-path room joining; no tests for invalid 4-letter room codes or full room rejections.
  - **Impact:** Error banners and recovery flows for misspelled room codes remain unverified in real browsers.
  - **Remediation:** Add negative join error test cases.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-042]** Unexercised Server Transport Error and Disconnect Exception Handlers — [`apps/server/src/index.ts:198-207, 248-259`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L198-L207)
  - **Dimension:** G (Dependencies & Tests)
  - **Rule Source:** `.agents/rules/testing-strategy.md`
  - **Description:** Socket `error` handler and `handleSocketDisconnect` catch blocks in server bootstrap have 0 executions in tests.
  - **Impact:** Transport error handling and error sanitization are not regression-tested.
  - **Remediation:** Add integration tests triggering socket transport error events.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-043]** Unexercised Error Return Paths in GameService State Machine Operations — [`apps/server/src/features/game/game.service.ts:251, 301, 340, 345, 404, 411, 455, 487`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L251)
  - **Dimension:** G (Dependencies & Tests)
  - **Rule Source:** `.agents/rules/testing-strategy.md`
  - **Description:** `PlayerNotInRoomError` and `GameNotActiveError` branches across 6 methods have 0 test executions.
  - **Impact:** Unverified domain error responses could lead to malformed socket error payloads.
  - **Remediation:** Add table-driven unit tests for unauthorized/invalid game transitions.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-044]** Incomplete NodeFileStorage Integration Test Coverage for Real Filesystem Errors and Directories — [`apps/server/src/platform/http/file_storage.ts:16-56`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/file_storage.ts#L16-L56)
  - **Dimension:** G (Dependencies & Tests)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Integration testability)
  - **Description:** Only tests reading an existing plain file; lacks tests for directory stats, ENOENT rejection, and read errors.
  - **Impact:** Missing real-infrastructure coverage for production I/O adapter.
  - **Remediation:** Add tests for directory checking and missing file errors.
  - **Fix workflow:** `/bugfix`

---

## Minor Issues
Code maintainability issues, function length/complexity violations, or minor test gaps. Fix in near term.

- [ ] **[MIN-001]** `resolveAllowedOrigins` Mutually Excludes `CLIENT_URL` and `PUBLIC_URL` — [`apps/server/src/platform/config/env.ts:124-135`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L124-L135)
  - **Dimension:** A (Security & Configuration)
  - **Remediation:** Collect origins from both variables into a `Set<string>` and return merged list.
- [ ] **[MIN-002]** Missing IP Syntax Validation on Extracted `X-Forwarded-For` Headers — [`apps/server/src/platform/http/ip_utils.ts:19-59`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/ip_utils.ts#L19-L59)
  - **Dimension:** A (Security & Configuration)
  - **Remediation:** Verify IP syntax using `net.isIP()` before returning from `normalizeIp()`.
- [ ] **[MIN-003]** Inconsistent Default Request Quota in Rate Limiter Configuration Across Components — [`.env.template:62`](file:///home/irahardianto/works/projects/fun-chess/.env.template#L62), [`docker-compose.yml:19`](file:///home/irahardianto/works/projects/fun-chess/docker-compose.yml#L19), [`http_server.ts:197`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L197), [`index.ts:178`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L178)
  - **Dimension:** A (Security & Configuration)
  - **Remediation:** Centralize `DEFAULT_RATE_LIMIT_MAX_REQUESTS` in a single constants file.
- [ ] **[MIN-004]** Empty Catch Blocks in Scenario Validation Engine — [`apps/client/src/features/scenarios/engine/scenario_validator.ts:61, 104, 153`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/engine/scenario_validator.ts#L61)
  - **Dimension:** B (Reliability)
  - **Remediation:** Replace empty catches with debug logging or explicit type narrowing.
- [ ] **[MIN-005]** Empty Catch Block in Puzzle Hint Generator — [`apps/client/src/features/puzzles/engine/hint_generator.ts:99-101`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/hint_generator.ts#L99-L101)
  - **Dimension:** B (Reliability)
  - **Remediation:** Handle error or log diagnostic debug trace.
- [ ] **[MIN-006]** Empty Catch Block in Puzzle Material Calculation Engine — [`apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts:125-127`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts#L125-L127)
  - **Dimension:** B (Reliability)
  - **Remediation:** Catch `err` and log diagnostic warning before returning default zeroes.
- [ ] **[MIN-007]** Empty Catch Block in Disconnect Forfeit Handler — [`apps/server/src/features/rooms/room.socket_handler.ts:273-275`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L273-L275)
  - **Dimension:** B (Reliability)
  - **Remediation:** Capture error and log context indicating forfeit job completion status.
- [ ] **[MIN-008]** Silent Failure in Progress Import File Handler — [`apps/client/src/features/portability/components/ProgressSyncModal.vue:98-111`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/components/ProgressSyncModal.vue#L98-L111)
  - **Dimension:** B (Reliability)
  - **Remediation:** Add structured `logger.warn` inside the catch block matching other handlers.
- [ ] **[MIN-009]** Swallowed Non-Quota Errors in Browser Storage Adapter — [`apps/client/src/platform/storage/browser_storage_adapter.ts:111-143`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/browser_storage_adapter.ts#L111-L143)
  - **Dimension:** B (Reliability)
  - **Remediation:** Log non-quota exceptions with `logger.warn`.
- [ ] **[MIN-010]** Cross-Module Boundary Violation: `PuzzleBoardWrapper.vue` Deep-Imports `board/ChessBoard.vue` — [`apps/client/src/features/puzzles/components/PuzzleBoardWrapper.vue:3`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/components/PuzzleBoardWrapper.vue#L3)
  - **Dimension:** C (Architecture) & E (Code Quality)
  - **Remediation:** Import from public entry point `@/features/board`.
- [ ] **[MIN-011]** Domain Feature Composables Misplaced in Generic Technical `composables/` Directory — [`apps/client/src/composables/useLanDiscovery.ts`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useLanDiscovery.ts), [`useChessBoard.ts`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useChessBoard.ts)
  - **Dimension:** C (Architecture)
  - **Remediation:** Relocate to feature slices (`features/lobby/` and `features/board/`).
- [ ] **[MIN-012]** Deep Platform Module Imports Bypassing Barrel Exports in Client Features — [`apps/client/src/features/portability/components/QrExportView.vue:6-7`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/components/QrExportView.vue#L6-L7)
  - **Dimension:** C (Architecture)
  - **Remediation:** Import from platform module barrels (`@/platform/hardware`, `@/platform/di`).
- [ ] **[MIN-013]** Shared Clock Re-Export Files in Server Feature Modules Violate Dependency Direction — [`apps/server/src/features/rooms/clock.ts:5`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/clock.ts#L5), [`apps/server/src/features/game/clock.ts:5`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/clock.ts#L5)
  - **Dimension:** C (Architecture)
  - **Remediation:** Remove local wrapper files and import contracts from `@fun-chess/shared`.
- [ ] **[MIN-014]** Premature Operation Start Suppression via `DEBUG` Level in `useAiWorker` and `useSocketTransport` — [`apps/client/src/features/ai/composables/useAiWorker.ts:59`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiWorker.ts#L59), [`apps/client/src/features/multiplayer/composables/useSocketTransport.ts:632`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L632)
  - **Dimension:** D (Observability)
  - **Remediation:** Elevate operation start logs from `DEBUG` to `INFO`.
- [ ] **[MIN-015]** Missing `correlationId` on Socket Engine Connection Error and Prune Catch Logs — [`apps/server/src/platform/socket/socket_server.ts:83-91`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_server.ts#L83-L91), [`apps/server/src/platform/socket/socket_rate_limiter.ts:73-77`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L73-L77)
  - **Dimension:** D (Observability)
  - **Remediation:** Generate `correlationId = randomUUID()` prior to logging.
- [ ] **[MIN-016]** Misleading Completion Log and Missing HTTP Status Code for Static File Serving — [`apps/server/src/platform/http/http_server.ts:431-442`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L431-L442)
  - **Dimension:** D (Observability)
  - **Remediation:** Include `statusCode: res.statusCode` and log `WARN`/`ERROR` on non-2xx responses.
- [ ] **[MIN-017]** Unlogged Operation Start in Client Storage Schema Migration — [`apps/client/src/platform/storage/keys.ts:32-102`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/keys.ts#L32-L102)
  - **Dimension:** D (Observability)
  - **Remediation:** Add `logger.info('Storage migration started', ...)` at function entry.
- [ ] **[MIN-018]** Zombie Re-export Facades and Inverted Store Naming Violating Code Organization Principles — [`apps/client/src/features/puzzles/store/local_storage_puzzle_progress.store.ts:1`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/local_storage_puzzle_progress.store.ts#L1)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Standardize filenames to `*.store.ts` and remove one-line facade shims.
- [ ] **[MIN-019]** Duplicated Keyboard Navigation and Focus Traversal in 6 Vue UI Components — [`apps/client/src/features/lobby/LobbyModeSelector.vue:55`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/LobbyModeSelector.vue#L55)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Extract shared `useRovingTabindex` composable.
- [ ] **[MIN-020]** Fragmented Test File Naming Conventions Across Monorepo — [`apps/client/src/__tests__/`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/__tests__/)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Standardize test filenames to match target module in `snake_case.spec.ts`.
- [ ] **[MIN-021]** Dead Code, Unused Variables, and Useless Initial Assignments Across Production Modules — [`apps/server/src/platform/socket/socket_logging_middleware.ts:160`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L160), [`shared/src/utils/progress_codec.ts:122`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_codec.ts#L122)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Prune dead code, remove unused parameters, and eliminate useless assignments.
- [ ] **[MIN-022]** Redundant Duplicate Event Emission (Dual Kebab/Camel Case) in `AppViewRouter.vue` — [`apps/client/src/components/layout/AppViewRouter.vue:87`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/AppViewRouter.vue#L87)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Standardize on kebab-case emits; remove double emissions.
- [ ] **[MIN-023]** Fixed Hard Expiration in `InMemorySessionRegistry` Purging Active Sessions in Long Matches — [`apps/server/src/features/rooms/in_memory_session_registry.ts:24`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_session_registry.ts#L24)
  - **Dimension:** F (Integration Contracts)
  - **Remediation:** Implement sliding TTL in `touchSession`: `record.expiresAt = now + DEFAULT_TTL_MS`.
- [ ] **[MIN-024]** Contract Asymmetry: `room:create` Omits `player` in Ack Callback Unlike `room:join` and `room:reconnect` — [`shared/src/contracts/events.ts:111`](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/events.ts#L111)
  - **Dimension:** F (Integration Contracts)
  - **Remediation:** Include `player: Player` in `room:create` return payload.
- [ ] **[MIN-025]** Type Drift Between `PromotionPieceSchema` and `MoveResult.promotion` — [`shared/src/contracts/schemas.ts:251`](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L251), [`shared/src/contracts/models.ts:17, 132`](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/models.ts#L17)
  - **Dimension:** F (Integration Contracts)
  - **Remediation:** Constrain `MoveResult.promotion?: PromotionPiece` where `PromotionPiece = "q" | "r" | "b" | "n"`.
- [ ] **[MIN-026]** Unpinned Floating Dependency Ranges in Root Package Manifest — [`package.json:34-42`](file:///home/irahardianto/works/projects/fun-chess/package.json#L34-L42)
  - **Dimension:** G (Dependencies & Tests)
  - **Remediation:** Pin exact versions without caret (`^`).
- [ ] **[MIN-027]** Redundant and Version-Mismatched `@types/pako` in Shared Manifest — [`shared/package.json:24, 30`](file:///home/irahardianto/works/projects/fun-chess/shared/package.json#L24)
  - **Dimension:** G (Dependencies & Tests)
  - **Remediation:** Remove `@types/pako` (pako v3 ships with built-in types).
- [ ] **[MIN-028]** Unused Development Dependency `pino-pretty` in Server Manifest — [`apps/server/package.json:25`](file:///home/irahardianto/works/projects/fun-chess/apps/server/package.json#L25)
  - **Dimension:** G (Dependencies & Tests)
  - **Remediation:** Wire into dev script or remove from dependencies.
- [ ] **[MIN-029]** Phantom Vite Dependency Chunk Partitioning for Unlisted `pako` in Client Configuration — [`apps/client/vite.config.ts:119-121`](file:///home/irahardianto/works/projects/fun-chess/apps/client/vite.config.ts#L119-L121)
  - **Dimension:** G (Dependencies & Tests)
  - **Remediation:** Clean up chunk rule or bundle inside shared vendor chunk.
- [ ] **[MIN-030]** Missing Unit Test for `HealthController.getHealth()` Method — [`apps/server/src/platform/http/controllers/health.controller.ts:78-80`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/health.controller.ts#L78-L80)
  - **Dimension:** G (Dependencies & Tests)
  - **Remediation:** Add test case asserting `getHealth()` delegates to `getDetailedHealth()`.
- [ ] **[MIN-031]** StaticController Unit Test Suite Fails to Test 404 Asset Rejection Despite Test Title — [`apps/server/src/platform/http/controllers/__tests__/static.controller.spec.ts:89-123`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/__tests__/static.controller.spec.ts#L89-L123)
  - **Dimension:** G (Dependencies & Tests)
  - **Remediation:** Add test asserting 404 on `/assets/missing.js`.
- [ ] **[MIN-032]** Unexercised Error and Quota Fallback Paths in Client Portability & Storage Stores — [`apps/client/src/features/portability/composables/useProgressSync.ts:254`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useProgressSync.ts#L254)
  - **Dimension:** G (Dependencies & Tests)
  - **Remediation:** Add unit test for payloads exceeding 2MB.
- [ ] **[MIN-033]** Unexercised Web Audio API Error Catch Paths in AudioSynthesizer — [`apps/client/src/platform/audio/audio_synthesizer.ts:42, 53, 70`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/audio/audio_synthesizer.ts#L42)
  - **Dimension:** G (Dependencies & Tests)
  - **Remediation:** Add unit tests simulating suspended AudioContext errors.

---

## Enhancement Issues
Non-critical suggestions, defense-in-depth, documentation, or minor clarity refactorings.

- [ ] **[ENH-001]** Module-Level Mutable State Singleton in `DisconnectTimerRegistry` Complicates Parallel Isolated Testing — [`apps/server/src/features/rooms/disconnect_timer_registry.ts:69-85`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/disconnect_timer_registry.ts#L69-L85)
- [ ] **[ENH-002]** URL Construction Duplication Between `LobbyView.vue` and `QrCodeModal.vue` Should Be Unified into Pure Builder — [`apps/client/src/features/lobby/LobbyView.vue:165-199`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/LobbyView.vue#L165-L199)
- [ ] **[ENH-003]** Dual Competing DI Helper Suites in `apps/client/src/platform/di/` (`useInject*` vs `use*`) Should Be Unified — [`apps/client/src/platform/di/index.ts:58-121`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/di/index.ts#L58-L121)
- [ ] **[ENH-004]** Swallowed Promise Rejections in E2E Automation Suites — [`apps/e2e/src/pages/GamePage.ts:64`](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/src/pages/GamePage.ts#L64), [`apps/e2e/ui/ai.e2e.test.ts:75`](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/ai.e2e.test.ts#L75)
- [ ] **[ENH-005]** Missing Scope Cleanup Hook in `useQrDecoder` — [`apps/client/src/features/portability/composables/useQrDecoder.ts:121-125`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useQrDecoder.ts#L121-L125)
- [ ] **[ENH-006]** Missing Request Timeout in Integration Test HTTP Client Helper — [`apps/server/src/__tests__/integration/helpers/http_client_helper.ts:16`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/__tests__/integration/helpers/http_client_helper.ts#L16)
- [ ] **[ENH-007]** Full Request Payload Logged at `INFO` Level in WebSocket Middleware — [`apps/server/src/platform/socket/socket_logging_middleware.ts:287`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L287)
- [ ] **[ENH-008]** Unstructured CLI Logging in Offline Puzzle Generator & Compiler Tools — [`tools/puzzle-generators/`](file:///home/irahardianto/works/projects/fun-chess/tools/puzzle-generators/)
- [ ] **[ENH-009]** Cryptic and Single-Letter Variable/Parameter Names Failing to Reveal Intent — [`apps/client/src/features/multiplayer/composables/useSocketTransport.ts:382`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L382)
- [ ] **[ENH-010]** High Cyclomatic Complexity in Progress Serialization (`DictionaryMapper.toCompact`) — [`shared/src/utils/dictionary_mapper.ts:38`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/dictionary_mapper.ts#L38)
- [ ] **[ENH-011]** Multi-Layered Nested Error Handling in `safeLoadFen` — [`shared/src/utils/chess_factory.ts:152`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/chess_factory.ts#L152)
- [ ] **[ENH-012]** Missing Canonical Top-Level Zod Schemas for Progress Sync Envelopes in Shared Contracts — [`shared/src/contracts/schemas.ts`](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts)
- [ ] **[ENH-013]** Missing E2E Tests for Audio Synthesis and Volume/Mute Settings Persistence — [`apps/e2e/ui/`](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/)
- [ ] **[ENH-014]** Static Handler 500 Error and Content-Negotiation 404 Branches Lack Dedicated Unit Tests — [`apps/server/src/platform/http/static_handler.ts:188-204, 224-231`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L188-L204)

---

## Verification Suite Results
- **Linter & Static Analysis (ESLint):** PASS (0 errors, 804 warnings; 683 Vue formatting warnings, 57 unused vars)
- **TypeScript Typecheck (`tsc` / `vue-tsc`):** PASS (0 errors across `shared`, `apps/server`, `apps/client`, `apps/e2e`)
- **Automated Unit Tests:** PASS (145 files passed, 2,028 passed, 0 failed)
- **Automated Integration Tests:** PASS (8 files passed, 62 passed, 0 failed)
- **Build Verification:** PASS (TypeScript compilation and Vite PWA build succeeded)
- **Test Coverage:** ~91%+ line coverage across packages

---

## Cross-Dimension Correlations
Findings that span multiple dimensions, with escalated severity:

1. **Room Disconnect Abandonment Timer (`room.service.ts:396`)**:
   - Flagged by Dimension B ([CRITICAL-001]: Unhandled Promise Rejection risking process crash) and Dimension D ([MAJOR-001]: Completely unlogged background execution).
   - *Correlation:* An unlogged, unmonitored background operation that directly risks process death upon lock acquisition contention. Confirms CRITICAL severity.

2. **In-Memory Room Store Concurrency & Lock Handling (`in_memory_room.store.ts`)**:
   - Flagged by Dimension B ([CRITICAL-002]: Abandoned race action promise throws unhandled `StaleLockExecutionError`), Dimension D ([MAJOR-007]: Unlogged state store mutations and suppressed timeout logs), and Dimension C ([MAJOR-001]: Store adapter implements domain gameplay logic directly).
   - *Correlation:* The core persistence engine suffers from architectural layer leakage, invisible concurrency metrics, and fatal unhandled rejections on timeout.

3. **Production Static Asset Delivery & Path Traversal (`static_handler.ts`, `Dockerfile`, `http_server.ts`)**:
   - Flagged by Dimension A ([CFG-A-002]: Broken static asset path `/client/dist` in Docker container), Dimension A ([SEC-A-001]: Path traversal defense lacks `realpath` symlink canonicalization), and Dimension G ([MAJOR-007]: `NodeFileStorage` lacks real filesystem error integration tests).
   - *Correlation:* Static delivery fails completely in containers out-of-the-box, while file validation lacks defense-in-depth symlink checking. Escalated [CFG-A-002] to CRITICAL.

4. **Socket Rate Limiter & Denial of Service (`socket_rate_limiter.ts`, `room.socket_handler.ts`, `game.socket_handler.ts`)**:
   - Flagged by Dimension A ([SEC-A-004]: DoS risk exhausting 10,000 room slots), Dimension B ([MAJOR-011]: Interval timer leak via default parameter), and Dimension D ([MAJOR-022]: Unlogged prune timer).
   - *Correlation:* Rate limiter leaks memory, runs unobserved, and fails to differentiate expensive room creation from cheap move events.

5. **Client Multiplayer Transport & Session Recovery (`useSocketTransport.ts`, `useGameActions.ts`, `useRoomSession.ts`)**:
   - Flagged by Dimension F ([MAJ-002]: Ghost room deadlock on host leave), Dimension F ([MAJ-003]: Schema bypass causing move drop), Dimension F ([MAJ-004]: Inactive `isReconnecting` state), and Dimension E ([MAJ-033], [MAJ-034]: Massive duplicated boilerplate).
   - *Correlation:* High code duplication in multiplayer composables coincides with lifecycle desynchronization and schema bypass defects.

---

## Dimensions Covered
| Dimension | Status | Files / Queries Examined |
|---|---|---|
| A. Security & Configuration | ✅ Checked | Audited 565 files; verified zero injection/SSRF/command execution; audited static path traversal, rate limiting, and container configs |
| B. Reliability & Error Handling | ✅ Checked | Audited 563 files; checked unhandled rejections, catch blocks, resource cleanup, process signal handlers, and timer leaks |
| C. Testability & Architecture | ✅ Checked | Audited 555 files; analyzed I/O isolation, dependency direction, Vue DI usage, non-deterministic time/randomness, and module boundaries |
| D. Observability & Logging | ✅ Checked | Audited 95 entry point files; checked 3-point logging, correlation IDs, raw `console.*` usage, log levels, and PII scrubbing |
| E. Code Quality & Patterns | ✅ Checked | Audited 354 source files + test suites; evaluated SRP, cyclomatic complexity, DRY violations, dead code, and ESLint rule suppressions |
| F. Integration Contracts & Stores | ✅ Checked | Audited 42 files across shared contracts, socket events, client transports, in-memory stores, and session registries |
| G. Dependencies & Tests | ✅ Checked | Audited package manifests, `pnpm audit` (GHSA-82fw-gwwq-j7x9), test coverage gaps, unexercised branches, and E2E suites |

---

## Rules Applied
- `.agents/rules/security-mandate.md` / `.agents/rules/security-principles.md`
- `.agents/rules/rugged-software-constitution.md`
- `.agents/rules/error-handling-principles.md`
- `.agents/rules/architectural-pattern.md`
- `.agents/rules/logging-and-observability-mandate.md`
- `.agents/rules/code-organization-principles.md`
- `.agents/rules/core-design-principles.md`
- `.agents/rules/api-design-principles.md` / `.agents/rules/database-design-principles.md`
- `.agents/rules/dependency-management-principles.md` / `.agents/rules/testing-strategy.md`

---

## Remediation Action Plan
Findings ranked by priority for resolution:

1. **[CRIT-001]** Wrap background abandonment forfeit timer in `try/catch` with `runLoggedJob` → `/bugfix`
2. **[CRIT-002]** Attach `.catch()` handler to orphaned `actionPromise` in `InMemoryRoomStore.withLock` → `/bugfix`
3. **[CRIT-003]** Fix production `CLIENT_DIST_PATH` in `Dockerfile`, `docker-compose.yml`, and `http_server.ts` → `/bugfix`
4. **[MAJ-001]** Add `fs.realpath` canonicalization to `checkPathTraversal` / `NodeFileStorage` → `/bugfix`
5. **[MAJ-002]** Broadcast `room:player_left` to guest when host leaves room during lobby phase → `/bugfix`
6. **[MAJ-003]** Align `MakeMoveRequestSchema` idempotency key definition or remove client bypass → `/bugfix`
7. **[MAJ-004]** Fix client socket reconnection lifecycle listeners on `socket.io` Manager → `/bugfix`
8. **[MAJ-005]** Deduplicate `OptimisticLockConflictError` by exporting from `@fun-chess/shared` → `/refactor`
9. **[MAJ-006]** Add differential rate limiting for room creation vs gameplay moves → `/bugfix`
10. **[MAJ-007] - [MAJ-014]** Fix server shutdown hang, bootstrap interval leaks, and client DOM/stream leaks → `/bugfix`
11. **[MAJ-015] - [MAJ-021]** Decouple `InMemoryRoomStore` from domain adapter and fix client Vue DI bypasses → `/refactor`
12. **[MAJ-022] - [MAJ-029]** Instrument unlogged background tasks, add `userId` to socket logs, remove raw `console.*` → `/bugfix`
13. **[MAJ-030] - [MAJ-036]** Decompose monolithic composables (`useScenarioRunner`, `App.vue`, `startServer`) and eliminate DRY duplication → `/refactor`
14. **[MAJ-037]** Fix ESLint config suppressions, run `eslint --fix`, and eliminate 804 warnings → `/refactor`
15. **[MAJ-038] - [MAJ-044]** Upgrade `vitest` to patch GHSA-82fw-gwwq-j7x9 and add missing PWA / negative join E2E tests → `/bugfix`
