import type { Square } from "../contracts/models.js";

/**
 * Parsed components of a standard UCI chess move string.
 */
export interface ParsedUciMove {
  from: Square;
  to: Square;
  promotion?: "q" | "r" | "b" | "n";
}

/**
 * Validates whether a string is a well-formed UCI move string (e.g. "e2e4", "e7e8q").
 *
 * @param uci - Potential UCI move string
 * @returns true if well-formed UCI move, false otherwise
 */
export function isValidUci(uci: string): boolean {
  if (typeof uci !== "string") return false;
  return /^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/.test(uci);
}

/**
 * Parses a UCI move string (e.g. "e2e4", "e7e8q") into constituent parts.
 *
 * @param uci - UCI move notation string
 * @returns Parsed UCI move components { from, to, promotion }
 */
export function parseUci(uci: string): ParsedUciMove {
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promoChar = uci.length > 4 ? uci.charAt(4).toLowerCase() : undefined;
  const promotion =
    promoChar === "q" || promoChar === "r" || promoChar === "b" || promoChar === "n"
      ? promoChar
      : undefined;

  return { from, to, promotion };
}

/**
 * Alias for parseUci matching legacy puzzle validator naming.
 */
export const parseUciMove = parseUci;

/**
 * Formats a move action or object into a standard 4-5 character UCI string.
 *
 * @param move - Move object containing from, to, and optional promotion
 * @returns Standard 4-5 character UCI string (e.g. "e2e4", "e7e8q")
 */
export function toUci(move: {
  from: Square | string;
  to: Square | string;
  promotion?: string | null;
}): string {
  const promo = move.promotion ? move.promotion.toLowerCase() : "";
  return `${move.from}${move.to}${promo}`;
}

/**
 * Alias for toUci matching legacy puzzle validator naming.
 */
export const formatPlayerMoveToUci = toUci;
