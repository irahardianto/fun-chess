import { describe, it, expect } from 'vitest';
import type { Square, PieceType } from '@fun-chess/shared';
import {
  squareToIndex,
  indexToSquare,
  mirrorSquareIndex,
  getPieceSquareValue,
  PIECE_VALUES,
  PAWNS_PST,
  KNIGHTS_PST,
  BISHOPS_PST,
  ROOKS_PST,
  QUEENS_PST,
  KING_MIDDLEGAME_PST,
  KING_ENDGAME_PST,
} from '../piece_square_tables.js';

describe('Piece-Square Tables & Indexing', () => {
  it('correctly maps square strings to 0-63 indices and back', () => {
    expect(squareToIndex('a8')).toBe(0);
    expect(squareToIndex('h8')).toBe(7);
    expect(squareToIndex('a1')).toBe(56);
    expect(squareToIndex('h1')).toBe(63);
    expect(squareToIndex('e4')).toBe(36);
    expect(squareToIndex('d5')).toBe(27);

    expect(indexToSquare(0)).toBe('a8');
    expect(indexToSquare(7)).toBe('h8');
    expect(indexToSquare(56)).toBe('a1');
    expect(indexToSquare(63)).toBe('h1');
    expect(indexToSquare(36)).toBe('e4');
    expect(indexToSquare(27)).toBe('d5');
  });

  it('correctly performs round-trip conversion for all 64 squares', () => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];

    for (const f of files) {
      for (const r of ranks) {
        const sq = `${f}${r}` as Square;
        const idx = squareToIndex(sq);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(63);
        expect(indexToSquare(idx)).toBe(sq);
      }
    }
  });

  it('correctly handles edge cases and malformed square strings', () => {
    expect(squareToIndex('')).toBe(0);
    expect(indexToSquare(-5)).toBe('a8');
    expect(indexToSquare(100)).toBe('h1');
  });

  it('correctly mirrors square indices vertically for Black', () => {
    expect(mirrorSquareIndex(0)).toBe(56); // a8 -> a1
    expect(mirrorSquareIndex(56)).toBe(0); // a1 -> a8
    expect(mirrorSquareIndex(36)).toBe(28); // e4 -> e5
    expect(mirrorSquareIndex(28)).toBe(36); // e5 -> e4
  });

  it('provides standard material piece values', () => {
    expect(PIECE_VALUES.p).toBe(100);
    expect(PIECE_VALUES.n).toBe(320);
    expect(PIECE_VALUES.b).toBe(330);
    expect(PIECE_VALUES.r).toBe(500);
    expect(PIECE_VALUES.q).toBe(900);
    expect(PIECE_VALUES.k).toBe(20000);
  });

  it('all PST tables have exactly 64 elements', () => {
    expect(PAWNS_PST).toHaveLength(64);
    expect(KNIGHTS_PST).toHaveLength(64);
    expect(BISHOPS_PST).toHaveLength(64);
    expect(ROOKS_PST).toHaveLength(64);
    expect(QUEENS_PST).toHaveLength(64);
    expect(KING_MIDDLEGAME_PST).toHaveLength(64);
    expect(KING_ENDGAME_PST).toHaveLength(64);
  });

  it('retrieves correct PST value for White and Black pieces', () => {
    // Pawn on e4 (index 36) for White
    const whitePawnVal = getPieceSquareValue('p', 'w', 'e4');
    expect(whitePawnVal).toBe(PAWNS_PST[36]);

    // Pawn on e5 for Black (index 28 mirrors to index 36)
    const blackPawnVal = getPieceSquareValue('p', 'b', 'e5');
    expect(blackPawnVal).toBe(PAWNS_PST[36]);
    expect(whitePawnVal).toBe(blackPawnVal);

    // Knight in center vs corner
    const centerKnight = getPieceSquareValue('n', 'w', 'e4');
    const cornerKnight = getPieceSquareValue('n', 'w', 'a1');
    expect(centerKnight).toBeGreaterThan(cornerKnight);

    // King in middlegame vs endgame
    const kingCenterMid = getPieceSquareValue('k', 'w', 'e4', false);
    const kingCenterEnd = getPieceSquareValue('k', 'w', 'e4', true);
    expect(kingCenterEnd).toBeGreaterThan(kingCenterMid);

    // Unknown piece type fallback
    expect(getPieceSquareValue('unknown' as unknown as PieceType, 'w', 'e4')).toBe(0);
  });
});
