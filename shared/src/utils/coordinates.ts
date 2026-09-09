import type { Square } from "../contracts/models.js";

/**
 * Pure 2D and algebraic coordinates for a chess square.
 * - file: 0..7 ('a'=0, 'h'=7)
 * - rank: 0..7 ('1'=0, '8'=7)
 * - row: 0..7 array row index (0=rank 8, 7=rank 1)
 * - col: 0..7 array column index (0=file 'a', 7=file 'h')
 */
export interface BoardCoordinates {
  readonly file: number;
  readonly rank: number;
  readonly row: number;
  readonly col: number;
}

/**
 * Converts algebraic square notation ('a1'..'h8') to 0-based coordinate representations.
 * Handles uppercase, lowercase, and whitespace cleanly.
 * Clamps coordinates to valid 0..7 bounds.
 *
 * @param square - Algebraic square name (e.g. "e4", "A1")
 * @returns BoardCoordinates object containing file, rank, row, and col
 */
export function squareToCoords(square: Square | string): BoardCoordinates {
  const clean = String(square || "").trim().toLowerCase();
  const fileChar = clean.charAt(0);
  const rankChar = clean.charAt(1);

  const rawFile = fileChar.charCodeAt(0) - 97;
  const rawRank = parseInt(rankChar, 10) - 1;

  const file = Math.max(0, Math.min(7, Number.isNaN(rawFile) ? 0 : rawFile));
  const rank = Math.max(0, Math.min(7, Number.isNaN(rawRank) ? 0 : rawRank));
  const col = file;
  const row = 7 - rank;

  return { file, rank, row, col };
}

/**
 * Converts row/column board array indices (0..7) to an algebraic Square ('a1'..'h8').
 * Note: row 0 corresponds to rank 8, and col 0 corresponds to file 'a'.
 *
 * @param row - 0-based matrix row (0=rank 8, 7=rank 1)
 * @param col - 0-based matrix column (0=file 'a', 7=file 'h')
 * @returns Strongly-typed algebraic Square
 */
export function coordsToSquare(row: number, col: number): Square;

/**
 * Converts a coordinate object to an algebraic Square ('a1'..'h8').
 * Accepts either { row, col } or { file, rank }.
 *
 * @param coords - Object containing either row/col or file/rank
 * @returns Strongly-typed algebraic Square
 */
export function coordsToSquare(
  coords:
    | { row: number; col: number }
    | { file: number; rank: number }
    | { row?: number; col?: number; file?: number; rank?: number },
): Square;

export function coordsToSquare(
  rowOrCoords:
    | number
    | { row?: number; col?: number; file?: number; rank?: number },
  colInput?: number,
): Square {
  let file = 0;
  let rank = 0;

  if (typeof rowOrCoords === "number") {
    const row = Math.max(0, Math.min(7, Math.floor(rowOrCoords)));
    const col = Math.max(0, Math.min(7, Math.floor(colInput ?? 0)));
    file = col;
    rank = 7 - row;
  } else if (rowOrCoords && typeof rowOrCoords === "object") {
    if (
      typeof rowOrCoords.file === "number" &&
      typeof rowOrCoords.rank === "number"
    ) {
      file = Math.max(0, Math.min(7, Math.floor(rowOrCoords.file)));
      rank = Math.max(0, Math.min(7, Math.floor(rowOrCoords.rank)));
    } else {
      const row = Math.max(0, Math.min(7, Math.floor(rowOrCoords.row ?? 0)));
      const col = Math.max(0, Math.min(7, Math.floor(rowOrCoords.col ?? 0)));
      file = col;
      rank = 7 - row;
    }
  }

  const fileChar = String.fromCharCode(97 + file);
  const rankNum = rank + 1;
  return `${fileChar}${rankNum}` as Square;
}
