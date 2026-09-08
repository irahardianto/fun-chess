import { z } from "zod";

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
 * Public player representation schema.
 * All Player objects are strictly free of private credentials (CRIT-001).
 */
export const PlayerSchema = z.object({
  id: z.string().uuid("Player ID must be a valid UUID"),
  socketId: z.string().min(1, "Socket ID must not be empty"),
  name: PlayerNameSchema,
  avatar: AvatarEmojiSchema,
  color: PieceColorSchema,
  isHost: z.boolean(),
  isConnected: z.boolean(),
  connectedAt: z.number().nonnegative(),
});

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
 * Chess move coordinate and promotion payload schema.
 */
export const MovePayloadSchema = z.object({
  from: ChessSquareSchema,
  to: ChessSquareSchema,
  promotion: PromotionPieceSchema.optional(),
});
export type MovePayload = z.infer<typeof MovePayloadSchema>;

/**
 * Socket request schema for submitting a move in an active game room.
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
   * Client-generated UUID idempotency token.
   * If a move with this idempotency key was already applied, the server returns
   * the existing move result without throwing NotYourTurnError.
   */
  idempotencyKey: z.string().uuid().optional(),
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
 * Normalizes a URL string by prepending a protocol if omitted (MIN-001).
 * - Trims leading/trailing whitespace
 * - Turns empty string into undefined
 * - Protocol-relative URL (`//example.com`) -> `https://example.com`
 * - Missing protocol: `localhost` or `127.0.0.1` -> `http://...`, other hostnames -> `https://...`
 *
 * @param val - Input value to normalize
 * @returns Normalized URL string or undefined
 */
export function normalizeUrlString(val: unknown): unknown {
  if (typeof val !== "string") return val;
  let trimmed = val.trim();
  if (trimmed === "") return undefined;
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(trimmed);
    return `${isLocal ? "http://" : "https://"}${trimmed}`;
  }
  return trimmed;
}

/**
 * Safely parses and normalizes a URL string (MIN-001).
 * If protocol is missing, prepends https:// (or http:// for localhost/127.0.0.1).
 * Returns URL object if valid, or undefined if invalid.
 *
 * @param input - URL string to parse
 * @returns Parsed URL instance or undefined
 */
export function safeParseUrl(input: string | undefined): URL | undefined {
  if (!input || typeof input !== "string") return undefined;
  const normalized = normalizeUrlString(input);
  if (!normalized || typeof normalized !== "string") return undefined;
  try {
    const parsed = new URL(normalized);
    if (!parsed.hostname) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Validates and normalizes URLs, prepending https:// (or http://) if protocol is omitted (MIN-001).
 */
export const UrlSchema = z.preprocess(
  normalizeUrlString,
  z.string().url("Must be a valid URL"),
);

/**
 * Server environment configuration validation schema.
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
});
export type ServerEnv = z.infer<typeof ServerEnvSchema>;
