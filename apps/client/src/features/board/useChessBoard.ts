/**
 * Core reactive chess board state, signals, and piece inspection composable.
 * Shared between useChessGame and useAiBoardState per [MIN-024].
 * Encapsulates FEN tracking, turn status, game over / check signals,
 * captured pieces, material advantage, and legal move queries.
 */
import { ref, computed, getCurrentInstance, type Ref, type ComputedRef } from 'vue';
import { Chess } from 'chess.js';
import type {
  PieceColor,
  PieceType,
  Square,
} from '@fun-chess/shared';
import {
  createSafeChess,
  calculateMaterialAndCaptures,
} from '@fun-chess/shared';
import { useInjectLogger } from '@/platform/di';
import { logger as defaultLogger, type ILogger } from '@/platform/telemetry/index.js';

export interface UseChessBoardOptions {
  initialFen?: string;
  chess?: Chess;
  orientation?: PieceColor;
  logger?: ILogger;
}

export interface UseChessBoardReturn {
  chess: Chess;
  fen: Ref<string>;
  turn: Ref<PieceColor>;
  orientation: Ref<PieceColor>;
  isCheck: Ref<boolean>;
  isCheckmate: Ref<boolean>;
  isDraw: Ref<boolean>;
  isStalemate: Ref<boolean>;
  isGameOver: Ref<boolean>;
  capturedWhite: Ref<PieceType[]>;
  capturedBlack: Ref<PieceType[]>;
  materialAdvantage: Ref<{ white: number; black: number }>;
  kingInCheckSquare: ComputedRef<Square | null>;
  updateLocalState: () => void;
  getSquarePiece: (square: Square) => { type: PieceType; color: PieceColor } | null;
  getLegalMoves: (square: Square) => Square[];
  flipBoard: () => void;
}

/**
 * Pure calculation function to get legal target squares for a piece on a square.
 * Pure logic: no side effects, no framework dependencies, no I/O.
 */
export function getLegalTargetSquares(chess: Chess, square: Square): Square[] {
  try {
    const moves = chess.moves({
      square: square as unknown as import('chess.js').Square,
      verbose: true,
    });
    return moves.map((m) => m.to as Square);
  } catch (err) {
    defaultLogger.debug('Failed to get legal target squares', {
      operation: 'get_legal_target_squares',
      square,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Shared composable extracting common board signals and inspection methods.
 */
export function useChessBoard(
  source?: Chess | string | UseChessBoardOptions
): UseChessBoardReturn {
  let chessInstance: Chess;
  let initialOrientation: PieceColor = 'w';
  const optionsLogger =
    source && typeof source === 'object' && !(source instanceof Chess)
      ? source.logger
      : undefined;
  const logger =
    optionsLogger ?? (getCurrentInstance() ? useInjectLogger() : defaultLogger);

  if (source instanceof Chess) {
    chessInstance = source;
  } else if (typeof source === 'string') {
    chessInstance = createSafeChess(source);
  } else if (source && typeof source === 'object') {
    chessInstance = source.chess ?? createSafeChess(source.initialFen);
    initialOrientation = source.orientation ?? 'w';
  } else {
    chessInstance = createSafeChess();
  }

  const chess = chessInstance;

  // Reactive Board State Signals
  const fen = ref<string>(chess.fen());
  const turn = ref<PieceColor>(chess.turn() as PieceColor);
  const orientation = ref<PieceColor>(initialOrientation);
  const isCheck = ref<boolean>(chess.inCheck());
  const isCheckmate = ref<boolean>(chess.isCheckmate());
  const isDraw = ref<boolean>(chess.isDraw());
  const isStalemate = ref<boolean>(chess.isStalemate());
  const isGameOver = ref<boolean>(chess.isGameOver());

  // Captured Pieces & Material Balance
  const capturedWhite = ref<PieceType[]>([]);
  const capturedBlack = ref<PieceType[]>([]);
  const materialAdvantage = ref<{ white: number; black: number }>({ white: 0, black: 0 });

  function updateLocalState(): void {
    fen.value = chess.fen();
    turn.value = chess.turn() as PieceColor;
    isCheck.value = chess.inCheck();
    isCheckmate.value = chess.isCheckmate();
    isDraw.value = chess.isDraw();
    isStalemate.value = chess.isStalemate();
    isGameOver.value = chess.isGameOver();

    // Calculate material and captured pieces using pure shared evaluator
    const evaluation = calculateMaterialAndCaptures(chess);
    capturedWhite.value = evaluation.capturedWhite;
    capturedBlack.value = evaluation.capturedBlack;
    materialAdvantage.value = evaluation.materialAdvantage;
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
    return getLegalTargetSquares(chess, square);
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

  // Initial calculation of material and state
  updateLocalState();

  return {
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
  };
}
