# Code Audit: Full Codebase (Fun Chess Monorepo)
Date: 2026-09-07
Auditor: AI Code Audit (multi-dimensional, 7 parallel subagents)

## Executive Summary
- **Dimensions activated:** A (Security & Configuration), B (Reliability & Error Handling), C (Testability & Architecture), D (Observability & Logging), E (Code Quality & Patterns), F (Integration Contracts & Database), G (Dependencies & Test Coverage Gaps)
- **Dimensions skipped:** None (all 7 dimensions activated across full monorepo)
- **Files scanned:** 118 production, contract, configuration, and test files across `apps/server`, `apps/client`, `shared`, `infra`, and root
- **Findings:** 60 unique findings (8 critical, 25 major, 16 minor, 11 enhancement)
- **Automated verification:** Lint: PASS (TypeScript `tsc` & `vue-tsc -b` type-checks clean; linter not configured) | Tests: PASS (114 test files passed, 1,257 tests passed, 0 failed across unit, contract, and integration suites) | Build: PASS (`tsc` for shared, `vue-tsc -b && vite build` for client, `tsc` for server clean) | Coverage: N/A (Tooling not configured)
- **Overall codebase health:** HIGH RISK (Clean compilation and 1,257 passing tests conceal critical security vulnerabilities, test harness evasion via a 1,146-line shadow server, permanent client-side data loss hazards, and unhandled server crash paths)

---

## Critical Issues
Vulnerabilities or severe defects that cause active security breaches, data loss, application crashes, or system compromise. Must be fixed immediately.

- [ ] **[CRIT-001] Secret Session Token Leaked in Public Room State Enables Player Session Hijacking** — [room.service.ts:72](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L72) & [room.socket_handler.ts:120-125](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L120-L125)
  - **Dimension:** A (Security & Configuration) & F (Integration Contracts)
  - **Rule Source:** [.agents/rules/security-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/security-principles.md) (§Broken Access Control, §Authentication & Authorization)
  - **Description:** The private `sessionToken` (the sole secret token used to authenticate player reconnection via `room:reconnect`) is stored directly on the exported `Player` model ([models.ts:96](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/models.ts#L96)) inside `RoomState.whitePlayer` and `RoomState.blackPlayer`. Whenever a room is updated, joined, or rematch requested, the entire `RoomState` object—including both players' plaintext `sessionToken`s—is broadcast over WebSocket to all room participants and emitted to joining sockets.
  - **Impact:** Any player or spectator in a match receives the opponent's private `sessionToken` and `playerId`. A malicious player or network observer can emit `room:reconnect` using the victim's `playerId` and leaked `sessionToken` to seize control of the opponent's player slot, make illegal or spoiling moves, forfeit the match, or lock out the legitimate player.
  - **Evidence:**
    ```typescript
    // apps/server/src/features/rooms/room.service.ts:64-74
    const hostPlayer: Player = {
      id: playerId,
      socketId,
      name: rawName,
      avatar: req.avatar || "🦁",
      color: hostColor,
      isHost: true,
      isConnected: true,
      sessionToken, // <-- Secret credential attached to public player object
      connectedAt: Date.now(),
    };
    ```
  - **Remediation:** Separate public player view models (`PublicPlayer`) from private server-side session credentials. Do NOT store `sessionToken` on the exported `Player` or `RoomState` models. Store session tokens in a private server-side lookup map (e.g. `Map<playerId, sessionToken>` or `Map<sessionToken, { playerId, roomCode }>`) inside `RoomStore` or `RoomService`. Sanitize all room broadcasts before emitting.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-002] Server Process Crash on Unhandled `error` Event & Missing Global Process Crash Guards** — [apps/server/src/index.ts:54-123](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L54-L123)
  - **Dimension:** B (Reliability & Error Handling) & G (Dependencies & Test Coverage)
  - **Rule Source:** [.agents/rules/error-handling-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/error-handling-principles.md), [.agents/rules/rugged-software-constitution.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/rugged-software-constitution.md)
  - **Description:** The HTTP server bootstrap calls `server.listen(...)` without attaching an `error` event listener to `server`. In Node.js, `net.Server` and `http.Server` are `EventEmitter` instances; when an error occurs (such as `EADDRINUSE` port collision or system socket exhaustion) and no listener is registered, Node.js throws an unhandled exception. Furthermore, `process.on("unhandledRejection")` and `process.on("uncaughtException")` handlers are completely absent from the entry point. Any unhandled promise rejection in asynchronous socket callbacks or HTTP routing abruptly crashes the server daemon without cleanup or structured logging.
  - **Impact:** Startup port conflicts or unhandled promise rejections immediately kill the production server daemon without flushing pending logs, closing open client sockets, or terminating background intervals, causing unmonitored service outages.
  - **Evidence:**
    ```typescript
    // apps/server/src/index.ts:54-61
    const server = createServer(httpRequestHandler);
    const io = createSocketServer(server, roomService, gameService, logger);

    server.listen(port, host, () => { ... });
    // Missing server.on("error", ...)
    // Missing process.on("unhandledRejection", ...)
    // Missing process.on("uncaughtException", ...)
    ```
  - **Remediation:** Attach explicit `error` listeners to `server` and register process-level crash guards that log structured error diagnostics before executing graceful shutdown.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-003] Permanent Data Loss on Storage Overwrite in `LocalStorageUnifiedStore`** — [local_storage_unified.store.ts:60-95](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/store/local_storage_unified.store.ts#L60-L95)
  - **Dimension:** B (Reliability & Error Handling), C (Architecture), F (Integration)
  - **Rule Source:** [.agents/rules/error-handling-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/error-handling-principles.md), [.agents/rules/rugged-software-constitution.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/rugged-software-constitution.md)
  - **Description:** The `overwriteAll` implementation in `LocalStorageUnifiedStore` violates transactional integrity and atomic failure recovery principles. It deletes the user's existing progress (`await this.scenarioStore.resetAllProgress()`) BEFORE validating or successfully persisting incoming progress. If an error occurs midway through writing scenarios (such as a browser `QuotaExceededError`, schema validation error, or unexpected exception), all previously saved scenario progress is permanently lost with zero recovery path. Furthermore, the puzzle import fallback path silently drops `themeMastery`, `arcadeStats`, and `solvedPuzzles` without throwing or logging, resulting in silent partial data corruption.
  - **Impact:** Users importing progress via QR code, file upload, or cross-device sync risk irreversible progress wipeout if the browser encounters a storage quota limit, power outage, or corrupted payload chunk during import.
  - **Evidence:**
    ```typescript
    // apps/client/src/features/portability/store/local_storage_unified.store.ts:64-70
    async overwriteAll(progress: UnifiedProgress): Promise<void> {
      // Reset existing progress first — destructive action without rollback snapshot!
      await this.scenarioStore.resetAllProgress();

      for (const [scenarioId, scenarioProgress] of Object.entries(progress.scenarios)) {
        await this.scenarioStore.saveProgress(scenarioId, scenarioProgress);
      }
    ```
  - **Remediation:** Implement a two-phase commit pattern: snapshot the existing progress before modifying storage, stage the new progress, and roll back to the snapshot in a `catch` block if any write fails.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-004] Integration & Contract Tests Validate a 1,146-Line Shadow Server Instead of Production Backend** — [tests/helpers/test_server.ts:1-1146](file:///home/irahardianto/works/projects/fun-chess/tests/helpers/test_server.ts#L1-L1146)
  - **Dimension:** G (Dependencies & Tests) & F (Integration Contracts) [Escalated via Cross-Dimension Correlation]
  - **Rule Source:** [.agents/rules/testing-strategy.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/testing-strategy.md) §Test Pyramid, [.agents/rules/architectural-pattern.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/architectural-pattern.md) §Testability Compliance
  - **Description:** All contract tests in `tests/contracts/` (`http_api.contract.spec.ts`, `socket_lifecycle.contract.spec.ts`) and all integration tests in `tests/integration/` (`room_lifecycle`, `dual_client_lifecycle`, `game_moves`, `game_completion`, `rematch_flow`) do not import or execute any production server code from `apps/server/src/`. Instead, `tests/helpers/test_server.ts` re-implements the entire backend from scratch in 1,146 lines: an inline `InMemoryRoomStore`, an inline `ChessEngine`, an inline native HTTP listener, and 700+ lines of duplicated Socket.io event listeners. None of the production modules (`createHttpServer`, `createSocketServer`, `registerRoomSocketHandlers`, `registerGameSocketHandlers`, `RoomService`, `GameService`, `SocketRateLimiter`, or `wrapSocketHandler`) are tested by the root integration test suite.
  - **Impact:** The contract and integration test suites provide a false sense of security. Regressions, logic bugs, middleware faults, or schema violations in the real `apps/server` codebase pass CI tests without error because tests exercise a mock server whose behavior has already drifted from production code.
  - **Evidence:**
    ```typescript
    // tests/contracts/socket_lifecycle.contract.spec.ts:10
    import { createTestServer, TestServerInstance } from "../helpers/test_server";
    // tests/helpers/test_server.ts:40
    export class InMemoryRoomStore { ... } // 1,146 lines of shadow backend implementation
    ```
  - **Remediation:** Refactor `tests/helpers/test_server.ts` to instantiate and wire the actual production server modules from `apps/server/src/` (`createHttpServer`, `createSocketServer`, `RoomService`, `GameService`, `InMemoryRoomStore`). Delete the 1,146-line duplicate implementation.
  - **Fix workflow:** `/refactor` — immediate priority

- [ ] **[CRIT-005] Production Socket Middleware Suppresses Errors, Never Emits Contracted `error` Event & Leaks Unhandled Exceptions** — [socket_logging_middleware.ts:104-130](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L104-L130)
  - **Dimension:** F (Integration Contracts), B (Reliability), D (Observability), A (Security) [Escalated via Cross-Dimension Correlation]
  - **Rule Source:** [.agents/rules/api-design-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/api-design-principles.md), [.agents/rules/error-handling-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/error-handling-principles.md), [.agents/rules/rugged-software-constitution.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/rugged-software-constitution.md)
  - **Description:** The shared contract `ServerToClientEvents` explicitly declares an `error: (error: SocketErrorPayload) => void` event, and the client composable (`useSocket.ts:311`) listens on `s.on('error', ...)`. However, production `wrapSocketHandler` only checks `if (typeof callback === "function") callback(...)`. It does not accept `socket` and never emits `socket.emit("error", ...)`. For unacknowledged events (`game:resign`, `game:offer_draw`, `game:respond_draw`, `game:request_rematch`, `room:leave`), server exceptions are completely dropped without notifying the client. When callbacks *are* provided, `err.message` from unhandled exceptions is returned to the client, leaking internal runtime details.
  - **Impact:** Client is left in an unrecoverable, desynchronized state when fire-and-forget socket operations fail on the server; internal server exception messages leak across the transport boundary.
  - **Evidence:**
    ```typescript
    // apps/server/src/platform/socket/socket_logging_middleware.ts:104-130
    if (typeof callback === "function") {
      ...
      callback({ success: false, error: errorPayload } as unknown as TRes);
    }
    return undefined; // If no callback, error is swallowed; socket.emit("error") is NEVER called!
    ```
  - **Remediation:** Pass `socket: Socket` to `wrapSocketHandler`. When an error is caught and no callback is present, emit `socket.emit("error", errorPayload)`. Sanitize messages for unknown 500 errors to `"An internal error occurred"`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-006] Race Conditions and Lost Updates in Ephemeral Room Mutations Due to Lack of Concurrency Control** — [in_memory_room.store.ts:8-20](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L8-L20) & [game.service.ts:50-65](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L50-L65)
  - **Dimension:** F (Integration Contracts) & B (Reliability) [Escalated via Cross-Dimension Correlation]
  - **Rule Source:** [.agents/rules/database-design-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/database-design-principles.md) (§Concurrency, §Transactions)
  - **Description:** `InMemoryRoomStore` performs deep clones on retrieval (`findByCode`) and persistence (`save`), but provides no locking, mutex, or optimistic concurrency control (no `version` check). All mutation operations in `RoomService` and `GameService` follow an asynchronous Read-Modify-Write pattern. When two asynchronous socket events arrive in interleaved ticks for the same room (e.g. Player A resigns while Player B makes a move, or two players join simultaneously), the second operation's `save(room)` overwrites the entire room snapshot, erasing the first operation (e.g. a move saved after resignation overwrites `room.status = "game_over"` back to `"playing"`).
  - **Impact:** Critical game state corruption: resignations, draw acceptances, and disconnect pauses can be silently overwritten and erased by interleaved moves.
  - **Evidence:**
    ```typescript
    // apps/server/src/features/game/game.service.ts
    const room = await this.store.findByCode(roomCode); // Cloned state snapshot
    // ... Async move validation ...
    room.game = outcome.nextState;
    await this.store.save(room); // Blind overwrite! Wipes out concurrent resignation or draw state
    ```
  - **Remediation:** Introduce a room-level async lock/queue per `roomCode` or add a versioned compare-and-swap mechanism to `RoomStore`.
  - **Fix workflow:** `/bugfix` or `/refactor` — immediate priority

- [ ] **[CRIT-007] Camera Hardware Resource Leak on Initialization Failure in `useQrScanner`** — [useQrScanner.ts:148-180](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useQrScanner.ts#L148-L180)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** [.agents/rules/resources-and-memory-management-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/resources-and-memory-management-principles.md), [.agents/rules/error-handling-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/error-handling-principles.md)
  - **Description:** In `useQrScanner.ts`, when `startScanner` acquires a media stream from `navigator.mediaDevices.getUserMedia` and `await videoElement.play()` rejects (e.g. `AbortError` on unmount or `NotAllowedError`), execution jumps to `catch (err: any)`. The catch block updates reactive flags but fails to call `track.stop()` on the acquired stream.
  - **Impact:** Client device camera hardware remains active in the background indefinitely, keeping the camera sensor powered and privacy indicator light active. Subsequent attempts fail with `NotReadableError` ("Camera already in use").
  - **Evidence:**
    ```typescript
    // apps/client/src/features/portability/composables/useQrScanner.ts:148-170
    mediaStream = stream;
    videoElement.srcObject = stream;
    await videoElement.play(); // Throws on unmount or autoplay restriction
    ...
    } catch (err: any) {
      // Hardware stream is NOT stopped here!
      hasCamera.value = false;
      isScanning.value = false;
    ```
  - **Remediation:** Ensure all audio/video tracks on `stream` and `mediaStream` are stopped and `videoElement.srcObject = null` is executed in `catch` and cleanup handlers.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-008] Static File Handler Path Traversal Vulnerability and Missing Asset 200 Masking** — [static_handler.ts:44-70](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L44-L70) & [http_server.ts:214-220](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L214-L220)
  - **Dimension:** A (Security), B (Reliability), D (Observability), G (Tests) [Escalated via Cross-Dimension Correlation]
  - **Rule Source:** [.agents/rules/security-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/security-principles.md) (§Path Traversal), [.agents/rules/error-handling-principles.md](file:///home/irahardianto/works/projects/fun-chess/.agents/rules/error-handling-principles.md)
  - **Description:** 1) `!targetFilePath.startsWith(rootDir)` check lacks a trailing path separator, allowing sibling directories with common prefix to be accessed. 2) Traversal attempts return 403 with `return true`, causing `http_server.ts` to log them as successful `http_static` deliveries without security warnings. 3) Missing static assets (`.js`, `.css`) trigger `stat` error and fall back to `index.html` with HTTP 200, breaking browser script loaders with `Uncaught SyntaxError: Unexpected token '<'`.
  - **Impact:** Directory traversal defense-in-depth failure; production deployment asset 404s masked as HTML causing client browser crashes.
  - **Evidence:**
    ```typescript
    // apps/server/src/platform/http/static_handler.ts:51-68
    if (!targetFilePath.startsWith(rootDir)) {
      res.writeHead(403, ...);
      return true; // Misclassified as served!
    }
    ...
    } catch {
      // Rewrites all missing .js, .css, .png requests to index.html!
      targetFilePath = path.join(rootDir, "index.html");
    }
    ```
  - **Remediation:** Use `path.relative` for path boundary checks; log `operation: "security_violation"` on traversal attempts; only fall back to `index.html` for requests without file extensions that accept `text/html`; return 404 for missing static assets.
  - **Fix workflow:** `/bugfix` — immediate priority

---

## Major Issues
Structural violations, missing I/O error handling, untested critical paths, or broken contracts. Must be fixed before release.

- [ ] **[MAJ-001] Ineffective Socket Rate Limiting Keyed by Socket ID with Disconnect Reset** — [socket_rate_limiter.ts:32-52](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L32-L52) & [room.socket_handler.ts:212](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L212)
  - **Dimension:** A (Security) & B (Reliability)
  - **Rule Source:** `security-principles.md` (§Rate Limiting), `rugged-software-constitution.md`
  - **Description:** The `SocketRateLimiter` tracks rate consumption using `socket.id` rather than client IP (`socket.handshake.address`). Upon disconnection, `handleSocketDisconnect` calls `rateLimiter.reset(socketId)`. An attacker can disconnect and reconnect immediately with a fresh socket ID, completely resetting their rate limit window. In addition, `room:reconnect`, `game:move`, `game:offer_draw`, and `game:resign` lack rate limiting.
  - **Impact:** Rate limits are bypassed at will, enabling room code brute-forcing, rapid room allocation spam, and socket handler flooding.
  - **Remediation:** Key rate limits on client IP address (`socket.handshake.headers['x-forwarded-for'] || socket.handshake.address`). Do not reset on disconnect; let sliding windows expire naturally.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-002] Missing Runtime Schema Validation at Socket Ingress Boundary** — [room.service.ts:39-74](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L39-L74) & [game.socket_handler.ts:32-35](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.socket_handler.ts#L32-L35)
  - **Dimension:** A (Security) & F (Integration)
  - **Rule Source:** `security-principles.md` (§Input Validation: "Validate against strict Schema at Handler boundary")
  - **Description:** Socket event handlers accept client payloads typed only with compile-time TypeScript generics without runtime schema validation. Null/undefined requests trigger unhandled `TypeError` exceptions; `req.avatar` is never validated or length-checked (arbitrary megabyte payloads can be injected into memory); `req.preferredColor` has no enum validation (arbitrary values result in unplayable rooms with `whitePlayer: null` and `blackPlayer: null`).
  - **Impact:** Malformed socket payloads can crash request handling routines, corrupt game state, or inject arbitrary payloads into server memory.
  - **Remediation:** Define runtime Zod schemas in `@fun-chess/shared` for every socket event payload and validate payloads at the handler boundary inside `wrapSocketHandler`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-003] Permissive Wildcard CORS (`*`) Default in Production Server and Cloud Run Deployment** — [http_server.ts:82](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L82), [socket_server.ts:21](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_server.ts#L21), & [cloud_run.tf:29-37](file:///home/irahardianto/works/projects/fun-chess/infra/terraform/cloud_run.tf#L29-L37)
  - **Dimension:** A (Security)
  - **Rule Source:** `security-mandate.md` (§Deny by default)
  - **Description:** `http_server.ts` and `socket_server.ts` default to `CORS_ORIGIN || "*"` without enforcing an origin allowlist in production. In `cloud_run.tf`, `CORS_ORIGIN` is not declared or injected. CORS is wildcarded in production on Google Cloud Run.
  - **Impact:** Any third-party malicious website opened in a user's browser can perform Cross-Site WebSocket Hijacking (CSWSH) to interact with the game server.
  - **Remediation:** Require `CORS_ORIGIN` to be set explicitly in production, derive it from `PUBLIC_URL` when present, and parameterize it in `cloud_run.tf`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-004] Mutual Circular Dependency Between Server Features (`rooms` <-> `game`)** — [room.service.ts:21](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L21) & [game.service.ts:12-21](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L12-L21)
  - **Dimension:** C (Architecture) & E (Code Quality)
  - **Rule Source:** `code-organization-principles.md` (Avoid Circular Dependencies), `architectural-pattern.md` (Rule 3)
  - **Description:** Feature `rooms` directly imports from `features/game` (`room.service.ts` imports `ChessEngine`), while feature `game` directly imports from `features/rooms` (`game.service.ts` imports `RoomStore` and error classes).
  - **Impact:** Tight circular coupling prevents modular testing, violates vertical slice boundaries, and blocks package extraction.
  - **Remediation:** Extract shared chess initialization and domain errors into `@fun-chess/shared`. Pass game state transitions through defined service contracts or events.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-005] Circular Module Dependency Between Client Composables and `features/portability`** — [useProgressSync.ts:1](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useProgressSync.ts#L1) & [useProgressSync.ts:24](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useProgressSync.ts#L24)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `code-organization-principles.md` (Avoid Circular Dependencies)
  - **Description:** `apps/client/src/composables/useProgressSync.ts` re-exports from `features/portability`, while `features/portability/composables/useProgressSync.ts` imports `useConfetti` from `composables/useConfetti` (which is re-exported by `composables/index.ts`).
  - **Impact:** Cyclic module resolution risks runtime undefined exports in ESM bundles and tangles technical folders with feature slices.
  - **Remediation:** Eliminate proxy re-export file `src/composables/useProgressSync.ts`; import directly from `features/portability`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-006] Direct Unabstracted Browser Storage Operations in Client Modules** — [useSocket.ts:37](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L37), [useLanDiscovery.ts:85](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useLanDiscovery.ts#L85), & [App.vue:211](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L211)
  - **Dimension:** C (Architecture) & B (Reliability)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation), `testability-patterns` skill
  - **Description:** Browser storage APIs (`localStorage`, `sessionStorage`) are accessed directly without abstraction. In restricted browser modes (Safari Private Browsing, iframe embeds), synchronous access throws `SecurityError` or `DOMException`, completely crashing the Vue mounting process in `App.vue:209-213`.
  - **Impact:** Blank white screen crash on launch in private browsing modes; cannot test without global DOM monkey-patching.
  - **Remediation:** Define a storage abstraction contract (`KeyValueStorage`) with `BrowserStorageAdapter` and `InMemoryStorageAdapter`, wrapped in safe accessors.
  - **Fix workflow:** `/bugfix` or `/refactor`

- [ ] **[MAJ-007] Direct Unabstracted HTTP Fetch Calls in Client Modules and Views** — [App.vue:263](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L263), [useLanDiscovery.ts:94](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useLanDiscovery.ts#L94), & [useNetworkStatus.ts:84](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/pwa/composables/useNetworkStatus.ts#L84)
  - **Dimension:** C (Architecture), B (Reliability), E (Code Quality), F (Integration)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation)
  - **Description:** Client components and composables directly invoke native `fetch()` without an API service adapter and omit `AbortSignal.timeout(...)`. On flaky networks, requests hang for 60–120 seconds.
  - **Impact:** UI hangs and network discovery stalls; global fetch mocking required across tests.
  - **Remediation:** Centralize HTTP calls into an API client service and attach `AbortSignal.timeout(3000)`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-008] Unabstracted Audio Web API and Module-Level Side Effects in `AudioSynthesizer`** — [audio_synthesizer.ts:560](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/audio/audio_synthesizer.ts#L560)
  - **Dimension:** C (Architecture) & B (Reliability)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation)
  - **Description:** `AudioSynthesizer` lacks an interface contract (`IAudioService`) and executes global side effects at module import time by automatically attaching listeners to `window` and `document`.
  - **Impact:** Simply importing the module triggers DOM side effects in unit test environments.
  - **Remediation:** Define `IAudioService`, create `NullAudioService` test double, and move event registration into an explicit bootstrap method.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-009] Audio, Haptics, and Confetti Side Effects Buried Inside Pure Game and Sync Business Logic** — [useAiGame.ts:48](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiGame.ts#L48) & [useScenarioRunner.ts:31](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/composables/useScenarioRunner.ts#L31)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 2: Pure Business Logic)
  - **Description:** Business logic composables directly invoke sound effects, device vibration, and confetti animations from within move calculation and state transition routines.
  - **Impact:** Pure business logic cannot be exercised in isolation without mocking multimedia side effects.
  - **Remediation:** Return outcome events from business logic; let UI presenter layers trigger multimedia effects in response to state transitions.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-010] Global Singletons and Default Constructor Instantiations Bypassing Composition Root** — [lan.service.ts:141](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/lan.service.ts#L141) & [local_storage_unified.store.ts:25](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/store/local_storage_unified.store.ts#L25)
  - **Dimension:** C (Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 3: Dependency Direction)
  - **Description:** Over 10 modules instantiate mutable global singletons or declare concrete default instantiations in constructors instead of wiring dependencies at `main.ts` / `index.ts`.
  - **Impact:** Global singletons cause state leakage between isolated tests and hide true dependency graphs.
  - **Remediation:** Remove global singletons. Wire dependencies explicitly at application entry points.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-011] Widespread Cross-Module Internal File Imports Bypassing Public `index.ts` APIs (>50 Instances)** — [index.ts:4-16](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L4-L16) & [LobbyView.vue:16-22](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/LobbyView.vue#L16-L22)
  - **Dimension:** C (Architecture) & E (Code Quality)
  - **Rule Source:** `code-organization-principles.md` (Module Boundaries)
  - **Description:** Files routinely bypass feature and platform `index.ts` public APIs to import private implementation files directly (>50 instances).
  - **Impact:** Breaks encapsulation; internal refactorings within any module break external callers across the codebase.
  - **Remediation:** Restrict cross-module imports to module public APIs (`index.ts`). Add an ESLint boundary rule (`no-restricted-imports`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-012] Monolithic God Component in `App.vue` (1,709 Lines)** — [App.vue:1-1709](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L1-L1709)
  - **Dimension:** C (Architecture) & E (Code Quality)
  - **Rule Source:** `code-organization-principles.md` (SRP), `vue-idioms` §Component Design
  - **Description:** `App.vue` spans 1,709 lines and orchestrates routes, theme transitions, DOM styling injections, banner notifications, audio/confetti state, PWA prompts, sync conflict dialogs, socket multiplayer events, solo AI arena, and 8 modals with 1,020 lines of scoped CSS.
  - **Impact:** High cognitive load, regression risk, and difficulty writing component tests.
  - **Remediation:** Decompose into `AppViewRouter.vue`, `AppToastManager.vue`, `AppModalContainer.vue`, and composables (`useTheme.ts`, `useNotification.ts`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-013] Stale Closures and Missing Event Listener Teardown in `useSocket`** — [useSocket.ts:81, 129-150](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L81-L150)
  - **Dimension:** B (Reliability) & F (Integration)
  - **Rule Source:** `resources-and-memory-management-principles.md`
  - **Description:** Module-scoped `attachedSockets = new WeakSet<object>()` prevents duplicate listener registration. However, each call to `useSocket()` creates fresh local `ref`s. Subsequent component callers receive empty refs that never receive event updates.
  - **Impact:** Multiple components using `useSocket` experience state desynchronization where only the first caller receives updates.
  - **Remediation:** Convert `useSocket` state into a singleton store or manage listener subscriptions per composable lifecycle using `onScopeDispose` with `socket.off`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-014] Dangling Disconnect Grace Timers Leak on Abandoned Room Pruning** — [room.socket_handler.ts:25-45](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L25-L45) & [room.service.ts:413-428](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L413-L428)
  - **Dimension:** B (Reliability)
  - **Rule Source:** `resources-and-memory-management-principles.md`
  - **Description:** `roomService.cleanupAbandonedRooms()` deletes rooms from the store, but does not cancel active 60-second grace timers in `disconnectTimers`. The timer later triggers against a non-existent room, logging spurious errors and emitting ghost events.
  - **Impact:** Memory leak of timer handles and room closure contexts; ghost socket emissions.
  - **Remediation:** Call `cancelAllDisconnectTimersForRoom(roomCode)` during room cleanup or deletion.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-015] Incomplete Environment Configuration and Missing `.env.template` Contract** — [.env.example:1-6](file:///home/irahardianto/works/projects/fun-chess/.env.example#L1-L6)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `configuration-management-principles.md`
  - **Description:** Missing `.env.template`. `.env.example` omits 4 variables actively referenced in code: `PUBLIC_URL`, `CORS_ORIGIN`, `LAN_IP`, `HOST_IP`.
  - **Impact:** Operators lack documented references for Cloud Relay, network IP overrides, or CORS restrictions, resulting in unhardened production defaults.
  - **Remediation:** Create `.env.template` documenting all environment variables with descriptions, allowed types, and default values.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-016] Absence of Centralized Startup Configuration Validation and Fail-Fast Enforcement** — [index.ts:26-33](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L26-L33)
  - **Dimension:** A (Configuration)
  - **Rule Source:** `configuration-management-principles.md`
  - **Description:** Direct `process.env` access across server files silently falls back on malformed inputs (`|| 3000`, `|| "info"`) without failing fast on invalid config.
  - **Impact:** Typos in configuration pass silently, causing application to fail open in production.
  - **Remediation:** Implement `src/platform/config/env.ts` with Zod parsing that halts startup on validation failure.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-017] Unlogged Operation Entry Points and Broken 3-Point Logging in Background Cleanup Job** — [index.ts:81-99](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L81-L99)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md`
  - **Description:** Periodic room cleanup runs every 5 minutes but omits start logging, `correlationId`, and execution `duration`. When 0 rooms are cleaned, it completes silently; error logs discard stack traces.
  - **Impact:** Zero visibility into whether background cleanup is running or stalled; impossible to diagnose silent failures.
  - **Remediation:** Wrap background jobs in a structured helper recording start, completion with duration and count, and full error stack on failure.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-018] Incorrect Log Level: Normal 4xx Client Validation Failures Logged as ERROR in Socket Middleware** — [socket_logging_middleware.ts:88-103](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L88-L103)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md`
  - **Description:** `wrapSocketHandler` logs every exception at ERROR level, including expected client errors (`InvalidMoveError`, `RoomNotFoundError`, `RateLimitExceededError`).
  - **Impact:** Production error monitoring is flooded with false alarms from illegal moves or typos, drowning out real system bugs.
  - **Remediation:** Check status code: log 4xx client rejections at WARN, reserving ERROR strictly for 5xx server exceptions.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-019] Incompatible Service Coercion and Runtime Crash Risk via Double Type Assertion** — [http_server.ts:45](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L45)
  - **Dimension:** E (Code Quality) & C (Architecture)
  - **Rule Source:** `typescript-idioms` §ESLint Suppression Policy, `core-design-principles.md`
  - **Description:** `createHttpServer` forcibly casts `lanService` via `(lanService as unknown as IRelayAddressService)`. `LanService` does not implement `IRelayAddressService` and lacks required methods. Invoking it with `lanService` throws `TypeError: addressService.getAddressingInfo is not a function`.
  - **Impact:** Hidden runtime crash hazard behind unsafe double casting.
  - **Remediation:** Remove `lanService` from `HttpServerConfig` and standardize entirely on `RelayAddressService`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-020] Complete Absence of End-to-End (E2E) Test Suite for Primary User Journeys** — [package.json:13](file:///home/irahardianto/works/projects/fun-chess/package.json#L13)
  - **Dimension:** G (Testing)
  - **Rule Source:** `testing-strategy.md` §Test Pyramid (E2E 10%)
  - **Description:** The repository contains zero E2E tests. None of the primary user journeys (multiplayer room creation/joining, live gameplay, AI matches, QR progress sync) are tested in a real browser.
  - **Impact:** Browser rendering, Web Audio, camera, and WebSocket integration bugs can reach production undetected.
  - **Remediation:** Add an `apps/e2e` Playwright package covering multiplayer matches, solo AI, and progress sync.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MAJ-021] Missing Code Coverage Tooling and Quality Gate Enforcement (>85% Mandate)** — [package.json:20-22](file:///home/irahardianto/works/projects/fun-chess/package.json#L20-L22)
  - **Dimension:** G (Testing)
  - **Rule Source:** `testing-strategy.md` §Test Pyramid (>85% unit test coverage mandate)
  - **Description:** `@vitest/coverage-v8` is not installed; no coverage script exists; running `--coverage` fails interactively in CI.
  - **Impact:** Test coverage cannot be tracked or enforced against project quality gates.
  - **Remediation:** Install `@vitest/coverage-v8` and configure 85% coverage thresholds in `vitest.config.ts`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-022] Dual Conflicting Lockfiles Present in Repository Root (`pnpm-lock.yaml` vs `package-lock.json`)** — [package-lock.json:1](file:///home/irahardianto/works/projects/fun-chess/package-lock.json#L1) & [pnpm-lock.yaml:1](file:///home/irahardianto/works/projects/fun-chess/pnpm-lock.yaml#L1)
  - **Dimension:** G (Dependencies)
  - **Rule Source:** `dependency-management-principles.md` §Use lock files
  - **Description:** Both `package-lock.json` (330 KB npm lockfile) and `pnpm-lock.yaml` are checked in. Package manifests use `workspace:*` dependencies incompatible with npm.
  - **Impact:** Running `npm install` creates broken dependency trees and desynchronized builds.
  - **Remediation:** Remove `package-lock.json` from git and enforce pnpm via `engines` and `"packageManager": "pnpm@9.15.4"`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-023] Manifest Dependency Version Mismatch Across Workspaces (`chess.js`)** — [apps/server/package.json:15](file:///home/irahardianto/works/projects/fun-chess/apps/server/package.json#L15), [apps/client/package.json:16](file:///home/irahardianto/works/projects/fun-chess/apps/client/package.json#L16), & [shared/package.json:26](file:///home/irahardianto/works/projects/fun-chess/shared/package.json#L26)
  - **Dimension:** G (Dependencies)
  - **Rule Source:** `dependency-management-principles.md` §Version Pinning
  - **Description:** `chess.js` is declared as `^1.0.0-beta.9` in server and shared, but `^1.4.0` in client.
  - **Impact:** Discrepancies between beta.9 and 1.4.0 rule validation could lead to move legality desynchronization.
  - **Remediation:** Pin `chess.js` to `1.4.0` across all package manifests.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-024] Non-Deterministic Key Serialization in JSON Backup Checksum Verification** — [progress_codec.ts:250-252, 301-312](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_codec.ts#L250-L252)
  - **Dimension:** F (Integration Contracts)
  - **Rule Source:** `data-serialization-and-interchange-principles.md`
  - **Description:** `encodeToEnvelopeJson` and `decodeFromEnvelopeJson` compute CRC-32 checksums using standard `JSON.stringify`. Unsorted key order can produce different strings, causing false checksum mismatch errors on import.
  - **Impact:** Legitimate user backups fail to restore across browsers or devices.
  - **Remediation:** Implement canonical JSON stringification (recursive key sorting) before computing checksums.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-025] Swallowed Errors and Empty Catch Blocks Across Codebase (11 Locations)** — Multiple locations: [useSocket.ts:64](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L64), [useScenarioRunner.ts:329](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/composables/useScenarioRunner.ts#L329), [chess_engine.ts:299](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L299)
  - **Dimension:** B (Reliability) & G (Tests)
  - **Rule Source:** `error-handling-principles.md`, `rugged-software-constitution.md`
  - **Description:** At least 11 completely empty `catch {}` blocks exist across client and server. In `useScenarioRunner.ts:329`, an engine move error is silenced and `advanceOrCompleteStep()` is executed anyway, causing state corruption.
  - **Impact:** Silent failures, diagnostic blindness, and corrupted step transitions.
  - **Remediation:** Replace all empty catch blocks with structured warning logs; do not advance state on errors.
  - **Fix workflow:** `/bugfix`

---

## Minor Issues
Code maintainability issues, function length/complexity violations, or minor test gaps. Fix in near term.

- [ ] **[MIN-001] Floating Dependency Versions Across All Package Manifests** — [apps/server/package.json:13-27](file:///home/irahardianto/works/projects/fun-chess/apps/server/package.json#L13-L27)
  - **Dimension:** G (Dependencies)
  - **Description:** Production manifests use caret (`^`) version ranges instead of pinned exact versions, violating the dependency management rule.
  - **Remediation:** Pin exact versions across all manifests.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-002] Insecure PRNG (`Math.random()`) for Room Code Generation** — [room.service.ts:438](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L438)
  - **Dimension:** A (Security)
  - **Description:** V8's `Math.random()` is used to generate 4-character room codes. It is predictable after observing a sequence of generated codes.
  - **Remediation:** Replace with `randomInt` from `node:crypto`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-003] Unchecked `res.headersSent` Before Writing 500 Error in HTTP Ingress** — [http_server.ts:233-256](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L233-L256)
  - **Dimension:** B (Reliability)
  - **Description:** Catch block unconditionally calls `res.writeHead(500)`. If headers were already flushed during streaming, this throws `ERR_HTTP_HEADERS_SENT` and crashes the process.
  - **Remediation:** Guard with `if (!res.headersSent)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-004] Internal Network Topology Disclosure via `/api/lan-info` and `/health`** — [relay_address.service.ts:298-312](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/relay_address.service.ts#L298-L312)
  - **Dimension:** A (Security)
  - **Description:** Internal host container IPs and network interfaces are returned by `/api/lan-info` even in Cloud Relay mode.
  - **Remediation:** Suppress `interfaces` array when `isCloudRelay() === true`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-005] Unbounded Memory Growth in `SocketRateLimiter`** — [socket_rate_limiter.ts:41-52](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L41-L52)
  - **Dimension:** B (Reliability) & F (Integration)
  - **Description:** Cleared timestamp keys remain in map with empty arrays `[]` forever; no TTL or LRU pruning.
  - **Remediation:** Delete keys when `valid.length === 0` and add periodic TTL pruning.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-006] Extreme Cyclomatic Complexity in Progress Merging (CC: 83, 209 lines)** — [progress_merger.ts:39-247](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_merger.ts#L39-L247)
  - **Dimension:** E (Code Quality)
  - **Description:** `mergeUnifiedProgress` has a cyclomatic complexity of 83 and combines 8 sub-domain merges procedurally.
  - **Remediation:** Split into sub-domain mergers: `mergeScenarios`, `mergeRatingProfile`, `mergeThemeMastery`, etc.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-007] Monolithic Ad-Hoc Validation in `schema_validator.ts` (CC: 64, 268 lines)** — [schema_validator.ts:76-343](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/schema_validator.ts#L76-L343)
  - **Dimension:** E (Code Quality)
  - **Description:** `sanitizeAndValidate` violates SRP by mutating and validating simultaneously through deeply nested `typeof` checks.
  - **Remediation:** Replace imperative checks with declarative Zod schemas.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-008] Fragile Heuristic Rule Engine in `extractPuzzleThemes` (CC: 71)** — [puzzle_catalog.ts:102-244](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/data/puzzle_catalog.ts#L102-L244)
  - **Dimension:** E (Code Quality)
  - **Description:** Uses substring checks and regex ID slicing (`parseInt(id.replace(/\D/g, "")) <= 15`) to classify themes.
  - **Remediation:** Normalize themes ahead of time in JSON or use static dictionary lookup.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-009] Duplicated Material & Captured Pieces Logic Across 3 Modules** — [useChessGame.ts:68](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useChessGame.ts#L68), [useAiGame.ts:130](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiGame.ts#L130), & [chess_engine.ts:173](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L173)
  - **Dimension:** E (Code Quality)
  - **Description:** Identical piece counting and material advantage calculations duplicated across client and server.
  - **Remediation:** Extract shared `calculateMaterialAndCaptures` into `@fun-chess/shared`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-010] Duplicated Interactive Chess Board Selection State Machine Across 4 Composables** — [useChessGame.ts:179](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useChessGame.ts#L179), [useAiGame.ts:477](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiGame.ts#L477), [usePuzzleRunner.ts:262](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleRunner.ts#L262), & [useScenarioRunner.ts:179](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/composables/useScenarioRunner.ts#L179)
  - **Dimension:** E (Code Quality)
  - **Description:** Four composables duplicate selection, legal move highlight, and promotion pending state machines.
  - **Remediation:** Extract reusable `useBoardSelection()` composable in `features/board`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-011] Duplicated Pawn Promotion Move Detection (`isPromotionMove`)** — [useChessGame.ts:168](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useChessGame.ts#L168), [useAiGame.ts:386](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiGame.ts#L386), & [useScenarioRunner.ts:136](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/composables/useScenarioRunner.ts#L136)
  - **Dimension:** E (Code Quality)
  - **Description:** Verbatim copy of pawn promotion rank checking across 3 files.
  - **Remediation:** Export `isPawnPromotion` from `@fun-chess/shared`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-012] Strict TypeScript Compiler Flags Omitted Across Projects** — [tsconfig.base.json:1-15](file:///home/irahardianto/works/projects/fun-chess/tsconfig.base.json#L1-L15)
  - **Dimension:** E (Code Quality)
  - **Description:** `noUncheckedIndexedAccess: true` is missing (117 type errors when enabled).
  - **Remediation:** Enable `noUncheckedIndexedAccess`, `noImplicitReturns`, and `exactOptionalPropertyTypes`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-013] Type Bypasses: `as any`, Double Casts, and Fractured `Square` Types (43 Occurrences)** — [useChessGame.ts:133](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useChessGame.ts#L133)
  - **Dimension:** E (Code Quality)
  - **Description:** `@fun-chess/shared` defines `Square` independently from `chess.js`, forcing 43 double-casts `as unknown as import('chess.js').Square`.
  - **Remediation:** Align `Square` in `@fun-chess/shared` directly with `chess.js`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-014] Dead Code & Unreferenced Exports (44 Symbols)** — [puzzle_catalog.ts:47-60](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/data/puzzle_catalog.ts#L47-L60)
  - **Dimension:** E (Code Quality)
  - **Description:** 44 exported symbols (`PUZZLES_BY_ID`, `THEME_ALIASES`, `detectWebRtcLanIp`, etc.) are unconsumed.
  - **Remediation:** Remove dead exports or make them private.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-015] Missing and Inconsistent Context Fields in Logs (`durationMs` vs `duration`, missing `userId`)** — [socket_logging_middleware.ts:64-70](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L64-L70)
  - **Dimension:** D (Observability)
  - **Description:** Field is named `durationMs` instead of mandated `duration`; `userId` is omitted from socket logs.
  - **Remediation:** Update log schema to emit `duration` and bind `userId`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-016] Unstructured Logging in Server Bootstrap and Shared Domain Utility** — [index.ts:136-154](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L136-L154) & [chess_factory.ts:53-88](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/chess_factory.ts#L53-L88)
  - **Dimension:** D (Observability)
  - **Description:** Server bootstrap prints ASCII banners with `console.log`; `chess_factory.ts` calls `console.warn` with string templates.
  - **Remediation:** Suppress ASCII banner in production (`NODE_ENV === 'production'`); allow injectable logger in `chess_factory.ts`.
  - **Fix workflow:** `/bugfix`

---

## Enhancement Issues
Non-critical suggestions, defense-in-depth, documentation, or minor clarity refactorings.

- [ ] **[ENH-001] Missing Modern HTTP Security Headers (CSP, HSTS, Permissions-Policy)** — [http_server.ts:91-95](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L91-L95)
  - **Dimension:** A (Security)
  - **Suggestion:** Set `Content-Security-Policy`, `Strict-Transport-Security`, and `Permissions-Policy` in `http_server.ts`.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-002] Missing Linter and Code Formatter (ESLint & Prettier)** — [package.json:1-24](file:///home/irahardianto/works/projects/fun-chess/package.json#L1-L24)
  - **Dimension:** E (Code Quality)
  - **Suggestion:** Add ESLint v9 Flat Config with `@typescript-eslint` and `eslint-plugin-vue`.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-003] Low JSDoc Documentation Coverage on Public Contracts (57%)** — [api.ts:1](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/api.ts#L1) & [events.ts:12](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/events.ts#L12)
  - **Dimension:** E (Code Quality)
  - **Suggestion:** Add JSDoc comments to all exported interfaces, types, and event schemas in `@fun-chess/shared`.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-004] Missing Global Pino Redaction Configuration** — [pino_logger.ts:21-25](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/logger/pino_logger.ts#L21-L25)
  - **Dimension:** D (Observability)
  - **Suggestion:** Configure native Pino redaction paths for passwords, tokens, and authorization headers.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-005] Missing Socket-Level Error Event Listener on Server Ingress** — [index.ts:60-78](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L60-L78)
  - **Dimension:** D (Observability)
  - **Suggestion:** Register `socket.on("error", ...)` to log low-level connection pipeline issues.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-006] Incomplete Log Level Methods on Server `Logger` (`trace` and `fatal`)** — [logger.interface.ts:4-10](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/logger/logger.interface.ts#L4-L10)
  - **Dimension:** D (Observability)
  - **Suggestion:** Add `trace` and `fatal` methods to `Logger`, `PinoLogger`, and `NullLogger`.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-007] Vite Host Header Verification Disabled (`allowedHosts: true`) in Dev** — [vite.config.ts:147](file:///home/irahardianto/works/projects/fun-chess/apps/client/vite.config.ts#L147)
  - **Dimension:** A (Security)
  - **Suggestion:** Restrict allowed dev hosts to local subnets or document development-only scope.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-008] Global State Disconnect Timers Not Cleared on Graceful Server Shutdown** — [room.socket_handler.ts:27-65](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L27-L65) & [index.ts:102-117](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L102-L117)
  - **Dimension:** F (Integration) & B (Reliability)
  - **Suggestion:** Invoke `clearAllDisconnectTimers()` during process shutdown.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-009] Storage Quota Exceeded Reactive User Warning** — [local_storage_puzzle_store.ts:304](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/local_storage_puzzle_store.ts#L304)
  - **Dimension:** B (Reliability)
  - **Suggestion:** Dispatch an event or reactive ref to alert the user when `localStorage` quota is full and prompt export.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-010] Missing Automated Dependency Vulnerability and License Scanning in CI/CD** — [Dockerfile:19](file:///home/irahardianto/works/projects/fun-chess/Dockerfile#L19)
  - **Dimension:** G (Dependencies)
  - **Suggestion:** Add `.github/workflows/ci.yml` running `pnpm audit --audit-level=high`.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[ENH-011] Untested Server Bootstrap Lifecycle and Graceful Process Signal Handling** — [index.ts:101-155](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L101-L155)
  - **Dimension:** G (Testing)
  - **Suggestion:** Extract server shutdown coordinator into a testable unit with fake timers.
  - **Fix workflow:** `/workflow-solo`

---

## Verification Suite Results
- **Linter & Static Analysis:** PASS (0 errors reported; `tsc` across `@fun-chess/shared` and `@fun-chess/server`, `vue-tsc -b` across `@fun-chess/client` all passed with code 0. Note: Dedicated ESLint / Prettier tooling is not configured).
- **Automated Tests:** PASS (114 test files passed, 1,257 tests passed, 0 failed, 0 skipped across workspaces, contract tests, and integration tests).
- **Build Verification:** PASS (Production bundles generated cleanly: `dist/index.html` 2.22 kB, PWA service worker precache 16 entries / 1451 kB, server TypeScript compiled to `dist/`).
- **Test Coverage:** N/A (Coverage provider `@vitest/coverage-v8` not configured in manifests).

---

## Cross-Dimension Correlations
Findings that span multiple dimensions, with escalated severity:

1. **Integration Test Shadow Server Evasion (`test_server.ts`)**
   - Correlated across: **Dimension G** (`[MAJOR-001]`) & **Dimension F** (`[MAJOR-003]`)
   - Escalation: **MAJOR -> CRITICAL (`[CRIT-004]`)**
   - Rationale: The contract and integration test suites validate a completely separate 1,146-line mock server instead of real server code. Real production routing, error handling, rate limiting, and socket handlers are bypassed by CI tests, creating false confidence.

2. **Socket Logging Middleware Silent Error Swallowing & Leakage**
   - Correlated across: **Dimension F** (`[MAJOR-001]`), **Dimension B** (`[MAJOR-003]`), **Dimension D** (`[MAJOR-003]`), & **Dimension A** (`[MINOR-010]`)
   - Escalation: **MAJOR -> CRITICAL (`[CRIT-005]`)**
   - Rationale: Server-side exceptions on fire-and-forget events are dropped silently without emitting `error`, leaving clients frozen. Meanwhile, unhandled errors leak runtime exception messages to callbacks, and normal 4xx client errors spam system ERROR logs.

3. **In-Memory Room Store Concurrency Overwrite & Timer Leakage**
   - Correlated across: **Dimension F** (`[MAJOR-002]`), **Dimension B** (`[MAJOR-002]`), & **Dimension D** (`[MAJOR-001]`)
   - Escalation: **MAJOR -> CRITICAL (`[CRIT-006]`)**
   - Rationale: Ephemeral room mutations lack optimistic concurrency or mutexes, allowing interleaved moves to overwrite resignations or disconnect pauses. Concurrently, room cleanup abandons active timers without cancellation or structured logging.

4. **Static File Handler Security, Masking & Crash Hazards**
   - Correlated across: **Dimension A** (`[MINOR-008]`), **Dimension B** (`[MAJOR-006, 007]`), **Dimension D** (`[MAJOR-005]`), & **Dimension G** (`[MAJOR-004]`)
   - Escalation: **MAJOR -> CRITICAL (`[CRIT-008]`)**
   - Rationale: `static_handler.ts` path boundary validation is weak, directory traversal attempts are logged as normal delivery, missing static JS/CSS assets return HTML with HTTP 200 (breaking browser script parsing), and mid-stream errors trigger `ERR_HTTP_HEADERS_SENT` process crashes.

5. **Client Progress Overwrite Data Loss & Store Bypasses**
   - Correlated across: **Dimension B** (`[CRITICAL-001]`), **Dimension C** (`[MAJOR-009]`), & **Dimension F** (`[MAJOR-006]`)
   - Escalation: **Retained as CRITICAL (`[CRIT-003]`)**
   - Rationale: Permanent progress wipeout combined with contract omissions in `PuzzleProgressStore` that force stores to bypass abstractions with direct `localStorage` writes.

6. **Monolithic God Component in `App.vue`**
   - Correlated across: **Dimension C** (`[MINOR-002]`), **Dimension E** (`[MAJOR-004]`), **Dimension B** (`[MAJOR-008]`), & **Dimension F** (`[MINOR-003]`)
   - Escalation: **MINOR -> MAJOR (`[MAJ-012]`)**
   - Rationale: 1,709-line component accumulates routing, modals, audio, DOM manipulation, duplicate fetch calls, and synchronous `localStorage` reads that crash private browsing sessions.

---

## Dimensions Covered
| Dimension | Status | Files / Queries Examined |
|---|---|---|
| A. Security & Configuration | ✅ Checked | Audited 39 files for SQL/NoSQL injection, XSS, SSRF, command injection, path traversal, IDOR, session token exposure, rate limiting, and `.env` completeness. |
| B. Reliability & Error Handling | ✅ Checked | Audited 42 files for swallowed errors (11 empty catches found), unclosed hardware streams (camera leak), memory leaks, process crash vectors, and timeout hygiene. |
| C. Testability & Architecture | ✅ Checked | Audited 85 files for vertical slice compliance, 3 circular dependency chains, I/O isolation violations, global singletons, and module boundary encapsulation. |
| D. Observability & Logging | ✅ Checked | Audited 49 files for 3-point operation logging, correlation IDs, duration metrics, log level accuracy (4xx vs 5xx), and structured logging hygiene. |
| E. Code Quality & Patterns | ✅ Checked | Audited 118 files for function length (>50 lines), cyclomatic complexity (up to CC 83), DRY violations (3+ copies of chess evaluation), dead code (44 symbols), and strict TypeScript flags. |
| F. Integration Contracts & DB | ✅ Checked | Audited 53 files for client-server Socket.IO event contract parity, Read-Modify-Write race conditions in room store, JSON checksum determinism, and API envelopes. |
| G. Dependencies & Tests | ✅ Checked | Audited 58 files for dual lockfiles (`package-lock.json` vs `pnpm-lock.yaml`), floating dependencies, missing E2E tests, shadow test server evasion, and missing code coverage tooling. |

---

## Rules Applied
- `security-mandate.md` / `security-principles.md` (Broken Access Control, Rate Limiting, Input Validation, CORS)
- `rugged-software-constitution.md` (Fail Securely, No Silent Failures, Defense in Depth)
- `error-handling-principles.md` (Zero Tolerance for Empty Catch Blocks, Structured Exceptions)
- `architectural-pattern.md` (Rule 1: I/O Isolation, Rule 2: Pure Business Logic, Rule 3: Dependency Direction)
- `code-organization-principles.md` (Module Boundaries, Avoid Circular Dependencies, Vertical Slices)
- `logging-and-observability-mandate.md` (3-Point Operation Logging, Context Fields, Log Levels)
- `api-design-principles.md` / `database-design-principles.md` (Event Contracts, Race Conditions, Envelopes)
- `dependency-management-principles.md` / `testing-strategy.md` (Version Pinning, Lockfile Hygiene, Test Pyramid)

---

## Remediation Action Plan
Findings ranked by priority for resolution:

### Immediate Priority (Blocker / Security & Data Loss):
1. **[CRIT-001]** — Separate private session tokens from public `Player`/`RoomState` models to prevent player session hijacking → `/bugfix`
2. **[CRIT-002]** — Attach server `error` listener and global `unhandledRejection`/`uncaughtException` process handlers in `index.ts` → `/bugfix`
3. **[CRIT-003]** — Implement two-phase commit with rollback in `LocalStorageUnifiedStore.overwriteAll` to prevent progress loss → `/bugfix`
4. **[CRIT-004]** — Replace 1,146-line shadow `test_server.ts` with real production server wiring in integration test suites → `/refactor`
5. **[CRIT-005]** — Fix `wrapSocketHandler` to emit `socket.emit("error")` for unacknowledged socket operations and sanitize error messages → `/bugfix`
6. **[CRIT-006]** — Add room-level async mutex or versioned CAS to `InMemoryRoomStore` to prevent state overwrite race conditions → `/bugfix`
7. **[CRIT-007]** — Ensure camera hardware `MediaStream` tracks are stopped on initialization failure in `useQrScanner.ts` → `/bugfix`
8. **[CRIT-008]** — Harden `static_handler.ts` path boundary checks, log traversal attempts, and eliminate 200 HTML masking for missing assets → `/bugfix`

### Near Term (Major Defects & Structural Violations):
9. **[MAJ-001]** — Key socket rate limiter by client IP and do not wipe timestamps on disconnect → `/bugfix`
10. **[MAJ-002]** — Implement runtime Zod schema validation at socket ingress boundary → `/bugfix`
11. **[MAJ-003]** — Require explicit `CORS_ORIGIN` in production and parameterize in `cloud_run.tf` → `/bugfix`
12. **[MAJ-004] & [MAJ-005]** — Resolve circular dependencies (`rooms` <-> `game` and composables <-> `portability`) → `/refactor`
13. **[MAJ-006] & [MAJ-007]** — Abstract browser storage and HTTP fetch behind isolated service interfaces with timeout guards → `/refactor`
14. **[MAJ-012]** — Decompose monolithic 1,709-line `App.vue` into sub-views, modal containers, and composables → `/refactor`
15. **[MAJ-013]** — Fix `useSocket` reactive ref desynchronization and event listener lifecycle management → `/bugfix`
16. **[MAJ-018]** — Demote expected 4xx client errors from ERROR to WARN in `socket_logging_middleware.ts` → `/bugfix`
17. **[MAJ-022] & [MAJ-023]** — Delete `package-lock.json`, enforce pnpm, and pin `chess.js` to `1.4.0` across all manifests → `/bugfix`
18. **[MAJ-024]** — Implement canonical sorted JSON stringification in `DefaultProgressCodec` for deterministic checksums → `/bugfix`
19. **[MAJ-025]** — Eliminate 11 empty catch blocks across client and server → `/bugfix`

### Backlog / Hardening:
20. **[MAJ-020] & [MAJ-021]** — Add Playwright E2E suite and configure `@vitest/coverage-v8` quality gates (>85%) → `/workflow-solo`
21. **[MIN-006] - [MIN-011]** — Refactor procedural complexity in `progress_merger.ts` and deduplicate chess rules logic across client/server → `/refactor`
22. **[ENH-001] - [ENH-011]** — Modern security headers (CSP), ESLint v9 Flat Config, JSDoc contract coverage, and CI workflow → `/workflow-solo`
