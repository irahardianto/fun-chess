import { PlayerNameSchema } from "../contracts/schemas.js";

/**
 * Normalizes a 4-letter room code by trimming whitespace and converting to uppercase (MAJ-009).
 *
 * @param code - Raw room code string to normalize
 * @returns Trimmed and uppercase room code string
 */
export function normalizeRoomCode(code: string): string {
  return (code || "").trim().toUpperCase();
}

/**
 * Validates and normalizes a player display name according to PlayerNameSchema allowlist (MAJ-009).
 * Returns trimmed name, or throws ZodError if invalid.
 *
 * @param name - Raw player display name to validate
 * @returns Trimmed and validated player name
 * @throws {import("zod").ZodError} If name does not conform to PlayerNameSchema constraints
 */
export function validatePlayerName(name: string): string {
  return PlayerNameSchema.parse(name);
}
