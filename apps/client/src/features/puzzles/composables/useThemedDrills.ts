import { ref, computed, readonly } from 'vue';
import type { Puzzle, PuzzleTheme, StarRating, PuzzleProgressStore } from '@fun-chess/shared';
import { getPuzzlesByTheme } from '../data/puzzle_catalog';
import { usePuzzleProgress } from './usePuzzleProgress';

export function useThemedDrills(initialTheme: PuzzleTheme = 'fork', customStore?: PuzzleProgressStore) {
  const activeTheme = ref<PuzzleTheme>(initialTheme);
  const currentPuzzleIndex = ref<number>(0);
  const sessionSolvedCount = ref<number>(0);
  const sessionAttemptCount = ref<number>(0);

  const progressModule = usePuzzleProgress(customStore);

  const playlist = computed<readonly Puzzle[]>(() => {
    return getPuzzlesByTheme(activeTheme.value);
  });

  const totalInTheme = computed<number>(() => playlist.value.length);

  const currentPuzzle = computed<Puzzle | null>(() => {
    if (playlist.value.length === 0) return null;
    return playlist.value[currentPuzzleIndex.value % playlist.value.length] || null;
  });

  const themeMastery = computed(() => {
    return progressModule.getThemeMastery(activeTheme.value);
  });

  function setTheme(theme: PuzzleTheme) {
    activeTheme.value = theme;
    currentPuzzleIndex.value = 0;
    sessionSolvedCount.value = 0;
    sessionAttemptCount.value = 0;
  }

  async function handleSolve(puzzle: Puzzle, stars: StarRating) {
    sessionSolvedCount.value += 1;
    sessionAttemptCount.value += 1;
    await progressModule.recordAttempt(puzzle.id, activeTheme.value, 'solved_first_try', stars);
  }

  function handleSkip() {
    sessionAttemptCount.value += 1;
    nextPuzzle();
  }

  function nextPuzzle() {
    if (playlist.value.length > 0) {
      currentPuzzleIndex.value = (currentPuzzleIndex.value + 1) % playlist.value.length;
    }
  }

  function previousDrill() {
    if (playlist.value.length > 0) {
      currentPuzzleIndex.value =
        (currentPuzzleIndex.value - 1 + playlist.value.length) % playlist.value.length;
    }
  }

  return {
    activeTheme: readonly(activeTheme),
    playlist,
    totalInTheme,
    currentPuzzle,
    currentPuzzleIndex: readonly(currentPuzzleIndex),
    currentDrillIndex: readonly(currentPuzzleIndex),
    sessionSolvedCount: readonly(sessionSolvedCount),
    solvedInSessionCount: readonly(sessionSolvedCount),
    sessionAttemptCount: readonly(sessionAttemptCount),
    themeMastery,
    setTheme,
    selectTheme: (theme: PuzzleTheme) => setTheme(theme),
    handleSolve,
    handleSkip,
    nextPuzzle,
    nextDrill: () => nextPuzzle(),
    previousDrill,
  };
}
