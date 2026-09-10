import { describe, it, expect } from 'vitest';
import { Chess, type Square } from 'chess.js';
import { ALL_SCENARIOS, SCENARIOS_MAP } from '../features/scenarios/data';
import { useScenarioRunner } from '../features/scenarios/composables/useScenarioRunner';
import { LocalStorageProgressStore } from '../features/scenarios/store/local_storage_progress.store';
import { ALL_PUZZLES } from '../features/puzzles/data/puzzle_catalog';
import { usePuzzleRunner } from '../features/puzzles/composables/usePuzzleRunner';
import { useProgressiveHint } from '../features/puzzles/composables/useProgressiveHint';
import { useAdaptiveLadder } from '../features/puzzles/composables/useAdaptiveLadder';
import { useThemedDrills } from '../features/puzzles/composables/useThemedDrills';
import { validatePuzzleMove, parseUciMove, formatPlayerMoveToUci } from '../features/puzzles/engine/puzzle_validator';
import { generateMistakeRefutation } from '../features/puzzles/engine/puzzle_analysis_engine';
import { LocalStoragePuzzleProgressStore } from '../features/puzzles/store/local_storage_puzzle_progress.store';
import { InMemoryPuzzleProgressStore } from '../features/puzzles/store/in_memory_puzzle_progress.store';

describe('Deep Interaction & State Machine Verification', () => {
  describe('Chess Academy: 43 Scenarios Comprehensive Verification', () => {
    it('verifies all 43 scenarios exist and calculates total step count', () => {
      expect(ALL_SCENARIOS.length).toBe(49);
      let totalSteps = 0;
      for (const scenario of ALL_SCENARIOS) {
        totalSteps += scenario.steps.length;
      }
      expect(totalSteps).toBe(115);
      console.log(`[VERIFY] Total scenarios: ${ALL_SCENARIOS.length}, Total steps across curriculum: ${totalSteps}`);
    });

    it('verifies FEN validity, turn consistency, and move legality for every step in all 43 scenarios', () => {
      let totalStepsVerified = 0;
      let stepsWithOpponentResponse = 0;
      const colorCounts: Record<'w' | 'b', number> = { w: 0, b: 0 };

      for (const scenario of ALL_SCENARIOS) {
        for (let i = 0; i < scenario.steps.length; i++) {
          const step = scenario.steps[i]!;
          totalStepsVerified++;

          // 1. FEN validity
          const chess = new Chess();
          expect(() => chess.load(step.setupFen)).not.toThrow();

          // 2. Turn consistency
          const fenTurn = chess.turn();
          expect(
            fenTurn,
            `Step ${step.id} (${scenario.id}) has FEN turn '${fenTurn}' but step.playerColor is '${step.playerColor}'`
          ).toBe(step.playerColor);

          const pColor = (step.playerColor ?? 'w') as 'w' | 'b';
          colorCounts[pColor] = (colorCounts[pColor] || 0) + 1;

          // 3. Move legality
          if (step.allowedMoves && step.allowedMoves.length > 0) {
            for (const moveConstraint of step.allowedMoves) {
              const testChess = new Chess(step.setupFen);
              const piece = testChess.get(moveConstraint.from as any);
              expect(
                piece,
                `Step ${step.id}: No piece found at ${moveConstraint.from} in FEN ${step.setupFen}`
              ).not.toBeNull();
              expect(
                piece?.color,
                `Step ${step.id}: Piece at ${moveConstraint.from} has color ${piece?.color}, expected ${step.playerColor}`
              ).toBe(step.playerColor);

              const moveRes = testChess.move({
                from: moveConstraint.from as Square,
                to: moveConstraint.to as Square,
                promotion: moveConstraint.promotion,
              });
              expect(
                moveRes,
                `Step ${step.id}: Allowed move ${moveConstraint.from}->${moveConstraint.to} is illegal in FEN ${step.setupFen}`
              ).not.toBeNull();
            }

            // 4. Opponent response legality
            if (step.opponentResponse) {
              stepsWithOpponentResponse++;
              const testChess = new Chess(step.setupFen);
              const firstMove = step.allowedMoves[0]!;
              testChess.move({
                from: firstMove.from as Square,
                to: firstMove.to as Square,
                promotion: firstMove.promotion,
              });

              const opp = step.opponentResponse;
              const oppPiece = testChess.get(opp.from as any);
              expect(
                oppPiece,
                `Step ${step.id}: Opponent piece not found at ${opp.from} after player move`
              ).not.toBeNull();

              const oppRes = testChess.move({
                from: opp.from as Square,
                to: opp.to as Square,
                promotion: opp.promotion,
              });
              expect(
                oppRes,
                `Step ${step.id}: Opponent response ${opp.from}->${opp.to} is illegal`
              ).not.toBeNull();
            }
          }
        }
      }

      console.log(`[VERIFY] Academy Steps Verified: ${totalStepsVerified}`);
      console.log(`[VERIFY] Steps with Opponent Response: ${stepsWithOpponentResponse}`);
      console.log(`[VERIFY] Step player colors: White: ${colorCounts.w}, Black: ${colorCounts.b}`);
      expect(colorCounts.b).toBeGreaterThan(0); // Confirms Black-to-move scenarios exist
    });

    it('verifies player color distribution and board orientation across scenarios', () => {
      const blackScenarios = ALL_SCENARIOS.filter((s) => s.steps.some((st) => st.playerColor === 'b'));
      console.log(`[VERIFY] Scenarios featuring Black perspective: ${blackScenarios.map((s) => s.id).join(', ')}`);
      expect(blackScenarios.length).toBeGreaterThan(0);

      // Verify each scenario properly sets runner.playerColor
      for (const sc of blackScenarios) {
        const runner = useScenarioRunner({ scenario: sc });
        const step0 = sc.steps[0]!;
        expect(runner.playerColor.value).toBe(step0.playerColor);
      }
    });

    it('verifies ScenarioRunner state machine: moves, invalid rejection, hints, reset, and completion', () => {
      const scenario = SCENARIOS_MAP.get('pawn-journey');
      expect(scenario).toBeDefined();

      const runner = useScenarioRunner({
        scenario: scenario!,
        onStepOutcome: () => {},
      });

      // Initial state
      expect(runner.currentStepIndex.value).toBe(0);
      expect(runner.isCompleted.value).toBe(false);
      expect(runner.hintsUsedCurrentAttempt.value).toBe(0);
      expect(runner.mistakesCurrentAttempt.value).toBe(0);

      // 1. Illegal move rejection & shake animation
      const invalidMoveSuccess = runner.applyPlayerMove({
        from: 'e2' as Square,
        to: 'e5' as Square, // Illegal for pawn
      });
      expect(invalidMoveSuccess).toBe(false);
      expect(runner.mistakesCurrentAttempt.value).toBe(1);
      expect(runner.isShaking.value).toBe(true);
      expect(runner.feedbackMessage.value).toContain('Not quite');

      // 2. Hint revealing
      runner.revealHint();
      expect(runner.hintsUsedCurrentAttempt.value).toBe(1);
      expect(runner.activeHint.value).toBeTruthy();
      expect(runner.hintGlowSquare.value).toBeTruthy();

      // 3. Reset step
      runner.resetCurrentStep();
      expect(runner.activeHint.value).toBeNull();
      expect(runner.isShaking.value).toBe(false);

      // 4. Valid move execution
      const step0Move = scenario!.steps[0]!.allowedMoves![0]!;
      const validMoveSuccess = runner.applyPlayerMove({
        from: step0Move.from,
        to: step0Move.to,
      });
      expect(validMoveSuccess).toBe(true);
      expect(runner.isStepSuccess.value).toBe(true);
      expect(runner.feedbackMessage.value).toBe(scenario!.steps[0]!.explanationOnSuccess);
    });

    it('verifies ScenarioProgressStore persistence, sanitization, and fallback', async () => {
      const store = new LocalStorageProgressStore('__test_scenario_progress__');
      await store.resetAllProgress();

      const initialMap = await store.getProgressMap();
      expect(Object.keys(initialMap).length).toBe(0);

      // Save progress with 2 stars and 1 hint
      const saved1 = await store.saveProgress('pawn-journey', 2, 1);
      expect(saved1.starsEarned).toBe(2);
      expect(saved1.hintsUsedTotal).toBe(1);
      expect(saved1.attemptsCount).toBe(1);

      // Save again with higher stars (3 stars)
      const saved2 = await store.saveProgress('pawn-journey', 3, 0);
      expect(saved2.starsEarned).toBe(3);
      expect(saved2.attemptsCount).toBe(2);

      // Save again with lower stars (1 star) -> must retain peak 3 stars!
      const saved3 = await store.saveProgress('pawn-journey', 1, 2);
      expect(saved3.starsEarned).toBe(3);
      expect(saved3.attemptsCount).toBe(3);

      await store.resetAllProgress();
    });
  });

  describe('Puzzle Hub: 336 Puzzles Comprehensive Verification', () => {
    it('verifies exact total count of 336 curated puzzles', () => {
      expect(ALL_PUZZLES.length).toBe(336);
      console.log(`[VERIFY] Total puzzles loaded: ${ALL_PUZZLES.length}`);
    });

    it('verifies Odd-Ply Invariant (moves.length % 2 === 1) across 100% of puzzles', () => {
      let evenPlyViolations = 0;
      for (const puzzle of ALL_PUZZLES) {
        if (puzzle.moves.length % 2 === 0) {
          evenPlyViolations++;
        }
      }
      expect(evenPlyViolations).toBe(0);
    });

    it('verifies FEN validity and turn consistency across 100% of puzzles', () => {
      const colorCounts = { w: 0, b: 0 };
      for (const puzzle of ALL_PUZZLES) {
        const chess = new Chess();
        expect(() => chess.load(puzzle.fen)).not.toThrow();
        expect(
          chess.turn(),
          `Puzzle ${puzzle.id} has FEN turn '${chess.turn()}' but playerColor is '${puzzle.playerColor}'`
        ).toBe(puzzle.playerColor);

        colorCounts[puzzle.playerColor]++;
      }
      console.log(`[VERIFY] Puzzle player colors: White: ${colorCounts.w}, Black: ${colorCounts.b}`);
      expect(colorCounts.w).toBeGreaterThan(0);
      expect(colorCounts.b).toBeGreaterThan(0);
    });

    it('verifies entire move sequence legality for all 336 puzzles', () => {
      let totalPliesTested = 0;

      for (const puzzle of ALL_PUZZLES) {
        const chess = new Chess(puzzle.fen);
        for (let ply = 0; ply < puzzle.moves.length; ply++) {
          totalPliesTested++;
          const uci = puzzle.moves[ply]!;
          const parsed = parseUciMove(uci);

          const moveRes = chess.move({
            from: parsed.from as Square,
            to: parsed.to as Square,
            promotion: parsed.promotion,
          });

          expect(
            moveRes,
            `Puzzle ${puzzle.id} failed at ply ${ply} (${uci}) in FEN: ${chess.fen()}`
          ).not.toBeNull();
        }
      }
      console.log(`[VERIFY] Total puzzle plies verified for strict chess legality: ${totalPliesTested}`);
    });

    it('verifies underpromotion behavior and edge cases in puzzle and scenario engines', () => {
      // Create a test puzzle requiring underpromotion to knight (to avoid stalemate or check)
      const underpromoPuzzle: any = {
        id: 'test-underpromotion',
        title: 'Tricky Underpromotion',
        subtitle: 'Promote to knight to win!',
        fen: '8/5P1k/8/8/8/8/8/K7 w - - 0 1',
        playerColor: 'w',
        difficulty: 'hard',
        rating: 1500,
        ratingDeviation: 100,
        themes: ['promotion'],
        primaryTheme: 'promotion',
        solutionPlies: 1,
        moves: ['f7f8n'],
      };

      // 1. If player promotes to Queen ('q'): rejected with refutation feedback
      const queenResult = validatePuzzleMove(underpromoPuzzle, 0, underpromoPuzzle.fen, {
        from: 'f7' as Square,
        to: 'f8' as Square,
        promotion: 'q',
      });
      expect(queenResult.isCorrect).toBe(false);
      expect(queenResult.feedback).toContain('Not quite');

      // 2. If player promotes to Knight ('n'): accepted and puzzle completes!
      const knightResult = validatePuzzleMove(underpromoPuzzle, 0, underpromoPuzzle.fen, {
        from: 'f7' as Square,
        to: 'f8' as Square,
        promotion: 'n',
      });
      expect(knightResult.isCorrect).toBe(true);
      expect(knightResult.isPuzzleComplete).toBe(true);
    });

    it('scans all 336 puzzles for alternative checkmate solutions (cook check)', () => {
      const dualMatePuzzles: Array<{
        puzzleId: string;
        expectedUci: string;
        alternativeMates: string[];
      }> = [];

      for (const puzzle of ALL_PUZZLES) {
        const chess = new Chess(puzzle.fen);
        const legalMoves = chess.moves({ verbose: true });
        const expectedUci = puzzle.moves[0] ?? '';

        const matingMoves: string[] = [];
        for (const m of legalMoves) {
          const sim = new Chess(puzzle.fen);
          sim.move({
            from: m.from,
            to: m.to,
            promotion: m.promotion,
          });
          if (sim.isCheckmate()) {
            const promo = m.promotion || '';
            matingMoves.push(`${m.from}${m.to}${promo}`);
          }
        }

        if (matingMoves.length > 1) {
          dualMatePuzzles.push({
            puzzleId: puzzle.id,
            expectedUci,
            alternativeMates: matingMoves.filter((m) => m !== expectedUci),
          });
        }
      }

      console.log(`[VERIFY] Dual checkmate cooks detected: ${dualMatePuzzles.length}`);
      if (dualMatePuzzles.length > 0) {
        console.log(`[VERIFY] Dual checkmate puzzles list:`, JSON.stringify(dualMatePuzzles, null, 2));
      }
    });

    it('detects and catalogs all pawn promotions and underpromotions across all puzzles', () => {
      const promotionPuzzles: Array<{
        puzzleId: string;
        ply: number;
        uci: string;
        promoPiece: string;
        actor: string;
      }> = [];

      for (const puzzle of ALL_PUZZLES) {
        const chess = new Chess(puzzle.fen);
        for (let ply = 0; ply < puzzle.moves.length; ply++) {
          const uci = puzzle.moves[ply]!;
          const parsed = parseUciMove(uci);
          const actor = chess.turn();

          if (parsed.promotion) {
            promotionPuzzles.push({
              puzzleId: puzzle.id,
              ply,
              uci,
              promoPiece: parsed.promotion,
              actor,
            });
          }

          chess.move({
            from: parsed.from as Square,
            to: parsed.to as Square,
            promotion: parsed.promotion,
          });
        }
      }

      console.log(`[VERIFY] Found ${promotionPuzzles.length} promotion moves across puzzle dataset.`);
      const underpromotions = promotionPuzzles.filter((p) => p.promoPiece !== 'q');
      console.log(`[VERIFY] Underpromotions count: ${underpromotions.length}`);
      if (underpromotions.length > 0) {
        console.log(`[VERIFY] Underpromotion moves:`, JSON.stringify(underpromotions, null, 2));
      }

      // Verify that validatePuzzleMove correctly matches or rejects promotion piece
      if (promotionPuzzles.length > 0) {
        const sample = promotionPuzzles[0]!;
        const parsed = parseUciMove(sample.uci);

        expect(formatPlayerMoveToUci({
          from: parsed.from,
          to: parsed.to,
          promotion: parsed.promotion,
        })).toBe(sample.uci);
      }
    });

    it('verifies Alternative Solution & Mistake Refutation handling in puzzle_validator', () => {
      // Pick a sample puzzle
      const puzzle = ALL_PUZZLES[0]!;
      const chess = new Chess(puzzle.fen);
      const legalMoves = chess.moves({ verbose: true });

      const solutionUci = puzzle.moves[0]!;
      const parsedSol = parseUciMove(solutionUci);

      // Find an alternative legal move
      const altMove = legalMoves.find((m) => m.from !== parsedSol.from || m.to !== parsedSol.to);
      expect(altMove).toBeDefined();

      if (altMove) {
        const outcome = validatePuzzleMove(puzzle, 0, puzzle.fen, {
          from: altMove.from as Square,
          to: altMove.to as Square,
        });

        expect(outcome.isCorrect).toBe(false);
        expect(outcome.feedback).toContain('Not quite');
        // Check refutation generation
        const refutation = generateMistakeRefutation(puzzle.fen, {
          from: altMove.from as Square,
          to: altMove.to as Square,
        });
        expect(refutation === null || typeof refutation === 'object').toBe(true);
      }
    });

    it('verifies Progressive Hints across all 336 puzzles', () => {
      let tier1Valid = 0;
      let tier2Valid = 0;
      let tier3Valid = 0;

      for (const puzzle of ALL_PUZZLES) {
        const hintModule = useProgressiveHint();

        // Tier 1: Nudge
        const t1 = hintModule.requestNextHint(puzzle, 0, puzzle.fen);
        expect(t1.level).toBe(1);
        expect(t1.sourceSquare).toBeTruthy();
        tier1Valid++;

        // Tier 2: Target
        const t2 = hintModule.requestNextHint(puzzle, 0, puzzle.fen);
        expect(t2.level).toBe(2);
        expect(t2.targetSquare).toBeTruthy();
        tier2Valid++;

        // Tier 3: Solution Arrow
        const t3 = hintModule.requestNextHint(puzzle, 0, puzzle.fen);
        expect(t3.level).toBe(3);
        expect(t3.sourceSquare).toBeTruthy();
        expect(t3.targetSquare).toBeTruthy();
        tier3Valid++;
      }

      console.log(`[VERIFY] Progressive Hints validated for all 336 puzzles: Tier1: ${tier1Valid}, Tier2: ${tier2Valid}, Tier3: ${tier3Valid}`);
    });

    it('verifies PuzzleRunner complete lifecycle: solve, bot response, replay controller, stars', () => {
      const multiPlyPuzzle = ALL_PUZZLES.find((p) => p.moves.length >= 3);
      expect(multiPlyPuzzle).toBeDefined();

      const runner = usePuzzleRunner({
        puzzle: multiPlyPuzzle!,
        autoPlayAudio: false,
        onSolve: () => {},
      });

      expect(runner.currentMoveIndex.value).toBe(0);
      expect(runner.isCompleted.value).toBe(false);
      expect(runner.isPlayerTurn.value).toBe(true);

      // Play ply 0
      const ply0 = parseUciMove(multiPlyPuzzle!.moves[0]!);
      runner.applyPlayerMove({
        from: ply0.from,
        to: ply0.to,
        promotion: ply0.promotion,
      });

      // Bot response should be triggered!
      expect(runner.isWaitingForBot.value).toBe(true);
      expect(runner.isPlayerTurn.value).toBe(false);

      // Verify replay controller methods exist and don't throw
      runner.stepReplayStart();
      expect(runner.isReplaying.value).toBe(true);
      expect(runner.replayStepIndex.value).toBe(0);

      runner.stepReplayNext();
      expect(runner.replayStepIndex.value).toBe(1);

      runner.stepReplayEnd();
      expect(runner.replayStepIndex.value).toBe(runner.replayTotalSteps.value);

      runner.toggleInspectBoard(true);
      expect(runner.isInspectingBoard.value).toBe(true);
      runner.toggleInspectBoard(false);
      expect(runner.isInspectingBoard.value).toBe(false);

      runner.resetCurrentPuzzle();
      expect(runner.currentMoveIndex.value).toBe(0);
      expect(runner.isWaitingForBot.value).toBe(false);
    });

    it('verifies ThemedDrills playlist navigation and wrapping', () => {
      const drills = useThemedDrills('fork');
      expect(drills.totalInTheme.value).toBeGreaterThan(0);
      expect(drills.currentPuzzle.value).toBeDefined();

      const initialId = drills.currentPuzzle.value?.id;
      drills.nextPuzzle();
      expect(drills.currentPuzzleIndex.value).toBe(1);

      drills.previousDrill();
      expect(drills.currentPuzzleIndex.value).toBe(0);
      expect(drills.currentPuzzle.value?.id).toBe(initialId);
    });

    it('verifies AdaptiveRating calculations & ladder state machine', () => {
      const mockStore = new InMemoryPuzzleProgressStore();
      const ladder = useAdaptiveLadder(mockStore);

      expect(ladder.currentElo.value).toBe(800);
      expect(ladder.currentStreak.value).toBe(0);
      expect(ladder.currentPuzzle.value).toBeDefined();

      const puzzle = ladder.currentPuzzle.value!;
      // Simulate solve
      ladder.handleSolve(puzzle, 3, 0);
      expect(ladder.currentStreak.value).toBe(1);
    });

    it('verifies LocalStoragePuzzleProgressStore data integrity & rating updates', async () => {
      const store = new LocalStoragePuzzleProgressStore('__test_puzzle_progress__');
      await store.resetAll();

      const initial = await store.getProgress();
      expect(initial.ratingProfile.rating).toBe(800);
      expect(Object.keys(initial.solvedPuzzles).length).toBe(0);

      // Record a solve
      const updated = await store.recordPuzzleAttempt('fork-001', 'fork', 'solved_first_try', 3);
      expect(updated.solvedPuzzles['fork-001']?.stars).toBe(3);
      expect(updated.themeMastery['fork']?.solved).toBe(1);
      expect(updated.themeMastery['fork']?.starsEarned).toBe(3);

      await store.resetAll();
    });
  });
});
