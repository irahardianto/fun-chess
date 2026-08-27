import type { ScenarioProgressMap, StarRating } from "../contracts/scenario.js";
import type { PuzzleProgress } from "../contracts/puzzle.js";

/**
 * Magic header prefix for Fun Chess compressed transport payloads.
 * Format: FC<version>:<base64url_payload>
 * Example: "FC1:eJy1V...794"
 */
export const FUN_CHESS_PAYLOAD_MAGIC_PREFIX = "FC1:";

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
  readonly magic: "FC_PROGRESS_V1";
  /** Schema specification version */
  readonly schemaVersion: number;
  /** Formatted export timestamp (ISO 8601) */
  readonly exportedAt: string;
  /** Formatted CRC-32 checksum (8-character uppercase hex) of the stringified payload */
  readonly checksum: string;
  /** Complete progress payload */
  readonly payload: UnifiedProgressPayload;
}

/**
 * Resolution strategies when importing progress onto a device with existing data.
 */
export type SyncMergeStrategy =
  | "smart_merge" // (Recommended) Non-destructive union: highest Elo, max stars, union of solved puzzles/scenarios
  | "replace_local" // Overwrite local device state entirely with imported data
  | "keep_local"; // Discard imported data and maintain existing local state

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

/**
 * Compact Academy Scenario Tuple:
 * [0]: scenarioId (string)
 * [1]: starsEarned (1 | 2 | 3)
 * [2]: attemptsCount (number)
 * [3]: hintsUsedTotal (number)
 * [4]: firstCompletedSec (epoch ms / 1000 - unix seconds)
 * [5]: lastCompletedSec (epoch ms / 1000 - unix seconds)
 */
export type CompactScenarioTuple = [
  string, // 0: id
  number, // 1: stars (1-3)
  number, // 2: attempts
  number, // 3: hints
  number, // 4: firstCompletedSec
  number, // 5: lastCompletedSec
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
  number, // 5: bestStreak
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
  number, // 4: lastPracticedSec
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
  number, // 2: solvedAtSec
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
  number, // 3: totalRuns
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

/**
 * Checksum calculation and verification interface using IEEE 802.3 32-bit CRC.
 */
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

/**
 * Dictionary mapper for compact tuple transformations.
 */
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

/**
 * Validation result wrapper type.
 */
export interface ValidationResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly errors?: readonly string[];
}

/**
 * Defensive schema validator and sanitization interface.
 */
export interface SchemaValidator {
  /**
   * Validates and defensively sanitizes an unknown object into a clean UnifiedProgressPayload.
   */
  sanitizeAndValidate(raw: unknown): ValidationResult<UnifiedProgressPayload>;

  /**
   * Fast assertion that returns sanitized payload or throws descriptive ValidationError.
   */
  assertValid(raw: unknown): UnifiedProgressPayload;
}

/**
 * Merge engine contract for combining progress datasets.
 */
export interface ProgressMergeEngine {
  /**
   * Pure merge calculation combining local and incoming progress using the specified strategy.
   */
  merge(
    local: UnifiedProgressPayload,
    incoming: UnifiedProgressPayload,
    strategy: SyncMergeStrategy,
  ): UnifiedProgressPayload;

  /**
   * Generates side-by-side diff preview without mutating any state.
   */
  calculateDiff(
    local: UnifiedProgressPayload,
    incoming: UnifiedProgressPayload,
  ): ProgressDiffPreview;
}

/**
 * Compression options for Deflate QR encoding.
 */
export interface CodecEncodeOptions {
  /** Deflate compression level (1-9, default: 9 for max QR density) */
  readonly level?: number;
  /** Include client version tag */
  readonly clientVersion?: string;
}

/**
 * Deflate + CRC32 + Base64URL progress codec interface.
 */
export interface ProgressCodec {
  /**
   * Encodes a domain progress payload into a compact QR-compatible string (`FC1:<base64url>`).
   */
  encodeToQrString(
    payload: UnifiedProgressPayload,
    options?: CodecEncodeOptions,
  ): Promise<string>;

  /**
   * Decodes and validates a QR string back into a sanitized UnifiedProgressPayload.
   */
  decodeFromQrString(qrString: string): Promise<UnifiedProgressPayload>;

  /**
   * Encodes payload into a human-readable JSON backup envelope for 1-click file export.
   */
  encodeToEnvelopeJson(payload: UnifiedProgressPayload): string;

  /**
   * Decodes and validates a JSON backup envelope string.
   */
  decodeFromEnvelopeJson(jsonString: string): UnifiedProgressPayload;
}

/**
 * Storage abstraction for persisting unified user progress.
 */
export interface ProgressStorage {
  /** Retrieves all saved progress records combined */
  getUnifiedProgress(): Promise<UnifiedProgressPayload>;
  /** Saves or replaces all user progress records */
  saveUnifiedProgress(payload: UnifiedProgressPayload): Promise<void>;
}
