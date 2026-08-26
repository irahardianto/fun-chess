import { describe, it, expect, vi } from 'vitest';
import { usePuzzleRunner } from '../composables/usePuzzleRunner';
import type { Puzzle } from '@fun-chess/shared';

describe('usePuzzleRunner Composable', () => {
  const samplePuzzle: Puzzle = {
    id: 'puz_mate1_001',
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 4',
    moves: ['f3f7'],
    rating: 700,
    ratingDeviation: 100,
    themes: ['mate_in_1'],
    primaryTheme: 'mate_in_1',
    difficulty: 'novice',
    title: 'Mate in 1',
    subtitle: 'Deliver Mate',
    playerColor: 'w',
    solutionPlies: 1,
  };

  it('loads puzzle state correctly', () => {
    const runner = usePuzzleRunner({ initialPuzzle: samplePuzzle });
    expect(runner.currentPuzzle.value?.id).toBe('puz_mate1_001');
    expect(runner.playerColor.value).toBe('w');
    expect(runner.isCompleted.value).toBe(false);
  });

  it('selects square and computes legal moves', () => {
    const runner = usePuzzleRunner({ initialPuzzle: samplePuzzle });
    runner.selectSquare('f3');
    expect(runner.selectedSquare.value).toBe('f3');
    expect(runner.legalMoves.value.length).toBeGreaterThan(0);
  });

  it('handles successful solve move and invokes callback', () => {
    const onSolve = vi.fn();
    const runner = usePuzzleRunner({ initialPuzzle: samplePuzzle, onSolve });

    runner.applyPlayerMove({ from: 'f3', to: 'f7' });
    expect(runner.isCompleted.value).toBe(true);
    expect(runner.isSolvedSuccessfully.value).toBe(true);
    expect(runner.calculatedStars.value).toBe(3);
    expect(onSolve).toHaveBeenCalledWith(samplePuzzle, 3, 0, 0);
  });

  it('handles mistake move and tracks mistake count', () => {
    const onMistake = vi.fn();
    const runner = usePuzzleRunner({ initialPuzzle: samplePuzzle, onMistake });

    runner.applyPlayerMove({ from: 'f3', to: 'f4' });
    expect(runner.isCompleted.value).toBe(false);
    expect(runner.mistakesCount.value).toBe(1);
    expect(runner.isShaking.value).toBe(true);
    expect(onMistake).toHaveBeenCalledWith(samplePuzzle, 1);
  });

  it('reveals progressive hints', () => {
    const runner = usePuzzleRunner({ initialPuzzle: samplePuzzle });
    expect(runner.progressiveHint.currentHintLevel.value).toBe(0);

    runner.revealNextHint();
    expect(runner.progressiveHint.currentHintLevel.value).toBe(1);
    expect(runner.progressiveHint.nudgeSquare.value).toBe('f3');

    runner.revealNextHint();
    expect(runner.progressiveHint.currentHintLevel.value).toBe(2);
    expect(runner.progressiveHint.targetSquare.value).toBe('f7');

    runner.revealNextHint();
    expect(runner.progressiveHint.currentHintLevel.value).toBe(3);
    expect(runner.progressiveHint.solutionArrow.value).toEqual({ from: 'f3', to: 'f7' });
  });
});
