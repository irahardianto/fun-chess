# Project Conventions & Architectural Mandates

> **Status: FROZEN ARCHITECTURAL CONTRACT**
> **Phase: DESIGN**
> **Author: System Architect (@architect)**
> **Audience: Builders (@backend-engineer, @frontend-engineer, @tech-lead, @test-automation-engineer)**
> **Context: Codebase Audit Remediation (CRIT-001, MAJ-001 to MAJ-013, MIN-001 to MIN-027)**

---

## 1. Directory Structure & Module Boundary Mandates

### 1.1 Vertical Slices (Context → Feature → Layer)
The codebase strictly follows the **vertical slice architecture** defined in `project-structure.md` and `code-organization-principles.md`. Code is organized by business feature, NOT technical layers.

```
apps/server/src/
├── features/                  # Vertical business domains
│   ├── rooms/                 # Room lifecycle, matchmaking, presence
│   ├── game/                  # Chess moves, engine validation, timers, game over
│   └── lan/                   # Local network discovery, relay addressing
├── platform/                  # Reusable cross-cutting infrastructure
│   ├── http/                  # Native HTTP server, controllers, security headers
│   ├── socket/                # Socket.io server bootstrap & logging middleware
│   ├── logger/                # Structured Pino logger wrapper
│   ├── config/                # Environment variable schema & parsing
│   ├── id/                    # UUID generators
│   └── time/                  # System clock abstractions
└── index.ts                   # Composition root (wires DI, boots HTTP/Socket)
```

### 1.2 Module Boundary & Public API Encapsulation (MAJ-006)
1. **The Public API Rule**:
   - Each feature directory MUST expose a top-level `index.ts`.
   - **Cross-module calls go through the public API only — never import internal files directly.**
   - If feature B needs a function, type, or class from feature A, feature A's `index.ts` MUST explicitly re-export it.
2. **Forbidden Anti-Pattern**:
   ```typescript
   // ❌ STRICTLY FORBIDDEN (Breaks encapsulation, MAJ-006)
   import { sanitizePublicRoom } from "../rooms/room.logic.js";
   import { RoomNotFoundError } from "../rooms/room.errors.js";
   ```
3. **Mandatory Pattern**:
   ```typescript
   // ✅ MANDATORY (Imports exclusively through public interface)
   import { sanitizePublicRoom, RoomNotFoundError } from "../rooms/index.js";
   ```
4. **Authoritative Public API for `features/rooms/index.ts`**:
   The rooms public entry point MUST re-export all domain interfaces, errors, and public sanitizers:
   ```typescript
   // apps/server/src/features/rooms/index.ts
   export type { IRoomService, IRoomGameAdapter } from "./room.interface.js";
   export type { RoomStore, IRoomStore, RoomMutator } from "./room.store.js";
   export { MAX_ROOMS } from "./room.store.js";
   export type { SessionRecord, SessionRegistry, ISessionRegistry } from "./session_registry.js";
   export { InMemorySessionRegistry } from "./in_memory_session_registry.js";
   export { MockSessionRegistry } from "./mock_session_registry.js";
   export { InMemoryRoomStore, type InMemoryRoomStoreOptions, type LockContext } from "./in_memory_room.store.js";
   export { MockRoomStore } from "./mock_room.store.js";
   export { RoomService } from "./room.service.js";
   export { registerRoomSocketHandlers, handleSocketDisconnect } from "./room.socket_handler.js";
   export {
     DisconnectTimerRegistry,
     defaultDisconnectTimerRegistry,
     createDisconnectTimerRegistry,
     resetDefaultDisconnectTimerRegistry,
     cancelDisconnectTimer,
     cancelAllDisconnectTimersForRoom,
     clearAllDisconnectTimers,
     DISCONNECT_GRACE_PERIOD_MS,
     type IDisconnectTimerRegistry,
   } from "./disconnect_timer_registry.js";
   export {
     sanitizePublicRoom,
     sanitizePublicPlayer,
     createInitialRoomState,
     abandonmentForfeitTransition,
   } from "./room.logic.js";
   export * from "./room.errors.js";
   ```

---

## 2. Pure State Transition Pattern vs. I/O Mutations (CRIT-001)

### 2.1 The Three-Step Architectural Pattern
All state transitions follow the pure business logic rule (`architectural-pattern.md` Rule 2):
```
[Step 1: Fetch state snapshot under lock]
                  ↓
[Step 2: Pure State Transition Function (Input -> Output, no side effects, no I/O)]
                  ↓
[Step 3: Atomic Mutation & Versioned Persistence (ticket validation + CAS version increment)]
```

### 2.2 Specification of CRIT-001 Remediation

#### The Defect
Previously, `handleAbandonmentForfeit` in `room.service.ts` fetched a room snapshot via `findByCode()`, directly modified properties on the object (`room.status = "game_over"; room.lastActivityAt = this.clock.now()`), and called `this.store.save(room)`.
This bypassed:
1. Pure state transition extraction (`room.logic.ts`)
2. Monotonic ticket validation (`assertTicketValid`)
3. Optimistic version conflict detection (`OptimisticLockConflictError`)
4. Service-layer structured observability

#### Authoritative Remediation

##### 1. Pure Function: `abandonmentForfeitTransition` (`apps/server/src/features/rooms/room.logic.ts`)
```typescript
/**
 * Pure transition applying forfeiture by abandonment when a player's disconnect grace period expires.
 * Returns the next RoomState and GameOverPayload, or null if the player reconnected or room is not paused.
 */
export function abandonmentForfeitTransition(
  room: RoomState,
  disconnectedPlayerId: string,
  now: number,
): { nextRoom: RoomState; gameOverPayload: GameOverPayload } | null {
  // Only forfeit if room is actively waiting for reconnect
  if (room.status !== "paused_disconnect") {
    return null;
  }

  // Identify disconnected player
  let disconnectedPlayer: Player | null = null;
  if (room.whitePlayer?.id === disconnectedPlayerId) {
    disconnectedPlayer = room.whitePlayer;
  } else if (room.blackPlayer?.id === disconnectedPlayerId) {
    disconnectedPlayer = room.blackPlayer;
  }

  // If player is not found or has reconnected in the interim, abort forfeit
  if (!disconnectedPlayer || disconnectedPlayer.isConnected) {
    return null;
  }

  const winnerColor: PieceColor = disconnectedPlayer.color === "w" ? "b" : "w";
  const winnerPlayer = winnerColor === "w" ? room.whitePlayer : room.blackPlayer;

  let gameOverPayload: GameOverPayload;
  if (winnerPlayer && winnerPlayer.isConnected) {
    gameOverPayload = createGameOverPayload({
      winner: winnerColor,
      winnerName: winnerPlayer.name,
      loserName: disconnectedPlayer.name,
      reason: "abandonment",
      finalFen: room.game.fen,
      totalMoves: room.game.moveCount,
      startTimeMs: room.createdAt,
    });
  } else {
    // Both players disconnected when timer expired -> draw by abandonment
    gameOverPayload = createGameOverPayload({
      winner: "draw",
      reason: "abandonment",
      finalFen: room.game.fen,
      totalMoves: room.game.moveCount,
      startTimeMs: room.createdAt,
    });
  }

  const nextRoom: RoomState = {
    ...room,
    status: "game_over",
    drawOffer: null,
    lastActivityAt: now,
  };

  return { nextRoom, gameOverPayload };
}
```

##### 2. Service Execution via `this.store.mutate()` (`apps/server/src/features/rooms/room.service.ts`)
`handleAbandonmentForfeit` MUST call `this.store.mutate()` to guarantee atomic execution inside the lock queue, ticket verification, and version monotonicity:

```typescript
public async handleAbandonmentForfeit(
  roomCode: string,
  disconnectedPlayerId: string,
): Promise<{ room: RoomState; gameOverPayload: GameOverPayload } | null> {
  const normalizedCode = normalizeRoomCode(roomCode);
  const startTime = this.clock.now();

  this.logger.info("Processing abandonment forfeit", {
    operation: "room_abandonment_forfeit",
    roomCode: normalizedCode,
    disconnectedPlayerId,
  });

  try {
    const outcome = await this.store.mutate(
      normalizedCode,
      (current) => {
        const transition = abandonmentForfeitTransition(
          current,
          disconnectedPlayerId,
          this.clock.now(),
        );
        if (!transition) {
          return { updatedRoom: current, result: null };
        }
        return {
          updatedRoom: transition.nextRoom,
          result: {
            room: transition.nextRoom,
            gameOverPayload: transition.gameOverPayload,
          },
        };
      },
    );

    const duration = this.clock.now() - startTime;
    if (outcome) {
      this.logger.info("Abandonment forfeit completed successfully", {
        operation: "room_abandonment_forfeit",
        roomCode: normalizedCode,
        disconnectedPlayerId,
        winner: outcome.gameOverPayload.winner,
        duration,
        durationMs: duration,
      });
    } else {
      this.logger.info("Abandonment forfeit skipped: player reconnected or room state changed", {
        operation: "room_abandonment_forfeit",
        roomCode: normalizedCode,
        disconnectedPlayerId,
        duration,
        durationMs: duration,
      });
    }

    return outcome;
  } catch (error) {
    const duration = this.clock.now() - startTime;
    this.logger.error("Abandonment forfeit processing failed", {
      operation: "room_abandonment_forfeit",
      roomCode: normalizedCode,
      disconnectedPlayerId,
      duration,
      durationMs: duration,
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { raw: error },
    });
    throw error;
  }
}
```

---

## 3. Error Handling Conventions

### 3.1 Non-Negotiable Principle: Never Fail Silently (`error-handling-principles.md`)
Empty catch blocks (`catch {}` or `catch (e) {}` with no logging or bubbling) are strictly prohibited across all packages (`shared`, `apps/server`, `apps/client`, `apps/e2e`).

### 3.2 Asynchronous Timers and Background Jobs
Errors thrown inside `setTimeout`, `setInterval`, queue workers, or background promises CANNOT bubble to a request context. They MUST be caught, bound, and logged with complete context.

#### MAJ-004 Remediation (Disconnect Grace-Period Timer Callback)
```typescript
// apps/server/src/features/rooms/room.service.ts
const timer = setTimeout(async () => {
  try {
    await runLoggedJob(
      this.logger,
      "disconnect_grace_period_abandonment",
      async (jobCorrelationId) => {
        const forfeitResult = await this.handleAbandonmentForfeit(
          matchedRoom.roomCode,
          playerId,
        );
        if (forfeitResult && onForfeit) {
          await onForfeit(
            forfeitResult.room,
            forfeitResult.gameOverPayload,
            jobCorrelationId,
          );
        }
        return {
          roomCode: matchedRoom.roomCode,
          playerId,
          forfeited: Boolean(forfeitResult),
        };
      },
    );
  } catch (err) {
    // MAJ-004: Catch and log error explicitly with full room and player context
    this.logger.error("Disconnect grace-period forfeiture job failed", {
      operation: "disconnect_grace_period_abandonment",
      roomCode: matchedRoom.roomCode,
      playerId,
      error: err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { raw: err },
    });
  }
}, gracePeriodMs);
```

#### MIN-001 Remediation (`ChessEngine.findKingSquare`)
```typescript
// apps/server/src/features/game/chess_engine.ts
public static findKingSquare(fen: string, color: PieceColor): string | null {
  try {
    const chess = new Chess(fen);
    // ... search for king square ...
  } catch (err) {
    defaultLogger.debug("FEN parse failure in findKingSquare", {
      operation: "chess_find_king_square",
      color,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
```

#### MIN-002 Remediation (`static_handler.ts`)
```typescript
// apps/server/src/platform/http/static_handler.ts
try {
  decodedPath = decodeURIComponent(pathname);
} catch (err) {
  logger.warn("Malformed URI component in static path request", {
    operation: "static_serve_decode_error",
    path: pathname,
    clientIp,
    error: err instanceof Error ? err.message : String(err),
  });
  return false;
}
```

#### MIN-003 Remediation (Client `emitWithTimeout` Rejection Support)
```typescript
// apps/client/src/features/multiplayer/composables/useSocketTransport.ts
export interface EmitWithTimeoutOptions<TRes> {
  timeoutMs?: number;
  timeoutMessage?: string;
  operation?: string;
  correlationId?: string;
  rejectOnError?: boolean; // MIN-003: Optional flag allowing caller to reject promise
  onSuccess?: (res: TRes) => void;
  onError?: (err: SocketErrorPayload) => void;
}
```

---

## 4. Structured Logging Mandate

### 4.1 Mandatory Context Fields (`logging-and-observability-mandate.md`)
Every operational log entry MUST contain:
1. `operation`: Canonical snake_case string (e.g. `room_create`, `game_move`, `health_liveness`, `http_rate_limited`).
2. `correlationId`: UUID tracing the request or transaction.
3. `duration` / `durationMs`: Elapsed time in integer milliseconds for all completion/rejection logs.
4. `userId` / `playerId`: Identity of the actor when available.
5. `error`: Structured object containing `{ name, message, stack }` or `{ code, message }` on failure.

### 4.2 Standard Log Levels
- **`error`**: Unhandled exceptions, failed storage mutations, crashed background jobs, fatal configuration errors.
- **`warn`**: Rate limit triggers, unauthorized telemetry access attempts, recoverable invalid user input, socket disconnects.
- **`info`**: Operational entry points and successes (room creation, room join, match start, game completion, server startup).
- **`debug`**: Mutex acquisition details, chess engine FEN validation details, internal ticket sequence logs.

---

## 5. Testing Strategy & I/O Isolation Mandates

### 5.1 Unit Tests vs. Integration Tests (MAJ-010)
1. **Unit Tests (`*.spec.ts` or `*.test.ts`)**:
   - **ZERO REAL I/O**: No filesystem writes, no network calls, no child processes.
   - Must use in-memory adapters (`MemoryFileStorage`, `MockRoomStore`, `MockSessionRegistry`).
   - Run in milliseconds.
2. **Integration Tests (`*.integration.spec.ts`)**:
   - Exercise real filesystem interactions or multi-component wiring.
   - Must clean up temporary files in `finally` or `afterEach` blocks (`fs.rm(tempDir, { recursive: true })`).
3. **Partitioning `file_storage.spec.ts` (MAJ-010)**:
   - `apps/server/src/platform/http/__tests__/file_storage.spec.ts`: Unit test suite testing `MemoryFileStorage`.
   - `apps/server/src/platform/http/__tests__/file_storage.integration.spec.ts`: Integration test suite testing `NodeFileStorage` with temporary directories and symlinks.

### 5.2 Deterministic Time in Test Doubles (MAJ-013)
`MockRoomStore` MUST NOT call wall-clock `Date.now()`. It accepts an injectable `IClock` defaulting to `SystemClock`. In tests, a simulated or stepped clock can be provided to test time-based transitions deterministically.

---

## 6. Canonical Feature Directory Skeleton

Below is the standard vertical slice skeleton for a server feature (`features/rooms`):

```
apps/server/src/features/rooms/
├── index.ts                         # Public API: ONLY exported symbols for other features
├── room.interface.ts                # Service contracts (IRoomService, IRoomGameAdapter)
├── room.store.ts                    # Storage contract (RoomStore, IRoomStore, MAX_ROOMS)
├── in_memory_room.store.ts          # Production store implementation (FIFO lock, ticket model)
├── mock_room.store.ts               # Unit test store double (injectable IClock)
├── room.logic.ts                    # Pure state transitions (addPlayer, abandonmentForfeit, sanitize)
├── room.service.ts                  # Service orchestration & transaction boundaries (DI injected)
├── room.socket_handler.ts           # Socket.io event controllers (rate limiting, auth, acks)
├── session_registry.ts              # Session store contract (SessionRegistry, SessionRecord)
├── in_memory_session_registry.ts    # Production session registry
├── mock_session_registry.ts         # Test double session registry
├── disconnect_timer_registry.ts     # Disconnect timer registry & lifecycle helpers
├── room.errors.ts                   # Domain-specific typed error classes
└── __tests__/                       # Co-located unit tests (100% in-memory)
    ├── room.service.spec.ts
    ├── room.logic.spec.ts
    ├── in_memory_room.store.spec.ts
    ├── room.socket_handler.spec.ts
    └── session_registry.spec.ts
```

---

## 7. Builder Responsibility Checklist

| Scope Card | Builder Agent | Key Conventions to Apply |
|------------|---------------|--------------------------|
| **SC-1** | `@backend-engineer` | Shared contracts: `events.ts`, `normalization.ts`, exact engines pin in root `package.json` |
| **SC-2** | `@backend-engineer` | HTTP pipeline reordering (rate limit first), `sanitizeCorrelationId`, telemetry auth guard, isolated `file_storage.integration.spec.ts`, pinned `workspace:^1.0.0` |
| **SC-3** | `@backend-engineer` | Pure `abandonmentForfeitTransition`, `this.store.mutate()` in forfeit, non-empty catch in timer, explicit DI in `RoomService`, `while` eviction in `InMemoryRoomStore`, `MockRoomStore` clock |
| **SC-4** | `@backend-engineer` | Explicit DI in `GameService` with `Logger`, cross-module import via `rooms/index.ts`, shared `normalizeRoomCode` |
| **SC-5** | `@tech-lead` | Clean composition root in `index.ts` wiring all concrete dependencies, run integration test suite |
| **SC-6** | `@frontend-engineer` | Consume ack-only room state in `useRoomSession`, update `room:player_disconnected` handler, expose `resetTransportState()`, pin `workspace:^1.0.0` |
| **SC-7** | `@test-automation-engineer` | Playwright E2E scenario for "Draw Offer Declined", verify 0 regressions across entire test suite |
