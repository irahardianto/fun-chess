# Code Audit: Fun Chess Codebase
Date: 2026-09-10
Auditor: AI Code Audit (multi-dimensional, 7 parallel subagents)

## Executive Summary
- **Dimensions activated:** A (Security & Configuration), B (Reliability & Error Handling), C (Testability & Architecture), D (Observability & Logging), E (Code Quality & Patterns), F (Integration Contracts & Database), G (Dependencies & Test Coverage Gaps)
- **Dimensions skipped:** None (All 7 dimensions activated for comprehensive full-codebase coverage)
- **Files scanned:** 665+ files across all monorepo workspaces (`shared`, `apps/server`, `apps/client`, `apps/e2e`, `infra/terraform`)
- **Findings:** 67 total (3 critical, 22 major, 29 minor, 13 enhancement)
- **Automated verification:**
  - **Lint:** PASS (`eslint . --no-inline-config --max-warnings 0`, 0 errors, 0 warnings)
  - **Typecheck:** PASS (strict TypeScript / Vue compiler checks passed across all workspaces)
  - **Automated Tests:** PASS (2,732 passed, 0 failed across 184 test files: 2,588 unit + 144 integration)
  - **Build:** PASS (all packages built cleanly: `@fun-chess/shared`, `@fun-chess/server`, `@fun-chess/client`)
  - **Coverage:** Shared: 98.31% stmts / 91.47% branches | Server: 95.46% stmts / 88.14% branches | Client: 93.75% stmts / 85.15% branches
- **Overall codebase health:** **NEEDS ATTENTION** (High test pass rate and strong baseline coverage, but critical security secret fallbacks, rate limiting bypasses, Web Audio memory accumulation, contract type bypasses, and state management fragmentation require structured remediation)

---

## Critical Issues
Vulnerabilities or severe defects that cause active security breaches, data loss, or system failure. Must be fixed immediately.

- [ ] **[CRIT-001] Insecure Hardcoded Production Secrets Fallback in `docker-compose.yml`** — [`docker-compose.yml:28-30`](file:///home/irahardianto/works/projects/fun-chess/docker-compose.yml#L28-L30)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `security-mandate.md` § Secrets Management, `rugged-software-constitution.md` (Fail securely / closed)
  - **Description:** In `docker-compose.yml`, the service definition sets `NODE_ENV=production` while providing default fallback values for `SESSION_SECRET` (`dev-insecure-docker-compose-session-secret-min16chars`) and `METRICS_SECRET` (`dev-metrics-secret-min8chars`).
  - **Impact:** When deployed via Docker Compose without explicitly provisioning `SESSION_SECRET` in an external environment file, the server runs in `production` mode with a public, statically known HMAC signing key. An attacker can forge HMAC-SHA256 signed session tokens (`fun_chess_session`) for any arbitrary `playerId`, hijack active game rooms, impersonate participants, and bypass metrics authentication.
  - **Evidence:**
    ```yaml
    environment:
      - NODE_ENV=production
      - PORT=3000
      - CLIENT_URL=http://localhost:3000
      - PUBLIC_URL=http://localhost:3000
      - SESSION_SECRET=${SESSION_SECRET:-dev-insecure-docker-compose-session-secret-min16chars}
      - METRICS_SECRET=${METRICS_SECRET:-dev-metrics-secret-min8chars}
    ```
  - **Remediation:** Remove static fallbacks in production compose files. Use required variable expansion (e.g. `${SESSION_SECRET:?SESSION_SECRET must be set}`) or mandate an explicit `.env` file with strong randomly generated secrets.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-002] Multi-Boundary Contract Drift & Unchecked Type Bypasses on Room Capacity Error** — [`shared/src/contracts/errors.ts:4-21`](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/errors.ts#L4-L21), [`apps/server/src/features/rooms/room.errors.ts:86`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.errors.ts#L86), [`apps/server/src/platform/socket/socket_server.ts:67`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_server.ts#L67)
  - **Dimension:** E (Code Quality & Patterns) & F (Integration Contracts & Database) *(Escalated via Cross-Dimension Correlation)*
  - **Rule Source:** `api-design-principles.md` (Error response contracts), `typescript-idioms` (§Strict Mode), `rugged-software-constitution.md`
  - **Description:** `ERR_ROOM_CAPACITY_EXCEEDED` is missing from the shared contract `ErrorCode` union in `@fun-chess/shared`, forcing `room.errors.ts:86` to use `as unknown as ErrorCode` double casting. Concurrently, `socket_server.ts:67` rejects unauthorized socket handshakes with `callback(3 as unknown as string, false);`, forcing an integer code into an Engine.IO callback contract typed as `string | null | undefined`.
  - **Impact:** Subverts compile-time type safety across the server-client boundary. Clients performing exhaustive type matching on `SocketErrorPayload.code` or `ErrorCode` fail to recognize or handle room capacity rejections, and invalid callback signatures risk Socket.IO handshake crashes.
  - **Evidence:**
    ```typescript
    // apps/server/src/features/rooms/room.errors.ts:86
    super("ERR_ROOM_CAPACITY_EXCEEDED" as unknown as ErrorCode, `Maximum room capacity reached (${maxRooms})`, 429, { maxRooms });
    // apps/server/src/platform/socket/socket_server.ts:67
    callback(3 as unknown as string, false);
    ```
  - **Remediation:** Add `"ERR_ROOM_CAPACITY_EXCEEDED"` to `ErrorCode` in `shared/src/contracts/errors.ts`, remove the `as unknown as` double cast in `room.errors.ts`, and pass a valid string or error object to the Engine.IO callback in `socket_server.ts`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-003] Multi-Point Rate Limiting Bypass & Missing Router Defense Verification** — [`apps/server/src/platform/http/http_server.ts:153-157`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L153-L157), [`apps/server/src/platform/http/http_helpers.ts:490-493`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_helpers.ts#L490-L493), [`apps/server/src/platform/http/http_router.ts:79`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_router.ts#L79)
  - **Dimension:** A (Security & Configuration), F (Integration Contracts & Database), G (Dependencies & Test Coverage Gaps) *(Escalated via Cross-Dimension Correlation)*
  - **Rule Source:** `security-mandate.md`, `api-design-principles.md`, `rugged-software-constitution.md`
  - **Description:** `HttpRouter`'s `notFoundRateLimiter` defensive control is never instantiated in `createHttpServer`, leaving 404 scanning and probing completely unthrottled. Simultaneously, `handleRateLimitCheck` exempts the deprecated `/api/lan-info` redirect route but tracks and throttles the canonical `/api/v1/lan-info` endpoint used by the client. Neither file has a co-located unit test verifying rate limiting and routing dispatch.
  - **Impact:** Automated scanners probing non-existent paths bypass rate limiting, while legitimate clients querying LAN endpoints can be throttled with HTTP 429 under normal lobby polling.
  - **Evidence:**
    ```typescript
    // apps/server/src/platform/http/http_server.ts:153-157
    const router = new HttpRouter(controllers, { rateLimiter, roomCreateRateLimiter }); // notFoundRateLimiter missing!
    // apps/server/src/platform/http/http_helpers.ts:490
    if (pathname === "/healthz" || pathname === "/api/lan-info") { return false; } // Missing /api/v1/lan-info!
    ```
  - **Remediation:** Instantiate `notFoundRateLimiter` in `createHttpServer`, update `http_helpers.ts:490` to exempt `/api/v1/lan-info`, and add dedicated unit tests in `http_router.spec.ts` and `http_helpers.spec.ts`.
  - **Fix workflow:** `/bugfix` — immediate priority

---

## Major Issues
Structural violations, missing I/O error handling, untested critical paths, or broken contracts. Must be fixed before release.

- [ ] **[MAJ-001] Plaintext Secret Exposure in Terraform Cloud Run Environment & State** — [`infra/terraform/cloud_run.tf:49-57`](file:///home/irahardianto/works/projects/fun-chess/infra/terraform/cloud_run.tf#L49-L57)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `security-principles.md` § Secrets Management
  - **Description:** The Cloud Run Terraform configuration passes `var.session_secret` and `var.metrics_secret` directly as literal environment variables (`env { name = "..."; value = var... }`) instead of mounting them securely from Google Secret Manager (`secret_key_ref`).
  - **Impact:** Secrets are stored in plaintext within `terraform.tfstate`, Cloud Run revision manifests, Google Cloud Console UI, and `gcloud run services describe` API outputs, exposing operational credentials to any user/role with read-only Cloud Run inspection rights.
  - **Evidence:**
    ```hcl
    env { name = "SESSION_SECRET"; value = var.session_secret }
    env { name = "METRICS_SECRET"; value = var.metrics_secret }
    ```
  - **Remediation:** Store secrets in Google Secret Manager (`google_secret_manager_secret` and `google_secret_manager_secret_version`) and mount them into Cloud Run using `value_source { secret_key_ref { secret = ...; version = ... } }`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-002] Missing Ingress Connection Rate Limiting & Concurrency Throttling on WebSocket Handshakes** — [`apps/server/src/platform/socket/socket_server.ts:56-69`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_server.ts#L56-L69), [`apps/server/src/bootstrap/socket_gateway.ts:34-47`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/bootstrap/socket_gateway.ts#L34-L47)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `security-principles.md` § Rate Limiting & Resource Exhaustion
  - **Description:** While standard HTTP endpoints pass through `RateLimiter`, incoming Socket.IO connections (which initiate via HTTP Upgrade / polling requests at `/socket.io/`) bypass the HTTP router rate limiter entirely. The Socket.IO server's `allowRequest` hook only validates CORS origin, but does not consume IP rate-limiting quota or restrict concurrent open connections per client IP.
  - **Impact:** A malicious actor can establish thousands of concurrent WebSocket connections from a single IP, exhausting file descriptors, memory buffers, and event loop capacity, causing denial of service to legitimate players.
  - **Evidence:**
    ```typescript
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      // only checks origin whitelist; no IP rate limiting or concurrent socket count checks
      callback(null, true);
    }
    ```
  - **Remediation:** Enforce handshake rate limiting and concurrent connection caps per IP inside `allowRequest` or Socket.IO connection middleware (`io.use(...)`). Terminate excess connections with HTTP 429 or `SocketError`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-003] Overly Permissive Content Security Policy `connect-src` Allows Arbitrary External WebSockets** — [`apps/server/src/platform/http/http_helpers.ts:40-49`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_helpers.ts#L40-L49)
  - **Dimension:** A (Security & Configuration)
  - **Rule Source:** `security-principles.md` § Defense in Depth, Content Security Policy
  - **Description:** The Content Security Policy defines: `"connect-src 'self' ws: wss:;"`.
  - **Impact:** The wildcard schemes `ws:` and `wss:` allow the browser to initiate WebSocket connections to *any* external host on the internet. If an XSS vulnerability or malicious dependency is introduced into the client bundle, an attacker can exfiltrate player session tokens, room credentials, or game state directly to an external WebSocket server without CSP violation blocking.
  - **Evidence:**
    ```typescript
    "connect-src 'self' ws: wss:", // Wildcard ws/wss schemes
    ```
  - **Remediation:** Restrict `connect-src` to `'self'` and explicitly configured public domain origins rather than wildcard schemes `ws:` and `wss:`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-004] AudioNode Graph Memory Leak in `AudioSynthesizer` (Detached Oscillators & Gain Nodes Retained by Master Gain)** — [`apps/client/src/platform/audio/audio_synthesizer.ts:220-840`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/audio/audio_synthesizer.ts#L220-L840)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `resources-and-memory-management-principles.md` § Resource Lifecycle & Cleanup ("Always pair resource allocation with deallocation; dispose audio graph nodes")
  - **Description:** In `AudioSynthesizer`, each sound effect method (`playClick`, `playMove`, `playCapture`, `playCheck`, `playVictory`, `playDraw`, `playStart`, `playError`, `playStarEarned`, `playDefeat`) instantiates new transient `OscillatorNode` and `GainNode` objects, connecting them directly or indirectly to `this.masterGain`. While `osc.start()` and `osc.stop()` are called, `osc.disconnect()` and `gain.disconnect()` are never called once playback finishes.
  - **Impact:** Nodes connected to a reachable destination node in the audio rendering graph cannot be garbage collected even after playback ceases. Because `this.masterGain` is a long-lived singleton property, intermediate `GainNode` and `OscillatorNode` instances remain permanently retained. During extended chess games or rapid move sequences, hundreds or thousands of detached nodes accumulate, causing progressive client memory growth and audio thread stutter.
  - **Evidence:**
    ```typescript
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.035);
    // Missing osc.onended cleanup: osc.disconnect() and gain.disconnect() are NEVER called!
    ```
  - **Remediation:** Attach an `onended` event handler to every transient oscillator node (or schedule a disconnect timer) to disconnect both the oscillator and its dedicated gain node once playback finishes.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-005] Indefinite Promise Hang in `readProgressFile` Due to Missing `onabort` and Lack of I/O Timeout** — [`apps/client/src/features/portability/services/progress_file.service.ts:81-105`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/services/progress_file.service.ts#L81-L105)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `error-handling-principles.md` § Async Error Handling ("Always set timeouts on async operations")
  - **Description:** In `ProgressFileService.readProgressFile`, the `FileReader` fallback wraps asynchronous file reading in a `new Promise`. The implementation assigns `reader.onload` and `reader.onerror`, but completely omits `reader.onabort`, and does not wrap the read operation in a timeout or accept an `AbortSignal`.
  - **Impact:** If the file reading operation is aborted by user navigation, canceled by browser background tab suspension, or stalled on virtual file systems, the returned Promise will never settle. The caller remains stuck indefinitely in a loading spinner state with no error displayed to the user.
  - **Evidence:**
    ```typescript
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { ... };
      reader.onerror = () => { ... };
      // Missing reader.onabort and setTimeout timeout rejection!
      reader.readAsText(file);
    });
    ```
  - **Remediation:** Add `reader.onabort` rejecting with an `AbortError`, wrap the execution with a timeout timer (e.g. 10 seconds) that calls `reader.abort()` and rejects, ensuring the timer is cleared in `onload`, `onerror`, and `onabort`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-006] Swallowed Errors & Silent Catch Blocks Violating Zero-Tolerance Policy Across Core Domain & Utilities** — [`apps/server/src/platform/config/env.ts:31-33`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L31-L33), [`shared/src/utils/url.ts:48-50,67-69`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/url.ts#L48-L50), [`shared/src/utils/chess_factory.ts:114-116`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/chess_factory.ts#L114-L116), [`shared/src/utils/chess_evaluation.ts:266-268`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/chess_evaluation.ts#L266-L268), [`apps/client/src/features/puzzles/engine/puzzle_validator.ts:164-166`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_validator.ts#L164-L166)
  - **Dimension:** B (Reliability & Error Handling)
  - **Rule Source:** `rugged-software-constitution.md` ("No silent failures. All failures must be observable. Empty catch blocks are rejected."), `error-handling-principles.md`
  - **Description:** Multiple core files contain empty `catch { return ...; }` or empty catch blocks with zero logging or diagnostic instrumentation:
    1. `env.ts:31-33`: `safeParseUrl` swallows all exceptions from `new URL(val)`.
    2. `url.ts:48-50, 67-69`: `safeNormalizeUrl` and `safeParseUrl` swallow all URL parsing errors with empty `catch {}` blocks.
    3. `chess_factory.ts:114-116`: `isValidFen` catches all engine exceptions and returns `false` without logging.
    4. `chess_evaluation.ts:266-268`: `isPawnPromotion` catches engine board lookup errors with empty `catch { return false; }`.
    5. `puzzle_validator.ts:164-166`: `chess.move` failure in puzzle validation uses `catch { playerResult = null; }`.
  - **Impact:** When invalid data or engine parse errors occur, they fail completely silently, leaving developers and operators without diagnostic breadcrumbs to identify why URLs were rejected or moves failed.
  - **Remediation:** Remove empty catch blocks. If a fallback value is deliberate, log diagnostic context at `logger.debug` or `console.debug` so that failures remain observable.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-007] Multi-Dimension QR Scanner Vulnerability: Unhandled Mount Rejections & Untested E2E / Unit Flow** — [`apps/client/src/features/portability/components/QrScannerView.vue:35-43`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/components/QrScannerView.vue#L35-L43), [`apps/client/src/features/lobby/useLanDiscovery.ts:90,126`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/useLanDiscovery.ts#L90), [`apps/e2e/ui/sync.e2e.test.ts:46`](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/sync.e2e.test.ts#L46)
  - **Dimension:** B (Reliability & Error Handling) & G (Dependencies & Test Coverage Gaps) *(Escalated via Cross-Dimension Correlation)*
  - **Rule Source:** `error-handling-principles.md` § Async Error Handling, `testing-strategy.md` § Test Pyramid
  - **Description:** In `QrScannerView.vue`, `initCamera()` invokes `await startScanner(...)` fire-and-forget in `onMounted` without `.catch()`. If camera access throws (`NotAllowedError`, `NotFoundError`), an unhandled promise rejection is emitted. Furthermore, the Playwright E2E suite completely skips the camera QR scanner journey (testing only manual text fallback), and `QrScannerView.vue` unit coverage is only 71.7% (failing the 85% mandate).
  - **Impact:** Critical user journey regressions in camera permissions and QR decoding will not be caught by CI/CD, and permission errors can crash or freeze the client UI.
  - **Remediation:** Add `.catch()` handlers with reactive error states to `onMounted` in `QrScannerView` and `useLanDiscovery`. Add a Playwright E2E test with fake media stream device flags, and add unit tests to boost `QrScannerView.vue` coverage >85%.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-008] Multi-Dimension Timer Fragmentation & Untested Production Timer Adapter** — [`apps/server/src/platform/lifecycle/shutdown_coordinator.ts:7`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L7), [`apps/server/src/features/rooms/timer_service.ts:6-79`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/timer_service.ts#L6-L79), [`apps/client/src/features/puzzles/composables/usePuzzleRushTimer.ts:16-48`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/usePuzzleRushTimer.ts#L16-L48)
  - **Dimension:** C (Testability & Architecture) & G (Dependencies & Test Coverage Gaps) *(Escalated via Cross-Dimension Correlation)*
  - **Rule Source:** `architectural-pattern.md` (Rule 1: I/O Isolation, Rule 3: Dependency Direction), `testing-strategy.md`
  - **Description:** `ITimerService` is duplicated with diverging method signatures across server (`features/rooms`) and client (`features/puzzles`). Platform `ShutdownCoordinator` suffers an architectural layer inversion by importing `ITimerService` inward from `features/rooms`. Furthermore, the server's production adapter `SystemTimerService` has zero dedicated unit test coverage, and several client composables bypass `ITimerService` to call native `setTimeout` directly.
  - **Impact:** Inverts dependency direction, fragments time abstractions across packages, and leaves production timer unreferencing and cleanup paths unverified.
  - **Remediation:** Relocate canonical `ITimerService` and `TimerHandle` into `@fun-chess/shared/src/contracts/system.ts`. Move production `SystemTimerService` into `platform/time/`, write dedicated unit tests for all its methods, and inject it into `ShutdownCoordinator` and client composables.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-009] Pure Chess Engine Modules Import Telemetry Singleton and Emit Side-Effect Logs** — [`apps/client/src/features/scenarios/engine/scenario_validator.ts:4,68`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/engine/scenario_validator.ts#L4), [`apps/client/src/features/puzzles/engine/puzzle_validator.ts:22,37`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_validator.ts#L22), [`apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts:21`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_analysis_engine.ts#L21)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 2: Pure Business Logic, Rule 3: Dependency Direction), `logging-and-observability-mandate.md`
  - **Description:** Six core chess engine modules (`scenario_validator.ts`, `puzzle_validator.ts`, `puzzle_analysis_engine.ts`, `material_delta.ts`, `rules_of_thumb.ts`, `theme_detector.ts`) directly import the outer singleton `logger` from `@/platform/telemetry` and invoke `logger.debug()` inside calculations and validations.
  - **Impact:** Violates the pure business logic rule (input → output, zero I/O, zero side effects). Directly couples mathematical chess engines to runtime telemetry infrastructure.
  - **Remediation:** Remove all `logger` imports from `engine/` calculation and validation modules. Return structured validation outcomes (e.g., `{ valid: false, reason: string }`) and confine logging to operation entry points.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-010] Circular Dependency in Layout Component Barrel and Composables** — [`apps/client/src/components/layout/index.ts:22`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/index.ts#L22), [`apps/client/src/components/layout/composables/index.ts:6`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/composables/index.ts#L6), [`apps/client/src/components/layout/composables/useGameSessionSync.ts:8`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/composables/useGameSessionSync.ts#L8)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `code-organization-principles.md` ("Avoid Circular Dependencies")
  - **Description:** A circular module dependency exists within `apps/client/src/components/layout`: `components/layout/index.ts` → `components/layout/composables/index.ts` → `components/layout/composables/useGameSessionSync.ts` → `components/layout/index.ts`.
  - **Impact:** Creates module evaluation order hazards, risks runtime `undefined` bindings during component hydration, and degrades bundler chunk splitting.
  - **Remediation:** In `useGameSessionSync.ts`, import `AppAudioProvider` directly via relative path `import type { AppAudioProvider } from '../AppAudioProvider.vue'` or define a decoupled interface to break the barrel loop.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-011] Composition Root Incompleteness: Missing Dependency Injection Provision for Browser & Network Tokens** — [`apps/client/src/main.ts:56-71`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L56-L71), [`apps/client/src/platform/di/tokens.ts:25-26`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/di/tokens.ts#L25-L26)
  - **Dimension:** C (Testability & Architecture)
  - **Rule Source:** `architectural-pattern.md` (Rule 3: Dependency Direction / Wiring Pattern), `docs/project_conventions.md` §5.3
  - **Description:** `apps/client/src/main.ts` is the composition root that wires application dependencies via `app.provide(...)`. While tokens `LOCATION_PROVIDER_KEY`, `NETWORK_MONITOR_KEY`, and `TIMER_SERVICE_KEY` exist in `tokens.ts`, `main.ts` completely omits providing instances for them.
  - **Impact:** Any component or composable calling `inject(LOCATION_PROVIDER_KEY)` or `inject(NETWORK_MONITOR_KEY)` finds no root-provided implementation, falling back to uncoordinated local instantiations.
  - **Remediation:** In `createFunChessApp()` in `apps/client/src/main.ts`, provide `LOCATION_PROVIDER_KEY`, `NETWORK_MONITOR_KEY`, and `TIMER_SERVICE_KEY`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-012] Inappropriate `ERROR` Log Level for Expected Client Validation/Domain Errors in `GameService.makeMove` & Duplicated Logging** — [`apps/server/src/features/game/game.service.ts:414-430`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L414-L430), [`apps/server/src/features/rooms/room.service.ts:222-238`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L222-L238)
  - **Dimension:** D (Observability & Logging) & E (Code Quality & Patterns) *(Escalated via Cross-Dimension Correlation)*
  - **Rule Source:** `logging-and-observability-mandate.md`, `logging-implementation` skill, `core-design-principles.md` (DRY threshold)
  - **Description:** In `GameService.makeMove()`, the catch block only exempts `InvalidMoveError` and `NotYourTurnError`. For all other domain errors (such as `GameNotActiveError`, `RoomInactiveError`, or `UnauthorizedError`), it logs at `ERROR` level before rethrowing, triggering false-positive alerts for standard user mistakes. Furthermore, identical 20-line try/catch logging boilerplate is duplicated across 9 service methods in `RoomService` and `GameService`.
  - **Impact:** Elevated error noise in SRE alerting pipelines, and 180+ lines of duplicated logging boilerplate across backend services.
  - **Remediation:** Exempt all known domain `AppError` subclasses (`err instanceof AppError`) from `ERROR` logging in `GameService.makeMove`, and consolidate duplicated service try/catch logging into a reusable `executeServiceOperation` helper.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-013] Missing Readiness Probe Endpoint `/ready` & Missing Readiness Degradation during Graceful Shutdown** — [`apps/server/src/platform/http/http_helpers.ts:326-336`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_helpers.ts#L326-L336), [`apps/server/src/platform/http/controllers/health.controller.ts:123-166`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/health.controller.ts#L123-L166)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `monitoring-and-alerting-principles.md` § Health Checks ("Every service MUST expose two independent health endpoints: Liveness (`/health`) and Readiness (`/ready` — returns 200 when ready, 503 when not ready)")
  - **Description:** The HTTP server implements `/health` and static `/healthz`, but the mandated `/ready` readiness probe does not exist. Neither endpoint is wired to `ShutdownCoordinator`. When graceful shutdown begins (`isShuttingDown === true`), the server continues responding 200 OK, causing load balancers to route new connections to a terminating server instance.
  - **Impact:** Dropped connections and traffic failures during rolling deployments and zero-downtime restarts.
  - **Remediation:** Add an explicit `/ready` endpoint in `handleHealthRoutes()`, check `shutdownCoordinator.isShuttingDown`, and return HTTP 503 with `{ status: "terminating", ready: false }` when shutting down.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-014] Missing RED Method Metrics Instrumentation and OpenMetrics/Prometheus Exposition** — [`apps/server/src/platform/http/controllers/health.controller.ts:131-161`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/health.controller.ts#L131-L161), [`apps/server/src/platform/http/http_helpers.ts:337-365`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_helpers.ts#L337-L365)
  - **Dimension:** D (Observability & Logging)
  - **Rule Source:** `monitoring-and-alerting-principles.md` § Metrics ("Implement the RED method: Rate, Errors, Duration")
  - **Description:** While `/metrics` and `/health/detail` endpoints exist, they return custom JSON containing memory usage and active counts. There is no RED method instrumentation tracking request rates, 4xx/5xx error rates, or request latency percentiles, and output is not formatted as OpenMetrics / Prometheus text.
  - **Impact:** Production monitoring cannot calculate error rates, monitor service SLOs/SLIs, or scrape metrics using standard Prometheus collectors.
  - **Remediation:** Instrument the HTTP router and Socket.IO dispatcher with RED metrics tracking request rates, errors, and duration buckets, and expose standard Prometheus format on `/metrics`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-015] Disconnected Correlation IDs and Duplicate Error Logs in Scheduled Background Jobs** — [`apps/server/src/bootstrap/lifecycle.ts:47-53`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/bootstrap/lifecycle.ts#L47-L53), [`apps/server/src/features/rooms/room.service.ts:651-659`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L651-L659)
  - **Dimension:** D (Observability & Logging) & G (Dependencies & Test Coverage Gaps) *(Escalated via Cross-Dimension Correlation)*
  - **Rule Source:** `logging-and-observability-mandate.md` (Mandatory context: `correlationId` must trace across the operation lifecycle; no orphan correlation IDs)
  - **Description:** In `setupBackgroundJobs`, `runLoggedJob` already generates a `correlationId`, logs job initiation, and logs failure with duration. The enclosing `try/catch` in `lifecycle.ts` catches the rethrown error and calls `logger.error` using a newly minted `randomUUID()`, producing an orphan correlation ID dissociated from the job trace while omitting duration. A similar duplicate error log without `correlationId` occurs in `scheduleAbandonmentTimer`. Both catch blocks have 0 unit test coverage.
  - **Impact:** Confuses log tracing tools with two disconnected correlation IDs for a single failure, and doubles error metrics in alerting dashboards.
  - **Remediation:** Remove redundant outer error logs since `runLoggedJob` already guarantees error logging with full duration and context. Add unit tests for background job error paths.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-016] Unvalidated Raw JSON Imports Coerced to Domain Models via Double Type Casting** — [`apps/client/src/features/puzzles/data/puzzle_catalog.ts:23-42`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/data/puzzle_catalog.ts#L23-L42)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `typescript-idioms` (§Runtime Validation at Boundaries, §Parse, don't validate), `security-mandate.md`
  - **Description:** All 11 puzzle packs are imported directly from static JSON files and coerced into `readonly Puzzle[]` using `as unknown as Puzzle[]` without schema validation.
  - **Impact:** Subverts TypeScript guarantees at data boundaries. Corrupted or unmigrated puzzle JSON files bypass build checks and cause runtime crashes in puzzle arenas.
  - **Remediation:** Parse and validate imported JSON data using `PuzzleSchema` from `@fun-chess/shared` or create a typed validation loader function.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-017] Monolithic Files Violating Single Responsibility and Module Boundaries (>1000 lines)** — [`apps/server/src/features/rooms/room.service.ts:1-1118`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L1-L1118), [`apps/server/src/features/game/game.service.ts:1-1045`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L1-L1045), [`apps/server/src/platform/socket/socket_logging_middleware.ts:1-1043`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L1-L1043), [`apps/client/src/features/multiplayer/composables/useSocketTransport.ts:1-1024`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L1-L1024)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `code-organization-principles.md` (Module Boundaries & Single purpose), `core-design-principles.md` (SRP)
  - **Description:** Four core files exceed 1,000 lines, bundling multiple concerns together: `room.service.ts` (room orchestration + code generation + capacity checks + session persistence), `game.service.ts` (move execution + board validation + draw/rematch negotiation), `socket_logging_middleware.ts` (sanitization + rate limiting + validation + pipeline composition), and `useSocketTransport.ts` (socket lifecycle + reconnect backoff + ping latency + request/response wrapper).
  - **Impact:** High cognitive load, high blast radius for code modifications, merge conflicts during parallel development, and difficulty writing focused unit tests.
  - **Remediation:** Decompose monoliths into cohesive sub-modules: extract `room_code_generator.ts`, `rematch_coordinator.ts`, `draw_coordinator.ts`, `socket_pipeline.ts`, and `socket_request_client.ts`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-018] Client State Management Architectural Fragmentation (<80% Consistency and Zero Pinia Adoption)** — [`apps/client/src/features/`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `architectural-pattern.md` (Pattern Discovery Protocol: >80% consistency required), `vue-idioms` (§Pinia Stores)
  - **Description:** While `vue-idioms` mandates Pinia Setup Stores for state management, `pinia` is not installed, and state is fragmented across 4 disparate paradigms: OO repository classes, module-singleton reactive variables, per-instance composable state, and custom Vue provide/inject tokens.
  - **Impact:** Pattern consistency is below the mandatory 80% threshold. Testing requires disparate mocking strategies and developers lack a consistent blueprint for client state.
  - **Remediation:** Formally document an Architecture Decision Record (ADR) establishing composables + Repository classes as the standard state pattern (or install and adopt Pinia across features), standardizing testing doubles through Vue `provide`/`inject`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-019] Module-Singleton Testing Backdoors Circumventing Dependency Injection** — [`apps/client/src/features/pwa/composables/usePwaInstall.ts:24-38`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/pwa/composables/usePwaInstall.ts#L24-L38), [`apps/client/src/features/multiplayer/composables/useGameActions.ts:38-41`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useGameActions.ts#L38-L41), [`apps/client/src/features/multiplayer/composables/useSocketTransport.ts:26-29`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L26-L29)
  - **Dimension:** E (Code Quality & Patterns)
  - **Rule Source:** `architectural-pattern.md` Rule 1 & Rule 3, `core-design-principles.md`
  - **Description:** Multiple composables declare global mutable variables at module file scope along with exported setter functions (`setPwaInstallStorage`, `setGameActionsLogger`, `setSocketTransportLogger`) purely as backdoors for test injection, bypassing the project's DI container.
  - **Impact:** Tests running concurrently can overwrite these module singletons, causing flaky tests and test mock leakage into production code.
  - **Remediation:** Remove module-level setters. Inject dependencies via parameter objects with default fallbacks or via Vue's `inject()`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-020] Redundant Client Auto-Reconnect Loop Triggered by Sanitized `socketId`** — [`apps/client/src/features/multiplayer/composables/useRoomSession.ts:284-294`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useRoomSession.ts#L284-L294), [`apps/client/src/components/layout/composables/useGameSessionSync.ts:132-138`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/composables/useGameSessionSync.ts#L132-L138)
  - **Dimension:** F (Integration Contracts & Database)
  - **Rule Source:** `api-design-principles.md`, `data-serialization-and-interchange-principles.md`
  - **Description:** The server sanitizes public player objects before broadcasting by stripping out `socketId`. In `useRoomSession.ts:290`, `checkAndAutoReconnect()` evaluates `currentPlayer.value.socketId !== currentSockId`. Because `socketId` is undefined, this always evaluates to `true`, triggering redundant reconnect requests on every socket reconnection.
  - **Impact:** Generates redundant network traffic and socket RPC requests on every reconnect, and causes dead fallback logic in `useGameSessionSync.ts`.
  - **Remediation:** Remove `currentPlayer.value.socketId !== currentSockId` from `needsSync`, relying instead on player ID, session token, and room code.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-021] Missing E2E Test Coverage for Deep Linking / Direct URL Room Join (`/?join=XXXX`)** — [`apps/client/src/features/lobby/lobby_url_builder.ts:175`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/lobby_url_builder.ts#L175), [`apps/e2e/ui/multiplayer.e2e.test.ts:1`](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/multiplayer.e2e.test.ts#L1)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` § Test Pyramid ("E2E: Complete user journeys")
  - **Description:** The application generates direct join URLs with query parameters (`/?join=XXXX`) for QR codes and link sharing. However, no Playwright E2E test covers loading the application with a `?join=` query parameter to verify that the lobby automatically opens the join dialog with the code pre-filled.
  - **Impact:** Regressions in URL query parsing, route bootstrapping, or initial lobby tab state selection will break the primary viral onboarding journey when players scan a host's QR code.
  - **Remediation:** Add an E2E test in `apps/e2e/ui/multiplayer.e2e.test.ts` where the guest page navigates directly to `page.goto('/?join=' + roomCode)` and asserts that the room code is pre-filled and joinable.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MAJ-022] Untested Critical Lock Acquisition Timeout in In-Memory Room Store** — [`apps/server/src/features/rooms/in_memory_room.store.ts:425-432`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L425-L432)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Rule Source:** `testing-strategy.md` § Coverage Requirements, `architectural-pattern.md` Rule 1
  - **Description:** `InMemoryRoomStore.withLock()` implements a 5000ms acquisition timeout race to prevent deadlocks when a room queue is blocked. When the timeout expires, it tracks the cancelled ticket and logs `room_lock_acquire_timeout`. However, this acquisition timeout branch is completely unexercised in tests (lines 426-430 have 0 executions).
  - **Impact:** If lock queue starvation occurs in production, untested ticket cancellation and timeout rejection handling could corrupt lock queue state.
  - **Remediation:** Add a unit test in `in_memory_room.store.spec.ts` using a low `lockAcquireTimeoutMs` option that holds a lock indefinitely and asserts that a secondary caller waiting on the same room code rejects with `RoomLockTimeoutError("acquire")`.
  - **Fix workflow:** `/bugfix`

---

## Minor Issues
Code maintainability issues, function length/complexity violations, or minor test gaps. Fix in near term.

- [ ] **[MIN-001] Environment Schema Divergence Between `@fun-chess/shared` and Server `ServerEnvSchema`** — [`shared/src/contracts/schemas.ts:614-652`](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L614-L652), [`apps/server/src/platform/config/env.ts:36-73`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L36-L73)
  - **Dimension:** A (Security & Configuration)
  - **Description:** `BaseServerEnvSchema` in `@fun-chess/shared` omits `TRUST_PROXY`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, and `RATE_LIMIT_ROOM_CREATE_MAX`. The server defines its own extension schema in `env.ts`.
  - **Remediation:** Centralize all server environment variable definitions in `@fun-chess/shared`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-002] Rigid CORS Origin Parsing Can Fail Valid Origins with Port/Path Variations** — [`apps/server/src/platform/config/env.ts:162-167`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L162-L167)
  - **Dimension:** A (Security & Configuration)
  - **Description:** `CORS_ORIGIN` splits by comma and only strips trailing slashes (`replace(/\/+$/, '')`). If configured with explicit ports (e.g. `:443`), incoming browser `Origin` headers will fail string equality checks.
  - **Remediation:** Normalize each comma-separated entry in `CORS_ORIGIN` using `new URL().origin`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-003] Static Asset 404 Route Traversal Bypasses Ingress Rate Limiting** — [`apps/server/src/platform/http/http_helpers.ts:494-503`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_helpers.ts#L494-L503)
  - **Dimension:** A (Security & Configuration)
  - **Description:** Non-API requests that fail static file lookup bypass the rate limiter, allowing high-frequency 404 flooding on disk lookups.
  - **Remediation:** Deduct rate limit tokens or enforce limits on non-API 404 misses.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-004] Dangling Module-Scoped Timeout in `useNotification` Composable** — [`apps/client/src/components/layout/composables/useNotification.ts:27`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/composables/useNotification.ts#L27)
  - **Dimension:** B (Reliability & Error Handling)
  - **Description:** `activeTimer` is declared at module scope without automatic component unmount or effect scope disposal cleanup.
  - **Remediation:** Add `tryOnScopeDispose` / `onScopeDispose` to clear `activeTimer` automatically on unmount.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-005] Incomplete Domain Event Contract Implementation Between `useAudio` and `useMultiplayer`** — [`apps/client/src/composables/useAudio.ts:21-25`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useAudio.ts#L21-L25), [`apps/client/src/features/multiplayer/composables/useMultiplayer.ts:100`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useMultiplayer.ts#L100)
  - **Dimension:** B (Reliability & Error Handling)
  - **Description:** `useAudio.ts` expects `onOpponentMove`, `onGameCheck`, and `onGameOver`. `useMultiplayer` only exposes `onOpponentMove`, leaving check and game-over audio playback to secondary reactive watchers.
  - **Remediation:** Implement `onGameCheck` and `onGameOver` in `useMultiplayer` to satisfy `GameDomainEventSource`.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MIN-006] Missing Error Cause Chaining in `ProgressCodec` JSON Parsing** — [`shared/src/utils/progress_codec.ts:270-273`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_codec.ts#L270-L273)
  - **Dimension:** B (Reliability & Error Handling)
  - **Description:** In `ProgressCodec.decodeFromBase64Gzip`, `JSON.parse` failures are caught and wrapped in a new `Error`, but the underlying `SyntaxError` and stack trace are discarded.
  - **Remediation:** Pass caught error as `{ cause: err }` when rethrowing.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-007] Code Duplication & Layer Boundary Violation: Network Monitor Re-implemented in PWA Feature** — [`apps/client/src/features/pwa/composables/useNetworkStatus.ts:13-83`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/pwa/composables/useNetworkStatus.ts#L13-L83)
  - **Dimension:** C (Testability & Architecture)
  - **Description:** `BrowserNetworkMonitor` and `MockNetworkMonitor` are re-implemented line-for-line in `useNetworkStatus.ts` rather than imported from `@/platform/browser`.
  - **Remediation:** Delete redundant class definitions and import from `@/platform/browser`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-008] Public API Barrel Bypass in Client Composables & Test Suites** — [`apps/client/src/composables/index.ts:20`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/index.ts#L20), [`apps/client/src/__tests__/deep_interaction_verification.spec.ts:3-14`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/__tests__/deep_interaction_verification.spec.ts#L3-L14)
  - **Dimension:** C (Testability & Architecture)
  - **Description:** `composables/index.ts` bypasses `features/lobby/index.ts` to export directly from internal files, and test files import deep internal paths across features instead of targeting public barrels.
  - **Remediation:** Route exports and test imports through feature `index.ts` public APIs.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-009] Direct Browser DOM and Media Query Coupling in `useTheme` and `lobby_url_builder`** — [`apps/client/src/components/layout/composables/useTheme.ts:50,83`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/layout/composables/useTheme.ts#L50), [`apps/client/src/features/lobby/lobby_url_builder.ts:25-30`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/lobby_url_builder.ts#L25-L30)
  - **Dimension:** C (Testability & Architecture)
  - **Description:** `useTheme.ts` accesses `window.matchMedia` and `document.documentElement` directly. `lobby_url_builder.ts` directly queries `window.location` rather than consuming `ILocationProvider`.
  - **Remediation:** Pass `ILocationProvider` to `lobby_url_builder` and abstract media queries behind a theme provider contract.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-010] Non-Deterministic Module Evaluation Side Effects and Mutable Top-Level State** — [`apps/client/src/features/puzzles/store/puzzle_progress.store.ts:26-38`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/puzzle_progress.store.ts#L26-L38), [`apps/client/src/main.ts:38`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/main.ts#L38)
  - **Dimension:** C (Testability & Architecture)
  - **Description:** `DEFAULT_PUZZLE_PROGRESS` calls `Date.now()` at top-level module load time, exporting a mutable object. `main.ts` executes storage migration at module evaluation time.
  - **Remediation:** Replace `DEFAULT_PUZZLE_PROGRESS` with a factory function `createDefaultPuzzleProgress(clock?: IClock)`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-011] Triplicated SystemClock and Missing Canonical Re-export** — [`apps/server/src/platform/time/clock.ts:9`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/time/clock.ts#L9), [`apps/client/src/platform/time/clock.ts:9`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/time/clock.ts#L9)
  - **Dimension:** C (Testability & Architecture)
  - **Description:** `SystemClock` is redundantly re-implemented in server and client rather than re-exporting canonical `SystemClock` from `@fun-chess/shared`.
  - **Remediation:** Re-export `SystemClock` directly from `@fun-chess/shared`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-012] Operation Name Inconsistency between HTTP Request Entry and Completion Logs** — [`apps/server/src/platform/http/http_router.ts:174-182`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_router.ts#L174-L182), [`apps/server/src/platform/http/http_helpers.ts:563`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_helpers.ts#L563)
  - **Dimension:** D (Observability & Logging)
  - **Description:** `HttpRouter` logs request entry with static `operation: "http_request"`, while completion logs specify distinct operation names (`lan_info`, `health_liveness`), making correlation by operation name fail in log dashboards.
  - **Remediation:** Standardize operation taxonomy with a consistent `operation: "http_request"` and `route: "lan_info"` sub-operation tag.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-013] Missing Operation Start Logging in Domain Service Mutators** — [`apps/server/src/features/rooms/room.service.ts:132-221`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L132-L221), [`apps/server/src/features/game/game.service.ts:442`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L442)
  - **Dimension:** D (Observability & Logging)
  - **Description:** Mutating domain methods (`createRoom`, `resign`, `offerDraw`, `requestRematch`) omit operation start logging, emitting only completion and failure logs.
  - **Remediation:** Add entry logging with `{ operation, correlationId, roomCode, playerId }` to all mutating domain service methods.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-014] Client-Side Socket Connection Lifecycle Events Lack `correlationId`** — [`apps/client/src/features/multiplayer/composables/useSocketTransport.ts:122-196`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L122-L196)
  - **Dimension:** D (Observability & Logging)
  - **Description:** Connection lifecycle logs (`socket_connect`, `socket_disconnect`, `socket_connect_error`, `socket_reconnect_attempt`) lack a `correlationId`.
  - **Remediation:** Generate a connection session UUID when initializing connections and include `correlationId` in all socket lifecycle events.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-015] Missing `correlationId` in `createHttpServer` Deprecation Warning and Fatal Bootstrap Log Missing `duration`** — [`apps/server/src/platform/http/http_server.ts:94-97`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L94-L97), [`apps/server/src/index.ts:25-29`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L25-L29)
  - **Dimension:** D (Observability & Logging)
  - **Description:** `lanService` deprecation warning lacks `correlationId`, and `server_bootstrap_fatal` omits duration since process launch.
  - **Remediation:** Pass bootstrap correlation ID to `createHttpServer` and calculate elapsed duration in fatal startup error handler.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-016] High Cyclomatic Complexity Across Algorithmic and Lifecycle Logic (125 functions > 10)** — [`apps/client/src/features/ai/engine/minimax_engine.ts:231`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/engine/minimax_engine.ts#L231), [`apps/client/src/features/portability/composables/useCameraStream.ts:109`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/composables/useCameraStream.ts#L109)
  - **Dimension:** E (Code Quality & Patterns)
  - **Description:** 125 functions exceed cyclomatic complexity 10. `minimax` (complexity 30, 128 lines), `startStream` (complexity 27, 129 lines), and `migrateStorageV1ToV2` (complexity 23, 169 lines) carry extreme branching density.
  - **Remediation:** Refactor complex functions into lookup tables, strategy handlers, or decomposed helper functions.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-017] Pervasive Unsafe Type Casting of Chess Board Squares (25+ call sites)** — [`apps/client/src/features/puzzles/engine/puzzle_validator.ts:32`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_validator.ts#L32), [`useScenarioMoveExecution.ts:98`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/composables/useScenarioMoveExecution.ts#L98)
  - **Dimension:** E (Code Quality & Patterns)
  - **Description:** Over 25 call sites employ double casting `from as unknown as import('chess.js').Square` or `sq as unknown as ChessSquare` to satisfy TypeScript when invoking `chess.js` methods.
  - **Remediation:** Reconcile `@fun-chess/shared`'s `Square` type directly with `chess.js`'s `Square`, export a runtime type guard `isSquare(val: unknown): val is Square`, and eliminate double casting.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-018] Vue Single-File Component Template Bloat Exceeding 100-Line Threshold (8 components)** — [`apps/client/src/features/lobby/QrCodeModal.vue:247-497`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/QrCodeModal.vue#L247-L497), [`PuzzleRushArena.vue:176-352`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/components/PuzzleRushArena.vue#L176-L352)
  - **Dimension:** E (Code Quality & Patterns)
  - **Description:** 8 Vue components have templates that significantly exceed the 100-line threshold. `QrCodeModal.vue` has 217 template lines housing 5 distinct UI concerns.
  - **Remediation:** Extract sub-components (e.g. `QrCodeCanvas.vue` and `LanConfigSection.vue`) for discrete UI concerns.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-019] Orphaned Dead Code and Re-Export Wrapper Shims** — [`apps/client/src/components/arena/MultiplayerArena.vue:1-5`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/arena/MultiplayerArena.vue#L1-L5), [`apps/client/src/components/AppViewRouter.vue`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/AppViewRouter.vue)
  - **Dimension:** E (Code Quality & Patterns)
  - **Description:** `apps/client/src/components/arena/` contains an Options API shim that re-exports `@/features/multiplayer` with 0 consumers in the repository. `apps/client/src/components/AppViewRouter.vue` is a redundant 5-line wrapper.
  - **Remediation:** Delete orphaned directory `apps/client/src/components/arena/` and redundant wrapper `AppViewRouter.vue`.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-020] Cryptic Single-Letter Variable Naming in High-Traffic Flows (`s`, `p`)** — [`apps/client/src/features/multiplayer/composables/useRoomSession.ts:362`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useRoomSession.ts#L362), [`fetch_api_client.ts:333`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L333)
  - **Dimension:** E (Code Quality & Patterns)
  - **Description:** Critical domain variables in `useRoomSession.ts` (`s = transport.socket.value`), `fetch_api_client.ts` (`p = { ...raw }`), and `puzzle_catalog.ts` (`p = ctx.puzzle`) use cryptic single-letter identifiers.
  - **Remediation:** Rename variables to descriptive identifiers (`socketInstance`, `lanPayload`, `activePuzzle`).
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-021] Unsafe Lazy Proxy Type Assertion in Configuration Loader (`{} as ServerEnv`)** — [`apps/server/src/platform/config/env.ts:242`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L242)
  - **Dimension:** E (Code Quality & Patterns)
  - **Description:** `env.ts` instantiates a lazy proxy using `new Proxy({} as ServerEnv, { ... })`. Casting `{}` to `ServerEnv` causes operations like `Object.keys(env)` to return empty arrays.
  - **Remediation:** Implement proxy traps for `ownKeys` and `getOwnPropertyDescriptor`, or export `getServerEnv(): ServerEnv`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-022] Missing CORS Preflight Allowance for Identity Telemetry Headers (`X-User-ID`, `X-Player-ID`)** — [`apps/server/src/platform/http/http_helpers.ts:220-222`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_helpers.ts#L220-L222)
  - **Dimension:** F (Integration Contracts & Database)
  - **Description:** `extractHttpUserId()` parses `x-user-id` and `x-player-id`, but `applyCorsHeaders()` omits them from `Access-Control-Allow-Headers`, causing browser CORS preflight failures on cross-origin telemetry requests.
  - **Remediation:** Add `X-User-ID, X-Player-ID` to `Access-Control-Allow-Headers`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-023] Non-Uniform Response Envelope and Unversioned Route on Health Endpoint (`/api/health`)** — [`apps/server/src/platform/http/controllers/health.controller.ts:123-129`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/controllers/health.controller.ts#L123-L129)
  - **Dimension:** F (Integration Contracts & Database)
  - **Description:** While `/api/v1/lan-info` uses the uniform envelope format `{ data: LanAddressingInfo }`, `/api/health` returns an unversioned naked object `{ status: "ok", ... }`.
  - **Remediation:** Provide `/api/v1/health` with a standard `{ data: ... }` envelope, retaining `/healthz` for raw infrastructure probes.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-024] Inconsistent Error Envelope Content-Types in Static File Server** — [`apps/server/src/platform/http/static_handler.ts:161,176,203`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L161)
  - **Dimension:** F (Integration Contracts & Database)
  - **Description:** In `static_handler.ts`, 404 returns structured JSON `errorEnvelope`, whereas 403 and 500 return raw `text/plain`.
  - **Remediation:** Standardize 403 and 500 to return `HttpErrorEnvelope` consistently.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-025] Missing Integration Test Runner Target for Client Adapters in `vitest.config.ts`** — [`vitest.config.ts:7`](file:///home/irahardianto/works/projects/fun-chess/vitest.config.ts#L7), [`package.json:22`](file:///home/irahardianto/works/projects/fun-chess/package.json#L22)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Description:** Root `vitest.config.ts` restricts `test:integration` to `apps/server/src/__tests__/integration/**/*.spec.ts`, excluding client integration tests from `pnpm test:integration`.
  - **Remediation:** Update `vitest.config.ts` to include `apps/client/src/**/__tests__/**/*.integration.spec.ts`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-026] Dead & Untested `InvalidSessionError` Class in Server Room Errors** — [`apps/server/src/features/rooms/room.errors.ts:131-139`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.errors.ts#L131-L139)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Description:** `InvalidSessionError` is documented in `api_contracts.md:255` but never thrown in production code and has 0 test coverage.
  - **Remediation:** Adopt in session verification middleware or remove dead class.
  - **Fix workflow:** `/refactor`

- [ ] **[MIN-027] Unexercised `PlayerNotInRoomError` in Pure `leaveRoomTransition` Logic** — [`apps/server/src/features/rooms/room.logic.ts:258`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.logic.ts#L258)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Description:** `leaveRoomTransition` throws `PlayerNotInRoomError` when a leaving player is not found, but this branch is never exercised in `room.logic.spec.ts`.
  - **Remediation:** Add unit test asserting `PlayerNotInRoomError` when a non-member player leaves.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-028] Inconsistent `engines` Field Across Workspace Packages: Missing in `shared/package.json`** — [`shared/package.json:1-34`](file:///home/irahardianto/works/projects/fun-chess/shared/package.json#L1-L34)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Description:** All other 4 package manifests define `"engines": { "node": ">=22.0.0", "pnpm": ">=9.0.0" }`, but `shared/package.json` omits it.
  - **Remediation:** Add explicit `engines` block to `shared/package.json`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MIN-029] Missing Co-located Unit Test for `storage_alert.ts`** — [`apps/client/src/platform/storage/storage_alert.ts:1-77`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/storage_alert.ts#L1-L77)
  - **Dimension:** G (Dependencies & Test Coverage Gaps)
  - **Description:** `storage_alert.ts` implements quota error detection and alert dispatching but lacks a co-located `storage_alert.spec.ts`.
  - **Remediation:** Create unit test testing `isQuotaExceededError` across browsers and verifying event dispatching.
  - **Fix workflow:** `/bugfix`

---

## Enhancement Issues
Non-critical suggestions, defense-in-depth, documentation, or minor clarity refactorings.

- [ ] **[ENH-001] Strict-Transport-Security Header Omitted When `x-forwarded-proto` is Multi-Valued** — [`apps/server/src/platform/http/http_helpers.ts:186`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_helpers.ts#L186) (Dim A)
- [ ] **[ENH-002] Content Security Policy Missing `report-uri` / `report-to` for Violation Monitoring** — [`apps/server/src/platform/http/http_helpers.ts:40-49`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_helpers.ts#L40-L49) (Dim A)
- [ ] **[ENH-003] Missing Max File Size Guard in `readProgressFile` Prior to In-Memory Buffering** — [`apps/client/src/features/portability/services/progress_file.service.ts:50-70`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/services/progress_file.service.ts#L50-L70) (Dim B)
- [ ] **[ENH-004] Leaked Browser DOM Type in Platform Audio Interface Contract (`initContext(): AudioContext`)** — [`apps/client/src/platform/audio/audio.interface.ts:47`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/audio/audio.interface.ts#L47) (Dim C)
- [ ] **[ENH-005] Unabstracted Filesystem Probing Fallback in HTTP Dist Directory Resolver** — [`apps/server/src/platform/http/http_helpers.ts:159`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_helpers.ts#L159) (Dim C)
- [ ] **[ENH-006] Missing Standardized `duration` Field Alias in `createInboundHandler`** — [`apps/client/src/features/multiplayer/composables/useSocketTransport.ts:440-444`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L440-L444) (Dim D)
- [ ] **[ENH-007] Absence of Modern Vue 3.4 `defineModel` in Component Two-Way Bindings (13 components)** — [`apps/client/src/components/base/BaseModal.vue:30-34`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/base/BaseModal.vue#L30-L34) (Dim E)
- [ ] **[ENH-008] Absence of Vue 3.5 `useTemplateRef` for Type-Safe DOM and Component Access** — [`apps/client/src/components/base/BaseButton.vue:31`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/base/BaseButton.vue#L31) (Dim E)
- [ ] **[ENH-009] Dual `<script>` and `<script setup>` SFC Anti-Pattern for Type and Utility Exports** — [`apps/client/src/features/puzzles/components/ProgressiveHintLayer.vue:1-30`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/components/ProgressiveHintLayer.vue#L1-L30) (Dim E)
- [ ] **[ENH-010] Missing Compiler Strictness Flags in `tsconfig.base.json` (`noUnusedLocals`, `noUnusedParameters`, etc.)** — [`tsconfig.base.json:3-17`](file:///home/irahardianto/works/projects/fun-chess/tsconfig.base.json#L3-L17) (Dim E)
- [ ] **[ENH-011] Missing Playwright E2E Test for PWA Install Prompt Banner and Modal** — [`apps/e2e/ui/pwa.e2e.test.ts:1`](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/ui/pwa.e2e.test.ts#L1) (Dim G)
- [ ] **[ENH-012] Enforce Per-File Thresholds in Vitest Configurations to Prevent Hidden Under-Coverage** — [`vitest.config.ts:16-21`](file:///home/irahardianto/works/projects/fun-chess/vitest.config.ts#L16-L21) (Dim G)
- [ ] **[ENH-013] Unexercised Socket Mid-Flight Disconnect Abort Path in `useSocketTransport`** — [`apps/client/src/features/multiplayer/composables/useSocketTransport.ts:831-865`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/multiplayer/composables/useSocketTransport.ts#L831-L865) (Dim G)

---

## Verification Suite Results
- **Linter & Static Analysis:** PASS (`eslint . --no-inline-config --max-warnings 0`, 0 errors, 0 warnings)
- **TypeScript Strict Typecheck:** PASS (`tsc --noEmit` & `vue-tsc --noEmit` across shared, server, client, e2e)
- **Build Verification:** PASS (`pnpm -r --if-present run build` successfully compiled all packages)
- **Automated Tests:** PASS (2,732 passed, 0 failed across 184 test files: 2,588 unit + 144 integration)
- **Test Coverage:**
  - `@fun-chess/shared`: Statements 98.31%, Branches 91.47%, Functions 99.32%
  - `@fun-chess/server`: Statements 95.46%, Branches 88.14%, Functions 92.76%
  - `@fun-chess/client`: Statements 93.75%, Branches 85.15%, Functions 93.12%

---

## Cross-Dimension Correlations
Findings spanning multiple dimensions where convergence escalated finding severity:

1. **Room Capacity Error Contract Drift & Double Type Casts (Dim E + Dim F → CRITICAL [CRIT-002]):**
   Dimension E (`MAJOR-001`) flagged `as unknown as ErrorCode` bypasses in `room.errors.ts:86`, while Dimension F (`MAJ-003`) identified that `ERR_ROOM_CAPACITY_EXCEEDED` is omitted from `shared/src/contracts/errors.ts`. In addition, `socket_server.ts:67` forced a numeric code into Engine.IO callback types. Escalated to CRITICAL due to cross-boundary contract drift subverting type safety across both server and client.
2. **Rate Limiter Discrepancies & Dead Controls (Dim A + Dim F + Dim G → CRITICAL [CRIT-003]):**
   Dimension A (`MAJ-002`) identified `notFoundRateLimiter` is never wired in `createHttpServer`. Dimension F (`MAJ-001`) identified that `http_helpers.ts:490` exempts deprecated `/api/lan-info` but rate-limits canonical `/api/v1/lan-info`. Dimension G (`MAJOR-008`) verified that `http_router.ts` and `http_helpers.ts` lack dedicated unit tests. Escalated to CRITICAL because active automated reconnaissance goes unthrottled while valid client lobby requests can be blocked.
3. **QR Scanner Camera Flow Gaps (Dim B + Dim G → MAJOR [MAJ-007]):**
   Dimension B (`MAJ-003`) identified unhandled promise rejections on camera mount in `QrScannerView.vue:35-43`. Dimension G (`MAJOR-001`, `MAJOR-005`) identified that the Playwright E2E suite completely bypasses the camera scanning journey and unit coverage is deficient at 71.7%. Escalated to high-priority MAJOR.
4. **Timer Abstraction Inversion & Test Absence (Dim C + Dim G → MAJOR [MAJ-008]):**
   Dimension C (`MAJOR-001`, `MAJOR-002`, `MAJOR-005`) flagged layer inversion in `ShutdownCoordinator`, timer service duplication, and direct `setTimeout` usage. Dimension G (`MAJOR-004`) verified that production `SystemTimerService` has zero dedicated unit tests. Escalated to high-priority MAJOR.
5. **Domain Error Logging Inaccuracy & Duplication (Dim D + Dim E + Dim G → MAJOR [MAJ-012]):**
   Dimension D (`MAJOR-001`) identified false-positive `ERROR` logs on expected domain failures in `GameService.makeMove`. Dimension E (`MINOR-007`) flagged 180 lines of duplicated try/catch logging across 9 service methods. Dimension G (`MAJOR-007`) verified that 500 error logging paths were never tested. Escalated to high-priority MAJOR.
6. **Scheduled Background Job Trace Decoupling (Dim D + Dim G → MAJOR [MAJ-015]):**
   Dimension D (`MAJOR-004`, `MAJOR-005`) identified dropped duration and orphan correlation IDs in forfeiture and cleanup jobs. Dimension G (`MAJOR-006`) identified untested catch blocks in `lifecycle.ts:47-53`. Escalated to high-priority MAJOR.

---

## Dimensions Covered
| Dimension | Status | Files / Queries Examined |
|---|---|---|
| A. Security & Configuration | ✅ Checked | Scanned 28 files across Dockerfile, Compose, Terraform, server config, CORS, CSP, rate limiters, and socket gateways |
| B. Reliability & Error Handling | ✅ Checked | Scanned 42 files across Web Audio synthesis, async file reading, Vue mount hooks, and error handling branches |
| C. Testability & Architecture | ✅ Checked | Scanned 664 files across domain engines, timer abstractions, dependency inversion, circular imports, and DI wiring |
| D. Observability & Logging | ✅ Checked | Scanned 23 files across HTTP router, health controllers, socket gateway, background jobs, and Pino logging bridges |
| E. Code Quality & Patterns | ✅ Checked | Scanned 665 files across TypeScript casting, Zod boundaries, file sizes, state management, and Vue SFC patterns |
| F. Integration Contracts & DB | ✅ Checked | Scanned 28 cross-boundary files across shared contracts, server HTTP/Socket handlers, and client API/socket clients |
| G. Dependencies & Tests | ✅ Checked | Scanned 70 files across package manifests, Vitest configurations, Playwright tests, and statement/branch coverage |

---

## Rules Applied
List of project rules referenced and verified during this audit:
- `security-mandate.md` / `security-principles.md`
- `rugged-software-constitution.md`
- `error-handling-principles.md`
- `architectural-pattern.md`
- `logging-and-observability-mandate.md`
- `monitoring-and-alerting-principles.md`
- `code-organization-principles.md`
- `core-design-principles.md`
- `api-design-principles.md` / `database-design-principles.md`
- `data-serialization-and-interchange-principles.md`
- `dependency-management-principles.md` / `testing-strategy.md`
- `resources-and-memory-management-principles.md`
- `code-idioms-and-conventions.md` (`typescript-idioms`, `vue-idioms`)

---

## Remediation Action Plan
Findings ranked by priority for resolution:

1. **[CRIT-001]** Remove insecure fallback secrets in `docker-compose.yml` (`SESSION_SECRET`, `METRICS_SECRET`) → `/bugfix`
2. **[CRIT-002]** Add `ERR_ROOM_CAPACITY_EXCEEDED` to `ErrorCode` in `shared/src/contracts/errors.ts` and remove double casts in server → `/bugfix`
3. **[CRIT-003]** Wire `notFoundRateLimiter` in `createHttpServer`, exempt `/api/v1/lan-info` in `http_helpers.ts`, and add tests → `/bugfix`
4. **[MAJ-001]** Migrate Cloud Run secrets from literal environment variables to Google Secret Manager in Terraform → `/refactor`
5. **[MAJ-002]** Add WebSocket handshake rate limiting and concurrent connection caps per IP in `socket_server.ts` → `/bugfix`
6. **[MAJ-003]** Restrict Content Security Policy `connect-src` to eliminate wildcard `ws:` and `wss:` schemes → `/bugfix`
7. **[MAJ-004]** Disconnect Web Audio `OscillatorNode` and `GainNode` on `osc.onended` in `AudioSynthesizer` → `/bugfix`
8. **[MAJ-005]** Add `reader.onabort` and explicit I/O timeout to `readProgressFile` in `ProgressFileService` → `/bugfix`
9. **[MAJ-006]** Eliminate silent empty catch blocks across domain and utilities; log debug diagnostics → `/refactor`
10. **[MAJ-007]** Handle async mount rejections in `QrScannerView`, add Playwright camera E2E test, and raise coverage >85% → `/bugfix`
11. **[MAJ-008]** Centralize canonical `ITimerService` in shared system contracts, test `SystemTimerService`, and inject it → `/refactor`
12. **[MAJ-009]** Remove outer `logger` singleton imports from pure chess calculation and validation engines → `/refactor`
13. **[MAJ-010]** Break circular dependency in `apps/client/src/components/layout` barrel and `useGameSessionSync.ts` → `/bugfix`
14. **[MAJ-011]** Provide `LOCATION_PROVIDER_KEY`, `NETWORK_MONITOR_KEY`, and `TIMER_SERVICE_KEY` in client `main.ts` → `/bugfix`
15. **[MAJ-012]** Demote expected domain rejections from `ERROR` to `WARN` in `GameService.makeMove` and deduplicate logging → `/refactor`
16. **[MAJ-013]** Add explicit `/ready` endpoint with graceful shutdown degradation returning HTTP 503 → `/bugfix`
17. **[MAJ-014]** Implement RED method metrics instrumentation and standard Prometheus text exposition on `/metrics` → `/refactor`
18. **[MAJ-015]** Eliminate duplicate background job error logs and preserve original job correlation IDs → `/bugfix`
19. **[MAJ-016]** Validate imported puzzle catalog JSON against `PuzzleSchema` at compile/import boundary → `/bugfix`
20. **[MAJ-017]** Decompose monoliths (>1000 lines: `room.service.ts`, `game.service.ts`, `socket_logging_middleware.ts`, `useSocketTransport.ts`) → `/refactor`
21. **[MAJ-018]** Resolve client state management fragmentation (<80% consistency) via formal ADR or Pinia adoption → `/refactor`
22. **[MAJ-019]** Remove module-singleton testing backdoors in client composables in favor of parameter/DI injection → `/bugfix`
23. **[MAJ-020]** Fix redundant client auto-reconnect loop caused by sanitized `socketId` comparison in `useRoomSession.ts` → `/bugfix`
24. **[MAJ-021]** Add Playwright E2E test for deep linking direct room join URL (`/?join=XXXX`) → `/workflow-solo`
25. **[MAJ-022]** Add unit test exercising `InMemoryRoomStore` lock acquisition timeout race → `/bugfix`
26. **[MIN-001 to MIN-029]** Remediate minor code quality, contract hygiene, and test gaps → `/bugfix` or `/refactor`
27. **[ENH-001 to ENH-013]** Backlog enhancements, modern Vue 3.4/3.5 ergonomics, and compiler strictness flags → `/workflow-solo`
