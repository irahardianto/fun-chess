import { ref, type Ref } from 'vue';
import type { Square } from '@fun-chess/shared';
import { isPawnPromotion } from '@fun-chess/shared';

export interface PendingPromotion {
  from: Square;
  to: Square;
}

export interface SelectionMoveResult {
  moved: boolean;
  requiresPromotion: boolean;
  from?: Square;
  to?: Square;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

export interface BoardSelectionOptions {
  getPieceAt: (square: Square) => { color: 'w' | 'b'; type: string } | null;
  getLegalMovesForSquare: (square: Square) => Square[];
  currentTurn: Ref<'w' | 'b'>;
  playerColor: Ref<'w' | 'b' | null>;
  executeMove: (from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') => boolean;
}

/**
 * Reusable board selection and pawn promotion state machine.
 * Consolidates piece selection, destination validation, and promotion interception.
 */
export function useBoardSelection(options: BoardSelectionOptions) {
  const selectedSquare = ref<Square | null>(null);
  const legalMovesForSelected = ref<Square[]>([]);
  const pendingPromotion = ref<PendingPromotion | null>(null);

  function clearSelection(): void {
    selectedSquare.value = null;
    legalMovesForSelected.value = [];
  }

  function isLegalTarget(square: Square): boolean {
    return legalMovesForSelected.value.includes(square);
  }

  function handleSquareClick(
    square: Square,
    onMoveReady?: (move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => void
  ): SelectionMoveResult {
    // 1. Destination click when piece is selected
    if (selectedSquare.value && isLegalTarget(square)) {
      const from = selectedSquare.value;
      const to = square;

      const piece = options.getPieceAt(from);
      if (isPawnPromotion(from, to, piece)) {
        pendingPromotion.value = { from, to };
        return { moved: false, requiresPromotion: true, from, to };
      }

      const success = options.executeMove(from, to);
      if (success) {
        clearSelection();
        if (onMoveReady) onMoveReady({ from, to });
        return { moved: true, requiresPromotion: false, from, to };
      }
    }

    // 2. Piece selection
    const piece = options.getPieceAt(square);
    if (piece && piece.color === options.currentTurn.value) {
      if (options.playerColor.value && piece.color !== options.playerColor.value) {
        clearSelection();
        return { moved: false, requiresPromotion: false };
      }
      selectedSquare.value = square;
      legalMovesForSelected.value = options.getLegalMovesForSquare(square);
      return { moved: false, requiresPromotion: false };
    }

    // 3. Deselect
    clearSelection();
    return { moved: false, requiresPromotion: false };
  }

  function completePromotion(
    pieceType: 'q' | 'r' | 'b' | 'n',
    onMoveReady?: (move: { from: Square; to: Square; promotion: 'q' | 'r' | 'b' | 'n' }) => void
  ): boolean {
    if (!pendingPromotion.value) return false;
    const { from, to } = pendingPromotion.value;
    const success = options.executeMove(from, to, pieceType);
    if (success) {
      if (onMoveReady) onMoveReady({ from, to, promotion: pieceType });
      pendingPromotion.value = null;
      clearSelection();
      return true;
    }
    return false;
  }

  function cancelPromotion(): void {
    pendingPromotion.value = null;
    clearSelection();
  }

  function requestPromotion(from: Square, to: Square): void {
    selectedSquare.value = from;
    pendingPromotion.value = { from, to };
  }

  return {
    selectedSquare,
    legalMovesForSelected,
    pendingPromotion,
    clearSelection,
    isLegalTarget,
    handleSquareClick,
    completePromotion,
    cancelPromotion,
    requestPromotion,
  };
}
