/**
 * Client-side Chess game state and rules engine composable.
 * Uses chess.js for optimistic moves, legal move calculation, and local validation.
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
  createSafeChess,
  safeLoadFen,
  calculateMaterialAndCaptures,
  isPawnPromotion,
} from '@fun-chess/shared';
import { useBoardSelection } from '../features/board/index';

export function useChessGame(initialFen?: string) {
  const chess = createSafeChess(initialFen);

  const fen = ref(chess.fen());
  const turn = ref<PieceColor>(chess.turn() as PieceColor);
  const orientation = ref<PieceColor>('w');
  const isCheck = ref(chess.inCheck());
  const isCheckmate = ref(chess.isCheckmate());
  const isDraw = ref(chess.isDraw());
  const isStalemate = ref(chess.isStalemate());
  const isGameOver = ref(chess.isGameOver());
  const moveHistory = ref<MoveResult[]>([]);
  const lastMove = ref<{ from: string; to: string } | null>(null);
  const myColor = ref<PieceColor | null>(null);

  const capturedWhite = ref<PieceType[]>([]);
  const capturedBlack = ref<PieceType[]>([]);
  const materialAdvantage = ref<{ white: number; black: number }>({ white: 0, black: 0 });

  const isMyTurn = computed(() => {
    if (!myColor.value) return true;
    return turn.value === myColor.value;
  });

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

  function updateLocalState(): void {
    fen.value = chess.fen();
    turn.value = chess.turn() as PieceColor;
    isCheck.value = chess.inCheck();
    isCheckmate.value = chess.isCheckmate();
    isDraw.value = chess.isDraw();
    isStalemate.value = chess.isStalemate();
    isGameOver.value = chess.isGameOver();

    // Use shared material & capture calculation (MIN-009)
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
      console.warn('[useChessGame] getSquarePiece error:', err);
      return null;
    }
  }

  function getLegalMoves(square: Square): Square[] {
    try {
      const moves = chess.moves({ square: square as unknown as import('chess.js').Square, verbose: true });
      return moves.map((m) => m.to as Square);
    } catch (err) {
      console.warn('[useChessGame] getLegalMoves error:', err);
      return [];
    }
  }

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
      console.warn('[useChessGame] applyLocalMove error:', err);
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
      console.warn('[useChessGame] syncGameState error:', err);
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

  function flipBoard(): void {
    orientation.value = orientation.value === 'w' ? 'b' : 'w';
  }

  function setPlayerColor(color: PieceColor | null): void {
    myColor.value = color;
  }

  // Initialize
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
