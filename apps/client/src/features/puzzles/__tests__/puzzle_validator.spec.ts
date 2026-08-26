import { describe, it, expect } from 'vitest';
import { validatePuzzleMove } from '../engine/puzzle_validator';
import type { Puzzle } from '@fun-chess/shared';

describe('Puzzle Move Validator', () => {
  const multiPlyPuzzle: Puzzle = {
    id: 'puz_fork_001',
    fen: 'r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
    moves: ['d5c7', 'e8d8', 'c7a8'],
    rating: 900,
    ratingDeviation: 115,
    themes: ['fork'],
    primaryTheme: 'fork',
    difficulty: 'easy',
    title: 'Knight Fork',
    subtitle: 'Fork',
    playerColor: 'w',
    solutionPlies: 3,
  };

  it('validates a correct first player ply with bot auto reply', () => {
    const outcome = validatePuzzleMove(
      multiPlyPuzzle,
      0,
      multiPlyPuzzle.fen,
      { from: 'd5', to: 'c7' }
    );

    expect(outcome.isCorrect).toBe(true);
    expect(outcome.isPuzzleComplete).toBe(false);
    expect(outcome.nextMoveIndex).toBe(2);
    expect(outcome.botReplyMove).toMatchObject({ from: 'e8', to: 'd8' });
  });

  it('detects an incorrect player ply with friendly feedback', () => {
    const outcome = validatePuzzleMove(
      multiPlyPuzzle,
      0,
      multiPlyPuzzle.fen,
      { from: 'e1', to: 'e2' }
    );

    expect(outcome.isCorrect).toBe(false);
    expect(outcome.isPuzzleComplete).toBe(false);
    expect(outcome.feedback).toContain('Not quite');
  });

  it('completes the puzzle on final winning ply', () => {
    // After d5c7 and e8d8, board is at interim position
    const intermediateOutcome = validatePuzzleMove(
      multiPlyPuzzle,
      0,
      multiPlyPuzzle.fen,
      { from: 'd5', to: 'c7' }
    );

    const finalOutcome = validatePuzzleMove(
      multiPlyPuzzle,
      2,
      intermediateOutcome.nextFen,
      { from: 'c7', to: 'a8' }
    );

    expect(finalOutcome.isCorrect).toBe(true);
    expect(finalOutcome.isPuzzleComplete).toBe(true);
    expect(finalOutcome.botReplyMove).toBeUndefined();
  });
});
