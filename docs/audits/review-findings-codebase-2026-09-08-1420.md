# Code Audit: Full Codebase (fun-chess)
Date: 2026-09-08
Auditor: AI Code Audit (multi-dimensional, 7 parallel subagents)

## Executive Summary
- **Dimensions activated:** A (Security & Config), B (Reliability & Error Handling), C (Testability & Architecture), D (Observability & Logging), E (Code Quality & Patterns), F (Integration Contracts & State Stores), G (Dependencies & Test Coverage)
- **Dimensions skipped:** None (all 7 dimensions activated across full monorepo)
- **Files scanned:** 915 files across monorepo (342 source/test/config files in `apps/server`, `apps/client`, `apps/e2e`, `shared`, root)
- **Findings:** 97 total (5 Critical, 44 Major, 35 Minor, 13 Enhancement)
- **Automated verification:** Typecheck: PASS (0 errors) | Tests: PASS (1,904 passed across unit and integration, 0 failed, 148 test files) | Build: PASS (all workspace packages built in 6.6s) | Coverage: ~89.4% overall statement coverage
- **Overall codebase health:** NEEDS ATTENTION (Solid test suite and zero compile errors, but contract mismatches, concurrency races under lock timeout, duplicate composable implementations, and modular boundary violations require remediation)

---

## Critical Issues
Vulnerabilities or severe defects that cause active security breaches, data loss, application crashes, or system compromise. Must be fixed immediately.

- [ ] **[CRIT-001] Client `FetchApiClient.checkHealth` Contract Crash on Server `/health` Endpoint** — [apps/client/src/platform/api/fetch_api_client.ts:223](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L223)
  - **Dimension:** F (Integration Contracts & State Stores)
  - **Rule Source:** `.agents/rules/api-design-principles.md` & `.agents/rules/data-serialization-and-interchange-principles.md`
  - **Description:** `FetchApiClient.checkHealth()` issues `GET /health` and parses the response with `HealthCheckResponseSchema.parse(res.data)`. In `shared/src/contracts/schemas.ts`, `HealthCheckResponseSchema` is aliased to `DetailedHealthResponseSchema`, requiring `activeRooms`, `activeSockets`, and `memoryUsageMb: { rss, heapTotal, heapUsed }`. In contrast, the server's `GET /health` route returns `LivenessHealthResponse` (`{ status, uptimeSeconds, timestamp }`), omitting metrics to prevent telemetry leakage (ENH-003). Calling `client.checkHealth()` against a live server always throws a Zod validation error, crashing client health monitoring routines.
  - **Impact:** Any automated health monitoring or client connection probe targeting `/health` crashes immediately at runtime.
  - **Evidence:**
    ```typescript
    // apps/client/src/platform/api/fetch_api_client.ts:223-227
    async checkHealth(options?: ApiRequestOptions): Promise<HealthCheckResponse> {
      const res = await this.get<unknown>('/health', options);
      if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
      return HealthCheckResponseSchema.parse(res.data); // Throws ZodError: activeRooms required
    }
    ```
  - **Remediation:** Align `checkHealth()` to validate against `LivenessHealthResponseSchema` (`{ status, uptimeSeconds, timestamp }`), or point detailed checks to `/health/detail`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-002] Concurrent Execution Leak and State Corruption on Lock Timeout in `InMemoryRoomStore`** — [apps/server/src/features/rooms/in_memory_room.store.ts:167-190](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L167-L190)
  - **Dimension:** F (Integration Contracts & State Stores)
  - **Rule Source:** `.agents/rules/concurrency-and-threading-principles.md` (Avoid Race Conditions: no concurrent write access without synchronization)
  - **Description:** When an operation in `withLock` exceeds `EXECUTION_TIMEOUT_MS` (5000ms), `Promise.race` rejects with `LockExecutionTimeoutError`. In the `finally` block, `releaseLock()` runs and unblocks the next queued operation in the lock chain. However, in JavaScript, async functions cannot be preempted or cancelled; the timed-out `action()` continues running in the background. When it eventually finishes and calls `this.rooms.set(code, ...)`, it executes concurrently with the new lock holder and overwrites subsequent state, corrupting linearizability and game state.
  - **Impact:** Under temporary CPU or event loop stalls, concurrent mutations corrupt active rooms, revert moves, or overwrite player states.
  - **Evidence:**
    ```typescript
    // apps/server/src/features/rooms/in_memory_room.store.ts:167-190
    return await Promise.race([actionPromise, executionTimeoutPromise]);
    } finally {
      if (acquireTimer) clearTimeout(acquireTimer);
      if (executionTimer) clearTimeout(executionTimer);
      if (acquired) {
        releaseLock(); // Lock surrendered while actionPromise is still running in background!
      }
    }
    ```
  - **Remediation:** Associate each lock acquisition with a monotonic generation ticket. If execution times out, mark that ticket as cancelled. In `save` and `mutate`, assert the ticket is still valid before writing to `this.rooms`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-003] Non-Atomic Room Code Allocation Permitting Silent Room Overwrite Race** — [apps/server/src/features/rooms/room.service.ts:85-112](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L85-L112) & [apps/server/src/features/rooms/in_memory_room.store.ts:247-268](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L247-L268)
  - **Dimension:** Escalated Cross-Dimension Correlation (A: Security/Access Control + F: Concurrency & State Stores)
  - **Rule Source:** `.agents/rules/security-principles.md` §Broken Access Control, `.agents/rules/concurrency-and-threading-principles.md`
  - **Description:** In `RoomService.createRoom`, `generateUniqueRoomCode` checks uniqueness by calling `this.store.findByCode(code)`. No lock or reservation is acquired on the code. If two concurrent requests generate the same room code simultaneously, both see `findByCode` return `null`. Both then call `this.store.save(newRoom)`. Because `InMemoryRoomStore.save` only verifies `expectedVersion` when `expectedVersion !== undefined`, the second write silently overwrites the first room without error. Furthermore, after 100 collision attempts, the fallback code `R${now.toString(36)...}` is persisted without checking `findByCode`.
  - **Impact:** Concurrent room creation overwrites active rooms, drops existing players, and corrupts game state.
  - **Evidence:**
    ```typescript
    // apps/server/src/features/rooms/room.service.ts:522-530
    const existing = await this.store.findByCode(code);
    if (!existing) return code; // No reservation held
    // apps/server/src/features/rooms/in_memory_room.store.ts:247-270
    public async save(room: RoomState, expectedVersion?: number): Promise<void> {
      // If expectedVersion is undefined, existing room is overwritten unconditionally!
      this.rooms.set(code, roomToSave);
    }
    ```
  - **Remediation:** Implement an atomic `createIfAbsent(room: RoomState)` method on `RoomStore` that acquires `withLock(code)`, checks existence, and persists atomically, throwing `RoomAlreadyExistsError` on collision.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-004] Dual Parallel Implementation of PWA & Network Composables with State Desynchronization and Memory Leak** — [apps/client/src/composables/usePwaInstall.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/usePwaInstall.ts#L1), [apps/client/src/features/pwa/composables/usePwaInstall.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/pwa/composables/usePwaInstall.ts#L1), [apps/client/src/composables/useNetworkStatus.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useNetworkStatus.ts#L1), [apps/client/src/features/pwa/composables/useNetworkStatus.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/pwa/composables/useNetworkStatus.ts#L1)
  - **Dimension:** Escalated Cross-Dimension Correlation (B: Reliability/Resource Leaks + C: Architecture + E: Code Quality + G: Test Gaps)
  - **Rule Source:** `.agents/rules/resources-and-memory-management-principles.md` (Rule 1 & 4), `.agents/rules/code-organization-principles.md` (Module Boundaries), `.agents/rules/core-design-principles.md` (DRY)
  - **Description:** Two parallel duplicate copies of `usePwaInstall.ts` and `useNetworkStatus.ts` exist with divergent state and separate test suites. Both attach independent module-scoped listeners to `window` for `beforeinstallprompt`, `appinstalled`, `online`, and `offline`. `App.vue` and `LobbyView.vue` import from `@/features/pwa`, while other components import through `@/composables`. When `beforeinstallprompt` fires, both copies capture it; invoking `prompt()` on one copy leaves the other holding a consumed prompt, throwing runtime errors if triggered. Offline banners desynchronize from lobby connectivity states.
  - **Impact:** Duplicate window listeners, split reactive states, runtime prompt exceptions, and fragmented maintenance.
  - **Evidence:** 4 duplicate files and 4 duplicate test files across `src/composables/` and `src/features/pwa/composables/` with 20+ lines of divergent code.
  - **Remediation:** Delete the duplicates in `apps/client/src/composables/`. Export canonical versions from `apps/client/src/features/pwa/composables/`, re-export via `composables/index.ts` for backward compatibility, and merge test suites.
  - **Fix workflow:** `/bugfix` or `/refactor` — immediate priority

- [ ] **[CRIT-005] Monolithic `useSocket.ts` Technical Layer Antipattern with Unlogged Consumers, Type Degradation, and State Coupling** — [apps/client/src/composables/useSocket.ts:1-1329](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L1-L1329)
  - **Dimension:** Escalated Cross-Dimension Correlation (C: Architecture + D: Observability + E: Code Quality)
  - **Rule Source:** `.agents/rules/project-structure.md` (Feature Vertical Slices vs Technical Layer), `.agents/rules/logging-and-observability-mandate.md` (Event Consumers Must Be Logged), `.agents/rules/code-organization-principles.md`
  - **Description:** `useSocket.ts` is an oversized 1,329-line monolithic composable located in a generic top-level directory. It mixes session storage persistence, Zod validation, low-level socket transport, auto-reconnect backoff, disconnect timers, room management, game actions, and 21 incoming socket event handlers. Crucially, all 21 incoming socket event consumers are completely unlogged (Dimension D), socket events bypass TypeScript typing via `as any` (Dimension E), and domain multiplayer logic is severed from `features/multiplayer` (Dimension C).
  - **Impact:** Multiplayer state mutations run unobserved in production, typed contracts are bypassed, and regression risk is severe for any multiplayer modification.
  - **Evidence:** Lines 1–1329 contain 7 distinct responsibilities, 21 unlogged event listeners, and multiple `(s as any).emit` / `(s as any).on` casts.
  - **Remediation:** Move multiplayer logic into `apps/client/src/features/multiplayer/`, decomposing into specialized composables: `useSocketTransport`, `useRoomSession`, `useGameActions`. Add structured logging interceptors to all incoming event consumers.
  - **Fix workflow:** `/refactor` — immediate priority

---

## Major Issues
Structural violations, missing I/O error handling, untested critical paths, or broken contracts. Must be fixed before release.

- [ ] **[MAJ-001] Socket Rate Limiter Key Includes Ephemeral Socket ID, Enabling Rate Limit Bypass via Reconnect** — [apps/server/src/platform/socket/socket_logging_middleware.ts:286](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L286)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `.agents/rules/security-principles.md` §Authentication & Authorization, `.agents/rules/rugged-software-constitution.md` §Defense in Depth
  - **Description:** `wrapSocketHandler` constructs the rate limit key as `${clientIp || '127.0.0.1'}:${socketId}`. Because `socket.id` changes on every connection, reconnecting or opening multiple socket connections from the same IP bypasses rate limiting, enabling room code brute-forcing and spam.
  - **Impact:** IP-based rate limiting is completely circumvented by reconnecting.
  - **Evidence:** `const rateLimitKey = `${clientIp || "127.0.0.1"}:${socketId}`;`
  - **Remediation:** Key the rate limiter strictly by `clientIp || '127.0.0.1'`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-002] Server Startup Schema Fails Fast in Production When Configured with `CLIENT_URL` Alone** — [apps/server/src/platform/config/env.ts:63-70](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L63-L70)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `.agents/rules/configuration-management-principles.md` §Configuration Validation
  - **Description:** `.env.template` documents `CORS_ORIGIN` is mandatory in production only if neither `PUBLIC_URL` nor `CLIENT_URL` is set. However, `ServerEnvSchema.superRefine` only checks `!val.CORS_ORIGIN && !val.PUBLIC_URL`, throwing an error if `CLIENT_URL` alone is provided.
  - **Impact:** Documented production deployment configurations crash on boot.
  - **Remediation:** Allow `CLIENT_URL` in `superRefine` alongside `CORS_ORIGIN` and `PUBLIC_URL`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-003] Strict-Transport-Security (HSTS) Emitted Over Insecure HTTP When `TRUST_PROXY` Is Disabled** — [apps/server/src/platform/http/http_server.ts:126-134](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L126-L134)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `.agents/rules/security-principles.md` §OWASP Top 10 (Cryptographic Failures)
  - **Description:** `applySecurityHeaders` checks `req.headers['x-forwarded-proto'] === 'https'` without checking `TRUST_PROXY`. When `TRUST_PROXY` is false, untrusted clients can spoof this header over plain HTTP to trigger HSTS, bricking HTTP-only access.
  - **Impact:** Violates RFC 6797 §7.2; LAN or plain HTTP users can be locked out by spoofed headers.
  - **Remediation:** Check `trustProxy === true` before evaluating `x-forwarded-proto`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-004] Leaked Hanging Unsettled Promise in `useAiWorker.ts` on Move Cancellation** — [apps/client/src/features/ai/composables/useAiWorker.ts:73-82](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiWorker.ts#L73-L82)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `.agents/rules/resources-and-memory-management-principles.md` (Rule 1 & 4)
  - **Description:** In `useAiWorker.ts`, an async delay is awaited using `new Promise<void>((resolve) => { thinkTimeout = setTimeout(...); })`. When `cancelCalculation()` is called on unmount or reset, `clearTimeout` is called, but the Promise is never settled. It remains unsettled indefinitely, leaking closure scope.
  - **Impact:** Every cancelled AI computation leaks an unsettled Promise and its enclosing closure.
  - **Remediation:** Store `resolve` and invoke it in `clearThinkTimeout()`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-005] Missing Global Unhandled Promise Rejection & Window Error Handlers in Vue Client** — [apps/client/src/main.ts:46-55](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L46-L55)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `.agents/rules/rugged-software-constitution.md` ("No silent failures"), `.agents/rules/error-handling-principles.md`
  - **Description:** Only Vue's internal `app.config.errorHandler` is registered. Asynchronous failures outside Vue components (socket events, WebRTC callbacks, Service Worker messaging) are unhandled and fail silently.
  - **Impact:** Background async exceptions fail silently with zero telemetry.
  - **Remediation:** Add `window.addEventListener('unhandledrejection')` and `window.addEventListener('error')` in `main.ts` routing to `logger.error`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-006] Unhandled Synchronous Exception Risk & Empty Catch in `SocketRateLimiter.prune` Interval** — [apps/server/src/platform/socket/socket_rate_limiter.ts:96-104](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L96-L104)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `.agents/rules/rugged-software-constitution.md` ("No silent failures")
  - **Description:** If `this.logger` is undefined, `this.prune()` is called without `try/catch`, risking an uncaught exception crash. If `this.logger` is defined, `.catch(() => {})` silently swallows all errors.
  - **Impact:** Potential crash on unhandled prune throw, or silent failure hiding memory leaks.
  - **Remediation:** Wrap both execution paths in defensive `try/catch` and log errors.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-007] Swallowed Storage Load Rejection and Silent Fallback to Empty State in `useScenarioProgress.ts`** — [apps/client/src/features/scenarios/composables/useScenarioProgress.ts:20-24](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/composables/useScenarioProgress.ts#L20-L24)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `.agents/rules/rugged-software-constitution.md` ("Empty catch blocks are rejected")
  - **Description:** `loadProgress()` wraps `store.getProgressMap()` in an empty `catch {}` block that sets `progressMap.value = {}` with zero logging or user feedback.
  - **Impact:** Storage read errors silently wipe progress to zero stars without warning.
  - **Remediation:** Log the error via `logger.error` with operation `scenario_load_progress`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-008] Silent Empty Catch Blocks Swallowing Clipboard and URL Failures in `QrCodeModal.vue`** — [apps/client/src/features/lobby/QrCodeModal.vue:105-110, 250-256, 274-279](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/QrCodeModal.vue#L105-L110)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `.agents/rules/rugged-software-constitution.md`
  - **Description:** Three separate empty `catch {}` blocks swallow URL parsing and clipboard copy exceptions without telemetry.
  - **Impact:** Clipboard and URL resolution failures are invisible to diagnostics.
  - **Remediation:** Replace empty catch blocks with structured debug/warning telemetry.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-009] Leaked Unhandled Timeout Handles on Component Unmount in `QrCodeModal.vue` and `QrExportView.vue`** — [apps/client/src/features/lobby/QrCodeModal.vue:290-298](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/QrCodeModal.vue#L290-L298), [apps/client/src/features/portability/components/QrExportView.vue:75-78](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/components/QrExportView.vue#L75-L78)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `.agents/rules/resources-and-memory-management-principles.md` (Rule 1 & 4)
  - **Description:** `setTimeout` calls for copy feedback lack `onUnmounted` teardown hooks, leaking timer handles and modifying unmounted component state.
  - **Impact:** Memory leaks and post-unmount reactive updates.
  - **Remediation:** Track timeout IDs and clear them in `onUnmounted`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-010] WebRTC Discovery Silent Catch Blocks and Abort Suppression in `webrtc_discovery.ts`** — [apps/client/src/platform/hardware/webrtc_discovery.ts:34-39, 60-67, 88-95](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/hardware/webrtc_discovery.ts#L34-L39)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `.agents/rules/rugged-software-constitution.md`
  - **Description:** `RTCPeerConnection` close, offer creation, and initialization errors are swallowed with empty catch blocks with zero logging.
  - **Impact:** WebRTC permission, CSP, or network interface failures cannot be diagnosed.
  - **Remediation:** Log caught exceptions using `logger.debug` with operation `webrtc_discover_ip`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-011] Circular Dependency Between `http_server.ts` and HTTP Route Controllers** — [apps/server/src/platform/http/http_server.ts:11](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L11-L15)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `.agents/rules/code-organization-principles.md` (Avoid Circular Dependencies)
  - **Description:** `http_server.ts` imports controllers from `controllers/index.js`, while `health.controller.ts` and `lan_info.controller.ts` import interface contracts (`IRoomCountProvider`, `IAddressingInfoProvider`) back from `../http_server.js`.
  - **Impact:** ESM module evaluation cycle can cause undefined imports and prevents isolated controller testing.
  - **Remediation:** Extract interfaces into `apps/server/src/platform/http/http.interface.ts`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-012] Cross-Module Boundary Violation: `GameService` Directly Imports and Operates on `rooms` Internal Files and Storage** — [apps/server/src/features/game/game.service.ts:20-27](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L20-L27)
  - **Dimension:** C (Testability & Architecture) & F (Integration Contracts)
  - **Rule Source:** `.agents/rules/code-organization-principles.md` (Feature Interaction), `.agents/rules/architectural-pattern.md` (Rule 3)
  - **Description:** `GameService` directly imports internal `RoomStore`, `room.logic.js`, and `session_registry.js`, bypassing the `features/rooms` public API and the `IRoomGameAdapter` abstraction.
  - **Impact:** Tight architectural coupling between two separate domain vertical slices.
  - **Remediation:** Have `GameService` depend strictly on `IRoomGameAdapter` imported from `features/rooms/index.ts`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-013] Pure Chess Engine and Puzzle Engine Directly Import and Invoke Platform Telemetry Logger** — [apps/server/src/features/game/chess_engine.ts:11](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L11), [apps/client/src/features/puzzles/engine/puzzle_validator.ts:17](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_validator.ts#L17)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Rule 2: Pure Business Logic), `.agents/rules/logging-and-observability-mandate.md`
  - **Description:** Pure algorithmic engines (`chess_engine.ts`, `puzzle_validator.ts`, `puzzle_analysis_engine.ts`) import singleton loggers and perform side-effect logging inside move validation routines.
  - **Impact:** Impure business logic; cannot run engines in isolation without logging side-effects.
  - **Remediation:** Remove logger calls from pure engine functions; return descriptive outcome objects and let outer service/controller layers log.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-014] Provided Vue DI Tokens Are Systematically Bypassed by Direct Module Singleton Imports** — [apps/client/src/main.ts:34-44](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L34-L44)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Rule 3: Dependency Direction)
  - **Description:** `main.ts` wires 11 DI tokens via `app.provide`, but 26+ client files and composables bypass DI and import platform singletons directly (`safeLocalStorage`, `logger`, `apiClient`, `audioSynthesizer`).
  - **Impact:** Dependency inversion is ineffective; tests must resort to module monkey-patching.
  - **Remediation:** Use DI inject helpers in composables (`customStore ?? useInjectScenarioStore()`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-015] Direct Access to Browser `navigator.clipboard` and `navigator.mediaDevices` Without Interface Abstraction** — [apps/client/src/features/portability/components/QrExportView.vue:72](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/components/QrExportView.vue#L72-L75), [apps/client/src/features/portability/composables/useCameraStream.ts:94-98](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useCameraStream.ts#L94-L98)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Rule 1: I/O Isolation)
  - **Description:** Features access hardware/navigator APIs directly without abstraction interfaces, forcing tests to mutate the global `navigator` object.
  - **Impact:** Flaky tests and global environment pollution in parallel test runs.
  - **Remediation:** Introduce `IClipboardService` and `ICameraService` interfaces with production and test adapters.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-016] Non-Deterministic Time and Randomness in Server Domain Services** — [apps/server/src/features/game/game.service.ts:93](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L93-L98), [apps/server/src/features/rooms/room.service.ts:88-90](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L88-L90)
  - **Dimension:** C (Testability & Architecture) & F (Integration Contracts)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Rule 1: I/O Isolation — Time/Randomness)
  - **Description:** `GameService.makeMove` fails to pass `this.clock.now()` to `ChessEngine.validateAndApplyMove` (which falls back to `Date.now()`). `RoomService` falls back to `node:crypto.randomInt` if `generateRandomInt` is missing.
  - **Impact:** Non-deterministic timestamps and randomness prevent repeatable replay tests.
  - **Remediation:** Pass `this.clock.now()` and require `generateRandomInt` on `IIdGenerator`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-017] Pervasive Direct Unstructured Console Logging Bypassing Telemetry in Client Modules** — [apps/client/src/features/scenarios/composables/useScenarioRunner.ts:113](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/composables/useScenarioRunner.ts#L113), [apps/client/src/composables/useSocket.ts:105](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L105)
  - **Dimension:** D (Observability & Logging) & B (Reliability)
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md`, `docs/project_conventions.md` (MAJ-023)
  - **Description:** Multiple composables directly invoke `console.warn`, `console.info`, and `console.error` with raw strings, bypassing structured telemetry, dropping correlation IDs, and skipping PII scrubbing.
  - **Impact:** Unstructured log output that cannot be aggregated, filtered, or correlated.
  - **Remediation:** Replace all direct `console.*` calls with `logger` from `@/platform/telemetry`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-018] Missing 3-Point Structured Logging in Client Progress Portability Operations** — [apps/client/src/features/portability/composables/useProgressSync.ts:115-322](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useProgressSync.ts#L115-L322)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md` (3 mandatory log points)
  - **Description:** Core public backup functions (`loadCurrentProgress`, `exportJson`, `exportQrString`, `importPayload`, `executeMerge`) lack operation start and success logging with `durationMs`.
  - **Impact:** Progress export/import operations cannot be monitored for latency regressions or failure rates.
  - **Remediation:** Add 3-point structured logging with `correlationId` and duration.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-019] Missing 3-Point Logging and Correlation Context in Server Lifecycle Operations** — [apps/server/src/index.ts:330-372](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L330-L372)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md`
  - **Description:** Server bootstrap completion log omits `operation`, `correlationId`, and `duration`. The returned `close()` teardown function has zero logging.
  - **Impact:** Server boot and shutdown cycles cannot be traced or correlated in log monitors.
  - **Remediation:** Instrument startup and `close()` with standard 3-point structured logging.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-020] Dynamic String Interpolation in Log Messages Violating Invariant Message Templates** — [apps/server/src/platform/http/http_server.ts:338-498](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L338-L498)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md` (Structured logging only: no string formatting)
  - **Description:** Variable runtime values (HTTP methods, paths, room codes, signals) are interpolated directly into message strings rather than using invariant static messages and structured metadata.
  - **Impact:** High-cardinality log messages prevent centralized aggregators from grouping and alerting.
  - **Remediation:** Use static message strings (e.g. `"HTTP request received"`) and place variable data in metadata.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-021] Incomplete Sensitive Key Redaction in Server Loggers and Background Job Sanitizers** — [apps/server/src/platform/logger/pino_logger.ts:8-26](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/logger/pino_logger.ts#L8-L26)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `.agents/rules/logging-and-observability-mandate.md` §Security
  - **Description:** `PinoLogger.DEFAULT_REDACT_PATHS`, `job_runner.ts` `SENSITIVE_KEYS`, and `socket_logging_middleware.ts` omit `bearer`, `credential`, and `credentials`.
  - **Impact:** Bearer tokens or credentials passed in nested objects can escape redaction and appear in logs.
  - **Remediation:** Expand redaction key sets to include `credential`, `credentials`, `bearer`, and wildcard paths.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-022] God Component and Prop Drilling Anti-Pattern in `App.vue`** — [apps/client/src/App.vue:1-614](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L1-L614)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/rules/code-organization-principles.md`, `.agents/skills/vue-idioms/SKILL.md`
  - **Description:** `App.vue` manages almost all application state in raw local `ref`s and drills 35+ props and 20 emits to `AppViewRouter`, plus 25+ props to `AppModalContainer`.
  - **Impact:** Fragile component coupling, massive prop drilling, and merge conflict liability.
  - **Remediation:** Introduce scoped stores/composables for routing and modals; let child views inject dependencies directly.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-023] Duplicated Socket Handler Wrapper Logic Across Server Domain Features** — [apps/server/src/features/rooms/room.socket_handler.ts:47-66](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L47-L66), [apps/server/src/features/game/game.socket_handler.ts:31-50](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.socket_handler.ts#L31-L50)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/rules/core-design-principles.md` (DRY)
  - **Description:** Identical Proxy wrapper, rate-limit error mapping, and socket interceptor logic is copy-pasted across `room.socket_handler.ts` and `game.socket_handler.ts`.
  - **Impact:** Duplicate proxy interception and error transformation logic violates DRY.
  - **Remediation:** Consolidate into `createRateLimitedSocketHandler` in `apps/server/src/platform/socket/`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-024] Missing ESLint Configuration Across All Monorepo Packages** — [package.json:1](file:///home/irahardianto/works/projects/fun-chess/package.json#L1)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/rules/code-idioms-and-conventions.md`, `.agents/skills/typescript-idioms/SKILL.md`
  - **Description:** No ESLint configuration exists in the monorepo. Static analysis for complexity, floating promises, and Vue template rules is missing from the toolchain.
  - **Impact:** Code quality anti-patterns cannot be automatically enforced in CI or pre-commit hooks.
  - **Remediation:** Add ESLint flat config (`eslint.config.js`) with TypeScript and Vue plugins.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MAJ-025] Inconsistent TypeScript Strict Mode & Bypassed Unchecked Index Checks in Client** — [apps/client/tsconfig.json:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/tsconfig.json#L1)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/skills/typescript-idioms/SKILL.md` (`noUncheckedIndexedAccess: true`)
  - **Description:** `apps/client/tsconfig.json` does not extend `tsconfig.base.json` and omits `noUncheckedIndexedAccess`. Running with this flag enabled reveals 267 type errors where array/record lookups are assumed non-null.
  - **Impact:** Out-of-bounds array access and missing keys crash at runtime with `TypeError`.
  - **Remediation:** Extend `tsconfig.base.json` and fix unchecked indexed lookups with nullish coalescing.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-026] Pervasive Raw `new Chess()` Instantiations Bypassing `createSafeChess` Exception Boundary** — [apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts:89](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts#L89)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/rules/rugged-software-constitution.md` (Fail securely)
  - **Description:** `createSafeChess` was designed to handle invalid FENs gracefully, but over 70% of call sites across server and client instantiate `new Chess(fen)` directly.
  - **Impact:** Malformed FEN strings crash client components or server handlers.
  - **Remediation:** Replace all direct `new Chess(fen)` calls with `createSafeChess(fen)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-027] Socket Handler Generic Signatures Degraded to `any` in Server Features** — [apps/server/src/features/rooms/room.socket_handler.ts:51](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L51-L52)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `.agents/skills/typescript-idioms/SKILL.md` (Strict typing; avoid `any`)
  - **Description:** `createRoomHandler` uses `schema: any` and `context: any`, discarding schema types and forcing registration calls to cast schemas `as any`.
  - **Impact:** Schema discrepancies between shared contracts and handler parameters do not trigger compile errors.
  - **Remediation:** Use `WrapSocketHandlerOptions<TReq>` and `SocketOperationContext`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-028] Race Condition Between Asynchronous Disconnect Timers and Immediate Reconnection** — [apps/server/src/features/rooms/room.socket_handler.ts:282-344](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L282-L344)
  - **Dimension:** F (Integration Contracts & State Stores)
  - **Rule Source:** `.agents/rules/concurrency-and-threading-principles.md` (Avoid Race Conditions)
  - **Description:** If a client reconnects while `handleSocketDisconnect` is between resolving `roomService.handleDisconnect` and calling `timerRegistry.set`, the reconnect cancellation fires first and the disconnect timer is installed after, leaving an orphan abandonment timer.
  - **Impact:** Reconnected players can be forfeited by an orphan timer if connections flap rapidly.
  - **Remediation:** Manage disconnect timers inside `RoomService` under the room lock.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-029] Missing Inbound/Outbound Runtime Schema Validation on Core Socket Events** — [shared/src/contracts/schemas.ts:65-165](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L65-L165)
  - **Dimension:** F (Integration Contracts & State Stores)
  - **Rule Source:** `.agents/rules/data-serialization-and-interchange-principles.md` (Validate at System Boundaries)
  - **Description:** Zero Zod runtime schemas exist for core WebSocket models: `RoomState`, `GameState`, `Player`, `MoveResult`, `GameOverPayload`. Payloads rely solely on compile-time TypeScript type assertions.
  - **Impact:** Malformed or drifted payloads cause unhandled runtime errors in client and server.
  - **Remediation:** Create Zod schemas for core event models and validate on emission and receipt.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-030] Client-Server State Drift and Rematch Failure Caused by Wiping Both Players in `leaveRoomTransition`** — [apps/server/src/features/rooms/room.logic.ts:271-282](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.logic.ts#L271-L282)
  - **Dimension:** F (Integration Contracts & State Stores)
  - **Rule Source:** `.agents/rules/architectural-pattern.md` (Domain state consistency)
  - **Description:** In `leaveRoomTransition`, when one player leaves an active game, the transition sets *both* `whitePlayer: null` and `blackPlayer: null`. The remaining player is wiped on the server, causing subsequent rematch requests to crash.
  - **Impact:** A player whose opponent left cannot initiate a rematch; server and client states drift permanently.
  - **Remediation:** Only set the leaving player to `null` in `leaveRoomTransition`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-031] Non-Idempotent Move Submission and Vulnerability to Out-of-Order Socket Events** — [shared/src/contracts/schemas.ts:118-123](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L118-L123), [apps/client/src/composables/useSocket.ts:420-430](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L420-L430)
  - **Dimension:** F (Integration Contracts & State Stores)
  - **Rule Source:** `.agents/rules/api-design-principles.md` (Idempotency), `.agents/rules/concurrency-and-threading-principles.md`
  - **Description:** `MakeMoveRequest` lacks an idempotency token or move number. Retrying a move triggers `NotYourTurnError` instead of returning the applied move. Out-of-order `game:moved` packets on the client cause board state regressions.
  - **Impact:** False error toasts on network retries; board state desynchronization on out-of-order packets.
  - **Remediation:** Add `expectedMoveNumber` to `MakeMoveRequestSchema`; verify `moveNumber >= currentMoveCount` on client.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-032] `InMemoryRoomStore.delete` Does Not Await Queued Operations Before Room Purge** — [apps/server/src/features/rooms/in_memory_room.store.ts:273-289](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L273-L289)
  - **Dimension:** F (Integration Contracts & State Stores)
  - **Rule Source:** `.agents/rules/concurrency-and-threading-principles.md` (Mutual exclusion)
  - **Description:** `delete` attaches a `.finally()` handler to `entry.tail` but does not await it, immediately deleting the room from `this.rooms`. In-flight operations fail with `RoomNotFoundError`.
  - **Impact:** Race conditions during room cleanup causing in-flight requests to fail abruptly.
  - **Remediation:** Acquire `withLock(roomCode)` or await `entry.tail` before purging room state.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-033] Violation of API Error Response Envelope in Native HTTP Server** — [apps/server/src/platform/http/http_server.ts:62-86](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L62-L86)
  - **Dimension:** F (Integration Contracts & State Stores)
  - **Rule Source:** `.agents/rules/api-design-principles.md` (API Error Response Format)
  - **Description:** The HTTP server formats error responses as `{ code, error, message, correlationId, timestamp }` rather than the mandatory envelope `{ status: "error", code, error: { code, message, details, correlationId } }`. CORS preflight rejections return plain text.
  - **Impact:** Transport and domain layers are flattened; API clients cannot reliably parse error envelopes.
  - **Remediation:** Normalize `formatHttpError` to the standard envelope format and return JSON for CORS errors.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-034] Unsynchronized Concurrent Mutations in `InMemorySessionRegistry`** — [apps/server/src/features/rooms/in_memory_session_registry.ts:156-166](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_session_registry.ts#L156-L166)
  - **Dimension:** F (Integration Contracts & State Stores)
  - **Rule Source:** `.agents/rules/concurrency-and-threading-principles.md` (Avoid Race Conditions)
  - **Description:** `cleanupExpiredSessions()` iterates over `this.sessions.entries()` while awaiting asynchronous `deleteSession()` calls without synchronization, risking iterator desynchronization across secondary indices (`roomIndex`, `playerIndex`).
  - **Impact:** Secondary indices drift from session state, leading to leaked index entries.
  - **Remediation:** Collect expired tokens synchronously before deleting, and guard multi-index updates.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-035] Missing Unit Tests for HTTP Platform Controllers in Server** — [apps/server/src/platform/http/controllers/health.controller.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/health.controller.ts#L1)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `.agents/rules/testing-strategy.md` (Test Pyramid 70% Unit)
  - **Description:** `HealthController`, `LanInfoController`, and `StaticController` completely lack co-located unit test suites and are only tested via high-level integration tests.
  - **Impact:** Controller routing, status codes, and metrics generation cannot be tested in isolation.
  - **Remediation:** Add co-located unit tests in `apps/server/src/platform/http/controllers/__tests__/`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-036] Missing Unit Tests for `IRoomGameAdapter` Core Mutation Methods in `RoomService`** — [apps/server/src/features/rooms/room.service.ts:437-506](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L437-L506)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `.agents/rules/testing-strategy.md` (Domain Logic in Isolation)
  - **Description:** `applyGameMove()`, `finalizeGame()`, `updateDrawOffer()`, and `updateRematch()` in `RoomService` have 0% unit test coverage in `room.service.spec.ts`.
  - **Impact:** Service-layer transactional coordination and lock acquisition are unverified at unit level.
  - **Remediation:** Add unit tests asserting proper delegation through `store.mutate()` and clock timestamping.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-037] Untested Contract Implementations and Motif Detection in Puzzle Analysis Engine** — [apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts:1032-1055](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts#L1032-L1055)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `.agents/rules/testing-strategy.md`
  - **Description:** `classifyTacticalMotif()`, `generateMistakeRefutation()`, `generateKidExplanation()`, and motif detector functions have 0% test coverage in `puzzle_analysis_engine.spec.ts`.
  - **Impact:** Pedagogical analysis and tactical motif feedback may deliver incorrect advice to young players without test detection.
  - **Remediation:** Add comprehensive unit tests in `puzzle_analysis_engine.spec.ts`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-038] Missing Integration Tests for Socket Rate Limiting Over Live Socket Connections** — [apps/server/src/platform/socket/socket_rate_limiter.ts:25](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L25)
  - **Dimension:** G (Dependencies & Test Coverage Gaps) & A (Security)
  - **Rule Source:** `.agents/rules/testing-strategy.md` (Integration testing against real adapters)
  - **Description:** Test helpers configure socket rate limiters with 10,000 requests to avoid rate limiting; no integration test verifies that rapid socket messages on a live connection are actually dropped and rate-limited.
  - **Impact:** Socket rate limiting could break silently in production without integration test alerts.
  - **Remediation:** Add a live integration test verifying that exceeding socket request rate drops messages and returns `ERR_RATE_LIMITED`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-039] Unexercised Error Recovery Paths in Browser Storage Adapter and Progress File Service** — [apps/client/src/platform/storage/browser_storage_adapter.ts:111-122](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/browser_storage_adapter.ts#L111-L122)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `.agents/rules/testing-strategy.md` (Unexercised error paths)
  - **Description:** Storage quota exceeded handling and `FileReader` error recovery paths have 0% test coverage.
  - **Impact:** Storage quota exhaustion or file read errors on mobile devices could fail ungracefully.
  - **Remediation:** Add tests simulating `QuotaExceededError` and `FileReader.onerror`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-040] Untested Client Application Bootstrap and Global Telemetry Error Handler** — [apps/client/src/main.ts:28-56](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L28-L56)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `.agents/rules/testing-strategy.md`
  - **Description:** `apps/client/src/main.ts` wires 10 DI keys, runs storage migrations, and configures `app.config.errorHandler` but has 0% test coverage.
  - **Impact:** Startup regressions or error handler serialization crashes will break client boot in production.
  - **Remediation:** Add a bootstrap integration test in `apps/client/src/__tests__/bootstrap.spec.ts`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-041] E2E Coverage Gaps in Tactical Puzzle Hub (Missing Puzzle Ladder and Puzzle Rush Modes)** — [apps/e2e/ui/puzzle.e2e.test.ts:4-86](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/puzzle.e2e.test.ts#L4-L86)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `.agents/rules/testing-strategy.md` (E2E: Complete user journeys)
  - **Description:** E2E tests only cover 1-move Skill Drills; Puzzle Ladder, Puzzle Rush timer/strikes, and multi-ply counter-moves have zero E2E tests.
  - **Impact:** Regressions in ladder rating math, timer countdowns, or multi-ply puzzle play will not be caught.
  - **Remediation:** Add E2E tests for Puzzle Ladder and Puzzle Rush.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-042] E2E Coverage Gaps in Local AI Journey (Missing Black Perspective, Winning Flow, and Bot Personalities)** — [apps/e2e/ui/ai.e2e.test.ts:5-128](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/ai.e2e.test.ts#L5-L128)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `.agents/rules/testing-strategy.md`
  - **Description:** E2E tests only cover playing White against Peanut up to resignation; playing as Black (AI opening move), checkmating AI, and undo/takeback are untested.
  - **Impact:** Playing as Black or winning against AI could be broken without failing E2E gates.
  - **Remediation:** Expand `ai.e2e.test.ts` with Black perspective, checkmate victory, and undo tests.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-043] E2E Coverage Gaps in Progress Portability & Sync (Missing Conflict Resolution and Invalid Payload Rejection)** — [apps/e2e/ui/sync.e2e.test.ts:4-100](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/sync.e2e.test.ts#L4-L100)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `.agents/rules/testing-strategy.md`
  - **Description:** The 3-way conflict modal (Keep Local / Overwrite / Merge) and corrupted save rejection banners are completely untested in E2E.
  - **Impact:** Progress conflict resolution bugs could overwrite user progress without test detection.
  - **Remediation:** Add E2E tests for 3-way merge conflict resolution and corrupted payload import.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-044] E2E Coverage Gaps in LAN Multiplayer (Missing Promotion, Disconnect Timeout, and Rematch Rejection)** — [apps/e2e/ui/multiplayer.e2e.test.ts:4-380](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/multiplayer.e2e.test.ts#L4-L380)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `.agents/rules/testing-strategy.md`
  - **Description:** Synchronized pawn promotion between players, disconnect forfeit victory, and rematch decline flow are not tested in E2E.
  - **Impact:** Multiplayer promotion desync or forfeit timer bugs are not covered by end-to-end tests.
  - **Remediation:** Add promotion and forfeit victory tests in `multiplayer.e2e.test.ts`.
  - **Fix workflow:** `/bugfix`

---

## Minor Issues
Code maintainability issues, function length/complexity violations, or minor test gaps. Fix in near term.

- [ ] **[MIN-001] Base URL Validation in `@fun-chess/shared` Preempts `safeParseUrl` Protocol Normalization for `PUBLIC_URL`** — [shared/src/contracts/schemas.ts:240-243](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L240-L243)
  - **Dimension:** A | **Remediation:** Prepend `https://` in preprocessing before `z.string().url()`. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-002] Client Save Import Lacks Decompression Ratio / Maximum Output Size Guard** — [shared/src/utils/progress_codec.ts:226-228](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_codec.ts#L226-L228)
  - **Dimension:** A | **Remediation:** Add max decompressed size limit (5MB) before buffer inflation. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-003] `docker-compose.yml` Omits Proxy Trust, Logging, and Rate Limiting Configuration** — [docker-compose.yml:8-14](file:///home/irahardianto/works/projects/fun-chess/docker-compose.yml#L8-L14)
  - **Dimension:** A | **Remediation:** Add `TRUST_PROXY`, `LOG_LEVEL`, `RATE_LIMIT_*` environment variables. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-004] Silent Failure Suppression via Default `SILENT_CHESS_LOGGER` in `chess_factory.ts`** — [shared/src/utils/chess_factory.ts:35-37](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/chess_factory.ts#L35-L37)
  - **Dimension:** B | **Remediation:** Default to `console.warn` in dev or structured logger in production. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-005] Silent Swallowing of Response Body Parsing Failures in `FetchApiClient.parseResponseBody`** — [apps/client/src/platform/api/fetch_api_client.ts:93-97](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L93-L97)
  - **Dimension:** B | **Remediation:** Log warning when JSON parsing fails on response body. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-006] Bindingless Catch Blocks Swallowing Parsing and Simulation Errors in `puzzle_analysis_engine.ts`** — [apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts:103-105](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts#L103-L105)
  - **Dimension:** B | **Remediation:** Validate FEN before constructing `Chess` and log unexpected errors. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-007] Missing Explicit Request and Keep-Alive Timeouts on HTTP Server** — [apps/server/src/index.ts:158](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L158)
  - **Dimension:** B | **Remediation:** Configure `requestTimeout = 30_000`, `headersTimeout = 31_000`, `keepAliveTimeout = 5_000`. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-008] Cross-Module Internal File Imports Bypassing Public `index.ts`** — [apps/server/src/features/rooms/room.socket_handler.ts:14-23](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L14-L23)
  - **Dimension:** C | **Remediation:** Import from module public entry points (`../../platform/socket/index.js`). | **Fix workflow:** `/refactor`
- [ ] **[MIN-009] Oversized Monolithic Functions and Files Violating Code Organization Guidelines** — [apps/server/src/platform/http/http_server.ts:210](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L210)
  - **Dimension:** C | **Remediation:** Decompose `createHttpServer` (309 lines) and `startServer` (305 lines) into discrete pipeline steps. | **Fix workflow:** `/refactor`
- [ ] **[MIN-010] Test Co-Location and File Hierarchy Discrepancies** — [apps/client/src/composables/__tests__/useProgressSync.spec.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/__tests__/useProgressSync.spec.ts#L1)
  - **Dimension:** C | **Remediation:** Remove duplicate test files and co-locate tests with implementations. | **Fix workflow:** `/refactor`
- [ ] **[MIN-011] Unconditional ERROR Log Level on Caught HTTP Client-Side (4xx) Exceptions** — [apps/server/src/platform/http/http_server.ts:492-508](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L492-L508)
  - **Dimension:** D | **Remediation:** Log 4xx client errors at WARN level; only 5xx at ERROR level. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-012] Missing Correlation ID in Low-Level Socket Engine Connection Error Logging** — [apps/server/src/platform/socket/socket_server.ts:83-91](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_server.ts#L83-L91)
  - **Dimension:** D | **Remediation:** Extract `x-correlation-id` from handshake headers or generate random UUID. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-013] Missing Mandatory `operation` Context Field in Static Handler Debug Log** — [apps/server/src/platform/http/static_handler.ts:296-300](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L296-L300)
  - **Dimension:** D | **Remediation:** Add `operation: "http_static"` to context object. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-014] Unlogged Asynchronous Hardware Camera Stream Acquisition** — [apps/client/src/features/portability/composables/useCameraStream.ts:84-183](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useCameraStream.ts#L84-L183)
  - **Dimension:** D | **Remediation:** Add start and success logging with `correlationId` and `durationMs`. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-015] Missing Correlation ID and Duration Tracking in Client Storage Migration** — [apps/client/src/platform/storage/keys.ts:32-80](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/keys.ts#L32-L80)
  - **Dimension:** D | **Remediation:** Generate correlation ID and record duration in migration log. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-016] Single Responsibility Violations with "And" Functions Across Codebase** — [shared/src/utils/chess_evaluation.ts:29](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/chess_evaluation.ts#L29)
  - **Dimension:** E | **Remediation:** Split `calculateMaterialAndCaptures` into single-purpose functions. | **Fix workflow:** `/refactor`
- [ ] **[MIN-017] Coupled Audio Synthesis and Device Haptics in `useAudio`** — [apps/client/src/composables/useAudio.ts:31](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useAudio.ts#L31)
  - **Dimension:** E | **Remediation:** Separate into `useAudio` and `useHaptics` or create `useGameFeedback`. | **Fix workflow:** `/refactor`
- [ ] **[MIN-018] Duplicated Material Evaluation Loops Across Server, Client, and Shared** — [shared/src/utils/chess_evaluation.ts:29](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/chess_evaluation.ts#L29)
  - **Dimension:** E | **Remediation:** Centralize board material calculation in `shared/src/utils/chess_evaluation.ts`. | **Fix workflow:** `/refactor`
- [ ] **[MIN-019] Duplicated King Square Coordinate Discovery Across Server and Client** — [apps/server/src/features/game/chess_engine.ts:300](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L300)
  - **Dimension:** E | **Remediation:** Share `getKingSquare` via `shared/src/utils/chess_evaluation.ts`. | **Fix workflow:** `/refactor`
- [ ] **[MIN-020] Duplicated and Misplaced Client IP Parsing in `static_handler.ts` and `socket_rate_limiter.ts`** — [apps/server/src/platform/http/static_handler.ts:42](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L42)
  - **Dimension:** E | **Remediation:** Extract IP extraction into `apps/server/src/platform/http/ip_utils.ts`. | **Fix workflow:** `/refactor`
- [ ] **[MIN-021] Unsafe `any` Type in Error Catch Blocks in Portability Composables and Views** — [apps/client/src/features/portability/composables/useProgressSync.ts:123](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useProgressSync.ts#L123)
  - **Dimension:** E | **Remediation:** Use `catch (err: unknown)` and narrow with `instanceof Error`. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-022] Unnecessary `as any` Casting in `ShutdownCoordinator` and `FileStorage`** — [apps/server/src/platform/lifecycle/shutdown_coordinator.ts:45](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L45)
  - **Dimension:** E | **Remediation:** Remove `as any` and rely on typed interfaces. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-023] Zombie Component and Module Shims Violating Code Organization** — [apps/client/src/components/AppViewRouter.vue:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/AppViewRouter.vue#L1)
  - **Dimension:** E | **Remediation:** Update import sites to point directly to canonical locations and delete shims. | **Fix workflow:** `/refactor`
- [ ] **[MIN-024] Unused Imports, Unused Parameters, and Dead Properties in Server Modules** — [apps/server/src/features/game/game.service.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L1)
  - **Dimension:** E | **Remediation:** Remove unused imports and enable `noUnusedLocals` in `tsconfig.json`. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-025] Untyped Socket Parameter Leading to Unsafe `as any` Casting in Room Socket Handler** — [apps/server/src/features/rooms/room.socket_handler.ts:128](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L128)
  - **Dimension:** F | **Remediation:** Type `socket` as `Socket<ClientToServerEvents, ServerToClientEvents>`. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-026] Root Package Phantom Dependency Hoisting of `socket.io-client`** — [package.json:33](file:///home/irahardianto/works/projects/fun-chess/package.json#L33)
  - **Dimension:** G | **Remediation:** Keep server integration test dependencies in `apps/server/package.json`. | **Fix workflow:** `/refactor`
- [ ] **[MIN-027] Misplaced Workspace Dependency Scope in E2E Test Suite Manifest** — [apps/e2e/package.json:20-22](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/package.json#L20-L22)
  - **Dimension:** G | **Remediation:** Move `@fun-chess/shared` from `dependencies` to `devDependencies` in `apps/e2e`. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-028] Unexercised Error Handling in Progress Codec Decompression and Parsing** — [shared/src/utils/progress_codec.ts:230-240](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_codec.ts#L230-L240)
  - **Dimension:** G | **Remediation:** Add unit tests with corrupted Deflate bytes and malformed envelope JSON. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-029] Unexercised Defensive Branches and Fallback Logic in Puzzle Validator** — [apps/client/src/features/puzzles/engine/puzzle_validator.ts:112-120](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_validator.ts#L112-L120)
  - **Dimension:** G | **Remediation:** Add unit tests for out-of-bounds move indices and corrupted UCI strings. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-030] Untested Checkmate Audio Synthesis Fanfare in AudioSynthesizer** — [apps/client/src/platform/audio/audio_synthesizer.ts:369-400](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/audio/audio_synthesizer.ts#L369-L400)
  - **Dimension:** G | **Remediation:** Add unit test asserting `playCheckmate` schedules Web Audio oscillators correctly. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-031] Unexercised Validation Error and Reconnect Branches in RoomService** — [apps/server/src/features/rooms/room.service.ts:139-149](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L139-L149)
  - **Dimension:** G | **Remediation:** Add unit tests asserting validation errors on empty/long player names and missing rooms. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-032] Uncovered Error Handling in Static File Serving Handler** — [apps/server/src/platform/http/static_handler.ts:215-227](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L215-L227)
  - **Dimension:** G | **Remediation:** Add tests simulating file system errors returning 500 and non-HTML 404s. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-033] Unexercised Error Paths and Cleanup Methods in Confetti Trigger** — [apps/client/src/platform/confetti/confetti_trigger.ts:86-90](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/confetti/confetti_trigger.ts#L86-L90)
  - **Dimension:** G | **Remediation:** Add unit tests calling `clear()`, `dispose()`, and `triggerVictoryConfetti()`. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-034] Unexercised Error Recovery Paths in Safe Chess Factory** — [shared/src/utils/chess_factory.ts:99-110](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/chess_factory.ts#L99-L110)
  - **Dimension:** G | **Remediation:** Mock `validateFen` and `chess.load` to throw and test error recovery. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-035] Unexercised Domain Error Classes in Shared Package** — [shared/src/contracts/errors.ts:141-150](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/errors.ts#L141-L150)
  - **Dimension:** G | **Remediation:** Add tests instantiating `GameNotActiveError`, `UnauthorizedError`, `OptimisticLockConflictError`. | **Fix workflow:** `/bugfix`

---

## Enhancement Issues
Non-critical suggestions, defense-in-depth, documentation, or minor clarity refactorings.

- [ ] **[ENH-001] Client IP Extraction Does Not Normalize IPv4-Mapped IPv6 Addresses (`::ffff:`)** — [apps/server/src/platform/http/static_handler.ts:59](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L59) (Dimension A)
- [ ] **[ENH-002] Multi-Hop Reverse Proxy Architectures Unhandled in `extractClientIp`** — [apps/server/src/platform/socket/socket_rate_limiter.ts:53-54](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L53-L54) (Dimension A)
- [ ] **[ENH-003] Static Asset Requests Consume Shared HTTP API Rate Limiter Quota** — [apps/server/src/platform/http/http_server.ts:404](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L404) (Dimension A)
- [ ] **[ENH-004] Direct Multiline Banner Console Logging in Server Startup** — [apps/server/src/index.ts:341-354](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L341-L354) (Dimension D)
- [ ] **[ENH-005] Missing DEBUG-Level Transaction Instrumentation in `InMemoryRoomStore`** — [apps/server/src/features/rooms/in_memory_room.store.ts:125-271](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L125-L271) (Dimension D)
- [ ] **[ENH-006] Generic Operation Naming Across Native HTTP Route Endpoints** — [apps/server/src/platform/http/http_server.ts:338-460](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L338-L460) (Dimension D)
- [ ] **[ENH-007] Missing `onScopeDispose` Hook Support for Non-Component Lifecycles in `useScenarioRunner` and `useMascotBanter`** — [apps/client/src/features/scenarios/composables/useScenarioRunner.ts:427-431](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/composables/useScenarioRunner.ts#L427-L431) (Dimension B)
- [ ] **[ENH-008] Unbounded Room Map Capacity in `InMemoryRoomStore` Lacks High-Water Defense** — [apps/server/src/features/rooms/in_memory_room.store.ts:25-30](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L25-L30) (Dimension B)
- [ ] **[ENH-009] Shared Module-Level State Singletons Complicate Isolated Parallel Testing** — [apps/server/src/features/rooms/disconnect_timer_registry.ts:69](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/disconnect_timer_registry.ts#L69) (Dimension C)
- [ ] **[ENH-010] Domain Functions Rely on Impure Default Time Parameter `now: number = Date.now()`** — [apps/server/src/features/rooms/room.logic.ts:310](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.logic.ts#L310) (Dimension C)
- [ ] **[ENH-011] `useAiWorker` Hardcodes `minimaxEngine` Without Engine Contract Inversion** — [apps/client/src/features/ai/composables/useAiWorker.ts:6](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiWorker.ts#L6-L7) (Dimension C)
- [ ] **[ENH-012] Orphaned Data Model `SessionInfo` in Shared Contracts** — [shared/src/contracts/models.ts:75-86](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/models.ts#L75-L86) (Dimension F)
- [ ] **[ENH-013] Inconsistent Callback Error Type Signature in `events.ts` for `room:leave`** — [shared/src/contracts/events.ts:149-155](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/events.ts#L149-L155) (Dimension F)

---

## Verification Suite Results
- **Linter & Static Analysis:** PASS
  - TypeScript compiler (`tsc --noEmit`) and Vue compiler (`vue-tsc --noEmit`): 0 errors across `@fun-chess/shared`, `@fun-chess/server`, `@fun-chess/client`, and `@fun-chess/e2e`.
  - Note: ESLint is not configured in repository manifests (flagged as [MAJOR-024]).
- **Automated Tests:** PASS
  - Unit Tests: 140 test files passed, 1,843 tests passed (0 failed).
  - Integration Tests: 8 test files passed, 61 tests passed (0 failed).
  - Total Tests: 1,904 tests passed (0 failed across 148 test files).
- **Build Verification:** PASS
  - All workspace packages (`@fun-chess/shared`, `@fun-chess/server`, `@fun-chess/client`) built successfully in 6.6s.
  - PWA bundle generated with 18 precached entries.
- **Test Coverage:**
  - Overall monorepo statement coverage: ~89.4%.
  - `@fun-chess/shared`: ~96.2%.
  - `@fun-chess/server`: ~93.8%.
  - `@fun-chess/client`: ~87.1%.

---

## Cross-Dimension Correlations
Findings where multiple dimensions converged on the same component or failure mode, escalating severity:

1. **Duplicate PWA and Network Composables (Converged across B, C, E, G → Escalated to [CRIT-004]):**
   - Dimension B flagged leaked window event listeners and consumed prompt errors on unmount.
   - Dimension C flagged architectural boundary violations and split module-scoped reactive singletons.
   - Dimension E flagged code duplication (95% identical code across 4 files).
   - Dimension G flagged fragmented test coverage and split test suites.
   - *Escalation Rationale:* When a structural defect simultaneously leaks memory, duplicates event listeners, splits user-facing reactive state, and bifurcates test coverage, it ceases to be a minor clean-up and becomes a critical reliability hazard.

2. **Concurrent Room Creation & Overwrite Race (Converged across A, F → Escalated to [CRIT-003]):**
   - Dimension A flagged room code allocation as an access control and DoS vulnerability.
   - Dimension F flagged room code allocation as a non-atomic data store race condition where `save` silently overwrites existing rooms.
   - *Escalation Rationale:* Concurrency flaws that allow unauthorized overwrites of active game rooms constitute broken access control and data corruption.

3. **Monolithic `useSocket.ts` (Converged across C, D, E → Escalated to [CRIT-005]):**
   - Dimension C flagged domain logic placed in a generic technical layer (`composables/`).
   - Dimension D flagged 21 incoming socket event message consumers running completely unobserved.
   - Dimension E flagged a 1,329-line God Composable with `as any` event degradation.
   - *Escalation Rationale:* Core transport and domain multiplayer mechanics operating without logging, without type safety, and outside vertical boundaries represents an architectural and operational liability.

4. **Pure Engine Logging Coupling (Converged across C, D):**
   - Dimension C flagged pure algorithmic functions calling I/O loggers (`chess_engine.ts`, `puzzle_validator.ts`).
   - Dimension D flagged pure functions emitting operational logs without operation boundaries.
   - *Escalation Rationale:* Both dimensions confirmed business logic impurity, violating Rule 2 of Testability-First Design.

---

## Dimensions Covered
| Dimension | Status | Files / Queries Examined |
|---|---|---|
| A. Security & Configuration | ✅ Checked | Scanned 342 source and config files for SQL/command injection, XSS, SSRF, path traversal, IDOR, secrets (gitleaks: 0), `.env.template` completeness, CORS, and rate limiting. |
| B. Reliability & Error Handling | ✅ Checked | Audited error handling, catch blocks, hanging promises, process exit hooks, disconnect grace periods, and timeout handles across server and client. |
| C. Testability & Architecture | ✅ Checked | Evaluated I/O isolation, business logic purity, dependency direction, circular dependencies (dpdm), vertical slice boundaries, and DI token usage. |
| D. Observability & Logging | ✅ Checked | Inspected operation entry points (HTTP, WebSockets, background jobs), 3-point logging, correlation IDs, PII redaction paths, and log levels. |
| E. Code Quality & Patterns | ✅ Checked | Audited function complexity, single responsibility violations, code duplication (DRY), naming intent, type safety, and zombie shims. |
| F. Integration Contracts & DB | ✅ Checked | Mapped Socket.IO event contracts, HTTP endpoints, Zod schema coverage, and in-memory store concurrency (`withLock`, CAS, session registries). |
| G. Dependencies & Tests | ✅ Checked | Audited package manifests, version pinning, lockfile integrity, uncovered error paths, controller unit tests, and Playwright E2E suites. |

---

## Rules Applied
- `security-mandate.md` / `security-principles.md`
- `rugged-software-constitution.md`
- `architectural-pattern.md`
- `code-organization-principles.md`
- `core-design-principles.md`
- `code-idioms-and-conventions.md`
- `logging-and-observability-mandate.md`
- `error-handling-principles.md`
- `resources-and-memory-management-principles.md`
- `concurrency-and-threading-principles.md`
- `api-design-principles.md` / `database-design-principles.md`
- `dependency-management-principles.md` / `testing-strategy.md`

---

## Remediation Action Plan
Findings ranked by priority for resolution:

1. **[CRIT-001]** Fix `FetchApiClient.checkHealth` Zod schema mismatch with server `/health` → `/bugfix`
2. **[CRIT-002]** Invalidate timed-out lock operations in `InMemoryRoomStore` to prevent state overwrite leaks → `/bugfix`
3. **[CRIT-003]** Add atomic `createIfAbsent` check under lock in `InMemoryRoomStore` to prevent room overwrites → `/bugfix`
4. **[CRIT-004]** Deduplicate PWA and Network composables into `features/pwa/`, merge test suites, and remove global duplicates → `/bugfix`
5. **[CRIT-005]** Decompose `useSocket.ts` into feature composables (`useSocketTransport`, `useRoomSession`, `useGameActions`) with telemetry → `/refactor`
6. **[MAJ-001]** Key socket rate limiter strictly by `clientIp` without appending `socket.id` → `/bugfix`
7. **[MAJ-002]** Permit `CLIENT_URL` alone as valid production origin in server config schema → `/bugfix`
8. **[MAJ-003]** Only inspect `x-forwarded-proto` for HSTS when `TRUST_PROXY` is true → `/bugfix`
9. **[MAJ-004]** Resolve hanging delay promise on cancellation in `useAiWorker.ts` → `/bugfix`
10. **[MAJ-005]** Install window error and unhandled rejection telemetry listeners in `main.ts` → `/bugfix`
11. **[MAJ-011]** Extract HTTP controller interfaces to eliminate circular dependency in `apps/server/src/platform/http/` → `/refactor`
12. **[MAJ-012]** Decouple `GameService` from `RoomStore` internals via `IRoomGameAdapter` → `/refactor`
13. **[MAJ-017]** Replace raw `console.warn/info/error` with structured telemetry logger across client composables → `/bugfix`
14. **[MAJ-022]** Refactor `App.vue` God Component to scoped stores/composables, eliminating 35+ prop drilling → `/refactor`
15. **[MAJ-029]** Define runtime Zod schemas for core WebSocket models (`RoomState`, `GameState`, etc.) → `/bugfix`
16. **[MAJ-035] - [MAJ-044]** Backfill missing unit tests (HTTP controllers, room adapter) and E2E journeys (Ladder, Rush, Black perspective, Sync conflicts) → `/bugfix`
