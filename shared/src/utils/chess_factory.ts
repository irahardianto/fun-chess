import { Chess, validateFen } from "chess.js";

/**
 * Standard chess starting position FEN.
 */
export const DEFAULT_CHESS_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Validates whether a given value is a syntactically and structurally valid chess FEN.
 *
 * @param fen - Potential FEN string to validate
 * @returns true if valid chess FEN, false otherwise
 */
export function isValidFen(fen: unknown): fen is string {
  if (typeof fen !== "string") {
    return false;
  }
  const trimmed = fen.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const result = validateFen(trimmed);
    return result.ok === true;
  } catch {
    return false;
  }
}

/**
 * Safely creates a Chess instance.
 * - If fen is omitted, undefined, or empty, initializes standard starting position.
 * - If fen is valid, loads the specified position.
 * - If fen is invalid or causes an error, falls back safely to standard starting position and logs a warning.
 *
 * @param fen - Optional FEN string to initialize
 * @returns A fully valid, initialized Chess instance
 */
export function createSafeChess(fen?: string): Chess {
  if (!fen || typeof fen !== "string") {
    return new Chess();
  }

  const trimmed = fen.trim();
  if (!trimmed) {
    return new Chess();
  }

  try {
    const validation = validateFen(trimmed);
    if (!validation.ok) {
      console.warn(
        `[createSafeChess] Invalid FEN "${trimmed}": ${validation.error ?? "Malformed position"}. Falling back to standard starting position.`,
      );
      return new Chess();
    }
    return new Chess(trimmed);
  } catch (err) {
    console.warn(
      `[createSafeChess] Failed to initialize position "${trimmed}": ${err instanceof Error ? err.message : String(err)}. Falling back to standard starting position.`,
    );
    return new Chess();
  }
}

/**
 * Safely loads a FEN into an existing Chess instance without crashing if the FEN is invalid.
 * If the FEN is invalid or throws, the chess instance is restored to its previous position
 * (or standard position if corrupted) and returns false.
 *
 * @param chess - The Chess instance to update
 * @param fen - The FEN string to load
 * @returns true if the FEN was successfully loaded, false otherwise
 */
export function safeLoadFen(chess: Chess, fen: string): boolean {
  if (!chess || !isValidFen(fen)) {
    return false;
  }

  const previousFen = chess.fen();
  try {
    chess.load(fen.trim());
    return true;
  } catch (err) {
    console.warn(
      `[safeLoadFen] Failed to load FEN "${fen}": ${err instanceof Error ? err.message : String(err)}.`,
    );
    // Restore previous state if possible
    try {
      chess.load(previousFen);
    } catch {
      chess.reset();
    }
    return false;
  }
}
