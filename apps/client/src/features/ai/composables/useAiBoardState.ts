import { ref, computed } from 'vue';
import type {
  Square,
  PieceColor,
  PieceType,
  GameOverPayload,
} from '@fun-chess/shared';
import {
  createSafeChess,
  safeLoadFen,
  calculateMaterialAndCaptures,
} from '@fun-chess/shared';
import { logger } from '@/platform/telemetry/index.js';

export interface UseAiBoardStateOptions {
  initialFen?: string;
  initialPlayerColor?: PieceColor | 'random';
}

/**
 * useAiBoardState composable (MIN-023).
 * Encapsulates core reactive chess board signals, piece inspection,
 * orientation, and material calculation.
 */
export function useAiBoardState(options: UseAiBoardStateOptions = {}) {
  const { initialFen, initialPlayerColor = 'w' } = options;

  // 1. Chess Rules Engine Instance
  const chess = createSafeChess(initialFen);

  // 2. Player & Game Configuration
  const rawPlayerColor = ref<PieceColor | 'random'>(initialPlayerColor);
  const playerColor = ref<PieceColor>('w');
  const aiColor = computed<PieceColor>(() => (playerColor.value === 'w' ? 'b' : 'w'));
  const orientation = ref<PieceColor>('w');

  // 3. Board State Signals
  const fen = ref<string>(chess.fen());
  const turn = ref<PieceColor>(chess.turn() as PieceColor);
  const isCheck = ref<boolean>(chess.inCheck());
  const isCheckmate = ref<boolean>(chess.isCheckmate());
  const isDraw = ref<boolean>(chess.isDraw());
  const isStalemate = ref<boolean>(chess.isStalemate());
  const isGameOver = ref<boolean>(chess.isGameOver());
  const lastGameOver = ref<GameOverPayload | null>(null);

  // 4. Captured Pieces & Material
  const capturedWhite = ref<PieceType[]>([]);
  const capturedBlack = ref<PieceType[]>([]);
  const materialAdvantage = ref<{ white: number; black: number }>({ white: 0, black: 0 });

  function resolvePlayerColor(colorOption: PieceColor | 'random'): PieceColor {
    if (colorOption === 'random') {
      return Math.random() < 0.5 ? 'w' : 'b';
    }
    return colorOption;
  }

  function updateLocalState(): void {
    fen.value = chess.fen();
    turn.value = chess.turn() as PieceColor;
    isCheck.value = chess.inCheck();
    isCheckmate.value = chess.isCheckmate();
    isDraw.value = chess.isDraw();
    isStalemate.value = chess.isStalemate();
    isGameOver.value = chess.isGameOver();

    // Pure evaluation utility
    const { capturedWhite: cW, capturedBlack: cB, materialAdvantage: mA } =
      calculateMaterialAndCaptures(chess);
    capturedWhite.value = cW;
    capturedBlack.value = cB;
    materialAdvantage.value = mA;
  }

  function getSquarePiece(square: Square): { type: PieceType; color: PieceColor } | null {
    try {
      const piece = chess.get(square as unknown as import('chess.js').Square);
      if (!piece) return null;
      return {
        type: piece.type as PieceType,
        color: piece.color as PieceColor,
      };
    } catch (err) {
      logger.warn('Failed to get piece at square', {
        operation: 'get_square_piece',
        square,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  function getLegalMoves(square: Square): Square[] {
    try {
      const moves = chess.moves({
        square: square as unknown as import('chess.js').Square,
        verbose: true,
      });
      return moves.map((m) => m.to as Square);
    } catch (err) {
      logger.warn('Failed to get legal moves for square', {
        operation: 'get_legal_moves',
        square,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  const kingInCheckSquare = computed<Square | null>(() => {
    if (!isCheck.value) return null;
    const board = chess.board();
    const checkedColor = turn.value;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r]?.[c];
        if (piece && piece.type === 'k' && piece.color === checkedColor) {
          return piece.square as Square;
        }
      }
    }
    return null;
  });

  function flipBoard(): void {
    orientation.value = orientation.value === 'w' ? 'b' : 'w';
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
  updateLocalState();

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
