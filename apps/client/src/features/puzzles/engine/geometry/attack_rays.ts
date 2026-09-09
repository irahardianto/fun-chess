import type { Square, PieceColor, PieceType } from '@fun-chess/shared';

/**
 * Converts row/column board array indices (0..7) to an algebraic Square ('a1'..'h8').
 * Note: row 0 corresponds to rank 8, and col 0 corresponds to file 'a'.
 */
export function coordsToSquare(r: number, c: number): Square {
  const fChar = String.fromCharCode(97 + c);
  const rNum = 8 - r;
  return `${fChar}${rNum}` as Square;
}

/**
 * Calculates squares attacked by a pawn.
 */
export function getPawnAttacks(rIdx: number, cIdx: number, color: PieceColor): Square[] {
  const attacked: Square[] = [];
  const dir = color === 'w' ? -1 : 1;
  const targetR = rIdx + dir;
  if (targetR >= 0 && targetR <= 7) {
    if (cIdx - 1 >= 0) attacked.push(coordsToSquare(targetR, cIdx - 1));
    if (cIdx + 1 <= 7) attacked.push(coordsToSquare(targetR, cIdx + 1));
  }
  return attacked;
}

/**
 * Calculates squares attacked by a knight.
 */
export function getKnightAttacks(rIdx: number, cIdx: number): Square[] {
  const attacked: Square[] = [];
  const knightHops = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ] as const;

  for (const [dr, dc] of knightHops) {
    const nr = rIdx + dr;
    const nc = cIdx + dc;
    if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
      attacked.push(coordsToSquare(nr, nc));
    }
  }
  return attacked;
}

/**
 * Calculates squares attacked by a king.
 */
export function getKingAttacks(rIdx: number, cIdx: number): Square[] {
  const attacked: Square[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = rIdx + dr;
      const nc = cIdx + dc;
      if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
        attacked.push(coordsToSquare(nr, nc));
      }
    }
  }
  return attacked;
}

/**
 * Calculates squares attacked by sliding pieces (bishop, rook, queen) using raycasting.
 */
export function getSlidingAttacks(
  board: ({ type: string; color: string } | null)[][],
  rIdx: number,
  cIdx: number,
  pieceType: PieceType,
): Square[] {
  const attacked: Square[] = [];
  const rays: [number, number][] = [];

  if (pieceType === 'b' || pieceType === 'q') {
    rays.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  }
  if (pieceType === 'r' || pieceType === 'q') {
    rays.push([-1, 0], [1, 0], [0, -1], [0, 1]);
  }

  for (const [dr, dc] of rays) {
    let nr = rIdx + dr;
    let nc = cIdx + dc;
    while (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
      attacked.push(coordsToSquare(nr, nc));
      if (board[nr]?.[nc] !== null) {
        break; // Ray blocked by piece
      }
      nr += dr;
      nc += dc;
    }
  }

  return attacked;
}

/**
 * Returns list of squares attacked by a piece of given type and color on a given square.
 */
export function getSquaresAttackedByPiece(
  board: ({ type: string; color: string } | null)[][],
  square: Square,
  pieceType: PieceType,
  color: PieceColor,
): Square[] {
  const file = square.charCodeAt(0) - 97; // 0..7 for a..h
  const rank = parseInt(square.charAt(1), 10) - 1; // 0..7 for 1..8
  const rIdx = 7 - rank; // 0..7 in board array (0 is rank 8)
  const cIdx = file;

  if (pieceType === 'p') {
    return getPawnAttacks(rIdx, cIdx, color);
  }

  if (pieceType === 'n') {
    return getKnightAttacks(rIdx, cIdx);
  }

  if (pieceType === 'k') {
    return getKingAttacks(rIdx, cIdx);
  }

  return getSlidingAttacks(board, rIdx, cIdx, pieceType);
}

/**
 * Finds the square of the king of the given color on the board.
 */
export function findKingSquare(
  board: ({ type: string; color: string } | null)[][],
  color: PieceColor,
): Square | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r]?.[c];
      if (p && p.type === 'k' && p.color === color) {
        return coordsToSquare(r, c);
      }
    }
  }
  return null;
}
