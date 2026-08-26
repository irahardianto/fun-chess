import { describe, it, expect } from 'vitest';
import type { Puzzle } from '@fun-chess/shared';
import { useProgressiveHint } from '../useProgressiveHint';

describe('useProgressiveHint Composable', () => {
  const samplePuzzle: Puzzle = {
    id: 'prog_hint_001',
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

  it('steps through progressive hints 1 -> 2 -> 3', () => {
    const hintHook = useProgressiveHint();

    expect(hintHook.currentHintLevel.value).toBe(0);
    expect(hintHook.activeHint.value).toBeNull();

    // Step 1
    const h1 = hintHook.requestNextHint(samplePuzzle, 0, samplePuzzle.fen);
    expect(h1?.level).toBe(1);
    expect(h1?.tier).toBe('piece_nudge');
    expect(hintHook.hintsUsedCount.value).toBe(1);

    // Step 2
    const h2 = hintHook.requestNextHint(samplePuzzle, 0, samplePuzzle.fen);
    expect(h2?.level).toBe(2);
    expect(h2?.tier).toBe('target_glow');
    expect(hintHook.hintsUsedCount.value).toBe(2);

    // Step 3
    const h3 = hintHook.requestNextHint(samplePuzzle, 0, samplePuzzle.fen);
    expect(h3?.level).toBe(3);
    expect(h3?.tier).toBe('full_solution');
    expect(hintHook.hintsUsedCount.value).toBe(3);
  });

  it('reveals full solution directly', () => {
    const hintHook = useProgressiveHint();
    const h3 = hintHook.revealSolution(samplePuzzle, 0, samplePuzzle.fen);

    expect(h3?.level).toBe(3);
    expect(hintHook.hintsUsedCount.value).toBe(3);
  });

  it('resets hints state cleanly', () => {
    const hintHook = useProgressiveHint();
    hintHook.requestNextHint(samplePuzzle, 0, samplePuzzle.fen);
    expect(hintHook.hintsUsedCount.value).toBe(1);

    hintHook.resetHints();
    expect(hintHook.currentHintLevel.value).toBe(0);
    expect(hintHook.activeHint.value).toBeNull();
    expect(hintHook.hintsUsedCount.value).toBe(0);
  });
});
