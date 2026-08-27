# Architectural API Contracts: Progress Sync, Deflate Codec, & Cloud Relay

**Status:** FROZEN ARCHITECTURAL CONTRACT  
**Version:** 1.0.0  
**Initiative:** Cloud-Ready Zero-Database PWA, Ephemeral Cloud Relay & Deflate-QR Progress Synchronization  
**Target Packages:** `@fun-chess/shared`, `@fun-chess/server`, `@fun-chess/client`, `infra`  
**Date:** 2026-08-27  

---

## 1. Executive Summary & Design Invariants

This document establishes the frozen architectural contracts for:
1. **Unified Progress Portability**: Client-side, zero-database schema bundling Academy lessons progress and Tactical Puzzle ratings/stats into an exportable, importable, and mergeable entity.
2. **High-Density Deflate-QR Codec & Dictionary Mapping**: Compact dictionary tokenization combined with raw Deflate compression and CRC-32 integrity validation designed to fit complete user progress into **QR Code Version 12 (~560 bytes)**.
3. **Smart Merge & Conflict Engine**: Deterministic, pure mathematical merging algorithms (`Math.max`, set union, Glicko confidence minimization) protecting user progress from regressions across devices.
4. **Cloud Run Ready Ephemeral Addressing & Health Probes**: Enhanced server network resolution (`RelayAddressService`) supporting `PUBLIC_URL` / `HOST` cloud environments alongside local LAN discovery, with container liveness/readiness probes (`/health`, `/healthz`).

---

## 2. Unified Progress Data Contracts (`@fun-chess/shared`)

### 2.1 Domain Interfaces

```typescript
import type { ScenarioProgressMap, ScenarioProgress, StarRating } from './scenario.js';
import type {
  PuzzleProgress,
  AdaptiveRatingState,
  ThemeMasteryProgress,
  PuzzleArcadeStats,
  SolvedPuzzleRecord,
  PuzzleTheme,
} from './puzzle.js';

/**
 * Magic header prefix for Fun Chess compressed transport payloads.
 * Format: FC<version>:<base64url_payload>
 * Example: "FC1:eJy1V...794="
 */
export const FUN_CHESS_PAYLOAD_MAGIC_PREFIX = 'FC1:';

/**
 * Supported schema version for progress serialization.
 */
export const UNIFIED_PROGRESS_SCHEMA_VERSION = 1;

/**
 * Top-level payload containing complete user progress across all single-player modes.
 * Adheres to Rule 2 (Pure Business Logic) and operates 100% database-free.
 */
export interface UnifiedProgressPayload {
  /** Schema specification version (default: 1) */
  readonly version: number;
  /** Epoch millisecond timestamp when the export package was created */
  readonly exportedAt: number;
  /** Optional client application semantic version string (e.g. "1.2.0") */
  readonly clientVersion?: string;
  /** Academy curriculum progress indexed by scenario ID */
  readonly scenarios: ScenarioProgressMap;
  /** Puzzle Hub progress including Elo ratings, theme masteries, arcade scores, and solved puzzles */
  readonly puzzles: PuzzleProgress;
}

/**
 * Envelope structure used when exporting to `.json` file backup.
 * Provides integrity checksum and file identification.
 */
export interface UnifiedProgressEnvelope {
  /** Envelope magic string for file type validation */
  readonly magic: 'FC_PROGRESS_V1';
  /** Schema specification version */
  readonly schemaVersion: number;
  /** Formatted export timestamp (ISO 8601) */
  readonly exportedAt: string;
  /** Formatted CRC-32 checksum (8-character uppercase hex) of the stringified payload */
  readonly checksum: string;
  /** Complete progress payload */
  readonly payload: UnifiedProgressPayload;
}
```

### 2.2 Merge Strategy & Conflict Preview Contracts

```typescript
/**
 * Resolution strategies when importing progress onto a device with existing data.
 */
export type SyncMergeStrategy =
  | 'smart_merge'    // (Recommended) Non-destructive union: highest Elo, max stars, union of solved puzzles/scenarios
  | 'replace_local'   // Overwrite local device state entirely with imported data
  | 'keep_local';     // Discard imported data and maintain existing local state

/**
 * Itemized statistical comparison between Local and Incoming progress.
 * Consumed by UI components (`ProgressConflictModal.vue`) to render diff previews.
 */
export interface ProgressDiffPreview {
  readonly academy: {
    readonly localCompletedCount: number;
    readonly incomingCompletedCount: number;
    readonly mergedCompletedCount: number;
    readonly localTotalStars: number;
    readonly incomingTotalStars: number;
    readonly mergedTotalStars: number;
    readonly newCompletedScenarios: readonly string[];
    readonly starUpgrades: readonly {
      readonly scenarioId: string;
      readonly fromStars: StarRating;
      readonly toStars: StarRating;
    }[];
  };
  readonly puzzles: {
    readonly localSolvedCount: number;
    readonly incomingSolvedCount: number;
    readonly mergedSolvedCount: number;
    readonly localRating: number;
    readonly incomingRating: number;
    readonly mergedRating: number;
    readonly localPeakRating: number;
    readonly incomingPeakRating: number;
    readonly mergedPeakRating: number;
    readonly newPuzzlesSolvedCount: number;
  };
  readonly arcade: {
    readonly localRushHighScore: number;
    readonly incomingRushHighScore: number;
    readonly mergedRushHighScore: number;
    readonly localSurvivorHighScore: number;
    readonly incomingSurvivorHighScore: number;
    readonly mergedSurvivorHighScore: number;
  };
  readonly metadata: {
    readonly localLastActiveAt: number;
    readonly incomingLastActiveAt: number;
    readonly incomingExportedAt: number;
    readonly isIncomingNewer: boolean;
  };
  /** Indicates whether the incoming payload differs from local data */
  readonly hasDifferences: boolean;
  /** Indicates whether smart_merge would result in any upgrades to local data */
  readonly hasUpgrades: boolean;
}
```

---

## 3. Token Dictionary Mapping Specification (`DictionaryMapper`)

To achieve maximum compression density for QR Code Version 12 (~560 bytes), verbose JSON keys and object structures are mapped to a compact array/tuple DTO before Deflate compression.

### 3.1 Compact DTO Specification (`CompactProgressDto`)

```typescript
/**
 * Compact Academy Scenario Tuple:
 * [0]: scenarioId (string)
 * [1]: starsEarned (1 | 2 | 3)
 * [2]: attemptsCount (number)
 * [3]: hintsUsedTotal (number)
 * [4]: firstCompletedAt (epoch ms / 1000 - unix seconds)
 * [5]: lastCompletedAt (epoch ms / 1000 - unix seconds)
 */
export type CompactScenarioTuple = [
  string, // 0: id
  number, // 1: stars (1-3)
  number, // 2: attempts
  number, // 3: hints
  number, // 4: firstCompletedSec
  number  // 5: lastCompletedSec
];

/**
 * Compact Puzzle Rating Profile Tuple:
 * [0]: rating (Elo: 500-3000)
 * [1]: ratingDeviation (RD: 50-500)
 * [2]: peakRating (Elo: 500-3000)
 * [3]: totalAttempted (number)
 * [4]: totalSolved (number)
 * [5]: bestStreak (number)
 */
export type CompactRatingProfileTuple = [
  number, // 0: rating
  number, // 1: rd
  number, // 2: peakRating
  number, // 3: totalAttempted
  number, // 4: totalSolved
  number  // 5: bestStreak
];

/**
 * Compact Theme Mastery Tuple:
 * [0]: themeKey (e.g. 'fork', 'pin', 'back_rank_mate')
 * [1]: attempted (number)
 * [2]: solved (number)
 * [3]: starsEarned (number)
 * [4]: lastPracticedSec (epoch seconds)
 */
export type CompactThemeMasteryTuple = [
  string, // 0: theme
  number, // 1: attempted
  number, // 2: solved
  number, // 3: stars
  number  // 4: lastPracticedSec
];

/**
 * Compact Solved Puzzle Tuple:
 * [0]: puzzleId (string, e.g. "puz_fork_001")
 * [1]: stars (1 | 2 | 3)
 * [2]: solvedAtSec (epoch seconds)
 */
export type CompactSolvedPuzzleTuple = [
  string, // 0: puzzleId
  number, // 1: stars
  number  // 2: solvedAtSec
];

/**
 * Compact Arcade Stats Tuple:
 * [0]: puzzleRushHighScore
 * [1]: puzzleRushBestStreak
 * [2]: streakSurvivorHighScore
 * [3]: totalRushRuns
 */
export type CompactArcadeStatsTuple = [
  number, // 0: rushHigh
  number, // 1: rushStreak
  number, // 2: survivorHigh
  number  // 3: totalRuns
];

/**
 * Ultra-compact Dictionary Transfer Object representation.
 * Keys are minimal 1-2 character tokens.
 */
export interface CompactProgressDto {
  /** v: Schema Version (1) */
  readonly v: number;
  /** t: ExportedAt Unix Epoch Seconds */
  readonly t: number;
  /** c: Client Version (Optional) */
  readonly c?: string;
  /** sc: List of compact scenario progress tuples */
  readonly sc: readonly CompactScenarioTuple[];
  /** pz: Compact puzzle container */
  readonly pz: {
    /** r: Rating profile tuple */
    readonly r: CompactRatingProfileTuple;
    /** tm: List of compact theme mastery tuples */
    readonly tm: readonly CompactThemeMasteryTuple[];
    /** ac: Arcade stats tuple */
    readonly ac: CompactArcadeStatsTuple;
    /** sp: List of compact solved puzzle tuples */
    readonly sp: readonly CompactSolvedPuzzleTuple[];
    /** ca: Profile CreatedAt Unix Epoch Seconds */
    readonly ca: number;
    /** la: Profile LastActiveAt Unix Epoch Seconds */
    readonly la: number;
  };
}
```

### 3.2 Dictionary Mapper Interface

```typescript
export interface DictionaryMapper {
  /**
   * Compresses a full domain UnifiedProgressPayload into a CompactProgressDto.
   * Converts millisecond timestamps to second granularity to reduce integer digit width.
   */
  toCompact(payload: UnifiedProgressPayload): CompactProgressDto;

  /**
   * Expands a CompactProgressDto back into the full domain UnifiedProgressPayload.
   * Reconstitutes millisecond timestamps and full object models.
   */
  fromCompact(compact: CompactProgressDto): UnifiedProgressPayload;
}
```

### 3.3 Byte Budget & Density Analysis for QR Code Version 12

| Stage | Data Representation | Typical Byte Size (50 Scenarios + 50 Puzzles) |
|---|---|---|
| 1. Domain Object | Raw `UnifiedProgressPayload` JSON | ~12,400 bytes |
| 2. Compact DTO | `CompactProgressDto` Minified JSON | ~1,250 bytes |
| 3. Raw Deflate | RFC 1951 Deflate Stream (Level 9) | ~390 – 460 bytes |
| 4. Base64URL | URL-Safe Base64 string + Magic Prefix (`FC1:`) | ~525 – 615 characters |

**QR Code Version 12 Capacity:**
- Error Correction Level **L** (7% recovery): **686 alphanumeric / 535 binary bytes**
- Error Correction Level **M** (15% recovery): **535 alphanumeric / 419 binary bytes**
- *Result:* Standard player progress fits cleanly in **QR Code Version 10–12**. For massive datasets (>150 puzzles), QR Version 14–16 seamlessly scales up while remaining scannable by standard mobile device cameras.

---

## 4. Deflate + CRC-32 Codec & Validation Contracts (`@fun-chess/shared`)

### 4.1 Checksum Contract (`ChecksumCrc32`)

Uses standard IEEE 802.3 32-bit Cyclic Redundancy Check (`0xEDB88320` polynomial):

```typescript
export interface ChecksumCrc32 {
  /**
   * Calculates the 32-bit unsigned CRC-32 integer for the provided byte array or UTF-8 string.
   */
  calculate(input: Uint8Array | string): number;

  /**
   * Returns standard 8-character uppercase hexadecimal representation (e.g. "8A3F12C9").
   */
  toHex(crc: number): string;

  /**
   * Verifies input against an expected 8-character hex checksum.
   */
  verify(input: Uint8Array | string, expectedHex: string): boolean;
}
```

### 4.2 Progress Codec Interface (`ProgressCodec`)

```typescript
export interface CodecEncodeOptions {
  /** Deflate compression level (1-9, default: 9 for max QR density) */
  readonly level?: number;
  /** Include client version tag */
  readonly clientVersion?: string;
}

export interface ProgressCodec {
  /**
   * Encodes a domain progress payload into a compact QR-compatible string (`FC1:<base64url>`).
   * Pipeline: Validate -> toCompact -> JSON -> Deflate -> CRC32 -> Base64URL.
   */
  encodeToQrString(payload: UnifiedProgressPayload, options?: CodecEncodeOptions): Promise<string>;

  /**
   * Decodes and validates a QR string back into a sanitized UnifiedProgressPayload.
   * Pipeline: Parse Prefix -> Base64URL Decode -> Verify CRC32 -> Inflate -> JSON -> fromCompact -> Sanitize.
   */
  decodeFromQrString(qrString: string): Promise<UnifiedProgressPayload>;

  /**
   * Encodes payload into a human-readable JSON backup envelope for 1-click file export (`funchess-save.json`).
   */
  encodeToEnvelopeJson(payload: UnifiedProgressPayload): string;

  /**
   * Decodes and validates a JSON backup envelope string.
   */
  decodeFromEnvelopeJson(jsonString: string): UnifiedProgressPayload;
}
```

### 4.3 Defensive Schema Validation & Clamping (`SchemaValidator`)

Adheres strictly to the **Rugged Software Constitution**: all incoming data is treated as untrusted and potentially malformed.

```typescript
export interface ValidationResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly errors?: readonly string[];
}

export interface SchemaValidator {
  /**
   * Validates and defensively sanitizes an unknown object into a clean UnifiedProgressPayload.
   * Clamping Rules:
   * - Elo Rating: clamped to [500, 3000]
   * - Rating Deviation: clamped to [50, 500]
   * - Star Ratings: clamped to {1, 2, 3}
   * - Counts & High Scores: clamped to Math.max(0, Math.floor(value))
   * - Timestamps: clamped to [0, Date.now() + 86400000] (rejects future overflow timestamps)
   * - String IDs: trimmed and stripped of non-printable characters
   */
  sanitizeAndValidate(raw: unknown): ValidationResult<UnifiedProgressPayload>;

  /**
   * Fast assertion that returns sanitized payload or throws descriptive ValidationError.
   */
  assertValid(raw: unknown): UnifiedProgressPayload;
}
```

### 4.4 Merge Engine Contract (`ProgressMergeEngine`)

Pure calculation contract implementing the three-step pattern: **Fetch dependencies -> Pure logic -> Persist result**.

```typescript
export interface ProgressMergeEngine {
  /**
   * Pure merge calculation combining local and incoming progress using the specified strategy.
   * Invariants for 'smart_merge':
   * - Scenarios: Union of all scenario IDs. If scenario present in both, starsEarned = Math.max(local, incoming),
   *   attempts = local.attempts + incoming.attempts, hints = local.hints + incoming.hints,
   *   firstCompletedAt = Math.min(local, incoming), lastCompletedAt = Math.max(local, incoming).
   * - Puzzle Rating: Math.max(local.rating, incoming.rating).
   * - Peak Rating: Math.max(local.peakRating, incoming.peakRating, mergedRating).
   * - Rating Deviation: Math.min(local.RD, incoming.RD) (favors higher confidence).
   * - Puzzle Counts: totalAttempted = local + incoming, totalSolved = local + incoming, bestStreak = Math.max(local, incoming).
   * - Solved Puzzles: Map union. If puzzle in both, stars = Math.max(local.stars, incoming.stars),
   *   solvedAt = Math.min(local.solvedAt, incoming.solvedAt).
   * - Theme Mastery: Union by theme. attempted = local + incoming, solved = local + incoming,
   *   starsEarned = local + incoming, lastPracticedAt = Math.max(local, incoming),
   *   masteryLevel recalculated (>=20 master, >=8 apprentice, else novice).
   * - Arcade Stats: puzzleRushHighScore = Math.max(local, incoming), puzzleRushBestStreak = Math.max(local, incoming),
   *   streakSurvivorHighScore = Math.max(local, incoming), totalRushRuns = local.totalRushRuns + incoming.totalRushRuns.
   */
  merge(
    local: UnifiedProgressPayload,
    incoming: UnifiedProgressPayload,
    strategy: SyncMergeStrategy
  ): UnifiedProgressPayload;

  /**
   * Generates side-by-side diff preview without mutating any state.
   */
  calculateDiff(
    local: UnifiedProgressPayload,
    incoming: UnifiedProgressPayload
  ): ProgressDiffPreview;
}
```

---

## 5. Server HTTP Health & Cloud Relay Contracts (`@fun-chess/server`)

### 5.1 Health Check Endpoints

#### Endpoint: `GET /health`
Full operational telemetry for monitoring, dashboards, and debugging.

- **Status Code:** `200 OK` (or `503 Service Unavailable` if degraded)
- **Response Headers:** `Content-Type: application/json; charset=utf-8`, `X-Correlation-ID: <uuid>`
- **Response Body (`HealthCheckResponse`):**

```typescript
export interface HealthCheckResponse {
  readonly status: 'ok' | 'degraded';
  readonly uptimeSeconds: number;
  readonly timestamp: string; // ISO 8601
  readonly activeRooms: number;
  readonly activeSockets: number;
  readonly memoryUsageMb: {
    readonly rss: number;
    readonly heapTotal: number;
    readonly heapUsed: number;
  };
  readonly relay?: {
    readonly mode: 'cloud' | 'lan';
    readonly publicUrl?: string;
  };
}
```

#### Endpoint: `GET /healthz`
Lightweight Kubernetes / Cloud Run liveness and readiness probe endpoint.

- **Status Code:** `200 OK`
- **Response Headers:** `Content-Type: text/plain; charset=utf-8`
- **Response Body:** `"OK"`

---

### 5.2 LAN & Cloud Relay Discovery Endpoint

#### Endpoint: `GET /api/lan-info`
Provides connection addressing for local Wi-Fi players and Cloud Run remote players.

- **Status Code:** `200 OK`
- **Response Headers:** `Content-Type: application/json; charset=utf-8`, `X-Correlation-ID: <uuid>`
- **Response Body (`LanInfoResponse`):**

```typescript
export interface LanInfoResponse {
  /** Resolved host IP or domain name for multiplayer connection */
  readonly lanIp: string;
  /** Active listening port */
  readonly port: number;
  /** Localhost base URL */
  readonly localUrl: string;
  /** Full join URL for remote/LAN players (e.g. "https://fun-chess-xyz.a.run.app" or "http://192.168.1.50:3000") */
  readonly joinUrl: string;
  /** Detected physical IPv4 interfaces */
  readonly interfaces: readonly string[];
  /** Addressing mode: 'cloud' when running with PUBLIC_URL, 'lan' for local network */
  readonly relayMode: 'cloud' | 'lan';
  /** Flag indicating whether the server is acting as an internet cloud relay */
  readonly isCloudRelay: boolean;
  /** Public base URL when deployed to Cloud Run or behind a reverse proxy */
  readonly publicUrl?: string;
}
```

---

### 5.3 Server `RelayAddressService` Specification

Replaces hardcoded OS network interface resolution with intelligent cloud/container aware host discovery.

```typescript
export interface RelayAddressConfig {
  /** Override URL for Cloud Run deployments (e.g. "https://fun-chess.a.run.app") */
  readonly publicUrl?: string;
  /** Listening host binding (default: "0.0.0.0") */
  readonly host?: string;
  /** Listening port (default: 3000) */
  readonly port?: number;
  /** Optional manual LAN IP override */
  readonly lanIp?: string;
}

export interface RelayAddressService {
  /**
   * Resolves comprehensive LAN / Cloud addressing info.
   * Priority Resolution Order:
   * 1. `process.env.PUBLIC_URL` -> Sets relayMode: 'cloud', joinUrl: `${PUBLIC_URL}`, isCloudRelay: true
   * 2. `process.env.LAN_IP` / `process.env.HOST_IP` -> Sets relayMode: 'lan', joinUrl: `http://${LAN_IP}:${port}`
   * 3. Discovered local IPv4 interface (192.168.x.x -> 10.x.x.x -> 172.16-31.x.x)
   * 4. Fallback to `127.0.0.1`
   */
  getAddressingInfo(port: number): LanInfoResponse;

  /**
   * Generates a game room invitation URL for QR code generation.
   */
  generateJoinUrl(port: number, roomCode?: string): string;

  /**
   * Checks whether the current instance is configured as a public Cloud relay.
   */
  isCloudRelay(): boolean;
}
```

---

## 6. Contract Verification Checklist

| Contract Area | Verification Requirement | Automated Test Target |
|---|---|---|
| **Deflate Codec** | Round-trip lossless decode matches original payload | `shared/src/__tests__/progress_codec.spec.ts` |
| **Dictionary Mapper** | Compact representation compresses to <560 bytes | `shared/src/__tests__/dictionary_mapper.spec.ts` |
| **CRC-32 Checksum** | Detects 1-bit corrupted payloads and rejects import | `shared/src/__tests__/checksum_crc32.spec.ts` |
| **Schema Validator** | Enforces range clamping [500, 3000] and rejects malformed types | `shared/src/__tests__/schema_validator.spec.ts` |
| **Merge Engine** | Non-destructive `Math.max` properties and union sets verified | `shared/src/__tests__/progress_merge_engine.spec.ts` |
| **HTTP Health** | `GET /health` returns 200 OK with memory & uptime; `GET /healthz` returns 200 "OK" | `tests/contracts/http_api.contract.spec.ts` |
| **Relay Address** | `PUBLIC_URL` overrides local IP resolution cleanly in Cloud Run mode | `apps/server/src/features/lan/__tests__/relay_address.service.spec.ts` |
