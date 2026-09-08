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
    tacticalGoal: 'Deliver checkmate on back rank',
    tacticalReward: 'checkmate',
    outcomeAdvantage: 'Checkmate 👑',
    learningSummary: 'Ra8 delivered back rank checkmate.',
    keyTakeaway: 'Look for trapped back-rank Kings.',
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
      tacticalGoal: 'Fork King and Rook on c7',
      tacticalReward: 'win_rook',
      outcomeAdvantage: '+5 Rook ♜',
      learningSummary: 'Nc7+ forks King and Rook cleanly.',
      keyTakeaway: 'Knights are awesome forkers.',
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

  describe('Move Replay Controller & Board Inspection State', () => {
    const replayPuzzle: Puzzle = {
      id: 'runner_replay_001',
      fen: 'r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
      moves: ['d5c7', 'e8d8', 'c7a8'],
      rating: 900,
      ratingDeviation: 100,
      themes: ['fork'],
      primaryTheme: 'fork',
      difficulty: 'easy',
      title: 'Knight Fork',
      tacticalGoal: 'Fork King and Rook on c7',
      tacticalReward: 'win_rook',
      outcomeAdvantage: '+5 Rook ♜',
      learningSummary: 'Nc7+ forks King and Rook cleanly.',
      keyTakeaway: 'Knights are awesome forkers.',
      playerColor: 'w',
      solutionPlies: 3,
    };

    it('precomputes replay steps upon puzzle load', () => {
      const runner = usePuzzleRunner({ puzzle: replayPuzzle, autoPlayAudio: false });

      expect(runner.replaySteps.value.length).toBe(4); // Start + 3 plies
      expect(runner.replayTotalSteps.value).toBe(3);

      expect(runner.replaySteps.value[0]!.san).toBe('Start');
      expect(runner.replaySteps.value[1]!.san).toBe('Nxc7+');
      expect(runner.replaySteps.value[2]!.san).toBe('Kd8');
      expect(runner.replaySteps.value[3]!.san).toBe('Nxa8');
    });

    it('steps forward, backward, to start, and to end with updated displayedFen', () => {
      const runner = usePuzzleRunner({ puzzle: replayPuzzle, autoPlayAudio: false });

      // Start position
      runner.stepReplayStart();
      expect(runner.isReplaying.value).toBe(true);
      expect(runner.replayStepIndex.value).toBe(0);
      expect(runner.displayedFen.value).toBe(replayPuzzle.fen);

      // Step forward to ply 1
      runner.stepReplayNext();
      expect(runner.replayStepIndex.value).toBe(1);
      expect(runner.currentReplaySan.value).toBe('Nxc7+');
      expect(runner.displayedLastMove.value).toEqual({ from: 'd5', to: 'c7' });

      // Step forward to ply 2
      runner.stepReplayNext();
      expect(runner.replayStepIndex.value).toBe(2);
      expect(runner.currentReplaySan.value).toBe('Kd8');
      expect(runner.displayedLastMove.value).toEqual({ from: 'e8', to: 'd8' });

      // Step backward to ply 1
      runner.stepReplayPrev();
      expect(runner.replayStepIndex.value).toBe(1);
      expect(runner.currentReplaySan.value).toBe('Nxc7+');

      // Jump to end
      runner.stepReplayEnd();
      expect(runner.replayStepIndex.value).toBe(3);
      expect(runner.currentReplaySan.value).toBe('Nxa8');
      expect(runner.displayedLastMove.value).toEqual({ from: 'c7', to: 'a8' });
    });

    it('toggles board inspection mode', () => {
      const runner = usePuzzleRunner({ puzzle: replayPuzzle, autoPlayAudio: false });

      expect(runner.isInspectingBoard.value).toBe(false);
      runner.toggleInspectBoard(true);
      expect(runner.isInspectingBoard.value).toBe(true);

      runner.toggleInspectBoard(false);
      expect(runner.isInspectingBoard.value).toBe(false);

      runner.toggleInspectBoard();
      expect(runner.isInspectingBoard.value).toBe(true);
    });

    it('exposes dynamic currentStepExplanation as player steps through replay', () => {
      const runner = usePuzzleRunner({ puzzle: replayPuzzle, autoPlayAudio: false });

      runner.stepReplayStart();
      expect(runner.currentStepExplanation.value?.explanation).toContain('Initial puzzle setup');

      runner.stepReplayNext();
      expect(runner.currentStepExplanation.value?.moveSan).toBe('Nxc7+');
      expect(runner.currentStepExplanation.value?.explanation).toBeTruthy();

      runner.stepReplayEnd();
      expect(runner.currentStepExplanation.value?.moveSan).toBe('Nxa8');
    });
  });

  describe('Refutation Feedback on Mistakes', () => {
    it('sets lastMistakeRefutation with threat square and refutation on wrong move', () => {
      const runner = usePuzzleRunner({ puzzle: samplePuzzle, autoPlayAudio: false });

      // Move a1 to b1 (wrong move)
      runner.selectSquare('a1');
      runner.selectSquare('b1');

      expect(runner.mistakesCount.value).toBe(1);
      expect(runner.lastMistakeRefutation.value).not.toBeNull();

      // Clears on new square selection
      runner.selectSquare('a1');
      expect(runner.lastMistakeRefutation.value).toBeNull();
    });
  });

  describe('Full Lifecycle with Composed Hints and Replay', () => {
    const lifecyclePuzzle: Puzzle = {
      id: 'runner_lifecycle_001',
      fen: 'r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
      moves: ['d5c7', 'e8d8', 'c7a8'],
      rating: 900,
      ratingDeviation: 80,
      themes: ['fork'],
      primaryTheme: 'fork',
      difficulty: 'easy',
      title: 'Lifecycle Integration Test',
      tacticalGoal: 'Fork King and Rook on c7',
      tacticalReward: 'win_rook',
      outcomeAdvantage: '+5 Rook ♜',
      learningSummary: 'Nc7+ forked cleanly.',
      keyTakeaway: 'Knights fork pieces effectively.',
      playerColor: 'w',
      solutionPlies: 3,
    };

    it('preserves full puzzle lifecycle: mistake handling, auto-nudge, bot reply, successful solve, and replay review', () => {
      vi.useFakeTimers();
      const onSolved = vi.fn();
      const onMistake = vi.fn();

      const runner = usePuzzleRunner({
        puzzle: lifecyclePuzzle,
        autoPlayAudio: false,
        onSolved,
        onMistake,
      });

      // 1. Initial State Verification
      expect(runner.isCompleted.value).toBe(false);
      expect(runner.isPlayerTurn.value).toBe(true);
      expect(runner.hintsCount.value).toBe(0);
      expect(runner.mistakesCount.value).toBe(0);
      expect(runner.isReplaying.value).toBe(false);

      // 2. Mistake 1: Illegal or incorrect move (d5 to b4)
      runner.selectSquare('d5');
      runner.selectSquare('b4');
      expect(runner.mistakesCount.value).toBe(1);
      expect(onMistake).toHaveBeenCalledWith(lifecyclePuzzle, 1);
      expect(runner.hintsCount.value).toBe(0); // Auto-nudge not yet triggered at 1 mistake

      // 3. Mistake 2: Second wrong move (d5 to e3)
      runner.selectSquare('d5');
      runner.selectSquare('e3');
      expect(runner.mistakesCount.value).toBe(2);
      expect(onMistake).toHaveBeenCalledWith(lifecyclePuzzle, 2);
      // Auto-nudge triggered on consecutive mistakes >= 2!
      expect(runner.progressiveHint.currentHintLevel.value).toBe(1);
      expect(runner.progressiveHint.isTier1Active.value).toBe(true);
      expect(runner.progressiveHint.nudgeSquare.value).toBe('d5');

      // 4. Correct Move Ply 0: Player plays d5 to c7 (Nc7+)
      runner.selectSquare('d5');
      runner.selectSquare('c7');
      expect(runner.isWaitingForBot.value).toBe(true);
      expect(runner.isPlayerTurn.value).toBe(false);

      // Advance bot response timer (450ms)
      vi.advanceTimersByTime(450);
      expect(runner.isWaitingForBot.value).toBe(false);
      expect(runner.isPlayerTurn.value).toBe(true);
      expect(runner.currentMoveIndex.value).toBe(2);
      expect(runner.lastMove.value).toEqual({ from: 'e8', to: 'd8' });
      // Progressive hint should reset for the next user ply
      expect(runner.progressiveHint.currentHintLevel.value).toBe(0);

      // 5. Correct Move Ply 2: Player plays c7 to a8 (Nxa8)
      runner.selectSquare('c7');
      runner.selectSquare('a8');

      // Puzzle is now solved!
      expect(runner.isCompleted.value).toBe(true);
      expect(runner.isSolvedSuccessfully.value).toBe(true);
      expect(runner.attemptResult.value).toBe('solved_with_retries');
      expect(onSolved).toHaveBeenCalledTimes(1);

      // 6. Post-Solve Interactive Replay Review
      expect(runner.replayTotalSteps.value).toBe(3);
      expect(runner.replaySteps.value.length).toBe(4);

      // Review starting setup position
      runner.stepReplayStart();
      expect(runner.isReplaying.value).toBe(true);
      expect(runner.replayStepIndex.value).toBe(0);
      expect(runner.displayedFen.value).toBe(lifecyclePuzzle.fen);

      // Step through move 1
      runner.stepReplayNext();
      expect(runner.replayStepIndex.value).toBe(1);
      expect(runner.currentReplaySan.value).toBe('Nxc7+');

      // Step through bot move
      runner.stepReplayNext();
      expect(runner.replayStepIndex.value).toBe(2);
      expect(runner.currentReplaySan.value).toBe('Kd8');

      // Step to decisive final move
      runner.stepReplayNext();
      expect(runner.replayStepIndex.value).toBe(3);
      expect(runner.currentReplaySan.value).toBe('Nxa8');

      // Toggle board inspection
      runner.toggleInspectBoard(true);
      expect(runner.isInspectingBoard.value).toBe(true);

      vi.useRealTimers();
    });
  });
});
