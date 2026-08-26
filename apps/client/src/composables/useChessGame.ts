/**
 * Client-side Chess game state and rules engine composable.
 * Uses chess.js for optimistic moves, legal move calculation, and local validation.
 */
import { ref, computed } from 'vue';
import { Chess } from 'chess.js';
import type {
  PieceColor,
  PieceType,
  Square,
  GameState,
  MoveResult,
} from '@fun-chess/shared';

const PIECE_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function useChessGame(initialFen?: string) {
  const chess = new Chess(initialFen);

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

  const selectedSquare = ref<Square | null>(null);
  const legalMovesForSelected = ref<Square[]>([]);
  const legalMoves = computed(() => legalMovesForSelected.value);
  const pendingPromotion = ref<{ from: Square; to: Square } | null>(null);

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
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === checkedColor) {
          return piece.square as Square;
        }
      }
    }
    return null;
  });

  function calculateCapturedAndMaterial(): void {
    const startingCounts: Record<PieceColor, Record<PieceType, number>> = {
      w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
      b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    };

    const board = chess.board();
    const currentCounts: Record<PieceColor, Record<PieceType, number>> = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    };

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          currentCounts[piece.color][piece.type]++;
        }
      }
    }

    const whiteCap: PieceType[] = [];
    const blackCap: PieceType[] = [];
    let whiteScore = 0;
    let blackScore = 0;

    (['p', 'n', 'b', 'r', 'q'] as PieceType[]).forEach((type) => {
      const whiteLost = Math.max(0, startingCounts.w[type] - currentCounts.w[type]);
      for (let i = 0; i < whiteLost; i++) {
        whiteCap.push(type);
      }

      const blackLost = Math.max(0, startingCounts.b[type] - currentCounts.b[type]);
      for (let i = 0; i < blackLost; i++) {
        blackCap.push(type);
      }

      whiteScore += currentCounts.w[type] * PIECE_VALUES[type];
      blackScore += currentCounts.b[type] * PIECE_VALUES[type];
    });

    capturedWhite.value = whiteCap;
    capturedBlack.value = blackCap;

    if (whiteScore > blackScore) {
      materialAdvantage.value = { white: whiteScore - blackScore, black: 0 };
    } else if (blackScore > whiteScore) {
      materialAdvantage.value = { white: 0, black: blackScore - whiteScore };
    } else {
      materialAdvantage.value = { white: 0, black: 0 };
    }
  }

  function updateLocalState(): void {
    fen.value = chess.fen();
    turn.value = chess.turn() as PieceColor;
    isCheck.value = chess.inCheck();
    isCheckmate.value = chess.isCheckmate();
    isDraw.value = chess.isDraw();
    isStalemate.value = chess.isStalemate();
    isGameOver.value = chess.isGameOver();
    calculateCapturedAndMaterial();
  }

  function getSquarePiece(square: Square): { type: PieceType; color: PieceColor } | null {
    const piece = chess.get(square as unknown as import('chess.js').Square);
    if (!piece) return null;
    return {
      type: piece.type as PieceType,
      color: piece.color as PieceColor,
    };
  }

  function getLegalMoves(square: Square): Square[] {
    const moves = chess.moves({ square: square as unknown as import('chess.js').Square, verbose: true });
    return moves.map((m) => m.to as Square);
  }

  function isLegalTarget(square: Square): boolean {
    return legalMovesForSelected.value.includes(square);
  }

  function isCapturableTarget(square: Square): boolean {
    if (!isLegalTarget(square)) return false;
    const targetPiece = getSquarePiece(square);
    if (targetPiece && targetPiece.color !== turn.value) return true;

    // Check en passant
    if (selectedSquare.value) {
      const srcPiece = getSquarePiece(selectedSquare.value);
      if (srcPiece?.type === 'p') {
        const fileDiff = Math.abs(selectedSquare.value.charCodeAt(0) - square.charCodeAt(0));
        if (fileDiff === 1 && !targetPiece) {
          return true;
        }
      }
    }
    return false;
  }

  function isPromotionMove(from: Square, to: Square): boolean {
    const piece = getSquarePiece(from);
    if (!piece || piece.type !== 'p') return false;
    const toRank = to.charAt(1);
    return (piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1');
  }

  function checkRequiresPromotion(from: Square, to: Square): boolean {
    return isPromotionMove(from, to);
  }

  function selectSquare(
    square: Square,
    onMoveReady?: (move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => void
  ): { moved: boolean; requiresPromotion: boolean } {
    // If a square is already selected and clicked square is a legal destination
    if (selectedSquare.value && isLegalTarget(square)) {
      const from = selectedSquare.value;
      const to = square;

      if (isPromotionMove(from, to)) {
        pendingPromotion.value = { from, to };
        return { moved: false, requiresPromotion: true };
      }

      // Execute normal move
      const moveSuccess = applyLocalMove(from, to);
      if (moveSuccess) {
        clearSelection();
        if (onMoveReady) {
          onMoveReady({ from, to });
        }
        return { moved: true, requiresPromotion: false };
      }
    }

    // Otherwise, select piece at square if it belongs to current player
    const piece = getSquarePiece(square);
    if (piece && piece.color === turn.value) {
      if (myColor.value && piece.color !== myColor.value) {
        clearSelection();
        return { moved: false, requiresPromotion: false };
      }
      selectedSquare.value = square;
      legalMovesForSelected.value = getLegalMoves(square);
      return { moved: false, requiresPromotion: false };
    }

    // Deselect if empty or invalid square
    clearSelection();
    return { moved: false, requiresPromotion: false };
  }

  function completePromotion(
    pieceType: 'q' | 'r' | 'b' | 'n',
    onMoveReady?: (move: { from: Square; to: Square; promotion: 'q' | 'r' | 'b' | 'n' }) => void
  ): boolean {
    if (!pendingPromotion.value) return false;
    const { from, to } = pendingPromotion.value;
    const success = applyLocalMove(from, to, pieceType);
    if (success) {
      if (onMoveReady) {
        onMoveReady({ from, to, promotion: pieceType });
      }
      pendingPromotion.value = null;
      clearSelection();
      return true;
    }
    pendingPromotion.value = null;
    clearSelection();
    return false;
  }

  function cancelPromotion(): void {
    pendingPromotion.value = null;
    clearSelection();
  }

  function clearSelection(): void {
    selectedSquare.value = null;
    legalMovesForSelected.value = [];
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
      pendingPromotion.value = null;

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
      clearSelection();
      updateLocalState();
      return true;
    } catch {
      return false;
    }
  }

  function syncGameState(state: GameState): void {
    try {
      chess.load(state.fen);
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
      clearSelection();
    } catch {
      updateLocalState();
    }
  }

  function resetGame(customFen?: string): void {
    if (customFen) {
      chess.load(customFen);
    } else {
      chess.reset();
    }
    moveHistory.value = [];
    lastMove.value = null;
    pendingPromotion.value = null;
    clearSelection();
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
    selectedSquare,
    legalMoves,
    legalMovesForSelected,
    pendingPromotion,
    capturedWhite,
    capturedBlack,
    materialAdvantage,
    kingInCheckSquare,
    getSquarePiece,
    getLegalMoves,
    isLegalTarget,
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
