import { describe, it, expect } from 'vitest';
import { generatePuzzleHint } from '../engine/hint_generator';
import type { Puzzle } from '@fun-chess/shared';

describe('Progressive Hint Generator', () => {
  const samplePuzzle: Puzzle = {
    id: 'puz_test_01',
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 4',
    moves: ['f3f7'],
    rating: 700,
    ratingDeviation: 100,
    themes: ['mate_in_1'],
    primaryTheme: 'mate_in_1',
    difficulty: 'novice',
    title: 'Test Mate',
    subtitle: 'Test',
    playerColor: 'w',
    solutionPlies: 1,
  };

  it('generates Tier 1 piece nudge hint', () => {
    const hint = generatePuzzleHint(samplePuzzle, 0, samplePuzzle.fen, 1);
    expect(hint.level).toBe(1);
    expect(hint.sourceSquare).toBe('f3');
    expect(hint.targetSquare).toBeUndefined();
    expect(hint.message).toContain('Look at your');
  });

  it('generates Tier 2 target beacon hint', () => {
    const hint = generatePuzzleHint(samplePuzzle, 0, samplePuzzle.fen, 2);
    expect(hint.level).toBe(2);
    expect(hint.sourceSquare).toBe('f3');
    expect(hint.targetSquare).toBe('f7');
    expect(hint.message).toContain('f7');
  });

  it('generates Tier 3 direct solution move hint', () => {
    const hint = generatePuzzleHint(samplePuzzle, 0, samplePuzzle.fen, 3);
    expect(hint.level).toBe(3);
    expect(hint.sourceSquare).toBe('f3');
    expect(hint.targetSquare).toBe('f7');
    expect(hint.highlightArrow).toEqual({ from: 'f3', to: 'f7' });
    expect(hint.message).toContain('Play');
  });
});
