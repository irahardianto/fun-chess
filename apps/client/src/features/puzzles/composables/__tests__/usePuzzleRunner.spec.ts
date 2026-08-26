import { describe, it, expect, vi } from 'vitest';
import type { Puzzle } from '@fun-chess/shared';
import { usePuzzleRunner } from '../usePuzzleRunner';

describe('usePuzzleRunner Composable', () => {
  const samplePuzzle: Puzzle = {
    id: 'runner_test_001',
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

  it('initializes with puzzle state and enables player turn', () => {
    const runner = usePuzzleRunner({ puzzle: samplePuzzle, autoPlayAudio: false });

    expect(runner.puzzle.value?.id).toBe(samplePuzzle.id);
    expect(runner.currentFen.value).toBe(samplePuzzle.fen);
    expect(runner.isPlayerTurn.value).toBe(true);
    expect(runner.isCompleted.value).toBe(false);
    expect(runner.playerColor.value).toBe('w');
  });

  it('selects pieces and computes legal moves', () => {
    const runner = usePuzzleRunner({ puzzle: samplePuzzle, autoPlayAudio: false });

    runner.selectSquare('a1');
    expect(runner.selectedSquare.value).toBe('a1');
    expect(runner.legalMoves.value).toContain('a8');
  });

  it('applies correct move and triggers completion celebration callback', () => {
    const onSolved = vi.fn();
    const runner = usePuzzleRunner({
      puzzle: samplePuzzle,
      autoPlayAudio: false,
      onSolved,
    });

    runner.selectSquare('a1');
    runner.selectSquare('a8');

    expect(runner.isCompleted.value).toBe(true);
    expect(runner.isSolvedSuccessfully.value).toBe(true);
    expect(runner.attemptResult.value).toBe('solved_first_try');
    expect(onSolved).toHaveBeenCalledWith(samplePuzzle, 3, 0, 0);
  });

  it('handles wrong move with shake animation and mistakes counter', () => {
    const runner = usePuzzleRunner({ puzzle: samplePuzzle, autoPlayAudio: false });

    runner.selectSquare('a1');
    runner.selectSquare('b1');

    expect(runner.isCompleted.value).toBe(false);
    expect(runner.mistakesCount.value).toBe(1);
    expect(runner.isShaking.value).toBe(true);
    expect(runner.feedbackMessage.value).toContain('Not quite');
  });

  it('reveals 3-tier progressive hints step-by-step', () => {
    const runner = usePuzzleRunner({ puzzle: samplePuzzle, autoPlayAudio: false });

    // Tier 1
    const h1 = runner.revealNextHint();
    expect(h1?.level).toBe(1);
    expect(h1?.tier).toBe('piece_nudge');
    expect(runner.hintsCount.value).toBe(1);

    // Tier 2
    const h2 = runner.revealNextHint();
    expect(h2?.level).toBe(2);
    expect(h2?.tier).toBe('target_glow');
    expect(runner.hintsCount.value).toBe(2);

    // Tier 3
    const h3 = runner.revealNextHint();
    expect(h3?.level).toBe(3);
    expect(h3?.tier).toBe('full_solution');
    expect(runner.hintsCount.value).toBe(3);
  });

  it('resets current puzzle cleanly', () => {
    const runner = usePuzzleRunner({ puzzle: samplePuzzle, autoPlayAudio: false });

    runner.selectSquare('a1');
    runner.selectSquare('b1');
    expect(runner.mistakesCount.value).toBe(1);

    runner.resetCurrentPuzzle();
    expect(runner.mistakesCount.value).toBe(0);
    expect(runner.selectedSquare.value).toBeNull();
  });

  describe('Timer Tracking & Lifecycle Cleanup', () => {
    const multiPlyPuzzle: Puzzle = {
      id: 'runner_multi_001',
      fen: 'r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
      moves: ['d5c7', 'e8d8', 'c7a8'],
      rating: 900,
      ratingDeviation: 100,
      themes: ['fork'],
      primaryTheme: 'fork',
      difficulty: 'easy',
      title: 'Knight Fork',
      playerColor: 'w',
      solutionPlies: 3,
    };

    it('tracks bot response timer and executes bot reply after delay', () => {
      vi.useFakeTimers();
      const runner = usePuzzleRunner({ puzzle: multiPlyPuzzle, autoPlayAudio: false });

      runner.selectSquare('d5');
      runner.selectSquare('c7');

      expect(runner.isWaitingForBot.value).toBe(true);
      expect(runner.currentMoveIndex.value).toBe(0);

      vi.advanceTimersByTime(450);

      expect(runner.isWaitingForBot.value).toBe(false);
      expect(runner.currentMoveIndex.value).toBe(2);
      expect(runner.lastMove.value).toEqual({ from: 'e8', to: 'd8' });
      vi.useRealTimers();
    });

    it('cancels pending bot reply timer when reset or clearTimers is called', () => {
      vi.useFakeTimers();
      const runner = usePuzzleRunner({ puzzle: multiPlyPuzzle, autoPlayAudio: false });

      runner.selectSquare('d5');
      runner.selectSquare('c7');
      expect(runner.isWaitingForBot.value).toBe(true);

      // Reset before timer fires
      runner.reset();
      expect(runner.isWaitingForBot.value).toBe(false);
      expect(runner.currentMoveIndex.value).toBe(0);
      expect(runner.currentFen.value).toBe(multiPlyPuzzle.fen);

      // Advance timers and ensure bot callback did not fire
      vi.advanceTimersByTime(500);
      expect(runner.currentMoveIndex.value).toBe(0);
      expect(runner.isWaitingForBot.value).toBe(false);
      vi.useRealTimers();
    });

    it('clears shake timer on reset', () => {
      vi.useFakeTimers();
      const runner = usePuzzleRunner({ puzzle: samplePuzzle, autoPlayAudio: false });

      runner.selectSquare('a1');
      runner.selectSquare('b1');
      expect(runner.isShaking.value).toBe(true);

      runner.reset();
      expect(runner.isShaking.value).toBe(false);

      vi.advanceTimersByTime(400);
      expect(runner.isShaking.value).toBe(false);
      vi.useRealTimers();
    });
  });
});
