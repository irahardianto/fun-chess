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
/**
 * Inferred DTO type for chess pawn promotion piece target ('q' | 'r' | 'b' | 'n').
 */
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
/**
 * Inferred DTO type for sanitized public player representation.
 */
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
/**
 * Request payload for creating a new multiplayer game room.
 */
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
/**
 * Success response acknowledgement payload when a room is created.
 */
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
/**
 * Error response acknowledgement payload when room creation fails.
 */
export type CreateRoomErrorResponse = z.infer<typeof CreateRoomErrorResponseSchema>;

/**
 * Complete socket acknowledgement payload schema for room:create response (MAJ-003).
 */
export const CreateRoomResponseSchema = z.union([
  CreateRoomSuccessResponseSchema,
  CreateRoomErrorResponseSchema,
]);
/**
 * Union type representing either a successful or failed room creation response.
 */
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;

/**
 * Socket request schema for joining an existing room with a 4-letter code.
 */
export const JoinRoomRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  playerName: PlayerNameSchema,
  avatar: AvatarEmojiSchema,
});
/**
 * Request payload for joining an existing game room with a 4-letter code.
 */
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;

/**
 * Socket request schema for authenticating reconnection using private session credentials.
 */
export const ReconnectRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  playerId: z.string().uuid("Player ID must be a valid UUID"),
  sessionToken: z.string().min(1, "Session token is required").max(128),
});
/**
 * Request payload for reconnecting to a game room using saved session credentials.
 */
export type ReconnectRequest = z.infer<typeof ReconnectRequestSchema>;

/**
 * Socket request schema for voluntarily leaving a room.
 */
export const LeaveRoomRequestSchema = z.object({
  roomCode: RoomCodeSchema,
});
/**
 * Request payload for voluntarily leaving a room.
 */
export type LeaveRoomRequest = z.infer<typeof LeaveRoomRequestSchema>;

/**
 * Alias schema for room departure request payload.
 */
export const RoomLeavePayloadSchema = LeaveRoomRequestSchema;
/**
 * Alias type for room departure request payload.
 */
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
/**
 * Reason code describing why a player departed from a room.
 */
export type PlayerLeftReason = z.infer<typeof PlayerLeftReasonSchema>;

/**
 * Broadcast payload schema when a player leaves the room (CRIT-004).
 */
export const RoomPlayerLeftPayloadSchema = z.object({
  playerId: z.string().min(1),
  playerName: z.string().min(1),
  reason: PlayerLeftReasonSchema.optional(),
});
/**
 * Broadcast payload emitted when a player departs from a room.
 */
export type RoomPlayerLeftPayload = z.infer<typeof RoomPlayerLeftPayloadSchema>;

/**
 * Chess move coordinate and promotion payload schema.
 */
export const MovePayloadSchema = z.object({
  from: ChessSquareSchema,
  to: ChessSquareSchema,
  promotion: PromotionPieceSchema.optional(),
});
/**
 * Chess move coordinates and optional promotion piece payload.
 */
export type MovePayloadDto = z.infer<typeof MovePayloadSchema>;

/**
 * Socket request schema for submitting a move in an active game room.
 * Includes optional HMAC sessionToken for cryptographic authentication (MAJ-007).
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
  /** Cryptographic HMAC session token for player verification (MAJ-007) */
  sessionToken: z
    .string()
    .min(1, "Session token cannot be empty")
    .max(256, "Session token exceeds maximum length")
    .optional(),
});
/**
 * Socket request payload for submitting a move in an active game room.
 */
export type MakeMoveRequest = z.infer<typeof MakeMoveRequestSchema>;

/**
 * Socket request schema for resigning an active match.
 * Includes optional HMAC sessionToken for cryptographic authentication (MAJ-007).
 */
export const ResignRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  sessionToken: z.string().min(1, "Session token cannot be empty").max(256).optional(),
});
/**
 * Socket request payload for resigning an active match.
 */
export type ResignRequest = z.infer<typeof ResignRequestSchema>;

/**
 * Socket request schema for offering a draw to the opponent.
 * Includes optional HMAC sessionToken for cryptographic authentication (MAJ-007).
 */
export const OfferDrawRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  sessionToken: z.string().min(1, "Session token cannot be empty").max(256).optional(),
});
/**
 * Socket request payload for offering a draw to the opponent.
 */
export type OfferDrawRequest = z.infer<typeof OfferDrawRequestSchema>;

/**
 * Socket request schema for accepting or declining a draw offer.
 * Includes optional HMAC sessionToken for cryptographic authentication (MAJ-007).
 */
export const RespondDrawRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  accept: z.boolean(),
  sessionToken: z.string().min(1, "Session token cannot be empty").max(256).optional(),
});
/**
 * Socket request payload for accepting or declining a draw offer.
 */
export type RespondDrawRequest = z.infer<typeof RespondDrawRequestSchema>;

/**
 * Socket request schema for requesting a rematch after match conclusion.
 * Includes optional HMAC sessionToken for cryptographic authentication (MAJ-007).
 */
export const RequestRematchRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  sessionToken: z.string().min(1, "Session token cannot be empty").max(256).optional(),
});
/**
 * Socket request payload for requesting a rematch after match conclusion.
 */
export type RequestRematchRequest = z.infer<typeof RequestRematchRequestSchema>;

/**
 * Socket request schema for accepting or declining a rematch request.
 * Includes optional HMAC sessionToken for cryptographic authentication (MAJ-007).
 */
export const RespondRematchRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  accept: z.boolean(),
  sessionToken: z.string().min(1, "Session token cannot be empty").max(256).optional(),
});
/**
 * Socket request payload for accepting or declining a rematch request.
 */
export type RespondRematchRequest = z.infer<typeof RespondRematchRequestSchema>;

/**
 * Host network addressing information payload schema.
 * Aligned between server relay service and shared contracts (MIN-010).
 */
export const LanInfoResponseSchema = z.object({
  /** Primary local area network IPv4 address */
  lanIp: z.string(),
  /** Active listening HTTP/WS TCP port */
  port: z.number().int().positive(),
  /** Absolute local network base URL for LAN play (e.g. "http://192.168.1.100:3000") */
  localUrl: z.string().url(),
  /** Full join URL with default route for QR code pairing */
  joinUrl: z.string().url(),
  /** List of all non-internal IPv4 interface addresses discovered on host */
  interfaces: z.array(z.string()),
  /** Operating relay mode: 'cloud' when behind public URL / reverse proxy, 'lan' for direct LAN */
  relayMode: z.enum(["cloud", "lan"]),
  /** Boolean flag indicating if server operates in cloud relay mode */
  isCloudRelay: z.boolean(),
  /** Public base URL when deployed to Cloud Run or behind reverse proxy */
  publicUrl: z.string().url().optional(),
});
/**
 * Inferred TypeScript type for LanInfoResponseSchema.
 */
export type LanInfoResponse = z.infer<typeof LanInfoResponseSchema>;

/**
 * Standard REST success envelope for LAN info discovery (MAJ-009).
 */
export const LanInfoEnvelopeSchema = z.object({
  data: LanInfoResponseSchema,
});
/**
 * Inferred TypeScript type for LanInfoEnvelopeSchema.
 */
export type LanInfoEnvelope = z.infer<typeof LanInfoEnvelopeSchema>;

/**
 * Public lightweight liveness/readiness probe schema (/health, /api/health).
 */
export const LivenessHealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});
/**
 * Inferred response payload for liveness/readiness health check probe.
 */
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
/**
 * Inferred response payload for deep operational telemetry and metrics probe.
 */
export type DetailedHealthResponse = z.infer<typeof DetailedHealthResponseSchema>;

/**
 * HTTP response schema for health check endpoints (`/health`, `/api/health`).
 * Canonical alias for standard health checks (/health, /api/health).
 * Aligned strictly with LivenessHealthResponse to resolve CRIT-001.
 */
export const HealthCheckResponseSchema = LivenessHealthResponseSchema;
/**
 * Canonical alias type for liveness health check probe response.
 */
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
/**
 * Inferred standard HTTP error body payload.
 */
export type HttpErrorBody = z.infer<typeof HttpErrorBodySchema>;

/**
 * Standard HTTP error envelope schema (MAJ-033).
 */
export const HttpErrorEnvelopeSchema = z.object({
  status: z.literal("error"),
  code: z.number().int().min(400).max(599),
  error: HttpErrorBodySchema,
});
/**
 * Inferred standard HTTP error envelope response payload.
 */
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
  TRUST_PROXY: z.preprocess((val) => {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
    return false;
  }, z.boolean().default(false)),
  RATE_LIMIT_WINDOW_MS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  RATE_LIMIT_MAX_REQUESTS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  RATE_LIMIT_MAX_KEYS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  RATE_LIMIT_ROOM_CREATE_MAX: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(3),
  ),
});

/**
 * Base canonical server environment configuration schema (MIN-001).
 * Extended or consumed across server platform configuration.
 */
export const BaseServerEnvSchema = ServerEnvSchema;

/**
 * Inferred server environment configuration type.
 */
export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Inferred base server environment configuration type.
 */
export type BaseServerEnv = z.infer<typeof BaseServerEnvSchema>;

/**
 * Performance star rating schema (1, 2, or 3 stars).
 */
export const StarRatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
/**
 * Inferred performance star rating value (1, 2, or 3 stars).
 */
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
/**
 * Inferred user progress record for an individual scenario.
 */
export type ScenarioProgressDto = z.infer<typeof ScenarioProgressSchema>;

/**
 * Key-value mapping schema of scenario ID to scenario progress record.
 */
export const ScenarioProgressMapSchema = z.record(
  z.string(),
  ScenarioProgressSchema,
);
/**
 * Inferred dictionary mapping scenario ID to individual scenario progress records.
 */
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
/**
 * Inferred historical rating data point recording rating progression over time.
 */
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
/**
 * Inferred adaptive Elo rating state and performance statistics.
 */
export type AdaptiveRatingStateDto = z.infer<typeof AdaptiveRatingStateSchema>;

/**
 * Authoritative schema for valid tactical and positional puzzle themes.
 * Reconciled with PuzzleTheme union in puzzle.ts (MAJ-024).
 */
export const PuzzleThemeSchema = z.enum(PUZZLE_THEMES);
/**
 * Inferred valid tactical or positional chess puzzle theme identifier.
 */
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
/**
 * Inferred user mastery progress record for a specific tactical puzzle theme.
 */
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
/**
 * Inferred arcade game mode statistics (Puzzle Rush and Streak Survivor high scores).
 */
export type PuzzleArcadeStatsDto = z.infer<typeof PuzzleArcadeStatsSchema>;

/**
 * Record schema of a solved puzzle.
 */
export const SolvedPuzzleRecordSchema = z.object({
  stars: StarRatingSchema,
  solvedAt: z.number().nonnegative(),
});
/**
 * Inferred record of an individual solved puzzle with star rating and completion timestamp.
 */
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
/**
 * Inferred overall persistent user progress across Puzzle Hub.
 */
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
/**
 * Inferred top-level data transfer object representing all user progress across scenarios and puzzles.
 */
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
/**
 * Inferred backup file envelope with checksum, schema version, and progress payload.
 */
export type UnifiedProgressEnvelopeDto = z.infer<typeof UnifiedProgressEnvelopeSchema>;

/**
 * Strategy schema for resolving conflicts when importing progress.
 */
export const SyncMergeStrategySchema = z.enum([
  "smart_merge",
  "replace_local",
  "keep_local",
]);
/**
 * Inferred strategy mode used when merging imported progress with local progress.
 */
export type SyncMergeStrategyDto = z.infer<typeof SyncMergeStrategySchema>;

