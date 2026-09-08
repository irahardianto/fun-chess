# Frozen Project Conventions & Architecture Standards: Fun Chess Remediation

**Status**: FROZEN CONTRACT  
**Author**: @architect (System Architecture)  
**Date**: 2026-09-08  
**Scope**: Monorepo Architecture & Coding Conventions (Remediation 2026-09-08: MAJ-009, MAJ-010, MAJ-012, MAJ-013, MAJ-014, MAJ-015, MAJ-017, MAJ-019, MAJ-020, MAJ-021, MAJ-022, MAJ-023, MAJ-024, MIN-012, MIN-013, MIN-014)  
**Target Locations**: Monorepo Root, `shared/**`, `apps/server/**`, `apps/client/**`

---

## 1. Executive Architecture Summary

This document establishes the frozen coding, organization, and architectural conventions for all builders and tech leads executing Scope Cards 1 through 5. Every engineer must follow these rules without deviation.

### Core Architectural Laws:
1. **Rule 1: I/O Isolation** — All I/O boundaries (browser storage, HTTP fetch, WebSockets, Web Audio, camera streams, WebRTC, timers, and ID/time generation) MUST be abstracted behind interfaces with both production and test double implementations.
2. **Rule 2: Pure Business Logic** — State transitions, color assignments, chess engine rules, rating updates, and progress diffing MUST reside in pure functions following the **Fetch → Calculate → Persist** sequence. Never execute I/O or mutate shared state inside pure functions.
3. **Rule 3: Dependency Direction** — Dependencies point strictly inward toward business logic. Domain features depend only on interface contracts defined in the domain or shared layer. Infrastructure implements interfaces defined by the domain layer. All dependencies are injected via constructor DI and wired at Composition Roots.
4. **Strict Module Encapsulation** — Every feature and platform package MUST expose its public API strictly through a single root `index.ts`. Deep imports bypassing `index.ts` are strictly forbidden.
5. **Universal Observability** — Every operation entry point MUST implement 3-point structured logging with a correlation ID. Invariant message templates are mandatory. Direct `console.*` calls in feature code are strictly prohibited.

---

## 2. Directory Layout & Barrel Export Standards (`index.ts`)

### 2.1 Monorepo Layout (`project-structure.md`)

```
fun-chess/
├── shared/                                 # @fun-chess/shared Core Package
│   ├── src/
│   │   ├── index.ts                        # Root package barrel export
│   │   ├── contracts/                      # Wire models, Zod schemas, errors, system interfaces
│   │   │   ├── index.ts                    # Contracts barrel
│   │   │   ├── models.ts                   # Domain entities (Player, RoomState, GameState)
│   │   │   ├── schemas.ts                  # Zod validation schemas
│   │   │   ├── events.ts                   # Socket.IO client-server event contracts
│   │   │   ├── errors.ts                   # AppError hierarchy & ErrorCode enum
│   │   │   ├── system.ts                   # IClock, IIdGenerator abstractions (MAJ-014)
│   │   │   └── api.ts                      # HTTP response types
│   │   └── utils/                          # Pure business logic & algorithms
│   │       ├── index.ts                    # Utils barrel
│   │       ├── chess_factory.ts            # Chess instance factory
│   │       ├── dictionary_mapper.ts        # Compact dictionary encoding (deterministic time)
│   │       ├── progress_merger/            # Decomposed domain mergers (MIN-022)
│   │       ├── star_calculator.ts          # Centralized scoring calculations (MIN-023)
│   │       └── schema_validator.ts         # Runtime schema validation helpers
│   └── package.json
│
├── apps/
│   ├── server/                             # Node.js HTTP + Socket.IO Backend
│   │   ├── src/
│   │   │   ├── index.ts                    # Server Composition Root & Bootstrap
│   │   │   ├── features/                   # Vertical business slices
│   │   │   │   ├── rooms/                  # Room lifecycle, matchmaking & sessions
│   │   │   │   │   ├── index.ts            # Rooms feature public API barrel
│   │   │   │   │   ├── room.logic.ts       # Pure room state transition functions (MAJ-015)
│   │   │   │   │   ├── room.service.ts     # RoomService implementation
│   │   │   │   │   ├── room.interface.ts   # IRoomService & IRoomGameAdapter contracts
│   │   │   │   │   ├── room.store.ts       # RoomStore abstract interface
│   │   │   │   │   ├── in_memory_room.store.ts # Production in-memory room store adapter
│   │   │   │   │   ├── mock_room.store.ts  # Test double store adapter
│   │   │   │   │   ├── session_registry.ts # Session registry interface
│   │   │   │   │   ├── in_memory_session_registry.ts # Session storage
│   │   │   │   │   ├── disconnect_timer_registry.ts # Abandonment timer registry
│   │   │   │   │   ├── room.socket_handler.ts # Socket event listeners
│   │   │   │   │   ├── room.errors.ts      # Feature error re-exports & custom errors
│   │   │   │   │   └── __tests__/          # Co-located unit & integration tests
│   │   │   │   ├── game/                   # Move validation, turns & match rules
│   │   │   │   │   ├── index.ts            # Game feature public API barrel
│   │   │   │   │   ├── game.service.ts     # GameService implementation (MAJ-017)
│   │   │   │   │   ├── game.interface.ts   # IGameService contract
│   │   │   │   │   ├── chess_engine.ts     # Chess rules engine adapter
│   │   │   │   │   ├── game.socket_handler.ts # Game socket event listeners
│   │   │   │   │   └── __tests__/          # Co-located tests
│   │   │   │   └── lan/                    # Relay addressing & network discovery
│   │   │   │       ├── index.ts            # LAN feature public API barrel
│   │   │   │       ├── relay_address.service.ts # Production IP & QR resolver
│   │   │   │       ├── lan_info.controller.ts # HTTP LAN discovery controller
│   │   │   │       └── __tests__/          # Co-located tests
│   │   │   └── platform/                   # Infrastructure & platform adapters
│   │   │       ├── index.ts                # Platform public API barrel
│   │   │       ├── config/                 # Zod environment parsing & validation
│   │   │       ├── http/                   # HTTP server, routing, error envelope
│   │   │       ├── socket/                 # Socket.io setup, rate limiting, logging
│   │   │       ├── logger/                 # Structured Pino logger adapter
│   │   │       ├── time/                   # SystemClock & UuidGenerator (MAJ-014)
│   │   │       └── lifecycle/              # Graceful shutdown coordinator
│   │   └── package.json
│   │
│   └── client/                             # Vue 3 + Vite Frontend
│       ├── src/
│       │   ├── main.ts                     # Client Composition Root & Bootstrap
│       │   ├── App.vue                     # Shell root component
│       │   ├── platform/                   # Browser I/O abstractions
│       │   │   ├── di/                     # Vue DI tokens & useInject* helpers (MAJ-009)
│       │   │   ├── api/                    # IApiClient & FetchApiClient
│       │   │   ├── storage/                # KeyValueStorage & safe LocalStorage (CRIT-001)
│       │   │   ├── audio/                  # IAudioService & WebAudioSynthesizer
│       │   │   ├── telemetry/              # ILogger & ClientLogger
│       │   │   ├── socket/                 # Typed Socket.IO client factory
│       │   │   ├── hardware/               # Browser API abstractions (MAJ-012)
│       │   │   │   ├── file_downloader.ts  # IFileDownloader
│       │   │   │   ├── haptics.ts          # IHapticsService
│       │   │   │   └── webrtc_discovery.ts # IWebRtcDiscovery
│       │   │   └── index.ts                # Platform public barrel
│       │   ├── features/                   # Client vertical slices
│       │   │   ├── lobby/                  # Multiplayer lobby
│       │   │   ├── board/                  # Chess board rendering & interactions
│       │   │   ├── ai/                     # Bot engine & worker runner
│       │   │   ├── puzzles/                # Daily puzzle runner & training
│       │   │   ├── scenarios/              # Academy scenario runner
│       │   │   ├── portability/            # QR sync, export/import
│       │   │   └── pwa/                    # PWA installation & network status
│       │   └── composables/                # Cross-cutting UI composables
│       │       ├── useSocket.ts            # Socket lifecycle & multiplayer coordination
│       │       ├── useChessGame.ts         # Shared reactive chess state
│       │       ├── useTheme.ts             # Dark/Light theme switching
│       │       └── useNotification.ts      # Toast notifications
│       └── package.json
```

### 2.2 Barrel Export Rules & Enforcement (MAJ-010, MAJ-024)

1. **Strict Single Entry Point**: Every feature and platform package MUST export its public symbols through `index.ts`.
2. **Prohibition of Deep Imports**:
   ```typescript
   // ❌ FORBIDDEN: Deep imports into feature internals
   import { registerRoomSocketHandlers } from "./features/rooms/room.socket_handler.js";
   import { InMemoryRoomStore } from "./features/rooms/in_memory_room.store.js";
   import { safeLocalStorage } from "@/platform/storage/safe_local_storage";

   // ✅ MANDATORY: Import exclusively through public barrels
   import { registerRoomSocketHandlers, InMemoryRoomStore } from "./features/rooms/index.js";
   import { safeLocalStorage } from "@/platform/storage";
   ```
3. **Dead Code Elimination (MAJ-024)**:
   - Deprecated `apps/server/src/features/lan/lan.service.ts` and its test suite are deleted.
   - `apps/server/src/features/lan/index.ts` exports only `RelayAddressService`, `IRelayAddressService`, and `LanInfoController`.
4. **Server Composition Root Standard**:
   - `apps/server/src/index.ts` imports all dependencies from feature and platform barrels only:
   ```typescript
   import { loadServerConfig, ServerEnv } from "./platform/config/index.js";
   import { PinoLogger, Logger } from "./platform/logger/index.js";
   import { SystemClock, UuidGenerator } from "./platform/time/index.js";
   import { RoomService, InMemoryRoomStore, registerRoomSocketHandlers } from "./features/rooms/index.js";
   import { GameService, registerGameSocketHandlers } from "./features/game/index.js";
   import { RelayAddressService, LanInfoController } from "./features/lan/index.js";
   import { createHttpServer } from "./platform/http/index.js";
   ```

---

## 3. System Abstractions: Time (`IClock`) & ID Generation (`IIdGenerator`) (MAJ-013, MAJ-014)

### 3.1 Problem Analysis
1. `apps/server/src/features/rooms/clock.ts` re-exported `SystemClock` and `UuidGenerator` from `platform/time/index.js`, violating Rule 3 (Dependency Direction: domain features importing platform infrastructure).
2. Domain utility functions (`DefaultDictionaryMapper`, `mergeUnifiedProgress`) called `Date.now()` internally without accepting an explicit timestamp, causing non-deterministic outputs and varying CRC32 checksums (MAJ-013).

### 3.2 Canonical Interface Contracts (`shared/src/contracts/system.ts`)

```typescript
/**
 * Time abstraction for isolating system clock I/O.
 * Enables deterministic testing of timeouts, TTLs, and timestamps.
 */
export interface IClock {
  /** Returns the current timestamp in milliseconds since Unix epoch */
  now(): number;
}

/**
 * ID and randomness abstraction for isolating non-deterministic generation.
 */
export interface IIdGenerator {
  /** Generates a unique string identifier (e.g. UUIDv4) */
  generateId(): string;
  /** Generates a pseudo-random integer between min (inclusive) and max (exclusive) */
  generateRandomInt?(min: number, max: number): number;
}
```

Both interfaces are exported directly from `@fun-chess/shared`:
```typescript
// shared/src/index.ts
export * from "./contracts/system.js";
```

### 3.3 Platform Implementations (`apps/server/src/platform/time/clock.ts`)

```typescript
import { randomUUID, randomInt } from "node:crypto";
import type { IClock, IIdGenerator } from "@fun-chess/shared";

/**
 * Production clock adapter backed by Date.now().
 */
export class SystemClock implements IClock {
  public now(): number {
    return Date.now();
  }
}

/**
 * Production ID generator adapter backed by node:crypto.
 */
export class UuidGenerator implements IIdGenerator {
  public generateId(): string {
    return randomUUID();
  }

  public generateRandomInt(min: number, max: number): number {
    return randomInt(min, max);
  }
}
```

### 3.4 Test Doubles (`apps/server/src/platform/time/mock_clock.ts`)

```typescript
import type { IClock, IIdGenerator } from "@fun-chess/shared";

export class MockClock implements IClock {
  private currentTime: number;

  constructor(initialTime: number = 1700000000000) {
    this.currentTime = initialTime;
  }

  public now(): number {
    return this.currentTime;
  }

  public advance(ms: number): void {
    this.currentTime += ms;
  }

  public set(time: number): void {
    this.currentTime = time;
  }
}

export class MockIdGenerator implements IIdGenerator {
  private counter: number = 0;
  private predefinedIds: string[] = [];

  constructor(predefinedIds: string[] = []) {
    this.predefinedIds = predefinedIds;
  }

  public generateId(): string {
    if (this.predefinedIds.length > 0) {
      return this.predefinedIds.shift()!;
    }
    this.counter += 1;
    return `test-id-${this.counter}`;
  }

  public generateRandomInt(min: number, _max: number): number {
    return min;
  }
}
```

### 3.5 Pure Function Determinism Contract (MAJ-013)
Pure utility and mapping functions in `@fun-chess/shared` must NEVER invoke `Date.now()` or `Math.random()`. The caller service must pass explicit timestamps:

```typescript
// ✅ MANDATORY: Explicit now timestamp passed as argument
export function toCompact(payload: ExportPayload, now: number): CompactExport {
  return {
    v: payload.version,
    t: now,
    d: payload.data,
  };
}

export function mergeUnifiedProgress(
  local: UnifiedProgress,
  remote: UnifiedProgress,
  now: number,
): MergeResult {
  // Pure, deterministic computation
}
```

---

## 4. RoomService / GameService Boundary Pattern (MAJ-017)

### 4.1 Problem Analysis
`GameService` in `apps/server/src/features/game/game.service.ts` directly accepted `RoomStore` in its constructor and performed raw store mutations (`this.store.mutate(...)`), bypassing `RoomService` boundaries and encapsulations.

### 4.2 Architectural Decoupling: Room Mutation Adapter Contract

```
┌────────────────────────────────┐         ┌────────────────────────────────┐
│          Game Feature          │         │         Rooms Feature          │
│                                │         │                                │
│  ┌──────────────────────────┐  │         │  ┌──────────────────────────┐  │
│  │       GameService        │  │         │  │       RoomService        │  │
│  │                          │  │         │  │                          │  │
│  │  1. Validates chess move │  │         │  │ 1. Coordinates lock      │  │
│  │  2. Calculates game state│──┼─────────┼─▶│ 2. Runs room.logic.ts    │  │
│  │  3. Calls IRoomGame-     │  │  Calls  │  │ 3. Mutates RoomStore     │  │
│  │     Adapter methods      │  │         │  │                          │  │
│  └──────────────────────────┘  │         │  └─────────────┬────────────┘  │
│                                │         │                │               │
└────────────────────────────────┘         │                ▼               │
                                           │  ┌──────────────────────────┐  │
                                           │  │        RoomStore         │  │
                                           │  └──────────────────────────┘  │
                                           └────────────────────────────────┘
```

### 4.3 Interface Contract: `IRoomGameAdapter` (`apps/server/src/features/rooms/room.interface.ts`)

```typescript
import type { RoomState, GameOverPayload, GameState } from "@fun-chess/shared";

/**
 * Explicit contract exposed by the Rooms feature for Game execution.
 * Prevents GameService from touching RoomStore directly (MAJ-017).
 */
export interface IRoomGameAdapter {
  /**
   * Retrieves a read-only snapshot of current room state.
   */
  getRoom(roomCode: string): Promise<RoomState>;

  /**
   * Applies an executed chess move and state update to the room under exclusive lock.
   */
  applyGameMove(
    roomCode: string,
    nextGameState: GameState,
    gameOverPayload?: GameOverPayload,
  ): Promise<RoomState>;

  /**
   * Finalizes a match with an explicit game-over payload (resignation, timeout, draw).
   */
  finalizeGame(
    roomCode: string,
    gameOverPayload: GameOverPayload,
  ): Promise<RoomState>;

  /**
   * Records a proposed draw offer or response in the room state.
   */
  updateDrawOffer(
    roomCode: string,
    drawOffer: RoomState["drawOffer"],
  ): Promise<RoomState>;

  /**
   * Records a rematch proposal or acceptance in the room state.
   */
  updateRematch(
    roomCode: string,
    rematch: RoomState["rematch"],
    newGameState?: GameState,
  ): Promise<RoomState>;
}
```

### 4.4 `RoomService` Implementation of `IRoomGameAdapter`

`RoomService` implements `IRoomGameAdapter`, ensuring all mutations pass through room lock management and version increments:

```typescript
export class RoomService implements IRoomService, IRoomGameAdapter {
  // ...

  public async applyGameMove(
    roomCode: string,
    nextGameState: GameState,
    gameOverPayload?: GameOverPayload,
  ): Promise<RoomState> {
    const code = roomCode.toUpperCase();
    return this.store.mutate(code, async (room) => {
      const now = this.clock.now();
      return applyGameMoveTransition(room, nextGameState, gameOverPayload, now);
    });
  }

  public async finalizeGame(
    roomCode: string,
    gameOverPayload: GameOverPayload,
  ): Promise<RoomState> {
    const code = roomCode.toUpperCase();
    return this.store.mutate(code, async (room) => {
      const now = this.clock.now();
      return finalizeGameTransition(room, gameOverPayload, now);
    });
  }
}
```

### 4.5 `GameService` Constructor Refactoring (`apps/server/src/features/game/game.service.ts`)

```typescript
export class GameService implements IGameService {
  constructor(
    private readonly roomAdapter: IRoomGameAdapter,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly sessionRegistry?: SessionRegistry,
  ) {}

  public async makeMove(
    req: MakeMoveRequest,
    socketId: string,
  ): Promise<MoveApplicationResult> {
    const room = await this.roomAdapter.getRoom(req.roomCode);

    if (room.status !== "playing") {
      throw new GameNotActiveError(room.status);
    }

    const player = this.getPlayerBySocketId(room, socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }

    if (player.color !== room.game.turn) {
      throw new NotYourTurnError();
    }

    // Pure chess move validation via ChessEngine
    const outcome = ChessEngine.validateAndApplyMove(
      room.game.fen,
      req.move,
      player.color,
      room.game.moveHistory,
    );

    if (!outcome.success) {
      throw new InvalidMoveError(outcome.error);
    }

    // Determine game over payload if checkmate or draw
    const gameOverPayload = this.evaluateGameOver(room, outcome.nextState, player);

    // Persist through the RoomService adapter (no direct store access!)
    const updatedRoom = await this.roomAdapter.applyGameMove(
      room.roomCode,
      outcome.nextState,
      gameOverPayload,
    );

    return {
      success: true,
      moveResult: outcome.moveResult,
      gameState: updatedRoom.game,
      gameOverPayload,
      checkInfo: this.evaluateCheck(outcome.nextState),
    };
  }
}
```

---

## 5. Pure Room State Transition Logic (`room.logic.ts`) (MAJ-015)

### 5.1 Architecture: Fetch → Calculate → Persist

In accordance with Rule 2 (Pure Business Logic), all room state transitions, player color assignments, spectator promotions, and status mutations are extracted from `RoomService` into `apps/server/src/features/rooms/room.logic.ts`.

```
                  ┌─────────────────────────────────────┐
                  │ 1. FETCH: RoomService acquires      │
                  │    RoomState from RoomStore under   │
                  │    exclusive lock                   │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │ 2. CALCULATE: Pure function in      │
                  │    room.logic.ts calculates         │
                  │    nextRoom without side effects    │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │ 3. PERSIST: RoomService commits     │
                  │    nextRoom to RoomStore & triggers │
                  │    events/timers                    │
                  └─────────────────────────────────────┘
```

### 5.2 Characteristics of `room.logic.ts`:
- **100% Pure Functions**: No `async`, no `Promise`, no I/O, no network, no database/store access.
- **Deterministic**: Accepts all timestamps (`now: number`), generated IDs, and player inputs as arguments.
- **Immutable Updates**: Returns a new `RoomState` object without mutating the input state.
- **Zero Platform Dependencies**: Imports domain types strictly from `@fun-chess/shared`.

### 5.3 Pure Function Specifications (`apps/server/src/features/rooms/room.logic.ts`)

```typescript
import {
  RoomState,
  Player,
  PieceColor,
  GameOverPayload,
  createInitialGameState,
  createGameOverPayload,
  RoomFullError,
  UnauthorizedError,
  PlayerNotInRoomError,
} from "@fun-chess/shared";

/**
 * Creates initial RoomState for a new host player.
 */
export function createInitialRoomState(params: {
  roomCode: string;
  hostPlayer: Player;
  createdAt: number;
}): RoomState {
  return {
    roomCode: params.roomCode,
    status: "lobby",
    hostId: params.hostPlayer.id,
    createdAt: params.createdAt,
    lastActivityAt: params.createdAt,
    version: 1,
    whitePlayer: params.hostPlayer.color === "w" ? params.hostPlayer : null,
    blackPlayer: params.hostPlayer.color === "b" ? params.hostPlayer : null,
    spectators: [],
    game: createInitialGameState(),
    drawOffer: null,
    rematch: null,
  };
}

/**
 * Evaluates player color preference and assigns colors for a new room.
 */
export function assignPlayerColors(preferredColor?: PieceColor | "random", randomInt?: number): {
  hostColor: PieceColor;
  guestColor: PieceColor;
} {
  if (preferredColor === "w") return { hostColor: "w", guestColor: "b" };
  if (preferredColor === "b") return { hostColor: "b", guestColor: "w" };
  
  const isWhite = (randomInt ?? 0) % 2 === 0;
  return isWhite
    ? { hostColor: "w", guestColor: "b" }
    : { hostColor: "b", guestColor: "w" };
}

/**
 * Pure transition adding a player or spectator to an existing room.
 */
export function addPlayerToRoom(
  room: RoomState,
  player: Player,
  asSpectator: boolean,
  now: number,
): { nextRoom: RoomState; assignedColor?: PieceColor; isSpectator: boolean } {
  if (asSpectator) {
    return {
      nextRoom: {
        ...room,
        spectators: [...room.spectators, player],
        lastActivityAt: now,
      },
      isSpectator: true,
    };
  }

  // Active player joining
  if (room.whitePlayer && room.blackPlayer) {
    throw new RoomFullError(room.roomCode);
  }

  let assignedColor: PieceColor;
  let nextWhite = room.whitePlayer;
  let nextBlack = room.blackPlayer;

  if (!nextWhite) {
    assignedColor = "w";
    nextWhite = { ...player, color: "w" };
  } else {
    assignedColor = "b";
    nextBlack = { ...player, color: "b" };
  }

  const bothPlayersPresent = nextWhite !== null && nextBlack !== null;
  const nextStatus = bothPlayersPresent && room.status === "lobby" ? "playing" : room.status;

  return {
    nextRoom: {
      ...room,
      status: nextStatus,
      whitePlayer: nextWhite,
      blackPlayer: nextBlack,
      lastActivityAt: now,
    },
    assignedColor,
    isSpectator: false,
  };
}

/**
 * Pure transition updating room state when a player disconnects.
 */
export function disconnectPlayerTransition(
  room: RoomState,
  playerId: string,
  now: number,
): { nextRoom: RoomState; paused: boolean } {
  let paused = false;
  let nextStatus = room.status;
  let nextWhite = room.whitePlayer;
  let nextBlack = room.blackPlayer;

  if (nextWhite?.id === playerId) {
    nextWhite = { ...nextWhite, isConnected: false };
    if (room.status === "playing") {
      nextStatus = "paused_disconnect";
      paused = true;
    }
  } else if (nextBlack?.id === playerId) {
    nextBlack = { ...nextBlack, isConnected: false };
    if (room.status === "playing") {
      nextStatus = "paused_disconnect";
      paused = true;
    }
  }

  return {
    nextRoom: {
      ...room,
      status: nextStatus,
      whitePlayer: nextWhite,
      blackPlayer: nextBlack,
      spectators: room.spectators.filter((s) => s.id !== playerId),
      lastActivityAt: now,
    },
    paused,
  };
}

/**
 * Pure transition reconnecting an authenticated player with a new socket ID.
 */
export function reconnectPlayerTransition(
  room: RoomState,
  playerId: string,
  newSocketId: string,
  now: number,
): { nextRoom: RoomState; unpaused: boolean } {
  let unpaused = false;
  let nextWhite = room.whitePlayer;
  let nextBlack = room.blackPlayer;

  if (nextWhite?.id === playerId) {
    nextWhite = { ...nextWhite, socketId: newSocketId, isConnected: true };
  } else if (nextBlack?.id === playerId) {
    nextBlack = { ...nextBlack, socketId: newSocketId, isConnected: true };
  } else {
    throw new PlayerNotInRoomError(newSocketId);
  }

  let nextStatus = room.status;
  if (
    room.status === "paused_disconnect" &&
    nextWhite?.isConnected &&
    nextBlack?.isConnected
  ) {
    nextStatus = "playing";
    unpaused = true;
  }

  return {
    nextRoom: {
      ...room,
      status: nextStatus,
      whitePlayer: nextWhite,
      blackPlayer: nextBlack,
      lastActivityAt: now,
    },
    unpaused,
  };
}

/**
 * Pure transition removing a leaving player from the room.
 */
export function leaveRoomTransition(
  room: RoomState,
  playerId: string,
  now: number,
): {
  nextRoom: RoomState;
  shouldDelete: boolean;
  gameOverPayload?: GameOverPayload;
} {
  const isWhite = room.whitePlayer?.id === playerId;
  const isBlack = room.blackPlayer?.id === playerId;

  if (!isWhite && !isBlack) {
    return {
      nextRoom: {
        ...room,
        spectators: room.spectators.filter((s) => s.id !== playerId),
        lastActivityAt: now,
      },
      shouldDelete: false,
    };
  }

  // Active game in progress: resigning player forfeits match
  if (room.status === "playing" || room.status === "paused_disconnect") {
    const winnerColor: PieceColor = isWhite ? "b" : "w";
    const winnerPlayer = isWhite ? room.blackPlayer : room.whitePlayer;

    const gameOverPayload = createGameOverPayload({
      winner: winnerColor,
      winnerName: winnerPlayer?.name || (winnerColor === "w" ? "White" : "Black"),
      reason: "resignation",
      finalFen: room.game.fen,
      totalMoves: room.game.moveCount,
      startTimeMs: room.createdAt,
    });

    return {
      nextRoom: {
        ...room,
        status: "game_over",
        whitePlayer: isWhite ? null : room.whitePlayer,
        blackPlayer: isBlack ? null : room.blackPlayer,
        lastActivityAt: now,
      },
      shouldDelete: false,
      gameOverPayload,
    };
  }

  // In lobby or game over: check if room is completely empty
  const remainingPlayer = isWhite ? room.blackPlayer : room.whitePlayer;
  const shouldDelete = remainingPlayer === null && room.spectators.length === 0;

  return {
    nextRoom: {
      ...room,
      whitePlayer: isWhite ? null : room.whitePlayer,
      blackPlayer: isBlack ? null : room.blackPlayer,
      lastActivityAt: now,
    },
    shouldDelete,
  };
}
```

---

## 6. Logging Conventions & Observability Mandate

### 6.1 Mandatory 3-Point Structured Logging Pattern

Every operation entry point (HTTP handler, Socket handler, client action, background job, database transaction) MUST include three structured log events:

```
[Start Entry Point]  ──▶  info/debug: operation, correlationId, actor/ip
        │
   [Execution]
        │
   ┌────┴──────────────────────────┐
   ▼                               ▼
[Success]                       [Failure]
info: operation, correlationId, error/warn: operation, correlationId,
duration, durationMs, result    duration, error object (stack, code)
```

### 6.2 Invariant Message Templates (MIN-012)

Log messages MUST be static string templates. NEVER interpolate dynamic variables into the message string:

```typescript
// ❌ REJECTED: High-cardinality dynamic message string
logger.info(`Player ${playerId} joined room ${roomCode} with color ${color}`);

// ✅ APPROVED: Static invariant message template + structured context object
logger.info("Player joined room", {
  operation: "room_player_joined",
  correlationId,
  roomCode,
  playerId,
  color,
  duration,
});
```

### 6.3 Mandatory Context Fields

| Field | Type | Description | Mandatory On |
|---|---|---|---|
| `operation` | `string` | Lowercase snake_case identifier (e.g. `room_create`, `socket_move`) | All 3 points |
| `correlationId` | `string` | UUID tracing identifier across services | All 3 points |
| `duration` | `number` | Elapsed time in milliseconds (`Math.round(performance.now() - start)`) | Success & Failure |
| `userId` / `playerId` | `string` | Authenticated actor identifier | When available |
| `clientIp` | `string` | Remote network IP address | Ingress handlers |
| `error` | `object` | Sanitized error object with `message`, `code`, and `stack` | Failure point |

### 6.4 Client Socket Action 3-Point Instrumentation (MAJ-019, MIN-014)

Every public method in `apps/client/src/composables/useSocket.ts` (`createRoom`, `joinRoom`, `makeMove`, `resign`, `offerDraw`, `respondDraw`, `leaveRoom`, `requestRematch`) MUST log start, success, and failure with a correlation ID:

```typescript
export async function makeMove(move: string): Promise<boolean> {
  const correlationId = generateCorrelationId();
  const startTime = performance.now();
  const logger = useInjectLogger();

  logger.debug("Executing client socket move", {
    operation: "client_socket_make_move",
    correlationId,
    roomCode: currentRoom.value?.roomCode,
    move,
  });

  try {
    const result = await emitWithTimeout<MakeMoveRequest, MakeMoveResponse>(
      "game:move",
      { roomCode: currentRoom.value!.roomCode, move },
      8000,
      correlationId,
    );

    const duration = Math.round(performance.now() - startTime);
    logger.info("Client socket move succeeded", {
      operation: "client_socket_make_move",
      correlationId,
      roomCode: currentRoom.value?.roomCode,
      duration,
      durationMs: duration,
    });

    return true;
  } catch (err) {
    const duration = Math.round(performance.now() - startTime);
    logger.warn("Client socket move failed", {
      operation: "client_socket_make_move",
      correlationId,
      roomCode: currentRoom.value?.roomCode,
      duration,
      durationMs: duration,
      error: err instanceof Error ? { message: err.message } : { raw: err },
    });
    return false;
  }
}
```

### 6.5 Zero Direct Console Logging Mandate (MAJ-023)

Direct invocations of `console.log`, `console.warn`, `console.info`, and `console.error` in production feature code are strictly prohibited. All log emissions must route through `ILogger`.

```typescript
// ❌ REJECTED: Direct console call
console.warn("WebRTC discovery failed", error);

// ✅ APPROVED: Structured logger call
logger.warn("WebRTC discovery failed", {
  operation: "lan_webrtc_discovery",
  error: error instanceof Error ? error.message : String(error),
});
```

### 6.6 Telemetry Sanitization & PII Scrubbing (MAJ-021, MAJ-022, ENH-007)

1. **URL Query String Stripping (MAJ-021)**: In `FetchApiClient`, URLs must have their query strings stripped before emitting log records:
   ```typescript
   const sanitizedUrl = fullUrl.split("?")[0];
   logger.info("HTTP request completed", {
     operation: "http_request",
     url: sanitizedUrl,
     status: response.status,
     duration,
   });
   ```
2. **Background Job Result Sanitization (MAJ-022)**: All job results passed to `runLoggedJob` must be scrubbed using `sanitizePayload`:
   ```typescript
   const sanitizedResult = sanitizePayload(result);
   logger.info("Background job completed", {
     operation: jobName,
     duration,
     result: sanitizedResult,
   });
   ```
3. **Sensitive Key Expansion (ENH-007)**: Redaction regular expression in `ClientLogger` and `PinoLogger` must include:
   ```typescript
   export const SENSITIVE_KEY_REGEX =
     /password|token|sessionToken|secret|key|authorization|bearer|cookie|apiKey|credential/i;
   ```

---

## 7. Client Dependency Injection Pattern (`useInject*`) (MAJ-009, MAJ-012)

### 7.1 Problem Analysis
Components (`App.vue`) and composables previously directly imported module-level singletons (`apiClient`, `safeLocalStorage`, `audioSynthesizer`, `logger`), bypassing Vue's `provide`/`inject` system and forcing unit tests to employ `vi.mock` monkey-patching.

### 7.2 Injection Token Registry (`apps/client/src/platform/di/tokens.ts`)

```typescript
import type { InjectionKey } from "vue";
import type { IApiClient } from "../api/api_client.interface";
import type { KeyValueStorage } from "../storage/key_value_storage";
import type { IAudioService } from "../audio/audio.interface";
import type { ILogger } from "../telemetry";
import type { IFileDownloader, IHapticsService, IWebRtcDiscovery } from "../hardware";
import type { ScenarioProgressStore, PuzzleProgressStore, ProgressStorage } from "@fun-chess/shared";

export const API_CLIENT_KEY: InjectionKey<IApiClient> = Symbol("API_CLIENT");
export const STORAGE_KEY: InjectionKey<KeyValueStorage> = Symbol("STORAGE");
export const SESSION_STORAGE_KEY: InjectionKey<KeyValueStorage> = Symbol("SESSION_STORAGE");
export const AUDIO_SERVICE_KEY: InjectionKey<IAudioService> = Symbol("AUDIO_SERVICE");
export const LOGGER_KEY: InjectionKey<ILogger> = Symbol("LOGGER");
export const SCENARIO_STORE_KEY: InjectionKey<ScenarioProgressStore> = Symbol("SCENARIO_STORE");
export const PUZZLE_STORE_KEY: InjectionKey<PuzzleProgressStore> = Symbol("PUZZLE_STORE");
export const PROGRESS_STORAGE_KEY: InjectionKey<ProgressStorage> = Symbol("PROGRESS_STORAGE");

// Hardware & Browser API tokens (MAJ-012)
export const FILE_DOWNLOADER_KEY: InjectionKey<IFileDownloader> = Symbol("FILE_DOWNLOADER");
export const HAPTICS_KEY: InjectionKey<IHapticsService> = Symbol("HAPTICS");
export const WEBRTC_DISCOVERY_KEY: InjectionKey<IWebRtcDiscovery> = Symbol("WEBRTC_DISCOVERY");
```

### 7.3 Injection Helpers with Fallbacks (`apps/client/src/platform/di/index.ts`)

Every service provides a `useInjectX(fallback?: IX): IX` helper. If no dependency was provided upstream via `app.provide()`, the helper defaults to the platform singleton:

```typescript
import { inject } from "vue";
import {
  API_CLIENT_KEY,
  STORAGE_KEY,
  SESSION_STORAGE_KEY,
  AUDIO_SERVICE_KEY,
  LOGGER_KEY,
  FILE_DOWNLOADER_KEY,
  HAPTICS_KEY,
  WEBRTC_DISCOVERY_KEY,
} from "./tokens";
import { apiClient as defaultApiClient } from "../api";
import { safeLocalStorage, safeSessionStorage } from "../storage";
import { audioSynthesizer as defaultAudioSynthesizer } from "../audio/audio_synthesizer";
import { logger as defaultLogger } from "../telemetry";
import { defaultFileDownloader, defaultHapticsService, defaultWebRtcDiscovery } from "../hardware";

export function useInjectApiClient(fallback?: IApiClient): IApiClient {
  return inject(API_CLIENT_KEY, fallback ?? defaultApiClient);
}

export function useInjectStorage(fallback?: KeyValueStorage): KeyValueStorage {
  return inject(STORAGE_KEY, fallback ?? safeLocalStorage);
}

export function useInjectSessionStorage(fallback?: KeyValueStorage): KeyValueStorage {
  return inject(SESSION_STORAGE_KEY, fallback ?? safeSessionStorage);
}

export function useInjectAudioService(fallback?: IAudioService): IAudioService {
  return inject(AUDIO_SERVICE_KEY, fallback ?? defaultAudioSynthesizer);
}

export function useInjectLogger(fallback?: ILogger): ILogger {
  return inject(LOGGER_KEY, fallback ?? defaultLogger);
}

export function useInjectFileDownloader(fallback?: IFileDownloader): IFileDownloader {
  return inject(FILE_DOWNLOADER_KEY, fallback ?? defaultFileDownloader);
}

export function useInjectHaptics(fallback?: IHapticsService): IHapticsService {
  return inject(HAPTICS_KEY, fallback ?? defaultHapticsService);
}

export function useInjectWebRtcDiscovery(fallback?: IWebRtcDiscovery): IWebRtcDiscovery {
  return inject(WEBRTC_DISCOVERY_KEY, fallback ?? defaultWebRtcDiscovery);
}
```

### 7.4 Consumer Rule for Components & Composables

Components and composables MUST consume services exclusively through `useInject*`:

```typescript
// ❌ REJECTED: Direct singleton import
import { safeLocalStorage } from "@/platform/storage";
import { audioSynthesizer } from "@/platform/audio/audio_synthesizer";

// ✅ APPROVED: Injected dependency with optional parameter override for tests
export function useChessAudio(injectedAudio?: IAudioService) {
  const audio = useInjectAudioService(injectedAudio);
  
  function playMoveSound() {
    audio.play("move");
  }
  return { playMoveSound };
}
```

---

## 8. Reference Skeleton Feature Directory Layout

The following skeleton serves as the gold standard for all vertical feature slices in `apps/server/src/features/`:

```
apps/server/src/features/example_feature/
├── index.ts                     # Public API barrel (re-exports only public interfaces & services)
├── example.interface.ts         # Domain contracts (IExampleService, IExampleStore)
├── example.logic.ts             # 100% pure state transition functions (Fetch → Calculate → Persist)
├── example.service.ts           # Orchestration service (DI constructor, I/O coordination)
├── example.store.ts             # Store abstraction interface
├── in_memory_example.store.ts   # Production store adapter
├── mock_example.store.ts        # Test double store adapter
├── example.socket_handler.ts    # Socket.IO ingress event registration
├── example.errors.ts            # Domain error classes inheriting from AppError
└── __tests__/                   # Co-located unit and integration tests
    ├── example.logic.spec.ts    # Pure unit tests for logic functions (0 mocks, blazing fast)
    ├── example.service.spec.ts  # Service tests with MockStore & MockClock
    └── example.socket.spec.ts   # Socket integration tests
```

---

## 9. Implementation Checklist by Scope Card

### `SC-1-SHARED` (@backend-engineer)
- [ ] Define `IClock` and `IIdGenerator` in `shared/src/contracts/system.ts`.
- [ ] Ensure pure utilities (`toCompact`, `mergeUnifiedProgress`) take explicit `now: number` timestamps.

### `SC-2-SERVER` (@tech-lead[server])
- [ ] Extract pure transition functions from `RoomService` into `apps/server/src/features/rooms/room.logic.ts`.
- [ ] Define `IRoomGameAdapter` in `apps/server/src/features/rooms/room.interface.ts`.
- [ ] Implement `IRoomGameAdapter` on `RoomService`.
- [ ] Refactor `GameService` to consume `IRoomGameAdapter` instead of `RoomStore`.
- [ ] Delete deprecated `apps/server/src/features/lan/lan.service.ts` and update `lan/index.ts`.
- [ ] Enforce barrel exports on `apps/server/src/index.ts`.
- [ ] Co-locate unit tests for `platform/time` and feature logic.

### `SC-3-CLIENT-CORE` (@tech-lead[client-core])
- [ ] Expand DI tokens and helpers in `apps/client/src/platform/di` for hardware services (`IFileDownloader`, `IHapticsService`, `IWebRtcDiscovery`).
- [ ] Instrument public actions in `useSocket.ts` with 3-point structured logging and correlation IDs.
- [ ] Replace direct `console.*` calls across `useLanDiscovery.ts`, `useProgressSync.ts`, and core composables with `ILogger`.
- [ ] Strip query strings in `FetchApiClient` before logging URLs.
- [ ] Expand sensitive key redaction in `ClientLogger`.

### `SC-4-CLIENT-FEATURES` (@tech-lead[client-features])
- [ ] Refactor feature components and composables (`App.vue`, `usePuzzleRunner`, `useScenarioRunner`) to consume dependencies via `useInject*`.
- [ ] Remove hardcoded singleton imports in features.
