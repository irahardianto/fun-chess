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
 */
export const AvatarEmojiSchema = z
  .string()
  .trim()
  .max(16, "Avatar emoji must be 16 characters or fewer")
  .optional()
  .default("🦁");

/**
 * Chess piece color schema ('w' or 'b').
 */
export const PieceColorSchema = z.enum(["w", "b"]);

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
 * HTTP response schema for health check endpoints (`/health`, `/api/health`).
 */
export const HealthCheckResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
  activeRooms: z.number().int().nonnegative(),
  activeSockets: z.number().int().nonnegative(),
  memoryUsageMb: z.object({
    rss: z.number(),
    heapTotal: z.number(),
    heapUsed: z.number(),
  }),
  relay: z
    .object({
      mode: z.enum(["cloud", "lan"]),
      publicUrl: z.string().url().optional(),
    })
    .optional(),
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

const emptyStringToUndefined = (val: unknown): unknown =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

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
    emptyStringToUndefined,
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
