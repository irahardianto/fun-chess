import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { useChessBoard } from '../useChessBoard';

describe('useChessBoard composable', () => {
  it('initializes with default starting position', () => {
    const board = useChessBoard();

    expect(board.fen.value).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(board.turn.value).toBe('w');
    expect(board.orientation.value).toBe('w');
    expect(board.isCheck.value).toBe(false);
    expect(board.isCheckmate.value).toBe(false);
    expect(board.isDraw.value).toBe(false);
    expect(board.isStalemate.value).toBe(false);
    expect(board.isGameOver.value).toBe(false);
    expect(board.kingInCheckSquare.value).toBeNull();
    expect(board.materialAdvantage.value).toEqual({ white: 0, black: 0 });
    expect(board.capturedWhite.value).toEqual([]);
    expect(board.capturedBlack.value).toEqual([]);
  });

  it('initializes from a FEN string', () => {
    const customFen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const board = useChessBoard(customFen);

    expect(board.fen.value).toBe(customFen);
    expect(board.turn.value).toBe('w');
  });

  it('initializes from a Chess instance', () => {
    const chess = new Chess();
    chess.move('e4');
    const board = useChessBoard(chess);

    expect(board.turn.value).toBe('b');
    expect(board.chess).toBe(chess);
  });

  it('initializes with custom options (initialFen and orientation)', () => {
    const customFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const board = useChessBoard({
      initialFen: customFen,
      orientation: 'b',
    });

    expect(board.fen.value).toBe(customFen);
    expect(board.orientation.value).toBe('b');
  });

  it('toggles orientation when flipBoard is called', () => {
    const board = useChessBoard({ orientation: 'w' });
    expect(board.orientation.value).toBe('w');

    board.flipBoard();
    expect(board.orientation.value).toBe('b');

    board.flipBoard();
    expect(board.orientation.value).toBe('w');
  });

  it('inspects square piece via getSquarePiece correctly', () => {
    const board = useChessBoard();

    expect(board.getSquarePiece('e2')).toEqual({ type: 'p', color: 'w' });
    expect(board.getSquarePiece('e8')).toEqual({ type: 'k', color: 'b' });
    expect(board.getSquarePiece('e4')).toBeNull();
  });

  it('calculates legal moves via getLegalMoves', () => {
    const board = useChessBoard();

    const e2Moves = board.getLegalMoves('e2');
    expect(e2Moves).toContain('e3');
    expect(e2Moves).toContain('e4');

    const emptySquareMoves = board.getLegalMoves('e4');
    expect(emptySquareMoves).toEqual([]);
  });

  it('updates local state when moves are executed on the chess instance', () => {
    const board = useChessBoard();

    board.chess.move('e4');
    board.updateLocalState();

    expect(board.turn.value).toBe('b');
    expect(board.fen.value).toContain('4P3');
    expect(board.getSquarePiece('e4')).toEqual({ type: 'p', color: 'w' });
  });

  it('detects check and computes kingInCheckSquare correctly', () => {
    // Position: White king on e1 is in check by black queen on e2
    const checkFen = 'rnb1kbnr/pppp1ppp/8/8/8/8/PPPPqPPP/RNB1KBNR w KQkq - 0 1';
    const board = useChessBoard(checkFen);

    expect(board.isCheck.value).toBe(true);
    expect(board.kingInCheckSquare.value).toBe('e1');
  });

  it('detects checkmate and game over status', () => {
    // Scholar's mate checkmate position
    const checkmateFen = 'r1bqkb1r/pppp1Qpp/2n5/4p3/2B1n3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
    const board = useChessBoard(checkmateFen);

    expect(board.isCheck.value).toBe(true);
    expect(board.isCheckmate.value).toBe(true);
    expect(board.isGameOver.value).toBe(true);
    expect(board.kingInCheckSquare.value).toBe('e8');
  });

  it('detects stalemate condition', () => {
    // King and queen stalemate position: Black king in corner with no legal moves
    const stalemateFen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
    const board = useChessBoard(stalemateFen);

    expect(board.isStalemate.value).toBe(true);
    expect(board.isDraw.value).toBe(true);
    expect(board.isGameOver.value).toBe(true);
    expect(board.isCheck.value).toBe(false);
    expect(board.kingInCheckSquare.value).toBeNull();
  });

  it('computes captured pieces and material advantage correctly', () => {
    // Black is missing queen (d8) and knight (b8)
    const materialFen = 'r1b1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const board = useChessBoard(materialFen);

    expect(board.materialAdvantage.value.white).toBeGreaterThan(0);
    expect(board.capturedBlack.value).toContain('q');
    expect(board.capturedBlack.value).toContain('n');
  });
});
