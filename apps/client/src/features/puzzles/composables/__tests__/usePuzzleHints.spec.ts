import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import type { Puzzle } from '@fun-chess/shared';
import { usePuzzleHints } from '../usePuzzleHints';

describe('usePuzzleHints Composable', () => {
  const samplePuzzle: Puzzle = {
    id: 'hint_test_001',
    fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
    moves: ['a1a8'],
    rating: 700,
    ratingDeviation: 80,
    themes: ['back_rank_mate'],
    primaryTheme: 'back_rank_mate',
    difficulty: 'novice',
    title: 'Back Rank Mate in 1',
    tacticalGoal: 'Deliver checkmate on the back rank',
    tacticalReward: 'checkmate',
    outcomeAdvantage: 'Checkmate 👑',
    learningSummary: 'Ra8 delivered checkmate.',
    keyTakeaway: 'Always watch for back rank mate.',
    playerColor: 'w',
    solutionPlies: 1,
  };

  it('initializes with level 0 and no hints active', () => {
    const hints = usePuzzleHints();

    expect(hints.currentHintLevel.value).toBe(0);
    expect(hints.activeHint.value).toBeNull();
    expect(hints.hintsUsedCount.value).toBe(0);
    expect(hints.hintsCount.value).toBe(0);
    expect(hints.isTier1Active.value).toBe(false);
    expect(hints.isTier2Active.value).toBe(false);
    expect(hints.isTier3Active.value).toBe(false);
    expect(hints.nudgeSquare.value).toBeNull();
    expect(hints.targetSquare.value).toBeNull();
    expect(hints.solutionArrow.value).toBeNull();
  });

  it('progressively requests hints from tier 1 to tier 3', () => {
    const hints = usePuzzleHints();

    // Tier 1: Piece Nudge
    const t1 = hints.revealHint(samplePuzzle, 0, samplePuzzle.fen);
    expect(t1).not.toBeNull();
    expect(t1?.level).toBe(1);
    expect(t1?.tier).toBe('piece_nudge');
    expect(hints.currentHintLevel.value).toBe(1);
    expect(hints.hintsUsedCount.value).toBe(1);
    expect(hints.isTier1Active.value).toBe(true);
    expect(hints.isTier2Active.value).toBe(false);
    expect(hints.isTier3Active.value).toBe(false);
    expect(hints.nudgeSquare.value).toBe('a1');
    expect(hints.targetSquare.value).toBeNull();
    expect(hints.solutionArrow.value).toBeNull();

    // Tier 2: Target Square Glow
    const t2 = hints.revealHint(samplePuzzle, 0, samplePuzzle.fen);
    expect(t2).not.toBeNull();
    expect(t2?.level).toBe(2);
    expect(t2?.tier).toBe('target_glow');
    expect(hints.currentHintLevel.value).toBe(2);
    expect(hints.hintsUsedCount.value).toBe(2);
    expect(hints.isTier1Active.value).toBe(true);
    expect(hints.isTier2Active.value).toBe(true);
    expect(hints.isTier3Active.value).toBe(false);
    expect(hints.nudgeSquare.value).toBe('a1');
    expect(hints.targetSquare.value).toBe('a8');
    expect(hints.solutionArrow.value).toBeNull();

    // Tier 3: Full Solution Vector
    const t3 = hints.revealHint(samplePuzzle, 0, samplePuzzle.fen);
    expect(t3).not.toBeNull();
    expect(t3?.level).toBe(3);
    expect(t3?.tier).toBe('full_solution');
    expect(hints.currentHintLevel.value).toBe(3);
    expect(hints.hintsUsedCount.value).toBe(3);
    expect(hints.isTier1Active.value).toBe(true);
    expect(hints.isTier2Active.value).toBe(true);
    expect(hints.isTier3Active.value).toBe(true);
    expect(hints.nudgeSquare.value).toBe('a1');
    expect(hints.targetSquare.value).toBe('a8');
    expect(hints.solutionArrow.value).toEqual({ from: 'a1', to: 'a8' });

    // Requesting past Tier 3 clamps to 3
    const t4 = hints.revealHint(samplePuzzle, 0, samplePuzzle.fen);
    expect(t4?.level).toBe(3);
    expect(hints.currentHintLevel.value).toBe(3);
    expect(hints.hintsUsedCount.value).toBe(3);
  });

  it('tracks hints used count monotonically even if level is set explicitly', () => {
    const hints = usePuzzleHints();

    hints.setHintLevel(2, samplePuzzle, 0, samplePuzzle.fen);
    expect(hints.currentHintLevel.value).toBe(2);
    expect(hints.hintsUsedCount.value).toBe(2);

    // Setting level back down to 1 should not reduce hintsUsedCount
    hints.setHintLevel(1, samplePuzzle, 0, samplePuzzle.fen);
    expect(hints.currentHintLevel.value).toBe(1);
    expect(hints.hintsUsedCount.value).toBe(2);
  });

  it('triggers auto-nudge on consecutive mistakes when hints are at level 0', () => {
    const puzzleRef = ref<Puzzle | null>(samplePuzzle);
    const moveIdxRef = ref<number>(0);
    const fenRef = ref<string>(samplePuzzle.fen);

    const hints = usePuzzleHints({
      puzzle: puzzleRef,
      currentMoveIndex: moveIdxRef,
      currentFen: fenRef,
    });

    // 1 mistake: does not trigger
    const nudge1 = hints.checkAutoNudge(1);
    expect(nudge1).toBeNull();
    expect(hints.currentHintLevel.value).toBe(0);

    // 2 mistakes: triggers Tier 1 auto-nudge
    const nudge2 = hints.checkAutoNudge(2);
    expect(nudge2).not.toBeNull();
    expect(nudge2?.level).toBe(1);
    expect(hints.currentHintLevel.value).toBe(1);
    expect(hints.nudgeSquare.value).toBe('a1');

    // 3 mistakes when hint level is already >= 1: does not advance or override
    const nudge3 = hints.checkAutoNudge(3);
    expect(nudge3).toBeNull();
    expect(hints.currentHintLevel.value).toBe(1);
  });

  it('directly reveals full solution via revealSolution', () => {
    const hints = usePuzzleHints();

    const sol = hints.revealSolution(samplePuzzle, 0, samplePuzzle.fen);
    expect(sol).not.toBeNull();
    expect(sol?.level).toBe(3);
    expect(hints.currentHintLevel.value).toBe(3);
    expect(hints.hintsUsedCount.value).toBe(3);
    expect(hints.isTier3Active.value).toBe(true);
    expect(hints.solutionArrow.value).toEqual({ from: 'a1', to: 'a8' });
  });

  it('resets all hint state cleanly via resetHints', () => {
    const hints = usePuzzleHints();

    hints.revealHint(samplePuzzle, 0, samplePuzzle.fen);
    hints.revealHint(samplePuzzle, 0, samplePuzzle.fen);
    expect(hints.currentHintLevel.value).toBe(2);
    expect(hints.hintsUsedCount.value).toBe(2);

    hints.resetHints();

    expect(hints.currentHintLevel.value).toBe(0);
    expect(hints.activeHint.value).toBeNull();
    expect(hints.hintsUsedCount.value).toBe(0);
    expect(hints.isTier1Active.value).toBe(false);
    expect(hints.isTier2Active.value).toBe(false);
    expect(hints.isTier3Active.value).toBe(false);
    expect(hints.nudgeSquare.value).toBeNull();
    expect(hints.targetSquare.value).toBeNull();
  });

  it('supports backward-compatible requestNextHint signature', () => {
    const hints = usePuzzleHints();
    const hint = hints.requestNextHint(samplePuzzle, 0, samplePuzzle.fen);

    expect(hint.level).toBe(1);
    expect(hints.currentHintLevel.value).toBe(1);
  });
});
