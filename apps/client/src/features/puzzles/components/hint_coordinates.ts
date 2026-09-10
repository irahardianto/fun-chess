import type { Square, PieceColor } from '@fun-chess/shared';

export interface SquareCoordinates {
  x: number;
  y: number;
  centerX: number;
  centerY: number;
}

export function squareToCoordinates(
  sq: Square | string,
  orientation: PieceColor = 'w',
): SquareCoordinates {
  const file = sq.charAt(0).toLowerCase();
  const rank = sq.charAt(1);
  const fileNum = file.charCodeAt(0) - 97; // 'a' -> 0, ..., 'h' -> 7
  const rankNum = parseInt(rank, 10); // '1' -> 1, ..., '8' -> 8

  const col = orientation === 'w' ? fileNum : 7 - fileNum;
  const row = orientation === 'w' ? 8 - rankNum : rankNum - 1;

  const x = col * 12.5;
  const y = row * 12.5;
  const centerX = x + 6.25;
  const centerY = y + 6.25;

  return { x, y, centerX, centerY };
}
