import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import type { Puzzle } from '@fun-chess/shared';
import { usePuzzleReplay } from '../usePuzzleReplay';

describe('usePuzzleReplay Composable', () => {
  const multiPlyPuzzle: Puzzle = {
    id: 'replay_test_001',
    fen: 'r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
    moves: ['d5c7', 'e8d8', 'c7a8'],
    rating: 900,
    ratingDeviation: 80,
    themes: ['fork'],
    primaryTheme: 'fork',
    difficulty: 'easy',
    title: 'Knight Fork Replay',
    tacticalGoal: 'Fork King and Rook on c7',
    tacticalReward: 'win_rook',
    outcomeAdvantage: '+5 Rook ♜',
    learningSummary: 'Nc7+ forked cleanly.',
    keyTakeaway: 'Knights fork pieces effectively.',
    playerColor: 'w',
    solutionPlies: 3,
  };

  it('precomputes all replay steps upon initialization', () => {
    const puzzleRef = ref<Puzzle | null>(multiPlyPuzzle);
    const replay = usePuzzleReplay({ puzzle: puzzleRef, autoAudio: false });

    // Step 0 (Start) + 3 plies = 4 steps total
    expect(replay.replaySteps.value.length).toBe(4);
    expect(replay.replayTotalSteps.value).toBe(3);

    // Initial setup step
    const step0 = replay.replaySteps.value[0];
    expect(step0.stepIndex).toBe(0);
    expect(step0.plyIndex).toBe(-1);
    expect(step0.fen).toBe(multiPlyPuzzle.fen);
    expect(step0.san).toBe('Start');

    // Ply 0 (White plays Nc7+)
    const step1 = replay.replaySteps.value[1];
    expect(step1.stepIndex).toBe(1);
    expect(step1.plyIndex).toBe(0);
    expect(step1.uci).toBe('d5c7');
    expect(step1.san).toBe('Nxc7+');
    expect(step1.actor).toBe('w');

    // Ply 1 (Black plays Kd8)
    const step2 = replay.replaySteps.value[2];
    expect(step2.stepIndex).toBe(2);
    expect(step2.plyIndex).toBe(1);
    expect(step2.uci).toBe('e8d8');
    expect(step2.san).toBe('Kd8');
    expect(step2.actor).toBe('b');

    // Ply 2 (White plays Nxa8)
    const step3 = replay.replaySteps.value[3];
    expect(step3.stepIndex).toBe(3);
    expect(step3.plyIndex).toBe(2);
    expect(step3.uci).toBe('c7a8');
    expect(step3.san).toBe('Nxa8');
    expect(step3.actor).toBe('w');
  });

  it('steps forward and backward with stepReplayNext and stepReplayPrev', () => {
    const puzzleRef = ref<Puzzle | null>(multiPlyPuzzle);
    const replay = usePuzzleReplay({ puzzle: puzzleRef, autoAudio: false });

    expect(replay.isReplaying.value).toBe(false);
    expect(replay.replayStepIndex.value).toBe(0);

    // Step forward to ply 1
    replay.stepReplayNext();
    expect(replay.isReplaying.value).toBe(true);
    expect(replay.replayStepIndex.value).toBe(1);
    expect(replay.currentReplaySan.value).toBe('Nxc7+');
    expect(replay.currentReplayStep.value?.uci).toBe('d5c7');

    // Step forward to ply 2
    replay.stepReplayNext();
    expect(replay.replayStepIndex.value).toBe(2);
    expect(replay.currentReplaySan.value).toBe('Kd8');

    // Step backward to ply 1
    replay.stepReplayPrev();
    expect(replay.replayStepIndex.value).toBe(1);
    expect(replay.currentReplaySan.value).toBe('Nxc7+');

    // Step backward to setup position (step 0)
    replay.stepReplayPrev();
    expect(replay.replayStepIndex.value).toBe(0);
    expect(replay.currentReplaySan.value).toBe('Start');

    // Stepping backward at step 0 clamps to 0
    replay.stepReplayPrev();
    expect(replay.replayStepIndex.value).toBe(0);
  });

  it('jumps directly to start and end positions', () => {
    const puzzleRef = ref<Puzzle | null>(multiPlyPuzzle);
    const replay = usePuzzleReplay({ puzzle: puzzleRef, autoAudio: false });

    // Jump to end
    replay.stepReplayEnd();
    expect(replay.isReplaying.value).toBe(true);
    expect(replay.replayStepIndex.value).toBe(3);
    expect(replay.currentReplaySan.value).toBe('Nxa8');

    // Stepping next at end clamps to total steps
    replay.stepReplayNext();
    expect(replay.replayStepIndex.value).toBe(3);

    // Jump to start
    replay.stepReplayStart();
    expect(replay.replayStepIndex.value).toBe(0);
    expect(replay.currentReplaySan.value).toBe('Start');
  });

  it('navigates to arbitrary step via goToReplayStep / setReplayStep', () => {
    const puzzleRef = ref<Puzzle | null>(multiPlyPuzzle);
    const replay = usePuzzleReplay({ puzzle: puzzleRef, autoAudio: false });

    replay.setReplayStep(2);
    expect(replay.replayStepIndex.value).toBe(2);
    expect(replay.currentReplaySan.value).toBe('Kd8');

    // Clamps negative numbers to 0
    replay.setReplayStep(-5);
    expect(replay.replayStepIndex.value).toBe(0);

    // Clamps out-of-bounds numbers to max
    replay.setReplayStep(99);
    expect(replay.replayStepIndex.value).toBe(3);
  });

  it('toggles board inspection mode between inspection and normal play', () => {
    const puzzleRef = ref<Puzzle | null>(multiPlyPuzzle);
    const replay = usePuzzleReplay({ puzzle: puzzleRef, autoAudio: false });

    expect(replay.isInspectingBoard.value).toBe(false);

    // Toggle on
    replay.toggleInspectBoard();
    expect(replay.isInspectingBoard.value).toBe(true);

    // Toggle off
    replay.toggleInspectBoard();
    expect(replay.isInspectingBoard.value).toBe(false);

    // Explicit set
    replay.toggleInspectBoard(true);
    expect(replay.isInspectingBoard.value).toBe(true);
    replay.toggleInspectBoard(true);
    expect(replay.isInspectingBoard.value).toBe(true);

    replay.toggleInspectBoard(false);
    expect(replay.isInspectingBoard.value).toBe(false);
  });

  it('triggers audio callbacks on replay navigation when audio is provided', () => {
    const puzzleRef = ref<Puzzle | null>(multiPlyPuzzle);
    const playPickup = vi.fn();
    const playMove = vi.fn();

    const replay = usePuzzleReplay({
      puzzle: puzzleRef,
      autoAudio: true,
      audio: { playPickup, playMove },
    });

    replay.stepReplayStart();
    expect(playPickup).toHaveBeenCalledTimes(1);

    replay.stepReplayNext();
    expect(playMove).toHaveBeenCalledTimes(1);

    replay.stepReplayPrev();
    expect(playMove).toHaveBeenCalledTimes(2);

    replay.stepReplayEnd();
    expect(playMove).toHaveBeenCalledTimes(3);
  });

  it('exposes dynamic currentStepExplanation for active step', () => {
    const puzzleRef = ref<Puzzle | null>(multiPlyPuzzle);
    const replay = usePuzzleReplay({ puzzle: puzzleRef, autoAudio: false });

    replay.stepReplayStart();
    expect(replay.currentStepExplanation.value?.explanation).toContain('Initial puzzle setup');

    replay.stepReplayNext();
    expect(replay.currentStepExplanation.value?.moveSan).toBe('Nxc7+');
    expect(replay.currentStepExplanation.value?.actor).toBe('w');

    replay.stepReplayNext();
    expect(replay.currentStepExplanation.value?.moveSan).toBe('Kd8');
    expect(replay.currentStepExplanation.value?.actor).toBe('b');
  });

  it('resets replay cleanly via resetReplay', () => {
    const puzzleRef = ref<Puzzle | null>(multiPlyPuzzle);
    const replay = usePuzzleReplay({ puzzle: puzzleRef, autoAudio: false });

    replay.stepReplayEnd();
    replay.toggleInspectBoard(true);
    expect(replay.isReplaying.value).toBe(true);
    expect(replay.isInspectingBoard.value).toBe(true);

    replay.resetReplay();
    expect(replay.isReplaying.value).toBe(false);
    expect(replay.isInspectingBoard.value).toBe(false);
    expect(replay.replayStepIndex.value).toBe(0);
  });
});
