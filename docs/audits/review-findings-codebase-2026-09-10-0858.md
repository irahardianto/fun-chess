# Code Audit: Fun Chess Codebase
Date: 2026-09-10
Auditor: AI Code Audit (multi-dimensional, 7 parallel subagents)

## Executive Summary
- **Dimensions activated:** A (Security & Configuration), B (Reliability & Error Handling), C (Testability & Architecture), D (Observability & Operations Logging), E (Code Quality & Patterns), F (Integration Contracts & Storage), G (Dependencies & Test Coverage Gaps)
- **Dimensions skipped:** None (all 7 dimensions active across monorepo workspaces)
- **Files scanned:** 621 files across `shared/src/`, `apps/server/src/`, `apps/client/src/`, `apps/e2e/`, `infra/terraform/`, Docker, and CI configurations
- **Findings:** 54 total (3 Critical, 28 Major, 15 Minor, 8 Enhancement)
- **Automated verification:** Lint: PASS (0 errors, 0 warnings) | Typecheck: PASS (0 errors across 4 workspaces) | Unit Tests: PASS (169 files, 2,547 passed) | Integration Tests: PASS (10 files, 123 passed) | Total Tests: 2,670 passed, 0 failed | Build: PASS | Coverage: >95% statement/branch coverage
- **Overall codebase health:** NEEDS ATTENTION (The application maintains excellent unit/integration test coverage and zero lint errors, but possesses a fatal infrastructure configuration defect in Terraform Cloud Run causing an immediate container crash loop, broken Playwright E2E suites, and multi-dimensional convergence on silent error swallowing in session token creation).

---

## Critical Issues
Vulnerabilities or severe defects that cause active security breaches, data loss, immediate container crash loops, or application failure. Must be fixed immediately.

- [ ] **[CRIT-001] Terraform Cloud Run Service Omits Required Production Secrets (`SESSION_SECRET`, `METRICS_SECRET`) Causing Immediate Container Crash Loop** — [cloud_run.tf:29-48](file:///home/irahardianto/works/projects/fun-chess/infra/terraform/cloud_run.tf#L29-L48)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `configuration-management-principles.md` §Configuration Validation, `security-principles.md` §Secrets Management, `rugged-software-constitution.md` §Non-Negotiable Behaviors
  - **Description:** `apps/server/src/platform/config/env.ts` (lines 82-88) strictly enforces that `SESSION_SECRET` must be configured (with minimum 16 characters) whenever `NODE_ENV === "production"`, throwing a fatal validation exception during startup if absent. In `infra/terraform/cloud_run.tf`, `NODE_ENV` is set to `"production"`, but `SESSION_SECRET` and `METRICS_SECRET` are completely omitted from the `env` blocks passed to the Google Cloud Run container. Furthermore, `variables.tf` and `terraform.tfvars.example` do not declare or document `session_secret` or `metrics_secret` variables.
  - **Impact:** Any production deployment applied using the provided Terraform codebase will crash loop immediately upon launch (`Server configuration validation failed: SESSION_SECRET: SESSION_SECRET must be configured in production mode (MAJ-004)`), resulting in 100% deployment outage.
  - **Evidence:**
    ```hcl
    # infra/terraform/cloud_run.tf:29-47
    env {
      name  = "NODE_ENV"
      value = "production"
    }
    env {
      name  = "PUBLIC_URL"
      value = var.public_url
    }
    # SESSION_SECRET and METRICS_SECRET completely omitted
    ```
  - **Remediation:**
    1. In `infra/terraform/variables.tf`, declare `session_secret` and `metrics_secret` with `sensitive = true`.
    2. In `infra/terraform/cloud_run.tf`, pass `SESSION_SECRET` and `METRICS_SECRET` to the container environment (or integrate with Google Secret Manager via `secret_key_ref`).
    3. Update `infra/terraform/terraform.tfvars.example` to document both variables.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-002] Silent Exception Swallowing and Insecure Fallback in Session Token Generation** — [in_memory_session_registry.ts:77-81](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_session_registry.ts#L77-L81)
  - **Dimension:** A (Security & Configuration) & B (Reliability & Error Handling) — *Escalated to CRITICAL due to multi-dimension convergence*
  - **Rule Source:** `rugged-software-constitution.md` §Non-Negotiable Behaviors ("No silent failures. All failures must be observable. Empty catch blocks are rejected. Fail securely (closed)."), `error-handling-principles.md`
  - **Description:** When creating session tokens in `InMemorySessionRegistry.createSession()`, cryptographic signing via `generateSessionToken(rawId, this.sessionSecret)` is wrapped in an empty `try/catch` block that silently swallows any thrown exception and falls back to an un-signed raw UUID:
    ```typescript
    const rawId = this.idGenerator.generateId();
    let sessionToken = rawId;
    try {
      sessionToken = generateSessionToken(rawId, this.sessionSecret);
    } catch {
      sessionToken = rawId;
    }
    ```
    If `generateSessionToken` throws (e.g. invalid secret format, crypto failure, or system error), the failure is completely silenced with zero logging or metrics. The system fails open by issuing an un-signed token. Later, when the client attempts to reconnect or authenticate via `verifySessionToken()`, production mode rejects un-signed tokens (`allowUnsignedInDev: false`), causing reconnection to fail without any observable log indicating why the token was un-signed.
  - **Impact:** Masks cryptographic failures, issues degraded tokens, and breaks player reconnection in production with zero diagnostic trace.
  - **Remediation:** Remove the empty `catch` block and silent fallback. Log the error with full context and throw a domain error to fail closed.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-003] Disturbed Response Stream and Swallowed Error in `FetchApiClient.parseResponseBody`** — [fetch_api_client.ts:183-191](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L183-L191)
  - **Dimension:** B (Reliability & Error Handling) & G (Dependencies & Test Coverage Gaps) — *Escalated to CRITICAL due to multi-dimension convergence*
  - **Rule Source:** `error-handling-principles.md` (Swallowed errors and empty catch blocks: zero-tolerance policy), `rugged-software-constitution.md`
  - **Description:** In `FetchApiClient.parseResponseBody`, when `response.json()` throws (e.g. when an API gateway or reverse proxy returns an HTML 502/504 error page), the fallback handler attempts to read the response as raw text via `await (response as { text: () => Promise<string> }).text()`. In the Fetch standard, calling `.json()` consumes the stream (`bodyUsed = true`). The subsequent `.text()` call immediately throws `TypeError: Failed to execute 'text' on 'Response': body stream already read`. This secondary error is caught by an empty `catch { return null as T; }` block on line 187, swallowing the error and returning `null`.
  - **Impact:** Whenever an upstream proxy or gateway returns a non-JSON error response, callers receive `null` instead of the error payload or diagnostic response body. The underlying stream disturbance is hidden, making gateway errors impossible to diagnose in production.
  - **Remediation:** Either clone the response beforehand if dual consumption is required (`const clone = response.clone(); try { await response.json(); } catch { await clone.text(); }`), or read the body once as text and parse via `JSON.parse(text)`. Remove the empty catch block and log stream errors.
  - **Fix workflow:** `/bugfix` — immediate priority

---

## Major Issues
Structural violations, missing I/O error handling, untested critical paths, broken contracts, or high-severity quality/observability defects. Must be fixed before release.

- [ ] **[MAJ-001] E2E Test Suite Failure: Case-Sensitive HTML Assertion and Normalization Traversal Failure in Static API Specs** — [static.api.spec.ts:19-68](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/api/static.api.spec.ts#L19-L68)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` §E2E Tests
  - **Description:** Running `pnpm --filter @fun-chess/e2e run test:api` fails 4 tests in `apps/e2e/api/static.api.spec.ts`:
    1. Lines 19, 42, 55 assert `expect(body).toContain('<!DOCTYPE html>')` using case-sensitive matching, but the SPA serves standard lowercase `<!doctype html>`.
    2. Line 68 tests directory traversal blocking with `/%2e%2e/%2e%2e/package.json` expecting 403 Forbidden. However, Playwright's HTTP client and the standard WHATWG URL parser normalize `%2e%2e` into `/package.json` before emitting the request, returning HTTP 404 instead of 403.
  - **Impact:** The automated E2E gate fails unconditionally on CI, blocking verified deployments.
  - **Remediation:** Use case-insensitive RegExp matching (`expect(body).toMatch(/<!doctype html>/i)`) and use non-normalizing raw socket requests or distinct traversal sequences for traversal tests.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-002] E2E Suite Failure: Mobile Viewport CSS Hides Turn Indicator Causing Timeout in Mobile Chrome E2E Suite** — [PlayerBadge.vue:244-246](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/hud/PlayerBadge.vue#L244-L246), [pwa.e2e.test.ts:124](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/pwa.e2e.test.ts#L124)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` §E2E Tests
  - **Description:** In `PlayerBadge.vue`, `@media (max-width: 480px)` sets `display: none` for `.turn-badge--active`. In `apps/e2e/ui/pwa.e2e.test.ts` and `ai.e2e.test.ts`, tests locate `.bottom-player-section [data-testid="turn-badge-active"]` and assert visibility. Under the `mobile-chrome` Playwright project (viewport width 393px), the element is hidden by CSS, causing the runner to time out after 15 seconds and fail.
  - **Impact:** The entire `mobile-chrome` E2E test project fails.
  - **Remediation:** Update the E2E locator to check a responsive-safe attribute (`.player-badge.is-turn` or `aria-current`), or retain a compact turn indicator on mobile screens in `PlayerBadge.vue`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-003] Severed Reconnect State Rehydration Due to Contract & Event Dual-Delivery Elimination (`room:reconnected`)** — [room.socket_handler.ts:304-312](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L304-L312), [useGameActions.ts:255](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useGameActions.ts#L255)
  - **Dimension:** F (Integration Contracts & Storage)
  - **Rule Source:** `api-design-principles.md` (Event-Driven APIs & Contract Integrity)
  - **Description:** In `room.socket_handler.ts`, emitting the `room:reconnected` socket event to the reconnecting client was eliminated under refactor `MAJ-025`. However, `shared/src/contracts/events.ts` still defines `room:reconnected`, and client `useGameActions.ts:255` listens for `room:reconnected` specifically to re-hydrate pending `drawOfferedBy` and `rematchRequestedBy` states. Because the server no longer emits this event and `useRoomSession.ts:503-516` processes the ack without notifying game actions, pending draw offers and rematch requests are dropped from the client UI upon reconnecting.
  - **Impact:** Broken reconnect contract; reconnecting players lose incoming draw offer and rematch dialogs.
  - **Remediation:** Either restore `socket.emit("room:reconnected", ...)` before returning the ack callback, or trigger `useGameActions` rehydration directly from `useRoomSession` upon processing the ack payload.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-004] Inappropriate ERROR Log Levels for Expected Client Domain/Validation Errors in Service Operations** — [game.service.ts:409-418](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L409-L418), [room.service.ts:214-223](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L214-L223)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md`, `logging-implementation` skill
  - **Description:** `GameService` and `RoomService` catch blocks log domain exceptions at `this.logger.error()` before rethrowing. This includes expected 4xx client errors (`RoomNotFoundError` 404, `GameNotActiveError` 400, `PlayerNotFoundError` 404, `RoomFullError` 409, `InvalidPayloadError` 400). When rethrown, transport ingress middleware (`wrapSocketHandler`) catches them and correctly logs them as `logger.warn()`. Every expected client validation error produces duplicate failure logs: first an `ERROR` in the service, then a `WARN` in the transport layer.
  - **Impact:** False-positive SRE alerting on `level="error"` whenever users enter invalid room codes or make moves on ended games.
  - **Remediation:** Remove redundant catch-and-log blocks in service layers (letting transport middleware handle logging), or restrict `logger.error` strictly to unexpected 500-level errors while logging expected client rejections at `warn` or `info`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-005] Direct `process.env` Reads and Hardcoded Development Secret Fallback in `InMemorySessionRegistry`** — [in_memory_session_registry.ts:34-45](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_session_registry.ts#L34-L45)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `configuration-management-principles.md` §Separation of Configuration and Code, `architectural-pattern.md` (Rule 1 & Rule 3)
  - **Description:** `InMemorySessionRegistry` accesses `process.env.SESSION_SECRET` and `process.env.NODE_ENV` directly. If initialized without arguments in production, lines 34-45 fall back to a publicly known hardcoded secret string `"default-fun-chess-dev-secret-key-32b"`. It logs an error but does not halt startup, allowing token forging.
  - **Impact:** Circumvents centralized configuration validation and risks token forgery if instantiated without explicit secrets.
  - **Remediation:** Remove direct `process.env` reads. Require `sessionSecret` and `isProduction` as required constructor arguments injected from the composition root.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-006] Potential Prototype Pollution During Compact Progress Decoding in `DefaultDictionaryMapper.fromCompact`** — [dictionary_mapper.ts:219-237](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/dictionary_mapper.ts#L219-L237)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `security-principles.md` §Input Validation & Sanitization, `rugged-software-constitution.md`
  - **Description:** When decoding compact progress payloads from untrusted QR codes or import files, `DefaultDictionaryMapper.fromCompact` unpacks scenario tuples into plain object dictionaries initialized as `{}` without filtering prototype keys (`__proto__`, `constructor`, `prototype`). Because `fromCompact()` runs before schema validation, a crafted QR payload can pollute prototype properties during expansion.
  - **Impact:** Prototype pollution or unexpected mutation during untrusted progress import.
  - **Remediation:** Initialize dictionaries with `Object.create(null)` or filter keys against a forbidden key set (`__proto__`, `constructor`, `prototype`).
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-007] Missing Session Token Forwarding in Mid-Game Socket Actions (Transport Coupling / Player Impersonation Risk)** — [schemas.ts:343-404](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L343-L404), [game.service.ts:890-897](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L890-L897)
  - **Dimension:** F (Integration Contracts & Storage)
  - **Rule Source:** `api-design-principles.md` (Authentication Context), `security-mandate.md`
  - **Description:** Mid-game action schemas (`MakeMoveRequestSchema`, `ResignRequestSchema`, `OfferDrawRequestSchema`, etc.) only accept `roomCode` and move data. Neither the schema nor the client payload includes the HMAC `sessionToken`. The server authenticates callers exclusively via `room.*Player?.socketId === socketId`. If a socket reconnects with a new socket ID before `room:reconnect` re-associates the player, mid-game actions fail with `PlayerNotInRoomError`.
  - **Impact:** Fragile transport coupling and inability to cryptographically verify player actions mid-game.
  - **Remediation:** Extend game action schemas to accept an optional `sessionToken`, forward it from client session state, and verify it on the server.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-008] Unmapped HTTP Method in Client API Adapter (`apiClient.post` Calling Non-Existent Server Endpoints)** — [api_client.interface.ts:48](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/api_client.interface.ts#L48), [http_router.ts:285-389](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_router.ts#L285-L389)
  - **Dimension:** F (Integration Contracts & Storage)
  - **Rule Source:** `api-design-principles.md`, `architectural-pattern.md` (Rule 1)
  - **Description:** `IApiClient` defines and `FetchApiClient` implements a generic `post<T>()` method, but `http_router.ts` registers zero `POST` routes. Calling `apiClient.post` against the server unconditionally fails with a 404 response.
  - **Impact:** Misleading API contract creating false assumptions of REST POST support.
  - **Remediation:** Remove `post<T>` from `IApiClient` or document that the server currently only exposes GET queries via HTTP while mutations use WebSockets.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-009] REST API Success Envelope and Path Versioning Omission on `/api/lan-info`** — [lan_info.controller.ts:18](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/lan_info.controller.ts#L18), [http_router.ts:366-376](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_router.ts#L366-L376)
  - **Dimension:** F (Integration Contracts & Storage)
  - **Rule Source:** `api-design-principles.md` (URL Versioning, Response Envelope)
  - **Description:** `/api/lan-info` violates project REST conventions by omitting the `/v1/` prefix and returning naked JSON payloads rather than the standard `{ data: ... }` envelope.
  - **Impact:** Inconsistent API design and backwards-incompatible contract evolution.
  - **Remediation:** Expose `/api/v1/lan-info` (with legacy redirect) and wrap the response in the standard `{ data: LanInfoResponse }` envelope.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-010] Context Correlation ID Dropped in Scheduled Background Job `room_cleanup`** — [index.ts:301-305](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L301-L305), [room.service.ts:835-865](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L835-L865)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md` (Mandatory context: correlationId)
  - **Description:** `runLoggedJob(logger, "room_cleanup", ...)` generates a `correlationId` and passes it to its callback `(correlationId: string) => Promise<T>`. In `index.ts`, the callback defines zero arguments (`async () =>`), discarding the `correlationId`. Consequently, downstream store deletions, session cleanups, and failure logs execute with `correlationId = undefined`.
  - **Impact:** Disconnects store mutations and cleanup failure logs from the background job execution run in telemetry.
  - **Remediation:** Pass `jobCorrelationId` from `runLoggedJob` to `roomService.cleanupAbandonedRooms(10 * 60 * 1000, jobCorrelationId)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-011] Correlation ID Dropped in Disconnect Grace Period Forfeiture Background Job** — [room.service.ts:587-628](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L587-L628)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `logging-and-observability-mandate.md`
  - **Description:** In `scheduleAbandonmentTimer`, `this.handleAbandonmentForfeit(roomCode, playerId)` is called inside `runLoggedJob` without passing `jobCorrelationId`. Store mutations, CAS locks, and forfeiture logs execute with `correlationId = undefined`.
  - **Impact:** Permanent game-ending state transitions lack correlation IDs in audit logs.
  - **Remediation:** Pass `jobCorrelationId` to `handleAbandonmentForfeit(roomCode, playerId, jobCorrelationId)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-012] Inverted Layer Dependency: Feature Business Composable Imports UI Component Layout** — [useGameActions.ts:60](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useGameActions.ts#L60)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 3: Dependency Direction), `code-organization-principles.md`
  - **Description:** `useGameActions` directly imports and invokes the UI presentation layer's `useNotification` from `@/components/layout` to display toast messages when a draw offer is declined.
  - **Impact:** Inverts dependency direction (UI → Business Logic). Core domain game action logic cannot be tested in headless environments or reused without pulling in UI layout components.
  - **Remediation:** Emit an event or inject an optional notification interface contract (`onDrawOfferDeclined?: () => void`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-013] Production Code Branching on Test Double via `instanceof`** — [relay_address.service.ts:390](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/relay_address.service.ts#L390)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1 & Rule 3), `testability-patterns` skill
  - **Description:** In `RelayAddressService.getAddressingInfo`, production business logic checks `instanceof StaticNetworkInterfaceProvider` (a test mock class) to alter how network interfaces are filtered in cloud relay mode.
  - **Impact:** Leaks test implementation details into production code and violates interface polymorphism.
  - **Remediation:** Replace the `instanceof` check with an explicit configuration flag `suppressCloudInterfaces?: boolean` in `RelayAddressConfig`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-014] Direct Runtime Timer Calls in Core Feature Services Without Timer Abstraction** — [room.service.ts:587](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L587), [usePuzzleRushTimer.ts:44](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleRushTimer.ts#L44)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation)
  - **Description:** `RoomService`, `usePuzzleRushTimer`, and `useSocketTransport` invoke native `setTimeout`/`setInterval` directly rather than scheduling through an abstract `ITimerService` or clock interface.
  - **Impact:** Unit tests cannot control time progression deterministically without relying on global test framework timers, creating timer handle leak risks.
  - **Remediation:** Abstract timer scheduling into `ITimerService` and inject alongside `IClock`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-015] Direct Unabstracted Browser/DOM I/O in Feature Composables and Components** — [QrCodeModal.vue:88-92](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/QrCodeModal.vue#L88-L92), [useNetworkStatus.ts:26](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/pwa/composables/useNetworkStatus.ts#L26)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation)
  - **Description:** Client features directly query global browser APIs (`window.location`, `window.matchMedia`, `navigator.onLine`) without isolating them behind platform adapter contracts.
  - **Impact:** Breaks component and composable execution in non-browser environments and requires stubbing global window properties in tests.
  - **Remediation:** Abstract browser APIs into platform capability contracts (`ILocationProvider`, `INetworkMonitor`) and inject via Vue DI.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-016] Non-Deterministic Time I/O and System Calls Embedded in Pure Domain Logic** — [room.logic.ts:69](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.logic.ts#L69), [progress_merger.ts:267](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_merger.ts#L267)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 2: Pure Business Logic)
  - **Description:** Pure domain state transition and transformation functions fall back to calling `Date.now()` when an optional timestamp argument is omitted (`room.logic.ts:69`, `progress_merger.ts:267`, `game_over.ts:92`, `progress_codec.ts:295`).
  - **Impact:** Pure logic functions become non-deterministic; identical inputs at different times produce differing outputs.
  - **Remediation:** Remove `Date.now()` fallbacks from pure functions; require `now: number` as a mandatory parameter supplied by the caller.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-017] Impure Randomness and Wall-Clock Benchmarking in AI Engine and Blunder Generator** — [minimax_engine.ts:57](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/engine/minimax_engine.ts#L57), [blunder_generator.ts:27](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/engine/blunder_generator.ts#L27)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 1 & Rule 2)
  - **Description:** The Chess AI minimax engine calls `performance.now()` directly for search deadlines and `blunder_generator.ts` defaults to `Math.random()`.
  - **Impact:** AI search results and blunder evaluations are non-deterministic and cannot be replayed reliably in unit tests.
  - **Remediation:** Inject `IClock` and a seeded PRNG into `MinimaxEngine` and blunder functions.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-018] Cross-Feature Circular Dependency in Test Suites (`rooms` ↔ `game`)** — [concurrency.spec.ts:5](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/__tests__/concurrency.spec.ts#L5)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `code-organization-principles.md` (Avoid Circular Dependencies)
  - **Description:** `features/game/game.service.ts` imports from `features/rooms`, while `features/rooms/__tests__/concurrency.spec.ts` imports directly from `features/game/game.service.js`.
  - **Impact:** Creates a bidirectional feature dependency between `rooms` and `game`.
  - **Remediation:** Relocate `concurrency.spec.ts` from `features/rooms/__tests__/` to `apps/server/src/__tests__/integration/`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-019] Cross-Module Boundary Violations: Deep Internal Imports Bypassing Public APIs** — [apps/client/src/components/arena/index.ts:1-2](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/arena/index.ts#L1-L2)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `code-organization-principles.md` (Module Boundaries)
  - **Description:** Multiple modules and features import internal private files of other modules (e.g. `@/features/multiplayer/MultiplayerArena.vue`, `@/components/layout/composables`, `@/components/base/BaseButton.vue`) rather than consuming public barrel `index.ts` files.
  - **Impact:** Breaks encapsulation and risks breaking consuming modules during internal directory refactors.
  - **Remediation:** Re-export all necessary symbols in each module's public `index.ts` and import solely from module barrels.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-020] Module-Level Mutable Singletons Bypassing Dependency Injection** — [room_session_state.ts:31-36](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/room_session_state.ts#L31-L36), [useSocketTransport.ts:62-69](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L62-L69)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 3)
  - **Description:** Multiple stores, transports, and state registries are declared as module-level singletons or global mutable refs, requiring custom reset hooks (`resetRoomSessionState`, `resetSocketState`).
  - **Impact:** Shared mutable state causes cross-test leakage when tests run in parallel.
  - **Remediation:** Wire state and stores at the composition root using Vue DI (`provide`/`inject`) or factory-scoped instances.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-021] Misclassified Integration Test Running as Unit Test and Excluded from Integration Test Suite** — [server_lifecycle.integration.spec.ts:21](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/__tests__/server_lifecycle.integration.spec.ts#L21)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` §Test Pyramid
  - **Description:** `apps/server/src/__tests__/server_lifecycle.integration.spec.ts` starts real Node HTTP servers and socket connections. However, it is located outside `src/__tests__/integration/`, so it is excluded from `pnpm run test:integration` and executed during `pnpm run test:unit`.
  - **Impact:** Slower unit test suite and server lifecycle integration verification missing from integration test runs.
  - **Remediation:** Move the test file into `apps/server/src/__tests__/integration/`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-022] Missing Integration Test for Client Socket Adapter Against Live Socket.io Server** — [socket_client.ts:60](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/socket/socket_client.ts#L60)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `architectural-pattern.md` (Rule 1), `testing-strategy.md`
  - **Description:** `SocketClient` is only tested with unit mocks in `socket_client.spec.ts`, lacking real loopback WebSocket/polling integration verification against an actual Socket.io server instance.
  - **Impact:** Real transport negotiation or option mismatches can slip through unit testing undetected.
  - **Remediation:** Add `apps/client/src/platform/socket/__tests__/socket_client.integration.spec.ts` testing connection handshakes and event delivery over real sockets.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MAJ-023] God Composable Violating Single Responsibility and Complexity Ceilings in `useProgressSync`** — [useProgressSync.ts:80-465](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useProgressSync.ts#L80-L465)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md` (CC < 10, 10–50 lines), `core-design-principles.md` (SRP)
  - **Description:** `useProgressSync` spans 385 lines with a cyclomatic complexity of 47, orchestrating loading progress, schema validation, Base64URL encoding, file downloads, QR generation, diffing, and modals.
  - **Impact:** Fragile portability logic; impossible to test export or import sub-flows in isolation.
  - **Remediation:** Decompose into `useProgressExport`, `useProgressImport`, and a lean coordinator.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-024] Monolithic Game Loop Composable in `usePuzzleRunner` Violating Complexity Ceilings** — [usePuzzleRunner.ts:43-395](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleRunner.ts#L43-L395)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md` (CC < 10, 10–50 lines), `core-design-principles.md` (SRP)
  - **Description:** `usePuzzleRunner` spans 353 lines with a cyclomatic complexity of 54, managing game state, move legality recalculation, sound triggers, streak tracking, and auto-bot responses.
  - **Impact:** High cognitive load and cascading UI state breakage during timing or validation changes.
  - **Remediation:** Extract move execution into a dedicated `usePuzzleMoveExecution` sub-composable.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-025] Multi-Responsibility God Middleware in `wrapSocketHandler`** — [socket_logging_middleware.ts:723-902](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L723-L902)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md`, `core-design-principles.md` (SRP)
  - **Description:** `wrapSocketHandler` spans 179 lines with 5 overloaded positional parameters and a cyclomatic complexity of 31, performing IP extraction, rate limiting, logging, validation, and ack formatting.
  - **Impact:** Changes to logging or rate limiting risk breaking validation across all endpoints.
  - **Remediation:** Refactor into a clean functional pipeline (`pipe(withLogging, withRateLimit, withValidation, handler)`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-026] Overgrown Interactive Scenario Coordinator in `useScenarioRunner`** — [useScenarioRunner.ts:39-332](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/composables/useScenarioRunner.ts#L39-L332)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md`, `core-design-principles.md`
  - **Description:** `useScenarioRunner` spans 293 lines with a cyclomatic complexity of 44, intermixing FEN state, tutorial transitions, animations, and bot responses.
  - **Impact:** High complexity leads to fragile state transitions during tutorial steps.
  - **Remediation:** Extract move legality and bot responses into dedicated pure functions and sub-composables.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-027] Monolithic Server Bootstrap Source File Violating Vertical Slicing Limits** — [index.ts:1-846](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L1-L846)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md`, `core-design-principles.md`
  - **Description:** `apps/server/src/index.ts` spans 846 lines bundling config parsing, domain services, socket gateway, HTTP layer, lifecycle hooks, and cleanup crons inline inside one file.
  - **Impact:** Testing bootstrap requires importing an 846-line file with multiple mixed side effects.
  - **Remediation:** Extract setup functions into `apps/server/src/bootstrap/` modules (`domain_services.ts`, `socket_gateway.ts`, `http_layer.ts`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-028] Duplicated 3-Line Error Serialization Pattern in 14 Production Files Bypassing Shared `serializeError`** — [socket_logging_middleware.ts:280-285](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L280-L285)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `core-design-principles.md` (DRY threshold — Rule of Three)
  - **Description:** The exact ternary pattern `error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { raw: err }` is duplicated across 14 production files instead of consuming `@fun-chess/shared`'s `serializeError`.
  - **Impact:** Inconsistent error serialization across logs; updates must be duplicated in 14 files.
  - **Remediation:** Replace all 14 blocks with `error: serializeError(err)`.
  - **Fix workflow:** `/refactor`

---

## Minor Issues
Code maintainability issues, minor pattern inconsistencies, function length violations, or minor test coverage gaps. Fix in near term.

- [ ] **[MIN-001] Plaintext Local Terraform State Storage Without Remote State Locking** — [main.tf:1-16](file:///home/irahardianto/works/projects/fun-chess/infra/terraform/main.tf#L1-L16)
  - **Dimension:** A | **Remediation:** Configure a remote GCS backend with versioning and CMEK encryption. | **Fix workflow:** `/workflow-solo`
- [ ] **[MIN-002] Missing `SESSION_SECRET` Pre-configuration Documentation in `docker-compose.yml`** — [docker-compose.yml:13-23](file:///home/irahardianto/works/projects/fun-chess/docker-compose.yml#L13-L23)
  - **Dimension:** A | **Remediation:** Add inline documentation or local fallback secret in docker compose. | **Fix workflow:** Direct edit
- [ ] **[MIN-003] Contradicted Documentation & Empty Catch Block in `ChessEngine.findKingSquare`** — [chess_engine.ts:310-316](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L310-L316)
  - **Dimension:** B | **Remediation:** Log caught FEN parsing errors or remove misleading docstring. | **Fix workflow:** Direct edit
- [ ] **[MIN-004] Swallowed Parser Exception in `ChessEngine.validateMove`** — [chess_engine.ts:54-60](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L54-L60)
  - **Dimension:** B | **Remediation:** Capture error reason and return detailed message. | **Fix workflow:** Direct edit
- [ ] **[MIN-005] Hanging Connection Risk on Mid-Stream Dispatch Error in `HttpRouter`** — [http_router.ts:436-439](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_router.ts#L436-L439)
  - **Dimension:** B | **Remediation:** Call `res.destroy()` if `res.headersSent && !res.writableEnded`. | **Fix workflow:** Direct edit
- [ ] **[MIN-006] Swallowed Errors in Puzzle Material Evaluation and Pedagogical Explanations** — [material_delta.ts:41](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/eval/material_delta.ts#L41), [rules_of_thumb.ts:168](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/pedagogy/rules_of_thumb.ts#L168)
  - **Dimension:** B | **Remediation:** Replace empty catch blocks with structured debug logging. | **Fix workflow:** Direct edit
- [ ] **[MIN-007] Swallowed FEN & Move Exceptions in Puzzle Analysis Engines** — [puzzle_validator.ts:35](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_validator.ts#L35), [puzzle_analysis_engine.ts:83](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts#L83)
  - **Dimension:** B | **Remediation:** Return explicit error descriptors rather than dropping errors. | **Fix workflow:** Direct edit
- [ ] **[MIN-008] Discarded Move Simulation Errors in Scenario Engine & False "Fork" Classification** — [scenario_validator.ts:66](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/engine/scenario_validator.ts#L66), [theme_detector.ts:265](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/tactics/theme_detector.ts#L265)
  - **Dimension:** B | **Remediation:** Return `'unknown'` or `'invalid'` theme when FEN parsing fails. | **Fix workflow:** Direct edit
- [ ] **[MIN-009] Lock Bypass in `InMemoryRoomStore.save()` Allowing Unserialized Mutations** — [in_memory_room.store.ts:289-300](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L289-L300)
  - **Dimension:** F | **Remediation:** Enforce active lock ticket check or require explicit unlocked flag. | **Fix workflow:** `/bugfix`
- [ ] **[MIN-010] Contract Drift: Server Mandates Fields Optional in Shared Contract (`LanInfoResponse`)** — [relay_address.service.ts:8-15](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/relay_address.service.ts#L8-L15)
  - **Dimension:** F | **Remediation:** Align `LanInfoResponseSchema` in `@fun-chess/shared` as single source of truth. | **Fix workflow:** Direct edit
- [ ] **[MIN-011] Fragmented Storage Keys: Feature Modules Hardcode Storage Keys** — [useLanDiscovery.ts:12](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/useLanDiscovery.ts#L12), [puzzle_progress.store.ts:13](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/puzzle_progress.store.ts#L13)
  - **Dimension:** F | **Remediation:** Import keys from `STORAGE_KEYS` registry. | **Fix workflow:** Direct edit
- [ ] **[MIN-012] Lack of Schema Versioning in Scenario Progress Storage** — [local_storage_progress.store.ts:92-120](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/store/local_storage_progress.store.ts#L92-L120)
  - **Dimension:** F | **Remediation:** Wrap persisted payload in versioned envelope. | **Fix workflow:** Direct edit
- [ ] **[MIN-013] Unstructured `console.warn` in Server Environment Validation** — [env.ts:76-81](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L76-L81)
  - **Dimension:** D | **Remediation:** Emit structured JSON record to stderr. | **Fix workflow:** Direct edit
- [ ] **[MIN-014] HTTP Request Operation Name Inconsistency Between Entry and Success Logs** — [http_router.ts:163](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_router.ts#L163)
  - **Dimension:** D | **Remediation:** Standardize operation naming across request lifecycle. | **Fix workflow:** Direct edit
- [ ] **[MIN-015] Floating and Wildcard Workspace Dependency Versions in Manifests** — [apps/client/package.json:20](file:///home/irahardianto/works/projects/fun-chess/apps/client/package.json#L20), [apps/e2e/package.json:19](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/package.json#L19)
  - **Dimension:** G | **Remediation:** Pin exact workspace version `"workspace:1.0.0"`. | **Fix workflow:** Direct edit

---

## Enhancement Issues
Non-critical suggestions, defense-in-depth, documentation additions, or minor code clarity refactorings.

- [ ] **[ENH-001] Rate Limiting for Non-Existent Static Path Probing (404 Probing Defense-in-Depth)** — [http_helpers.ts:474-484](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_helpers.ts#L474-L484)
  - **Dimension:** A | **Suggestion:** Throttle 404 responses to mitigate automated vulnerability path scanning. | **Fix workflow:** `/workflow-solo`
- [ ] **[ENH-002] Stateless Token Expiration Timestamp in Session Token Format** — [session_token.ts:40-60](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/session_token.ts#L40-L60)
  - **Dimension:** A | **Suggestion:** Embed issuance/expiration timestamp in token signature preimage (`${uuid}.${expiresAt}.${signature}`). | **Fix workflow:** `/workflow-solo`
- [ ] **[ENH-003] Missing `onScopeDispose` Scope Guard in `usePuzzleAnimationState`** — [usePuzzleAnimationState.ts:62-66](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleAnimationState.ts#L62-L66)
  - **Dimension:** B | **Suggestion:** Add `getCurrentScope()` and `onScopeDispose()` check alongside `onUnmounted`. | **Fix workflow:** Direct edit
- [ ] **[ENH-004] Historical Reliability Fixes Verified (MAJ-005, MAJ-006, MAJ-007, MIN-003, ENH-004)** — [index.ts:641](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L641)
  - **Dimension:** B | **Suggestion:** Maintain existing regression test suites. | **Fix workflow:** Verified
- [ ] **[ENH-005] Array In-Place Mutation with `.sort()` Instead of ES2023 `.toSorted()`** — [puzzle_catalog.ts:672](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/data/puzzle_catalog.ts#L672)
  - **Dimension:** E | **Suggestion:** Adopt native `arr.toSorted()`. | **Fix workflow:** Direct edit
- [ ] **[ENH-006] Missing JSDoc Documentation on Exported Public Symbols** — [schemas.ts:239](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L239)
  - **Dimension:** E | **Suggestion:** Add JSDoc annotations to exported public types and functions. | **Fix workflow:** Backlog
- [ ] **[ENH-007] Missing E2E User Journeys for Adaptive Ladder and Puzzle Rush Modes** — [puzzle.e2e.test.ts:15](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/puzzle.e2e.test.ts#L15)
  - **Dimension:** G | **Suggestion:** Add Playwright tests covering ladder rating climb and rapid puzzle rush loops. | **Fix workflow:** `/workflow-solo`
- [ ] **[ENH-008] Triplicated `SystemClock` and `MockClock` Implementations** — [system_clock.ts:9](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/system_clock.ts#L9)
  - **Dimension:** C | **Suggestion:** Consolidate on `@fun-chess/shared` canonical clock implementations. | **Fix workflow:** Direct edit

---

## Verification Suite Results
- **Linter & Static Analysis:** PASS (`eslint . --no-inline-config --max-warnings 0` returned exit code 0 with 0 errors and 0 warnings).
- **TypeScript Typecheck:** PASS (`pnpm run typecheck` across `@fun-chess/shared`, `@fun-chess/server`, `@fun-chess/client`, and `@fun-chess/e2e` returned exit code 0 with 0 type errors).
- **Automated Tests:** PASS (Unit: 169 test files, 2,547 tests passed; Integration: 10 test files, 123 tests passed. Total: 2,670 passed, 0 failed).
- **Build Verification:** PASS (`pnpm -r --if-present run build` succeeded across all monorepo packages, producing production bundles and PWA service worker).
- **Test Coverage:** PASS (>95% average statement and branch coverage across core packages).

---

## Cross-Dimension Correlations
Findings from multiple dimensions that converge on identical components or root causes, escalating severity:

1. **Cryptographic Token Creation & Error Silencing in Session Registry (`in_memory_session_registry.ts:77-81`):**
   - **Dimension A** flagged silent fallback to un-signed tokens and direct `process.env` access.
   - **Dimension B** flagged zero-tolerance empty catch block swallowing crypto exceptions.
   - *Escalation:* Severity escalated from **MAJOR to CRITICAL** (`[CRIT-002]`).
2. **HTTP API Client Response Body Consumption & Fallback (`fetch_api_client.ts:183-191`):**
   - **Dimension B** flagged disturbed `ReadableStream` lock and empty catch block.
   - **Dimension G** flagged unexercised fallback branch and non-silent failure violation.
   - *Escalation:* Severity escalated from **MAJOR to CRITICAL** (`[CRIT-003]`).
3. **Room Disconnect Abandonment Timer & Forfeiture Traceability (`room.service.ts:587`):**
   - **Dimension C** flagged unabstracted runtime `setTimeout` calls violating I/O isolation.
   - **Dimension D** flagged dropped correlation IDs during abandonment forfeiture job execution and logging.
   - *Resolution:* Captured as high-priority Major issues (`[MAJ-011]`, `[MAJ-014]`).
4. **Server Bootstrap File Monolith (`apps/server/src/index.ts`):**
   - **Dimension D** flagged dropped job correlation IDs in periodic room cleanup.
   - **Dimension E** flagged 846-line file length, mixing 8 distinct architectural layers.
   - *Resolution:* Captured as Major refactor (`[MAJ-010]`, `[MAJ-027]`).

---

## Dimensions Covered
| Dimension | Status | Files / Queries Examined |
|---|---|---|
| A. Security & Configuration | ✅ Checked | 58 files scanned for injection, XSS, SSRF, path traversal, IDOR, secrets in Terraform/git, startup env validation. |
| B. Reliability & Error Handling | ✅ Checked | 379 source files scanned for empty catch blocks, stream lifecycles, timer cleanup, and error recovery. |
| C. Testability & Architecture | ✅ Checked | 621 files scanned for I/O isolation, business logic purity, dependency direction, circular deps, and DI. |
| D. Observability & Logging | ✅ Checked | 42 key modules scanned for 3 mandatory log points, correlationId propagation, structured format, and log levels. |
| E. Code Quality & Patterns | ✅ Checked | 379 source files scanned for SRP, function length/complexity, DRY violations, and Vue/TypeScript idioms. |
| F. Integration Contracts & DB | ✅ Checked | 48 boundary adapters scanned for endpoint mapping, Socket.IO contracts, storage integrity, and schemas. |
| G. Dependencies & Tests | ✅ Checked | 67 files scanned for unused/unpinned dependencies, E2E failures, integration test boundaries, and coverage gaps. |

---

## Rules Applied
- `security-mandate.md` & `security-principles.md`
- `rugged-software-constitution.md`
- `error-handling-principles.md`
- `architectural-pattern.md` & `testability-patterns` skill
- `logging-and-observability-mandate.md` & `logging-implementation` skill
- `code-organization-principles.md` & `project-structure.md`
- `core-design-principles.md`
- `api-design-principles.md` & `database-design-principles.md`
- `dependency-management-principles.md` & `testing-strategy.md`

---

## Remediation Action Plan
Findings ranked by priority for resolution:

1. **[CRIT-001]** Declare and supply `SESSION_SECRET` and `METRICS_SECRET` in Terraform Cloud Run configuration to prevent immediate container crash loop → `/bugfix`
2. **[CRIT-002]** Remove silent fallback and empty catch block in `InMemorySessionRegistry.createSession()` (fail closed and log) → `/bugfix`
3. **[CRIT-003]** Fix disturbed stream reading and remove empty catch block in `FetchApiClient.parseResponseBody()` → `/bugfix`
4. **[MAJ-001]** Fix case-sensitive HTML assertion and WHATWG path traversal expectations in `static.api.spec.ts` → `/bugfix`
5. **[MAJ-002]** Resolve hidden turn indicator selector timeout under mobile viewport in `PlayerBadge.vue` / E2E tests → `/bugfix`
6. **[MAJ-003]** Re-establish `room:reconnected` state synchronization between server and client in `useRoomSession.ts` → `/bugfix`
7. **[MAJ-005]** Inject `sessionSecret` and `isProduction` into `InMemorySessionRegistry` rather than reading `process.env` directly → `/bugfix`
8. **[MAJ-006]** Protect `DefaultDictionaryMapper.fromCompact` against prototype pollution by filtering forbidden object keys → `/bugfix`
9. **[MAJ-010] & [MAJ-011]** Pass `jobCorrelationId` into `cleanupAbandonedRooms` and `handleAbandonmentForfeit` in `room.service.ts` → `/bugfix`
10. **[MAJ-021]** Move `server_lifecycle.integration.spec.ts` into `src/__tests__/integration/` so it runs in integration suites → `/bugfix`
11. **[MAJ-004]** Refactor domain service catch blocks to eliminate `ERROR` level logging on expected 4xx client validation errors → `/refactor`
12. **[MAJ-028]** Consolidate 14 duplicated error serialization ternary blocks to consume `@fun-chess/shared`'s `serializeError` → `/refactor`
13. **[MAJ-027]** Decompose monolithic 846-line `apps/server/src/index.ts` into dedicated modular bootstrap layers under `src/bootstrap/` → `/refactor`
14. **[MAJ-023], [MAJ-024], [MAJ-025], [MAJ-026]** Decompose high-complexity god composables and middleware (`useProgressSync`, `usePuzzleRunner`, `wrapSocketHandler`, `useScenarioRunner`) → `/refactor`
15. **[MAJ-012] - [MAJ-020]** Invert layer violations, abstract timers/DOM I/O, remove `Date.now()` fallbacks from pure domain logic, and eliminate module singletons → `/refactor`
16. **[MIN-001] - [MIN-015]** Address minor storage key fragmentation, lock assertions, API client contract alignment, and version pinning → `/bugfix` or direct edits
17. **[ENH-001] - [ENH-008]** Address enhancement backlog items including defense-in-depth rate limiting, stateless tokens, and Puzzle Rush E2E journeys → `/workflow-solo`
