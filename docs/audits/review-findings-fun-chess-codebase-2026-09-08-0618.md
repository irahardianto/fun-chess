# Code Audit: Full Codebase (Fun Chess Monorepo)
Date: 2026-09-08
Auditor: AI Code Audit (multi-dimensional, 7 parallel subagents)

## Executive Summary
- **Dimensions activated:** A (Security & Configuration), B (Reliability & Error Handling), C (Testability & Architecture), D (Observability & Logging), E (Code Quality & Patterns), F (Integration Contracts & Boundaries), G (Dependencies & Test Coverage Gaps)
- **Dimensions skipped:** None (all 7 dimensions activated; database scope adapted to in-memory room store, session registry, and client-side structured local storage)
- **Files scanned:** 529 files across `shared/`, `apps/server/`, `apps/client/`, `apps/e2e/`, `infra/`, and root configuration
- **Findings:** 73 total (3 critical, 28 major, 28 minor, 14 enhancement)
- **Automated verification:** Lint: PASS (0 type errors, 0 typos, 0 gitleaks leaks, 15 CI/package-manager semgrep notices) | Tests: PASS (2,499 passed, 0 failed, 0 skipped across 187 Vitest test files + 21 Playwright E2E journeys) | Build: PASS (Client + Server + Shared bundle built in 6.5s) | Coverage: PASS (Shared 95.33%, Server 93.31%, Client 93.15%)
- **Overall codebase health:** NEEDS ATTENTION (Solid test suite and zero typecheck errors, but 3 critical risks around client progress loss on upgrade, leaked server disconnect timers firing false game-over events, and test backdoor shims in production socket composables require remediation before release)

---

## Critical Issues
Vulnerabilities or severe defects that cause active security breaches, data loss, or system failure. Must be fixed immediately.

- [ ] **[CRIT-001] Client-Side Storage Migration Dead Code and Irreversible Data Loss** — [apps/client/src/platform/storage/keys.ts:27-56](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/keys.ts#L27-L56)
  - **Dimension:** F (Integration Contracts & Storage)
  - **Rule Source:** `database-design-principles.md` (Migration Safety: "Never drop columns/keys without deprecation; Additive changes first") & `rugged-software-constitution.md` (Data Loss Prevention)
  - **Description:** `migrateStorageV1ToV2` is defined in `keys.ts` but is never invoked anywhere in application bootstrap or store instantiation. Consequently, users with historical puzzle training progress under legacy keys (`fun_chess_puzzle_progress_v1` or `fun_chess_puzzle_progress`) experience complete data loss upon upgrading, as `LocalStoragePuzzleProgressStore` reads strictly from the v2 key (`fun_chess_puzzle_progress_v2`). Furthermore, lines 47–48 execute immediate, destructive deletions (`storage.removeItem(...)`) with no deprecation period or rollback window.
  - **Impact:** Existing users lose all puzzle progress, streak milestones, and rating history upon updating.
  - **Evidence:**
    ```typescript
    // apps/client/src/platform/storage/keys.ts:47-48
    storage.removeItem(STORAGE_KEYS.PUZZLE_PROGRESS_V1);
    storage.removeItem(STORAGE_KEYS.PUZZLE_PROGRESS_LEGACY);
    ```
  - **Remediation:** Wire `migrateStorageV1ToV2(safeLocalStorage)` into `apps/client/src/main.ts` prior to store mounting. Retain legacy keys as fallback or set a 30-day deprecation timestamp before deletion.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-002] Disconnect Timer Registry Not Injected into Game Socket Handlers, Causing Abandonment Timer Leaks and Erroneous Duplicate `game:over` Events** — [apps/server/src/index.ts:198](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L198)
  - **Dimension:** B (Reliability & Error Handling), escalated via C (Architecture)
  - **Rule Source:** `error-handling-principles.md` (State Consistency & Failure Recovery) & `resources-and-memory-management-principles.md` (Timer Hygiene)
  - **Description:** `startServer(options)` in `apps/server/src/index.ts` accepts an injected `timerRegistry: IDisconnectTimerRegistry`. However, when registering game socket handlers, the 6th argument (`timerRegistry`) is omitted:
    `registerGameSocketHandlers(io, socket, gameService, logger, rateLimiter);`
    Inside `registerGameSocketHandlers.ts`, the parameter defaults to a separate module-level singleton `defaultDisconnectTimerRegistry`. When a non-default registry is passed (e.g. in test suites, custom runners, or cluster instances), disconnect timers are recorded in `options.timerRegistry`, but normal game completion (`game:move`, `game:resign`, `game:respond_draw`) cancels timers only on `defaultDisconnectTimerRegistry`.
  - **Impact:** The 60-second abandonment timer continues running in the background after a game has concluded. After 60 seconds, the orphaned timer fires and broadcasts an erroneous duplicate `game:over` event with reason `"abandoned"`, overwriting the real match outcome in room state and player history.
  - **Evidence:**
    ```typescript
    // apps/server/src/index.ts:198
    registerGameSocketHandlers(io, socket, gameService, logger, rateLimiter); // Missing 6th arg: timerRegistry
    ```
  - **Remediation:** Pass `timerRegistry` explicitly in `apps/server/src/index.ts`:
    ```typescript
    registerGameSocketHandlers(io, socket, gameService, logger, rateLimiter, timerRegistry);
    ```
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-003] Test Backdoor Shim Hardcoded in Production Socket Composable & Reconnect Desynchronization** — [apps/client/src/composables/useSocket.ts:1003-1007](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L1003-L1007), [apps/client/src/composables/useSocket.ts:353-370](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L353-L370)
  - **Dimension:** E (Code Quality) & F (Integration Contracts), escalated via C & D convergence
  - **Rule Source:** `core-design-principles.md` (Principle of Least Astonishment), `api-design-principles.md` (State Consistency), `rugged-software-constitution.md`
  - **Description:** 
    1. The production `leaveRoom` function in `useSocket.ts` contains hardcoded conditional logic explicitly matching test socket ID `'shared_socket_456'`. If this magic ID matches, `finalize(true)` is executed synchronously, bypassing real socket event acknowledgement and teardown.
    2. In `handleRoomReconnected` (lines 353–370), when a player reconnects to an ongoing room, `currentRoom.value` is updated, but pending `drawOffer` and `rematch` states are never re-hydrated into reactive refs `drawOfferedBy` and `rematchRequestedBy`. Consequently, the reconnected player's UI never shows the draw or rematch response banner, and the room becomes permanently locked from further draw or rematch proposals.
  - **Impact:** Magic test strings leak into production execution paths; reconnection after momentary network blips permanently disables draw/rematch resolution for the match.
  - **Evidence:**
    ```typescript
    // apps/client/src/composables/useSocket.ts:1003-1006
    if ((s as any)?.id === 'shared_socket_456') {
      finalize(true);
    }
    ```
  - **Remediation:** Remove the `'shared_socket_456'` check and require test harnesses to pass mock socket adapters via injection. In `handleRoomReconnected`, inspect `data.room.drawOffer` and `data.room.rematch` to restore `drawOfferedBy.value` and `rematchRequestedBy.value`.
  - **Fix workflow:** `/bugfix` — immediate priority

---

## Major Issues
Structural violations, missing I/O error handling, untested critical paths, or broken contracts. Must be fixed before release.

- [ ] **[MAJ-001] Programmatic Server Bootstrap Bypasses Zod Configuration Validation** — [apps/server/src/index.ts:77-88](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L77-L88)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `configuration-management-principles.md` (Startup Validation) & `security-mandate.md` (Fail Securely)
  - **Description:** `startServer(options)` validates `process.env` against `ServerEnvSchema` via `loadServerConfig(process.env)` before merging `options.config`, `options.port`, or `options.host`. The resulting merged configuration object is never re-validated against the schema.
  - **Impact:** Programmatic options bypass schema rules: invalid ports, malformed log levels, or insecure CORS origins (`*` in production) are accepted without failing fast.
  - **Remediation:** Merge raw input dictionaries first, then validate the combined object via `loadServerConfig(mergedRawEnv)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-002] Vite Dev Server Binds to `0.0.0.0` with DNS Rebinding Protection Disabled (`allowedHosts: true`)** — [apps/client/vite.config.ts:177-179](file:///home/irahardianto/works/projects/fun-chess/apps/client/vite.config.ts#L177-L179)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `security-mandate.md` (Defense in Depth) & `rugged-software-constitution.md`
  - **Description:** In `vite.config.ts`, `allowedHosts: true` explicitly disables Vite 6's DNS rebinding protections while binding to `0.0.0.0`. Malicious public sites can resolve a public hostname to `127.0.0.1` or LAN IPs and interact with the Vite dev server and backend proxy.
  - **Remediation:** Replace `allowedHosts: true` with explicit hostname whitelisting: `allowedHosts: ['localhost', '127.0.0.1', '.local']`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-003] Default Rate Limit in Templates Causes Denial of Service for Co-located LAN Players** — [.env.template:57](file:///home/irahardianto/works/projects/fun-chess/.env.template#L57), [.env.example:54](file:///home/irahardianto/works/projects/fun-chess/.env.example#L54), [apps/server/src/platform/socket/socket_rate_limiter.ts:37-59](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L37-L59)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `security-mandate.md` (Availability & Rate Limiting)
  - **Description:** The template environment sets default rate limits to 5 requests per 10 seconds (`RATE_LIMIT_MAX_REQUESTS=5`). In `SocketRateLimiter`, limits are keyed solely by IP address. Two LAN players on the same Wi-Fi sharing an IP will exceed 5 combined requests within seconds during a fast match, triggering `ERR_RATE_LIMITED` and causing move drops.
  - **Remediation:** Increase default template limits to 60 req/10s and key socket rate limits by `(ip, socket.id)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-004] Swallowed Asynchronous Errors in `server.close` and `io.close` During Shutdown** — [apps/server/src/platform/lifecycle/shutdown_coordinator.ts:129-136](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L129-L136)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `error-handling-principles.md` (No Silent Failures) & `rugged-software-constitution.md`
  - **Description:** `ShutdownCoordinator.closeServer()` discards callback error arguments from `this.io.close()` and `this.server.close()`, unconditionally resolving the Promises. Unclosed sockets or file descriptor errors are reported as clean (`exit 0`).
  - **Remediation:** Check callback `err` and reject the Promise if an error occurred: `this.io.close(err => err ? reject(err) : resolve())`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-005] Missing Execution Timeout on Locked Critical Sections in `InMemoryRoomStore.withLock()`** — [apps/server/src/features/rooms/in_memory_room.store.ts:131-146](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L131-L146)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `resources-and-memory-management-principles.md` (Lock Hygiene)
  - **Description:** `withLock(roomId, action)` guards lock acquisition with a 5000ms timeout, but `await action()` inside the critical section has no timeout. If `action()` stalls or awaits an unresolved promise, the lock is held indefinitely, causing all subsequent room operations to fail with `TIMEOUT`.
  - **Remediation:** Race `action()` against an execution timeout promise.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-006] Swallowed Simulation Errors in Puzzle Tactical Motif Analysis** — [apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts:875-887](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts#L875-L887)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `error-handling-principles.md` (Zero Tolerance for Empty Catch Blocks)
  - **Description:** In `analyzePuzzleSolution()`, invalid or ambiguous moves that throw in `chess.move(move)` are caught with an empty catch block (`catch {}`). The loop continues simulating on an illegal board, generating false tactical motifs and corrupted pedagogical advice.
  - **Remediation:** Log the error and break out of simulation when a move fails.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-007] Resource Leak of `RTCPeerConnection` and Timeout on WebRTC Failure** — [apps/client/src/composables/useLanDiscovery.ts:16-77](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useLanDiscovery.ts#L16-L77)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `resources-and-memory-management-principles.md` (Resource Cleanup)
  - **Description:** `detectWebRtcLanIp()` sets a 3-second timer and creates an `RTCPeerConnection`. If `createDataChannel` or `createOffer` throws synchronously inside `try`, execution jumps to `catch` where `clearTimeout(timer)` and `pc.close()` are never invoked.
  - **Remediation:** Add `finally` block or invoke `clearTimeout` and `pc.close()` in `catch`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-008] Unbounded Minimax Chess Search Main Thread Execution** — [apps/client/src/features/ai/engine/minimax_engine.ts:310-368](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/engine/minimax_engine.ts#L310-L368)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `resources-and-memory-management-principles.md` (CPU & Execution Timeouts)
  - **Description:** Recursive alpha-beta minimax search executes synchronously on the browser UI thread without node iteration abort limits or deadline checks (`performance.now() >= deadline`), causing UI freezes on complex positions.
  - **Remediation:** Introduce periodic deadline checks inside tree traversal or offload search to a Web Worker.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-009] Client DI Container Bypassed in Favor of Hardcoded Global Singletons** — [apps/client/src/App.vue:9-12](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L9-L12)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1 & Rule 3) & `testability-patterns`
  - **Description:** Vue injection tokens are defined in `@/platform/di` and provided in `main.ts`, but production components and composables directly import concrete singletons (`apiClient`, `safeLocalStorage`, `audioSynthesizer`, `logger`), forcing client unit tests to use `vi.mock` monkey-patching instead of providing mock adapters.
  - **Remediation:** Refactor composables and components to consume dependencies via `useInject*` helpers with optional parameter fallbacks.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-010] Cross-Module Boundary Violations Bypassing Public Feature Barrels** — [apps/server/src/index.ts:32-35](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L32-L35), [apps/client/src/main.ts:15-18](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L15-L18)
  - **Dimension:** C (Architecture) & E (Code Quality)
  - **Rule Source:** `code-organization-principles.md` (Module Boundaries)
  - **Description:** `apps/server/src/index.ts` imports directly from `./features/rooms/room.socket_handler.js` and `./features/game/game.socket_handler.js`; `apps/client/src/main.ts` imports directly from internal store files rather than feature public exports.
  - **Remediation:** Standardize all external imports to reference the feature/platform barrel entry points (`index.ts`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-011] Module-Level Global Reactive State Causing Cross-Test Pollution** — [apps/client/src/composables/useSocket.ts:132-139](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L132-L139)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `architectural-pattern.md` (Testability-First Design)
  - **Description:** `useSocket.ts`, `useNetworkStatus.ts`, and `usePwaInstall.ts` declare reactive refs (`socket`, `currentRoom`, `isOnlineState`, `deferredPrompt`) at module scope outside the composable functions, creating mutable global state shared across all tests and components.
  - **Remediation:** Encapsulate state within a Pinia store or provider factory with explicit reset lifecycle hooks.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-012] Un-abstracted Browser/Web APIs in Feature Code** — [apps/client/src/composables/useLanDiscovery.ts:18-72](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useLanDiscovery.ts#L18-L72), [progress_file.service.ts:41-48](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/services/progress_file.service.ts#L41-L48)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation)
  - **Description:** Direct invocations of `RTCPeerConnection`, `navigator.mediaDevices.getUserMedia`, DOM link download creation (`document.createElement('a')`), and `navigator.vibrate` occur without interface contracts or test adapters.
  - **Remediation:** Introduce platform interface contracts (`IFileDownloader`, `IHapticsService`, `IWebRtcDiscovery`) with production and mock doubles.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-013] Impure Business Logic and Non-Deterministic Time Operations in Domain Functions** — [shared/src/utils/dictionary_mapper.ts:39](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/dictionary_mapper.ts#L39), [progress_merger.ts:199](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_merger.ts#L199)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 2: Pure Business Logic)
  - **Description:** `DefaultDictionaryMapper` and `mergeUnifiedProgress` default timestamp parameters to `Date.now()`. Calling `toCompact(payload)` multiple times on identical input yields differing compact outputs and CRC32 checksums.
  - **Remediation:** Require `now: number` as an explicit parameter passed in by caller services.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-014] Reverse Dependency Direction: Domain Features Importing Platform Infrastructure** — [apps/server/src/features/rooms/clock.ts:1-2](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/clock.ts#L1-L2)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 3: Dependency Direction)
  - **Description:** Domain features (`features/rooms` and `features/game`) import concrete infrastructure classes (`SystemClock`, `UuidGenerator`) from `platform/time` via local re-export shims and instantiate them in constructor default parameters.
  - **Remediation:** Move `IClock` and `IIdGenerator` interfaces to `@fun-chess/shared` or the domain layer; inject them explicitly at the composition root.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-015] Lack of Pure Business Logic Layer in Server Rooms Feature** — [apps/server/src/features/rooms/room.service.ts:55-122](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L55-L122)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 2) & `code-organization-principles.md`
  - **Description:** Room state transitions, color assignment, spectator classification, and status mutations are directly intermingled with async store mutex callbacks inside `RoomService` rather than residing in a pure `room.logic.ts` module.
  - **Remediation:** Extract state transition logic into pure functions following the Fetch → Calculate → Persist pattern.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-016] Server Composition Root Bound to Concrete `InMemoryRoomStore`** — [apps/server/src/index.ts:49,60](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L49)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1 & Rule 3)
  - **Description:** `StartServerOptions` and `ServerInstance` type the `roomStore` property specifically to `InMemoryRoomStore` rather than the `RoomStore` interface contract, preventing alternative store adapters from being supplied.
  - **Remediation:** Change `roomStore?: InMemoryRoomStore` to `roomStore?: RoomStore`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-017] Cross-Feature Coupling: `GameService` Mutating `RoomStore` Directly** — [apps/server/src/features/game/game.service.ts:20,44](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L20)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `code-organization-principles.md` (Feature Interaction)
  - **Description:** `GameService` directly accepts `RoomStore` and performs raw room mutations (`this.store.mutate(...)`) bypassing `RoomService` contracts.
  - **Remediation:** Define a game update contract on `RoomService` or extract a unified match orchestrator.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-018] Unmanaged Global Background Intervals on Module Import** — [apps/server/src/features/rooms/room.socket_handler.ts:45](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L45)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation) & `resources-and-memory-management-principles.md`
  - **Description:** Exporting `defaultSocketRateLimiter = createSocketRateLimiter()` causes a background pruning `setInterval` to start immediately upon module evaluation, leaking timers even when `startServer()` is not running.
  - **Remediation:** Remove module-level singleton instantiations and pass rate limiters explicitly from `startServer()`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-019] Unlogged Network Socket Operation Entry Points in Client Composable** — [apps/client/src/composables/useSocket.ts:562-1060](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L562-L1060)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md` (Universal Requirement: All Operations Must Be Logged)
  - **Description:** Public socket client operations (`createRoom`, `joinRoom`, `makeMove`, `resign`, `offerDraw`, `respondRematch`) lack structured 3-point logging (start, success with duration, failure with correlationId).
  - **Remediation:** Wrap client socket operations with telemetry logging matching the pattern established in `FetchApiClient`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-020] Unlogged Two-Phase Commit Multi-Store Transaction in Unified Storage** — [apps/client/src/features/portability/store/local_storage_unified.store.ts:60-140](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/store/local_storage_unified.store.ts#L60-L140)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md` (Mandatory Logging: Database Transactions)
  - **Description:** Atomic 2PC progress overwrite lacks operation start/success logs and duration tracking. Furthermore, if staged write fails but compensating rollback succeeds, the primary write error is never logged.
  - **Remediation:** Instrument `overwriteAll` with 3-point structured logging.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-021] Raw Query String and Parameter Exposure in Client HTTP Telemetry** — [apps/client/src/platform/api/fetch_api_client.ts:122-207](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L122-L207)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md` (Security: Never Log Secrets/PII)
  - **Description:** `FetchApiClient` logs the entire raw request URL (`url: fullUrl`) including query strings, creating an information leakage vector if sensitive tokens or user identifiers are included in URLs.
  - **Remediation:** Strip query strings before logging: `url.split('?')[0]`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-022] Unscrubbed Background Job Result Logging in Job Runner** — [apps/server/src/platform/logger/job_runner.ts:32-39](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/logger/job_runner.ts#L32-L39)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md` (Security: Automatic Redaction)
  - **Description:** `runLoggedJob` attaches the raw `result` object of background jobs directly to the log entry without passing it through `sanitizePayload`.
  - **Remediation:** Apply `sanitizePayload` to the job result object prior to logging.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-023] Pervasive Unstructured Console Logging Bypassing Telemetry in Client Core Modules** — [apps/client/src/features/portability/composables/useProgressSync.ts:117-277](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useProgressSync.ts#L117-L277), [apps/client/src/composables/useLanDiscovery.ts:27-161](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useLanDiscovery.ts#L27-L161)
  - **Dimension:** D (Observability) & B (Reliability)
  - **Rule Source:** `logging-and-observability-mandate.md` (Structured Logging Only)
  - **Description:** Over 15 direct `console.warn`, `console.error`, and `console.info` calls bypass the platform `ILogger` abstraction across portability, LAN discovery, and PWA composables.
  - **Remediation:** Replace direct `console.*` calls with structured `logger` methods.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-024] Deprecated Duplicate Service `LanService` Retained in Production Tree** — [apps/server/src/features/lan/lan.service.ts:1-210](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/lan.service.ts#L1-L210)
  - **Dimension:** E (Code Quality) & C (Architecture)
  - **Rule Source:** `code-organization-principles.md` (Dead Code Removal) & `core-design-principles.md` (DRY)
  - **Description:** `LanService` duplicates 210 lines of IP resolution and QR generation from `RelayAddressService`. It is unused by production entry points yet remains exported.
  - **Remediation:** Delete `lan.service.ts` and its test suite, standardizing all consumers on `RelayAddressService`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-025] Redundant Multi-Alias Event Emissions and Dual-Prop Contracts Across Modal Hierarchy** — [apps/client/src/components/layout/AppModalContainer.vue:74-175](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/AppModalContainer.vue#L74-L175)
  - **Dimension:** E (Code Quality)
  - **Rule Source:** `code-organization-principles.md` (<80% consistency signal) & `vue-idioms`
  - **Description:** To satisfy divergent tests, `AppModalContainer.vue` emits 2 to 3 duplicate aliases for every action (`confirm-proceed` AND `confirmProceed`; `resolve-conflict`, `resolveConflict`, AND `resolve`), and accepts dual props (`modelValue` vs `isOpen`).
  - **Remediation:** Standardize on Vue 3 kebab-case event naming and canonical `modelValue` props; clean up test assertions.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-026] Socket Event Contract Drift: Missing `room:leave` Callback and `room:reconnect` Field Mismatch** — [shared/src/contracts/events.ts:131-140](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/events.ts#L131-L140), [apps/client/src/composables/useSocket.ts:999-1002](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L999-L1002)
  - **Dimension:** F (Integration Contracts)
  - **Rule Source:** `api-design-principles.md` (Interface Contracts)
  - **Description:** `ClientToServerEvents["room:leave"]` declares no acknowledgement callback, forcing `useSocket.ts` to use `(s as any).emit('room:leave', ..., callback)`. `ClientToServerEvents["room:reconnect"]` omits `roomStatus?: string` which is returned by the server.
  - **Remediation:** Update `events.ts` to type the ack callback for `room:leave` and include `roomStatus?: string` on `room:reconnect`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-027] Omission of `roomStatus` in Server `room:player_reconnected` Broadcast** — [apps/server/src/features/rooms/room.socket_handler.ts:207-210](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L207-L210)
  - **Dimension:** F (Integration Contracts)
  - **Rule Source:** `shared/src/contracts/events.ts:60-65`
  - **Description:** Server emits `room:player_reconnected` without `roomStatus: result.room.status`. The opponent's client must guess whether the room has unpaused from `'paused_disconnect'`.
  - **Remediation:** Include `roomStatus: result.room.status` in the broadcast payload.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-028] Standard Error Response Envelope Non-Compliance Across HTTP Endpoints** — [apps/server/src/platform/http/http_server.ts:343-427](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L343-L427)
  - **Dimension:** F (Integration Contracts)
  - **Rule Source:** `api-design-principles.md` (Standard Error Envelope)
  - **Description:** HTTP 429, 404, and 500 error responses omit the top-level `code: number` transport status code and format error fields inconsistently.
  - **Remediation:** Implement a centralized `formatHttpError()` helper matching `api-design-principles.md`.
  - **Fix workflow:** `/bugfix`

---

## Minor Issues
Code maintainability issues, function length/complexity violations, or minor test gaps. Fix in near term.

- [ ] **[MIN-001] Hardcoded Error Message Discrepancy in Rate-Limited Socket Handlers** — [apps/server/src/features/rooms/room.socket_handler.ts:77-80](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L77-L80)
  - **Dimension:** A | **Description:** Socket error responses hardcode "5 requests per 10 seconds" even if environment variables configure different values.
  - **Remediation:** Derive error string dynamically from `rateLimiter.getLimitDescription()`.
- [ ] **[MIN-002] Direct Unvalidated `process.env.LOG_LEVEL` Read in Fatal Startup Handler** — [apps/server/src/index.ts:370](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L370)
  - **Dimension:** A | **Description:** Catch block uses `(process.env.LOG_LEVEL as any)` which can cause `PinoLogger` to throw if invalid.
  - **Remediation:** Validate via `ServerEnvSchema.shape.LOG_LEVEL.safeParse`.
- [ ] **[MIN-003] Unconditional Strict-Transport-Security Header over Plaintext HTTP** — [apps/server/src/platform/http/http_server.ts:53](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L53)
  - **Dimension:** A | **Description:** HSTS is attached over plain HTTP on LAN/localhost, violating RFC 6797 §7.2.
  - **Remediation:** Conditionally attach HSTS only for HTTPS production requests.
- [ ] **[MIN-004] Background Room Cleanup Interval Lacks `.unref()`** — [apps/server/src/index.ts:240](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L240)
  - **Dimension:** B | **Description:** `setInterval` keeps the Node.js event loop alive in test environments.
  - **Remediation:** Add `cleanupInterval.unref()`.
- [ ] **[MIN-005] Corrupted JSON Silently Swallowed in LocalStorageProgressStore** — [apps/client/src/features/scenarios/store/local_storage_progress.store.ts:79-104](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/store/local_storage_progress.store.ts#L79-L104)
  - **Dimension:** B | **Description:** `JSON.parse` failures return `{}` with no warning or diagnostic log.
  - **Remediation:** Log warning via `logger.warn`.
- [ ] **[MIN-006] Nested Empty Catch Blocks in Legacy Key Migration** — [apps/client/src/platform/storage/keys.ts:43-55](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/keys.ts#L43-L55)
  - **Dimension:** B | **Description:** Storage exceptions during key migration are swallowed.
  - **Remediation:** Log migration failures or verify before removing keys.
- [ ] **[MIN-007] Vulnerable Unsubscribe Loop in Audio Event Manager** — [apps/client/src/composables/useAudio.ts:226-228](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useAudio.ts#L226-L228)
  - **Dimension:** B | **Description:** Single unsubscribe exception aborts the loop, leaking remaining listeners.
  - **Remediation:** Wrap individual unsubscribe calls in try/catch.
- [ ] **[MIN-008] Secondary Stream Error on Non-JSON Response in FetchApiClient** — [apps/client/src/platform/api/fetch_api_client.ts:96-106](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L96-L106)
  - **Dimension:** B | **Description:** Calling `response.text()` after failed `response.json()` causes body stream already read error.
  - **Remediation:** Read `response.text()` first, then attempt `JSON.parse`.
- [ ] **[MIN-009] Monolithic Composable: `useSocket.ts` Exceeds 1060 Lines** — [apps/client/src/composables/useSocket.ts:1-1062](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L1-L1062)
  - **Dimension:** C | **Description:** Contains 10 separate hardcoded 8000ms timeout blocks and 1062 lines violating SRP.
  - **Remediation:** Extract generic `emitWithTimeout` helper and split room/game socket operations.
- [ ] **[MIN-010] Redundant Technical Layer Shims and Forwarder Files** — [apps/client/src/composables/useNetworkStatus.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useNetworkStatus.ts#L1)
  - **Dimension:** C | **Description:** 6 dummy files re-export feature composables across layers.
  - **Remediation:** Remove redundant shims and update import paths.
- [ ] **[MIN-011] Missing Co-Located Unit Tests for `platform/time` and `features/multiplayer`** — [apps/server/src/platform/time/clock.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/time/clock.ts#L1)
  - **Dimension:** C | **Description:** Incomplete test co-location in server time and client multiplayer.
  - **Remediation:** Co-locate tests in `__tests__` directories.
- [ ] **[MIN-012] String Interpolation and Dynamic Message Templates in Log Ingress** — [apps/server/src/platform/http/http_server.ts:268](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L268)
  - **Dimension:** D | **Description:** Interpolating variables into log message strings prevents clustering and creates high cardinality.
  - **Remediation:** Use invariant message templates with structured context.
- [ ] **[MIN-013] Missing Correlation ID and Operation Name in Server Bootstrap** — [apps/server/src/index.ts:103](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L103)
  - **Dimension:** D | **Description:** Startup log entries omit mandatory `operation` and `correlationId`.
  - **Remediation:** Attach static operation names and bootstrap correlation ID.
- [ ] **[MIN-014] Missing Correlation IDs Across Client-Side Logging Invocations** — [apps/client/src/main.ts:33](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L33)
  - **Dimension:** D | **Description:** Global Vue error handler and client stores omit `correlationId`.
  - **Remediation:** Pass `generateCorrelationId()` in client log calls.
- [ ] **[MIN-015] Incomplete 3-Point Logging in Asynchronous AI Move Evaluation** — [apps/client/src/features/ai/composables/useAiWorker.ts:45-115](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiWorker.ts#L45-L115)
  - **Dimension:** D | **Description:** AI move calculations lack start and success logs.
  - **Remediation:** Add 3-point lifecycle logs with calculation duration.
- [ ] **[MIN-016] Inappropriate Log Level for User-Provided Progress Import Validation Failures** — [apps/client/src/features/portability/composables/useProgressSync.ts:226](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useProgressSync.ts#L226)
  - **Dimension:** D | **Description:** Expected user validation rejections logged at ERROR level instead of WARN.
  - **Remediation:** Change log level to `warn`.
- [ ] **[MIN-017] Severe DRY Violation: 11 Duplicated Socket Timeout & Ack Boilerplate Blocks** — [apps/client/src/composables/useSocket.ts:792-951](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L792-L951)
  - **Dimension:** E | **Description:** Copy-pasted 20-line timeout state and callback wrapper across 11 socket actions.
  - **Remediation:** Extract generic `emitWithTimeout` helper.
- [ ] **[MIN-018] God Composable in `useScenarioRunner.ts` (CC: 68, 429 lines)** — [apps/client/src/features/scenarios/composables/useScenarioRunner.ts:30-458](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/composables/useScenarioRunner.ts#L30-L458)
  - **Dimension:** E | **Description:** `applyPlayerMove` spans 138 lines performing 8 distinct responsibilities.
  - **Remediation:** Decompose into `useScenarioValidation`, `useScenarioBotResponse`, and `useScenarioFeedback`.
- [ ] **[MIN-019] Oversized Composable for Puzzle Execution (`usePuzzleRunner.ts`, CC: 52)** — [apps/client/src/features/puzzles/composables/usePuzzleRunner.ts:36-390](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleRunner.ts#L36-L390)
  - **Dimension:** E | **Description:** Coordinates board interactions, bot timers, hints, stars, and sounds in one closure.
  - **Remediation:** Extract puzzle board interaction and bot response execution into sub-functions.
- [ ] **[MIN-020] Monolithic HTTP Server Request Listener (227 lines, CC: 31)** — [apps/server/src/platform/http/http_server.ts:203-429](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L203-L429)
  - **Dimension:** E | **Description:** Procedural request listener handles headers, CORS, rate limiting, routing, and error formatting in one function.
  - **Remediation:** Implement a lightweight middleware pipeline.
- [ ] **[MIN-021] Cyclomatic Complexity Explosion in Tactical Motif Classifier (CC: 42)** — [apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts:382-529](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts#L382-L529)
  - **Dimension:** E | **Description:** Deeply nested ladder checking 10 chess themes; combines pin and skewer in one function.
  - **Remediation:** Refactor to Chain of Responsibility strategy pattern.
- [ ] **[MIN-022] Monolithic Progress Diffing Function (CC: 43)** — [shared/src/utils/progress_merger.ts:330-490](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_merger.ts#L330-L490)
  - **Dimension:** E | **Description:** 161 lines procedurally diffing scenarios, puzzles, ratings, arcade stats, and timestamps.
  - **Remediation:** Split into sub-diff helpers (`diffScenarios`, `diffRatingProfile`, etc.).
- [ ] **[MIN-023] Duplicated Star Rating and Accuracy Calculations Across Features** — [star_calculator.ts](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/engine/star_calculator.ts#L16-L46)
  - **Dimension:** E | **Description:** Identical star scoring and accuracy formulas in scenarios and puzzles.
  - **Remediation:** Centralize in `@fun-chess/shared`.
- [ ] **[MIN-024] Duplicated Reactive Chess Board Logic** — [useChessGame.ts:45](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useChessGame.ts#L45), [useAiBoardState.ts:111](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiBoardState.ts#L111)
  - **Dimension:** E | **Description:** `kingInCheckSquare`, board flipping, and legal move scanning duplicated between composables.
  - **Remediation:** Extract shared `useChessBoard` composable.
- [ ] **[MIN-025] High-Complexity Puzzle Validation Function (CC: 26)** — [puzzle_validator.ts:73-262](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_validator.ts#L73-L262)
  - **Dimension:** E | **Description:** 190 lines handling formatting, validation, simulation, sound acceptance, and bot moves.
  - **Remediation:** Decompose into single-purpose validator helpers.
- [ ] **[MIN-026] Manual Type-Unsafe Progress Sanitization Bypassing Shared Schema** — [local_storage_puzzle_store.ts:49-150](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/local_storage_puzzle_store.ts#L49-L150)
  - **Dimension:** E | **Description:** 102 lines of manual `typeof` checks duplicating `sanitizeAndValidateProgress` from `@fun-chess/shared`.
  - **Remediation:** Replace with `sanitizeAndValidateProgress`.
- [ ] **[MIN-027] Monolithic Hardware and Stream Management in `useQrScanner.ts` (CC: 44)** — [useQrScanner.ts:25-238](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useQrScanner.ts#L25-L238)
  - **Dimension:** E | **Description:** Coordinates media stream, hardware tracks, canvas rendering, animation frame loops, and decoding in one file.
  - **Remediation:** Split into `useCameraStream` and `useQrDecoder`.
- [ ] **[MIN-028] Undeclared Phantom Dependency `socket.io-client` in Server Manifest** — [apps/server/package.json:22](file:///home/irahardianto/works/projects/fun-chess/apps/server/package.json#L22)
  - **Dimension:** G | **Description:** Server test suites import `socket.io-client` directly without declaring it in `apps/server/package.json`.
  - **Remediation:** Add `"socket.io-client": "4.8.1"` to server `devDependencies`.

---

## Enhancement Issues
Non-critical suggestions, defense-in-depth, documentation, or minor clarity refactorings.

- [ ] **[ENH-001] Case-Sensitive Origin Comparison in `isOriginAllowed`** — [apps/server/src/platform/config/env.ts:142-150](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L142-L150)
  - Normalize origin hostname and scheme to lowercase according to RFC 6454.
- [ ] **[ENH-002] Missing `CLIENT_DIST_PATH` Environment Variable for Custom Asset Directories** — [apps/server/src/platform/config/env.ts:36-58](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L36-L58)
  - Add optional `CLIENT_DIST_PATH` config to `ServerEnvSchema` to simplify custom Kubernetes/container asset volume mounts.
- [ ] **[ENH-003] Operational Metrics Exposed on Public Unauthenticated `/health` Endpoint** — [health.controller.ts:50-59](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/health.controller.ts#L50-L59)
  - Return basic status on `/health` and move detailed heap and socket counts to `/metrics` or `/health/detail`.
- [ ] **[ENH-004] Missing Error State Display in QrCodeModal When Canvas Fails** — [QrCodeModal.vue:180-184](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/QrCodeModal.vue#L180-L184)
  - Show error alert and retry button instead of staying in an infinite loading spinner.
- [ ] **[ENH-005] Un-injected `Math.random` in AI Personas and Banter Selectors** — [useAiBoardState.ts:54](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiBoardState.ts#L54)
  - Provide seedable PRNG function parameter to enable reproducible game replays.
- [ ] **[ENH-006] Direct Unstructured Console Banner in Server Startup** — [apps/server/src/index.ts:313-326](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L313-L326)
  - Move ASCII banner printing to interactive TTY-only helper.
- [ ] **[ENH-007] Redaction Allowlist Incompleteness in Client Telemetry Logger** — [client_logger.ts:12](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/telemetry/client_logger.ts#L12)
  - Expand `SENSITIVE_KEY_REGEX` to include `cookie`, `apiKey`, and `credential`.
- [ ] **[ENH-008] String Formatting in Shared `ChessLogger` Interface** — [chess_factory.ts:13-16](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/chess_factory.ts#L13-L16)
  - Support structured metadata parameter `{ operation?: string; fen?: string }` on `ChessLogger.warn`.
- [ ] **[ENH-009] Opaque Single-Letter Parameters and Compressed Statements in App.vue** — [App.vue:152-178](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L152-L178)
  - Expand minified one-liners and use semantic variable names (`payload`, `move`).
- [ ] **[ENH-010] Unused `diffPreview` Prop in `ProgressConflictModal.vue`** — [ProgressConflictModal.vue:16](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/components/ProgressConflictModal.vue#L16)
  - Bind conflict preview UI directly to `props.diffPreview` rather than recalculating values locally.
- [ ] **[ENH-011] `IApiClient` Exposes Unimplemented `post<T>()` Method** — [api_client.interface.ts:25](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/api_client.interface.ts#L25)
  - Document that the server defines zero HTTP POST routes or remove until endpoints are added.
- [ ] **[ENH-012] Redundant Integration Test Execution in Root Test Script** — [package.json:16-18](file:///home/irahardianto/works/projects/fun-chess/package.json#L16-L18)
  - Avoid executing integration specs twice during `pnpm test` by configuring server Vitest config to exclude integration tests.
- [ ] **[ENH-013] E2E Test File Naming Convention (`*.spec.ts` vs `*.e2e.test.ts`)** — [apps/e2e/ui/academy.spec.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/academy.spec.ts#L1)
  - Standardize Playwright tests to `{feature}-{ui/api}.e2e.test.ts` per testing strategy guidelines.
- [ ] **[ENH-014] Pin GitHub Actions to Immutable Commit SHAs** — [.github/workflows/ci.yml:19](file:///home/irahardianto/works/projects/fun-chess/.github/workflows/ci.yml#L19)
  - Semgrep flagged 12 mutable tag references (`@v4`); pin actions to full 40-character commit SHAs for supply-chain defense.

---

## Verification Suite Results
- **Linter & Static Analysis:** PASS (typecheck: 0 errors across 4 workspaces; typos: 0 typos; gitleaks: 0 leaks detected; semgrep: 15 CI/package-manager security hygiene notices)
- **Automated Tests:** PASS (2,499 passed, 0 failed, 0 skipped across 187 Vitest test files + 21 Playwright E2E journeys)
  - `@fun-chess/shared`: 13 test files, 206 passed
  - `@fun-chess/server`: 31 test files, 470 passed
  - `@fun-chess/client`: 135 test files, 1,750 passed
  - Root integration test suite: 8 test files, 52 passed
  - `@fun-chess/e2e` (Playwright): 21 journey tests passed (API + UI)
- **Build Verification:** PASS (TypeScript compilation + Vite client bundle generation completed cleanly in 6.5s)
- **Test Coverage:** PASS (Shared: 95.33% stmts / 82.05% branch; Server: 93.31% stmts / 87.32% branch; Client: 93.15% stmts / 85.3% branch. All packages exceed the 80% coverage threshold)

---

## Cross-Dimension Correlations
When findings from 2+ dimensions converge on the same module or function, severity is escalated by one level:

1. **`useSocket.ts` Lifecycle & Teardown (E + F + D + C Convergence -> Escalate to CRITICAL)**
   - Hardcoded test backdoor `'shared_socket_456'` (E-MAJ-001) + Reconnect desynchronization for draw/rematch (F-MAJ-001) + Unlogged socket entry points (D-MAJ-001) + Module-level global state (C-MAJ-003) + 11 duplicated timeout boilerplates (E-MIN-001) all converge on `apps/client/src/composables/useSocket.ts`.
   - **Escalated finding:** [CRIT-003]

2. **Server Disconnect / Abandonment Timer Registry (B + C Convergence -> Escalate to CRITICAL)**
   - Disconnect timer registry omitted from `registerGameSocketHandlers` (B-MAJ-001) + Unmanaged global mutable singletons exported from `room.socket_handler.ts` and `disconnect_timer_registry.ts` (C-MAJ-010).
   - Because B-MAJ-001 causes a duplicate `game:over` to fire 60s after an ended game, altering player results or corrupting room state, it is escalated.
   - **Escalated finding:** [CRIT-002]

3. **Client-Side Storage Migration & Key Hygiene (F + B Convergence -> Confirmed CRITICAL)**
   - Un-run migration function with destructive legacy deletion (F-CRIT-001) + Nested empty catch blocks in legacy key migration (B-MIN-003) + 5 components bypassing `STORAGE_KEYS` registry (F-MIN-001).
   - **Confirmed finding:** [CRIT-001]

4. **Cross-Module Boundary Violations (C + E Convergence -> Confirmed MAJOR)**
   - `apps/server/src/index.ts` importing internal `room.socket_handler.js` directly and `apps/client/src/main.ts` importing internal store files (C-MAJ-002 and E-MAJ-004). Consolidated as [MAJ-010].

5. **Deprecated `LanService` Dead Code (C + E Convergence -> Confirmed MAJOR)**
   - C-MIN-014 and E-MAJ-002 both flagged the 210-line duplicate `LanService`. Consolidated as [MAJ-024].

6. **Missing Error Code `ERR_CONFLICT` (F + E Convergence -> Confirmed MAJOR)**
   - F-MAJ-005 and E-ENH-004 both identified that `OptimisticLockConflictError` forces a cast because `ERR_CONFLICT` is omitted in `shared/src/contracts/errors.ts`. Consolidated as [MAJ-028].

7. **Client Unstructured Console Logging (D + B Convergence -> Confirmed MAJOR)**
   - D-MAJ-005 and B-ENH-001 both identified direct `console.*` usage bypassing `ILogger`. Consolidated as [MAJ-023].

---

## Dimensions Covered
| Dimension | Status | Files / Queries Examined |
|---|---|---|
| A. Security & Configuration | ✅ Checked | Scanned 35+ files for injection, SSRF, path traversal, hardcoded secrets, rate limiting, and config fail-fast |
| B. Reliability & Error Handling | ✅ Checked | Audited 104+ files for empty catches, unhandled I/O failures, resource leaks, timers, and shutdown lifecycle |
| C. Testability & Architecture | ✅ Checked | Scanned 529 files for I/O isolation, DI wiring, pure logic purity, dependency direction, and circular imports |
| D. Observability & Logging | ✅ Checked | Scanned 61 files for 3-point operation logging, correlation IDs, log levels, structured JSON, and PII redaction |
| E. Code Quality & Patterns | ✅ Checked | Audited 514 TS/Vue files (316 production) for SRP violations, cyclomatic complexity, DRY, and naming intent |
| F. Integration Contracts & DB | ✅ Checked | Scanned 84 files across shared contracts, socket schemas, HTTP routes, client adapters, and storage hygiene |
| G. Dependencies & Tests | ✅ Checked | Audited root and package manifests, lockfile integrity, depcheck, unit test gaps, and Playwright E2E suites |

---

## Rules Applied
- `.agents/rules/security-mandate.md` & `security-principles.md`
- `.agents/rules/rugged-software-constitution.md`
- `.agents/rules/error-handling-principles.md`
- `.agents/rules/architectural-pattern.md` & `testability-patterns`
- `.agents/rules/logging-and-observability-mandate.md` & `logging-implementation`
- `.agents/rules/code-organization-principles.md`
- `.agents/rules/api-design-principles.md` & `database-design-principles.md`
- `.agents/rules/dependency-management-principles.md` & `testing-strategy.md`
- `.agents/rules/rule-priority.md`

---

## Remediation Action Plan
Findings ranked by priority for resolution:

1. **[CRIT-001] Wire Storage Migration & Remove Destructive Key Deletion** → `/bugfix`
   - In `apps/client/src/main.ts`, execute `migrateStorageV1ToV2(safeLocalStorage)` on bootstrap; prevent deleting legacy data without a deprecation window.
2. **[CRIT-002] Pass `timerRegistry` into Game Socket Handlers** → `/bugfix`
   - In `apps/server/src/index.ts:198`, pass `timerRegistry` to `registerGameSocketHandlers` to prevent orphaned abandonment timers from firing duplicate `game:over`.
3. **[CRIT-003] Remove `'shared_socket_456'` Test Backdoor and Fix Reconnect State Desync** → `/bugfix`
   - In `apps/client/src/composables/useSocket.ts`, eliminate hardcoded test socket check and restore pending draw/rematch states in `handleRoomReconnected`.
4. **[MAJ-001 & MAJ-002 & MAJ-003] Harden Server Config Validation, Vite Dev Allowed Hosts & Rate Limits** → `/bugfix`
   - Re-validate merged options in `startServer()`, restrict `allowedHosts` in `vite.config.ts`, and adjust template rate limits for LAN multiplayer.
5. **[MAJ-004 & MAJ-005] Handle Shutdown Errors & Critical Section Execution Timeout** → `/bugfix`
   - Check error callbacks in `ShutdownCoordinator.closeServer()`; add execution timeout race in `InMemoryRoomStore.withLock()`.
6. **[MAJ-010 & MAJ-024] Enforce Module Boundaries and Remove Deprecated `LanService`** → `/refactor`
   - Route all imports through feature `index.ts` barrels; delete `lan.service.ts`.
7. **[MAJ-019 & MAJ-023] Instrument Client Socket Telemetry and Replace Direct `console.*`** → `/refactor`
   - Add 3-point structured logging to `useSocket.ts` and replace ad-hoc `console.error/warn` with `ILogger`.
8. **[MAJ-026 & MAJ-028] Harmonize Socket Event Contracts and Standardize HTTP Error Responses** → `/bugfix`
   - Add ack callback to `room:leave`, include `roomStatus` on `room:player_reconnected`, and format HTTP errors with standard envelope.
9. **[MAJ-008 & MAJ-009 & MAJ-011] Refactor Client DI and AI Search Yielding** → `/refactor`
   - Adopt `provide`/`inject` in client composables and decouple module-scoped state; add deadline abort check to minimax search.
10. **[MAJ-028 / G-MAJ-001] Declare `socket.io-client` in Server Manifest and Address Test Gaps** → `/bugfix`
    - Add `socket.io-client` to server `devDependencies` and create unit tests for HTTP controllers.
