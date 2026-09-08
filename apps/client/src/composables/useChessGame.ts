/**
 * Client-side Chess game state and rules engine composable.
 * Uses chess.js for optimistic moves, legal move calculation, and local validation.
 * Delegates core board state to useChessBoard per [MIN-024].
 */
import { ref, computed } from 'vue';
import type {
  PieceColor,
  PieceType,
  Square,
  GameState,
  MoveResult,
} from '@fun-chess/shared';
import {
  safeLoadFen,
  isPawnPromotion,
} from '@fun-chess/shared';
import { useChessBoard } from './useChessBoard';
import { useBoardSelection } from '../features/board/index';
import { logger } from '@/platform/telemetry/index.js';

export function useChessGame(initialFen?: string) {
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

  const moveHistory = ref<MoveResult[]>([]);
  const lastMove = ref<{ from: string; to: string } | null>(null);
  const myColor = ref<PieceColor | null>(null);

  const isMyTurn = computed(() => {
    if (!myColor.value) return true;
    return turn.value === myColor.value;
  });

  function isCapturableTarget(square: Square): boolean {
    if (!boardSelection.isLegalTarget(square)) return false;
    const targetPiece = getSquarePiece(square);
    if (targetPiece && targetPiece.color !== turn.value) return true;

    // Check en passant
    if (boardSelection.selectedSquare.value) {
      const srcPiece = getSquarePiece(boardSelection.selectedSquare.value);
      if (srcPiece?.type === 'p') {
        const fileDiff = Math.abs(boardSelection.selectedSquare.value.charCodeAt(0) - square.charCodeAt(0));
        if (fileDiff === 1 && !targetPiece) {
          return true;
        }
      }
    }
    return false;
  }

  function isPromotionMove(from: Square, to: Square): boolean {
    const piece = getSquarePiece(from);
    return isPawnPromotion(from, to, piece);
  }

  function checkRequiresPromotion(from: Square, to: Square): boolean {
    return isPromotionMove(from, to);
  }

  function applyLocalMove(
    from: Square,
    to: Square,
    promotion?: 'q' | 'r' | 'b' | 'n' | PieceType
  ): boolean {
    try {
      const promoChar = promotion ? (promotion.toLowerCase() as 'q' | 'r' | 'b' | 'n') : undefined;
      const result = chess.move({
        from: from as unknown as import('chess.js').Square,
        to: to as unknown as import('chess.js').Square,
        promotion: promoChar,
      });

      if (!result) return false;

      lastMove.value = { from: result.from, to: result.to };

      const moveRes: MoveResult = {
        from: result.from,
        to: result.to,
        san: result.san,
        piece: result.piece as PieceType,
        color: result.color as PieceColor,
        captured: result.captured as PieceType | undefined,
        promotion: result.promotion as PieceType | undefined,
        flags: result.flags,
        fen: chess.fen(),
        moveNumber: chess.history().length,
        timestamp: Date.now(),
      };

      moveHistory.value.push(moveRes);
      boardSelection.clearSelection();
      boardSelection.cancelPromotion();
      updateLocalState();
      return true;
    } catch (err) {
      logger.warn('Failed to apply local move', {
        operation: 'apply_local_move',
        from,
        to,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  // Unified Board Selection State Machine (MIN-010)
  const boardSelection = useBoardSelection({
    getPieceAt: (sq) => getSquarePiece(sq),
    getLegalMovesForSquare: (sq) => getLegalMoves(sq),
    currentTurn: turn,
    playerColor: myColor,
    executeMove: (from, to, promotion) => applyLocalMove(from, to, promotion),
  });

  function selectSquare(
    square: Square,
    onMoveReady?: (move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => void
  ): { moved: boolean; requiresPromotion: boolean } {
    return boardSelection.handleSquareClick(square, onMoveReady);
  }

  function completePromotion(
    pieceType: 'q' | 'r' | 'b' | 'n',
    onMoveReady?: (move: { from: Square; to: Square; promotion: 'q' | 'r' | 'b' | 'n' }) => void
  ): boolean {
    return boardSelection.completePromotion(pieceType, onMoveReady);
  }

  function cancelPromotion(): void {
    boardSelection.cancelPromotion();
  }

  function clearSelection(): void {
    boardSelection.clearSelection();
  }

  function syncGameState(state: GameState): void {
    try {
      safeLoadFen(chess, state.fen);
      fen.value = state.fen;
      turn.value = state.turn;
      isCheck.value = state.isCheck;
      isCheckmate.value = state.isCheckmate;
      isDraw.value = state.isDraw;
      isStalemate.value = state.isStalemate;
      isGameOver.value = state.isCheckmate || state.isDraw || state.isStalemate;
      if (state.moveHistory) {
        moveHistory.value = [...state.moveHistory];
      }
      if (state.lastMove) {
        lastMove.value = { ...state.lastMove };
      }
      if (state.capturedWhite) {
        capturedWhite.value = [...state.capturedWhite];
      }
      if (state.capturedBlack) {
        capturedBlack.value = [...state.capturedBlack];
      }
      if (state.materialAdvantage) {
        materialAdvantage.value = { ...state.materialAdvantage };
      }
      boardSelection.clearSelection();
    } catch (err) {
      logger.warn('Failed to sync game state', {
        operation: 'sync_game_state',
        error: err instanceof Error ? err.message : String(err),
      });
      updateLocalState();
    }
  }

  function resetGame(customFen?: string): void {
    if (customFen) {
      safeLoadFen(chess, customFen);
    } else {
      chess.reset();
    }
    moveHistory.value = [];
    lastMove.value = null;
    boardSelection.clearSelection();
    updateLocalState();
  }

  function setPlayerColor(color: PieceColor | null): void {
    myColor.value = color;
  }

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
    moveHistory,
    lastMove,
    myColor,
    isMyTurn,
    selectedSquare: computed(() => boardSelection.selectedSquare.value),
    legalMoves: computed(() => boardSelection.legalMovesForSelected.value),
    legalMovesForSelected: computed(() => boardSelection.legalMovesForSelected.value),
    pendingPromotion: boardSelection.pendingPromotion,
    capturedWhite,
    capturedBlack,
    materialAdvantage,
    kingInCheckSquare,
    getSquarePiece,
    getLegalMoves,
    isLegalTarget: (square: Square) => boardSelection.isLegalTarget(square),
    isCapturableTarget,
    isPromotionMove,
    checkRequiresPromotion,
    selectSquare,
    completePromotion,
    cancelPromotion,
    clearSelection,
    applyLocalMove,
    syncGameState,
    resetGame,
    flipBoard,
    setPlayerColor,
  };
}
