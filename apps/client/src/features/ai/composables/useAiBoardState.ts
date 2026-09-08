import { ref, computed } from 'vue';
import type {
  PieceColor,
  GameOverPayload,
} from '@fun-chess/shared';
import { safeLoadFen } from '@fun-chess/shared';
import { useChessBoard } from '@/composables/useChessBoard';

export interface UseAiBoardStateOptions {
  initialFen?: string;
  initialPlayerColor?: PieceColor | 'random';
  /**
   * Optional seedable PRNG function for deterministic player color resolution (ENH-005).
   */
  randomFn?: () => number;
}

/**
 * useAiBoardState composable (MIN-023, MIN-024, ENH-005).
 * Encapsulates core reactive chess board signals, piece inspection,
 * orientation, player resolution, and material calculation.
 */
export function useAiBoardState(options: UseAiBoardStateOptions = {}) {
  const { initialFen, initialPlayerColor = 'w', randomFn } = options;

  // 1. Delegate core board signals and methods to useChessBoard (MIN-024)
  const board = useChessBoard(initialFen);
  const {
    chess,
    fen,
    turn,
    orientation,
    isCheck,
    isCheckmate,
    isDraw,
    isStalemate,
    isGameOver,
    capturedWhite,
    capturedBlack,
    materialAdvantage,
    kingInCheckSquare,
    updateLocalState,
    getSquarePiece,
    getLegalMoves,
    flipBoard,
  } = board;

  // 2. Player & Game Configuration
  const rawPlayerColor = ref<PieceColor | 'random'>(initialPlayerColor);
  const playerColor = ref<PieceColor>('w');
  const aiColor = computed<PieceColor>(() => (playerColor.value === 'w' ? 'b' : 'w'));
  const lastGameOver = ref<GameOverPayload | null>(null);

  /**
   * Resolves player color with optional seedable PRNG (ENH-005).
   */
  function resolvePlayerColor(
    colorOption: PieceColor | 'random',
    customRandom?: () => number
  ): PieceColor {
    if (colorOption === 'random') {
      const rng = customRandom ?? randomFn ?? Math.random;
      return rng() < 0.5 ? 'w' : 'b';
    }
    return colorOption;
  }

  function initPlayerColor(newColor?: PieceColor | 'random'): void {
    if (newColor !== undefined) {
      rawPlayerColor.value = newColor;
    }
    playerColor.value = resolvePlayerColor(rawPlayerColor.value);
    orientation.value = playerColor.value;
  }

  function resetBoard(targetFen?: string): void {
    if (targetFen) {
      safeLoadFen(chess, targetFen);
    } else {
      chess.reset();
    }
    isGameOver.value = false;
    lastGameOver.value = null;
    updateLocalState();
  }

  // Initial synchronization
  initPlayerColor(initialPlayerColor);

  return {
    chess,
    rawPlayerColor,
    playerColor,
    aiColor,
    orientation,
    fen,
    turn,
    isCheck,
    isCheckmate,
    isDraw,
    isStalemate,
    isGameOver,
    lastGameOver,
    capturedWhite,
    capturedBlack,
    materialAdvantage,
    kingInCheckSquare,
    updateLocalState,
    resolvePlayerColor,
    getSquarePiece,
    getLegalMoves,
    flipBoard,
    initPlayerColor,
    resetBoard,
  };
}

export type UseAiBoardStateReturn = ReturnType<typeof useAiBoardState>;
