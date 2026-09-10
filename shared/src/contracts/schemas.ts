import { z } from "zod";
import { PUZZLE_THEMES } from "./themes.js";
import { normalizeUrlString } from "../utils/url.js";

/**
 * 4-letter alphanumeric room code schema.
 * Normalizes input to uppercase.
 */
export const RoomCodeSchema = z
  .string()
  .trim()
  .length(4, "Room code must be exactly 4 characters")
  .regex(/^[A-Za-z0-9]{4}$/, "Room code must contain only alphanumeric characters")
  .transform((code) => code.toUpperCase());

/**
 * Sanitized player nickname schema (1-20 characters, strict allowlist: letters, digits, space, underscore, dot, dash).
 */
export const PlayerNameSchema = z
  .string()
  .trim()
  .min(1, "Player name cannot be empty")
  .max(20, "Player name must be 20 characters or fewer")
  .regex(
    /^[a-zA-Z0-9 _.-]{1,20}$/,
    "Player name must contain only alphanumeric characters, spaces, dots, dashes, or underscores",
  );

/**
 * Player avatar emoji schema (max 16 characters, defaults to 🦁).
 * Rejects ASCII control characters and non-printable sequences.
 */
export const AvatarEmojiSchema = z
  .string()
  .regex(/^[^\x00-\x1F\x7F-\x9F]*$/, "Avatar emoji cannot contain control characters")
  .trim()
  .max(16, "Avatar emoji must be 16 characters or fewer")
  .optional()
  .default("🦁");

/**
 * Chess piece color schema ('w' or 'b').
 */
export const PieceColorSchema = z.enum(["w", "b"]);

/**
 * Chess piece type notation schema ('p', 'n', 'b', 'r', 'q', 'k').
 */
export const PieceTypeSchema = z.enum(["p", "n", "b", "r", "q", "k"]);

/**
 * Preferred piece color selection schema for matchmaking ('w', 'b', or 'random').
 */
export const PreferredColorSchema = z
  .enum(["w", "b", "random"])
  .optional()
  .default("random");

/**
 * Algebraic chess square notation schema (a1 through h8).
 */
export const ChessSquareSchema = z
  .string()
  .regex(/^[a-h][1-8]$/, "Must be a valid chess square notation (a1-h8)");

/**
 * Pawn promotion piece target schema ('q', 'r', 'b', 'n').
 */
export const PromotionPieceSchema = z.enum(["q", "r", "b", "n"]);
export type PromotionPieceDto = z.infer<typeof PromotionPieceSchema>;

/**
 * Public player representation schema.
 * All Player objects are strictly free of private credentials (CRIT-001)
 * and raw transport socket identifiers in client broadcasts (ENH-001).
 * Enforces non-negative epoch milliseconds for audit timestamps (MIN-025).
 */
export const PlayerSchema = z.preprocess(
  (val: unknown) => {
    if (val && typeof val === "object") {
      const candidate = { ...(val as Record<string, unknown>) };
      if (candidate.createdAt === undefined && typeof candidate.connectedAt === "number") {
        candidate.createdAt = candidate.connectedAt;
      }
      if (candidate.updatedAt === undefined && typeof candidate.connectedAt === "number") {
        candidate.updatedAt = candidate.createdAt ?? candidate.connectedAt;
      }
      return candidate;
    }
    return val;
  },
  z
    .object({
      id: z.string().uuid("Player ID must be a valid UUID"),
      name: PlayerNameSchema,
      avatar: AvatarEmojiSchema.optional(),
      color: PieceColorSchema,
      isHost: z.boolean(),
      isConnected: z.boolean(),
      connectedAt: z.number().nonnegative("connectedAt must be a non-negative epoch timestamp"),
      createdAt: z.number().nonnegative("createdAt must be a non-negative epoch timestamp"),
      updatedAt: z.number().nonnegative("updatedAt must be a non-negative epoch timestamp"),
    })
    .refine((data) => data.updatedAt >= data.createdAt, {
      message: "updatedAt must be greater than or equal to createdAt",
      path: ["updatedAt"],
    }),
);
export type PlayerDto = z.infer<typeof PlayerSchema>;

/**
 * Executed move result schema.
 */
export const MoveResultSchema = z.object({
  from: ChessSquareSchema,
  to: ChessSquareSchema,
  san: z.string().min(1),
  piece: PieceTypeSchema,
  color: PieceColorSchema,
  captured: PieceTypeSchema.optional(),
  promotion: PromotionPieceSchema.optional(),
  flags: z.string(),
  fen: z.string().min(1),
  moveNumber: z.number().int().nonnegative(),
  timestamp: z.number().nonnegative(),
});

/**
 * Authoritative game state schema.
 */
export const GameStateSchema = z.object({
  fen: z.string().min(1),
  turn: PieceColorSchema,
  isCheck: z.boolean(),
  isCheckmate: z.boolean(),
  isDraw: z.boolean(),
  isStalemate: z.boolean(),
  isThreefoldRepetition: z.boolean(),
  isInsufficientMaterial: z.boolean(),
  isFiftyMoveRule: z.boolean(),
  moveHistory: z.array(MoveResultSchema),
  capturedWhite: z.array(PieceTypeSchema),
  capturedBlack: z.array(PieceTypeSchema),
  materialAdvantage: z.object({
    white: z.number(),
    black: z.number(),
  }),
  lastMove: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .nullable(),
  moveCount: z.number().int().nonnegative(),
});

/**
 * Rematch proposal state schema.
 */
export const RematchStateSchema = z.object({
  requestedBy: z.string().uuid(),
  requestedAt: z.number().nonnegative(),
  status: z.enum(["pending", "accepted", "declined"]),
});

/**
 * Draw offer state schema.
 */
export const DrawOfferSchema = z.object({
  offeredBy: z.string().uuid(),
  offeredAt: z.number().nonnegative(),
});

/**
 * Room lifecycle status schema.
 */
export const RoomStatusSchema = z.enum([
  "lobby",
  "playing",
  "paused_disconnect",
  "game_over",
  "rematch_pending",
  "abandoned",
]);

/**
 * Authoritative room state schema.
 */
export const RoomStateSchema = z.object({
  roomCode: RoomCodeSchema,
  version: z.number().int().positive().optional(),
  status: RoomStatusSchema,
  hostId: z.string().uuid(),
  whitePlayer: PlayerSchema.nullable(),
  blackPlayer: PlayerSchema.nullable(),
  spectators: z.array(PlayerSchema),
  game: GameStateSchema,
  rematch: RematchStateSchema.nullable(),
  drawOffer: DrawOfferSchema.nullable().optional(),
  createdAt: z.number().nonnegative(),
  lastActivityAt: z.number().nonnegative(),
});

/**
 * Game termination reason schema.
 */
export const GameOverReasonSchema = z.enum([
  "checkmate",
  "stalemate",
  "threefold_repetition",
  "insufficient_material",
  "fifty_move_rule",
  "resignation",
  "draw_agreement",
  "abandonment",
]);

/**
 * Match conclusion broadcast payload schema.
 */
export const GameOverPayloadSchema = z.object({
  winner: z.union([PieceColorSchema, z.literal("draw")]),
  winnerName: z.string().optional(),
  reason: GameOverReasonSchema,
  message: z.string().min(1),
  finalFen: z.string().min(1),
  totalMoves: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
});

/**
 * Socket request schema for creating a new multiplayer room.
 */
export const CreateRoomRequestSchema = z.object({
  playerName: PlayerNameSchema,
  preferredColor: PreferredColorSchema,
  avatar: AvatarEmojiSchema,
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

/**
 * Socket acknowledgement payload schema for successful room:create response (MAJ-003).
 */
export const CreateRoomSuccessResponseSchema = z.object({
  success: z.literal(true),
  room: RoomStateSchema,
  player: PlayerSchema,
  sessionToken: z.string().min(1, "Session token is required"),
});
export type CreateRoomSuccessResponse = z.infer<typeof CreateRoomSuccessResponseSchema>;

/**
 * Socket acknowledgement payload schema for room:create error response (MAJ-003).
 */
export const CreateRoomErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    roomCode: z.string().optional(),
    correlationId: z.string().optional(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type CreateRoomErrorResponse = z.infer<typeof CreateRoomErrorResponseSchema>;

/**
 * Complete socket acknowledgement payload schema for room:create response (MAJ-003).
 */
export const CreateRoomResponseSchema = z.union([
  CreateRoomSuccessResponseSchema,
  CreateRoomErrorResponseSchema,
]);
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;

/**
 * Socket request schema for joining an existing room with a 4-letter code.
 */
export const JoinRoomRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  playerName: PlayerNameSchema,
  avatar: AvatarEmojiSchema,
});
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;

/**
 * Socket request schema for authenticating reconnection using private session credentials.
 */
export const ReconnectRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  playerId: z.string().uuid("Player ID must be a valid UUID"),
  sessionToken: z.string().min(1, "Session token is required").max(128),
});
export type ReconnectRequest = z.infer<typeof ReconnectRequestSchema>;

/**
 * Socket request schema for voluntarily leaving a room.
 */
export const LeaveRoomRequestSchema = z.object({
  roomCode: RoomCodeSchema,
});
export type LeaveRoomRequest = z.infer<typeof LeaveRoomRequestSchema>;

export const RoomLeavePayloadSchema = LeaveRoomRequestSchema;
export type RoomLeavePayload = LeaveRoomRequest;

/**
 * Authoritative player departure reason schema (CRIT-004).
 */
export const PlayerLeftReasonSchema = z.enum([
  "player_left",
  "host_left",
  "kicked",
  "room_closed",
]);
export type PlayerLeftReason = z.infer<typeof PlayerLeftReasonSchema>;

/**
 * Broadcast payload schema when a player leaves the room (CRIT-004).
 */
export const RoomPlayerLeftPayloadSchema = z.object({
  playerId: z.string().min(1),
  playerName: z.string().min(1),
  reason: PlayerLeftReasonSchema.optional(),
});
export type RoomPlayerLeftPayload = z.infer<typeof RoomPlayerLeftPayloadSchema>;

/**
 * Chess move coordinate and promotion payload schema.
 */
export const MovePayloadSchema = z.object({
  from: ChessSquareSchema,
  to: ChessSquareSchema,
  promotion: PromotionPieceSchema.optional(),
});
export type MovePayloadDto = z.infer<typeof MovePayloadSchema>;

/**
 * Socket request schema for submitting a move in an active game room.
 * Accepts RFC 4122 UUID or any safe unique client string token (1-64 chars)
 * to support UUID, nanoid, or cryptographic hex digests without client bypass (MAJ-003).
 */
export const MakeMoveRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  move: MovePayloadSchema,
  /**
   * Expected move counter (half-moves / plies count before applying this move).
   * Used by server for linearizability validation and idempotency deduplication.
   */
  expectedMoveNumber: z.number().int().nonnegative().optional(),
  /**
   * Client-generated idempotency token.
   * Can be a standard UUIDv4 or any alphanumeric/hyphenated token (1 to 64 chars).
   */
  idempotencyKey: z
    .string()
    .min(1, "Idempotency key must not be empty")
    .max(64, "Idempotency key cannot exceed 64 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Idempotency key must be alphanumeric, hyphen, or underscore")
    .optional(),
});
export type MakeMoveRequest = z.infer<typeof MakeMoveRequestSchema>;

/**
 * Socket request schema for resigning an active match.
 */
export const ResignRequestSchema = z.object({
  roomCode: RoomCodeSchema,
});
export type ResignRequest = z.infer<typeof ResignRequestSchema>;

/**
 * Socket request schema for offering a draw to the opponent.
 */
export const OfferDrawRequestSchema = z.object({
  roomCode: RoomCodeSchema,
});
export type OfferDrawRequest = z.infer<typeof OfferDrawRequestSchema>;

/**
 * Socket request schema for accepting or declining a draw offer.
 */
export const RespondDrawRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  accept: z.boolean(),
});
export type RespondDrawRequest = z.infer<typeof RespondDrawRequestSchema>;

/**
 * Socket request schema for requesting a rematch after match conclusion.
 */
export const RequestRematchRequestSchema = z.object({
  roomCode: RoomCodeSchema,
});
export type RequestRematchRequest = z.infer<typeof RequestRematchRequestSchema>;

/**
 * Socket request schema for accepting or declining a rematch request.
 */
export const RespondRematchRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  accept: z.boolean(),
});
export type RespondRematchRequest = z.infer<typeof RespondRematchRequestSchema>;

/**
 * HTTP response schema for the `/api/lan-info` network discovery endpoint.
 */
export const LanInfoResponseSchema = z.object({
  lanIp: z.string(),
  port: z.number().int().positive(),
  localUrl: z.string().url(),
  joinUrl: z.string().url(),
  interfaces: z.array(z.string()),
  relayMode: z.enum(["cloud", "lan"]).optional(),
  isCloudRelay: z.boolean().optional(),
  publicUrl: z.string().url().optional(),
});
export type LanInfoResponse = z.infer<typeof LanInfoResponseSchema>;

/**
 * Public lightweight liveness/readiness probe schema (/health, /api/health).
 */
export const LivenessHealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});
export type LivenessHealthResponse = z.infer<typeof LivenessHealthResponseSchema>;

/**
 * Deep operational telemetry health schema (/metrics, /health/detail).
 */
export const DetailedHealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
  activeRooms: z.number().int().nonnegative(),
  activeSockets: z.number().int().nonnegative(),
  memoryUsageMb: z.object({
    rss: z.number().nonnegative(),
    heapTotal: z.number().nonnegative(),
    heapUsed: z.number().nonnegative(),
  }),
  relay: z
    .object({
      mode: z.enum(["cloud", "lan"]),
      publicUrl: z.string().url().optional(),
    })
    .optional(),
});
export type DetailedHealthResponse = z.infer<typeof DetailedHealthResponseSchema>;

/**
 * HTTP response schema for health check endpoints (`/health`, `/api/health`).
 * Canonical alias for standard health checks (/health, /api/health).
 * Aligned strictly with LivenessHealthResponse to resolve CRIT-001.
 */
export const HealthCheckResponseSchema = LivenessHealthResponseSchema;
export type HealthCheckResponse = LivenessHealthResponse;

/**
 * Standard HTTP error body schema (MAJ-033).
 */
export const HttpErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  correlationId: z.string().optional(),
});
export type HttpErrorBody = z.infer<typeof HttpErrorBodySchema>;

/**
 * Standard HTTP error envelope schema (MAJ-033).
 */
export const HttpErrorEnvelopeSchema = z.object({
  status: z.literal("error"),
  code: z.number().int().min(400).max(599),
  error: HttpErrorBodySchema,
});
export type HttpErrorEnvelope = z.infer<typeof HttpErrorEnvelopeSchema>;

const emptyStringToUndefined = (val: unknown): unknown =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

/**
 * Validates and normalizes URLs, prepending https:// (or http://) if protocol is omitted (MIN-001).
 */
export const UrlSchema = z.preprocess(
  normalizeUrlString,
  z.string().url("Must be a valid URL"),
);

/**
 * Server environment configuration validation schema (MIN-023).
 * Canonical shared contract for server environment variables.
 * Extended by server platform configuration (apps/server/src/platform/config/env.ts).
 */
export const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.preprocess(
    emptyStringToUndefined,
    z.coerce
      .number()
      .int()
      .min(0, "Port must be >= 0")
      .max(65535, "Port must be <= 65535")
      .default(3000),
  ),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.preprocess(emptyStringToUndefined, z.string().optional()),
  PUBLIC_URL: z.preprocess(
    normalizeUrlString,
    z.string().url("PUBLIC_URL must be a valid URL").optional(),
  ),
  LAN_IP: z.preprocess(
    emptyStringToUndefined,
    z.string().ip("LAN_IP must be a valid IP address").optional(),
  ),
  HOST_IP: z.preprocess(
    emptyStringToUndefined,
    z.string().ip("HOST_IP must be a valid IP address").optional(),
  ),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  METRICS_SECRET: z.preprocess(emptyStringToUndefined, z.string().optional()),
  MAX_ROOMS: z.preprocess(
    emptyStringToUndefined,
    z.coerce
      .number()
      .int()
      .positive("MAX_ROOMS must be a positive integer")
      .optional(),
  ),
  SESSION_SECRET: z.preprocess(emptyStringToUndefined, z.string().optional()),
  CLIENT_URL: z.preprocess(emptyStringToUndefined, z.string().optional()),
  CLIENT_DIST_PATH: z.preprocess(emptyStringToUndefined, z.string().optional()),
});
export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Performance star rating schema (1, 2, or 3 stars).
 */
export const StarRatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type StarRatingDto = z.infer<typeof StarRatingSchema>;

/**
 * User progress record schema for an individual scenario.
 */
export const ScenarioProgressSchema = z.object({
  scenarioId: z.string().min(1),
  starsEarned: StarRatingSchema,
  attemptsCount: z.number().int().nonnegative(),
  hintsUsedTotal: z.number().int().nonnegative(),
  firstCompletedAt: z.number().nonnegative(),
  lastCompletedAt: z.number().nonnegative(),
});
export type ScenarioProgressDto = z.infer<typeof ScenarioProgressSchema>;

/**
 * Key-value mapping schema of scenario ID to scenario progress record.
 */
export const ScenarioProgressMapSchema = z.record(
  z.string(),
  ScenarioProgressSchema,
);
export type ScenarioProgressMapDto = z.infer<typeof ScenarioProgressMapSchema>;

/**
 * Historical rating point schema for adaptive rating progression.
 */
export const RatingHistoryPointSchema = z.object({
  timestamp: z.number().nonnegative(),
  rating: z.number(),
  puzzleId: z.string(),
  delta: z.number(),
});
export type RatingHistoryPointDto = z.infer<typeof RatingHistoryPointSchema>;

/**
 * Adaptive Elo rating state schema.
 */
export const AdaptiveRatingStateSchema = z.object({
  rating: z.number(),
  ratingDeviation: z.number(),
  peakRating: z.number(),
  totalAttempted: z.number().int().nonnegative(),
  totalSolved: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  ratingHistory: z.array(RatingHistoryPointSchema),
});
export type AdaptiveRatingStateDto = z.infer<typeof AdaptiveRatingStateSchema>;

/**
 * Authoritative schema for valid tactical and positional puzzle themes.
 * Reconciled with PuzzleTheme union in puzzle.ts (MAJ-024).
 */
export const PuzzleThemeSchema = z.enum(PUZZLE_THEMES);
export type PuzzleThemeDto = z.infer<typeof PuzzleThemeSchema>;

/**
 * Theme mastery progress record schema.
 * Constrains theme using PuzzleThemeSchema to eliminate schema drift (MAJ-024).
 */
export const ThemeMasteryProgressSchema = z.object({
  theme: PuzzleThemeSchema,
  attempted: z.number().int().nonnegative(),
  solved: z.number().int().nonnegative(),
  starsEarned: z.number().int().nonnegative(),
  masteryLevel: z.enum(["novice", "apprentice", "master"]),
  lastPracticedAt: z.number().nonnegative(),
});
export type ThemeMasteryProgressDto = z.infer<typeof ThemeMasteryProgressSchema>;

/**
 * High scores and arcade run statistics schema.
 */
export const PuzzleArcadeStatsSchema = z.object({
  puzzleRushHighScore: z.number().int().nonnegative(),
  puzzleRushBestStreak: z.number().int().nonnegative(),
  streakSurvivorHighScore: z.number().int().nonnegative(),
  totalRushRuns: z.number().int().nonnegative(),
});
export type PuzzleArcadeStatsDto = z.infer<typeof PuzzleArcadeStatsSchema>;

/**
 * Record schema of a solved puzzle.
 */
export const SolvedPuzzleRecordSchema = z.object({
  stars: StarRatingSchema,
  solvedAt: z.number().nonnegative(),
});
export type SolvedPuzzleRecordDto = z.infer<typeof SolvedPuzzleRecordSchema>;

/**
 * Overall persistent user progress across Puzzle Hub.
 */
export const PuzzleProgressSchema = z.object({
  ratingProfile: AdaptiveRatingStateSchema,
  themeMastery: z.record(z.string(), ThemeMasteryProgressSchema),
  arcadeStats: PuzzleArcadeStatsSchema,
  solvedPuzzles: z.record(z.string(), SolvedPuzzleRecordSchema),
  createdAt: z.number().nonnegative(),
  lastActiveAt: z.number().nonnegative(),
});
export type PuzzleProgressDto = z.infer<typeof PuzzleProgressSchema>;

/**
 * Canonical top-level schema containing complete user progress across all single-player modes (ENH-012).
 */
export const UnifiedProgressPayloadSchema = z.object({
  version: z.number().int().positive(),
  exportedAt: z.number().nonnegative(),
  clientVersion: z.string().optional(),
  scenarios: ScenarioProgressMapSchema,
  puzzles: PuzzleProgressSchema,
});
export type UnifiedProgressPayloadDto = z.infer<typeof UnifiedProgressPayloadSchema>;

/**
 * Envelope structure schema used when exporting to JSON backup files (ENH-012).
 */
export const UnifiedProgressEnvelopeSchema = z.object({
  magic: z.literal("FC_PROGRESS_V1"),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string().min(1),
  checksum: z.string().min(1),
  payload: UnifiedProgressPayloadSchema,
});
export type UnifiedProgressEnvelopeDto = z.infer<typeof UnifiedProgressEnvelopeSchema>;

/**
 * Strategy schema for resolving conflicts when importing progress.
 */
export const SyncMergeStrategySchema = z.enum([
  "smart_merge",
  "replace_local",
  "keep_local",
]);
export type SyncMergeStrategyDto = z.infer<typeof SyncMergeStrategySchema>;

