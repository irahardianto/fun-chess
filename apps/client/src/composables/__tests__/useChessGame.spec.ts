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

  it('safely handles corrupted initial FEN without crashing', () => {
    const safeGame = useChessGame('invalid-corrupt-fen');
    expect(safeGame.fen.value).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(safeGame.turn.value).toBe('w');
  });

  it('safely handles reset with corrupted FEN without crashing', () => {
    game.resetGame('invalid-corrupt-fen');
    expect(game.fen.value).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('manages isMyTurn and playerColor accurately', () => {
    expect(game.isMyTurn.value).toBe(true); // myColor is null -> always true
    game.setPlayerColor('w');
    expect(game.isMyTurn.value).toBe(true); // turn is 'w'
    game.setPlayerColor('b');
    expect(game.isMyTurn.value).toBe(false); // turn is 'w', myColor is 'b'
  });

  it('evaluates isCapturableTarget for normal captures and non-targets', () => {
    // Starting board: White e2 pawn selected
    game.selectSquare('e2');
    expect(game.isCapturableTarget('e4')).toBe(false); // Legal move, but empty square
    expect(game.isCapturableTarget('e7')).toBe(false); // Illegal target

    // Setup board with an immediately capturable piece
    const captureGame = useChessGame('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2');
    captureGame.selectSquare('e4');
    expect(captureGame.isCapturableTarget('d5')).toBe(true); // Black pawn
    expect(captureGame.isCapturableTarget('e5')).toBe(false); // Empty square
  });

  it('evaluates isCapturableTarget for en passant captures', () => {
    // Board with en passant opportunity: White pawn on e5, Black just played d7-d5
    const epGame = useChessGame('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2');
    epGame.selectSquare('e5');
    expect(epGame.isCapturableTarget('d6')).toBe(true); // en passant square
  });

  it('handles checkRequiresPromotion, completePromotion, and cancelPromotion', () => {
    const promoGame = useChessGame('8/4P3/8/8/8/8/8/k6K w - - 0 1');
    expect(promoGame.checkRequiresPromotion('e7', 'e8')).toBe(true);
    expect(promoGame.checkRequiresPromotion('e7', 'e6')).toBe(false);

    promoGame.selectSquare('e7');
    promoGame.selectSquare('e8');
    expect(promoGame.pendingPromotion.value).toEqual({ from: 'e7', to: 'e8' });

    let callbackFired = false;
    promoGame.completePromotion('q', (move) => {
      callbackFired = true;
      expect(move.promotion).toBe('q');
    });
    expect(callbackFired).toBe(true);

    // Cancel promotion
    promoGame.resetGame('8/4P3/8/8/8/8/8/k6K w - - 0 1');
    promoGame.selectSquare('e7');
    promoGame.selectSquare('e8');
    expect(promoGame.pendingPromotion.value).not.toBeNull();
    promoGame.cancelPromotion();
    expect(promoGame.pendingPromotion.value).toBeNull();
  });

  it('handles clearSelection and resetGame without arguments', () => {
    game.selectSquare('e2');
    expect(game.selectedSquare.value).toBe('e2');
    game.clearSelection();
    expect(game.selectedSquare.value).toBeNull();

    game.selectSquare('e2');
    game.selectSquare('e4');
    expect(game.moveHistory.value.length).toBe(1);
    game.resetGame();
    expect(game.moveHistory.value.length).toBe(0);
    expect(game.lastMove.value).toBeNull();
  });

  it('handles applyLocalMove invalid move returning false', () => {
    const success = game.applyLocalMove('e2', 'e5'); // Illegal pawn jump
    expect(success).toBe(false);
  });

  it('handles syncGameState with corrupted state gracefully', () => {
    // Corrupted FEN triggers catch and logs warning
    game.syncGameState({
      fen: 'not a valid fen string at all',
      turn: 'w',
      isCheck: false,
      isCheckmate: false,
      isDraw: false,
      isStalemate: false,
      isThreefoldRepetition: false,
      isInsufficientMaterial: false,
      isFiftyMoveRule: false,
      moveHistory: [],
      capturedWhite: [],
      capturedBlack: [],
      materialAdvantage: { white: 0, black: 0 },
      lastMove: null,
      moveCount: 0,
    });
    expect(game.fen.value).toBeDefined();
  });
});
