# Code Audit: Full Monorepo Codebase
Date: 2026-09-07
Auditor: AI Code Audit (multi-dimensional, 7 parallel subagents)

## Executive Summary
- **Dimensions activated:** A, B, C, D, E, F, G (Security, Reliability, Architecture, Observability, Code Quality, Integration/Persistence, Dependencies & Tests)
- **Dimensions skipped:** None (Dimension F scoped to Socket.io / HTTP API contracts and client-server integration boundaries; project uses in-memory / local storage rather than SQL DB)
- **Files scanned:** 471 files (297 non-test source files across `apps/server`, `apps/client`, `shared`, `apps/e2e`, and root test suites)
- **Findings:** 104 total (8 critical, 38 major, 43 minor, 15 enhancement)
- **Automated verification:** Lint / Typecheck: PASS (`vue-tsc -b && tsc`) | Tests: PASS (2,086 passed, 0 failed) | Build: PASS | Coverage: Shared 95.06%, Server 90.62%, Client >91%
- **Overall codebase health:** NEEDS ATTENTION (Despite excellent automated test pass rates and high unit test coverage, critical vulnerabilities and concurrency/state traps exist in spectator disconnections, dual-client disconnects, progress backup timestamps, session rematch lifecycles, and Cloud Run proxy evaluation)

---

## Critical Issues
Vulnerabilities or severe defects that cause active security breaches, data loss, application crashes, or system compromise. Must be fixed immediately.

- [ ] **[CRIT-001] Spectator Disconnect Freezes Active Match Permanently in `paused_disconnect` State** — [`apps/server/src/features/rooms/room.service.ts:379-382`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L379-L382), [`apps/server/src/features/rooms/room.socket_handler.ts:369-411`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L369-L411)
  - **Dimension:** B (Reliability & Error Handling), Correlated with F (Integration Contracts)
  - **Rule Source:** `error-handling-principles.md`, `rugged-software-constitution.md`
  - **Description:** In `RoomService.handleDisconnect`, when any connected client disconnects while a game is active (`room.status === "playing"`), the method unconditionally transitions the room status to `"paused_disconnect"` without verifying whether the disconnecting client was an active player (`whitePlayer` or `blackPlayer`) or simply a spectator. The socket handler then broadcasts `room:player_disconnected` and schedules a 60-second abandonment forfeit timer for that spectator's ID. When the 60s timer expires, `RoomService.handleAbandonmentForfeit` executes: it searches for the ID among `room.whitePlayer` and `room.blackPlayer`, finds neither, and returns `null`. Because `handleAbandonmentForfeit` returns `null`, the room is never forfeited, never resumed, and remains permanently trapped in `"paused_disconnect"`.
  - **Impact:** Any spectator who watches a live match and closes their browser tab or experiences a network flicker causes the entire match to permanently freeze for both active chess players. Neither player can make moves because move validation requires `room.status === "playing"`, and the match can never resolve or forfeit automatically.
  - **Evidence:**
    ```typescript
    const spectator = room.spectators.find((s) => s.id === playerId);
    if (spectator) {
      spectator.isConnected = false;
      droppedPlayer = spectator;
    }
    if (!droppedPlayer) return null;
    const wasActiveGame = room.status === "playing";
    if (wasActiveGame) {
      room.status = "paused_disconnect"; // Spectator pauses active game!
    }
    ```
  - **Remediation:** Guard status transitions so only active players (`whitePlayer` or `blackPlayer`) cause `room.status` to change to `"paused_disconnect"` and set `wasActiveGame = true`. For spectators, update `spectator.isConnected = false` and broadcast spectator updates while keeping `room.status` as `"playing"`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-002] Sequential Dual Player Disconnection Traps Game in Unrecoverable Pause Without Forfeit Timer** — [`apps/server/src/features/rooms/room.service.ts:379-382`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L379-L382), [`apps/server/src/features/rooms/room.socket_handler.ts:369-373`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L369-L373)
  - **Dimension:** B (Reliability & Error Handling), Correlated with F (Integration Contracts)
  - **Rule Source:** `error-handling-principles.md`, `rugged-software-constitution.md`
  - **Description:** In `RoomService.handleDisconnect`, `wasActiveGame` is computed as `const wasActiveGame = room.status === "playing"`. When Player A disconnects, the room status transitions to `"paused_disconnect"` and a 60-second forfeit timer is started for Player A. If Player B subsequently disconnects while Player A is still offline (e.g. 10 seconds later due to a shared network disruption or Wi-Fi drop), `room.status === "playing"` evaluates to `false` because the room is already `"paused_disconnect"`. Consequently, `wasActiveGame` is returned as `false`, and `room.socket_handler.ts` skips starting a disconnect timer for Player B. If Player A reconnects at 45 seconds, Player A's timer is cancelled, but the room remains in `"paused_disconnect"` because Player B is disconnected. Because no timer was ever registered for Player B, Player A is trapped indefinitely in a paused game with no active countdown and no forfeit mechanism.
  - **Impact:** Dual disconnections on spotty mobile/LAN networks cause deadlocked game rooms where a reconnected player is held hostage in a paused match with no way to resume or win by opponent abandonment.
  - **Evidence:**
    ```typescript
    const wasActiveGame = room.status === "playing";
    if (wasActiveGame) {
      room.status = "paused_disconnect";
    }
    return { room, player: droppedPlayer, wasActiveGame };
    // Socket handler:
    if (wasActiveGame) {
      // Skipped for Player B because status was already paused_disconnect!
      timerRegistry.set(room.roomCode, player.id, timer);
    }
    ```
  - **Remediation:** Track active player disconnection state explicitly (e.g. check if `room.status === "playing" || room.status === "paused_disconnect"`). Always schedule a disconnect timer for any active player who drops while the game is in progress or paused waiting for players, and cancel/re-evaluate when players reconnect.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-003] Server Boot Crash via Uncaught TypeError in URL Construction for Protocol-less `PUBLIC_URL` or `CLIENT_URL`** — [`apps/server/src/platform/config/env.ts:49-56`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L49-L56)
  - **Dimension:** B (Reliability & Error Handling), Correlated with A (Security & Configuration)
  - **Rule Source:** `rugged-software-constitution.md`, `error-handling-principles.md`
  - **Description:** In `resolveAllowedOrigins`, `new URL(clientUrl)` and `new URL(publicUrl)` are called directly without scheme validation or exception handling. In containerized environments (Google Cloud Run, Kubernetes, Docker Compose), operators frequently specify hostnames or domains without scheme prefixes (e.g. `PUBLIC_URL=fun-chess.a.run.app` or `CLIENT_URL=app.example.com`). In Node.js, `new URL("fun-chess.a.run.app")` immediately throws `TypeError [ERR_INVALID_URL]: Invalid URL`. Because `env.ts` is imported eagerly during server bootstrap (`apps/server/src/index.ts:16`), this uncaught exception causes immediate process termination before the HTTP server or error logging infrastructure can initialize.
  - **Impact:** Container restart loops (`CrashLoopBackOff`) in production deployments whenever `PUBLIC_URL` or `CLIENT_URL` is set without an explicit `http://` or `https://` prefix.
  - **Evidence:**
    ```typescript
    if (clientUrl) {
      const parsed = new URL(clientUrl); // Throws uncaught TypeError if missing protocol!
      return [parsed.origin];
    }
    if (publicUrl) {
      const parsed = new URL(publicUrl); // Throws uncaught TypeError if missing protocol!
      return [parsed.origin];
    }
    ```
  - **Remediation:** Normalize URLs prior to parsing (e.g. `const normalized = /^https?:\/\//i.test(val) ? val : \`https://${val}\`;`), wrap URL parsing in a defensive helper, and return clear diagnostic configuration errors rather than uncaught TypeErrors.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-004] Historical Timestamps and Attempt Counts Wiped on Progress Import/Rollback** — [`apps/client/src/features/portability/store/local_storage_unified.store.ts:74-83`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/store/local_storage_unified.store.ts#L74-L83), [`apps/client/src/features/scenarios/store/local_storage_progress.store.ts:110-127`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/store/local_storage_progress.store.ts#L110-L127)
  - **Dimension:** F (Integration Contracts & Data Persistence), Correlated with A (Security) and D (Observability)
  - **Rule Source:** `architectural-pattern.md`, `data-serialization-and-interchange-principles.md`
  - **Description:** In `LocalStorageUnifiedStore.overwriteAll()`, the two-phase commit staged write resets scenario progress (`resetAllProgress()`) and then iterates through `validatedPayload.scenarios` to restore each record. However, it restores them by invoking `scenarioStore.saveProgress(id, progress.starsEarned, progress.hintsUsedTotal)`. Because the store was just reset, `existing` is undefined inside `saveProgress`. As a result, `attemptsCount` is unconditionally set to `1`, `firstCompletedAt` is reset to `Date.now()`, and `lastCompletedAt` is reset to `Date.now()`. During a compensating rollback if puzzle restoration fails, the rollback handler repeats the exact same flawed pattern against `snapshot.scenarios`. Consequently, importing a backup or rolling back from a failed import permanently obliterates the user’s real completion history, timestamps, and attempt counts.
  - **Impact:** Permanent loss of user data integrity during backup restores and sync rollbacks. User achievements, scenario completion dates, and practice statistics are falsified.
  - **Evidence:**
    ```typescript
    await this.scenarioStore.resetAllProgress();
    for (const [id, progress] of Object.entries(validatedPayload.scenarios)) {
      await this.scenarioStore.saveProgress(
        id,
        progress.starsEarned,
        progress.hintsUsedTotal
      );
    }
    // In local_storage_progress.store.ts:
    firstCompletedAt: existing ? existing.firstCompletedAt : now, // existing is null -> now!
    attemptsCount: existing ? existing.attemptsCount + 1 : 1, // existing is null -> 1!
    ```
  - **Remediation:** Add a bulk restoration method to `ScenarioProgressStore` (`restoreProgress(map: ScenarioProgressMap): Promise<void>`) that atomically serializes the validated progress map including original `attemptsCount`, `firstCompletedAt`, and `lastCompletedAt`, matching `PuzzleProgressStore.restoreProgress()`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-005] Premature Session Deletion on Game Over Breaks Rematch Reconnection** — [`apps/client/src/composables/useSocket.ts:261-271`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L261-L271), [`apps/client/src/composables/useSocket.ts:310-323`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L310-L323)
  - **Dimension:** F (Integration Contracts & Data Persistence), Correlated with B (Reliability) and C (Architecture)
  - **Rule Source:** `rugged-software-constitution.md`, `architectural-pattern.md`
  - **Description:** In `useSocket.ts`, the `handleGameOver` callback unconditionally calls `clearSession()`, removing active session credentials from browser `sessionStorage`. However, the room lifecycle has not concluded: both players remain in the room on the game-over screen and can negotiate a rematch (`room:rematch_request` and `room:rematch_respond`). If either player refreshes their browser, experiences a network drop, or navigates away and back while on the game-over screen, `loadSavedSession()` finds no credentials. The client is unable to issue a `room:reconnect` request, locking them out of the match, aborting any pending rematch, and causing attempts to reconnect to fail with `ERR_ROOM_NOT_FOUND` or `ERR_PLAYER_NOT_IN_ROOM`.
  - **Impact:** Network drops or page reloads during post-game review permanently sever the player from the room and make rematch impossible.
  - **Evidence:**
    ```typescript
    function handleGameOver(payload: GameOverPayload) {
      lastGameOver.value = payload;
      drawOfferedBy.value = null;
      if (currentRoom.value) {
        currentRoom.value = { ...currentRoom.value, status: "game_over" };
      }
      clearSession(); // Wipes sessionStorage before rematch negotiation!
    }
    ```
  - **Remediation:** Remove `clearSession()` from `handleGameOver`. Retain session credentials throughout `game_over` and `rematch_pending` states. Only call `clearSession()` when the player explicitly leaves the room (`leaveRoom`), when the room is destroyed, or upon receiving `ERR_ROOM_NOT_FOUND` / `ERR_UNAUTHORIZED`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-006] Rate Limiting Bypass & Access Log IP Spoofing via Leftmost `X-Forwarded-For` Evaluation** — [`apps/server/src/platform/socket/socket_rate_limiter.ts:43-45`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L43-L45), [`apps/server/src/platform/http/static_handler.ts:55-58`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L55-L58)
  - **Dimension:** A (Security & Configuration), Escalated via correlation with D (Observability) & E (Code Quality)
  - **Rule Source:** `security-mandate.md` (Rule 1: Never trust user input), `security-principles.md` (Rate Limiting)
  - **Description:** When `TRUST_PROXY` is enabled, `extractClientIp` unconditionally extracts the first element (`split(",")[0]`) of the `X-Forwarded-For` header. In standard reverse proxies (Google Cloud Run, GCP HTTPS Load Balancer, AWS ALB, Nginx), client-supplied `X-Forwarded-For` headers are appended to by upstream proxies, yielding: `X-Forwarded-For: <client_supplied_val>, <real_client_ip>`. Because `extractClientIp` parses index 0, an attacker can specify an arbitrary IP (e.g. `X-Forwarded-For: 10.0.0.1`) and rotate it on every connection. Furthermore, custom socket interceptors (`checkGameRateLimit` / `checkRoomRateLimit`) duplicate rate limiting checks, consume tokens twice, and omit `trustProxy` completely.
  - **Impact:** Attackers can completely bypass the 5 req/10s rate limit on room creation, joining, and chess moves by randomizing the leftmost `X-Forwarded-For` address, while poisoning security audit logs with fabricated client IP addresses.
  - **Evidence:**
    ```typescript
    if (trustProxy) {
      const forwarded = s.handshake?.headers?.["x-forwarded-for"];
      if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0]?.trim() || "127.0.0.1";
      }
    }
    ```
  - **Remediation:** For 1 reverse proxy hop (e.g. Cloud Run), extract the rightmost IP before the proxy: `parts[parts.length - 1]`. Eliminate outer socket rate limit interceptors in favor of `wrapSocketHandler`'s built-in middleware.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-007] Default Cloud Run Deployment Configuration & Schema Startup Failure** — [`infra/terraform/variables.tf:47-57`](file:///home/irahardianto/works/projects/fun-chess/infra/terraform/variables.tf#L47-L57), [`apps/server/src/platform/config/env.ts:57-59`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L57-L59)
  - **Dimension:** A (Security & Configuration), Escalated via correlation with B (Reliability) & D (Observability)
  - **Rule Source:** `configuration-management-principles.md`, `rugged-software-constitution.md`
  - **Description:** In `infra/terraform/variables.tf`, `public_url` and `cors_origin` default to empty strings `""`, and description text instructs operators: `"leave empty for auto-detection"`. In `cloud_run.tf`, `NODE_ENV` is hardcoded to `"production"`. When `resolveAllowedOrigins` runs at startup, lines 57-59 in `env.ts` execute: `if (nodeEnv === "production") throw new Error("FATAL: CORS_ORIGIN or PUBLIC_URL must be configured in production mode.");`. Because `emptyStringToUndefined` turns `""` into `undefined`, and there is no auto-detection in production mode, any deployment using default Terraform variables crashes immediately upon startup and enters an unrecoverable `CrashLoopBackOff` in Cloud Run.
  - **Impact:** Standard `terraform apply` fails container health probes and halts deployment.
  - **Evidence:**
    ```hcl
    variable "public_url" {
      default = "" # Triggers FATAL error on Cloud Run startup!
    }
    ```
  - **Remediation:** Add Terraform validation ensuring at least one variable is provided (`length(var.cors_origin) > 0 || length(var.public_url) > 0`), update documentation, and add declarative `.superRefine()` validation in `ServerEnvSchema`.
  - **Fix workflow:** `/bugfix` — immediate priority

- [ ] **[CRIT-008] Erroneous Room Deletion When Guest Leaves Lobby Without Notifying Host** — [`apps/server/src/features/rooms/room.service.ts:327-334`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L327-L334), [`apps/server/src/features/rooms/room.socket_handler.ts:304-307`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.socket_handler.ts#L304-L307)
  - **Dimension:** F (Integration Contracts & Data Persistence), Escalated via correlation with B (Reliability)
  - **Rule Source:** `architectural-pattern.md`, `error-handling-principles.md`
  - **Description:** In `RoomService.leaveRoom()`, `shouldDelete` is computed as `leavingPlayer.isHost || (!room.whitePlayer && !room.blackPlayer) || room.status === "lobby"`. Because `room.status === "lobby"` is an `OR` condition, whenever a *guest* (non-host) leaves the lobby, `shouldDelete` evaluates to `true`! The room and all session records are deleted from memory (`this.store.delete()` and `this.sessionRegistry.deleteSessionsForRoom()`). Furthermore, in `room.socket_handler.ts`, because `result.shouldDelete` is true, the handler does *not* broadcast `room:player_left`.
  - **Impact:** If a guest joins a lobby and clicks "Back" to leave, the host’s room is silently destroyed on the server. The host receives no notification, remains stranded in an orphaned lobby, and any subsequent action fails with `ERR_ROOM_NOT_FOUND`.
  - **Evidence:**
    ```typescript
    const shouldDelete =
      leavingPlayer.isHost ||
      (!room.whitePlayer && !room.blackPlayer) ||
      room.status === "lobby"; // Evaluates to true when guest leaves!
    if (shouldDelete) {
      await this.store.delete(normalizedCode);
      await this.sessionRegistry.deleteSessionsForRoom(normalizedCode);
    }
    ```
  - **Remediation:** Remove `room.status === "lobby"` from `shouldDelete`. Only delete the room if the departing player is the host (`leavingPlayer.isHost`) or if no players remain in the room (`!room.whitePlayer && !room.blackPlayer`).
  - **Fix workflow:** `/bugfix` — immediate priority

---

## Major Issues
Structural violations, missing I/O error handling, untested critical paths, or broken contracts. Must be fixed before release.

- [ ] **[MAJ-001] Client-Server Room Status Desynchronization on Disconnect/Reconnect** — [`apps/client/src/composables/useSocket.ts:195-223`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L195-L223), [`apps/server/src/features/rooms/room.service.ts:379-385`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L379-L385)
  - **Dimension:** F | **Rule:** `architectural-pattern.md`
  - **Description:** Server only pauses games if `wasActiveGame = room.status === "playing"`. Client unconditionally sets status to `"paused_disconnect"` on disconnect and to `"playing"` on reconnect. If disconnect occurs in lobby or game-over, client UI erroneously transitions to `"playing"`.
  - **Remediation:** Align client status mutations with server authority; only transition to `"paused_disconnect"` if previous status was `"playing"`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-002] Insecure Wildcard Origin Fallback and Direct `process.env` Reads in `createSocketServer`** — [`apps/server/src/platform/socket/socket_server.ts:27-41`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_server.ts#L27-L41)
  - **Dimension:** A | **Rule:** `configuration-management-principles.md`, `security-mandate.md`
  - **Description:** Socket server origin fallback directly reads unvalidated `process.env.CORS_ORIGIN` and falls back to `["*"]` when not production, allowing cross-site WebSocket hijacking (CSWSH) in dev environments.
  - **Remediation:** Remove inline `process.env` reads; delegate origin resolution strictly to `resolveAllowedOrigins()`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-003] Prototype Pollution Hazard in Progress Sync Envelope Deserialization** — [`shared/src/utils/schema_validator.ts:161-196`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/schema_validator.ts#L161-L196), [`shared/src/utils/progress_merger.ts:42-88`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_merger.ts#L42-L88)
  - **Dimension:** A | **Rule:** `security-principles.md`
  - **Description:** `sanitizeString()` strips control characters but does not reject `"__proto__"`, `"constructor"`, or `"prototype"`. Malicious backup JSON or QR strings can inject prototype mutations during progress merge operations.
  - **Remediation:** Reject forbidden prototype property names in `sanitizeString()` and initialize dictionary lookups with `Object.create(null)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-004] Circular Dependency Between Domain Service and Socket Delivery Layer in `features/rooms`** — [`apps/server/src/features/rooms/room.service.ts:23-26`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L23-L26)
  - **Dimension:** C | **Rule:** `code-organization-principles.md`, `architectural-pattern.md`
  - **Description:** `room.service.ts` imports timer registry from `./room.socket_handler.js`, while `room.socket_handler.ts` imports `RoomService` from `./room.service.js`.
  - **Remediation:** Extract `IDisconnectTimerRegistry` and `DisconnectTimerRegistry` into `apps/server/src/features/rooms/disconnect_timer_registry.ts`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-005] Dependency Direction Inversion in Platform HTTP Ingress and DI Containers** — [`apps/server/src/platform/http/http_server.ts:8-10`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L8-L10), [`apps/client/src/platform/di/index.ts:20-21`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/di/index.ts#L20-L21)
  - **Dimension:** C | **Rule:** `architectural-pattern.md`, `project-structure.md`
  - **Description:** Platform HTTP server directly imports internal feature stores and constructs `new RelayAddressService(...)`. Client DI container directly imports domain feature stores.
  - **Remediation:** Define abstract interfaces for platform dependencies; wire all concrete feature implementations at composition roots (`index.ts` / `main.ts`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-006] Broken `IAudioService` Contract Causing Duck-Typing and Runtime Type Bypasses** — [`apps/client/src/platform/audio/audio.interface.ts:5-22`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/audio/audio.interface.ts#L5-L22)
  - **Dimension:** C | **Rule:** `architectural-pattern.md`
  - **Description:** `IAudioService` only defines 8 methods, omitting 13+ methods used across the app (`playDraw`, `playError`, `playClick`, etc.), forcing `useAudio.ts` to cast `as AudioSynthesizer` and duck-type with `'in synth'`.
  - **Remediation:** Expand `IAudioService` to cover all audio effects and lifecycle operations; update `NullAudioService` to implement all methods.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-007] Pure Chess AI Minimax Engine Polluted with Simulated Timers and Side Effects** — [`apps/client/src/features/ai/engine/minimax_engine.ts:360-368`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/engine/minimax_engine.ts#L360-L368)
  - **Dimension:** C | **Rule:** `architectural-pattern.md`
  - **Description:** `MinimaxEngine.computeBestMove` embeds side effects and simulated think delays (`Math.random()`, `setTimeout`) directly inside pure business logic.
  - **Remediation:** Remove think delays from `computeBestMove`; delegate simulated thinking delays to orchestrating composables (`useAiWorker.ts`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-008] Complete Client-Side Dependency Injection Bypassed in Favor of Hardcoded Singletons** — [`apps/client/src/platform/di/index.ts:25-51`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/di/index.ts#L25-L51)
  - **Dimension:** C, E, G | **Rule:** `architectural-pattern.md`, `testability-patterns`
  - **Description:** Vue DI container provides 7 core tokens, but 0% of client components or composables consume them. All features directly import concrete singletons (`safeLocalStorage`, `apiClient`, `audioSynthesizer`).
  - **Remediation:** Adopt `useInject*` composables across feature composables and stores with fallback to singletons.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-009] Global Mutable Singleton State and Hardcoded Infrastructure in `useSocket.ts`** — [`apps/client/src/composables/useSocket.ts:95-108`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L95-L108)
  - **Dimension:** C, D | **Rule:** `architectural-pattern.md`, `code-organization-principles.md`
  - **Description:** `useSocket.ts` holds global mutable reactive state and couples transport directly to audio output (`audioSynthesizer.playCapture()`).
  - **Remediation:** Refactor `useSocket` into a scoped service/store, decoupling audio playback to reactive event listeners.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-010] Pervasive Cross-Module Boundary Violations via Deep Internal File Imports** — [`apps/client/src/features/scenarios/ScenarioArena.vue:4-9`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/ScenarioArena.vue#L4-L9), [`apps/server/src/index.ts:31-35`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L31-L35)
  - **Dimension:** C, E | **Rule:** `code-organization-principles.md`
  - **Description:** Over 35 files bypass feature `index.ts` public APIs and import internal implementation files directly across feature boundaries.
  - **Remediation:** Enforce that cross-module imports target the public feature barrel `index.ts`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-011] Anti-Pattern Root `composables/` Technical Layer Breaking Vertical Slice Architecture** — [`apps/client/src/composables/index.ts:1-10`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/index.ts#L1-L10)
  - **Dimension:** C | **Rule:** `project-structure.md`
  - **Description:** Root `composables/` mixes multiplayer, board game, and lobby logic, causing `App.vue` to prop-drill 22 props into `MultiplayerArena.vue`.
  - **Remediation:** Relocate composables into their respective feature directories (`features/multiplayer`, `features/board`, `features/lobby`).
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-012] Hardcoded Time and Randomness in `SessionRegistry` and `RoomStore` Bypassing `IClock`/`IIdGenerator`** — [`apps/server/src/features/rooms/in_memory_session_registry.ts:30-32`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_session_registry.ts#L30-L32)
  - **Dimension:** C | **Rule:** `architectural-pattern.md`
  - **Description:** `InMemorySessionRegistry` and `InMemoryRoomStore` call `randomUUID()` and `Date.now()` directly instead of using injected `IClock` / `IIdGenerator`.
  - **Remediation:** Inject `clock: IClock` and `idGenerator: IIdGenerator` into `InMemorySessionRegistry` and `InMemoryRoomStore`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-013] `RoomService` Fails to Declare and Implement `IRoomService` Interface** — [`apps/server/src/features/rooms/room.service.ts:42`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L42)
  - **Dimension:** C | **Rule:** `architectural-pattern.md`, `code-organization-principles.md`
  - **Description:** `IRoomService` contract exists in `room.interface.ts`, but `RoomService` does not implement it, and socket handlers type-hint against the concrete class.
  - **Remediation:** Add `implements IRoomService` to `RoomService` and use interface type in handlers.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-014] Unlogged HTTP Preflight OPTIONS Request Handler and Silent CORS Denials** — [`apps/server/src/platform/http/http_server.ts:209-218`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L209-L218)
  - **Dimension:** D | **Rule:** `logging-and-observability-mandate.md`
  - **Description:** OPTIONS preflight handler returns early with 403 or 204 before the request start log, completely silencing CORS rejections.
  - **Remediation:** Move request start log before OPTIONS preflight or log preflight completion with status and origin.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-015] Unlogged Scheduled Background Pruning Task in `SocketRateLimiter`** — [`apps/server/src/platform/socket/socket_rate_limiter.ts:86-93`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_rate_limiter.ts#L86-L93)
  - **Dimension:** D | **Rule:** `logging-and-observability-mandate.md`
  - **Description:** Periodic `setInterval` pruning task runs unobserved without `runLoggedJob` or start/duration/completion logging.
  - **Remediation:** Wrap periodic prune execution in `runLoggedJob(logger, "rate_limiter_prune", ...)`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-016] Missing Correlation IDs Across Server Lifecycle, Disconnect, and Static File Operations** — [`apps/server/src/platform/lifecycle/shutdown_coordinator.ts:69-163`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/lifecycle/shutdown_coordinator.ts#L69-L163), [`apps/server/src/platform/http/static_handler.ts:90-250`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L90-L250)
  - **Dimension:** D | **Rule:** `logging-and-observability-mandate.md`
  - **Description:** Server shutdown, static file security violations, and player disconnect logs omit mandatory `correlationId`.
  - **Remediation:** Pass `correlationId` into static file handlers and disconnect handlers, generating one on shutdown.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-017] Potential Sensitive Token Exposure via Raw URL in Socket Engine Connection Error Logging** — [`apps/server/src/platform/socket/socket_server.ts:75-95`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_server.ts#L75-L95)
  - **Dimension:** D | **Rule:** `logging-implementation.md`
  - **Description:** Engine `connection_error` logs raw `errorObj.req?.url`, which can contain plain-text session tokens during polling handshakes.
  - **Remediation:** Strip query strings from `req.url` before logging.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-018] External HTTP Service Calls Completely Unlogged in `FetchApiClient`** — [`apps/client/src/platform/api/fetch_api_client.ts:83-159`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/api/fetch_api_client.ts#L83-L159)
  - **Dimension:** D | **Rule:** `logging-and-observability-mandate.md`
  - **Description:** Client HTTP communication layer logs 0 of the 3 mandatory log points (start, completion with latency, failure).
  - **Remediation:** Inject `ILogger` into `FetchApiClient` and wrap requests in 3-point structured logging.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-019] Critical Two-Phase Commit Rollback and Data Portability Operations Logged via Unstructured Console** — [`apps/client/src/features/portability/store/local_storage_unified.store.ts:101`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/store/local_storage_unified.store.ts#L101)
  - **Dimension:** D | **Rule:** `logging-and-observability-mandate.md`, `logging-implementation.md`
  - **Description:** Rollback failure in 2PC storage transactions is logged using raw `console.error` without structured context or correlation tracking.
  - **Remediation:** Use `logger.fatal` with structured `operation: "unified_store_rollback"` and `correlationId`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-020] Duplicated Logic Violating DRY Threshold Across Five Modules: `calculateMasteryLevel`** — [`shared/src/utils/dictionary_mapper.ts:27-34`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/dictionary_mapper.ts#L27-L34)
  - **Dimension:** E | **Rule:** `core-design-principles.md`
  - **Description:** Theme mastery progression criteria is copy-pasted across 5 separate files in `shared` and `apps/client`.
  - **Remediation:** Centralize `calculateMasteryLevel` in `shared/src/contracts/puzzle.ts` and import across all 5 files.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-021] Unhandled `room:player_left` Socket Event Leaves Stale Opponent State** — [`apps/client/src/composables/useSocket.ts:191-193`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L191-L193)
  - **Dimension:** F | **Rule:** `architectural-pattern.md`, `code-idioms-and-conventions.md`
  - **Description:** `handlePlayerLeft` in `useSocket.ts` is an empty no-op, leaving departed players visually present in room slots.
  - **Remediation:** Implement `handlePlayerLeft` to clear `whitePlayer`, `blackPlayer`, or spectator arrays upon reception.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-022] Ephemeral Transport ID (`socketId`) Stored in Domain Model `RoomState.drawOffer`** — [`apps/server/src/features/game/game.service.ts:211`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L211)
  - **Dimension:** F | **Rule:** `architectural-pattern.md`
  - **Description:** Draw offers are keyed by transient `socketId`. Reconnecting changes socket ID, allowing a player to accept their own offer.
  - **Remediation:** Key `drawOffer.offeredBy` by domain `playerId` instead of `socketId`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-023] Missing Bulk Progress Restoration in `ScenarioProgressStore` Contract** — [`shared/src/contracts/scenario.ts:161-174`](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/scenario.ts#L161-L174)
  - **Dimension:** F | **Rule:** `architectural-pattern.md`, `code-organization-principles.md`
  - **Description:** Contract lacks `restoreProgressMap()`, forcing callers to loop individual `saveProgress` calls and inducing timestamp loss.
  - **Remediation:** Add `restoreProgressMap(map: ScenarioProgressMap): Promise<void>` to `ScenarioProgressStore` interface and implementations.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-024] Premature Lock Queue Deletion Destroys Concurrency Linearizability During Room Deletion** — [`apps/server/src/features/rooms/in_memory_room.store.ts:229-234`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/in_memory_room.store.ts#L229-L234)
  - **Dimension:** B | **Rule:** `concurrency-and-threading-principles.md`, `resources-and-memory-management-principles.md`
  - **Description:** `InMemoryRoomStore.delete` deletes lock queues immediately while concurrent waiters may still be queued, destroying mutual exclusion.
  - **Remediation:** Verify `entry.waitersCount === 0` before deleting queue entries or retain queue promise until resolution.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-025] Fire-and-Forget `room:leave` Emission With Local Session Obliteration** — [`apps/client/src/composables/useSocket.ts:724-732`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L724-L732)
  - **Dimension:** B | **Rule:** `error-handling-principles.md`
  - **Description:** `leaveRoom` emits `room:leave` without acknowledgment callback or timeout and immediately clears session, creating ghost rooms on packet drops.
  - **Remediation:** Add acknowledgment callback with timeout before wiping session credentials.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-026] Zero-Tolerance Swallowed Errors in PWA Snooze, Root LAN Fetch, and Progress Sync Modal** — [`apps/client/src/features/pwa/composables/usePwaInstall.ts:188-194`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/pwa/composables/usePwaInstall.ts#L188-L194), [`apps/client/src/App.vue:91-99`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L91-L99), [`apps/client/src/features/portability/components/ProgressSyncModal.vue:34-65`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/components/ProgressSyncModal.vue#L34-L65)
  - **Dimension:** B | **Rule:** `error-handling-principles.md`, `rugged-software-constitution.md`
  - **Description:** Multiple files contain empty catch blocks (`catch {}`, `catch { /* offline fallback */ }`, `.catch(() => {})`), masking storage and network rejections.
  - **Remediation:** Log caught errors with appropriate levels (`console.debug`, `console.warn`) and propagate error states to UI refs.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-027] Silent Storage Quota and Security Failure Swallowing in Storage Adapters** — [`apps/client/src/platform/storage/browser_storage_adapter.ts:98-144`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/browser_storage_adapter.ts#L98-L144), [`apps/client/src/features/scenarios/store/local_storage_progress.store.ts:131-137`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/store/local_storage_progress.store.ts#L131-L137)
  - **Dimension:** B | **Rule:** `error-handling-principles.md`, `rugged-software-constitution.md`
  - **Description:** Storage quota rejections (`QuotaExceededError`) are caught with `// Safe ignore`, causing progress to appear saved while silently failing.
  - **Remediation:** Detect `QuotaExceededError`, emit storage alert event, and warn in logs.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-028] Silent Clipboard Copy Failure on Insecure HTTP / LAN Contexts Without User Feedback** — [`apps/client/src/features/lobby/QrCodeModal.vue:235-275`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/lobby/QrCodeModal.vue#L235-L275)
  - **Dimension:** B | **Rule:** `error-handling-principles.md`
  - **Description:** In plain HTTP LAN contexts where clipboard API fails, `copyLink` fails silently without notifying the user.
  - **Remediation:** Add error feedback toast prompting manual copy when automatic copying fails.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-029] Unpinned Floating Dependency Version (`vite: "^6.4.3"`) in Production Client Manifest** — [`apps/client/package.json:31`](file:///home/irahardianto/works/projects/fun-chess/apps/client/package.json#L31)
  - **Dimension:** G | **Rule:** `dependency-management-principles.md`
  - **Description:** `vite` is specified with caret `^6.4.3` in `apps/client/package.json`, violating exact pinning mandate.
  - **Remediation:** Pin exact version `"vite": "6.4.3"`.
  - **Fix workflow:** `/bugfix`

- [ ] **[MAJ-030] Violation of Test Co-location Mandate via Root `tests/` Directory and Cross-Package Internal Imports** — [`vitest.config.ts:7`](file:///home/irahardianto/works/projects/fun-chess/vitest.config.ts#L7)
  - **Dimension:** G | **Rule:** `testing-strategy.md`, `code-organization-principles.md`
  - **Description:** Root `tests/` directory violates co-location rule and imports server internals directly across workspace boundaries.
  - **Remediation:** Relocate root integration/contracts tests to `apps/server/src/__tests__/` or `apps/e2e/api/`.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-031] Coverage Configuration Suppresses Server Bootstrap (`src/index.ts`) and Relaxes Mandatory 85% Pyramid Thresholds** — [`apps/server/vitest.config.ts:12-25`](file:///home/irahardianto/works/projects/fun-chess/apps/server/vitest.config.ts#L12-L25), [`apps/client/vite.config.ts:154-170`](file:///home/irahardianto/works/projects/fun-chess/apps/client/vite.config.ts#L154-L170)
  - **Dimension:** G | **Rule:** `testing-strategy.md`
  - **Description:** Vitest configs relax coverage thresholds to 80%/75% instead of mandated >=85%, and exclude server `src/index.ts`.
  - **Remediation:** Raise thresholds to 85% and remove `src/index.ts` from exclusions.
  - **Fix workflow:** `/refactor`

- [ ] **[MAJ-032] Missing Unit and Integration Tests for Client `InMemoryStorageAdapter` and DI Token Wrappers** — [`apps/client/src/platform/storage/in_memory_storage_adapter.ts:1-44`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/storage/in_memory_storage_adapter.ts#L1-L44), [`apps/client/src/platform/di/index.ts:1-52`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/di/index.ts#L1-L52)
  - **Dimension:** G | **Rule:** `testing-strategy.md`
  - **Description:** `InMemoryStorageAdapter` and client DI tokens have 0% test coverage.
  - **Remediation:** Add co-located unit tests for `InMemoryStorageAdapter` and DI token resolution.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MAJ-033] Unexercised Domain Error Paths and Draw/Rematch Branches in `GameService` and `RoomService`** — [`apps/server/src/features/game/game.service.ts:102-127`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L102-L127), [`apps/server/src/features/rooms/room.service.ts:136-146`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L136-L146)
  - **Dimension:** G | **Rule:** `error-handling-principles.md`, `testing-strategy.md`
  - **Description:** Stalemate/insufficient material/fifty-move rules in `GameService`, and room code collision retries and spectator drop in `RoomService` are unexercised.
  - **Remediation:** Add unit tests covering these domain paths.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MAJ-034] Untested Directory Traversal Defense and SPA Fallback Branches in `static_handler.ts`** — [`apps/server/src/platform/http/static_handler.ts:111-126`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L111-L126)
  - **Dimension:** G | **Rule:** `security-principles.md`, `testing-strategy.md`
  - **Description:** Traversal defense branch (403) and non-HTML 404 response branches in `static_handler.ts` lack unit tests.
  - **Remediation:** Add unit tests asserting 403 on traversal escapes and 404 on missing non-HTML assets.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MAJ-035] Untested Two-Phase Commit Rollback Failure Branch in Client Unified Storage** — [`apps/client/src/features/portability/store/local_storage_unified.store.ts:100-103`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/store/local_storage_unified.store.ts#L100-L103)
  - **Dimension:** G | **Rule:** `error-handling-principles.md`, `testing-strategy.md`
  - **Description:** Rollback failure exception path in `LocalStorageUnifiedStore` is unexercised.
  - **Remediation:** Add test verifying `StorageCommitError` thrown when both write and rollback fail.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MAJ-036] Missing Component Unit Tests for Pawn Promotion Modal and Outcomes in `ScenarioArena.vue`** — [`apps/client/src/features/scenarios/ScenarioArena.vue:88-109`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/ScenarioArena.vue#L88-L109)
  - **Dimension:** G | **Rule:** `testing-strategy.md`
  - **Description:** Promotion modal handlers, retry, and next lesson handlers in `ScenarioArena.vue` lack unit tests (file coverage: 69.7%).
  - **Remediation:** Add component tests for promotion interaction and retry/next handlers.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MAJ-037] Synthetic Vue Internal State Mutation in E2E Pawn Promotion Journey (`ai_game.spec.ts`)** — [`apps/e2e/tests/ai_game.spec.ts:22-42`](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/tests/ai_game.spec.ts#L22-L42)
  - **Dimension:** G | **Rule:** `testing-strategy.md`
  - **Description:** E2E test bypasses real game interactions and mutates Vue component internal state via `page.evaluate()` to trigger promotion modal.
  - **Remediation:** Drive a realistic promotion position through DOM piece moves.
  - **Fix workflow:** `/workflow-solo`

- [ ] **[MAJ-038] Incomplete Multiplayer E2E User Journeys (Missing Checkmate, Draw, Rematch, Spectator, and Reconnection Flows)** — [`apps/e2e/tests/multiplayer.spec.ts:1-73`](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/tests/multiplayer.spec.ts#L1-L73)
  - **Dimension:** G | **Rule:** `testing-strategy.md`
  - **Description:** E2E multiplayer suite only tests 2 moves + resignation; checkmate, draw, rematch, spectator, and reconnection journeys are absent.
  - **Remediation:** Add dedicated E2E journey tests for multiplayer checkmate, rematch, and reconnection.
  - **Fix workflow:** `/workflow-solo`

---

## Minor Issues
Code maintainability issues, function length/complexity violations, or minor test gaps. Fix in near term.

- [ ] **[MIN-001] Information Disclosure of Process Memory and Sockets on `/health`** — [`apps/server/src/platform/http/http_server.ts:120-144`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L120-L144) (Dim A). Redact internal memory metrics on public unauthenticated endpoints in production.
- [ ] **[MIN-002] Lack of Rate Limiting on Native HTTP Endpoints** — [`apps/server/src/platform/http/http_server.ts:190-364`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L190-L364) (Dim A). Add rate limiting middleware to `/api/lan-info` and static endpoints.
- [ ] **[MIN-003] `CORS_ORIGIN` Lacks Origin Syntax and Trailing Slash Normalization** — [`apps/server/src/platform/config/env.ts:43-48`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L43-L48) (Dim A). Strip trailing slashes to prevent browser CORS rejections.
- [ ] **[MIN-004] Missing `TRUST_PROXY` in Cloud Run Terraform Deployment** — [`infra/terraform/cloud_run.tf:29-43`](file:///home/irahardianto/works/projects/fun-chess/infra/terraform/cloud_run.tf#L29-L43) (Dim A). Inject `TRUST_PROXY=true` in Cloud Run container env to prevent shared client IP rate-limiting.
- [ ] **[MIN-005] Untracked Timer and Suppressed Audio Errors in Confetti Trigger** — [`apps/client/src/platform/confetti/confetti_trigger.ts:41, 70`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/confetti/confetti_trigger.ts#L41) (Dim B). Track timeout handle and replace empty catch blocks with debug logging.
- [ ] **[MIN-006] Swallowed DOM Exceptions in Pointer Capture Handlers** — [`apps/client/src/features/board/ChessPiece.vue:91-95`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/board/ChessPiece.vue#L91-L95) (Dim B). Log caught pointer capture exceptions.
- [ ] **[MIN-007] Swallowed Engine Parsing Exception in Progressive Hint Layer** — [`apps/client/src/features/puzzles/components/ProgressiveHintLayer.vue:108-120`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/components/ProgressiveHintLayer.vue#L108-L120) (Dim B). Add warning log when invalid FEN is parsed.
- [ ] **[MIN-008] Silent Error Swallowing in Puzzle Store Progress Deserialization** — [`apps/client/src/features/puzzles/store/local_storage_puzzle_store.ts:156-167`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/local_storage_puzzle_store.ts#L156-L167) (Dim B). Log warning on corrupted storage deserialization.
- [ ] **[MIN-009] Uncancelled Async Timers in Adaptive Ladder Composable** — [`apps/client/src/features/puzzles/composables/useAdaptiveLadder.ts:70-73`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/useAdaptiveLadder.ts#L70-L73) (Dim B). Clear timeout handle on scope dispose.
- [ ] **[MIN-010] Multiple Uncancelled Animation Timers in Scenario Completion Modal** — [`apps/client/src/features/scenarios/components/ScenarioCompletionModal.vue:59-68`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/scenarios/components/ScenarioCompletionModal.vue#L59-L68) (Dim B). Clean up star animation timeouts on beforeUnmount.
- [ ] **[MIN-011] Uncancelled Bonus Notification Timeout in Puzzle Rush Arena** — [`apps/client/src/features/puzzles/components/PuzzleRushArena.vue:72-84`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/components/PuzzleRushArena.vue#L72-L84) (Dim B). Clear bonus banner timeout on unmount.
- [ ] **[MIN-012] Unbounded Reconnection Attempts Without Max Backoff Ceiling** — [`apps/client/src/platform/socket/socket_client.ts:21-25`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/socket/socket_client.ts#L21-L25) (Dim B). Add `reconnectionDelayMax: 10000` to prevent server hammering.
- [ ] **[MIN-013] 100% Identical File Duplication: `IClock` and `SystemClock` Between Server Features** — [`apps/server/src/features/rooms/clock.ts`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/clock.ts), [`apps/server/src/features/game/clock.ts`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/clock.ts) (Dim C, E, G). Consolidate into `apps/server/src/platform/time/clock.ts`.
- [ ] **[MIN-014] Redundant Forwarder Shims in Client Components and Puzzles Store** — [`apps/client/src/components/arena/MultiplayerArena.vue:1-5`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/components/arena/MultiplayerArena.vue#L1-L5) (Dim C, E). Delete legacy re-export shims and update references.
- [ ] **[MIN-015] Duplicate Progressive Hint Composables (`useProgressiveHint` vs `usePuzzleHints`)** — [`apps/client/src/features/puzzles/composables/useProgressiveHint.ts`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/useProgressiveHint.ts) (Dim C, E). Consolidate on `usePuzzleHints.ts`.
- [ ] **[MIN-016] Direct DOM Manipulation and Missing Contract in `ProgressFileService`** — [`apps/client/src/features/portability/services/progress_file.service.ts:10-48`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/portability/services/progress_file.service.ts#L10-L48) (Dim C). Abstract file operations behind `IProgressFileService`.
- [ ] **[MIN-017] Missing Service Interface Contract for Server `GameService`** — [`apps/server/src/features/game/game.service.ts:40`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L40) (Dim C). Extract and implement `IGameService`.
- [ ] **[MIN-018] Widespread Use of Raw `console.warn/error` Instead of Structured `ClientLogger`** — 18 files in `apps/client` (Dim D). Standardize on `logger` from `@/platform/telemetry`.
- [ ] **[MIN-019] Dynamic String Formatting in Primary Server Log Messages** — [`apps/server/src/platform/logger/job_runner.ts:19-42`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/logger/job_runner.ts#L19-L42) (Dim D). Use invariant log message templates and pass dynamic fields in context.
- [ ] **[MIN-020] Defective Array Sanitization and Lack of Circular Reference Guard in `ClientLogger`** — [`apps/client/src/platform/telemetry/client_logger.ts:16-34`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/telemetry/client_logger.ts#L16-L34) (Dim D). Add `WeakSet` circular guard and sanitize arrays properly.
- [ ] **[MIN-021] Unstructured Fatal Bootstrap Error Logging in Server Entry Point** — [`apps/server/src/index.ts:362-366`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/index.ts#L362-L366) (Dim D). Use `logger.fatal` with bootstrap correlation ID.
- [ ] **[MIN-022] Monolithic Function with Extreme Cyclomatic Complexity: `serveStaticFile`** — [`apps/server/src/platform/http/static_handler.ts:41-255`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/static_handler.ts#L41-L255) (Dim E). Decompose 214-line function (complexity: 49) into focused helper functions.
- [ ] **[MIN-023] Monolithic Orchestrator Composable: `useAiGame`** — [`apps/client/src/features/ai/composables/useAiGame.ts:57-639`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/composables/useAiGame.ts#L57-L639) (Dim E). Decompose 582-line composable into sub-composables.
- [ ] **[MIN-024] Extreme Monolithic Vue Component: `PuzzleCompletionModal.vue`** — [`apps/client/src/features/puzzles/components/PuzzleCompletionModal.vue:1-1232`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/components/PuzzleCompletionModal.vue#L1-L1232) (Dim E). Split 1232-line component into child components and standardize emits.
- [ ] **[MIN-025] Overly Complex Serialization in `dictionary_mapper.ts`** — [`shared/src/utils/dictionary_mapper.ts:49-294`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/dictionary_mapper.ts#L49-L294) (Dim E). Decompose `fromCompact` (complexity: 51) into sub-mappers.
- [ ] **[MIN-026] Single Responsibility Violations with "And" Signal in Core Domain Methods** — [`apps/server/src/features/game/chess_engine.ts:36`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/chess_engine.ts#L36) (Dim E). Separate `validateAndApplyMove` into `validateMove` + `applyMove`.
- [ ] **[MIN-027] Widespread Use of `any` Type Escapes in Production Logic** — 67 occurrences (Dim E). Replace `any` casts with strong TypeScript types or `unknown`.
- [ ] **[MIN-028] Conflicting `PIECE_VALUES` Constants Across Multiple Modules** — [`shared/src/utils/chess_evaluation.ts:5`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/chess_evaluation.ts#L5), [`apps/client/src/features/ai/engine/piece_square_tables.ts:7`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/ai/engine/piece_square_tables.ts#L7) (Dim E). Rename to `STANDARD_PIECE_POINTS` and `CENTIPAWN_PIECE_VALUES`.
- [ ] **[MIN-029] Monolithic Request Handler in `createHttpServer`** — [`apps/server/src/platform/http/http_server.ts:190-365`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L190-L365) (Dim E). Extract route branches into modular controller functions.
- [ ] **[MIN-030] Client Socket Actions Bypass Shared Zod Schema Validation Before Transmission** — [`apps/client/src/composables/useSocket.ts:410-593`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L410-L593) (Dim F). Validate payloads with Zod schemas client-side before network emission.
- [ ] **[MIN-031] Direct `localStorage` Reads in `App.vue` and `LobbyView.vue` Bypass Progress Store** — [`apps/client/src/App.vue:19-30`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/App.vue#L19-L30) (Dim F). Read through `ScenarioProgressStore` port.
- [ ] **[MIN-032] Incomplete HTTP Error Envelope Structure Violating API Design Principles** — [`apps/server/src/platform/http/http_server.ts:330-336`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L330-L336) (Dim F). Standardize JSON error responses to `{ status: "error", error: { code, message }, correlationId }`.
- [ ] **[MIN-033] Rematch Color Inversion Causes Metadata Desynchronization in `SessionRegistry`** — [`apps/server/src/features/game/game.service.ts:389-394`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/game/game.service.ts#L389-L394) (Dim F). Update `SessionRecord.color` during rematch initialization.
- [ ] **[MIN-034] Fragmented Storage Keys and Lack of Stored Progress Version Migration Strategy** — [`apps/client/src/features/puzzles/store/puzzle_progress.store.ts:13`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/store/puzzle_progress.store.ts#L13) (Dim F). Centralize keys in `platform/storage/keys.ts` and add v1->v2 migration.
- [ ] **[MIN-035] Floating Range Constraints in Root Overrides Manifest** — [`package.json:38-41`](file:///home/irahardianto/works/projects/fun-chess/package.json#L38-L41) (Dim G). Pin exact override versions (`"vite": "6.4.3"`, `"vitest": "3.2.7"`).
- [ ] **[MIN-036] Unused Top-Level DevDependencies in Root Package Manifest** — [`package.json:31-33`](file:///home/irahardianto/works/projects/fun-chess/package.json#L31-L33) (Dim G). Remove unused `"chess.js"` and `"socket.io"` from root `devDependencies`.
- [ ] **[MIN-037] Unused Production Dependency `pino-pretty` in Server Manifest** — [`apps/server/package.json:18`](file:///home/irahardianto/works/projects/fun-chess/apps/server/package.json#L18) (Dim G). Move `pino-pretty` to `devDependencies` or remove.
- [ ] **[MIN-038] Type Declaration Dependency `@types/pako` Misplaced in Production Runtime Manifest** — [`shared/package.json:27`](file:///home/irahardianto/works/projects/fun-chess/shared/package.json#L27) (Dim G). Move `@types/pako` to `devDependencies`.
- [ ] **[MIN-039] Untested Legacy Helpers and Addressing Methods in `LanService`** — [`apps/server/src/features/lan/lan.service.ts:175-209`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/lan.service.ts#L175-L209) (Dim G). Add unit tests or remove legacy functional helpers.
- [ ] **[MIN-040] Untested Circular Object Reference Sanitization in Socket Logging Middleware** — [`apps/server/src/platform/socket/socket_logging_middleware.ts:75-77`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/socket/socket_logging_middleware.ts#L75-L77) (Dim G). Add test case with circular payload.
- [ ] **[MIN-041] Untested Catch Blocks on Malformed FEN in `puzzle_validator.ts`** — [`apps/client/src/features/puzzles/engine/puzzle_validator.ts:28-30`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/engine/puzzle_validator.ts#L28-L30) (Dim G). Test invalid FEN strings.
- [ ] **[MIN-042] Missing Unit Tests for Progressive Hint Composable Computed Visual Hints** — [`apps/client/src/features/puzzles/composables/useProgressiveHint.ts:14-33`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/features/puzzles/composables/useProgressiveHint.ts#L14-L33) (Dim G). Test computed visual hints.
- [ ] **[MIN-043] E2E Test Suite Directory Structure Violates Monorepo `api/` and `ui/` Partitioning Mandate** — [`apps/e2e/playwright.config.ts:13`](file:///home/irahardianto/works/projects/fun-chess/apps/e2e/playwright.config.ts#L13) (Dim G). Partition E2E directory into `apps/e2e/ui/` and `apps/e2e/api/`.

---

## Enhancement Issues
Non-critical suggestions, defense-in-depth, documentation, or minor clarity refactorings.

- [ ] **[ENH-001] Direct `process.env.LOG_LEVEL` Read in `PinoLogger`** — [`apps/server/src/platform/logger/pino_logger.ts:40`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/logger/pino_logger.ts#L40) (Dim A). Receive log level from composition root.
- [ ] **[ENH-002] `AvatarEmojiSchema` Allows Arbitrary UTF-8 and Control Characters** — [`shared/src/contracts/schemas.ts:30-35`](file:///home/irahardianto/works/projects/fun-chess/shared/src/contracts/schemas.ts#L30-L35) (Dim A). Add control character rejection.
- [ ] **[ENH-003] Incomplete `env` Object Handling in `resolveAllowedOrigins` Falls Back to `process.env`** — [`apps/server/src/platform/config/env.ts:38-41`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/config/env.ts#L38-L41) (Dim A). Rely strictly on passed `env` object.
- [ ] **[ENH-004] Web Audio Context Lifecycle Teardown Not Connected to Application Unmount or Pagehide** — [`apps/client/src/platform/audio/audio_synthesizer.ts:128-160`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/platform/audio/audio_synthesizer.ts#L128-L160) (Dim B). Hook `audioSynthesizer.dispose()` to `pagehide`.
- [ ] **[ENH-005] Silent Catch Blocks in LAN Relay Address Normalization and Hostname Extraction** — [`apps/server/src/features/lan/relay_address.service.ts:102-104`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/lan/relay_address.service.ts#L102-L104) (Dim B). Add debug log on malformed candidate URLs.
- [ ] **[ENH-006] Decouple Audio Sound Effect Triggers via Domain Event Bus** — [`apps/client/src/composables/useAudio.ts:58-132`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useAudio.ts#L58-L132) (Dim C). Subscribe audio playback to game domain events.
- [ ] **[ENH-007] Parameterize System Clock in Schema Validator Clamping** — [`shared/src/utils/schema_validator.ts:38-48`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/schema_validator.ts#L38-L48) (Dim C). Accept optional `referenceNowMs` parameter.
- [ ] **[ENH-008] Missing Client IP Address in HTTP Request Entry Logs** — [`apps/server/src/platform/http/http_server.ts:220-226`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L220-L226) (Dim D). Log client IP on HTTP ingress.
- [ ] **[ENH-009] Operation Name Inconsistency on Traversal/Error in Static File Serving** — [`apps/server/src/platform/http/http_server.ts:307-327`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/platform/http/http_server.ts#L307-L327) (Dim D). Standardize operation name to `http_request` with correct status code.
- [ ] **[ENH-010] Unused Dead SVG Assets and Exported Helper Functions in `assets/pieces/`** — [`apps/client/src/assets/pieces/index.ts:23-52`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/assets/pieces/index.ts#L23-L52) (Dim E). Remove unused piece SVG files.
- [ ] **[ENH-011] Proliferation of Redundant Semantic Alias Exports Across Modules** — [`shared/src/utils/progress_merger.ts:509`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_merger.ts#L509) (Dim E). Consolidate on canonical symbol names.
- [ ] **[ENH-012] Missing TypeScript Strict Compiler Flags in `tsconfig.base.json`** — [`tsconfig.base.json:1-16`](file:///home/irahardianto/works/projects/fun-chess/tsconfig.base.json#L1-L16) (Dim E). Add `noUncheckedIndexedAccess`, `noImplicitReturns`, `noImplicitOverride`.
- [ ] **[ENH-013] Model Initialization Drift: `RoomState.version` Uninitialized in `createRoom`** — [`apps/server/src/features/rooms/room.service.ts:95-107`](file:///home/irahardianto/works/projects/fun-chess/apps/server/src/features/rooms/room.service.ts#L95-L107) (Dim F). Explicitly initialize `version: 1`.
- [ ] **[ENH-014] Lingering Cast of Obsolete `sessionToken` on `Player` in `useSocket.ts`** — [`apps/client/src/composables/useSocket.ts:313`](file:///home/irahardianto/works/projects/fun-chess/apps/client/src/composables/useSocket.ts#L313) (Dim F). Remove obsolete `as any` fallback.
- [ ] **[ENH-015] Lack of Clock Skew Normalization in Progress Diff Calculation** — [`shared/src/utils/progress_merger.ts:435-439`](file:///home/irahardianto/works/projects/fun-chess/shared/src/utils/progress_merger.ts#L435-L439) (Dim F). Add clock skew tolerance buffer.

---

## Verification Suite Results
- **Linter & Static Analysis:** PASS (`vue-tsc -b && tsc` completed across all packages with zero compilation errors)
- **Automated Tests:** PASS (2,086 passed, 0 failed across all suites)
  - `apps/client`: 128 test files passed (1,509 unit & component tests)
  - `apps/server`: 22 test files passed (347 unit & integration tests)
  - `shared`: 13 test files passed (191 contract & utility tests)
  - `tests/contracts` & `tests/integration`: 7 test files passed (34 cross-package integration tests)
  - `apps/e2e`: 5 Playwright end-to-end user journeys passed (5 tests)
- **Build Verification:** PASS (TypeScript compilation and Vite production bundle generation succeeded; PWA service worker generated 18 precache entries)
- **Test Coverage:**
  - `@fun-chess/shared`: 95.06% Statements/Lines, 77.45% Branches, 91.66% Functions
  - `@fun-chess/server`: 90.62% Statements/Lines, 84.82% Branches, 87.56% Functions
  - `@fun-chess/client`: >91% Statements/Lines across feature modules

---

## Cross-Dimension Correlations
When findings from 2+ dimensions converge on the same module, function, or failure mode, severity was escalated:

1. **Rate Limiting & Proxy Trust Bypass (Dim A + Dim D + Dim E -> Escalated to CRITICAL-006):**
   - Dim A identified `X-Forwarded-For` leftmost parsing allowing complete rate limit bypass via IP rotation.
   - Dim D identified custom rate-limiting interceptors bypassing 3-point structured logging and duration calculation.
   - Dim E identified `checkGameRateLimit` and `checkRoomRateLimit` duplicating token consumption twice per event and omitting `trustProxy`.
   - *Escalation Rationale:* The interaction of double token consumption, inconsistent proxy handling, and IP spoofability completely undermines socket security.

2. **Server Bootstrap & Cloud Run Crash Loop (Dim A + Dim B + Dim D + Dim G -> Escalated to CRITICAL-007):**
   - Dim A identified default empty Terraform variables causing fatal startup exceptions in production.
   - Dim B identified protocol-less `PUBLIC_URL` throwing uncaught TypeErrors in `new URL()`.
   - Dim D identified startup failures using raw `console.error` rather than structured logger.
   - Dim G identified `src/index.ts` being excluded from Vitest coverage.
   - *Escalation Rationale:* Combined configuration gaps guarantee that a default Terraform Cloud Run deployment will fail to boot and crash silently in production.

3. **Erroneous Room Teardown on Guest Leave (Dim F + Dim B -> Escalated to CRITICAL-008):**
   - Dim F identified `shouldDelete` checking `room.status === "lobby"` unconditionally, deleting the room when a guest backs out of a lobby.
   - Dim B identified premature lock queue and timer deletion causing race conditions during room teardown.
   - *Escalation Rationale:* High impact on core multiplayer lobby flow: any guest leaving an open lobby destroys the host's room without notifying the host.

4. **Spectator and Dual Disconnect Traps (Dim B + Dim F):**
   - Dim B identified spectator disconnects freezing matches and dual disconnects omitting forfeit timers.
   - Dim F identified client socket handlers mutating room status to paused or playing out of sync with the server.
   - *Correlated to [CRIT-001] and [CRIT-002].*

5. **Progress Backup Timestamps & Bulk Contract (Dim F + Dim A + Dim D + Dim G):**
   - Dim F identified `attemptsCount`, `firstCompletedAt`, and `lastCompletedAt` being erased during import/rollback ([CRIT-004]).
   - Dim F identified missing `restoreProgressMap` contract method ([MAJ-023]).
   - Dim A identified prototype pollution hazard during progress deserialization ([MAJ-003]).
   - Dim D identified unstructured console logging during 2PC rollback ([MAJ-019]).
   - Dim G identified untested 2PC rollback failure branch ([MAJ-035]).
   - *Correlated to [CRIT-004].*

6. **Client Dependency Injection Dead Architecture (Dim C + Dim E + Dim G):**
   - Dim C identified 0% consumption of Vue DI tokens across all client features ([MAJ-008]).
   - Dim E identified dead architecture and pattern inconsistency across modules.
   - Dim G identified 0% test coverage for DI injection tokens and wrappers ([MAJ-032]).

7. **Server Time & UUID Duplication (Dim C + Dim E + Dim G):**
   - Dim C identified byte-for-byte duplicate `clock.ts` in server features ([MIN-013]).
   - Dim E identified DRY violation and redundant export re-binding.
   - Dim G identified unexercised `generateRandomInt` in `UuidGenerator`.

---

## Dimensions Covered
| Dimension | Status | Files / Queries Examined |
|---|---|---|
| **A. Security & Configuration** | ✅ Checked | 57 files: Zod schemas, auth tokens, rate limiters, proxy trust, CORS origins, Terraform configs, Dockerfile, gitleaks |
| **B. Reliability & Error Handling** | ✅ Checked | 297 source files: empty catches, promise rejections, room disconnect state machine, lock linearizability, timers |
| **C. Testability & Architecture** | ✅ Checked | 165 files: I/O isolation, pure business logic, circular dependencies, DI containers, vertical slice boundaries |
| **D. Observability & Logging** | ✅ Checked | 79 files: 3-point operation logging, correlation IDs, PII redaction, structured logging, socket logging middleware |
| **E. Code Quality & Patterns** | ✅ Checked | 460 files: function complexity, SRP ("and" signal), DRY threshold, any casts, duplicate composables and shims |
| **F. Integration Contracts & DB** | ✅ Checked | 47 files: socket event contracts, shared schemas, 2PC stores, session registries, model field drift |
| **G. Dependencies & Tests** | ✅ Checked | 86 files: package manifests, lockfile, coverage configs, missing unit/integration tests, E2E journey gaps |

---

## Rules Applied
- `security-mandate.md` / `security-principles.md`
- `rugged-software-constitution.md`
- `error-handling-principles.md`
- `architectural-pattern.md`
- `logging-and-observability-mandate.md`
- `code-organization-principles.md`
- `project-structure.md`
- `concurrency-and-threading-principles.md`
- `configuration-management-principles.md`
- `data-serialization-and-interchange-principles.md`
- `dependency-management-principles.md`
- `testing-strategy.md`

---

## Remediation Action Plan
Findings ranked by priority for resolution:

1. **[CRIT-001]** Guard `room.status` transition in `RoomService.handleDisconnect` so spectators do not pause active games → `/bugfix`
2. **[CRIT-002]** Ensure disconnect forfeit timers are registered for second disconnecting players during `paused_disconnect` → `/bugfix`
3. **[CRIT-003]** Defensively parse and normalize protocol-less `PUBLIC_URL` / `CLIENT_URL` in `env.ts` → `/bugfix`
4. **[CRIT-004]** Implement atomic `restoreProgressMap` on `ScenarioProgressStore` preserving historical timestamps and attempt counts → `/bugfix`
5. **[CRIT-005]** Retain session credentials in `sessionStorage` throughout `game_over` state until explicit room departure → `/bugfix`
6. **[CRIT-006]** Parse rightmost `X-Forwarded-For` IP on single-hop proxies and remove redundant outer socket rate limit interceptors → `/bugfix`
7. **[CRIT-007]** Add Terraform variable validation and Zod `.superRefine()` startup validation for Cloud Run origins → `/bugfix`
8. **[CRIT-008]** Fix `shouldDelete` in `RoomService.leaveRoom` so non-host guests leaving lobby do not destroy host's room → `/bugfix`
9. **[MAJ-001] – [MAJ-003]** Fix client-server room status desync, wildcard origins, and prototype pollution → `/bugfix`
10. **[MAJ-004] – [MAJ-013]** Clean up circular dependencies, platform dependency inversion, audio contract, pure AI minimax engine, and DI adoption → `/refactor`
11. **[MAJ-014] – [MAJ-019]** Instrument OPTIONS preflights, rate limiter pruning, fetch client, and correlation IDs → `/bugfix`
12. **[MAJ-020] – [MAJ-028]** Consolidate `calculateMasteryLevel`, handle `room:player_left`, key draw offers by `playerId`, fix empty catch blocks → `/bugfix`
13. **[MAJ-029] – [MAJ-038]** Pin exact `vite` version, raise coverage thresholds, add missing unit tests for `InMemoryStorageAdapter`, and expand E2E journeys → `/workflow-solo`
