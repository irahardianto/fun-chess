# Code Audit: Fun Chess Codebase
Date: 2026-09-10
Auditor: AI Code Audit (multi-dimensional, 7 parallel subagents)

## Executive Summary
- **Dimensions activated:** A (Security & Configuration), B (Reliability & Error Handling), C (Testability & Architecture), D (Observability & Logging), E (Code Quality & Patterns), F (Integration Contracts & Database), G (Dependencies & Test Coverage Gaps)
- **Dimensions skipped:** None
- **Files scanned:** 622 files across `apps/server`, `apps/client`, `shared`, `apps/e2e`, `infra`, and workspace root
- **Findings:** 81 total (2 critical, 28 major, 33 minor, 18 enhancement)
- **Automated verification:** Lint: PASS (0 errors, 0 warnings) | Tests: PASS (2,640 passed, 0 failed across 177 test files) | Build: PASS (shared, server, client + PWA) | Coverage: FAIL on server branch threshold (84.63% vs 85.00% mandatory gate)
- **Overall codebase health:** NEEDS ATTENTION (Strong architectural and testing foundations with 2,640 automated tests, clean linter, and typecheck; however, 2 critical security issues, 28 structural/testability majors, and a failing test coverage gate require remediation)

---

## Critical Issues
Vulnerabilities or severe defects that cause active security breaches, data loss, or system failure. Must be fixed immediately.

- [ ] **[CRIT-001]** IP Spoofing & Loopback Telemetry Authorization Bypass via Fail-Open Fallback in `normalizeIp` — [ip_utils.ts:28-30](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/ip_utils.ts#L28-L30)
  - **Dimension:** A (Security & Configuration) & G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `security-principles.md` (Broken Access Control: Deny by default, Fail securely closed), `rugged-software-constitution.md` (Every input is malformed/malicious until validated at system boundary)
  - **Description:** `normalizeIp` handles missing, non-string, or syntactically invalid IP inputs (`net.isIP(trimmed) === 0`) by defaulting them to `"127.0.0.1"`. When `TRUST_PROXY=true` (as in production Cloud Run), `extractClientIp` evaluates the rightmost segment of `X-Forwarded-For`. An untrusted external client sending an unparsable header like `X-Forwarded-For: invalid` has its IP normalized directly to `"127.0.0.1"`. In `health.controller.ts:27-35`, `isTelemetryAuthorized` unconditionally grants unrestricted access to internal operational telemetry (`/metrics`, `/health/detail`) whenever `clientIp === "127.0.0.1"`. Furthermore, this authorization path has zero direct unit tests in `health.controller.spec.ts`.
  - **Impact:** Active authentication bypass (CWE-290). Remote callers can retrieve detailed system telemetry and heap statistics without `METRICS_SECRET`. Additionally, all invalid IP requests collapse into the local loopback rate limiter bucket, allowing remote attackers to DoS local health probes.
  - **Evidence:**
    ```typescript
    // apps/server/src/platform/http/ip_utils.ts:27-30
    if (net.isIP(trimmed) === 0) {
      return "127.0.0.1"; // Fail-open to loopback!
    }
    ```
  - **Remediation:** Fail closed by returning `"unknown"` or `""` on invalid/unparseable IPs, never grant loopback privileges to unauthenticated headers, and add direct unit tests for `isTelemetryAuthorized`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-002]** Sensitive Session Token Credential Leakage in HTTP Access Logs and Storage Metadata — [http_server.ts:431-451](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L431-L451) and [in_memory_session_registry.ts:70-75](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_session_registry.ts#L70-L75)
  - **Dimension:** A (Security & Configuration), B (Reliability & Error Handling), D (Observability & Logging)
  - **Rule Source:** `security-principles.md` (Logging & Monitoring: Redaction — SCRUB all secrets, tokens, and passwords), `logging-and-observability-mandate.md`, `error-handling-principles.md` (Swallowed errors zero-tolerance)
  - **Description:** In `http_server.ts`, `extractHttpUserId` specifically extracts secret session tokens from headers (`x-session-token`, `session-token`) and URL query parameters (`sessionToken`, `session_token`), assigning them to `userId` in the HTTP request log context. `PinoLogger` redacts fields named `token` and `sessionToken`, but does NOT redact `userId`, causing raw session bearer tokens to be logged in cleartext stdout. Additionally, `extractHttpUserId` swallows query parsing errors with `catch (_err) { void _err; }`. In `in_memory_session_registry.ts`, raw `sessionToken` values are passed directly into debug log metadata on `session_storage_create` and `session_storage_touch`.
  - **Impact:** Exposure of active player session tokens in logs and observability platforms (CWE-532), enabling session hijacking across active rooms.
  - **Evidence:**
    ```typescript
    // apps/server/src/platform/http/http_server.ts:433-437
    const headerVal =
      req.headers["x-user-id"] ??
      req.headers["x-player-id"] ??
      req.headers["x-session-token"] ??
      req.headers["session-token"];
    ```
  - **Remediation:** Remove `x-session-token` and `sessionToken` from `extractHttpUserId`; mask or hash session tokens in `InMemorySessionRegistry` logs; replace empty catch block with a structured debug log.
  - **Fix workflow:** `/bugfix` — immediate priority

---

## Major Issues
Structural violations, missing I/O error handling, untested critical paths, or broken contracts. Must be fixed before release.

- [ ] **[MAJ-001]** Test Coverage Gate Failure: Server Branch Coverage Below Mandatory 85% Threshold — [vitest.config.ts:19](file:///home/irahardianto/works/projects/fun-chess/apps/server/vitest.config.ts#L16-L21)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` (Coverage Requirements: Unit tests >85% code coverage)
  - **Description:** Server branch coverage stands at 84.63%, failing the strict 85% gate in `apps/server/vitest.config.ts` during `pnpm run test:coverage`. Uncovered branches exist in `in_memory_room.store.ts` (71.50%), `room.socket_handler.ts` (73.43%), `relay_address.service.ts` (78.67%), `disconnect_timer_registry.ts` (77.77%), `pino_logger.ts` (79.16%), and `static_handler.ts` (79.09%).
  - **Impact:** Automated CI/CD pipelines fail coverage checks; regression risk in core room concurrency and socket reconnection logic.
  - **Remediation:** Add targeted branch tests in `in_memory_room.store.spec.ts`, `room.socket_handler.spec.ts`, and create co-located `disconnect_timer_registry.spec.ts`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-002]** Configured Environment Variable `MAX_ROOMS` Silently Ignored at Server Startup — [index.ts:126-131](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L126-L131)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `configuration-management-principles.md` (Never hardcode configuration in code)
  - **Description:** `setupDomainServices` in `index.ts` instantiates `InMemoryRoomStore` using a hardcoded imported constant `MAX_ROOMS` (10,000) instead of `env.MAX_ROOMS`. Operators configuring lower limits on resource-constrained containers (e.g. 512MiB Cloud Run) have their configuration silently ignored.
  - **Impact:** Memory exhaustion / container crash risk under room creation floods.
  - **Remediation:** Pass `env.MAX_ROOMS ?? MAX_ROOMS` to `InMemoryRoomStore`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-003]** `.env.template` Incompleteness — Missing `METRICS_SECRET`, `SESSION_SECRET`, and `MAX_ROOMS` — [.env.template:1-70](file:///home/irahardianto/works/projects/fun-chess/.env.template#L1-L70)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `configuration-management-principles.md` (.env.template completeness)
  - **Description:** The canonical template `.env.template` and `docker-compose.yml` omit `METRICS_SECRET`, `SESSION_SECRET`, and `MAX_ROOMS`, which are defined in `ServerEnvSchema` and documented in `.env.example`.
  - **Impact:** Operators generating `.env` from template deploy unconfigured telemetry secrets and capacity limits.
  - **Remediation:** Add blank entries with explanatory comments to `.env.template` and expose in `docker-compose.yml`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-004]** Dead / Misleading Configuration: `SESSION_SECRET` Documented for Signing but Never Implemented — [schemas.ts:554](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L554)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `security-principles.md`, `configuration-management-principles.md`
  - **Description:** `SESSION_SECRET` is documented as "Secret key for signing session tokens", but session tokens are generated as raw un-signed UUIDs and `SESSION_SECRET` is never injected into any signing function.
  - **Impact:** False sense of security regarding token tamper-resistance; dead configuration debt.
  - **Remediation:** Implement HMAC-SHA256 session token signatures with `SESSION_SECRET` or deprecate and remove the unused variable.
  - **Fix workflow:** `/bugfix` or `/refactor`

- [ ] **[MAJ-005]** Dangling Timer Resource Leak on Normal Completion of HTTP Server Shutdown — [index.ts:573-580](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L573-L580)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `resources-and-memory-management-principles.md` (Ensure timers and background tasks are cleaned up)
  - **Description:** In `FunChessServer.close()`, a 5000ms timeout promise races against `closePromise`. When `closePromise` resolves normally, `clearTimeout(timer)` is never called, leaving active handles in libuv for 5 seconds.
  - **Impact:** Event loop hangs during integration test runs, causing runner teardown delays and test flakiness.
  - **Remediation:** Clear timer in a `finally` block around `Promise.race()`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-006]** Unbounded Recursive Call Stack Exhaustion on Circular/Deep Structures in `canonicalJsonStringify` — [canonical_json.ts:24-60](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/canonical_json.ts#L24-L60)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `rugged-software-constitution.md`, `error-handling-principles.md`
  - **Description:** `canonicalJsonStringify` serializes arrays and nested object properties recursively without cycle tracking (`WeakSet`) or a maximum depth ceiling. Circular or deeply nested payloads cause an uncatchable `RangeError: Maximum call stack size exceeded`.
  - **Impact:** Unhandled thread crash or UI freeze when serializing corrupted game states or sync payloads.
  - **Remediation:** Introduce `WeakSet` cycle detection and enforce a max depth ceiling (e.g. 64).
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-007]** Synchronous Callback Exception Escapes and Double Dispatch in Socket Middleware — [socket_logging_middleware.ts:239-257](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L239-L257)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `error-handling-principles.md` (Failure recovery & cleanup)
  - **Description:** In `wrapSocketHandler`, if a client acknowledgment callback throws a synchronous exception during success dispatch, the error is caught by the outer catch block, which logs a false-positive operation failure and calls `dispatchResponse` a second time with an error payload.
  - **Impact:** False error telemetry and double execution of client callbacks.
  - **Remediation:** Wrap client callback invocations in a defensive `try/catch` block inside `dispatchResponse`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-008]** Circular Dependency in Shared Contracts (`models.ts` ⇄ `schemas.ts` ⇄ `puzzle.ts` ⇄ `scenario.ts`) — [models.ts:113-114](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/models.ts#L113-L114)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `code-organization-principles.md` (Avoid Circular Dependencies)
  - **Description:** `models.ts` imports `MovePayload` from `schemas.ts`, while `schemas.ts` imports from `puzzle.ts`, which imports from `models.ts` and `scenario.ts`, creating a dependency cycle detected by `dpdm` and `madge`.
  - **Impact:** Violates module layering; risks runtime `undefined` exports during bundler transformations.
  - **Remediation:** Define `MovePayload` directly in `models.ts` and extract `PUZZLE_THEMES` into a dedicated constants module.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-009]** Circular Dependency and Async Hack Coupling in Client Multiplayer Composables (`useRoomSession.ts` ⇄ `useGameActions.ts`) — [useRoomSession.ts:31](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useRoomSession.ts#L31)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `code-organization-principles.md`, `core-design-principles.md` (SRP)
  - **Description:** `useRoomSession.ts` statically imports `resetGameActionsState` from `useGameActions.ts`, while `useGameActions.ts` uses dynamic `await import('./useRoomSession')` to invoke `leaveRoom`.
  - **Impact:** Circular coupling between room session lifecycle and game move execution; async boundary risks race conditions on rapid reconnect.
  - **Remediation:** Scope room departure exclusively to `useRoomSession`; decouple action resetting via events or registration hooks.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-010]** Pure Calculation and Validation Engines Directly Import Platform Telemetry and Perform Logging I/O — [scenario_validator.ts:4](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/engine/scenario_validator.ts#L4)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 2: Pure Business Logic), `logging-and-observability-mandate.md`
  - **Description:** 8 pure calculation files (`scenario_validator.ts`, `material_delta.ts`, `hint_generator.ts`, `puzzle_analysis_engine.ts`, `puzzle_validator.ts`, `rules_of_thumb.ts`, `theme_detector.ts`, `chess_engine.ts`) directly import logger infrastructure and emit debug logs from inner loops.
  - **Impact:** Breaks referential transparency and business logic purity; prevents isolated execution in Web Workers without bundling logger dependencies.
  - **Remediation:** Remove logger imports and side-effect logging from engine files; return structured result objects instead.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-011]** Global Browser `navigator` and `window` Objects Unabstracted and Directly Monkey-Patched in `useNetworkStatus` — [useNetworkStatus.ts:131-150](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/pwa/composables/useNetworkStatus.ts#L131-L150)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation)
  - **Description:** `useNetworkStatus` mutates `navigator.onLine` via `Object.defineProperty` and dispatches synthetic events on `window` in `setOnlineStatus` rather than abstracting network status behind an interface.
  - **Impact:** Production code monkey-patches browser host objects; tests contaminate global execution environment.
  - **Remediation:** Introduce `INetworkMonitor` interface with `BrowserNetworkMonitor` and `MockNetworkMonitor`, provided via Vue DI.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-012]** Unabstracted System Clock (`Date.now()`, `new Date()`) and Unmocked Timers Across Services and Controllers — [usePuzzleRush.ts:71-75](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleRush.ts#L71-L75)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation — time/randomness)
  - **Description:** `usePuzzleRush.ts`, `usePwaInstall.ts`, `health.controller.ts`, `http_server.ts`, `sliding_window_rate_limiter.ts`, and `room.service.ts` directly call `Date.now()`, `new Date()`, or global `setTimeout` instead of accepting `IClock`.
  - **Impact:** Time-sensitive business calculations cannot be tested deterministically with virtual clocks.
  - **Remediation:** Inject `IClock` into controllers, rate limiters, and puzzle rush composables.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-013]** Unabstracted `Math.random()` in Puzzle Catalog Selection, Mascot Banter, and AI Worker — [puzzle_catalog.ts:699](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/data/puzzle_catalog.ts#L699)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation — randomness)
  - **Description:** `getRandomPuzzle()` in `puzzle_catalog.ts`, `useAiWorker.ts`, and `useMascotBanter.ts` call unseeded `Math.random()` directly without accepting a generator function.
  - **Impact:** Nondeterministic behavior in tests; невозможно reproduce specific puzzle or banter test cases.
  - **Remediation:** Allow optional `randomFn: () => number` parameter (matching `blunder_generator.ts`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-014]** Filesystem I/O Bypasses `IFileStorage` in Static Path Resolution and Server Bootstrap Wiring — [http_server.ts:161](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L161)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation, Rule 3: Dependency Direction)
  - **Description:** `resolveDistPath` directly calls `fs.existsSync(candidate)`. `StartServerOptions` omits `fileStorage?: IFileStorage`, preventing memory file storage from being injected at bootstrap.
  - **Impact:** Server cannot run in purely in-memory environments; coupling to host filesystem.
  - **Remediation:** Expose `fileStorage?: IFileStorage` in `StartServerOptions` and check paths via `fileStorage.stat()`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-015]** Socket Transport and Multiplayer Session State Lie Outside Vue Dependency Injection System — [useSocketTransport.ts:60](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L60)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 3: Dependency Direction), `code-organization-principles.md`
  - **Description:** `useSocketTransport` and `room_session_state` use module-scoped singleton variables (`socket`, `isConnected`, `currentRoom`) rather than registering `SOCKET_CLIENT_KEY` in Vue's DI container. Testing relies on ad-hoc global reset hooks (`resetSocketTransportState`).
  - **Impact:** Leaked state between tests; inability to run isolated multi-client instances in single-page test harnesses.
  - **Remediation:** Add `SOCKET_CLIENT_KEY` to DI tokens and provide the socket instance via `createFunChessApp()`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-016]** `RelayAddressService` Leaks Test Double Parameter Across Public Domain API Signatures — [relay_address.service.ts:42-70](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/relay_address.service.ts#L42-L70)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation, Rule 3: Dependency Direction)
  - **Description:** Public interface `IRelayAddressService` exposes `customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>` on every method, falling back to direct `os.networkInterfaces()` calls.
  - **Impact:** Public domain methods are polluted with test parameters; domain service couples directly to Node `os` module.
  - **Remediation:** Extract `INetworkInterfaceProvider` interface and inject it into constructor options.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-017]** Broken Distributed Tracing: Missing `correlationId` Propagation from Gateways into Domain Service Operations — [room.service.ts:105](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L105-L215)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md` (Mandatory context: correlationId: UUID for tracing across services)
  - **Description:** `wrapSocketHandler` creates a `correlationId`, but socket event controllers in `room.socket_handler.ts` and `game.socket_handler.ts` do not forward it into `RoomService` or `GameService`. Over 20 operations emit log entries without `correlationId`.
  - **Impact:** Broken distributed traces in log aggregators; inability to link domain errors back to client socket requests.
  - **Remediation:** Pass `correlationId` through to `RoomService` and `GameService` methods and attach to all operation logs.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-018]** Incomplete 3-Point Lifecycle Logging and Inconsistent Operation Naming in Abandonment Forfeiture — [room.socket_handler.ts:395-433](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L395-L433)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md` (Minimum 3 points per operation, duration, consistent names)
  - **Description:** `onForfeit` in `handleSocketDisconnect` lacks an operation start log, omits `duration` and `durationMs`, and uses mismatched names (`game_abandoned` on success vs `disconnect_grace_period_abandonment` on failure).
  - **Impact:** Missing latency SLA metrics and fragmented query results for match abandonment.
  - **Remediation:** Add entry log with timer, record duration on success and error, and unify operation name to `game_abandoned`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-019]** Monolithic Gateway Middleware: `wrapSocketHandler` Conflates 7 Concerns into 212 Lines (CC 31) — [socket_logging_middleware.ts:530-741](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L530-L741)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md` (Functions: single purpose, 10–50 lines, CC < 10), `core-design-principles.md` (SRP)
  - **Description:** `wrapSocketHandler` combines signature overload parsing, client IP resolution, rate limiting, correlation ID management, inbound payload redaction, Zod schema validation, and error acknowledgment formatting into a single function.
  - **Impact:** High regression risk on middleware changes; difficult to unit test sub-behaviors in isolation.
  - **Remediation:** Decompose into a composable pipeline (`withCorrelation`, `withRateLimit`, `withValidation`, `withLogging`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-020]** Monolithic Server Bootstrap God Functions Violating Size and Complexity Ceilings — [http_server.ts:580-905](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L580-L905) and [index.ts:317-625](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L317-L625)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md` (Functions: 10–50 lines, CC < 10)
  - **Description:** `createHttpServer` spans 326 lines (CC 40) with a 248-line inline request listener closure. `startServer` spans 309 lines (CC 37) combining config, wiring, socket binding, disconnect loops, and shutdown coordination.
  - **Impact:** High cognitive maintenance load; difficulty in testing route dispatch without full server instantiation.
  - **Remediation:** Extract request listener into an `HttpRouter` class and decompose `startServer` into discrete lifecycle steps.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-021]** Excessive Function Length and High Cyclomatic Complexity in Client Feature Composables — [useProgressSync.ts:75-474](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useProgressSync.ts#L75-L474)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md` (Functions: 10–50 lines, CC < 10)
  - **Description:** Multiple composables exceed complexity limits: `useProgressSync.ts` (400 lines, CC 57), `usePuzzleRunner.ts` (388 lines, CC 58), `usePuzzleRush.ts` (341 lines, CC 37), `useScenarioRunner.ts` (335 lines, CC 50), and `useAiMoveExecution.ts` (337 lines, CC 34).
  - **Impact:** Tight coupling between presentation state (modals, shake animations) and domain calculations (ELO, diffing, validation).
  - **Remediation:** Extract modal states into separate composables and parse logic into pure functions.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-022]** Repetitive Error Serialization Snippet Across 33 Files Violating DRY Rule of Three — [room.service.ts:209](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L209-L212)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `core-design-principles.md` (DRY threshold — Rule of Three)
  - **Description:** The 3-line error serialization pattern `error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { raw: err }` is copied verbatim across 33 files.
  - **Impact:** High duplication of error normalization; changes to error formatting require editing dozens of files.
  - **Remediation:** Export `serializeError` and `toErrorMessage` from `@fun-chess/shared/utils`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-023]** Duplicated and Manual `GameOverPayload` Construction in Client Bypassing Shared Factory — [useAiMoveExecution.ts:95-136](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiMoveExecution.ts#L95-L136)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `core-design-principles.md` (DRY), `code-organization-principles.md`
  - **Description:** `useAiMoveExecution.ts` manually constructs `GameOverPayload` in 3 separate branches (checkmate, draw, resignation) instead of using `createGameOverPayload` from `@fun-chess/shared/utils/game_over.ts`.
  - **Impact:** Inconsistent message formatting and duration calculations between AI matches and multiplayer rooms.
  - **Remediation:** Refactor `useAiMoveExecution` to consume `createGameOverPayload`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-024]** Client Auto-Reconnection Silent Failure and Reactive State Desynchronization on Room Expiration — [useRoomSession.ts:282-288](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useRoomSession.ts#L282-L288)
  - **Dimension:** F (Integration Contracts & Database)
  - **Rule Source:** `api-design-principles.md`, `rugged-software-constitution.md` (No silent failures)
  - **Description:** On room expiration, `emitWithTimeout` resolves `{ success: false, error: ... }`, which skips `.catch()` in `checkAndAutoReconnect()`. Furthermore, `onError` clears `sessionStorage` but does not reset `currentRoom.value`, leaving the UI permanently frozen on a disconnected screen.
  - **Impact:** Users returning to an expired room face an unrecoverable frozen UI without navigation back to lobby.
  - **Remediation:** Reset reactive room refs (`resetRoomSessionState(true)`) and trigger `onRoomClosed()` when `ERR_ROOM_NOT_FOUND` or `ERR_UNAUTHORIZED` occurs.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-025]** Dual-Delivery State Inconsistency on `room:reconnect` Socket Event — [room.socket_handler.ts:297-309](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L297-L309)
  - **Dimension:** F (Integration Contracts & Database)
  - **Rule Source:** `docs/api_contracts.md` (Section 2.3: Single Authoritative Ingress Channel)
  - **Description:** On `room:reconnect`, the server still emits `"room:reconnected"` to the socket while simultaneously returning the identical payload in the ack callback. Both handlers mutate reactive state on the client.
  - **Impact:** Redundant re-renders and potential out-of-order race conditions on mobile networks.
  - **Remediation:** Deprecate `"room:reconnected"` socket emission and deliver state strictly through the acknowledgment callback.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-026]** Missing I/O Integration Tests for Client Fetch API Client (`FetchApiClient`) — [fetch_api_client.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L1-L35)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation & Testability Compliance), `testing-strategy.md` (Test Pyramid)
  - **Description:** All tests in `fetch_api_client.spec.ts` mock `globalThis.fetch`. No integration test verifies `FetchApiClient` against a real running Node HTTP server to test genuine network timeouts, abort signals, and header encoding.
  - **Impact:** Client HTTP communication defects can slip into production without verification against genuine HTTP sockets.
  - **Remediation:** Create `fetch_api_client.integration.spec.ts` running against an ephemeral `node:http` server.
  - **Fix workflow:** `/workflow-solo` or direct test addition

- [ ] **[MAJ-027]** Missing Co-located Unit Test Suite and Untested Methods for `DisconnectTimerRegistry` — [disconnect_timer_registry.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/disconnect_timer_registry.ts#L1-L30)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` (Test Co-location)
  - **Description:** No `disconnect_timer_registry.spec.ts` exists. Overwriting existing timers, clearing timers, and `size()` are untested in isolation.
  - **Impact:** Unverified timer eviction logic; risks of orphaned timers or improper grace periods.
  - **Remediation:** Create `disconnect_timer_registry.spec.ts` testing all registry methods with fake timers.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-028]** Unexercised Critical Error Branches in Room Service and Room Socket Handler — [room.service.ts:761](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L761-L773)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `error-handling-principles.md` (Testing Error Paths)
  - **Description:** Forfeit error handling in `handleDisconnectTimeout` (lines 761-773), `finalizeGame` status checks (lines 872, 875), and socket join/leave error branches (lines 116-127, 140-151) lack test coverage.
  - **Impact:** Unhandled rejection risks during socket dropouts and game termination.
  - **Remediation:** Add error branch test cases in `room.service.spec.ts` and `room.socket_handler.spec.ts`.
  - **Fix workflow:** `/bugfix`

---

## Minor Issues
Code maintainability issues, function length/complexity violations, or minor test gaps. Fix in near term.

- [ ] **[MIN-001]** Timing Attack on `METRICS_SECRET` Token Comparison in Telemetry Authorization — [health.controller.ts:43](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/health.controller.ts#L43)
  - **Dimension:** A (Security & Configuration)
  - **Remediation:** Use `crypto.timingSafeEqual` with buffer padding.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-002]** `METRICS_SECRET` Not Enforced in Production Mode Startup Validation — [env.ts:71-89](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L71-L89)
  - **Dimension:** A (Security & Configuration)
  - **Remediation:** Require `METRICS_SECRET` or emit startup warning when `NODE_ENV === "production"`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-003]** Dangling MediaQuery Event Listener and Duplicate Registrations in `useTheme` — [useTheme.ts:78-91](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/composables/useTheme.ts#L78-L91)
  - **Dimension:** B (Reliability & Error Handling)
  - **Remediation:** Guard listener registration behind an idempotent flag and track active listener instance.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-004]** Module-Level Stateful Singletons and Eager Top-Level Execution at Import Time — [local_storage_progress.store.ts:230](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/store/local_storage_progress.store.ts#L230)
  - **Dimension:** C (Testability & Architecture)
  - **Remediation:** Export store factories instead of eager singletons; wire in `createFunChessApp()`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-005]** Cross-Module Boundary Violations in Tests and Features Importing Internal Files Instead of Public APIs — [server_lifecycle.integration.spec.ts:8-9](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/__tests__/server_lifecycle.integration.spec.ts#L8-L9)
  - **Dimension:** C (Testability & Architecture)
  - **Remediation:** Update imports to use feature root `index.ts` entry points.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-006]** `/api/lan-info` Response Omits Distinct Operation Name in Structured Log — [http_server.ts:533-541](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L533-L541)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Pass `{ operation: "lan_info" }` to `sendJsonResponse`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-007]** Unhandled HTTP 404 Route Logs Generic Operation Name — [http_server.ts:861-869](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L861-L869)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Pass `{ operation: "http_not_found" }` in 404 handler options.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-008]** Missing `duration` in Static File System Error & Internal Failure Logs — [static_handler.ts:473-487](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L473-L487)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Include `duration: Math.round(performance.now() - startTime)` in static error logs.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-009]** Missing `correlationId` in Malformed URI Path Traversal Warnings — [static_handler.ts:62-78](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L62-L78)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Forward `correlationId` to `checkPathTraversal`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-010]** HTTP Catch Block Drops Extracted `userId` Context from Error Logs — [http_server.ts:882-892](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L882-L892)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Include `...(userId ? { userId } : {})` in catch block log payload.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-011]** Socket Disconnection and Transport Error Listeners Omit `userId` Context — [index.ts:230-238](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L230-L238)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Attach `socket.data?.userId` to socket disconnect/error logs.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-012]** Background Rate Limiter Pruning Jobs Lack Limiter Identifier — [sliding_window_rate_limiter.ts:54-58](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/rate_limiter/sliding_window_rate_limiter.ts#L54-L58)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Include limiter instance name in job result metadata.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-013]** Client Socket Operation Errors Downgraded to `WARN` on Server Internal Failure — [useSocketTransport.ts:872-887](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L872-L887)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Log at `error` level when error code is `ERR_INTERNAL_SERVER`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-014]** Single Responsibility Violations: Functions Doing Multiple Things ("And" Signal) — [useAppNavigation.ts:108](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/composables/useAppNavigation.ts#L108-L138)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Split functions with "and" into single-purpose functions.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-015]** Constructor Parameter Inconsistency and Asymmetric Interface Contracts Between Progress Stores — [local_storage_progress.store.ts:27-37](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/store/local_storage_progress.store.ts#L27-L37)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Standardize constructor parameters using a typed options object.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-016]** Duplicated Fallback Scenario Restoration Block in `LocalStorageUnifiedStore` — [local_storage_unified.store.ts:93-123](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/store/local_storage_unified.store.ts#L93-L123)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Extract private helper `applyScenarioProgress(map)`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-017]** Triplicated URL Protocol Normalization Logic Across Modules — [env.ts:12-34](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L12-L34)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Consolidate into `safeNormalizeUrl()` in `@fun-chess/shared`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-018]** Unclear Domain Variable Names & Single-Letter Abbreviations — [usePuzzleHints.ts:64-68](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleHints.ts#L64-L68)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Rename abbreviations (`p`, `mIdx`, `f`, `s`) to expressive identifiers.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-019]** Non-Null Assertions (`!`) Lacking Safety Rationale Comments — [audio_synthesizer.ts:394](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/audio/audio_synthesizer.ts#L394)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Add defensive guard clauses or explicit comments justifying safety.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-020]** Dead Deprecated Parameter Overload in `registerGameSocketHandlers` — [game.socket_handler.ts:43-65](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.socket_handler.ts#L43-L65)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Remove obsolete 8-parameter overload.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-021]** Unreachable Spectator Branch in `addPlayerToRoom` — [room.logic.ts:66-75](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.logic.ts#L66-L75)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Remove dead spectator branch or expose via `joinRoom` request.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-022]** Socket Monkey-Patching Via ES6 `Proxy` in `createFeatureSocketHandler` — [socket_handler.utils.ts:47-60](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_handler.utils.ts#L47-L60)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Pass error formatter to rate limiter instead of intercepting `emit` with Proxy.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-023]** Inconsistent Direct `Math.random` Calls Violating I/O Isolation Pattern — [puzzle_catalog.ts:699](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/data/puzzle_catalog.ts#L699)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Pass injectable `randomFn` parameter.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-024]** Client/Server Type Discrepancy on `room:reconnect` Acknowledgment Payload — [events.ts:192-205](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/events.ts#L192-L205)
  - **Dimension:** F (Integration Contracts & Database)
  - **Remediation:** Add `roomStatus` and `sessionToken` to client generic type in `useRoomSession.ts:468`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-025]** Absence of Base Entity Audit Timestamps (`createdAt`, `updatedAt`) on `Player` — [models.ts:53-70](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/models.ts#L53-L70)
  - **Dimension:** F (Integration Contracts & Database)
  - **Remediation:** Add `createdAt: number` and `updatedAt: number` to `Player` interface and schema.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-026]** Missing API Path Versioning on Native HTTP Endpoints (`/api/v1/...`) — [http_server.ts:336](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L336)
  - **Dimension:** F (Integration Contracts & Database)
  - **Remediation:** Expose `/api/v1/lan-info` and `/api/v1/health` with backward-compatible aliases.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-027]** Non-Standard Root JSON Format for HTTP Success Responses vs Standard Envelope — [lan_info.controller.ts:18-20](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/lan_info.controller.ts#L18-L20)
  - **Dimension:** F (Integration Contracts & Database)
  - **Remediation:** Wrap `/api/v1/lan-info` in `{ data: ... }` envelope or document ADR exemption.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-028]** Secondary Reverse Index Memory Retention in `InMemoryRoomStore.findBySocketId` Fallback — [in_memory_room.store.ts:276-316](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L276-L316)
  - **Dimension:** F (Integration Contracts & Database)
  - **Remediation:** In fallback scan, re-index the found room (`this.indexSockets(room)`).
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-029]** Unused and Outdated Dependency in Root Manifest (`chess.js: 1.0.0-beta.9`) — [package.json:37](file:///home/irahardianto/works/projects/fun-chess/package.json#L37)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Remediation:** Remove `"chess.js": "1.0.0-beta.9"` from root `package.json`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-030]** Floating Semver Ranges for Workspace Dependencies in Production Manifests — [package.json:20](file:///home/irahardianto/works/projects/fun-chess/apps/server/package.json#L20)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Remediation:** Pin workspace dependencies to exact versions (`workspace:1.0.0`).
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-031]** Test Double Embedded in Production Source File (`MockRelayAddressService`) — [relay_address.service.ts:390](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/relay_address.service.ts#L390)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Remediation:** Move `MockRelayAddressService` to `mock_relay_address.service.ts`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-032]** Incomplete Unit Testing for Core Platform Logger Methods (`pino_logger.ts` & `job_runner.ts`) — [pino_logger.ts:140](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/logger/pino_logger.ts#L140)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Remediation:** Add unit tests for `trace()`, `fatal()`, and nested object sanitization.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-033]** Missing Telemetry Authorization Unit Tests in Health Controller — [health.controller.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/health.controller.ts#L1)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Remediation:** Add unit test describe block for `isTelemetryAuthorized` in `health.controller.spec.ts`.
  - **Fix workflow:** `/bugfix`

---

## Enhancement Issues
Non-critical suggestions, defense-in-depth, documentation, or minor clarity refactorings.

- [ ] **[ENH-001]** Permissive Wildcard CORS (`*`) Supported in Non-Production Mode — [http_server.ts:213-215](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L213-L215)
  - **Dimension:** A (Security & Configuration)
  - **Suggestion:** Restrict wildcard origins even in development to specific localhost/127.0.0.1 ports.
  - **Fix workflow:** `/workflow-solo` or backlog

- [ ] **[ENH-002]** Missing Input Length Restrictions and Autocomplete Controls on Custom Host IP Input — [QrCodeModal.vue:363-375](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/QrCodeModal.vue#L363-L375)
  - **Dimension:** A (Security & Configuration)
  - **Suggestion:** Add `maxlength="15"`, `autocomplete="off"`, and `spellcheck="false"` to custom IP input.
  - **Fix workflow:** `/workflow-solo` or backlog

- [ ] **[ENH-003]** Defensive `JSON.parse` Body Fallback in `FetchApiClient` Discards Non-JSON Error Text on Parser Failure — [fetch_api_client.ts:175-185](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L175-L185)
  - **Dimension:** B (Reliability & Error Handling)
  - **Suggestion:** Fallback to raw response text when `response.json()` throws.
  - **Fix workflow:** `/workflow-solo` or backlog

- [ ] **[ENH-004]** WebRTC Discovery Timeout Lacks Gathering Status Telemetry on Failure — [webrtc_discovery.ts:98-111](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/hardware/webrtc_discovery.ts#L98-L111)
  - **Dimension:** B (Reliability & Error Handling)
  - **Suggestion:** Log `pc.iceGatheringState` on discovery timeout.
  - **Fix workflow:** `/workflow-solo` or backlog

- [ ] **[ENH-005]** Redundant Implementations of `SystemClock` Across Three Workspaces — [system_clock.ts:7](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/system_clock.ts#L7)
  - **Dimension:** C (Testability & Architecture)
  - **Suggestion:** Re-export `SystemClock` from `@fun-chess/shared` and remove duplicates in server and client.
  - **Fix workflow:** `/refactor`

- [ ] **[ENH-006]** Missing Formal Interface Contract for Rate Limiting Infrastructure — [sliding_window_rate_limiter.ts:37](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/rate_limiter/sliding_window_rate_limiter.ts#L37)
  - **Dimension:** C (Testability & Architecture)
  - **Suggestion:** Define `IRateLimiter` interface in `platform/rate_limiter`.
  - **Fix workflow:** `/workflow-solo` or backlog

- [ ] **[ENH-007]** `DEFAULT_REDACT_PATHS` Omits HTTP Session Token Header Formats — [pino_logger.ts:35-101](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/logger/pino_logger.ts#L35-L101)
  - **Dimension:** D (Observability & Logging)
  - **Suggestion:** Add `headers['x-session-token']` and `headers['session-token']` to Pino redact paths.
  - **Fix workflow:** `/workflow-solo` or backlog

- [ ] **[ENH-008]** Missing `correlationId` in `RelayAddressService` Diagnostics Logs — [relay_address.service.ts:106-113](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/relay_address.service.ts#L106-L113)
  - **Dimension:** D (Observability & Logging)
  - **Suggestion:** Accept `correlationId?: string` in `RelayAddressConfig`.
  - **Fix workflow:** `/workflow-solo` or backlog

- [ ] **[ENH-009]** `ShutdownCoordinator` Cleanup Tasks Omit Execution Latency Measurement — [shutdown_coordinator.ts:107-121](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L107-L121)
  - **Dimension:** D (Observability & Logging)
  - **Suggestion:** Record `performance.now()` timing for each cleanup callback.
  - **Fix workflow:** `/workflow-solo` or backlog

- [ ] **[ENH-010]** WebRTC Local IP Discovery in Client Lacks Operation Start & Completion Telemetry — [webrtc_discovery.ts:24-113](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/hardware/webrtc_discovery.ts#L24-L113)
  - **Dimension:** D (Observability & Logging)
  - **Suggestion:** Add operation start and success logging for local IP discovery.
  - **Fix workflow:** `/workflow-solo` or backlog

- [ ] **[ENH-011]** Redundant Legacy Alias File `local_storage_puzzle_store.ts` — [local_storage_puzzle_store.ts:1-3](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/local_storage_puzzle_store.ts#L1-L3)
  - **Dimension:** E (Code Quality & Patterns)
  - **Suggestion:** Remove alias file and consolidate imports on canonical store file.
  - **Fix workflow:** `/refactor`

- [ ] **[ENH-012]** Monolithic Vue Components with Embedded Scoped Styles (>600 lines) — [QrCodeModal.vue:1-942](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/QrCodeModal.vue#L1-L942)
  - **Dimension:** E (Code Quality & Patterns)
  - **Suggestion:** Extract shared modal CSS into modular stylesheets.
  - **Fix workflow:** `/workflow-solo` or backlog

- [ ] **[ENH-013]** Deep Cloning on High-Frequency Read Queries in `InMemoryRoomStore` — [in_memory_room.store.ts:270-274](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L270-L274)
  - **Dimension:** F (Integration Contracts & Database)
  - **Suggestion:** Return frozen references (`Object.freeze`) for read queries to reduce GC allocations.
  - **Fix workflow:** `/workflow-solo` or backlog

- [ ] **[ENH-014]** Client Storage Key Deprecation Pruning Requires User Visit After 30 Days — [migration.ts:72-91](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/migration.ts#L72-L91)
  - **Dimension:** F (Integration Contracts & Database)
  - **Suggestion:** Document opportunistic client-side pruning behavior in architecture ADR.
  - **Fix workflow:** Documentation

- [ ] **[ENH-015]** Absence of Cancellation `AbortSignal` in Data Store Interfaces — [room.store.ts:25-50](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.store.ts#L25-L50)
  - **Dimension:** F (Integration Contracts & Database)
  - **Suggestion:** Add optional `options?: { signal?: AbortSignal }` to `RoomStore` and `SessionRegistry`.
  - **Fix workflow:** `/refactor`

- [ ] **[ENH-016]** Missing API E2E Tests for Telemetry Access Controls and Static Asset Serving — [health.api.spec.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/api/health.api.spec.ts#L1-L30)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Suggestion:** Add `apps/e2e/api/telemetry.api.spec.ts` and `static.api.spec.ts`.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-017]** Missing UI E2E Journeys for Avatar Customization and Lesson Category Progression — [academy.e2e.test.ts:5](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/academy.e2e.test.ts#L5-L25)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Suggestion:** Add Playwright tests for avatar selection persistence and multi-category lesson completion.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-018]** Missing `HTMLCanvasElement.prototype.getContext` Mock in Root App Unit Tests — [App.spec.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/__tests__/App.spec.ts#L1-L30)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Suggestion:** Add global jsdom canvas getContext stub in `App.spec.ts`.
  - **Fix workflow:** `/bugfix`

---

## Verification Suite Results
- **Linter & Static Analysis:** PASS (eslint . --no-inline-config --max-warnings 0 passed with 0 errors, 0 warnings)
- **Typecheck:** PASS (shared, server, client, and e2e typecheck passed with 0 errors)
- **Automated Tests:** PASS (2,640 passed, 0 failed across 177 test files: 2,519 unit, 121 integration)
- **Build Verification:** PASS (pnpm run build passed across all packages)
- **Test Coverage:**
  - `@fun-chess/shared`: Statements: 98.33%, Branches: 91.15%, Functions: 99.21%, Lines: 99.12% (PASS)
  - `@fun-chess/client`: Statements: 99.1%, Branches: 90.7%, Functions: 98.8%, Lines: 99.2% (PASS)
  - `@fun-chess/server`: Statements: 94.66%, Branches: 84.63%, Functions: 94.59%, Lines: 95.22% (FAIL — Branch coverage 84.63% is below 85.00% threshold)

---

## Cross-Dimension Correlations
Findings spanning multiple dimensions with escalated severity:

1. **Telemetry Authorization Bypass & Missing Test Coverage:**
   - Dimension A identified `[CRIT-001]` where invalid IPs in `normalizeIp` fail-open to `"127.0.0.1"`, enabling remote access to `/metrics` and `/health/detail`.
   - Dimension G identified `[MIN-033]` where `isTelemetryAuthorized` had zero unit tests in `health.controller.spec.ts`.
   - Dimension A identified `[MIN-001]` timing attacks on `METRICS_SECRET`.
   - *Correlation Impact:* Lack of unit testing on telemetry authorization masked a fail-open loopback bypass and side-channel timing attack. Severity maintained at **CRITICAL**.

2. **Session Token Credential Exposure in Logs & Silent Error Swallowing:**
   - Dimension A identified `[MAJ-001]` where `extractHttpUserId` extracts session tokens into `userId` which is not redacted by Pino.
   - Dimension D identified `[MAJ-002]` where `InMemorySessionRegistry` logs cleartext session tokens directly in metadata.
   - Dimension B identified `[MAJ-001]` where `extractHttpUserId` swallows query parsing errors silently with `catch (_err) { void _err; }`.
   - *Correlation Escalation:* Multi-dimension convergence across Security, Reliability, and Observability on credential handling. Escalated from MAJOR to **CRITICAL [CRIT-002]**.

3. **Room Reconnect Desynchronization, Socket Dual Delivery & Untested Error Branches:**
   - Dimension F identified `[MAJ-024]` client auto-reconnect silent failure on room expiration.
   - Dimension F identified `[MAJ-025]` dual delivery on `room:reconnect`.
   - Dimension F identified `[MIN-024]` client ack type discrepancy omitting `roomStatus`.
   - Dimension G identified `[MAJ-028]` unexercised error paths in room socket handler.
   - Dimension C identified `[MAJ-009]` circular coupling between `useRoomSession` and `useGameActions`.
   - *Correlation Escalation:* Reconnection robustness is compromised across transport, typing, state management, and test coverage. Elevated to top priority for next bugfix release.

4. **Monolithic Middleware and Server Bootstrap God Functions:**
   - Dimension E identified `[MAJ-019]` `wrapSocketHandler` (212 lines, CC 31) conflating 7 responsibilities.
   - Dimension B identified `[MAJ-007]` callback exception escapes in `wrapSocketHandler`.
   - Dimension E identified `[MAJ-020]` `createHttpServer` (326 lines) and `startServer` (309 lines).
   - *Correlation Impact:* Monolithic gateway functions directly contribute to error escape vulnerabilities and testing impediments.

---

## Dimensions Covered
| Dimension | Status | Files / Queries Examined |
|---|---|---|
| A. Security & Configuration | ✅ Checked | 75 files scanned: injection, XSS, SSRF, path traversal, auth/telemetry bypass, secret leakage, .env.template hygiene, gitleaks commit history |
| B. Reliability & Error Handling | ✅ Checked | 46 files scanned: swallowed errors, unclosed timers, stack overflow recursion, callback error escalation, DOM listener leaks |
| C. Testability & Architecture | ✅ Checked | 42 files scanned: I/O isolation, pure business logic, dependency direction, circular dependencies (`dpdm`), DI container coverage |
| D. Observability & Logging | ✅ Checked | 42 files scanned: operation entry point logging, 3 mandatory log points, correlationId propagation, redaction paths, log levels |
| E. Code Quality & Patterns | ✅ Checked | 622 files scanned: function complexity (>50 lines, CC >10), DRY Rule of Three (error serializers, GameOverPayload), naming clarity |
| F. Integration Contracts & DB | ✅ Checked | 38 files scanned: HTTP/Socket.io contract alignment, ack types, reverse index memory retention, client storage 2PC & migrations |
| G. Dependencies & Tests | ✅ Checked | 26 files scanned: pnpm audit CVE scan, version pinning, lockfile tracking, unit/integration/E2E test gaps, coverage thresholds |

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

1. **[CRIT-001]** — Fix fail-open fallback in `normalizeIp` to return `"unknown"` and add unit tests for `isTelemetryAuthorized` → `/bugfix` (Immediate)
2. **[CRIT-002]** — Remove session tokens from `extractHttpUserId`, scrub tokens from `InMemorySessionRegistry` logs, remove empty catch block → `/bugfix` (Immediate)
3. **[MAJ-001]** — Fix server branch coverage gate failure (84.63% -> >86%) by testing unexercised branches in `in_memory_room.store.ts`, `room.socket_handler.ts`, `pino_logger.ts` → `/bugfix`
4. **[MAJ-002]** — Wire `env.MAX_ROOMS` to `InMemoryRoomStore` at server bootstrap → `/bugfix`
5. **[MAJ-003]** — Document `METRICS_SECRET`, `SESSION_SECRET`, and `MAX_ROOMS` in `.env.template` and `docker-compose.yml` → `/bugfix`
6. **[MAJ-005]** — Clear timeout timer in `FunChessServer.close()` finally block → `/bugfix`
7. **[MAJ-006]** — Add cycle detection and recursion depth ceiling to `canonicalJsonStringify` → `/bugfix`
8. **[MAJ-007]** — Guard client callback invocations in `dispatchResponse` against synchronous exceptions → `/bugfix`
9. **[MAJ-017]** — Propagate `correlationId` from socket controllers into `RoomService` and `GameService` operations → `/bugfix`
10. **[MAJ-018]** — Implement 3-point lifecycle logging and consistent naming for game abandonment → `/bugfix`
11. **[MAJ-024]** — Reset reactive room refs and trigger `onRoomClosed()` on client auto-reconnect room expiration → `/bugfix`
12. **[MAJ-025]** — Eliminate dual-delivery on `room:reconnect` socket event → `/bugfix`
13. **[MAJ-027]** — Create co-located `disconnect_timer_registry.spec.ts` test suite → `/bugfix`
14. **[MAJ-028]** — Exercise forfeit and room deletion error branches in room tests → `/bugfix`
15. **[MAJ-008]** — Break circular dependency in shared contracts (`models.ts` ⇄ `schemas.ts` ⇄ `puzzle.ts`) → `/refactor`
16. **[MAJ-009]** — Decouple `useRoomSession` and `useGameActions` circular dependency → `/refactor`
17. **[MAJ-010]** — Remove logger imports and side-effect logging from pure engine files → `/refactor`
18. **[MAJ-011]** — Abstract browser `navigator.onLine` behind `INetworkMonitor` and Vue DI → `/refactor`
19. **[MAJ-012]** — Inject `IClock` into services and controllers calling `Date.now()` → `/refactor`
20. **[MAJ-014]** — Expose `fileStorage?: IFileStorage` in `StartServerOptions` → `/refactor`
21. **[MAJ-015]** — Register socket client in Vue DI container (`SOCKET_CLIENT_KEY`) → `/refactor`
22. **[MAJ-019]** — Decompose `wrapSocketHandler` into composable middleware pipeline → `/refactor`
23. **[MAJ-020]** — Extract `HttpRouter` from `createHttpServer` and modularize `startServer` → `/refactor`
24. **[MAJ-021]** — Decompose client god composables (`useProgressSync`, `usePuzzleRunner`, `useScenarioRunner`) → `/refactor`
25. **[MAJ-022]** — Centralize `serializeError` helper in `@fun-chess/shared` to eliminate 33 duplicated blocks → `/refactor`
26. **[MAJ-026]** — Add `fetch_api_client.integration.spec.ts` against real HTTP server → `/workflow-solo`
27. **[MIN-001] – [MIN-033]** — Remediate minor code quality, documentation, and logging items → `/bugfix` / near term
28. **[ENH-001] – [ENH-018]** — Implement defensive enhancements, e2e journeys, and CSS modularization → Backlog
