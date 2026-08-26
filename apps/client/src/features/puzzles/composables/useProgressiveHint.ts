import { ref, computed, readonly } from 'vue';
import type { Puzzle, HintLevel, Square } from '@fun-chess/shared';
import { generateProgressiveHint, type ExtendedHintData } from '../engine/hint_generator';

export function useProgressiveHint() {
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

  function requestNextHint(puzzle: Puzzle, currentMoveIndex: number, currentFen: string): ExtendedHintData {
    const nextLevel = Math.min(3, currentHintLevel.value + 1) as HintLevel;
    currentHintLevel.value = nextLevel;
    hintsUsedCount.value = Math.max(hintsUsedCount.value, nextLevel);

    const hint = generateProgressiveHint(puzzle, currentMoveIndex, currentFen, nextLevel);
    activeHint.value = hint;
    return hint;
  }

  function revealSolution(puzzle: Puzzle, currentMoveIndex: number, currentFen: string): ExtendedHintData {
    currentHintLevel.value = 3;
    hintsUsedCount.value = 3;
    const hint = generateProgressiveHint(puzzle, currentMoveIndex, currentFen, 3);
    activeHint.value = hint;
    return hint;
  }

  function setHintLevel(level: HintLevel, puzzle: Puzzle, currentMoveIndex: number, currentFen: string) {
    currentHintLevel.value = level;
    hintsUsedCount.value = Math.max(hintsUsedCount.value, level);
    if (level === 0) {
      activeHint.value = null;
    } else {
      activeHint.value = generateProgressiveHint(puzzle, currentMoveIndex, currentFen, level);
    }
  }

  function resetHints(): void {
    currentHintLevel.value = 0;
    activeHint.value = null;
    hintsUsedCount.value = 0;
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
    requestNextHint,
    revealSolution,
    setHintLevel,
    resetHints,
  };
}
