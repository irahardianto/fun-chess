import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAiGame } from '../useAiGame';
import { minimaxEngine, hintEngine } from '../../engine/index';
import type { AiMoveEvaluation, HintRecommendation } from '@fun-chess/shared';

// Mock audio & confetti to avoid web audio/canvas dependencies
vi.mock('../../../composables/useAudio', () => ({
  useAudio: () => ({
    playMove: vi.fn(),
    playCapture: vi.fn(),
    playCheck: vi.fn(),
    playVictory: vi.fn(),
    playDraw: vi.fn(),
    playError: vi.fn(),
    playClick: vi.fn(),
    playStart: vi.fn(),
  }),
}));

vi.mock('../../../composables/useConfetti', () => ({
  useConfetti: () => ({
    celebrate: vi.fn(),
    celebrateVictory: vi.fn(),
    celebrateDraw: vi.fn(),
  }),
}));

describe('useAiGame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization & Game Lifecycle', () => {
    it('initializes with default settings (Peanut the Pup, White, starting FEN)', () => {
      const game = useAiGame({ autoStart: false });

      expect(game.mascot.value.id).toBe('peanut');
      expect(game.playerColor.value).toBe('w');
      expect(game.aiColor.value).toBe('b');
      expect(game.turn.value).toBe('w');
      expect(game.isPlayerTurn.value).toBe(true);
      expect(game.isAiThinking.value).toBe(false);
      expect(game.isGameOver.value).toBe(false);
      expect(game.moveHistory.value).toEqual([]);
      expect(game.takebackStack.value).toEqual([]);
      expect(game.takebackCount.value).toBe(0);
      expect(game.hintsCount.value).toBe(0);
      expect(game.activeHint.value).toBeNull();
      expect(game.lastMove.value).toBeNull();
      expect(game.fen.value).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    });

    it('initializes with custom mascot and player color', () => {
      const game = useAiGame({
        mascotId: 'owl',
        playerColor: 'w',
        autoStart: false,
      });

      expect(game.mascot.value.id).toBe('owl');
      expect(game.mascot.value.name).toBe('Grandmaster Owl');
      expect(game.playerColor.value).toBe('w');
    });

    it('triggers AI opening move when player is Black', async () => {
      const mockEvaluation: AiMoveEvaluation = {
        move: { from: 'e2', to: 'e4' },
        score: 25,
        depth: 1,
        nodesEvaluated: 20,
        isBlunder: false,
        searchDurationMs: 15,
      };

      vi.spyOn(minimaxEngine, 'findBestMove').mockResolvedValue(mockEvaluation);

      const game = useAiGame({
        mascotId: 'peanut',
        playerColor: 'b',
        autoStart: true,
      });

      expect(game.playerColor.value).toBe('b');
      expect(game.aiColor.value).toBe('w');

      // Wait for AI move promise to resolve
      await vi.waitFor(() => {
        expect(game.moveHistory.value.length).toBe(1);
      });

      expect(game.lastMove.value).toEqual({ from: 'e2', to: 'e4' });
      expect(game.turn.value).toBe('b');
      expect(game.isPlayerTurn.value).toBe(true);
    });

    it('flips board orientation', () => {
      const game = useAiGame({ autoStart: false });
      expect(game.orientation.value).toBe('w');

      game.flipBoard();
      expect(game.orientation.value).toBe('b');

      game.flipBoard();
      expect(game.orientation.value).toBe('w');
    });

    it('resigns the match cleanly with GameOverPayload', () => {
      const game = useAiGame({ autoStart: false });
      expect(game.isGameOver.value).toBe(false);

      game.resign();

      expect(game.isGameOver.value).toBe(true);
      expect(game.lastGameOver.value).toBeDefined();
      expect(game.lastGameOver.value?.winner).toBe('b');
      expect(game.lastGameOver.value?.reason).toBe('resignation');
      expect(game.lastGameOver.value?.winnerName).toBe('Peanut the Pup');
    });

    it('restarts game via startNewGame with optional new mascot and color', async () => {
      const game = useAiGame({ mascotId: 'peanut', playerColor: 'w', autoStart: false });

      game.applyPlayerMove('e2', 'e4');
      expect(game.moveHistory.value.length).toBe(1);

      game.startNewGame('fox', 'w');

      expect(game.mascot.value.id).toBe('fox');
      expect(game.moveHistory.value.length).toBe(0);
      expect(game.takebackStack.value.length).toBe(0);
      expect(game.takebackCount.value).toBe(0);
      expect(game.isGameOver.value).toBe(false);
      expect(game.lastGameOver.value).toBeNull();
      expect(game.fen.value).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    });
  });

  describe('Player Moves & AI Response Dispatch', () => {
    it('applies player move, updates state, and dispatches AI response', async () => {
      const mockAiEval: AiMoveEvaluation = {
        move: { from: 'e7', to: 'e5' },
        score: 0,
        depth: 1,
        nodesEvaluated: 15,
        isBlunder: false,
        searchDurationMs: 10,
      };
      vi.spyOn(minimaxEngine, 'findBestMove').mockResolvedValue(mockAiEval);

      const game = useAiGame({ autoStart: false });

      const moved = game.applyPlayerMove('e2', 'e4');
      expect(moved).toBe(true);
      expect(game.moveHistory.value.length).toBe(1);
      expect(game.moveHistory.value[0]?.san).toBe('e4');
      expect(game.takebackStack.value.length).toBe(1);

      // Wait for AI reply
      await vi.waitFor(() => {
        expect(game.moveHistory.value.length).toBe(2);
      });

      expect(game.moveHistory.value[1]?.san).toBe('e5');
      expect(game.turn.value).toBe('w');
      expect(game.isPlayerTurn.value).toBe(true);
    });

    it('rejects invalid or illegal player moves', () => {
      const game = useAiGame({ autoStart: false });

      // Illegal move (e2 to e6 is not legal)
      const moved = game.applyPlayerMove('e2', 'e6');
      expect(moved).toBe(false);
      expect(game.moveHistory.value.length).toBe(0);
      expect(game.takebackStack.value.length).toBe(0);
    });

    it('handles piece selection and target move execution via selectSquare', async () => {
      const mockAiEval: AiMoveEvaluation = {
        move: { from: 'd7', to: 'd5' },
        score: 0,
        depth: 1,
        nodesEvaluated: 15,
        isBlunder: false,
        searchDurationMs: 10,
      };
      vi.spyOn(minimaxEngine, 'findBestMove').mockResolvedValue(mockAiEval);

      const game = useAiGame({ autoStart: false });

      // 1. Select friendly pawn on d2
      const step1 = game.selectSquare('d2');
      expect(step1.moved).toBe(false);
      expect(step1.requiresPromotion).toBe(false);
      expect(game.selectedSquare.value).toBe('d2');
      expect(game.legalMoves.value).toContain('d3');
      expect(game.legalMoves.value).toContain('d4');

      // 2. Click destination d4
      const step2 = game.selectSquare('d4');
      expect(step2.moved).toBe(true);
      expect(game.selectedSquare.value).toBeNull();
      expect(game.moveHistory.value[0]?.san).toBe('d4');

      await vi.waitFor(() => {
        expect(game.moveHistory.value.length).toBe(2);
      });
    });

    it('handles pawn promotion workflow', () => {
      // Board position where White pawn is on e7 about to promote
      const promoFen = '8/4P3/8/8/8/8/8/4K2k w - - 0 1';
      const game = useAiGame({ initialFen: promoFen, autoStart: false });

      // Select pawn on e7
      game.selectSquare('e7');
      expect(game.selectedSquare.value).toBe('e7');

      // Click e8 -> triggers promotion required
      const step = game.selectSquare('e8');
      expect(step.requiresPromotion).toBe(true);
      expect(game.pendingPromotion.value).toEqual({ from: 'e7', to: 'e8' });

      // Complete promotion with Queen
      const completed = game.completePromotion('q');
      expect(completed).toBe(true);
      expect(game.pendingPromotion.value).toBeNull();
      expect(game.moveHistory.value[0]?.san).toBe('e8=Q');
    });

    it('allows canceling pending promotion', () => {
      const promoFen = '8/4P3/8/8/8/8/8/4K2k w - - 0 1';
      const game = useAiGame({ initialFen: promoFen, autoStart: false });

      game.selectSquare('e7');
      game.selectSquare('e8');
      expect(game.pendingPromotion.value).not.toBeNull();

      game.cancelPromotion();
      expect(game.pendingPromotion.value).toBeNull();
      expect(game.selectedSquare.value).toBeNull();
    });

    it('detects checkmate and sets GameOverPayload on player victory', () => {
      // Scholar's Mate setup position: White Q on h5, B on c4, Black king on e8
      const scholarsFen = 'r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1';
      const game = useAiGame({ initialFen: scholarsFen, autoStart: false });

      const moved = game.applyPlayerMove('h5', 'f7');
      expect(moved).toBe(true);
      expect(game.isCheckmate.value).toBe(true);
      expect(game.isGameOver.value).toBe(true);

      expect(game.lastGameOver.value).toBeDefined();
      expect(game.lastGameOver.value?.winner).toBe('w');
      expect(game.lastGameOver.value?.winnerName).toBe('You');
      expect(game.lastGameOver.value?.reason).toBe('checkmate');
    });
  });

  describe('Takeback / Undo Stack Mechanics', () => {
    it('rewinds move history and board position on takeback', async () => {
      const mockAiEval: AiMoveEvaluation = {
        move: { from: 'e7', to: 'e5' },
        score: 0,
        depth: 1,
        nodesEvaluated: 10,
        isBlunder: false,
        searchDurationMs: 10,
      };
      vi.spyOn(minimaxEngine, 'findBestMove').mockResolvedValue(mockAiEval);

      const game = useAiGame({ autoStart: false });
      const initialFen = game.fen.value;

      // Player plays e2-e4
      game.applyPlayerMove('e2', 'e4');
      await vi.waitFor(() => {
        expect(game.moveHistory.value.length).toBe(2);
      });

      expect(game.canTakeback.value).toBe(true);
      expect(game.takebackCount.value).toBe(0);

      // Perform takeback
      const success = game.takeback();
      expect(success).toBe(true);
      expect(game.takebackCount.value).toBe(1);
      expect(game.fen.value).toBe(initialFen);
      expect(game.moveHistory.value).toEqual([]);
      expect(game.turn.value).toBe('w');
      expect(game.isPlayerTurn.value).toBe(true);
    });

    it('returns false when takeback is attempted on empty stack', () => {
      const game = useAiGame({ autoStart: false });
      expect(game.canTakeback.value).toBe(false);
      expect(game.takeback()).toBe(false);
    });

    it('supports multiple sequential takebacks (unlimited takeback)', async () => {
      let mockMoveCount = 0;
      vi.spyOn(minimaxEngine, 'findBestMove').mockImplementation(async () => {
        mockMoveCount++;
        return {
          move: mockMoveCount === 1 ? { from: 'e7', to: 'e5' } : { from: 'b8', to: 'c6' },
          score: 0,
          depth: 1,
          nodesEvaluated: 10,
          isBlunder: false,
          searchDurationMs: 10,
        };
      });

      const game = useAiGame({ autoStart: false });

      // Move 1
      game.applyPlayerMove('e2', 'e4');
      await vi.waitFor(() => expect(game.moveHistory.value.length).toBe(2));

      // Move 2
      game.applyPlayerMove('g1', 'f3');
      await vi.waitFor(() => expect(game.moveHistory.value.length).toBe(4));

      expect(game.takebackStack.value.length).toBe(2);

      // Takeback Move 2
      expect(game.takeback()).toBe(true);
      expect(game.moveHistory.value.length).toBe(2);

      // Takeback Move 1
      expect(game.takeback()).toBe(true);
      expect(game.moveHistory.value.length).toBe(0);
      expect(game.takebackStack.value.length).toBe(0);
    });
  });

  describe('Smart Hint Calculation', () => {
    it('calculates pedagogical hint and updates activeHint and hintsCount', async () => {
      const mockHint: HintRecommendation = {
        move: { from: 'e2', to: 'e4' },
        sourceSquare: 'e2',
        targetSquare: 'e4',
        explanation: 'Advance your pawn to control the center! 💡',
        theme: 'center_control',
        scoreAdvantage: 30,
      };

      vi.spyOn(hintEngine, 'calculateHint').mockResolvedValue(mockHint);

      const game = useAiGame({ autoStart: false });
      expect(game.canAskHint.value).toBe(true);

      const result = await game.askForHint();

      expect(result).toEqual(mockHint);
      expect(game.activeHint.value).toEqual(mockHint);
      expect(game.hintsCount.value).toBe(1);
    });

    it('clears active hint via clearHint', async () => {
      const mockHint: HintRecommendation = {
        move: { from: 'd2', to: 'd4' },
        sourceSquare: 'd2',
        targetSquare: 'd4',
        explanation: 'Control the center!',
        theme: 'center_control',
        scoreAdvantage: 20,
      };
      vi.spyOn(hintEngine, 'calculateHint').mockResolvedValue(mockHint);

      const game = useAiGame({ autoStart: false });
      await game.askForHint();
      expect(game.activeHint.value).not.toBeNull();

      game.clearHint();
      expect(game.activeHint.value).toBeNull();
    });

    it('clears active hint automatically when player makes a move', async () => {
      const mockHint: HintRecommendation = {
        move: { from: 'e2', to: 'e4' },
        sourceSquare: 'e2',
        targetSquare: 'e4',
        explanation: 'Good center move!',
        theme: 'center_control',
        scoreAdvantage: 20,
      };
      vi.spyOn(hintEngine, 'calculateHint').mockResolvedValue(mockHint);
      vi.spyOn(minimaxEngine, 'findBestMove').mockResolvedValue({
        move: { from: 'e7', to: 'e5' },
        score: 0,
        depth: 1,
        nodesEvaluated: 10,
        isBlunder: false,
        searchDurationMs: 10,
      });

      const game = useAiGame({ autoStart: false });
      await game.askForHint();
      expect(game.activeHint.value).not.toBeNull();

      game.applyPlayerMove('e2', 'e4');
      expect(game.activeHint.value).toBeNull();
    });

    it('does not calculate hint when game is over', async () => {
      const game = useAiGame({ autoStart: false });
      game.resign();

      expect(game.canAskHint.value).toBe(false);
      const hint = await game.askForHint();
      expect(hint).toBeNull();
    });
  });
});
