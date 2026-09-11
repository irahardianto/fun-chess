import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { Square } from '@fun-chess/shared';
import { useBoardSelection, type BoardSelectionOptions } from '../useBoardSelection';

describe('useBoardSelection', () => {
  let boardMap: Map<Square, { color: 'w' | 'b'; type: string }>;
  let legalMovesMap: Map<Square, Square[]>;
  const currentTurn = ref<'w' | 'b'>('w');
  const playerColor = ref<'w' | 'b' | null>('w');
  let executeMoveMock = vi.fn();

  function createOptions(): BoardSelectionOptions {
    return {
      getPieceAt: (sq) => boardMap.get(sq) || null,
      getLegalMovesForSquare: (sq) => legalMovesMap.get(sq) || [],
      currentTurn,
      playerColor,
      executeMove: executeMoveMock,
    };
  }

  beforeEach(() => {
    boardMap = new Map();
    legalMovesMap = new Map();
    currentTurn.value = 'w';
    playerColor.value = 'w';
    executeMoveMock = vi.fn((_from, _to, _promo) => true);
  });

  describe('Initial State', () => {
    it('initializes with null selection and empty legal moves', () => {
      const { selectedSquare, legalMovesForSelected, pendingPromotion } = useBoardSelection(createOptions());

      expect(selectedSquare.value).toBeNull();
      expect(legalMovesForSelected.value).toEqual([]);
      expect(pendingPromotion.value).toBeNull();
    });
  });

  describe('Piece Selection', () => {
    it('selects friendly piece when clicked on current turn', () => {
      boardMap.set('e2', { color: 'w', type: 'p' });
      legalMovesMap.set('e2', ['e3', 'e4']);

      const selection = useBoardSelection(createOptions());
      const result = selection.handleSquareClick('e2');

      expect(result.moved).toBe(false);
      expect(result.requiresPromotion).toBe(false);
      expect(selection.selectedSquare.value).toBe('e2');
      expect(selection.legalMovesForSelected.value).toEqual(['e3', 'e4']);
      expect(selection.isLegalTarget('e4')).toBe(true);
      expect(selection.isLegalTarget('e5')).toBe(false);
    });

    it('does not select enemy piece on turn', () => {
      boardMap.set('e7', { color: 'b', type: 'p' });
      legalMovesMap.set('e7', ['e6', 'e5']);

      const selection = useBoardSelection(createOptions());
      const result = selection.handleSquareClick('e7');

      expect(result.moved).toBe(false);
      expect(selection.selectedSquare.value).toBeNull();
      expect(selection.legalMovesForSelected.value).toEqual([]);
    });

    it('does not select piece if playerColor does not match piece color', () => {
      currentTurn.value = 'b';
      playerColor.value = 'w'; // Human is white, currently black turn
      boardMap.set('e7', { color: 'b', type: 'p' });
      legalMovesMap.set('e7', ['e6']);

      const selection = useBoardSelection(createOptions());
      const result = selection.handleSquareClick('e7');

      expect(result.moved).toBe(false);
      expect(selection.selectedSquare.value).toBeNull();
    });

    it('clears selection when clicking an empty or invalid square', () => {
      boardMap.set('e2', { color: 'w', type: 'p' });
      legalMovesMap.set('e2', ['e3', 'e4']);

      const selection = useBoardSelection(createOptions());
      selection.handleSquareClick('e2');
      expect(selection.selectedSquare.value).toBe('e2');

      const result = selection.handleSquareClick('a1'); // empty square, not in legal moves
      expect(result.moved).toBe(false);
      expect(selection.selectedSquare.value).toBeNull();
      expect(selection.legalMovesForSelected.value).toEqual([]);
    });
  });

  describe('Move Execution', () => {
    it('executes normal move when legal destination clicked', () => {
      boardMap.set('e2', { color: 'w', type: 'p' });
      legalMovesMap.set('e2', ['e3', 'e4']);

      const onMoveReady = vi.fn();
      const selection = useBoardSelection(createOptions());

      selection.handleSquareClick('e2');
      const result = selection.handleSquareClick('e4', onMoveReady);

      expect(executeMoveMock).toHaveBeenCalledWith('e2', 'e4');
      expect(onMoveReady).toHaveBeenCalledWith({ from: 'e2', to: 'e4' });
      expect(result).toEqual({
        moved: true,
        requiresPromotion: false,
        from: 'e2',
        to: 'e4',
      });
      expect(selection.selectedSquare.value).toBeNull();
      expect(selection.legalMovesForSelected.value).toEqual([]);
    });

    it('handles failed executeMove by returning moved false', () => {
      executeMoveMock.mockReturnValue(false);
      boardMap.set('e2', { color: 'w', type: 'p' });
      legalMovesMap.set('e2', ['e4']);

      const selection = useBoardSelection(createOptions());
      selection.handleSquareClick('e2');
      const result = selection.handleSquareClick('e4');

      expect(result.moved).toBe(false);
      expect(selection.selectedSquare.value).toBeNull();
    });
  });

  describe('Pawn Promotion', () => {
    it('intercepts pawn move to 8th rank and sets pendingPromotion', () => {
      boardMap.set('e7', { color: 'w', type: 'p' });
      legalMovesMap.set('e7', ['e8']);

      const onMoveReady = vi.fn();
      const selection = useBoardSelection(createOptions());

      selection.handleSquareClick('e7');
      const result = selection.handleSquareClick('e8', onMoveReady);

      expect(result).toEqual({
        moved: false,
        requiresPromotion: true,
        from: 'e7',
        to: 'e8',
      });
      expect(selection.pendingPromotion.value).toEqual({ from: 'e7', to: 'e8' });
      expect(executeMoveMock).not.toHaveBeenCalled();
      expect(onMoveReady).not.toHaveBeenCalled();
    });

    it('completes promotion when completePromotion is called', () => {
      boardMap.set('e7', { color: 'w', type: 'p' });
      legalMovesMap.set('e7', ['e8']);

      const onMoveReady = vi.fn();
      const selection = useBoardSelection(createOptions());

      selection.handleSquareClick('e7');
      selection.handleSquareClick('e8');

      const success = selection.completePromotion('q', onMoveReady);
      expect(success).toBe(true);
      expect(executeMoveMock).toHaveBeenCalledWith('e7', 'e8', 'q');
      expect(onMoveReady).toHaveBeenCalledWith({ from: 'e7', to: 'e8', promotion: 'q' });
      expect(selection.pendingPromotion.value).toBeNull();
      expect(selection.selectedSquare.value).toBeNull();
    });

    it('returns false when completePromotion called without pending promotion', () => {
      const selection = useBoardSelection(createOptions());
      const success = selection.completePromotion('q');
      expect(success).toBe(false);
      expect(executeMoveMock).not.toHaveBeenCalled();
    });

    it('cancels promotion cleanly with cancelPromotion', () => {
      boardMap.set('e7', { color: 'w', type: 'p' });
      legalMovesMap.set('e7', ['e8']);

      const selection = useBoardSelection(createOptions());
      selection.handleSquareClick('e7');
      selection.handleSquareClick('e8');
      expect(selection.pendingPromotion.value).not.toBeNull();

      selection.cancelPromotion();
      expect(selection.pendingPromotion.value).toBeNull();
      expect(selection.selectedSquare.value).toBeNull();
      expect(selection.legalMovesForSelected.value).toEqual([]);
    });

    it('sets pending promotion and selected square directly with requestPromotion', () => {
      const selection = useBoardSelection(createOptions());

      selection.requestPromotion('e7', 'e8');

      expect(selection.selectedSquare.value).toBe('e7');
      expect(selection.pendingPromotion.value).toEqual({ from: 'e7', to: 'e8' });
    });
  });

  describe('clearSelection helper', () => {
    it('manually clears selected square and legal moves', () => {
      boardMap.set('e2', { color: 'w', type: 'p' });
      legalMovesMap.set('e2', ['e4']);

      const selection = useBoardSelection(createOptions());
      selection.handleSquareClick('e2');
      expect(selection.selectedSquare.value).toBe('e2');

      selection.clearSelection();
      expect(selection.selectedSquare.value).toBeNull();
      expect(selection.legalMovesForSelected.value).toEqual([]);
    });
  });
});
