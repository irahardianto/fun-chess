import { ref, computed, readonly, type Ref } from 'vue';
import type { Puzzle, HintLevel, Square } from '@fun-chess/shared';
import { generateProgressiveHint, type ExtendedHintData } from '../engine/hint_generator';

export interface UsePuzzleHintsOptions {
  /** Optional reactive reference to current active puzzle */
  puzzle?: Ref<Puzzle | null>;
  /** Optional reactive reference to current ply move index */
  currentMoveIndex?: Ref<number>;
  /** Optional reactive reference to current board FEN */
  currentFen?: Ref<string>;
}

/**
 * Composable managing progressive 3-tier hint assistance and automated mistake nudging.
 *
 * Tier 1: Nudge source square (which piece to move)
 * Tier 2: Glow target square (where the piece should go)
 * Tier 3: Full solution line + vector arrow
 */
export function usePuzzleHints(options: UsePuzzleHintsOptions = {}) {
  const currentHintLevel = ref<HintLevel>(0);
  const activeHint = ref<ExtendedHintData | null>(null);
  const hintsUsedCount = ref<number>(0);

  const isTier1Active = computed<boolean>(() => currentHintLevel.value >= 1);
  const isTier2Active = computed<boolean>(() => currentHintLevel.value >= 2);
  const isTier3Active = computed<boolean>(() => currentHintLevel.value >= 3);

  const nudgeSquare = computed<Square | null>(() => {
    if (currentHintLevel.value < 1 || !activeHint.value) return null;
    return activeHint.value.sourceSquare || null;
  });

  const targetSquare = computed<Square | null>(() => {
    if (currentHintLevel.value < 2 || !activeHint.value) return null;
    return activeHint.value.targetSquare || null;
  });

  const solutionArrow = computed<{ from: Square; to: Square } | null>(() => {
    if (currentHintLevel.value < 3 || !activeHint.value) return null;
    if (activeHint.value.sourceSquare && activeHint.value.targetSquare) {
      return {
        from: activeHint.value.sourceSquare,
        to: activeHint.value.targetSquare,
      };
    }
    return null;
  });

  /**
   * Reveals the next progressive hint tier (1..3).
   *
   * @param targetPuzzle - Optional explicit puzzle (defaults to options.puzzle)
   * @param moveIndex - Optional explicit move index (defaults to options.currentMoveIndex)
   * @param fen - Optional explicit FEN (defaults to options.currentFen)
   * @returns Generated ExtendedHintData payload or null if no puzzle active
   */
  function revealHint(
    targetPuzzle?: Puzzle | null,
    moveIndex?: number,
    fen?: string
  ): ExtendedHintData | null {
    const p = targetPuzzle !== undefined ? targetPuzzle : options.puzzle?.value;
    if (!p) return null;

    const mIdx = moveIndex !== undefined ? moveIndex : (options.currentMoveIndex?.value ?? 0);
    const f = fen !== undefined ? fen : (options.currentFen?.value ?? p.fen);

    const nextLevel = Math.min(3, currentHintLevel.value + 1) as HintLevel;
    currentHintLevel.value = nextLevel;
    hintsUsedCount.value = Math.max(hintsUsedCount.value, nextLevel);

    const hint = generateProgressiveHint(p, mIdx, f, nextLevel);
    activeHint.value = hint;
    return hint;
  }

  /**
   * Resets all hint states back to level 0.
   */
  function resetHints(): void {
    currentHintLevel.value = 0;
    activeHint.value = null;
    hintsUsedCount.value = 0;
  }

  /**
   * Non-punitive coaching assistance: automatically triggers a Tier 1 nudge if
   * the player has made 2 or more consecutive mistakes and hints are at level 0.
   *
   * @param consecutiveMistakes - Number of mistakes made so far
   * @param targetPuzzle - Optional explicit puzzle
   * @param moveIndex - Optional explicit move index
   * @param fen - Optional explicit FEN
   * @returns Revealed hint if triggered, null otherwise
   */
  function checkAutoNudge(
    consecutiveMistakes: number,
    targetPuzzle?: Puzzle | null,
    moveIndex?: number,
    fen?: string
  ): ExtendedHintData | null {
    if (consecutiveMistakes >= 2 && currentHintLevel.value === 0) {
      return revealHint(targetPuzzle, moveIndex, fen);
    }
    return null;
  }

  /**
   * Sets an explicit hint level (0..3).
   */
  function setHintLevel(
    level: HintLevel,
    targetPuzzle?: Puzzle | null,
    moveIndex?: number,
    fen?: string
  ): ExtendedHintData | null {
    const p = targetPuzzle !== undefined ? targetPuzzle : options.puzzle?.value;
    currentHintLevel.value = level;
    hintsUsedCount.value = Math.max(hintsUsedCount.value, level);
    if (level === 0 || !p) {
      activeHint.value = null;
      return null;
    }

    const mIdx = moveIndex !== undefined ? moveIndex : (options.currentMoveIndex?.value ?? 0);
    const f = fen !== undefined ? fen : (options.currentFen?.value ?? p.fen);
    const hint = generateProgressiveHint(p, mIdx, f, level);
    activeHint.value = hint;
    return hint;
  }

  /**
   * Directly reveals Tier 3 solution.
   */
  function revealSolution(
    targetPuzzle?: Puzzle | null,
    moveIndex?: number,
    fen?: string
  ): ExtendedHintData | null {
    return setHintLevel(3, targetPuzzle, moveIndex, fen);
  }

  /**
   * Backward-compatible requestNextHint signature matching useProgressiveHint.
   */
  function requestNextHint(
    puzzle: Puzzle,
    currentMoveIndex: number,
    currentFen: string
  ): ExtendedHintData {
    return revealHint(puzzle, currentMoveIndex, currentFen)!;
  }

  return {
    currentHintLevel: readonly(currentHintLevel),
    activeHint: readonly(activeHint),
    hintsUsedCount: readonly(hintsUsedCount),
    hintsCount: readonly(hintsUsedCount),
    isTier1Active,
    isTier2Active,
    isTier3Active,
    nudgeSquare,
    targetSquare,
    solutionArrow,

    revealHint,
    revealNextHint: revealHint,
    resetHints,
    checkAutoNudge,
    setHintLevel,
    revealSolution,
    requestNextHint,
  };
}

export type UsePuzzleHintsReturn = ReturnType<typeof usePuzzleHints>;
