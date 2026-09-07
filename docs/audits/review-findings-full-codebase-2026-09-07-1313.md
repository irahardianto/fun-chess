# Code Audit: Full Codebase (Fun Chess Monorepo)
Date: 2026-09-07
Auditor: AI Code Audit (multi-dimensional, 7 parallel subagents)

## Executive Summary
- **Dimensions activated:** A (Security & Configuration), B (Reliability & Error Handling), C (Testability & Architecture), D (Observability & Logging), E (Code Quality & Patterns), F (Integration Contracts & Database), G (Dependencies & Test Coverage Gaps)
- **Dimensions skipped:** None (all 7 dimensions fully activated across the monorepo)
- **Files scanned:** 435 files examined across `apps/server`, `apps/client`, `shared`, `infra`, and `tests`
- **Findings:** 87 unique findings (6 critical, 41 major, 25 minor, 15 enhancement)
- **Automated verification:**
  - **Lint & Typecheck:** PASS (`vue-tsc -b` for client, `tsc --noEmit` for server, shared, and e2e; `typos` 0 errors; `gitleaks` 0 leaks)
  - **Tests:** PASS (170 test files, 2,008 tests passed, 0 failed across unit, contract, integration, and E2E suites)
  - **Build:** PASS (`tsc` for shared, `tsc` for server, `vue-tsc -b && vite build` with PWA generation in 6.0s for client)
  - **Coverage:** Shared: 94.85% lines / 90.76% funcs; Server: 84.90% lines / 85.62% funcs; Client: ~39.95% (distorted by 22k LOC offline data scripts inside `src/`)
- **Overall codebase health:** NEEDS ATTENTION (Passing test suite and clean builds mask critical rate-limiter bypass via IP spoofing, a concurrency lock release hazard on timeout, unhandled async disconnect rejections, direct `localStorage` access bypassing I/O safety, and 22,000 LOC of unexcluded offline scripts in the client source tree)

---

## Critical Issues
Vulnerabilities or severe defects that cause active security breaches, data loss, application crashes, or system compromise. Must be fixed immediately.

- [ ] **[CRIT-001] Unconditional Trust in `X-Forwarded-For` Allows Rate Limiter Bypass & IP Spoofing** — [socket_rate_limiter.ts:23-43](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L23-L43) & [static_handler.ts:47-55](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L47-L55)
  - **Dimension:** A (Security & Configuration) & D (Observability & Logging)
  - **Rule Source:** [.agents/rules/security-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/security-principles.md) (§Input Validation, §Rate Limiting), [.agents/rules/rugged-software-constitution.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/rugged-software-constitution.md)
  - **Description:** `extractClientIp` unconditionally extracts client IP from `s.handshake?.headers?.["x-forwarded-for"]` without validating that the connection originated from a trusted reverse proxy. In addition, when rate limits are exceeded, the socket listeners silently return or emit without logging any warning to the server logger.
  - **Impact:** Any remote client can bypass ingress rate limits on `room:create`, `room:join`, `room:reconnect`, and `game:move` by rotating arbitrary `X-Forwarded-For` headers on each socket frame, enabling room code brute forcing (only 614k combinations) and room exhaustion DoS attacks.
  - **Evidence:**
    ```typescript
    // apps/server/src/platform/socket/socket_rate_limiter.ts:26-29
    const forwarded = s.handshake?.headers?.["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      return forwarded.split(",")[0]?.trim() || "127.0.0.1";
    }
    ```
  - **Remediation:** Introduce `TRUST_PROXY` boolean configuration. When not behind a verified proxy, rely exclusively on `socket.handshake.address` or `socket.conn.remoteAddress`. When rate limit drops occur, emit a structured `logger.warn` with `clientIp`, `socketId`, and `correlationId`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-002] Broken Lock Mutex Invariant in `InMemoryRoomStore` on Timeout Causing Concurrent Mutations** — [in_memory_room.store.ts:117-143](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L117-L143)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** [.agents/rules/resources-and-memory-management-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/resources-and-memory-management-principles.md) (§Always Clean Up Resources: Locks, Mutexes in ALL paths), [.agents/rules/error-handling-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/error-handling-principles.md)
  - **Description:** In `InMemoryRoomStore.withLock`, sequential linearizable mutations are coordinated via a FIFO lock queue (`entry.tail`). When `Promise.race([prevTail, timeoutPromise])` throws `LockTimeoutError`, execution jumps directly to the `finally` block, which unconditionally invokes `releaseLock()`. Because `prevTail` did not resolve within 5000ms, calling `releaseLock()` unblocks subsequent queued waiters while the previous holder is still running. Furthermore, `currentEntry.waitersCount` is decremented; when it hits 0, `this.lockQueues.delete(code)` deletes the lock queue entirely, allowing any incoming mutation to run concurrently without coordination.
  - **Impact:** Concurrent room mutations execute simultaneously without mutual exclusion, leading to race conditions, lost updates, corrupted chess board states, and version collision crashes in active matches.
  - **Evidence:**
    ```typescript
    // apps/server/src/features/rooms/in_memory_room.store.ts:129-138
    } finally {
      if (timer) clearTimeout(timer);
      releaseLock(); // Prematurely unblocks next waiter when timeout occurs!
      const currentEntry = this.lockQueues.get(code);
      if (currentEntry) {
        currentEntry.waitersCount--;
        if (currentEntry.waitersCount <= 0) {
          this.lockQueues.delete(code); // Purges active queue entry!
        }
      }
    }
    ```
  - **Remediation:** Track whether the lock was actually acquired before executing `action()`. On timeout before acquisition, do not resolve `currentLock` prematurely; instead, forward resolution once `prevTail` settles so subsequent queued waiters remain blocked until the slow operation completes.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-003] Unhandled Async Disconnect Rejection & Non-Terminating unhandledRejection Handler** — [index.ts:101-108](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L101-L108) & [shutdown_coordinator.ts:153-160](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L153-L160)
  - **Dimension:** B (Reliability & Error Handling), D (Observability), and G (Dependencies & Test Coverage)
  - **Rule Source:** [.agents/rules/error-handling-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/error-handling-principles.md) (Rule 1: Never Fail Silently, Rule 2: Fail Fast), [.agents/rules/rugged-software-constitution.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/rugged-software-constitution.md)
  - **Description:** `socket.on("disconnect", async (reason) => { await handleSocketDisconnect(...) })` passes an async event handler without `try/catch`. In Node.js, event emitters do not catch rejected promises from async listener functions. If `handleSocketDisconnect` throws (e.g. storage error, concurrency rejection), Node emits an `unhandledRejection` event. In `ShutdownCoordinator`, the `unhandledRejection` listener logs the rejection with `logger.error`, but does not crash or initiate shutdown, converting fatal asynchronous exceptions into non-fatal background logs.
  - **Impact:** Severed connections, zombie player sessions, and uncleaned disconnect timers persist silently in memory. The server continues operating in an undefined state with corrupted room rosters.
  - **Evidence:**
    ```typescript
    // apps/server/src/index.ts:101-107
    socket.on("disconnect", async (reason) => {
      logger.info("Client socket disconnected", { ... });
      await handleSocketDisconnect(io, socket.id, roomService, logger); // No try/catch!
    });
    ```
  - **Remediation:** Wrap `handleSocketDisconnect` in a `try/catch` inside the disconnect listener, emit a structured error log with stack trace, and ensure the coordinator triggers graceful shutdown if an unrecoverable rejection occurs.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-004] Offline Data Generator Scripts in Client Source Tree Dragging Coverage & Breaking CI Tests** — [apps/client/src/features/puzzles/data/scripts/](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/data/scripts/)
  - **Dimension:** G (Dependencies & Test Coverage Gaps) & E (Code Quality & Patterns)
  - **Rule Source:** [.agents/rules/code-organization-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/code-organization-principles.md) (§Module Boundaries), [.agents/rules/testing-strategy.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/testing-strategy.md) (§Test Pyramid >85% mandate)
  - **Description:** 51 standalone generator and pack builder scripts (over 22,000 LOC of Node `.mjs` and Python `.py` scripts, including compiled `.pyc` bytecode) are committed inside `apps/client/src/features/puzzles/data/scripts/`. Because these files reside under `src/`, Vitest coverage scans and instruments all of them. Because they are offline tools with no unit tests, they register 0% coverage and drag `@fun-chess/client` statement coverage down from 91.26% to **39.95%**. Furthermore, running Vitest under coverage instrumentation adds CPU overhead that causes `deep_interaction_verification.spec.ts` (scanning all 336 puzzles for alternative checkmates) to exceed Vitest's 5000ms timeout and fail with exit code 1.
  - **Impact:** Distorts code coverage metrics, violates the >85% coverage rule, breaks CI test pipelines under coverage mode, and pollutes client bundle source directories with offline build scripts.
  - **Evidence:**
    Running `pnpm --filter @fun-chess/client exec vitest run --coverage` fails with:
    `FAIL src/__tests__/deep_interaction_verification.spec.ts: Test timed out in 5000ms.`
    Excluding `scripts` from coverage brings client statement coverage from 39.95% to 91.26%.
  - **Remediation:** Move `apps/client/src/features/puzzles/data/scripts/` to a root-level `scripts/puzzles/` or `tools/puzzle-generators/` directory outside `apps/client/src/`. Configure `coverage.exclude` in `apps/client/vite.config.ts`.
  - **Fix workflow:** `/refactor` / `/bugfix` — immediate priority

- [ ] **[CRIT-005] Direct Browser Storage Access Bypassing `KeyValueStorage` Abstraction Across Features** — [local_storage_progress.store.ts:28](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/store/local_storage_progress.store.ts#L28), [local_storage_puzzle_store.ts:47](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/local_storage_puzzle_store.ts#L47), [App.vue:24](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L24), [AiOpponentSelect.vue:31](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/components/AiOpponentSelect.vue#L31), [LobbyView.vue:67](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/LobbyView.vue#L67)
  - **Dimension:** C (Testability & Architecture), E (Code Quality & Patterns), and F (Integration Contracts & Database)
  - **Rule Source:** [.agents/rules/architectural-pattern.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/architectural-pattern.md) (§Rule 1: I/O Isolation)
  - **Description:** The platform provides a tested `KeyValueStorage` interface and `BrowserStorageAdapter` (`safeLocalStorage`) with quota detection, Safari private browsing in-memory fallbacks, and alert dispatchers. However, feature stores (`LocalStorageProgressStore`, `LocalStoragePuzzleProgressStore`) and UI components (`App.vue`, `AiOpponentSelect.vue`, `LobbyView.vue`, `usePwaInstall.ts`) bypass this platform abstraction, directly invoking `window.localStorage.getItem`, `setItem`, and `removeItem`.
  - **Impact:** In restricted browser contexts (Safari private mode, embedded webviews, iframe permissions), calling `window.localStorage.setItem` throws an unhandled `SecurityError` or `QuotaExceededError`, crashing component mounting or move submission without fallback. It also breaks I/O isolation and unit testability.
  - **Evidence:**
    ```typescript
    // apps/client/src/features/scenarios/store/local_storage_progress.store.ts:28-30
    const testKey = `__fc_test_${Date.now()}__`;
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    // apps/client/src/App.vue:24
    if (typeof localStorage !== 'undefined') return localStorage.getItem('fun_chess_player_avatar') || DEFAULT_PLAYER_AVATAR;
    ```
  - **Remediation:** Refactor all feature stores and components to inject or consume `safeLocalStorage` / `KeyValueStorage` rather than raw `window.localStorage`.
  - **Fix workflow:** `/refactor` / `/bugfix` — immediate priority

- [ ] **[CRIT-006] Swallowed Configuration Error in `createSocketServer` Origin Resolution** — [socket_server.ts:31-38](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_server.ts#L31-L38)
  - **Dimension:** A (Security & Configuration), B (Reliability & Error Handling), and E (Code Quality & Patterns)
  - **Rule Source:** [.agents/rules/rugged-software-constitution.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/rugged-software-constitution.md) (No silent failures, Fail securely), [.agents/rules/configuration-management-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/configuration-management-principles.md)
  - **Description:** `createSocketServer` wraps `loadServerConfig(process.env)` and `resolveAllowedOrigins(env)` in a `try { ... } catch { return []; }` block. When `resolveAllowedOrigins` throws because `CORS_ORIGIN` or `PUBLIC_URL` is missing in production, the catch block silently swallows the error and returns `[]`. Instead of halting startup with a clear error message, Socket.IO receives an empty origin allowlist and silently rejects every incoming WebSocket connection.
  - **Impact:** Misconfigured production deployments fail silently with obscure CORS handshake failures.
  - **Evidence:**
    ```typescript
    // apps/server/src/platform/socket/socket_server.ts:31-38
    if (process.env.NODE_ENV === "production") {
      try {
        const env = loadServerConfig(process.env);
        return resolveAllowedOrigins(env);
      } catch {
        return []; // Swallows configuration exception!
      }
    }
    ```
  - **Remediation:** Remove the empty `catch` block. Allow configuration validation errors to bubble up and fail fast during bootstrap, or log the error with full diagnostic context before terminating.
  - **Fix workflow:** `/bugfix` — immediate priority

---

## Major Issues
Structural violations, missing I/O error handling, untested critical paths, or broken contracts. Must be fixed before release.

- [ ] **[MAJ-001] Content Security Policy Misconfiguration Blocks Google Fonts in Production SPA** — [http_server.ts:30-31](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L30-L31)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `security-principles.md` (CSP Policy)
  - **Description:** The production HTTP server enforces static CSP headers restricting `style-src` to `'self' 'unsafe-inline'` and `font-src` to `'self'`, while `index.html` loads fonts from `https://fonts.googleapis.com` and `https://fonts.gstatic.com`. Production browsers actively block stylesheet downloads and font rendering.
  - **Remediation:** Add `https://fonts.googleapis.com` to `style-src` and `https://fonts.gstatic.com` to `font-src` in `SECURITY_HEADERS`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-002] Production Crash Loop in `docker-compose.yml` Due to Missing CORS / PUBLIC_URL** — [docker-compose.yml:8-14](file:///home/irahardianto/works/projects/fun-chess/docker-compose.yml#L8-L14)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `configuration-management-principles.md`
  - **Description:** `docker-compose.yml` sets `NODE_ENV=production` but omits `CORS_ORIGIN` and defaults `PUBLIC_URL` to empty. `resolveAllowedOrigins` throws fatal error, causing Docker to enter an infinite restart-crash loop.
  - **Remediation:** Add `CORS_ORIGIN=${CORS_ORIGIN:-}` to `docker-compose.yml` and document required production environment variables in `.env.example`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-003] Unbounded In-Memory Map in `SocketRateLimiter` Enables Heap Exhaustion DoS** — [socket_rate_limiter.ts:62-107](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L62-L107)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `resources-and-memory-management-principles.md` (Memory Bounds)
  - **Description:** `SocketRateLimiter` maintains `timestamps = new Map<string, number[]>()` without an entry capacity bound. An attacker rotating spoofed IP headers can flood thousands of unique keys per second, exhausting heap memory before the 60s prune timer runs.
  - **Remediation:** Enforce a maximum entry capacity (e.g. `maxKeys = 10_000`) with LRU or oldest-entry eviction.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-004] Bypassing Validated Configuration Module with Scattered Direct `process.env` Reads** — [lan.service.ts:17](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/lan.service.ts#L17), [relay_address.service.ts:138](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/relay_address.service.ts#L138), [http_server.ts:48](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L48)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `configuration-management-principles.md`, `typescript-idioms`
  - **Description:** Multiple server services read raw `process.env` instead of receiving validated configuration via dependency injection from `loadServerConfig(process.env)`.
  - **Remediation:** Pass validated configuration from `bootstrap()` into service constructors; remove direct `process.env` reads.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-005] Invalid Comma-Separated Origins Emitted in `Access-Control-Allow-Origin` HTTP Header** — [http_server.ts:121-122](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L121-L122)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `api-design-principles.md`, RFC 6454
  - **Description:** When non-preflight requests arrive without an `Origin` header, lines 121-122 set `Access-Control-Allow-Origin: process.env.CORS_ORIGIN`. If multiple comma-separated domains are configured, browsers reject responses as syntactically invalid.
  - **Remediation:** Only emit `Access-Control-Allow-Origin` for the specific matching origin if present and validated by `isOriginAllowed`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-006] Missing Ingress Rate Limiting on Stateful Socket Operations** — [game.socket_handler.ts:134-259](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.socket_handler.ts#L134-L259) & [room.socket_handler.ts:221-253](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L221-L253)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `security-principles.md` (Rate Limiting)
  - **Description:** `game:resign`, `game:offer_draw`, `game:respond_draw`, `game:request_rematch`, and `room:leave` completely lack rate limiting, allowing clients to spam mutex locks and event broadcasts.
  - **Remediation:** Enforce rate limiting across all socket message handlers or integrate rate limiting inside `wrapSocketHandler`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-007] Late Socket Acknowledgements Mutate State and Storage After Timeout in `useSocket`** — [useSocket.ts:414-451](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L414-L451)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `error-handling-principles.md`
  - **Description:** In `useSocket.ts`, the 8-second timeout resolves with `{ success: false, error: 'ERR_SOCKET_TIMEOUT' }`. However, if the server later responds, the ack callback still executes, mutating reactive state and saving session credentials for an operation the UI was already told failed.
  - **Remediation:** Introduce a `hasTimedOut` boolean flag inside each promise wrapper to discard late callbacks.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-008] AbortSignal Event Listener Leak in `FetchApiClient`** — [fetch_api_client.ts:21-35](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L21-L35)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `resources-and-memory-management-principles.md`
  - **Description:** `createTimeoutSignal` registers an `abort` listener on `callerSignal`, but `cleanup()` only clears the timer and fails to remove the event listener, leaking memory when using shared AbortControllers.
  - **Remediation:** Store `abortHandler` and call `callerSignal.removeEventListener('abort', abortHandler)` in `cleanup()`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-009] Unhandled Non-JSON/HTML HTTP Responses in `FetchApiClient`** — [fetch_api_client.ts:45,61](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L45)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `error-handling-principles.md`
  - **Description:** `response.json()` is called unconditionally on non-204 responses. When a proxy returns HTML (502/504), it throws an unhandled `SyntaxError: Unexpected token '<'`, masking the HTTP status code.
  - **Remediation:** Inspect `content-type` header before calling `response.json()` and return text/null for non-JSON responses.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-010] Server Shutdown Coordinator Fails to Close Active HTTP and Socket Connections** — [shutdown_coordinator.ts:104-113](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L104-L113)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `resources-and-memory-management-principles.md`
  - **Description:** Node's `http.Server.close()` and Socket.io's `io.close()` do not close keep-alive connections or force-disconnect client sockets (`io.disconnectSockets(true)` missing), hanging shutdown until the 5000ms hard exit timer fires.
  - **Remediation:** Call `io.disconnectSockets(true)` and `server.closeIdleConnections()` / `server.closeAllConnections()` before closing.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-011] DOM Node and Object URL Leak on Exception in `ProgressFileService`** — [progress_file.service.ts:33-46](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/services/progress_file.service.ts#L33-L46)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `resources-and-memory-management-principles.md`
  - **Description:** Cleanup of `URL.createObjectURL` and anchor tag removal is scheduled in a `setTimeout` after `link.click()`. If `click()` throws, cleanup is never reached.
  - **Remediation:** Move DOM node removal and `URL.revokeObjectURL` into a `finally` block.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-012] DOM Node Leak in Fallback Clipboard Copy in `QrCodeModal`** — [QrCodeModal.vue:244-266](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/QrCodeModal.vue#L244-L266)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `resources-and-memory-management-principles.md`
  - **Description:** Fallback `<textarea>` appended to `document.body` is removed at the end of the `try` block. If `execCommand` throws, the textarea remains attached to `document.body`.
  - **Remediation:** Wrap removal in a `finally` block.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-013] Dangling WebRTC PeerConnection and Timeout Timer on Error in `useLanDiscovery`** — [useLanDiscovery.ts:22-39](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useLanDiscovery.ts#L22-L39)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `resources-and-memory-management-principles.md`
  - **Description:** When `createOffer` or `setLocalDescription` rejects, the `.catch` handler resolves `null` without clearing the 800ms timer and without closing `pc.close()`.
  - **Remediation:** Set `resolved = true`, call `clearTimeout(timer)`, and close `pc.close()` in the rejection handler.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-014] Swallowed Errors in Static File Serving Mask File Descriptor and Permission Failures** — [static_handler.ts:125-156,180-203](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L125-L156)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `error-handling-principles.md`
  - **Description:** Filesystem `stat` and `readFile` failures are caught and unconditionally treated as missing files (404 / SPA index rewrite), masking OS file descriptor exhaustion (`EMFILE`) and permission errors (`EACCES`).
  - **Remediation:** Inspect `err.code` and return 500 Internal Server Error with error logs when error is not `ENOENT`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-015] Circular Dependency Between `puzzle_validator.ts` and `puzzle_analysis_engine.ts`** — [puzzle_validator.ts:9-13](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_validator.ts#L9-L13) & [puzzle_analysis_engine.ts:15](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts#L15)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `code-organization-principles.md` (§Avoid Circular Dependencies)
  - **Description:** `puzzle_validator.ts` imports analysis functions from `puzzle_analysis_engine.ts`, while `puzzle_analysis_engine.ts` imports UCI move parsers from `puzzle_validator.ts`.
  - **Remediation:** Extract pure UCI manipulation helpers into a separate leaf module (`uci_utils.ts`) or promote to `@fun-chess/shared`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-016] Direct File System I/O in HTTP Static Handler Lacking Storage Abstraction** — [static_handler.ts:2,73,116](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L2)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (§Rule 1: I/O Isolation)
  - **Description:** Static file handler directly calls `node:fs/promises`, forcing unit tests to create real disk directories and write files.
  - **Remediation:** Define an `IFileStorage` interface with production Node adapter and test in-memory double.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-017] Absence of Clock and Randomness Abstraction in Core Domain Services** — [room.service.ts:57-62](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L57-L62), [game.service.ts:71-84](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L71-L84)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (§Rule 1: I/O Isolation)
  - **Description:** Core services call `Date.now()`, `randomUUID()`, and `randomInt()` directly without injected `Clock` or `IdGenerator` interfaces, preventing deterministic testing of TTL expiration and room codes.
  - **Remediation:** Define and inject `Clock` and `IdGenerator` interfaces with defaults.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-018] Impure Chess Move Validation and Progress Merging Calling System Time Directly** — [chess_engine.ts:94](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L94), [progress_merger.ts:312](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_merger.ts#L312)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (§Rule 2: Pure Business Logic)
  - **Description:** Supposedly pure calculations call `Date.now()` internally, making outputs non-deterministic and preventing referential transparency.
  - **Remediation:** Pass explicit timestamp parameters into pure calculation functions.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-019] Missing Client Composition Root and Widespread Hardcoded Singletons** — [main.ts:1-16](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L1-L16), [useSocket.ts:18-20](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L18-L20)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (§Rule 3: Dependency Direction)
  - **Description:** The client lacks a composition root or dependency wiring layer at `main.ts`. Singletons are instantiated at module level, forcing tests to use deep monkey-patching.
  - **Remediation:** Wire infrastructure adapters in `main.ts` using Vue `app.provide` and consume via `inject()`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-020] Systemic Cross-Module Boundary Violations Bypassing Public Barrels (99 instances)** — [ScenarioArena.vue:4](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/ScenarioArena.vue#L4), [local_storage_unified.store.ts:10](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/store/local_storage_unified.store.ts#L10)
  - **Dimension:** C (Testability & Architecture) & E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md` (§Module Boundaries)
  - **Description:** Features reach deep into private internal files of other features instead of importing from public `index.ts` barrels.
  - **Remediation:** Enforce that all cross-feature imports target module public barrels exclusively; configure lint boundaries.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-021] Unsound Type Assertion and Redundant Service Duplicate (`LanService` vs `RelayAddressService`)** — [http_server.ts:55-58](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L55-L58), [lan.service.ts](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/lan.service.ts), [relay_address.service.ts](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/relay_address.service.ts)
  - **Dimension:** C (Testability & Architecture) & E (Code Quality & Patterns)
  - **Rule Source:** `core-design-principles.md` (DRY threshold), `rugged-software-constitution.md`
  - **Description:** `LanService` (182 lines) and `RelayAddressService` (474 lines) duplicate network interface querying and QR generation. `http_server.ts` performs an unsafe cast `(lanService as unknown as IRelayAddressService)` even though their signatures differ.
  - **Remediation:** Deprecate `LanService` and standardize all components on `RelayAddressService` implementing `IRelayAddressService`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-022] Unlogged Socket Connection Handshake Failures & Missing Engine Error Listener** — [socket_server.ts:50-56](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_server.ts#L50-L56), [index.ts:83](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L83)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md`
  - **Description:** When an incoming socket fails CORS handshake, an error is returned to the handshake callback, but `io.engine.on("connection_error")` is never registered, leaving handshake drops completely unlogged.
  - **Remediation:** Register `io.engine.on("connection_error")` in `index.ts` to log transport and CORS drops.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-023] Socket Disconnect Grace Period Abandonment Job Lacks 3-Point Logging and Correlation Context** — [room.socket_handler.ts:288-319](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L288-L319)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md`
  - **Description:** Disconnect abandonment timeout mutates room state and broadcasts game over without start logging, correlationId, duration, or error stack traces.
  - **Remediation:** Wrap the abandonment timeout execution in `runLoggedJob`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-024] Static File Serving Logged at DEBUG Level, Masking Production Web Traffic** — [http_server.ts:260-268](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L260-L268)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-implementation`
  - **Description:** Static file delivery and SPA index.html requests are logged with `logger.debug`, completely hiding web visitor traffic in production environments where `LOG_LEVEL=info`.
  - **Remediation:** Log static asset serving completions with `logger.info` including status code and duration.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-025] Missing Correlation IDs in Socket Connection Lifecycle Events** — [index.ts:83-109](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L83-L109)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md`
  - **Description:** Socket connection, disconnection, and error events log with `socketId` but omit `correlationId`, breaking end-to-end tracing.
  - **Remediation:** Assign a connection correlation ID upon handshake and include in all socket lifecycle logs.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-026] Complete Absence of Structured Telemetry & Logger Abstraction in Client Application** — [main.ts:8-14](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L8-L14)
  - **Dimension:** D (Observability & Logging) & E (Code Quality & Patterns)
  - **Rule Source:** `logging-and-observability-mandate.md`, `logging-implementation`
  - **Description:** Over 40 raw `console.*` calls are scattered across client code with ad-hoc prefixes and no log level filtering, structured metadata, or error tracking integration.
  - **Remediation:** Implement a structured client logger with log levels and pluggable sinks.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-027] Client API and Socket Operations Do Not Generate or Propagate Correlation IDs** — [fetch_api_client.ts:37-66](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L37-L66)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-implementation`
  - **Description:** Client requests do not pass `X-Correlation-ID` headers or socket correlation fields, forcing backend servers to invent disconnected IDs.
  - **Remediation:** Generate `correlationId` in `FetchApiClient` and attach `X-Correlation-ID` header.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-028] Ingress Schema Drift and Illegal Error Code Mutation in `game.socket_handler.ts`** — [game.socket_handler.ts:20-76](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.socket_handler.ts#L20-L76)
  - **Dimension:** F (Integration Contracts & Database)
  - **Rule Source:** `api-design-principles.md`, `data-serialization-and-interchange-principles.md`
  - **Description:** Duplicate local schemas relax `roomCode` validation, and `adaptCallback` rewrites schema validation errors into 404 `ERR_ROOM_NOT_FOUND`, causing dual-channel discrepancies.
  - **Remediation:** Import authoritative schemas from `@fun-chess/shared` and remove `adaptCallback` error mutation.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-029] `ClientToServerEvents` Missing Acknowledgement Callback Signatures for Game Control Actions** — [events.ts:140-150](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/events.ts#L140-L150)
  - **Dimension:** F (Integration Contracts & Database)
  - **Rule Source:** `architectural-pattern.md` (Contracts)
  - **Description:** Game control events (`game:resign`, `game:offer_draw`, `game:respond_draw`, `game:request_rematch`, `game:respond_rematch`) omit ack callback signatures in type definitions, preventing typed clients from using callbacks.
  - **Remediation:** Update `ClientToServerEvents` to include optional ack callback parameters for all game control events.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-030] Missing Pre-Flight Schema Validation in `LocalStorageUnifiedStore.overwriteAll`** — [local_storage_unified.store.ts:60-64](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/store/local_storage_unified.store.ts#L60-L64)
  - **Dimension:** F (Integration Contracts & Database)
  - **Rule Source:** `docs/db_contracts.md` (Phase 0 Pre-Flight Validation)
  - **Description:** `overwriteAll` uses a shallow boolean check instead of validating against `UnifiedProgressV1Schema`, risking committing corrupt payloads to disk.
  - **Remediation:** Call `defaultSchemaValidator.assertValid(data)` prior to taking snapshots and initiating 2PC writes.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-031] Missing Monorepo Test Coverage Configuration Silently Skips Server and Client** — [package.json:16](file:///home/irahardianto/works/projects/fun-chess/package.json#L16)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md`
  - **Description:** `pnpm run test:coverage` only runs on `shared` because neither `server` nor `client` define `test:coverage`, masking unexercised code in 90% of the project.
  - **Remediation:** Add `"test:coverage": "vitest run --coverage"` to server and client package manifests with thresholds.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-032] Missing E2E Playwright Tests for Core Journeys (Academy & Puzzles Hub)** — [apps/e2e/tests/](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/tests/)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` (§Test Pyramid)
  - **Description:** No Playwright tests exist for the 43-scenario Chess Academy or the 336-puzzle Tactical Puzzles Hub.
  - **Remediation:** Implement `academy.spec.ts` and `puzzles.spec.ts` in `apps/e2e/tests/`.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MAJ-033] Server Entry Point Untested and Tightly Coupled (0% Test Coverage)** — [apps/server/src/index.ts:1-182](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L1-L182)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `architectural-pattern.md`, `testing-strategy.md`
  - **Description:** 181 lines of server bootstrap logic execute immediately on import and have 0% test coverage.
  - **Remediation:** Extract bootstrap logic into an exportable `startServer()` function and add an integration test.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-034] Unexercised Critical Error Catch Blocks in Server and Storage Infrastructure** — [http_server.ts:280-306](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L280-L306), [shutdown_coordinator.ts:127-138](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L127-L138)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `error-handling-principles.md`
  - **Description:** 500 error handlers, shutdown failures, and 2PC rollback failure paths have 0 test coverage.
  - **Remediation:** Add unit tests asserting 500 response formatting and rollback failure handling.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-035] Critical Socket Event Listeners and Timeout Failure Paths Untested in Client `useSocket`** — [useSocket.ts:186-234,420-427](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L186-L234)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md`
  - **Description:** Disconnect pause states, player reconnected events, and 8s timeout error branches have 0 test coverage.
  - **Remediation:** Add unit tests exercising socket broadcast events and timer expirations in `useSocket.spec.ts`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-036] Completely Untested Storage Quota Composable `useStorageQuotaAlert` (12% Coverage)** — [useStorageQuotaAlert.ts:1-35](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useStorageQuotaAlert.ts#L1-L35)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md`
  - **Description:** Quota alert composable has no test file and 12% coverage.
  - **Remediation:** Create `useStorageQuotaAlert.spec.ts` verifying event subscription, state mutation, and cleanup.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-037] Extreme Cyclomatic Complexity: `extractPuzzleThemes` in Puzzle Catalog (Complexity 70)** — [puzzle_catalog.ts:132-273](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/data/puzzle_catalog.ts#L132-L273)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `core-design-principles.md`
  - **Description:** 142-line function with cyclomatic complexity 70 evaluating nested 6-clause logical OR expressions.
  - **Remediation:** Replace conditional cascade with a declarative table of mapping rules.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-038] Monolithic HTTP Handler and Socket Middleware Handler Exceeding Complexity Limits** — [http_server.ts:86-307](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L86-L307) & [socket_logging_middleware.ts:111-272](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L111-L272)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `core-design-principles.md`
  - **Description:** Handlers mix routing, CORS, headers, auth extraction, validation, timing, logging, and error mapping into 160-220 line callbacks with cyclomatic complexity > 35.
  - **Remediation:** Decompose into pipeline middleware functions.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-039] Code Duplication in `GameOverPayload` and Material Evaluation Across Layers** — [game.service.ts:81](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L81), [chess_engine.ts:177](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L177)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `core-design-principles.md` (DRY threshold)
  - **Description:** `GameOverPayload` construction copy-pasted across 6 server locations, and 80-line piece evaluation duplicated between server and shared.
  - **Remediation:** Extract shared `createGameOverPayload` helper and delegate material calculations to `@fun-chess/shared`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-040] Duplicated and Contradictory Storage Availability Probing Across Stores** — [browser_storage_adapter.ts:45](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/browser_storage_adapter.ts#L45)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `core-design-principles.md`
  - **Description:** 3 contradictory implementations of `isStorageAvailable` handling quota errors oppositely.
  - **Remediation:** Consolidate into `browser_storage_adapter.ts` and use canonically.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-041] Monolithic Client Composable Functions Violating Single Responsibility Principle** — [useAiGame.ts:52](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiGame.ts#L52), [usePuzzleRunner.ts:41](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleRunner.ts#L41)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md`
  - **Description:** Composable functions intertwine sound, state machine, timers, DOM modals, and calculation algorithms into 400-600 line bodies.
  - **Remediation:** Extract focused sub-composables (`useAiWorker`, `useTakebackHistory`, `useGameOutcomeDetector`).
  - **Fix workflow:** `/refactor`

---

## Minor Issues
Code maintainability issues, function length/complexity violations, or minor test gaps. Fix in near term.

- [ ] **[MIN-001] Denylist-Based Sanitization in `PlayerNameSchema` Violates Allowlist Principle** — [schemas.ts:17-23](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L17-L23)
  - **Dimension:** A | **Remediation:** Use regex allowlist `/^[a-zA-Z0-9 _.-]{1,20}$/`.
- [ ] **[MIN-002] Contract Drift Between `shared` and `server` `ServerEnvSchema`** — [schemas.ts:199](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L199) vs [env.ts:6](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L6)
  - **Dimension:** A | **Remediation:** Consolidate into canonical schema in `@fun-chess/shared`.
- [ ] **[MIN-003] Untracked and Uncancelled setTimeout Delays in Composable Unmount Lifecycles** — [usePuzzleRush.ts:164](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleRush.ts#L164)
  - **Dimension:** B | **Remediation:** Track timers and clear in `onUnmounted`.
- [ ] **[MIN-004] Persistent Event Listener Leak on MediaQuery in `useTheme`** — [useTheme.ts:78-83](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/composables/useTheme.ts#L78-L83)
  - **Dimension:** B | **Remediation:** Clean up listener in `onScopeDispose`.
- [ ] **[MIN-005] Missing AudioContext Cleanup / Disposal in `AudioSynthesizer`** — [audio_synthesizer.ts:110-116](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/audio/audio_synthesizer.ts#L110-L116)
  - **Dimension:** B | **Remediation:** Add `dispose()` method closing context and removing listeners.
- [ ] **[MIN-006] Abandoned Room Cleanup Omits Cancelling Disconnect Timers** — [room.service.ts:461-480](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L461-L480)
  - **Dimension:** B | **Remediation:** Cancel disconnect timers when purging abandoned rooms.
- [ ] **[MIN-007] Module-Scoped Mutable State in Socket Ingress and Networking Composable** — [room.socket_handler.ts:34](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L34), [useSocket.ts:94-106](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L94-L106)
  - **Dimension:** C | **Remediation:** Encapsulate in state manager classes / provide-inject.
- [ ] **[MIN-008] Bloated God-Component with Excessive Prop Drilling in Client Orchestration** — [App.vue:1-86](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L1-L86), [AppViewRouter.vue:21-116](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/AppViewRouter.vue#L21-L116)
  - **Dimension:** C | **Remediation:** Implement feature stores to allow direct state access.
- [ ] **[MIN-009] Misplaced Feature Domain in Generic Components Directory** — [MultiplayerArena.vue:1-60](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/arena/MultiplayerArena.vue#L1-L60)
  - **Dimension:** C | **Remediation:** Move to `apps/client/src/features/multiplayer/`.
- [ ] **[MIN-010] Unabstracted Browser UI Primitives (`window.confirm`, `navigator.vibrate`)** — [App.vue:75](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L75)
  - **Dimension:** C | **Remediation:** Replace with `BaseModal` and wrap vibrate in `HapticService`.
- [ ] **[MIN-011] Widespread String Formatting and Template Literals in Server Log Messages** — [socket_logging_middleware.ts:127](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L127)
  - **Dimension:** D | **Remediation:** Use static constant string messages and pass variables in context.
- [ ] **[MIN-012] Incomplete Sanitization Redaction Rules in `sanitizePayload` vs `PinoLogger`** — [socket_logging_middleware.ts:46-56](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L46-L56)
  - **Dimension:** D | **Remediation:** Align redaction lists (`token`, `auth`, `apiKey`, `secret`).
- [ ] **[MIN-013] Server Shutdown Sequence Lacks Duration Measurement** — [shutdown_coordinator.ts:59-139](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L59-L139)
  - **Dimension:** D | **Remediation:** Log elapsed shutdown duration in milliseconds.
- [ ] **[MIN-014] Shared Chess Utility `createSafeChess` Defaults to `console`** — [chess_factory.ts:51](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/chess_factory.ts#L51)
  - **Dimension:** D | **Remediation:** Default logger to a silent no-op object.
- [ ] **[MIN-015] Conflicting `PIECE_VALUES` Constants Across Modules** — [piece_square_tables.ts:7](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/engine/piece_square_tables.ts#L7)
  - **Dimension:** E | **Remediation:** Disambiguate identifiers (`STANDARD_PIECE_VALUES`, `CENTIPAWN_PIECE_VALUES`).
- [ ] **[MIN-016] Dual and Quadruple Event Dispatching Anti-Pattern in `PuzzleCompletionModal.vue`** — [PuzzleCompletionModal.vue:48](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/components/PuzzleCompletionModal.vue#L48-L68)
  - **Dimension:** E | **Remediation:** Standardize on canonical event naming convention and remove duplicate emits.
- [ ] **[MIN-017] Monolithic Serialization & Diff Functions in Shared Utils** — [dictionary_mapper.ts:49](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/dictionary_mapper.ts#L49)
  - **Dimension:** E | **Remediation:** Break down into entity-specific mappers and sub-diff functions.
- [ ] **[MIN-018] King Square Lookup Logic Duplicated Across Three Locations** — [useChessGame.ts:45](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useChessGame.ts#L45-L58)
  - **Dimension:** E | **Remediation:** Extract `findKingSquare` into `@fun-chess/shared`.
- [ ] **[MIN-019] Cryptic Parameter and Variable Naming Across Handlers** — [socket_rate_limiter.ts:25](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L25)
  - **Dimension:** E | **Remediation:** Rename single-letter identifiers (`s`, `t`, `r`) to descriptive names.
- [ ] **[MIN-020] Dead Code: Unreferenced `local_storage_puzzle_progress.store.ts` Shim** — [local_storage_puzzle_progress.store.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/local_storage_puzzle_progress.store.ts#L1)
  - **Dimension:** E | **Remediation:** Delete legacy shim file.
- [ ] **[MIN-021] `FetchApiClient.checkConnectivity` Bypasses `baseUrl` and Probes `/favicon.svg`** — [fetch_api_client.ts:80-97](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L80-L97)
  - **Dimension:** F | **Remediation:** Construct full URL using `baseUrl` and probe `/healthz`.
- [ ] **[MIN-022] Server HTTP Error Responses Omit Standard Envelope Top-Level Fields** — [http_server.ts:273-305](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L273-L305)
  - **Dimension:** F | **Remediation:** Include top-level `status: "error"` and `code: status`.
- [ ] **[MIN-023] Contradictory Error Code in `OptimisticLockConflictError`** — [room.errors.ts:20-29](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.errors.ts#L20-L29)
  - **Dimension:** F | **Remediation:** Map status 409 to `"ERR_CONFLICT"` with client-safe message.
- [ ] **[MIN-024] Unpinned Caret Dependency `"vite": "^6.4.3"` in Client Manifest** — [apps/client/package.json:30](file:///home/irahardianto/works/projects/fun-chess/apps/client/package.json#L30)
  - **Dimension:** G | **Remediation:** Pin exact version `"vite": "6.4.3"`.
- [ ] **[MIN-025] Floating Overrides Range in Root Package Manifest** — [package.json:38-41](file:///home/irahardianto/works/projects/fun-chess/package.json#L38-L41)
  - **Dimension:** G | **Remediation:** Pin exact override versions.
- [ ] **[MIN-026] Unused Dependencies in Root (`chess.js`, `socket.io`) and Server (`pino-pretty`)**
  - **Dimension:** G | **Remediation:** Remove unused dependencies.
- [ ] **[MIN-027] Compile-Time Dependency `@types/pako` in Production Dependencies** — [shared/package.json:27](file:///home/irahardianto/works/projects/fun-chess/shared/package.json#L27)
  - **Dimension:** G | **Remediation:** Move to `devDependencies`.
- [ ] **[MIN-028] Untested Socket.io CORS Callback & Production Config Fallback** — [socket_server.ts:31-38](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_server.ts#L31-L38)
  - **Dimension:** G | **Remediation:** Add unit tests for origin filtering logic.
- [ ] **[MIN-029] Untested Domain Edge Cases: Room Code Collision and Rematch Rejection** — [room.service.ts:506](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L506)
  - **Dimension:** G | **Remediation:** Add unit tests for collision fallbacks.

---

## Enhancement Issues
Non-critical suggestions, defense-in-depth, documentation, or minor clarity refactorings.

- [ ] **[ENH-001] Unconditional Strict-Transport-Security (HSTS) Over Plain HTTP** — [http_server.ts:32](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L32)
- [ ] **[ENH-002] Predictable Timestamp Fallback in Room Code Generation** — [room.service.ts:509-511](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L509-L511)
- [ ] **[ENH-003] Absence of Max Size Decompression Guard in Progress Codec** — [progress_codec.ts:225](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_codec.ts#L225)
- [ ] **[ENH-004] Node HTTP Server Request Timeout and Keep-Alive Tuning for Slowloris Mitigation** — [index.ts:72](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L72)
- [ ] **[ENH-005] Missing User-Facing Notification on Persistent Storage Quota Failure in `LocalStorageProgressStore`** — [local_storage_progress.store.ts:139](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/store/local_storage_progress.store.ts#L139)
- [ ] **[ENH-006] Inconsistent Room Code Validation Schema Across Transport Ingress (`GameRoomCodeSchema`)** — [game.socket_handler.ts:21](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.socket_handler.ts#L21)
- [ ] **[ENH-007] Redundant Component Proxy Indirection (`AppViewRouter.vue` re-exporting `layout/AppViewRouter.vue`)** — [AppViewRouter.vue:1-5](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/AppViewRouter.vue#L1-L5)
- [ ] **[ENH-008] Server Startup ASCII Banner Uses `console.log` Without TTY Check** — [index.ts:162](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L162)
- [ ] **[ENH-009] Inconsistent File Naming Conventions Across Store Implementations** — [in_memory_unified.store.mock.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/store/in_memory_unified.store.mock.ts#L1)
- [ ] **[ENH-010] Hardcoded Avatar Storage Key String Duplicated Across Components** — [AiOpponentSelect.vue:26](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/components/AiOpponentSelect.vue#L26)
- [ ] **[ENH-011] Unchecked Non-Null Assertions Without Explanatory Comments** — [chess_engine.ts:308](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L308)
- [ ] **[ENH-012] Absence of Versioned REST Endpoints (`/api/v1`)** — [http_server.ts:203](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L203)
- [ ] **[ENH-013] Storage Contract Drift: `RoomState.version` Typed as Optional vs Mandatory in Store Contract** — [models.ts:190](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/models.ts#L190)
- [ ] **[ENH-014] Missing Contract Assertions for Draw and Rematch Socket Events in Contract Test Suite** — [socket_lifecycle.contract.spec.ts](file:///home/irahardianto/works/projects/fun-chess/tests/contracts/socket_lifecycle.contract.spec.ts)
- [ ] **[ENH-015] Server Vitest Configuration Lacks Coverage Threshold Enforcement** — [apps/server/vitest.config.ts](file:///home/irahardianto/works/projects/fun-chess/apps/server/vitest.config.ts)

---

## Verification Suite Results
- **Linter & Static Analysis:** PASS
  - TypeScript: Shared (`tsc PASS`), Server (`tsc PASS`), Client (`vue-tsc -b PASS`), E2E (`tsc PASS`)
  - Spelling & Integrity: `typos` (0 typos detected across 400+ files)
  - Secret Scanning: `gitleaks` (247.08 MB scanned, 0 leaks detected in codebase or git history)
- **Automated Tests:** PASS (170 test files, 2,008 tests passed, 0 failed, 0 skipped)
  - `@fun-chess/shared`: 19 test files, 295 passed (1.4s)
  - `@fun-chess/client`: 122 test files, 1381 passed (6.3s)
  - `@fun-chess/server`: 19 test files, 295 passed (1.4s)
  - `@fun-chess/e2e`: 3 test suites, 3 passed (10.7s)
  - Root integration & contract tests: 7 test files, 34 passed (0.48s)
- **Build Verification:** PASS
  - `@fun-chess/shared`: `tsc` clean
  - `@fun-chess/server`: `tsc` clean
  - `@fun-chess/client`: `vue-tsc -b && vite build` clean (PWA v1.3.0 manifest, service worker generated, production bundle built in 6.0s)
- **Test Coverage:**
  - `@fun-chess/shared`: 94.85% Lines / 90.76% Functions
  - `@fun-chess/server`: 84.90% Lines / 85.62% Functions
  - `@fun-chess/client`: ~39.95% (Coverage run times out at 5000ms on deep interaction check due to 22,000 LOC of unexcluded offline generator scripts in `src/`; excluding scripts yields 91.26% statement coverage)

---

## Cross-Dimension Correlations
Findings where multiple audit dimensions converged on identical modules or functions, resulting in escalated severity:

1. **Direct `window.localStorage` Access Bypassing `KeyValueStorage` Abstraction:**
   - Converged from: **Dimension C** ([MAJOR-002]), **Dimension E** ([MAJOR-012]), and **Dimension F** ([MAJOR-003]).
   - Escalation: Escalated from MAJOR to **CRITICAL** ([CRIT-005]). In restricted storage contexts (Safari private browsing, iframe embedding), calling raw `localStorage.setItem` throws `SecurityError` / `QuotaExceededError`, crashing game loading and state updates.

2. **Swallowed Configuration Exceptions in Socket Server Origin Resolution:**
   - Converged from: **Dimension A** ([MAJOR-003]), **Dimension B** ([MIN-001]), and **Dimension E** ([MAJOR-006]).
   - Escalation: Escalated from MAJOR to **CRITICAL** ([CRIT-006]). Swallowing `loadServerConfig` / `resolveAllowedOrigins` exceptions in `socket_server.ts:35` returns `[]`, causing Socket.IO to reject all incoming WebSocket connections without failing fast.

3. **Offline Generator Scripts Co-located in Client Source Tree:**
   - Converged from: **Dimension G** ([CRITICAL-001]) and **Dimension E** ([MINOR-025]).
   - Escalation: Confirmed as **CRITICAL** ([CRIT-004]). Bloats bundle analysis, pollutes client sources with Python bytecode, drags client coverage to 39.95%, and causes test execution timeouts under coverage mode.

4. **Rate Limiting Flaws & Zero Observability on Drop:**
   - Converged from: **Dimension A** ([CRITICAL-001], [MAJOR-004]) and **Dimension D** ([MAJOR-001]).
   - Escalation: Confirmed as **CRITICAL** ([CRIT-001]). Trusting untrusted `X-Forwarded-For` enables trivial rate limit evasion, and drops are completely unlogged, blinding operators to brute force and DoS attacks.

5. **Server Entry Point (`apps/server/src/index.ts`) Untested & Immediate Execution:**
   - Converged from: **Dimension B** ([CRIT-002]), **Dimension C** ([MINOR-001]), **Dimension D** ([MAJOR-007], [MINOR-003]), and **Dimension G** ([MAJOR-003]).
   - Escalation: Highlighted across 4 dimensions as a primary structural risk ([CRIT-003] and [MAJ-033]).

6. **Service Redundancy & Unsound Type Cast (`LanService` vs `RelayAddressService`):**
   - Converged from: **Dimension C** ([MAJOR-008]), **Dimension E** ([MAJOR-003]), and **Dimension A** ([MAJOR-005]).
   - Escalation: Escalated to high-priority structural remediation ([MAJ-021]).

---

## Rules Applied
List of project rules referenced and verified during this audit:
- `security-mandate.md` / `security-principles.md` (Authentication, input validation, rate limiting, IP handling)
- `rugged-software-constitution.md` (Zero-tolerance for silent failures, defensibility, fail fast)
- `error-handling-principles.md` (No empty catch blocks, context preservation, fail fast)
- `architectural-pattern.md` (Rule 1: I/O Isolation, Rule 2: Pure Business Logic, Rule 3: Dependency Direction)
- `logging-and-observability-mandate.md` (Mandatory 3-point operation logging, correlationId, structured logging)
- `code-organization-principles.md` (Module boundaries, public barrels, SRP, cyclomatic complexity < 10)
- `core-design-principles.md` (DRY threshold, Composition over inheritance, Least Astonishment)
- `api-design-principles.md` / `database-design-principles.md` (HTTP error envelopes, URI versioning, store contracts)
- `dependency-management-principles.md` (Exact version pinning, minimal dependencies, lockfiles)
- `testing-strategy.md` (Test pyramid, >85% coverage mandate, unexercised error paths, E2E user journeys)

---

## Remediation Action Plan
Findings ranked by priority for resolution:

1. **[CRIT-001]** — Remove unconditional trust in `X-Forwarded-For` in `SocketRateLimiter`, add `TRUST_PROXY` config, and log rate-limited rejections → `/bugfix`
2. **[CRIT-002]** — Fix `InMemoryRoomStore.withLock` to prevent premature resolution of `currentLock` and premature queue deletion on timeout → `/bugfix`
3. **[CRIT-003]** — Wrap `handleSocketDisconnect` in `try/catch` in `index.ts` and handle unhandled rejections cleanly in `ShutdownCoordinator` → `/bugfix`
4. **[CRIT-004]** — Relocate offline generator scripts from `apps/client/src/features/puzzles/data/scripts/` to root `scripts/puzzles/` and update `vite.config.ts` coverage exclusions → `/refactor`
5. **[CRIT-005]** — Replace direct `window.localStorage` calls with `safeLocalStorage` / `KeyValueStorage` across feature stores and UI views → `/refactor`
6. **[CRIT-006]** — Remove silent `catch { return []; }` in `createSocketServer` origin resolution; fail fast on configuration errors → `/bugfix`
7. **[MAJ-001]** — Update CSP headers in `http_server.ts` to permit Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`) → `/bugfix`
8. **[MAJ-002]** — Add `CORS_ORIGIN` to `docker-compose.yml` to prevent production startup crash loop → `/bugfix`
9. **[MAJ-003]** — Add entry ceiling (`maxKeys`) and LRU eviction to `SocketRateLimiter.timestamps` → `/bugfix`
10. **[MAJ-007]** — Guard `useSocket` emit callbacks with `hasTimedOut` flag to prevent state mutation on late responses → `/bugfix`
11. **[MAJ-010]** — Enhance `ShutdownCoordinator` to disconnect sockets and close keep-alive connections cleanly before exit → `/bugfix`
12. **[MAJ-015]** — Break circular dependency between `puzzle_validator.ts` and `puzzle_analysis_engine.ts` by extracting `uci_utils.ts` → `/refactor`
13. **[MAJ-021]** — Deprecate redundant `LanService` and eliminate unsafe type cast in `http_server.ts` → `/refactor`
14. **[MAJ-028]** & **[MAJ-029]** — Standardize socket ingress schemas and add missing ack callback signatures in `ClientToServerEvents` → `/bugfix`
15. **[MAJ-030]** — Add pre-flight `defaultSchemaValidator.assertValid` in `LocalStorageUnifiedStore.overwriteAll` → `/bugfix`
16. **[MAJ-031]** — Configure `test:coverage` scripts in `apps/server/package.json` and `apps/client/package.json` → `/bugfix`
17. **[MAJ-032]** — Add Playwright E2E tests for Chess Academy and Tactical Puzzles Hub user journeys → `/workflow-solo`
