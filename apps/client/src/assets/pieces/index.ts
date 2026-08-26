/**
 * Chess piece SVG asset index and type mappings
 */
import type { PieceColor, PieceType } from '@fun-chess/shared';

import wP from './wP.svg';
import wN from './wN.svg';
import wB from './wB.svg';
import wR from './wR.svg';
import wQ from './wQ.svg';
import wK from './wK.svg';
import bP from './bP.svg';
import bN from './bN.svg';
import bB from './bB.svg';
import bR from './bR.svg';
import bQ from './bQ.svg';
import bK from './bK.svg';

export type PieceKey =
  | 'wP' | 'wN' | 'wB' | 'wR' | 'wQ' | 'wK'
  | 'bP' | 'bN' | 'bB' | 'bR' | 'bQ' | 'bK';

export const PIECE_ASSETS: Record<PieceKey, string> = {
  wP,
  wN,
  wB,
  wR,
  wQ,
  wK,
  bP,
  bN,
  bB,
  bR,
  bQ,
  bK,
};

/**
 * Returns the SVG asset URL for given color and piece type
 */
export function getPieceAsset(color: PieceColor, type: PieceType): string {
  const key = `${color}${type.toUpperCase()}` as PieceKey;
  return PIECE_ASSETS[key] || '';
}

/**
 * Returns the piece key from color and piece type
 */
export function getPieceKey(color: PieceColor, type: PieceType): PieceKey {
  return `${color}${type.toUpperCase()}` as PieceKey;
}
