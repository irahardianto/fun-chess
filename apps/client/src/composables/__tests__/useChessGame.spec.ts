import { describe, it, expect, beforeEach } from 'vitest';
import { useChessGame } from '../useChessGame';

describe('useChessGame composable', () => {
  let game: ReturnType<typeof useChessGame>;

  beforeEach(() => {
    game = useChessGame();
  });

  it('should initialize with standard starting position and White turn', () => {
    expect(game.fen.value).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(game.turn.value).toBe('w');
    expect(game.orientation.value).toBe('w');
    expect(game.selectedSquare.value).toBeNull();
    expect(game.isCheck.value).toBe(false);
    expect(game.isGameOver.value).toBe(false);
  });

  it('should select player piece and calculate legal moves', () => {
    game.selectSquare('e2');

    expect(game.selectedSquare.value).toBe('e2');
    expect(game.legalMovesForSelected.value).toEqual(expect.arrayContaining(['e3', 'e4']));
  });

  it('should not select opponent piece when not their turn', () => {
    game.selectSquare('e7'); // Black pawn on White turn

    expect(game.selectedSquare.value).toBeNull();
    expect(game.legalMovesForSelected.value).toEqual([]);
  });

  it('should apply legal move and advance turn to Black', () => {
    game.selectSquare('e2');
    game.selectSquare('e4');

    expect(game.turn.value).toBe('b');
    expect(game.fen.value).toContain('4P3');
    expect(game.lastMove.value).toEqual({ from: 'e2', to: 'e4' });
    expect(game.selectedSquare.value).toBeNull();
  });

  it('should detect pawn promotion moves', () => {
    // Setup board where white pawn is on 7th rank ready to promote
    const promoGame = useChessGame('8/P7/8/8/8/8/8/k6K w - - 0 1');

    expect(promoGame.isPromotionMove('a7', 'a8')).toBe(true);

    promoGame.selectSquare('a7');
    promoGame.selectSquare('a8');

    // Sets pendingPromotion
    expect(promoGame.pendingPromotion.value).toEqual({ from: 'a7', to: 'a8' });

    // Apply promotion to Queen
    const success = promoGame.applyLocalMove('a7', 'a8', 'q');
    expect(success).toBe(true);
    expect(promoGame.fen.value).toContain('Q');
    expect(promoGame.pendingPromotion.value).toBeNull();
  });

  it('should flip board orientation', () => {
    expect(game.orientation.value).toBe('w');
    game.flipBoard();
    expect(game.orientation.value).toBe('b');
    game.flipBoard();
    expect(game.orientation.value).toBe('w');
  });

  it('should synchronize state from server', () => {
    const serverFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
    game.syncGameState({
      fen: serverFen,
      turn: 'w',
      isCheck: false,
      isCheckmate: false,
      isDraw: false,
      isStalemate: false,
      isThreefoldRepetition: false,
      isInsufficientMaterial: false,
      isFiftyMoveRule: false,
      moveHistory: [],
      capturedWhite: ['p'],
      capturedBlack: ['p'],
      materialAdvantage: { white: 0, black: 0 },
      lastMove: { from: 'e7', to: 'e5' },
      moveCount: 2,
    });

    expect(game.fen.value).toBe(serverFen);
    expect(game.capturedWhite.value).toEqual(['p']);
    expect(game.capturedBlack.value).toEqual(['p']);
  });
});
