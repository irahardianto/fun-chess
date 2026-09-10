import type { Square as ChessSquare } from "chess.js";

/**
 * Algebraic chess square notation (a1 through h8).
 * Reconciled directly with chess.js Square type (MIN-017).
 */
export type Square = ChessSquare;

/**
 * Readonly array of all 64 standard algebraic chess squares ('a1' through 'h8').
 */
export const SQUARES: readonly Square[] = [
  "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1",
  "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
  "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3",
  "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
  "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5",
  "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
  "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7",
  "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8",
] as const;

const SQUARE_SET: ReadonlySet<string> = new Set<string>(SQUARES);

/**
 * Runtime type guard asserting whether an unknown value is a valid algebraic chess square ('a1'..'h8').
 * Eliminates unsafe double casting (`val as unknown as Square`) per MIN-017.
 *
 * @param val - The candidate value to check
 * @returns True if val is a valid algebraic chess square, false otherwise
 */
export function isSquare(val: unknown): val is Square {
  return typeof val === "string" && SQUARE_SET.has(val);
}
