import type { PieceType, PieceColor, Square, PieceSquareTable, PieceSquareTableSet } from '@fun-chess/shared';
export type { PieceSquareTable, PieceSquareTableSet };

/**
 * Standard material values in centipawns.
 */
export const PIECE_VALUES: Readonly<Record<PieceType, number>> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
} as const;

/**
 * Pawns Piece-Square Table (White perspective, Rank 8 down to Rank 1).
 */
export const PAWNS_PST: PieceSquareTable = [
   0,   0,   0,   0,   0,   0,   0,   0,
  50,  50,  50,  50,  50,  50,  50,  50,
  10,  10,  20,  30,  30,  20,  10,  10,
   5,   5,  10,  25,  25,  10,   5,   5,
   0,   0,   0,  20,  20,   0,   0,   0,
   5,  -5, -10,   0,   0, -10,  -5,   5,
   5,  10,  10, -20, -20,  10,  10,   5,
   0,   0,   0,   0,   0,   0,   0,   0,
];

/**
 * Knights Piece-Square Table.
 */
export const KNIGHTS_PST: PieceSquareTable = [
 -50, -40, -30, -30, -30, -30, -40, -50,
 -40, -20,   0,   0,   0,   0, -20, -40,
 -30,   0,  10,  15,  15,  10,   0, -30,
 -30,   5,  15,  20,  20,  15,   5, -30,
 -30,   0,  15,  20,  20,  15,   0, -30,
 -30,   5,  10,  15,  15,  10,   5, -30,
 -40, -20,   0,   5,   5,   0, -20, -40,
 -50, -40, -30, -30, -30, -30, -40, -50,
];

/**
 * Bishops Piece-Square Table.
 */
export const BISHOPS_PST: PieceSquareTable = [
 -20, -10, -10, -10, -10, -10, -10, -20,
 -10,   0,   0,   0,   0,   0,   0, -10,
 -10,   0,   5,  10,  10,   5,   0, -10,
 -10,   5,   5,  10,  10,   5,   5, -10,
 -10,   0,  10,  10,  10,  10,   0, -10,
 -10,  10,  10,  10,  10,  10,  10, -10,
 -10,   5,   0,   0,   0,   0,   5, -10,
 -20, -10, -10, -10, -10, -10, -10, -20,
];

/**
 * Rooks Piece-Square Table.
 */
export const ROOKS_PST: PieceSquareTable = [
   0,   0,   0,   0,   0,   0,   0,   0,
   5,  10,  10,  10,  10,  10,  10,   5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
   0,   0,   0,   5,   5,   0,   0,   0,
];

/**
 * Queens Piece-Square Table.
 */
export const QUEENS_PST: PieceSquareTable = [
 -20, -10, -10,  -5,  -5, -10, -10, -20,
 -10,   0,   0,   0,   0,   0,   0, -10,
 -10,   0,   5,   5,   5,   5,   0, -10,
  -5,   0,   5,   5,   5,   5,   0,  -5,
   0,   0,   5,   5,   5,   5,   0,  -5,
 -10,   5,   5,   5,   5,   5,   0, -10,
 -10,   0,   5,   0,   0,   0,   0, -10,
 -20, -10, -10,  -5,  -5, -10, -10, -20,
];

/**
 * King Middle Game Piece-Square Table.
 */
export const KING_MIDDLEGAME_PST: PieceSquareTable = [
 -30, -40, -40, -50, -50, -40, -40, -30,
 -30, -40, -40, -50, -50, -40, -40, -30,
 -30, -40, -40, -50, -50, -40, -40, -30,
 -30, -40, -40, -50, -50, -40, -40, -30,
 -20, -30, -30, -40, -40, -30, -20, -20,
 -10, -20, -20, -20, -20, -20, -20, -10,
  20,  20,   0,   0,   0,   0,  20,  20,
  20,  30,  10,   0,   0,  10,  30,  20,
];

/**
 * King Endgame Piece-Square Table.
 */
export const KING_ENDGAME_PST: PieceSquareTable = [
 -50, -40, -30, -20, -20, -30, -40, -50,
 -30, -20, -10,   0,   0, -10, -20, -30,
 -30, -10,  20,  30,  30,  20, -10, -30,
 -30, -10,  30,  40,  40,  30, -10, -30,
 -30, -10,  30,  40,  40,  30, -10, -30,
 -30, -10,  20,  30,  30,  20, -10, -30,
 -30, -30,   0,   0,   0,   0, -30, -30,
 -50, -30, -30, -30, -30, -30, -30, -50,
];

/**
 * Default Piece-Square Table registry.
 */
export const DEFAULT_PST_TABLES: PieceSquareTableSet = {
  pawns: PAWNS_PST,
  knights: KNIGHTS_PST,
  bishops: BISHOPS_PST,
  rooks: ROOKS_PST,
  queens: QUEENS_PST,
  kingMiddleGame: KING_MIDDLEGAME_PST,
  kingEndGame: KING_ENDGAME_PST,
};

/**
 * Converts standard chess square notation ('a1'-'h8') into 0-63 0-based array index.
 * Index 0 is a8, Index 63 is h1.
 */
export function squareToIndex(square: Square | string): number {
  if (square.length < 2) return 0;
  const file = (square.charCodeAt(0) - 97); // 'a' -> 0, 'h' -> 7
  const rank = parseInt(square[1] ?? '1', 10); // 1..8
  const clampedFile = Math.max(0, Math.min(7, file));
  const clampedRank = Math.max(1, Math.min(8, rank));
  return (8 - clampedRank) * 8 + clampedFile;
}

/**
 * Converts 0-63 array index back to standard chess square notation.
 */
export function indexToSquare(index: number): Square {
  const clamped = Math.max(0, Math.min(63, Math.floor(index)));
  const rank = 8 - Math.floor(clamped / 8);
  const file = String.fromCharCode(97 + (clamped % 8));
  return `${file}${rank}` as Square;
}

/**
 * Flips the square index vertically for Black perspective.
 */
export function mirrorSquareIndex(index: number): number {
  return index ^ 56;
}

/**
 * Calculates the PST positional value for a specific piece on a specific square.
 */
export function getPieceSquareValue(
  piece: PieceType,
  color: PieceColor,
  square: Square | string,
  isEndgame = false,
  tables: PieceSquareTableSet = DEFAULT_PST_TABLES,
): number {
  const index = squareToIndex(square);
  const lookupIndex = color === 'w' ? index : mirrorSquareIndex(index);

  let table: PieceSquareTable;
  switch (piece) {
    case 'p':
      table = tables.pawns;
      break;
    case 'n':
      table = tables.knights;
      break;
    case 'b':
      table = tables.bishops;
      break;
    case 'r':
      table = tables.rooks;
      break;
    case 'q':
      table = tables.queens;
      break;
    case 'k':
      table = isEndgame ? tables.kingEndGame : tables.kingMiddleGame;
      break;
    default:
      return 0;
  }

  return table[lookupIndex] ?? 0;
}
