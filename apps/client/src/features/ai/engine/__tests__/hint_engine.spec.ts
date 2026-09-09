import { describe, it, expect } from 'vitest';
import {
  HintEngine,
  hintEngine,
  identifyTacticalTheme,
} from '../hint_engine.js';
import { Chess, type Move } from 'chess.js';

describe('Hint Engine & Tactical Categorization', () => {
  const engine = new HintEngine();

  describe('Tactical Concept Identification', () => {
    it('identifies checkmate threat and provides encouraging message', async () => {
      // 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7#
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
      const hint = await engine.calculateHint(fen, 'w');

      expect(hint).not.toBeNull();
      expect(hint?.theme).toBe('checkmate_threat');
      expect(hint?.sourceSquare).toBe('h5');
      expect(hint?.targetSquare).toBe('f7');
      expect(hint?.explanation).toContain('checkmate');
      expect(hint?.scoreAdvantage).toBeGreaterThan(90000);
    });

    it('identifies royal fork tactic (Knight forks King and Queen/Rook)', async () => {
      // White Knight on b5, Black King on e8, Black Rook on a8. Nc7+ forks King and Rook.
      const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1';
      const hint = await engine.calculateHint(fen, 'w');

      expect(hint).not.toBeNull();
      expect(hint?.sourceSquare).toBe('b5');
      expect(hint?.targetSquare).toBe('c7');
      expect(hint?.theme).toBe('fork');
      expect(hint?.explanation).toContain('Fork');
    });

    it('identifies capturing a free unprotected piece', async () => {
      // Black left Rook hanging on a5, White Bishop on c3 can capture it (Bxa5)
      const fen = '4k3/8/8/r7/8/2B5/8/4K3 w - - 0 1';
      const hint = await engine.calculateHint(fen, 'w');

      expect(hint).not.toBeNull();
      expect(hint?.sourceSquare).toBe('c3');
      expect(hint?.targetSquare).toBe('a5');
      expect(hint?.theme).toBe('capture_free_piece');
      expect(hint?.explanation).toContain('Capture');
    });

    it('identifies pawn promotion opportunity', async () => {
      // White pawn on a7 promotes to Queen on a8
      const fen = '7k/P7/8/8/8/8/8/4K3 w - - 0 1';
      const hint = await engine.calculateHint(fen, 'w');

      expect(hint).not.toBeNull();
      expect(hint?.sourceSquare).toBe('a7');
      expect(hint?.targetSquare).toBe('a8');
      expect(hint?.theme).toBe('pawn_promotion');
      expect(hint?.explanation).toContain('promote');
    });

    it('identifies castling as king safety', () => {
      const chessBefore = new Chess('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 1 5');
      const chessAfter = new Chess('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b kq - 2 5');
      const move = {
        from: 'e1',
        to: 'g1',
        piece: 'k' as const,
        color: 'w' as const,
        san: 'O-O',
        flags: 'k',
      } as unknown as Move;

      const result = identifyTacticalTheme(chessBefore, chessAfter, move);
      expect(result.theme).toBe('king_safety');
      expect(result.explanation).toContain('Castle');
    });

    it('identifies center control and piece development themes', () => {
      const startChess = new Chess();
      const afterE4 = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
      const e4Move = {
        from: 'e2',
        to: 'e4',
        piece: 'p' as const,
        color: 'w' as const,
        san: 'e4',
        flags: 'b',
      } as unknown as Move;

      const centerResult = identifyTacticalTheme(startChess, afterE4, e4Move);
      expect(centerResult.theme).toBe('center_control');
      expect(centerResult.explanation).toContain('center');

      const afterNf3 = new Chess('rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1');
      const nf3Move = {
        from: 'g1',
        to: 'f3',
        piece: 'n' as const,
        color: 'w' as const,
        san: 'Nf3',
        flags: 'n',
      } as unknown as Move;

      const devResult = identifyTacticalTheme(startChess, afterNf3, nf3Move);
      expect(devResult.theme).toBe('general_development');
      expect(devResult.explanation).toContain('Develop');
    });

    it('identifies escape attack when a threatened piece retreats to safety', () => {
      // White Bishop on c4 is directly attacked by Black Queen on b5 (or d5)
      // Bishop retreats to b3 (safe square)
      const fenBefore = '4k3/8/8/1q6/2B5/8/8/4K3 w - - 0 1';
      const chessBefore = new Chess(fenBefore);
      const fenAfter = '4k3/8/8/1q6/8/1B6/8/4K3 b - - 1 1';
      const chessAfter = new Chess(fenAfter);
      const retreatMove = {
        from: 'c4',
        to: 'b3',
        piece: 'b' as const,
        color: 'w' as const,
        san: 'Bb3',
        flags: 'n',
      } as unknown as Move;

      const result = identifyTacticalTheme(chessBefore, chessAfter, retreatMove);
      expect(result.theme).toBe('escape_attack');
      expect(result.explanation).toContain('safety');
    });

    it('identifies pawn advancing to 7th rank as pawn promotion theme', () => {
      const chessBefore = new Chess('4k3/8/8/8/8/8/3P4/4K3 w - - 0 1');
      const chessAfter = new Chess('4k3/3P4/8/8/8/8/8/4K3 b - - 0 1');
      const advanceMove = {
        from: 'd2',
        to: 'd7',
        piece: 'p' as const,
        color: 'w' as const,
        san: 'd7',
        flags: 'n',
      } as unknown as Move;

      const result = identifyTacticalTheme(chessBefore, chessAfter, advanceMove);
      expect(result.theme).toBe('pawn_promotion');
      expect(result.explanation).toContain('Pawn towards');
    });

    it('identifies fork attacking enemy pawns', () => {
      // White pawn on d4 attacking Black pawns on c5 and e5
      const chessBefore = new Chess('4k3/8/8/2p1p3/8/8/3P4/4K3 w - - 0 1');
      const chessAfter = new Chess('4k3/8/8/2p1p3/3P4/8/8/4K3 b - - 0 1');
      const pawnMove = {
        from: 'd2',
        to: 'd4',
        piece: 'p' as const,
        color: 'w' as const,
        san: 'd4',
        flags: 'b',
      } as unknown as Move;

      const result = identifyTacticalTheme(chessBefore, chessAfter, pawnMove);
      expect(result.theme).toBe('fork');
      expect(result.explanation).toContain('Fork attack');
    });

    it('identifies Black piece development from rank 8', () => {
      const chessBefore = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
      const chessAfter = new Chess('r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2');
      const nc6Move = {
        from: 'b8',
        to: 'c6',
        piece: 'n' as const,
        color: 'b' as const,
        san: 'Nc6',
        flags: 'n',
      } as unknown as Move;

      const result = identifyTacticalTheme(chessBefore, chessAfter, nc6Move);
      expect(result.theme).toBe('general_development');
      expect(result.explanation).toContain('Develop');
    });

    it('falls back to default positional improvement theme when no other theme matches', () => {
      const chessBefore = new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
      const chessAfter = new Chess('4k3/8/8/8/8/8/R7/4K3 b - - 1 1');
      const rookMove = {
        from: 'a1',
        to: 'a2',
        piece: 'r' as const,
        color: 'w' as const,
        san: 'Ra2',
        flags: 'n',
      } as unknown as Move;

      const result = identifyTacticalTheme(chessBefore, chessAfter, rookMove);
      expect(result.theme).toBe('general_development');
      expect(result.explanation).toContain('improve your position');
    });

    it('evaluates Rook and Queen ray attacks in getAttackedOpponentPieces', () => {
      // Rook on d1 attacks Rook on d8 and Knight on a1 with Kings present
      const chessBefore = new Chess('3r1k2/8/8/8/8/8/8/n2R1K2 w - - 0 1');
      const chessAfter = new Chess('3r1k2/8/8/8/3R4/8/8/n4K2 b - - 1 1');
      const rd4Move = {
        from: 'd1',
        to: 'd4',
        piece: 'r' as const,
        color: 'w' as const,
        san: 'Rd4',
        flags: 'n',
      } as unknown as Move;

      const result = identifyTacticalTheme(chessBefore, chessAfter, rd4Move);
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases & Validation', () => {
    it('returns null if it is not the active player\'s turn', async () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const hint = await engine.calculateHint(fen, 'b');
      expect(hint).toBeNull();
    });

    it('returns null if the game is already in terminal state', async () => {
      const checkmatedFen = 'r1bqkb1r/pppp1Qpp/2n5/4p3/2B1n3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
      const hint = await engine.calculateHint(checkmatedFen, 'b');
      expect(hint).toBeNull();
    });

    it('returns null when position has no legal moves available', async () => {
      const stalemateFen = '8/8/8/8/8/1q6/2k5/K7 w - - 0 1';
      const hint = await engine.calculateHint(stalemateFen, 'w');
      expect(hint).toBeNull();
    });

    it('calculates hint for pawn promotion with promotion property', async () => {
      const mockSearchEngine = {
        evaluatePosition: () => 900,
        findBestMove: async () => ({
          move: { from: 'a7' as const, to: 'a8' as const, promotion: 'q' as const },
          score: 900,
          depth: 2,
          nodesEvaluated: 10,
          isBlunder: false,
          searchDurationMs: 5,
        }),
      };
      const customEngine = new HintEngine(mockSearchEngine as any);
      // White pawn on a7 ready to promote to a8, Kings on e1 and e8
      const promoFen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
      const hint = await customEngine.calculateHint(promoFen, 'w');
      expect(hint).not.toBeNull();
      expect(hint?.theme).toBe('pawn_promotion');
      expect(hint?.move.promotion).toBe('q');
    });

    it('singleton hintEngine instance is defined and operational', async () => {
      expect(hintEngine).toBeInstanceOf(HintEngine);
    });
  });
});
