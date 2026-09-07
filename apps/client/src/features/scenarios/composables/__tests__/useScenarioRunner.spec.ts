import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useScenarioRunner } from '../useScenarioRunner';
import type { ChessScenario } from '@fun-chess/shared';

// Mock useAudio
vi.mock('../../../composables/useAudio', () => ({
  useAudio: () => ({
    playMove: vi.fn(),
    playCapture: vi.fn(),
    playCheck: vi.fn(),
    playVictory: vi.fn(),
    playDraw: vi.fn(),
    playError: vi.fn(),
    playClick: vi.fn(),
    playPickup: vi.fn(),
  }),
}));

describe('useScenarioRunner', () => {
  const mockScenario: ChessScenario = {
    id: 'test-fork-lesson',
    title: 'The Royal Knight Fork',
    subtitle: 'Attack King and Queen together!',
    category: 'tactical_patterns',
    difficulty: 'beginner',
    targetAgeGroup: '7-10',
    icon: '♞',
    description: 'Learn how to fork two pieces with a Knight.',
    estimatedMinutes: 2,
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        instruction: 'Move your Knight to c7 to deliver a royal fork!',
        hint: 'Jump to c7!',
        setupFen: 'r1bqk2r/pppp1ppp/2n5/3N4/4P3/8/PPP2PPP/R1BQKBNR w KQkq - 0 1',
        highlightSquares: ['d5', 'c7'],
        allowedMoves: [{ from: 'd5', to: 'c7' }],
        explanationOnSuccess: 'Boom! King and Rook are forked!',
      },
      {
        id: 'step-2',
        stepNumber: 2,
        instruction: 'Capture the trapped Rook on a8!',
        hint: 'Take the Rook on a8 with your Knight.',
        setupFen: 'r2q1k1r/ppNp1ppp/2n5/8/4P3/8/PPP2PPP/R1BQKBNR w KQ - 0 1',
        allowedMoves: [{ from: 'c7', to: 'a8' }],
        opponentResponse: {
          from: 'd8',
          to: 'a8',
          delayMs: 300,
          dialogue: 'I take your knight!',
        },
        explanationOnSuccess: 'You won the Rook and gained a huge material advantage!',
      },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization & State', () => {
    it('initializes with loaded scenario and first step active', () => {
      const runner = useScenarioRunner(mockScenario);

      expect(runner.scenario.value?.id).toBe('test-fork-lesson');
      expect(runner.currentStepIndex.value).toBe(0);
      expect(runner.currentStep.value?.id).toBe('step-1');
      expect(runner.totalSteps.value).toBe(2);
      expect(runner.isCompleted.value).toBe(false);
      expect(runner.hintsUsedCurrentAttempt.value).toBe(0);
      expect(runner.mistakesCurrentAttempt.value).toBe(0);
      expect(runner.activeHint.value).toBeNull();
      expect(runner.isWaitingForBotResponse.value).toBe(false);
      expect(runner.currentFen.value).toBe(mockScenario.steps[0]?.setupFen);
      expect(runner.isMyTurn.value).toBe(true);
    });

    it('initializes gracefully when no initial scenario is provided', () => {
      const runner = useScenarioRunner();

      expect(runner.scenario.value).toBeNull();
      expect(runner.currentStep.value).toBeNull();
      expect(runner.totalSteps.value).toBe(0);
      expect(runner.isCompleted.value).toBe(false);
    });
  });

  describe('Move Validation & Step Progression', () => {
    it('applies valid player move, shows success explanation, and advances step', () => {
      const runner = useScenarioRunner(mockScenario);

      // Apply valid move (d5 -> c7)
      const success = runner.applyPlayerMove({ from: 'd5', to: 'c7' });
      expect(success).toBe(true);
      expect(runner.isStepSuccess.value).toBe(true);
      expect(runner.feedbackMessage.value).toBe('Boom! King and Rook are forked!');
      expect(runner.mistakesCurrentAttempt.value).toBe(0);

      // Advance delay (700ms)
      vi.advanceTimersByTime(700);

      expect(runner.currentStepIndex.value).toBe(1);
      expect(runner.currentStep.value?.id).toBe('step-2');
      expect(runner.isStepSuccess.value).toBe(false);
      expect(runner.feedbackMessage.value).toBeNull();
    });

    it('handles invalid player move with shake animation and mistake counter', () => {
      const runner = useScenarioRunner(mockScenario);

      // Wrong move attempted (d5 -> f6 instead of c7)
      const success = runner.applyPlayerMove({ from: 'd5', to: 'f6' });
      expect(success).toBe(false);
      expect(runner.isShaking.value).toBe(true);
      expect(runner.mistakesCurrentAttempt.value).toBe(1);
      expect(runner.feedbackMessage.value).toContain('Not quite!');
      expect(runner.currentStepIndex.value).toBe(0); // Step not advanced

      // Shake animation expires after 400ms
      vi.advanceTimersByTime(400);
      expect(runner.isShaking.value).toBe(false);
    });

    it('supports selecting square and clicking target square via selectSquare', () => {
      const runner = useScenarioRunner(mockScenario);

      // 1. Select knight on d5
      runner.selectSquare('d5');
      expect(runner.selectedSquare.value).toBe('d5');
      expect(runner.legalMoves.value.length).toBeGreaterThan(0);

      // 2. Click destination c7
      runner.selectSquare('c7');
      expect(runner.selectedSquare.value).toBeNull();
      expect(runner.isStepSuccess.value).toBe(true);
    });
  });

  describe('Automated Bot Counter-Move Response', () => {
    it('executes bot counter-move with delay on step 2 before completing scenario', () => {
      const runner = useScenarioRunner(mockScenario);

      // Pass step 1 (d5 -> c7)
      runner.applyPlayerMove({ from: 'd5', to: 'c7' });
      vi.advanceTimersByTime(700);
      expect(runner.currentStepIndex.value).toBe(1);

      // Play step 2 move (c7 -> a8)
      const success = runner.applyPlayerMove({ from: 'c7', to: 'a8' });
      expect(success).toBe(true);

      // Opponent response delay triggered (300ms)
      expect(runner.isWaitingForBotResponse.value).toBe(true);
      expect(runner.isMyTurn.value).toBe(false);

      // Advance bot response delay (300ms)
      vi.advanceTimersByTime(300);
      expect(runner.isWaitingForBotResponse.value).toBe(false);
      expect(runner.lastMove.value).toEqual({ from: 'd8', to: 'a8' });

      // Advance step completion transition (700ms)
      vi.advanceTimersByTime(700);
      expect(runner.isCompleted.value).toBe(true);
      expect(runner.calculatedStars.value).toBe(3); // 0 hints, 0 mistakes
    });
  });

  describe('Hints & Educational Guidance', () => {
    it('reveals step hint and highlights source & target squares', () => {
      const runner = useScenarioRunner(mockScenario);

      expect(runner.hintsUsedCurrentAttempt.value).toBe(0);
      expect(runner.activeHint.value).toBeNull();
      expect(runner.hintGlowSquare.value).toBeNull();

      runner.revealHint();

      expect(runner.hintsUsedCurrentAttempt.value).toBe(1);
      expect(runner.activeHint.value).toBe('Jump to c7!');
      expect(runner.hintGlowSquare.value).toBe('d5');
      expect(runner.hintTargetSquare.value).toBe('c7');
    });

    it('calculates 2 Stars when 1 hint was used during attempt', () => {
      const runner = useScenarioRunner(mockScenario);

      runner.revealHint();
      expect(runner.hintsUsedCurrentAttempt.value).toBe(1);

      // Complete step 1
      runner.applyPlayerMove({ from: 'd5', to: 'c7' });
      vi.advanceTimersByTime(700);

      // Complete step 2
      runner.applyPlayerMove({ from: 'c7', to: 'a8' });
      vi.advanceTimersByTime(1000); // 300ms bot + 700ms finish

      expect(runner.isCompleted.value).toBe(true);
      expect(runner.calculatedStars.value).toBe(2);
    });

    it('calculates 1 Star when multiple hints or mistakes occurred', () => {
      const runner = useScenarioRunner(mockScenario);

      runner.revealHint();
      runner.revealHint();
      expect(runner.hintsUsedCurrentAttempt.value).toBe(2);

      runner.applyPlayerMove({ from: 'd5', to: 'c7' });
      vi.advanceTimersByTime(700);

      runner.applyPlayerMove({ from: 'c7', to: 'a8' });
      vi.advanceTimersByTime(1000);

      expect(runner.isCompleted.value).toBe(true);
      expect(runner.calculatedStars.value).toBe(1);
    });

    it('automatically reveals hint after 2 mistakes (parity with Puzzle Hub)', () => {
      const runner = useScenarioRunner(mockScenario);

      expect(runner.activeHint.value).toBeNull();
      expect(runner.mistakesCurrentAttempt.value).toBe(0);

      // Mistake 1: wrong move
      runner.applyPlayerMove({ from: 'd5', to: 'f6' });
      expect(runner.mistakesCurrentAttempt.value).toBe(1);
      expect(runner.activeHint.value).toBeNull();

      // Mistake 2: wrong move again
      runner.applyPlayerMove({ from: 'd5', to: 'e7' });
      expect(runner.mistakesCurrentAttempt.value).toBe(2);
      expect(runner.activeHint.value).toBe('Jump to c7!');
      expect(runner.hintGlowSquare.value).toBe('d5');
      expect(runner.hintTargetSquare.value).toBe('c7');
      expect(runner.hintsUsedCurrentAttempt.value).toBe(1);
    });

    it('automatically triggers activeHint after selecting a piece and making 2 legal moves incorrect for the step (UX-VAL-002)', () => {
      const runner = useScenarioRunner(mockScenario);

      expect(runner.activeHint.value).toBeNull();
      expect(runner.mistakesCurrentAttempt.value).toBe(0);

      // 1. Select Knight on d5
      runner.selectSquare('d5');
      expect(runner.selectedSquare.value).toBe('d5');
      // Verify all legal chess moves are available (not just allowedMoves: [{ from: 'd5', to: 'c7' }])
      expect(runner.legalMoves.value).toContain('c7');
      expect(runner.legalMoves.value).toContain('f6');
      expect(runner.legalMoves.value).toContain('e7');

      // 2. First incorrect legal chess move (d5 -> f6)
      runner.selectSquare('f6');
      expect(runner.mistakesCurrentAttempt.value).toBe(1);
      expect(runner.activeHint.value).toBeNull();
      expect(runner.selectedSquare.value).toBeNull(); // Cleared after invalid step move
      expect(runner.isShaking.value).toBe(true);

      // Fast-forward shake animation
      vi.advanceTimersByTime(400);
      expect(runner.isShaking.value).toBe(false);

      // 3. Select Knight on d5 again
      runner.selectSquare('d5');
      expect(runner.selectedSquare.value).toBe('d5');
      expect(runner.legalMoves.value).toContain('e7');

      // 4. Second incorrect legal chess move (d5 -> e7)
      runner.selectSquare('e7');
      expect(runner.mistakesCurrentAttempt.value).toBe(2);
      expect(runner.activeHint.value).toBe('Jump to c7!');
      expect(runner.hintGlowSquare.value).toBe('d5');
      expect(runner.hintTargetSquare.value).toBe('c7');
      expect(runner.hintsUsedCurrentAttempt.value).toBe(1);
    });
  });

  describe('Alternative Sound Checkmate Acceptance', () => {
    const checkmateScenario: ChessScenario = {
      id: 'test-checkmate-lesson',
      title: 'Sound Checkmate Alternative',
      subtitle: 'Deliver checkmate your way!',
      category: 'checkmate_patterns',
      difficulty: 'beginner',
      targetAgeGroup: 'all',
      icon: '👑',
      description: 'Any move that delivers checkmate is accepted.',
      estimatedMinutes: 1,
      steps: [
        {
          id: 'step-cm-1',
          stepNumber: 1,
          instruction: 'Deliver checkmate to the enemy king!',
          hint: 'Find the checkmating move.',
          setupFen: '7k/5K2/8/8/8/8/8/2R3Q1 w - - 0 1',
          allowedMoves: [{ from: 'g1', to: 'g7' }], // Qg7# is the primary move
          explanationOnSuccess: 'Checkmate delivered!',
        },
      ],
    };

    it('accepts alternative move delivering sound checkmate even if not listed in allowedMoves', () => {
      const runner = useScenarioRunner(checkmateScenario);

      // Qh2# is also sound checkmate, but not in allowedMoves [{ from: 'g1', to: 'g7' }]
      const success = runner.applyPlayerMove({ from: 'g1', to: 'h2' });
      expect(success).toBe(true);
      expect(runner.isStepSuccess.value).toBe(true);
      expect(runner.feedbackMessage.value).toContain('Checkmate');

      // Completes scenario after step advance delay (700ms)
      vi.advanceTimersByTime(700);
      expect(runner.isCompleted.value).toBe(true);
    });
  });

  describe('Step and Scenario Navigation Helpers', () => {
    it('resets current step to starting FEN and clears selections via resetCurrentStep', () => {
      const runner = useScenarioRunner(mockScenario);

      runner.selectSquare('d5');
      expect(runner.selectedSquare.value).toBe('d5');

      runner.resetCurrentStep();

      expect(runner.selectedSquare.value).toBeNull();
      expect(runner.currentStepIndex.value).toBe(0);
      expect(runner.currentFen.value).toBe(mockScenario.steps[0]?.setupFen);
    });

    it('loads a new scenario cleanly via loadScenario', () => {
      const runner = useScenarioRunner();

      runner.loadScenario(mockScenario);

      expect(runner.scenario.value?.id).toBe('test-fork-lesson');
      expect(runner.currentStepIndex.value).toBe(0);
      expect(runner.totalSteps.value).toBe(2);
      expect(runner.hintsUsedCurrentAttempt.value).toBe(0);
    });
  });

  describe('Pawn Promotion Workflow', () => {
    const promotionScenario: ChessScenario = {
      id: 'promo-lesson',
      title: 'Pawn Promotion',
      subtitle: 'Promote your pawn',
      description: 'Promote your pawn to a Queen',
      icon: '♟️',
      category: 'special_moves',
      difficulty: 'beginner',
      targetAgeGroup: 'all',
      estimatedMinutes: 2,
      steps: [
        {
          id: 'step-1',
          stepNumber: 1,
          setupFen: '8/4P3/8/8/8/8/8/4k2K w - - 0 1',
          instruction: 'Push your pawn to the 8th rank to promote!',
          hint: 'Move e7 to e8',
          allowedMoves: [{ from: 'e7', to: 'e8' }],
          threatSquares: ['e8'],
          explanationOnSuccess: 'Great promotion!',
        },
      ],
    };

    it('triggers pendingPromotion when selecting pawn to 8th rank and completes with completePromotion', () => {
      const runner = useScenarioRunner(promotionScenario);

      runner.selectSquare('e7');
      expect(runner.selectedSquare.value).toBe('e7');

      runner.selectSquare('e8');
      expect(runner.pendingPromotion.value).toEqual({ from: 'e7', to: 'e8' });

      const completed = runner.completePromotion('q');
      expect(completed).toBe(true);
      expect(runner.pendingPromotion.value).toBeNull();
      expect(runner.currentFen.value).toContain('Q');
      expect(runner.isStepSuccess.value).toBe(true);
    });

    it('cancels pending promotion via cancelPromotion', () => {
      const runner = useScenarioRunner(promotionScenario);

      runner.selectSquare('e7');
      runner.selectSquare('e8');
      expect(runner.pendingPromotion.value).toEqual({ from: 'e7', to: 'e8' });

      runner.cancelPromotion();
      expect(runner.pendingPromotion.value).toBeNull();
      expect(runner.selectedSquare.value).toBeNull();
      expect(runner.legalMoves.value).toEqual([]);
    });

    it('returns false when completePromotion is called without pendingPromotion', () => {
      const runner = useScenarioRunner(promotionScenario);
      expect(runner.completePromotion('q')).toBe(false);
    });
  });

  describe('MAJ-025: Bot Move Error Handling & Step Advance Guard', () => {
    it('does not advance step and logs structured warning when opponent move fails', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const buggyScenario: ChessScenario = {
        id: 'buggy-bot-scenario',
        title: 'Buggy Bot Scenario',
        subtitle: 'Test error handling',
        category: 'tactical_patterns',
        difficulty: 'beginner',
        targetAgeGroup: '7-10',
        icon: '⚠️',
        description: 'Test step advance prevention',
        estimatedMinutes: 1,
        steps: [
          {
            id: 'step-1',
            stepNumber: 1,
            instruction: 'Make move',
            hint: 'Move pawn',
            setupFen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
            allowedMoves: [{ from: 'e2', to: 'e3' }],
            opponentResponse: {
              // Invalid illegal square for empty board
              from: 'a8',
              to: 'h1',
              delayMs: 100,
            },
            explanationOnSuccess: 'Good move!',
          },
          {
            id: 'step-2',
            stepNumber: 2,
            instruction: 'Step 2',
            hint: 'Next',
            setupFen: '8/8/8/8/8/8/8/4K3 w - - 0 1',
            explanationOnSuccess: 'Done!',
          },
        ],
      };

      const runner = useScenarioRunner(buggyScenario);
      runner.applyPlayerMove({ from: 'e2', to: 'e3' });

      // Fast-forward bot delay
      vi.advanceTimersByTime(150);

      // Bot move failed because a8 has no piece
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(runner.isWaitingForBotResponse.value).toBe(false);

      // Fast-forward step advance delay (700ms)
      vi.advanceTimersByTime(800);

      // Must NOT advance to step 2 because bot move failed!
      expect(runner.currentStepIndex.value).toBe(0);
      expect(runner.currentStep.value?.id).toBe('step-1');
      expect(runner.isCompleted.value).toBe(false);
    });
  });
});
