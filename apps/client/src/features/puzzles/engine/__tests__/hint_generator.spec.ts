import { describe, it, expect } from 'vitest';
import type { Puzzle } from '@fun-chess/shared';
import { generateProgressiveHint } from '../hint_generator';

describe('Progressive Hint Generator Engine', () => {
  const samplePuzzle: Puzzle = {
    id: 'hint_test_001',
    fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
    moves: ['a1a8'],
    rating: 700,
    ratingDeviation: 100,
    themes: ['back_rank_mate'],
    primaryTheme: 'back_rank_mate',
    difficulty: 'novice',
    title: 'Back Rank Mate in 1',
    playerColor: 'w',
    solutionPlies: 1,
  };

  it('returns level 0 none when requestedLevel is 0', () => {
    const hint = generateProgressiveHint(samplePuzzle, 0, samplePuzzle.fen, 0);
    expect(hint.level).toBe(0);
    expect(hint.tier).toBe('none');
    expect(hint.sourceSquare).toBeUndefined();
    expect(hint.targetSquare).toBeUndefined();
  });

  it('returns level 1 piece nudge with source square and friendly message', () => {
    const hint = generateProgressiveHint(samplePuzzle, 0, samplePuzzle.fen, 1);
    expect(hint.level).toBe(1);
    expect(hint.tier).toBe('piece_nudge');
    expect(hint.sourceSquare).toBe('a1');
    expect(hint.targetSquare).toBeUndefined();
    expect(hint.message).toContain('Rook');
    expect(hint.message).toContain('a1');
    expect(hint.mascotDialogue).toBeDefined();
  });

  it('returns level 2 target glow with source square and target square', () => {
    const hint = generateProgressiveHint(samplePuzzle, 0, samplePuzzle.fen, 2);
    expect(hint.level).toBe(2);
    expect(hint.tier).toBe('target_glow');
    expect(hint.sourceSquare).toBe('a1');
    expect(hint.targetSquare).toBe('a8');
    expect(hint.message).toContain('a1');
    expect(hint.message).toContain('a8');
  });

  it('returns level 3 full solution with SAN and UCI moves', () => {
    const hint = generateProgressiveHint(samplePuzzle, 0, samplePuzzle.fen, 3);
    expect(hint.level).toBe(3);
    expect(hint.tier).toBe('full_solution');
    expect(hint.sourceSquare).toBe('a1');
    expect(hint.targetSquare).toBe('a8');
    expect(hint.solutionUci).toBe('a1a8');
    expect(hint.solutionSan).toContain('Ra8');
    expect(hint.message).toContain('a1 to a8');
  });

  it('handles edge case when puzzle moves are completed', () => {
    const hint = generateProgressiveHint(samplePuzzle, 5, samplePuzzle.fen, 1);
    expect(hint.level).toBe(0);
    expect(hint.tier).toBe('none');
  });
});
