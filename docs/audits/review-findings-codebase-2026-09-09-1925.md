# Code Audit: Full Codebase
Date: 2026-09-09
Auditor: AI Code Audit (multi-dimensional, 7 parallel subagents)

## Executive Summary
- **Dimensions activated:** A (Security & Configuration), B (Reliability & Error Handling), C (Testability & Architecture), D (Observability & Logging), E (Code Quality & Patterns), F (Integration Contracts & API Boundaries), G (Dependencies & Test Coverage Gaps)
- **Dimensions skipped:** None (all 7 dimensions fully scanned across `shared`, `apps/server`, `apps/client`, `apps/e2e`)
- **Files scanned:** 573 files across the monorepo (205 core application source files, 177 test suites, build and deployment manifests)
- **Findings:** 61 total (1 Critical, 13 Major, 27 Minor, 20 Enhancement)
- **Automated verification:** Lint: PASS (0 errors, 0 warnings) | Typecheck: PASS (0 errors across monorepo) | Tests: PASS (177/177 test files, 2,605/2,605 tests passed, 0 failed) | Build: PASS (shared, server, client with PWA service worker)
- **Overall codebase health:** HEALTHY WITH ISOLATED REMEDIATIONS (defensible security posture, comprehensive type checking, clean secrets scan, high test pass rate, with specific state transition purity, error handling, and observability remediations required)

## Critical Issues
Vulnerabilities or severe defects that cause active security breaches, data loss, or system failure. Must be fixed immediately.

- [ ] **[CRIT-001]** Direct State Mutation + `save()` in `handleAbandonmentForfeit` Bypasses Pure Transitions, Version Increment, and Optimistic Lock Guards — [apps/server/src/features/rooms/room.service.ts:525-551](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L525-L551)
  - **Dimension:** Cross-Dimension Convergence (Dimension B: Reliability & Dimension C: Architecture & Dimension D: Observability)
  - **Rule Source:** `error-handling-principles.md` (Principle 5: Clean Up in Finally Blocks), `architectural-pattern.md` (Rule 2: Pure Business Logic), `logging-and-observability-mandate.md`
  - **Description:** Inside `handleAbandonmentForfeit`, `room.service.ts` fetches the room snapshot via `this.store.findByCode`, mutates properties directly on the cloned object (`room.status = "game_over"; room.lastActivityAt = this.clock.now()`), and calls `this.store.save(room)`. Unlike `this.store.mutate()`, `store.save()` completely bypasses the optimistic locking guard (`OptimisticLockConflictError`), does not assert valid ticket ownership via `assertTicketValid()`, and skips the pure state transition functions in `room.logic.ts` (`finalizeGameTransition`). Furthermore, this critical forfeiture path emits zero service-layer operational logs.
  - **Impact:** A race condition between an asynchronous abandonment forfeit and a reconnecting player can overwrite room state without conflict detection, creating inconsistent room status and dropping version monotonicity.
  - **Evidence:**
    ```typescript
    // room.service.ts lines 525-551
    room.status = "game_over";
    room.lastActivityAt = this.clock.now();
    // ...
    await this.store.save(room); // bypasses mutate() CAS version guard
    ```
  - **Remediation:** Extract `abandonmentForfeitTransition(room, disconnectedPlayerId, now)` into `room.logic.ts` as a pure function. Refactor `handleAbandonmentForfeit` to use `await this.store.mutate(normalizedCode, ...)` with proper ticket validation and optimistic concurrency checks, and emit structured service-layer logs.
  - **Fix workflow:** `/bugfix` — immediate priority

## Major Issues
Structural violations, missing I/O error handling, untested critical paths, or broken contracts. Must be fixed before release.

- [ ] **[MAJ-001]** `x-correlation-id` Header Accepted Verbatim from Untrusted HTTP Clients — [apps/server/src/platform/http/http_server.ts:513](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L513)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `security-principles.md` (Input Validation: All input is untrusted)
  - **Description:** The HTTP request handler accepts `req.headers["x-correlation-id"]` directly without sanitization, character regex validation, or length bounding. The raw string is reflected back in error response bodies and injected into structured JSON log records.
  - **Impact:** Allows malicious clients to inject CRLF sequences or oversized strings into structured log records and response payloads.
  - **Evidence:**
    ```typescript
    const correlationId = (req.headers["x-correlation-id"] as string) || randomUUID();
    ```
  - **Remediation:** Validate incoming correlation ID against `/^[a-zA-Z0-9_-]{8,64}$/`. Fall back to `randomUUID()` if the header is missing or does not match the strict allowlist regex.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-002]** Health & Metrics Endpoints Bypass HTTP Rate Limiter and Telemetry Endpoints Lack Auth — [apps/server/src/platform/http/http_server.ts:630-688](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L630-L688) and [apps/server/src/platform/http/controllers/health.controller.ts:45-75](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/health.controller.ts#L45-L75)
  - **Dimension:** Cross-Dimension Convergence (Dimension A: Security & Dimension D: Observability)
  - **Rule Source:** `security-principles.md` (Rate Limiting, Broken Access Control)
  - **Description:** In `http_server.ts`, health routes (`/health`, `/healthz`, `/metrics`, `/health/detail`) return early before the HTTP rate-limiting check is evaluated. Unauthenticated clients can flood `/metrics` and `/health/detail` without restriction. Furthermore, `/metrics` and `/health/detail` expose live server telemetry (active room count, active socket count, heap/RSS memory usage) without authentication or rate limits.
  - **Impact:** Resource exhaustion via unmetered metric scraping and operational intelligence leakage to unauthorized external callers.
  - **Evidence:**
    ```typescript
    // Health routes return early before rate limiter
    if (await handleHealthRoutes(...)) { return; }
    // Rate limit check only reached if NOT a health route
    if (handleRateLimitCheck(...)) { return; }
    ```
  - **Remediation:** Evaluate rate limiting prior to health route handling or apply a dedicated strict rate limiter for telemetry routes. Guard `/metrics` and `/health/detail` with an optional `METRICS_SECRET` token or loopback-only check.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-003]** `GameService` Has No Logger Dependency and Self-Wires Concrete Infrastructure — [apps/server/src/features/game/game.service.ts:23,45-46](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L23-L46) and [apps/server/src/index.ts:124](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L124)
  - **Dimension:** Cross-Dimension Convergence (Dimension C: Architecture & Dimension D: Observability)
  - **Rule Source:** `logging-and-observability-mandate.md` (Universal Logging), `architectural-pattern.md` (Rule 3: Dependency Direction)
  - **Description:** `GameService` constructor does not accept a `Logger` parameter. All 6 core gameplay operations (`makeMove`, `resign`, `offerDraw`, `respondDraw`, `requestRematch`, `respondRematch`) and idempotent replay branches are completely dark with zero service-layer logging. In addition, `GameService` imports and instantiates concrete infrastructure adapters (`SystemClock`, `UuidGenerator`) directly rather than receiving them via constructor injection.
  - **Impact:** Domain-level move rejections and game lifecycle transitions cannot be diagnosed in production logs; service self-wires infrastructure, violating architectural dependency direction.
  - **Evidence:**
    ```typescript
    // game.service.ts
    import { SystemClock, UuidGenerator } from "../../platform/time/index.js";
    // constructor lacks logger and self-wires
    this.clock = clock ?? new SystemClock();
    this.idGenerator = idGenerator ?? new UuidGenerator();
    ```
  - **Remediation:** Add `logger?: Logger` to `GameService` constructor and wire it in `setupDomainServices`. Inject `clock` and `idGenerator` as required parameters without self-wiring defaults. Add structured service-level logging for move execution and game completion events.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-004]** Empty `catch` Block in Disconnect Grace-Period Timer Silently Swallows Job Errors — [apps/server/src/features/rooms/room.service.ts:475-477](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L475-L477)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `error-handling-principles.md` (Principle 1: Never Fail Silently)
  - **Description:** In the disconnect grace-period timeout callback, an empty `catch {}` block wraps `await runLoggedJob(...)`. Because `runLoggedJob` re-throws errors after logging its inner job, any failure thrown out of the job is swallowed by this outer block without room or player context.
  - **Impact:** Failures in asynchronous forfeiture handling during player disconnects are silently dropped without alerting or traceability.
  - **Evidence:**
    ```typescript
    } catch {
      // Error is already logged with full context and correlationId by runLoggedJob (MAJ-012)
    }
    ```
  - **Remediation:** Bind the error and log an error record with `operation: "disconnect_grace_period_abandonment"`, `roomCode`, and `playerId`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-005]** `RoomService` Primary Domain Operations Lack Service-Layer Logging and Self-Wires Concrete Adapters — [apps/server/src/features/rooms/room.service.ts:17,40,67-70,79-378](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L17-L70)
  - **Dimension:** Cross-Dimension Convergence (Dimension C: Architecture & Dimension D: Observability)
  - **Rule Source:** `logging-and-observability-mandate.md`, `architectural-pattern.md` (Rule 3: Dependency Direction)
  - **Description:** `createRoom`, `joinRoom`, `reconnect`, and `leaveRoom` emit zero service-layer operational logs; the fallback room code generator activation is completely silent. Additionally, `RoomService` imports and instantiates concrete infrastructure adapters (`InMemorySessionRegistry`, `SystemClock`, `UuidGenerator`, `DisconnectTimerRegistry`, `MAX_ROOMS`) as default arguments in its constructor.
  - **Impact:** Operational blind spots during room creation failures or high-collision code generation; tight coupling between business service and concrete platform adapters.
  - **Remediation:** Add service-level structured logging across all room lifecycle operations. Make dependencies required in `RoomService` constructor and wire them exclusively at `index.ts`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-006]** Cross-Module Boundary Violation: `GameSocketHandler` Imports Internal File from `Rooms` Feature — [apps/server/src/features/game/game.socket_handler.ts:29](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.socket_handler.ts#L29)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `code-organization-principles.md` (Module Boundaries: Cross-module calls go through public API only)
  - **Description:** `game.socket_handler.ts` directly imports `sanitizePublicRoom` from `../rooms/room.logic.js` instead of the public interface export at `../rooms/index.js`.
  - **Impact:** Breaks vertical slice encapsulation between `game` and `rooms` modules.
  - **Evidence:**
    ```typescript
    import { sanitizePublicRoom } from "../rooms/room.logic.js";
    ```
  - **Remediation:** Re-export `sanitizePublicRoom` from `apps/server/src/features/rooms/index.ts` and update the import in `game.socket_handler.ts` to reference the public API.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-007]** Bounded `cancelledTickets` Eviction Leaves Set Exceeding Cap by 1 and Constructor Overloaded with Type-Detection — [apps/server/src/features/rooms/in_memory_room.store.ts:53-61,69-129](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L53-L129)
  - **Dimension:** Cross-Dimension Convergence (Dimension B: Reliability & Dimension E: Code Quality)
  - **Rule Source:** `resources-and-memory-management-principles.md` (Avoid Resource Leaks), `core-design-principles.md` (Single Responsibility, Complexity < 10)
  - **Description:** `trackCancelledTicket` uses an `if` statement rather than a `while` loop, allowing `cancelledTickets` to permanently sit at `5,001` elements during bursts. In addition, the `InMemoryRoomStore` constructor spans ~60 lines with complex duck-typing across 4 positional parameters and an ignored `_idGenerator` argument.
  - **Impact:** Sub-optimal memory bounds under lock contention spikes and fragile constructor initialization.
  - **Evidence:**
    ```typescript
    this.cancelledTickets.add(ticket);
    if (this.cancelledTickets.size > this.MAX_CANCELLED_TICKETS) {
      const oldest = this.cancelledTickets.values().next().value;
      if (oldest !== undefined) this.cancelledTickets.delete(oldest);
    }
    ```
  - **Remediation:** Replace `if` with `while` in `trackCancelledTicket`. Refactor `InMemoryRoomStore` constructor to accept a clean options object `InMemoryRoomStoreOptions`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-008]** Socket.io Contract Schema Divergence and Dual-Delivery Race Risk — [shared/src/contracts/events.ts:89-95,178-190](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/events.ts#L89-L95) and [apps/server/src/features/rooms/room.socket_handler.ts:141-148,357-361](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L141-L148)
  - **Dimension:** F (Integration Contracts & API Boundaries)
  - **Rule Source:** `api-design-principles.md` (Contract Single Source of Truth, Dual Delivery)
  - **Description:**
    1. In `shared/src/contracts/events.ts`, `room:player_disconnected` declares `player` and `disconnectedAt`, but server never emits them, creating unreachable dead code in `useRoomSession.ts:136`.
    2. `room:reconnect` ack callback is internally typed with `roomStatus?: string` on the server instead of the narrower `RoomStatus` union type.
    3. `room:create` and `room:join` send the room state to the creator/joiner both via socket event (`room:created`/`room:joined`) and via ack callback, creating potential out-of-order race conditions on client state assignment.
  - **Impact:** Contract drift between server and client; potential client race conditions under high latency.
  - **Remediation:** Align `room:player_disconnected` contract to match server emission. Constrain server ack return types to `RoomStatus`. Restrict `room:created` and `room:joined` socket event emissions to peer sockets via `socket.to(roomCode).emit(...)`.
  - **Fix workflow:** `/bugfix` or `/refactor`

- [ ] **[MAJ-009]** Duplicate Player Name and Room Code Normalization Across Core Feature Services — [apps/server/src/features/rooms/room.service.ts](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts) and [apps/server/src/features/game/game.service.ts](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `core-design-principles.md` (DRY threshold — Rule of Three)
  - **Description:** `roomCode.trim().toUpperCase()` is copy-pasted verbatim across 20+ call sites in `room.service.ts`, `game.service.ts`, and `game.socket_handler.ts`. Player name validation is duplicated across `createRoom`, `joinRoom`, and shared Zod schemas.
  - **Impact:** Risk of normalization divergence and validation drift across call sites.
  - **Remediation:** Extract a shared `normalizeRoomCode(code: string): string` and `validatePlayerName(name: string): string` helper.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-010]** Floating `workspace:*` Internal Monorepo Dependency and Real-Disk I/O in Unit Tests — [apps/server/package.json:20](file:///home/irahardianto/works/projects/fun-chess/apps/server/package.json#L20), [apps/client/package.json:20](file:///home/irahardianto/works/projects/fun-chess/apps/client/package.json#L20), and [apps/server/src/platform/http/__tests__/file_storage.spec.ts](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/__tests__/file_storage.spec.ts)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `dependency-management-principles.md` (Exact Version Pinning), `testing-strategy.md` (I/O Isolation)
  - **Description:** `@fun-chess/shared` is declared as `workspace:*` in `apps/server` and `apps/client` package manifests, violating the exact version pinning mandate. In addition, `file_storage.spec.ts` exercises real filesystem I/O (creating temp directories and symlinks) within the unit test directory, slowing feedback and risking environment-specific failures.
  - **Impact:** Potential version skew across packages; unit test suite depends on host filesystem state.
  - **Remediation:** Pin `@fun-chess/shared` to `"workspace:^1.0.0"`. Move real-disk tests to `file_storage.integration.spec.ts` under an `integration/` directory.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-011]** Missing E2E Test for "Draw Offer Declined" User Journey — [apps/e2e/ui/multiplayer.e2e.test.ts](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/multiplayer.e2e.test.ts)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` (Critical User Journey Coverage)
  - **Description:** The Playwright E2E suite covers checkmate, resignation, accepted draws, accepted rematches, declined rematches, and disconnect forfeits. However, the "draw offer declined" browser user journey has zero E2E test verification.
  - **Impact:** Regressions in client-side draw decline notification banners or board unpausing are undetectable before release.
  - **Remediation:** Add an E2E test scenario where Host offers draw, Guest declines, Host receives "draw declined" banner, and the turn clock continues.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-012]** `handleDisconnect` in `RoomService` Exceeds Single Responsibility Complexity (~90 lines) — [apps/server/src/features/rooms/room.service.ts:384-489](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L384-L489)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `core-design-principles.md` (Single Responsibility Principle, Cyclomatic Complexity < 10)
  - **Description:** `handleDisconnect` handles room discovery, mutex acquisition, stale socket check under lock, state transition application, storage write, cross-registry timer deduplication across two timer registries, and asynchronous forfeiture scheduling with cyclomatic complexity >= 14.
  - **Impact:** High cognitive overhead, fragile timer registration, and difficult edge-case testing.
  - **Remediation:** Extract `scheduleAbandonmentTimer` and `syncTimerRegistries` into focused helper methods.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-013]** `MockRoomStore` Test Double Hardcodes Real Wall-Clock `Date.now()` Calls — [apps/server/src/features/rooms/mock_room.store.ts:48,64,97,170,186,197,210](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/mock_room.store.ts#L48-L210)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation)
  - **Description:** While production `InMemoryRoomStore` accepts an injectable `IClock`, `MockRoomStore` calls `Date.now()` directly in 7 places.
  - **Impact:** Mock-based unit tests cannot simulate time-travel or deterministic clock progressions.
  - **Remediation:** Add `clock?: IClock` to `MockRoomStore` constructor and replace all `Date.now()` calls with `this.clock.now()`.
  - **Fix workflow:** `/bugfix`

## Minor Issues
Code maintainability issues, function length/complexity violations, or minor test gaps. Fix in near term.

- [ ] **[MIN-001]** Silent empty catch in `ChessEngine.findKingSquare` drops check highlights silently — [apps/server/src/features/game/chess_engine.ts:328](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L328)
  - **Dimension:** B (Reliability & Error Handling)
  - **Remediation:** Add debug-level logging on FEN parse failure before returning null.
- [ ] **[MIN-002]** Silent empty catches in `static_handler.ts` absorb malformed URI decode errors without security logs — [apps/server/src/platform/http/static_handler.ts:52-63](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L52-L63)
  - **Dimension:** B (Reliability & Error Handling)
  - **Remediation:** Log warning on URI decode errors in path traversal check.
- [ ] **[MIN-003]** `emitWithTimeout` in client always resolves (never rejects), creating a footgun for callers — [apps/client/src/features/multiplayer/composables/useSocketTransport.ts:792-865](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L792-L865)
  - **Dimension:** B (Reliability & Error Handling)
  - **Remediation:** Add optional `rejectOnError?: boolean` parameter to `emitWithTimeout`.
- [ ] **[MIN-004]** `isOriginAllowed()` allows all origin-less requests unconditionally — [apps/server/src/platform/config/env.ts:168](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L168)
  - **Dimension:** A (Security & Configuration)
  - **Remediation:** Document accepted risk or add `REQUIRE_ORIGIN_HEADER` configuration option.
- [ ] **[MIN-005]** Content Security Policy includes `'unsafe-inline'` for `style-src` — [apps/server/src/platform/http/http_server.ts:39](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L39)
  - **Dimension:** A (Security & Configuration)
  - **Remediation:** Migrate runtime styles to scoped styles or document accepted risk in CSP constants.
- [ ] **[MIN-006]** Session token stored in browser `sessionStorage` (XSS accessible) — [apps/client/src/features/multiplayer/composables/room_session_state.ts:140](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/room_session_state.ts#L140)
  - **Dimension:** A (Security & Configuration)
  - **Remediation:** Document accepted risk given single-page app model and strict script-src CSP.
- [ ] **[MIN-007]** Health endpoints use generic `operation: "http_request"` in completion logs — [apps/server/src/platform/http/http_server.ts:274-303](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L274-L303)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Use distinct operation names like `"health_liveness"` and `"health_readiness"`.
- [ ] **[MIN-008]** HTTP rate-limit log missing `duration` / `durationMs` — [apps/server/src/platform/http/http_server.ts:352-388](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L352-L388)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Pass `startTime` into rate limit handler and include elapsed duration in log.
- [ ] **[MIN-009]** `resolveDistPath` uses module-level `defaultLogger` instead of injected logger — [apps/server/src/platform/http/http_server.ts:113-145](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L113-L145)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Pass injected `logger` into `resolveDistPath`.
- [ ] **[MIN-010]** `handleSocketDisconnect` missing `duration` and conditionally omits `correlationId` — [apps/server/src/features/rooms/room.socket_handler.ts:339-362](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L339-L362)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Ensure `correlationId` defaults to `randomUUID()` and include `durationMs`.
- [ ] **[MIN-011]** Abandonment forfeit log emits `playerId` for a `PieceColor` value — [apps/server/src/features/rooms/room.socket_handler.ts:316-324](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L316-L324)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Rename field to `winnerColor` and emit `disconnectedPlayerId`.
- [ ] **[MIN-012]** Socket CORS `allowRequest` rejections are completely silent — [apps/server/src/platform/socket/socket_server.ts:56-63](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_server.ts#L56-L63)
  - **Dimension:** D (Observability & Logging)
  - **Remediation:** Emit structured warning log before invoking callback with rejection.
- [ ] **[MIN-013]** Cross-boundary internal imports in HTTP and integration test helpers — [apps/server/src/platform/http/__tests__/http_server.spec.ts:9,13](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/__tests__/http_server.spec.ts#L9)
  - **Dimension:** C (Testability & Architecture)
  - **Remediation:** Import symbols through `features/rooms/index.js` and `features/lan/index.js`.
- [ ] **[MIN-014]** `RoomService` imports `MAX_ROOMS` constant from concrete adapter — [apps/server/src/features/rooms/room.service.ts:40](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L40)
  - **Dimension:** C (Testability & Architecture)
  - **Remediation:** Relocate `MAX_ROOMS` to `room.store.ts` interface contract.
- [ ] **[MIN-015]** Client composables (`useSocketTransport`, `useGameActions`) use module-level mutable singleton state — [apps/client/src/features/multiplayer/composables/useSocketTransport.ts:59-68](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L59-L68)
  - **Dimension:** C (Testability & Architecture)
  - **Remediation:** Expose `resetTransportState()` or migrate to Pinia stores.
- [ ] **[MIN-016]** Process-level singleton `defaultDisconnectTimerRegistry` shared across imports — [apps/server/src/features/rooms/disconnect_timer_registry.ts:76](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/disconnect_timer_registry.ts#L76)
  - **Dimension:** C (Testability & Architecture)
  - **Remediation:** Prefer explicit instantiation and injection in `index.ts`.
- [ ] **[MIN-017]** Redundant alias `SessionRegistry.findSessionByToken` vs `getSessionByToken` — [apps/server/src/features/rooms/session_registry.ts:59-65](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/session_registry.ts#L59-L65)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Remove `findSessionByToken` alias from interface and implementations.
- [ ] **[MIN-018]** Unused parameter `_sessionRegistry` in `registerGameSocketHandlers` — [apps/server/src/features/game/game.socket_handler.ts:41](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.socket_handler.ts#L41)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Remove dead parameter from signature and call sites.
- [ ] **[MIN-019]** Standalone relay helper functions construct unconfigured instances — [apps/server/src/features/lan/relay_address.service.ts:427-482](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/relay_address.service.ts#L427-L482)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Remove dead exported standalone helpers in favor of DI instance.
- [ ] **[MIN-020]** Duplicate composable properties (`legalMoves` vs `legalMovesForSelected`, `checkRequiresPromotion`) — [apps/client/src/composables/useChessGame.ts:77-79,224-226](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useChessGame.ts#L77-L226)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Standardize on `legalMoves` and `isPromotionMove`.
- [ ] **[MIN-021]** `App.vue` binds multiple aliased event names and redundant mode props (`currentMode` vs `currentAppMode`) — [apps/client/src/App.vue:98-102](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L98-L102) and [apps/client/src/components/layout/AppViewRouter.vue:22-23](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/AppViewRouter.vue#L22-L23)
  - **Dimension:** E (Code Quality & Patterns)
  - **Remediation:** Standardize on canonical event names and single `currentAppMode` prop.
- [ ] **[MIN-022]** `HttpServerConfig` has deprecated `lanService` field with no removal timeline — [apps/server/src/platform/http/http.interface.ts:54-57](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http.interface.ts#L54-L57)
  - **Dimension:** F (Integration Contracts & API Boundaries)
  - **Remediation:** Add deprecation version milestone and runtime warning.
- [ ] **[MIN-023]** `ServerEnvSchema` in `shared` underspecifies server environment properties — [shared/src/contracts/schemas.ts](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts)
  - **Dimension:** F (Integration Contracts & API Boundaries)
  - **Remediation:** Extend shared schema to match server env or document extension relationship.
- [ ] **[MIN-024]** `InboundPlayerLeftSchema` marks `playerName` optional while contract requires it — [apps/client/src/features/multiplayer/composables/useSocketTransport.ts:233-237](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L233-L237)
  - **Dimension:** F (Integration Contracts & API Boundaries)
  - **Remediation:** Document permissive schema rationale in inline comment.
- [ ] **[MIN-025]** `engines.node: ">=22.0.0"` is unbounded LTS — [package.json:31-32](file:///home/irahardianto/works/projects/fun-chess/package.json#L31-L32)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Remediation:** Bound to Node 22 LTS line (`"^22.0.0"`).
- [ ] **[MIN-026]** `InMemorySessionRegistry` unit tests lack coverage for `touchSession`, `updateSessionColor`, and `cleanupExpiredSessions` — [apps/server/src/features/rooms/__tests__/session_registry.spec.ts](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/__tests__/session_registry.spec.ts)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Remediation:** Add unit test cases for session sliding TTL, color update, and expiry pruning.
- [ ] **[MIN-027]** `LanInfoController` has only 1 happy-path test case — [apps/server/src/platform/http/controllers/__tests__/lan_info.controller.spec.ts](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/__tests__/lan_info.controller.spec.ts)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Remediation:** Add test cases for cloud relay mode and default port fallback.

## Enhancement Issues
Non-critical suggestions, defense-in-depth, documentation, or minor clarity refactorings.

- [ ] **[ENH-001]** Direct `process.env.LOG_LEVEL` read in `index.ts` fallback logger bypasses schema validation — [apps/server/src/index.ts:604](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L604) (Dim A)
- [ ] **[ENH-002]** Redundant `allowed === "*"` dead code check inside `isOriginAllowed()` — [apps/server/src/platform/config/env.ts:218](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L218) (Dim A)
- [ ] **[ENH-003]** `cleanupAbandonedRooms` lacks per-room try/catch error isolation — [apps/server/src/features/rooms/room.service.ts:566-587](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L566-L587) (Dim B)
- [ ] **[ENH-004]** No queue-depth circuit breaker for repeated lock timeouts on a single room — [apps/server/src/features/rooms/in_memory_room.store.ts:235+](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L235) (Dim B)
- [ ] **[ENH-005]** `socket.join()` / `leave()` errors inside feature handler not isolated from business state — [apps/server/src/features/rooms/room.socket_handler.ts:139+](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L139) (Dim B)
- [ ] **[ENH-006]** Client infinite reconnection attempts has no circuit breaker for permanent server outage — [apps/client/src/platform/socket/socket_client.ts:22-32](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/socket/socket_client.ts#L22-L32) (Dim B)
- [ ] **[ENH-007]** Test server helper duplicates production wiring logic — [apps/server/src/__tests__/integration/helpers/test_server.ts](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/__tests__/integration/helpers/test_server.ts) (Dim C)
- [ ] **[ENH-008]** HTTP rate-limit log missing optional `userId` field — [apps/server/src/platform/http/http_server.ts:362-370](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L362-L370) (Dim D)
- [ ] **[ENH-009]** Pino redact paths shallowly nested; `key` pattern undocumented — [apps/server/src/platform/logger/pino_logger.ts:8-35](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/logger/pino_logger.ts#L8-L35) (Dim D)
- [ ] **[ENH-010]** In-memory room store and session registry have no DEBUG-level mutation logging — [apps/server/src/features/rooms/in_memory_room.store.ts](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts) (Dim D)
- [ ] **[ENH-011]** `wrapSocketHandler` overloads increase cognitive load vs single options signature — [apps/server/src/platform/socket/socket_logging_middleware.ts:478-498](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L478-L498) (Dim E)
- [ ] **[ENH-012]** `useGameSessionSync` watchers use anonymous callbacks rather than named handlers — [apps/client/src/components/layout/composables/useGameSessionSync.ts:120-185](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/composables/useGameSessionSync.ts#L120-L185) (Dim E)
- [ ] **[ENH-013]** `InMemoryRoomStore.withLock` (~170 lines) warrants sub-function decomposition — [apps/server/src/features/rooms/in_memory_room.store.ts:235-406](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L235-L406) (Dim E)
- [ ] **[ENH-014]** `useAppNavigation` URL search param parsing duplicated — [apps/client/src/components/layout/composables/useAppNavigation.ts:58-107](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/composables/useAppNavigation.ts#L58-L107) (Dim E)
- [ ] **[ENH-015]** `room:reconnect` ack omits `sessionToken`, preventing symmetric token rotation — [shared/src/contracts/events.ts:178-190](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/events.ts#L178-L190) (Dim F)
- [ ] **[ENH-016]** `/api/health` server alias undocumented in client `IApiClient` — [apps/client/src/platform/api/api_client.interface.ts](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/api_client.interface.ts) (Dim F)
- [ ] **[ENH-017]** Missing contract integration tests for draw and rematch negotiation flows — [apps/server/src/__tests__/integration/contracts/socket_lifecycle.contract.spec.ts](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/__tests__/integration/contracts/socket_lifecycle.contract.spec.ts) (Dim F)
- [ ] **[ENH-018]** Add automated recurring `pnpm audit` CVE scanning to CI — CI workflow (Dim G)
- [ ] **[ENH-019]** Hoist `chess.js` to monorepo root `package.json` — monorepo manifests (Dim G)
- [ ] **[ENH-020]** Multiplayer modal interactions lack keyboard-only E2E navigation verification — [apps/e2e/ui/sync.e2e.test.ts](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/sync.e2e.test.ts) (Dim G)

## Verification Suite Results
- **Linter & Static Analysis:** PASS (`eslint . --no-inline-config --max-warnings 0`; 0 errors, 0 warnings)
- **Typecheck Verification:** PASS (`tsc --noEmit` across shared, server, client vue-tsc, e2e; 0 errors)
- **Automated Tests:** PASS (177/177 test files passed, 2,605/2,605 tests passed, 0 failed, 0 skipped)
  - Unit tests: 167 passed (2,493 tests)
  - Integration tests: 10 passed (112 tests)
- **Build Verification:** PASS (shared dist, server dist, client dist with PWA Workbox service worker generated)

## Cross-Dimension Correlations
Findings that span multiple dimensions, with escalated severity:
1. **Abandonment Forfeiture State Mutation (Escalated to CRITICAL):**
   - Convergence of Dimension B (F-01: Reliability - direct mutation + `save()` bypassing `mutate()` version conflict guard), Dimension C (ARCH-03: Architecture - bypassing pure transition in `room.logic.ts`), and Dimension D (OBS-009: Observability - zero operational logs on forfeit).
   - *Escalation:* Elevated from MAJOR to **CRITICAL [CRIT-001]** due to silent state divergence risk under concurrent reconnect races.
2. **Health Routes Security & Observability (Escalated to MAJOR):**
   - Convergence of Dimension A (SEC-002: Security - health routes bypass rate limiter; SEC-003: Security - telemetry exposed without auth) and Dimension D (OBS-001: Observability - generic operation names; OBS-013: Observability - `/healthz` probe log flooding).
   - *Escalation:* Elevated to **MAJOR [MAJ-002]** with prioritized HTTP routing reordering.
3. **GameService Lifecycle & Logging (Escalated to MAJOR):**
   - Convergence of Dimension C (ARCH-01: Architecture - concrete infrastructure self-wiring) and Dimension D (OBS-004 & OBS-014: Observability - missing logger parameter and zero domain logs).
   - *Escalation:* Elevated to **MAJOR [MAJ-003]** requiring constructor API expansion and structured logging.

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
1. **[CRIT-001]** Extract pure `abandonmentForfeitTransition` in `room.logic.ts` and use `this.store.mutate()` in `room.service.ts` → `/bugfix`
2. **[MAJ-001]** Sanitize and regex-validate `x-correlation-id` header in HTTP ingress → `/bugfix`
3. **[MAJ-002]** Reorder HTTP middleware so rate limiting precedes health routes, and restrict `/metrics` telemetry → `/bugfix`
4. **[MAJ-004]** Fix empty `catch` in disconnect grace period timer with structured error log → `/bugfix`
5. **[MAJ-003]** Inject `Logger` into `GameService` and eliminate concrete infrastructure self-wiring → `/refactor`
6. **[MAJ-005]** Add service-level structured logging to `RoomService` and eliminate default infrastructure self-wiring → `/refactor`
7. **[MAJ-006]** Fix cross-module internal import in `game.socket_handler.ts` by exporting via `rooms/index.ts` → `/bugfix`
8. **[MAJ-007]** Use `while` loop for `cancelledTickets` eviction and simplify `InMemoryRoomStore` constructor → `/refactor`
9. **[MAJ-008]** Align `room:player_disconnected` contract and eliminate dual-delivery socket events to creating socket → `/bugfix`
10. **[MAJ-009]** Consolidate room code uppercase normalization and player name validation → `/refactor`
11. **[MAJ-010]** Pin `@fun-chess/shared` and isolate `file_storage.spec.ts` disk tests into integration tier → `/refactor`
12. **[MAJ-011]** Add "Draw Offer Declined" user journey Playwright E2E test → `/bugfix`
13. **[MAJ-012]** Decompose `handleDisconnect` in `RoomService` to reduce cyclomatic complexity → `/refactor`
14. **[MAJ-013]** Inject `IClock` into `MockRoomStore` to remove wall-clock non-determinism in unit tests → `/bugfix`
