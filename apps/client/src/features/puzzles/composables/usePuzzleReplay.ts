import { ref, computed, readonly, type Ref } from 'vue';
import { Chess, type Move } from 'chess.js';
import type {
  Puzzle,
  Square,
  PieceColor,
  PuzzleAnalysisResult,
} from '@fun-chess/shared';
import { parseUciMove } from '../engine/puzzle_validator';

export interface ReplayStep {
  readonly stepIndex: number;
  readonly plyIndex: number;
  readonly uci?: string;
  readonly san?: string;
  readonly from?: Square;
  readonly to?: Square;
  readonly actor?: PieceColor;
  readonly fen: string;
  readonly explanation?: string;
}

export interface UsePuzzleReplayOptions {
  /** Reactive reference to current active puzzle */
  puzzle?: Ref<Puzzle | null>;
  /** Reactive reference to full puzzle solution analysis */
  analysis?: Ref<PuzzleAnalysisResult | null>;
  /** Whether audio sound effects are enabled */
  autoAudio?: boolean;
  /** Optional audio interface for interactive replay sounds */
  audio?: {
    playPickup: () => void;
    playMove: () => void;
  };
}

/**
 * Composable managing interactive move replay and post-game board inspection.
 *
 * Precomputes turn-by-turn positions and algebraic notation for step-by-step
 * educational review once a puzzle is completed or during debriefs.
 */
export function usePuzzleReplay(options: UsePuzzleReplayOptions = {}) {
  const isReplaying = ref<boolean>(false);
  const isInspectingBoard = ref<boolean>(false);
  const replayStepIndex = ref<number>(0);

  const autoAudio = options.autoAudio ?? true;
  const audio = options.audio;

  /**
   * Precomputes full step-by-step replay history from puzzle.fen and puzzle.moves.
   */
  const replaySteps = computed<readonly ReplayStep[]>(() => {
    const p = options.puzzle?.value;
    if (!p) return [];

    const steps: ReplayStep[] = [
      {
        stepIndex: 0,
        plyIndex: -1,
        fen: p.fen,
        san: 'Start',
        explanation: 'Initial puzzle setup position',
      },
    ];

    let sim: Chess;
    try {
      sim = new Chess(p.fen);
    } catch {
      return steps;
    }

    for (let i = 0; i < p.moves.length; i++) {
      const uci = p.moves[i];
      if (!uci) continue;
      const { from, to, promotion } = parseUciMove(uci);
      const actor: PieceColor = sim.turn();

      let moveRes: Move | null = null;
      try {
        moveRes = sim.move({
          from: from as unknown as import('chess.js').Square,
          to: to as unknown as import('chess.js').Square,
          promotion,
        });
      } catch {
        moveRes = null;
      }

      const san = moveRes ? moveRes.san : uci;
      const ana = options.analysis?.value;
      const explanation =
        p.stepExplanations?.[i]?.explanation ||
        ana?.stepNarratives?.[i]?.explanation ||
        (moveRes ? `Move: ${san}` : uci);

      steps.push({
        stepIndex: i + 1,
        plyIndex: i,
        uci,
        san,
        from,
        to,
        actor,
        fen: sim.fen(),
        explanation,
      });
    }

    return steps;
  });

  const replayTotalSteps = computed<number>(() => {
    return Math.max(0, options.puzzle?.value?.moves.length ?? 0);
  });

  const currentReplayStep = computed<ReplayStep | null>(() => {
    return replaySteps.value[replayStepIndex.value] ?? null;
  });

  const currentReplaySan = computed<string>(() => {
    return currentReplayStep.value?.san || '';
  });

  const currentStepExplanation = computed<{
    plyIndex: number;
    moveSan: string;
    moveUci: string;
    actor: PieceColor;
    explanation: string;
  } | null>(() => {
    if (!currentReplayStep.value) return null;
    const idx = replayStepIndex.value - 1;
    const p = options.puzzle?.value;

    if (idx < 0) {
      return {
        plyIndex: -1,
        moveSan: 'Start',
        moveUci: '',
        actor: p?.playerColor || 'w',
        explanation: 'Initial puzzle setup position',
      };
    }

    const ana = options.analysis?.value;
    const predefined = p?.stepExplanations?.[idx];
    const narrative = ana?.stepNarratives?.[idx];

    return (
      predefined ||
      narrative || {
        plyIndex: idx,
        moveSan: currentReplayStep.value.san || '',
        moveUci: currentReplayStep.value.uci || '',
        actor: currentReplayStep.value.actor || 'w',
        explanation: currentReplayStep.value.explanation || '',
      }
    );
  });

  /**
   * Jumps to the starting setup position of the replay.
   */
  function stepReplayStart(): void {
    isReplaying.value = true;
    replayStepIndex.value = 0;
    if (autoAudio && audio) audio.playPickup();
  }

  /**
   * Steps one ply backward in replay history.
   */
  function stepReplayPrev(): void {
    isReplaying.value = true;
    if (replayStepIndex.value > 0) {
      replayStepIndex.value -= 1;
      if (autoAudio && audio) audio.playMove();
    }
  }

  /**
   * Steps one ply forward in replay history.
   */
  function stepReplayNext(): void {
    isReplaying.value = true;
    if (replayStepIndex.value < replayTotalSteps.value) {
      replayStepIndex.value += 1;
      if (autoAudio && audio) audio.playMove();
    }
  }

  /**
   * Jumps to the final position of the replay.
   */
  function stepReplayEnd(): void {
    isReplaying.value = true;
    replayStepIndex.value = replayTotalSteps.value;
    if (autoAudio && audio) audio.playMove();
  }

  /**
   * Navigates to a specific step index in replay history.
   */
  function goToReplayStep(step: number): void {
    isReplaying.value = true;
    replayStepIndex.value = Math.max(0, Math.min(step, replayTotalSteps.value));
  }

  /**
   * Toggles board inspection mode between free examination and solved state.
   */
  function toggleInspectBoard(inspecting?: boolean): void {
    if (typeof inspecting === 'boolean') {
      isInspectingBoard.value = inspecting;
    } else {
      isInspectingBoard.value = !isInspectingBoard.value;
    }
  }

  /**
   * Resets replay state back to initial live gameplay mode.
   */
  function resetReplay(): void {
    isReplaying.value = false;
    isInspectingBoard.value = false;
    replayStepIndex.value = 0;
  }

  /**
   * Aligns replay index to final step upon puzzle completion.
   */
  function completeReplay(): void {
    replayStepIndex.value = replayTotalSteps.value;
  }

  return {
    isReplaying: readonly(isReplaying),
    isInspectingBoard: readonly(isInspectingBoard),
    replayStepIndex: readonly(replayStepIndex),
    replaySteps,
    replayTotalSteps,
    currentReplayStep,
    currentReplaySan,
    currentStepExplanation,

    stepReplayStart,
    stepReplayPrev,
    stepReplayNext,
    stepReplayEnd,
    goToReplayStep,
    setReplayStep: goToReplayStep,
    toggleInspectBoard,
    resetReplay,
    completeReplay,
  };
}

export type UsePuzzleReplayReturn = ReturnType<typeof usePuzzleReplay>;
