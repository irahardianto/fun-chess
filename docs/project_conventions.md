# Project Architecture & Conventions Guide

**Status:** FROZEN ARCHITECTURAL CONTRACT  
**Version:** 1.0.0  
**Initiative:** Cloud-Ready Zero-Database PWA, Ephemeral Cloud Relay & Deflate-QR Progress Synchronization  
**Target Packages:** `@fun-chess/shared`, `@fun-chess/server`, `@fun-chess/client`, `infra`  
**Date:** 2026-08-27  

---

## 1. Project Organization & Modular Directory Layout

The Fun Chess codebase follows a strict **Feature-Driven Vertical Slice** architecture across npm workspaces (`shared`, `apps/server`, `apps/client`) and `infra/`.

```
/
├── .agentwork/                  # Frozen design contracts, brief, findings
├── shared/                      # Pure TypeScript domain contracts, algorithms, codecs
│   ├── src/
│   │   ├── contracts/           # Interfaces, types, DTOs, and protocols
│   │   │   ├── api.ts           # HTTP & Relay response shapes (LanInfo, Health)
│   │   │   ├── errors.ts        # Error codes and typed payloads
│   │   │   ├── events.ts        # Socket.io ClientToServer & ServerToClient maps
│   │   │   ├── models.ts        # Core chess domain models (Board, Pieces, Moves)
│   │   │   ├── navigation.ts    # App modes and launch configurations
│   │   │   ├── puzzle.ts        # Tactical puzzle contracts and progress schemas
│   │   │   ├── scenario.ts      # Academy lesson curriculum and progress schemas
│   │   │   ├── sync.ts          # Unified progress sync, DTOs, and envelope types
│   │   │   └── index.ts         # Public contract barrel export
│   │   ├── sync/                # Pure progress sync engines & codecs
│   │   │   ├── checksum_crc32.ts        # Pure CRC-32 calculator
│   │   │   ├── dictionary_mapper.ts     # Compact QR tuple dictionary mapper
│   │   │   ├── progress_codec.ts        # Deflate + CRC-32 + Base64URL codec
│   │   │   ├── progress_merge_engine.ts # Pure mathematical smart merge engine
│   │   │   ├── schema_validator.ts      # Clamping, sanitization, and verification
│   │   │   └── index.ts                 # Sync module barrel export
│   │   ├── puzzle/              # Pure puzzle validation and adaptive rating engines
│   │   └── index.ts             # Main shared package export
│   └── vitest.config.ts         # Shared unit test configuration
│
├── apps/server/                 # Node.js Ephemeral Cloud & LAN Relay Server
│   ├── src/
│   │   ├── features/            # Feature vertical slices
│   │   │   ├── lan/             # Local LAN discovery & QR generation
│   │   │   │   ├── lan.service.ts
│   │   │   │   └── relay_address.service.ts # Cloud Run PUBLIC_URL resolution
│   │   │   ├── rooms/           # In-memory room state & lifecycle management
│   │   │   │   ├── room.store.ts            # Abstract I/O boundary
│   │   │   │   ├── in_memory_room.store.ts  # Production in-memory adapter
│   │   │   │   ├── in_memory_room.store.mock.ts # Test double
│   │   │   │   └── room.service.ts
│   │   │   └── game/            # Multiplayer move coordination & timers
│   │   ├── platform/            # Infrastructure adapters & cross-cutting concerns
│   │   │   ├── http/            # Native Node HTTP server & static SPA handler
│   │   │   │   ├── http_server.ts   # Route handlers (/health, /healthz, /api/lan-info)
│   │   │   │   └── static_handler.ts
│   │   │   ├── socket/          # Typed Socket.io server & event routing
│   │   │   └── logger/          # Structured Pino logger with correlation IDs
│   │   └── index.ts             # Server entry point & dependency injection wiring
│   └── tsconfig.json
│
├── apps/client/                 # Vue 3 + Vite Progressive Web Application (PWA)
│   ├── public/                  # Static assets, icons, sound effects, PWA manifest
│   │   ├── icons/               # PWA icons (192x192, 512x512, maskable)
│   │   └── manifest.webmanifest # Web App Manifest (standalone, kid-safe)
│   ├── src/
│   │   ├── assets/              # Global styles, SVG pieces, CSS tokens
│   │   ├── composables/         # Global reactive state composables
│   │   │   ├── useAudio.ts
│   │   │   ├── useChessGame.ts
│   │   │   ├── useLanDiscovery.ts
│   │   │   ├── useOnlineStatus.ts  # Browser online/offline reactive listener
│   │   │   ├── usePwaInstall.ts    # PWA install prompt handler
│   │   │   ├── useQrScanner.ts     # Camera viewfinder & jsQR scanning composable
│   │   │   └── useSocket.ts
│   │   ├── features/            # Client feature modules
│   │   │   ├── academy/         # Curriculum cards, lesson arenas, scenario runners
│   │   │   ├── puzzles/         # Themed drills, adaptive ladder, puzzle rush
│   │   │   │   └── store/       # LocalStoragePuzzleProgressStore
│   │   │   ├── scenarios/       # Academy progress store
│   │   │   │   └── store/       # LocalStorageProgressStore
│   │   │   ├── progress_sync/   # Progress Portability & Device-to-Device Sync
│   │   │   │   ├── components/
│   │   │   │   │   ├── ProgressSyncModal.vue     # 2-Tab Export / Import modal
│   │   │   │   │   ├── QrExportView.vue          # High-density QR code renderer
│   │   │   │   │   ├── QrScannerView.vue         # Live camera scanner with reticle
│   │   │   │   │   └── ProgressConflictModal.vue # Side-by-side stats diff preview
│   │   │   │   ├── composables/
│   │   │   │   │   └── useProgressSync.ts        # Sync workflow coordinator
│   │   │   │   └── services/
│   │   │   │       └── progress_file.service.ts  # 1-click JSON download/upload
│   │   │   ├── pwa/             # Offline banner & Install prompt components
│   │   │   │   ├── OfflineIndicator.vue          # Floating reassuring pill
│   │   │   │   ├── PwaInstallBanner.vue          # Subtle install CTA banner
│   │   │   │   └── PwaInstallModal.vue           # iOS / Android instructions
│   │   │   └── lobby/           # 4-Way game mode selector & multiplayer cards
│   │   ├── App.vue              # Top navbar, offline pill, and modal triggers
│   │   └── main.ts              # Client entry point
│   ├── vite.config.ts           # Vite 6 + vite-plugin-pwa Workbox cache configuration
│   └── tsconfig.json
│
├── infra/                       # Cloud Run & Local Container Infrastructure
│   ├── docker/                  # Multi-stage Alpine container files
│   │   └── Dockerfile
│   └── terraform/               # Google Cloud Run IaC (Scale-to-zero, Session Affinity)
│       ├── main.tf
│       ├── cloud_run.tf
│       ├── variables.tf
│       └── outputs.tf
├── docker-compose.yml           # Local multi-container orchestration
└── package.json                 # Monorepo root scripts & workspaces definition
```

---

## 2. Universal Architecture & I/O Isolation Rules

All code in this initiative MUST strictly satisfy the **Testability-First Architecture Rules**:

### Rule 1: I/O Isolation
- **No Direct I/O in Business Logic**: Database operations, `localStorage` calls, `process.env` access, network HTTP/Socket calls, camera streams, and file downloads must be encapsulated behind abstract interfaces.
- **Production & Mock Implementations**: Every I/O boundary must have both a production implementation (e.g. `LocalStorageProgressStore`, `RelayAddressService`) and an in-memory test double (e.g. `InMemoryProgressStoreMock`, `MockRelayAddressService`).

### Rule 2: Pure Business Logic
- **Pure Functions Only**: Calculations, data transformations, compression codecs, rating adjustments, and merge algorithms must be pure functions (`(input) => output` with zero side effects).
- **The Three-Step Pattern**:
  ```
  1. Fetch Dependencies (via Store / I/O Adapter)
  2. Execute Pure Business Logic (Calculations / Merges / Codecs)
  3. Persist Result (via Store / I/O Adapter)
  ```

### Rule 3: Dependency Direction
- Dependencies point inward toward domain models and pure business logic.
- Infrastructure and UI frameworks implement contracts defined in `@fun-chess/shared`.

```
[ Vue Components / Node HTTP Handlers ]
                   │
                   ▼ (Calls)
        [ Feature Services / Composables ]
                   │
                   ▼ (Coordinates)
        [ Storage / Network Interfaces ] ◄─── [ Production / Mock Adapters ]
                   │
                   ▼ (Invokes)
     [ Pure Engines / Codecs / Validators ]
                   │
                   ▼ (Imports)
           [ Domain Models / Types ]
```

---

## 3. File Naming & Code Conventions

### 3.1 File Suffix Conventions

| Role / Pattern | Suffix Convention | Example |
|---|---|---|
| Domain Contract / Interface | `*.contract.ts` or `*.interface.ts` | `sync.contract.ts`, `logger.interface.ts` |
| Pure Engine / Algorithm | `*.engine.ts` | `progress_merge_engine.ts`, `adaptive_rating.engine.ts` |
| Codec / Serialization | `*.codec.ts` / `*.mapper.ts` | `progress_codec.ts`, `dictionary_mapper.ts` |
| Storage Interface / Implementation | `*.store.ts` / `local_storage_*.store.ts` | `room.store.ts`, `local_storage_progress.store.ts` |
| Test Double / Mock | `*.mock.ts` or `*.store.mock.ts` | `in_memory_room.store.mock.ts` |
| Feature Service | `*.service.ts` | `relay_address.service.ts`, `progress_file.service.ts` |
| Vue Composable | `use*.ts` (camelCase) | `useProgressSync.ts`, `usePwaInstall.ts`, `useOnlineStatus.ts` |
| Vue Component | `*.vue` (PascalCase) | `ProgressSyncModal.vue`, `OfflineIndicator.vue` |
| Unit / Contract Spec | `*.spec.ts` | `progress_codec.spec.ts`, `http_api.contract.spec.ts` |

---

## 4. Defensive Programming & Validation Standards

In accordance with the **Rugged Software Constitution**:

1. **Every Input is Untrusted**: Incoming QR strings, imported JSON files, and HTTP parameters are treated as malicious/corrupted until validated.
2. **Defensive Value Clamping**:
   - `rating` (Elo): `Math.min(3000, Math.max(500, Math.round(val)))`
   - `ratingDeviation`: `Math.min(500, Math.max(50, Math.round(val)))`
   - `starsEarned`: `val === 3 ? 3 : val === 2 ? 2 : 1`
   - `attempts` / `hints` / `highScores`: `Math.max(0, Math.floor(val))`
   - `timestamps`: `Math.min(Date.now() + 86400000, Math.max(0, val))`
3. **No Silent Failures**:
   - Storage read errors must log a warning and fallback gracefully to an in-memory cache without crashing the user interface.
   - Corrupted QR scan strings must display a clear, kid-friendly error notification in the UI (`"Oops! This QR code couldn't be read. Let's try scanning again! ✨"`).
4. **CRC-32 Integrity Verification**:
   - All compressed QR codes and JSON envelope exports contain a 32-bit CRC.
   - Payloads with mismatched CRC values are rejected immediately prior to JSON parsing or schema deserialization.

---

## 5. Structured Logging & Observability Standards

### 5.1 Universal 3-Point Logging Mandate

Every operational entry point (HTTP handler, Socket event, background cleanup, Sync import/export) MUST log at three distinct points:
1. **Operation Start**: Log entry with `correlationId`, `operation`, and input identifiers.
2. **Operation Success**: Log completion with `correlationId`, `operation`, `durationMs`, and output summary.
3. **Operation Failure**: Log error with `correlationId`, `operation`, `durationMs`, error message, and stack trace.

### 5.2 Mandatory Context Fields

```typescript
export interface LogContext {
  /** Unique UUID v4 for request/operation tracing across layers */
  correlationId: string;
  /** Distinct snake_case operation name */
  operation: string;
  /** Execution elapsed time in milliseconds */
  durationMs?: number;
  /** HTTP method or Socket event name */
  method?: string;
  /** Request path or route */
  path?: string;
  /** HTTP response status code */
  statusCode?: number;
  /** Error details when operation fails */
  error?: {
    message: string;
    code?: string;
    stack?: string;
    details?: unknown;
  };
  /** Additional non-PII operational metadata */
  [key: string]: unknown;
}
```

### 5.3 Client-Side Telemetry & Log Formatting

On the client, logs must be formatted with consistent subsystem tags:
- `[FC_PROGRESS_SYNC]`: Progress export, import, scanning, and merging
- `[FC_PWA]`: Service worker registration, cache updates, install prompt triggers
- `[FC_SOCKET]`: Real-time multiplayer connection lifecycle

---

## 6. Complete Reference Pattern: Progress Sync Vertical Slice

Below is a complete, copy-pasteable reference vertical slice demonstrating all architectural rules in practice.

### Step 1: Public Contract (`shared/src/contracts/sync.contract.ts`)

```typescript
import type { ScenarioProgressMap } from './scenario.js';
import type { PuzzleProgress } from './puzzle.js';

export interface UnifiedProgressPayload {
  readonly version: number;
  readonly exportedAt: number;
  readonly clientVersion?: string;
  readonly scenarios: ScenarioProgressMap;
  readonly puzzles: PuzzleProgress;
}

export type SyncMergeStrategy = 'smart_merge' | 'replace_local' | 'keep_local';

export interface ProgressStorage {
  getUnifiedProgress(): Promise<UnifiedProgressPayload>;
  saveUnifiedProgress(payload: UnifiedProgressPayload): Promise<void>;
}
```

### Step 2: Pure Calculation Engine (`shared/src/sync/progress_merge_engine.ts`)

```typescript
import type { UnifiedProgressPayload, SyncMergeStrategy } from '../contracts/sync.contract.js';

/**
 * Pure function performing deterministic smart merge of user progress.
 * Adheres to Rule 2 (Zero side effects, zero I/O).
 */
export function mergeUnifiedProgress(
  local: UnifiedProgressPayload,
  incoming: UnifiedProgressPayload,
  strategy: SyncMergeStrategy
): UnifiedProgressPayload {
  if (strategy === 'keep_local') {
    return { ...local };
  }
  if (strategy === 'replace_local') {
    return { ...incoming };
  }

  // --- 1. Scenarios Union ---
  const mergedScenarios: UnifiedProgressPayload['scenarios'] = { ...local.scenarios };
  for (const [id, incomingSc] of Object.entries(incoming.scenarios)) {
    const existing = mergedScenarios[id];
    if (!existing) {
      mergedScenarios[id] = { ...incomingSc };
    } else {
      mergedScenarios[id] = {
        scenarioId: id,
        starsEarned: Math.max(existing.starsEarned, incomingSc.starsEarned) as 1 | 2 | 3,
        attemptsCount: existing.attemptsCount + incomingSc.attemptsCount,
        hintsUsedTotal: existing.hintsUsedTotal + incomingSc.hintsUsedTotal,
        firstCompletedAt: Math.min(existing.firstCompletedAt, incomingSc.firstCompletedAt),
        lastCompletedAt: Math.max(existing.lastCompletedAt, incomingSc.lastCompletedAt),
      };
    }
  }

  // --- 2. Puzzle Ratings & Arcade Merge ---
  const mergedRating = Math.max(local.puzzles.ratingProfile.rating, incoming.puzzles.ratingProfile.rating);
  const mergedPeak = Math.max(
    local.puzzles.ratingProfile.peakRating,
    incoming.puzzles.ratingProfile.peakRating,
    mergedRating
  );
  const mergedRd = Math.min(
    local.puzzles.ratingProfile.ratingDeviation,
    incoming.puzzles.ratingProfile.ratingDeviation
  );

  const mergedSolvedPuzzles = { ...local.puzzles.solvedPuzzles };
  for (const [id, incSolve] of Object.entries(incoming.puzzles.solvedPuzzles)) {
    const existing = mergedSolvedPuzzles[id];
    if (!existing) {
      mergedSolvedPuzzles[id] = { ...incSolve };
    } else {
      mergedSolvedPuzzles[id] = {
        stars: Math.max(existing.stars, incSolve.stars) as 1 | 2 | 3,
        solvedAt: Math.min(existing.solvedAt, incSolve.solvedAt),
      };
    }
  }

  return {
    version: local.version,
    exportedAt: Date.now(),
    scenarios: mergedScenarios,
    puzzles: {
      ...local.puzzles,
      ratingProfile: {
        ...local.puzzles.ratingProfile,
        rating: mergedRating,
        peakRating: mergedPeak,
        ratingDeviation: mergedRd,
        totalAttempted: local.puzzles.ratingProfile.totalAttempted + incoming.puzzles.ratingProfile.totalAttempted,
        totalSolved: local.puzzles.ratingProfile.totalSolved + incoming.puzzles.ratingProfile.totalSolved,
        bestStreak: Math.max(local.puzzles.ratingProfile.bestStreak, incoming.puzzles.ratingProfile.bestStreak),
      },
      arcadeStats: {
        puzzleRushHighScore: Math.max(
          local.puzzles.arcadeStats.puzzleRushHighScore,
          incoming.puzzles.arcadeStats.puzzleRushHighScore
        ),
        puzzleRushBestStreak: Math.max(
          local.puzzles.arcadeStats.puzzleRushBestStreak,
          incoming.puzzles.arcadeStats.puzzleRushBestStreak
        ),
        streakSurvivorHighScore: Math.max(
          local.puzzles.arcadeStats.streakSurvivorHighScore,
          incoming.puzzles.arcadeStats.streakSurvivorHighScore
        ),
        totalRushRuns: local.puzzles.arcadeStats.totalRushRuns + incoming.puzzles.arcadeStats.totalRushRuns,
      },
      solvedPuzzles: mergedSolvedPuzzles,
      lastActiveAt: Math.max(local.puzzles.lastActiveAt, incoming.puzzles.lastActiveAt, Date.now()),
    },
  };
}
```

### Step 3: Production Storage Adapter (`apps/client/src/features/progress_sync/store/local_storage_unified.store.ts`)

```typescript
import type { ProgressStorage, UnifiedProgressPayload } from '@fun-chess/shared';
import { LocalStorageProgressStore } from '../../scenarios/store/local_storage_progress.store.js';
import { LocalStoragePuzzleProgressStore } from '../../puzzles/store/local_storage_puzzle_store.js';

export class LocalStorageUnifiedStore implements ProgressStorage {
  constructor(
    private readonly scenarioStore = new LocalStorageProgressStore(),
    private readonly puzzleStore = new LocalStoragePuzzleProgressStore()
  ) {}

  public async getUnifiedProgress(): Promise<UnifiedProgressPayload> {
    const [scenarios, puzzles] = await Promise.all([
      this.scenarioStore.getProgressMap(),
      this.puzzleStore.getProgress(),
    ]);

    return {
      version: 1,
      exportedAt: Date.now(),
      scenarios,
      puzzles,
    };
  }

  public async saveUnifiedProgress(payload: UnifiedProgressPayload): Promise<void> {
    // 1. Reset and rewrite scenario records
    await this.scenarioStore.resetAllProgress();
    for (const [id, sc] of Object.entries(payload.scenarios)) {
      await this.scenarioStore.saveProgress(id, sc.starsEarned, sc.hintsUsedTotal);
    }

    // 2. Persist updated puzzle progress
    await this.puzzleStore.updateRating(payload.puzzles.ratingProfile);
  }
}
```

### Step 4: In-Memory Test Double (`apps/client/src/features/progress_sync/store/in_memory_unified.store.mock.ts`)

```typescript
import type { ProgressStorage, UnifiedProgressPayload } from '@fun-chess/shared';

export class InMemoryUnifiedStoreMock implements ProgressStorage {
  private data: UnifiedProgressPayload;

  constructor(initialData: UnifiedProgressPayload) {
    this.data = JSON.parse(JSON.stringify(initialData));
  }

  public async getUnifiedProgress(): Promise<UnifiedProgressPayload> {
    return JSON.parse(JSON.stringify(this.data));
  }

  public async saveUnifiedProgress(payload: UnifiedProgressPayload): Promise<void> {
    this.data = JSON.parse(JSON.stringify(payload));
  }
}
```

### Step 5: Unit Test with AAA Pattern (`shared/src/__tests__/progress_merge_engine.spec.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { mergeUnifiedProgress } from '../sync/progress_merge_engine.js';
import type { UnifiedProgressPayload } from '../contracts/sync.contract.js';

describe('ProgressMergeEngine Unit Tests', () => {
  const createMockPayload = (elo: number, rushScore: number): UnifiedProgressPayload => ({
    version: 1,
    exportedAt: 1000,
    scenarios: {
      'lesson-1': {
        scenarioId: 'lesson-1',
        starsEarned: 2,
        attemptsCount: 1,
        hintsUsedTotal: 0,
        firstCompletedAt: 1000,
        lastCompletedAt: 1000,
      },
    },
    puzzles: {
      ratingProfile: {
        rating: elo,
        ratingDeviation: 100,
        peakRating: elo,
        totalAttempted: 10,
        totalSolved: 8,
        bestStreak: 5,
        ratingHistory: [],
      },
      themeMastery: {},
      arcadeStats: {
        puzzleRushHighScore: rushScore,
        puzzleRushBestStreak: 4,
        streakSurvivorHighScore: 3,
        totalRushRuns: 2,
      },
      solvedPuzzles: {},
      createdAt: 1000,
      lastActiveAt: 1000,
    },
  });

  it('should take Math.max for Elo rating and arcade high scores in smart_merge mode', () => {
    // Arrange
    const local = createMockPayload(1200, 15);
    const incoming = createMockPayload(1450, 8);

    // Act
    const result = mergeUnifiedProgress(local, incoming, 'smart_merge');

    // Assert
    expect(result.puzzles.ratingProfile.rating).toBe(1450);
    expect(result.puzzles.arcadeStats.puzzleRushHighScore).toBe(15);
    expect(result.puzzles.ratingProfile.totalAttempted).toBe(20);
    expect(result.puzzles.ratingProfile.totalSolved).toBe(16);
  });
});
```
