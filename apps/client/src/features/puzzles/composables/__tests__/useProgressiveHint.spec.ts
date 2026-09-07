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
    tacticalGoal: 'Deliver checkmate on back rank',
    tacticalReward: 'checkmate',
    outcomeAdvantage: 'Checkmate 👑',
    learningSummary: 'Ra8 delivered back rank checkmate.',
    keyTakeaway: 'Look for trapped back-rank Kings.',
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

  it('computes visual hint reactive signals (nudgeSquare, targetSquare, solutionArrow, tiers) across all levels', () => {
    const hintHook = useProgressiveHint();

    // Initial state: Level 0
    expect(hintHook.isTier1Active.value).toBe(false);
    expect(hintHook.isTier2Active.value).toBe(false);
    expect(hintHook.isTier3Active.value).toBe(false);
    expect(hintHook.nudgeSquare.value).toBeNull();
    expect(hintHook.targetSquare.value).toBeNull();
    expect(hintHook.solutionArrow.value).toBeNull();

    // Level 1: Nudge source square
    hintHook.requestNextHint(samplePuzzle, 0, samplePuzzle.fen);
    expect(hintHook.isTier1Active.value).toBe(true);
    expect(hintHook.isTier2Active.value).toBe(false);
    expect(hintHook.isTier3Active.value).toBe(false);
    expect(hintHook.nudgeSquare.value).toBe('a1');
    expect(hintHook.targetSquare.value).toBeNull();
    expect(hintHook.solutionArrow.value).toBeNull();

    // Level 2: Glow target square
    hintHook.requestNextHint(samplePuzzle, 0, samplePuzzle.fen);
    expect(hintHook.isTier1Active.value).toBe(true);
    expect(hintHook.isTier2Active.value).toBe(true);
    expect(hintHook.isTier3Active.value).toBe(false);
    expect(hintHook.nudgeSquare.value).toBe('a1');
    expect(hintHook.targetSquare.value).toBe('a8');
    expect(hintHook.solutionArrow.value).toBeNull();

    // Level 3: Full solution arrow
    hintHook.requestNextHint(samplePuzzle, 0, samplePuzzle.fen);
    expect(hintHook.isTier1Active.value).toBe(true);
    expect(hintHook.isTier2Active.value).toBe(true);
    expect(hintHook.isTier3Active.value).toBe(true);
    expect(hintHook.nudgeSquare.value).toBe('a1');
    expect(hintHook.targetSquare.value).toBe('a8');
    expect(hintHook.solutionArrow.value).toEqual({ from: 'a1', to: 'a8' });

    // Resetting hints clears all computed visual signals
    hintHook.resetHints();
    expect(hintHook.isTier1Active.value).toBe(false);
    expect(hintHook.isTier2Active.value).toBe(false);
    expect(hintHook.isTier3Active.value).toBe(false);
    expect(hintHook.nudgeSquare.value).toBeNull();
    expect(hintHook.targetSquare.value).toBeNull();
    expect(hintHook.solutionArrow.value).toBeNull();
  });

  it('triggers auto-nudge coaching when consecutive mistakes >= 2 at level 0', () => {
    const hintHook = useProgressiveHint();

    // Not triggered on 1 mistake
    const result1 = hintHook.checkAutoNudge(1, samplePuzzle, 0, samplePuzzle.fen);
    expect(result1).toBeNull();
    expect(hintHook.currentHintLevel.value).toBe(0);

    // Triggered on 2 mistakes
    const result2 = hintHook.checkAutoNudge(2, samplePuzzle, 0, samplePuzzle.fen);
    expect(result2).not.toBeNull();
    expect(hintHook.currentHintLevel.value).toBe(1);
    expect(hintHook.nudgeSquare.value).toBe('a1');
  });

  it('handles explicit setHintLevel(0) and setHintLevel(2) correctly', () => {
    const hintHook = useProgressiveHint();

    hintHook.setHintLevel(2, samplePuzzle, 0, samplePuzzle.fen);
    expect(hintHook.currentHintLevel.value).toBe(2);
    expect(hintHook.targetSquare.value).toBe('a8');

    hintHook.setHintLevel(0, samplePuzzle, 0, samplePuzzle.fen);
    expect(hintHook.currentHintLevel.value).toBe(0);
    expect(hintHook.activeHint.value).toBeNull();
    expect(hintHook.targetSquare.value).toBeNull();
  });
});
