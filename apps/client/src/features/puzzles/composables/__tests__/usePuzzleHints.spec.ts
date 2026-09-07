import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import type { Puzzle } from '@fun-chess/shared';
import { usePuzzleHints } from '../usePuzzleHints';

describe('usePuzzleHints Composable', () => {
  const samplePuzzle: Puzzle = {
    id: 'prog_hint_002',
    fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
    moves: ['a1a8'],
    rating: 700,
    ratingDeviation: 100,
    themes: ['back_rank_mate'],
    primaryTheme: 'back_rank_mate',
    difficulty: 'novice',
    title: 'Back Rank Mate in 1',
    tacticalGoal: 'Deliver checkmate on back rank',
    tacticalReward: 'checkmate',
    outcomeAdvantage: 'Checkmate 👑',
    learningSummary: 'Ra8 delivered back rank checkmate.',
    keyTakeaway: 'Look for trapped back-rank Kings.',
    playerColor: 'w',
    solutionPlies: 1,
  };

  it('initializes with level 0 and empty visual hints', () => {
    const hints = usePuzzleHints();
    expect(hints.currentHintLevel.value).toBe(0);
    expect(hints.activeHint.value).toBeNull();
    expect(hints.hintsUsedCount.value).toBe(0);
    expect(hints.isTier1Active.value).toBe(false);
    expect(hints.isTier2Active.value).toBe(false);
    expect(hints.isTier3Active.value).toBe(false);
    expect(hints.nudgeSquare.value).toBeNull();
    expect(hints.targetSquare.value).toBeNull();
    expect(hints.solutionArrow.value).toBeNull();
  });

  it('computes visual hint reactive signals progressively', () => {
    const puzzleRef = ref<Puzzle | null>(samplePuzzle);
    const hints = usePuzzleHints({ puzzle: puzzleRef });

    // Step 1: Nudge
    const h1 = hints.revealHint();
    expect(h1).not.toBeNull();
    expect(hints.currentHintLevel.value).toBe(1);
    expect(hints.isTier1Active.value).toBe(true);
    expect(hints.nudgeSquare.value).toBe('a1');
    expect(hints.targetSquare.value).toBeNull();
    expect(hints.solutionArrow.value).toBeNull();

    // Step 2: Target glow
    const h2 = hints.revealHint();
    expect(h2).not.toBeNull();
    expect(hints.currentHintLevel.value).toBe(2);
    expect(hints.isTier2Active.value).toBe(true);
    expect(hints.nudgeSquare.value).toBe('a1');
    expect(hints.targetSquare.value).toBe('a8');
    expect(hints.solutionArrow.value).toBeNull();

    // Step 3: Full solution arrow
    const h3 = hints.revealHint();
    expect(h3).not.toBeNull();
    expect(hints.currentHintLevel.value).toBe(3);
    expect(hints.isTier3Active.value).toBe(true);
    expect(hints.nudgeSquare.value).toBe('a1');
    expect(hints.targetSquare.value).toBe('a8');
    expect(hints.solutionArrow.value).toEqual({ from: 'a1', to: 'a8' });
  });

  it('reveals full solution directly and resets cleanly', () => {
    const hints = usePuzzleHints();
    const h3 = hints.revealSolution(samplePuzzle, 0, samplePuzzle.fen);
    expect(h3).not.toBeNull();
    expect(hints.currentHintLevel.value).toBe(3);
    expect(hints.solutionArrow.value).toEqual({ from: 'a1', to: 'a8' });

    hints.resetHints();
    expect(hints.currentHintLevel.value).toBe(0);
    expect(hints.solutionArrow.value).toBeNull();
    expect(hints.hintsUsedCount.value).toBe(0);
  });
});
