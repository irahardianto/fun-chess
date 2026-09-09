import { describe, it, expect } from 'vitest';
import { Chess, type Move } from 'chess.js';
import type { Puzzle, TacticalReward } from '@fun-chess/shared';
import {
  ALL_PUZZLES,
  FORK_PUZZLES,
  PIN_PUZZLES,
  SKEWER_PUZZLES,
  DISCOVERED_CHECK_PUZZLES,
  DEFLECTION_DECOY_PUZZLES,
  GREEK_GIFT_PUZZLES,
  WINDMILL_PUZZLES,
  BACK_RANK_PUZZLES,
  ANASTASIA_HOOK_PUZZLES,
  SMOTHERED_PUZZLES,
  ENDGAME_CONVERSION_PUZZLES,
} from '../data/puzzle_catalog';
import { calculateMaterialDelta } from '../engine/puzzle_analysis_engine';

const VALID_TACTICAL_REWARDS: readonly TacticalReward[] = [
  'checkmate',
  'win_queen',
  'win_rook',
  'win_minor_piece',
  'win_exchange',
  'win_pawn',
  'pawn_promotion',
  'perpetual_defense',
  'escape_danger',
];

interface PackDescriptor {
  readonly name: string;
  readonly puzzles: readonly Puzzle[];
  readonly minCount: number;
}

const PACKS: readonly PackDescriptor[] = [
  { name: 'Forks', puzzles: FORK_PUZZLES, minCount: 30 },
  { name: 'Pins', puzzles: PIN_PUZZLES, minCount: 30 },
  { name: 'Skewers', puzzles: SKEWER_PUZZLES, minCount: 25 },
  { name: 'Discovered Checks', puzzles: DISCOVERED_CHECK_PUZZLES, minCount: 25 },
  { name: 'Deflection & Decoy', puzzles: DEFLECTION_DECOY_PUZZLES, minCount: 25 },
  { name: 'Greek Gift', puzzles: GREEK_GIFT_PUZZLES, minCount: 25 },
  { name: 'Windmill', puzzles: WINDMILL_PUZZLES, minCount: 25 },
  { name: 'Back Rank Mate', puzzles: BACK_RANK_PUZZLES, minCount: 30 },
  { name: 'Anastasia & Hook Mate', puzzles: ANASTASIA_HOOK_PUZZLES, minCount: 25 },
  { name: 'Smothered Mate', puzzles: SMOTHERED_PUZZLES, minCount: 25 },
  { name: 'Endgame Conversion', puzzles: ENDGAME_CONVERSION_PUZZLES, minCount: 30 },
];

describe('Pack Pedagogy & Tactical Resolution Test Suite (SC-4)', () => {
  describe('Pack Catalog Invariants & Completeness', () => {
    it('loads all 11 curated puzzle packs with non-empty datasets', () => {
      // Arrange & Act & Assert
      expect(PACKS).toHaveLength(11);
      for (const pack of PACKS) {
        expect(pack.puzzles.length, `Pack ${pack.name} has insufficient puzzles`).toBeGreaterThanOrEqual(pack.minCount);
      }
    });

    it('aggregates all packs into ALL_PUZZLES with unique IDs and no duplicates', () => {
      // Arrange
      const totalExpected = PACKS.reduce((sum, p) => sum + p.puzzles.length, 0);

      // Act & Assert
      expect(ALL_PUZZLES.length).toBe(totalExpected);
      const idSet = new Set<string>();
      for (const puzzle of ALL_PUZZLES) {
        expect(idSet.has(puzzle.id), `Duplicate puzzle ID found: ${puzzle.id}`).toBe(false);
        idSet.add(puzzle.id);
      }
    });

    it('enforces >=80% unique FEN ratio across the entire ALL_PUZZLES dataset', () => {
      const fenSet = new Set<string>();
      for (const puzzle of ALL_PUZZLES) {
        const boardFen = puzzle.fen.split(' ')[0]!;
        fenSet.add(boardFen);
      }
      const uniqueRatio = fenSet.size / ALL_PUZZLES.length;
      expect(
        uniqueRatio,
        `Global unique FEN ratio too low: ${(uniqueRatio * 100).toFixed(1)}% (${fenSet.size}/${ALL_PUZZLES.length})`,
      ).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe.each(PACKS)('Pedagogical Integrity: $name', ({ name, puzzles }) => {
    it(`enforces 100% unique FEN ratio within ${name}`, () => {
      const fenSet = new Set<string>();
      for (const puzzle of puzzles) {
        expect(
          fenSet.has(puzzle.fen),
          `Duplicate FEN within pack ${name}: ${puzzle.fen} (${puzzle.id})`,
        ).toBe(false);
        fenSet.add(puzzle.fen);
      }
      expect(fenSet.size).toBe(puzzles.length);
    });

    it(`enforces >=90% unique move lines ratio within ${name}`, () => {
      const lineSet = new Set(puzzles.map((p) => p.moves.join(' ')));
      const uniqueRatio = lineSet.size / puzzles.length;
      expect(
        uniqueRatio,
        `Pack ${name} unique move lines ratio too low: ${(uniqueRatio * 100).toFixed(1)}% (${lineSet.size}/${puzzles.length})`,
      ).toBeGreaterThanOrEqual(0.9);
    });

    it(`validates non-empty keySquares and targetSquares coordinates for 100% of ${name}`, () => {
      const sqRegex = /^[a-h][1-8]$/;
      for (const puzzle of puzzles) {
        expect(puzzle.keySquares, `Missing keySquares in ${puzzle.id}`).toBeDefined();
        expect(puzzle.keySquares!.length, `Empty keySquares in ${puzzle.id}`).toBeGreaterThan(0);
        for (const sq of puzzle.keySquares!) {
          expect(sq).toMatch(sqRegex);
        }

        expect(puzzle.targetSquares, `Missing targetSquares in ${puzzle.id}`).toBeDefined();
        expect(puzzle.targetSquares!.length, `Empty targetSquares in ${puzzle.id}`).toBeGreaterThan(0);
        for (const sq of puzzle.targetSquares!) {
          expect(sq).toMatch(sqRegex);
        }
      }
    });

    it(`validates terminal safety (zero 1-ply counter-mates by opponent) for ${name}`, () => {
      for (const puzzle of puzzles) {
        const chess = new Chess(puzzle.fen);
        for (const moveUci of puzzle.moves) {
          const from = moveUci.slice(0, 2);
          const to = moveUci.slice(2, 4);
          const promo = moveUci.slice(4) || undefined;
          chess.move({
            from: from as unknown as import('chess.js').Square,
            to: to as unknown as import('chess.js').Square,
            promotion: promo,
          });
        }

        if (!chess.isCheckmate()) {
          const opponentReplies = chess.moves({ verbose: true });
          for (const oppMove of opponentReplies) {
            const nextChess = new Chess(chess.fen());
            nextChess.move(oppMove);
            expect(
              nextChess.isCheckmate(),
              `Terminal safety blunder in ${puzzle.id}: opponent can play ${oppMove.san} to counter-mate!`,
            ).toBe(false);
          }
        }
      }
    });

    it(`enforces Odd-Ply Invariant (moves.length % 2 === 1) for 100% of ${name}`, () => {
      for (const puzzle of puzzles) {
        expect(
          puzzle.moves.length % 2,
          `Odd-Ply Invariant violated in puzzle ${puzzle.id} (${puzzle.moves.length} moves). Puzzles MUST end on player's move!`,
        ).toBe(1);
      }
    });
    it(`validates FEN syntax, playerColor turn, and playable board state in chess.js for 100% of ${name}`, () => {
      for (const puzzle of puzzles) {
        // Arrange & Act
        const chess = new Chess(puzzle.fen);

        // Assert
        expect(chess.fen(), `Invalid FEN in puzzle ${puzzle.id}`).toBeTruthy();
        expect(puzzle.playerColor, `Player color mismatch in puzzle ${puzzle.id}`).toBe(chess.turn());
      }
    });

    it(`validates that 100% of moves in sequence are strictly legal in chess.js for ${name}`, () => {
      for (const puzzle of puzzles) {
        // Arrange
        const chess = new Chess(puzzle.fen);
        expect(puzzle.moves.length, `Empty moves line in puzzle ${puzzle.id}`).toBeGreaterThan(0);
        expect(puzzle.solutionPlies, `solutionPlies mismatch in ${puzzle.id}`).toBe(puzzle.moves.length);

        // Act & Assert
        for (let i = 0; i < puzzle.moves.length; i++) {
          const moveUci = puzzle.moves[i]!;
          const from = moveUci.slice(0, 2);
          const to = moveUci.slice(2, 4);
          const promotion = moveUci.slice(4) || undefined;

          let moveRes: Move | null;
          try {
            moveRes = chess.move({
              from: from as unknown as import('chess.js').Square,
              to: to as unknown as import('chess.js').Square,
              promotion,
            });
          } catch (err) {
            void err;
            moveRes = null;
          }

          expect(
            moveRes,
            `Illegal move ply ${i} (${moveUci}) in puzzle ${puzzle.id} from FEN: ${chess.fen()}`,
          ).not.toBeNull();
        }
      }
    });

    it(`validates tacticalGoal is a non-empty string (>10 chars) for 100% of ${name}`, () => {
      for (const puzzle of puzzles) {
        expect(typeof puzzle.tacticalGoal, `Missing tacticalGoal in puzzle ${puzzle.id}`).toBe('string');
        expect(
          puzzle.tacticalGoal.trim().length,
          `tacticalGoal too short (<=10 chars) in puzzle ${puzzle.id}: "${puzzle.tacticalGoal}"`,
        ).toBeGreaterThan(10);
      }
    });

    it(`validates tacticalReward is a valid TacticalReward value for 100% of ${name}`, () => {
      for (const puzzle of puzzles) {
        expect(
          VALID_TACTICAL_REWARDS,
          `Invalid tacticalReward "${puzzle.tacticalReward}" in puzzle ${puzzle.id}`,
        ).toContain(puzzle.tacticalReward);
      }
    });

    it(`validates outcomeAdvantage is a non-empty string for 100% of ${name}`, () => {
      for (const puzzle of puzzles) {
        expect(typeof puzzle.outcomeAdvantage, `Missing outcomeAdvantage in puzzle ${puzzle.id}`).toBe('string');
        expect(
          puzzle.outcomeAdvantage.trim().length,
          `Empty outcomeAdvantage in puzzle ${puzzle.id}`,
        ).toBeGreaterThan(0);
      }
    });

    it(`validates learningSummary is a non-empty string (>15 chars) for 100% of ${name}`, () => {
      for (const puzzle of puzzles) {
        expect(typeof puzzle.learningSummary, `Missing learningSummary in puzzle ${puzzle.id}`).toBe('string');
        expect(
          puzzle.learningSummary.trim().length,
          `learningSummary too short (<=15 chars) in puzzle ${puzzle.id}: "${puzzle.learningSummary}"`,
        ).toBeGreaterThan(15);
      }
    });

    it(`validates keyTakeaway is a non-empty string (>10 chars) for 100% of ${name}`, () => {
      for (const puzzle of puzzles) {
        expect(typeof puzzle.keyTakeaway, `Missing keyTakeaway in puzzle ${puzzle.id}`).toBe('string');
        expect(
          puzzle.keyTakeaway.trim().length,
          `keyTakeaway too short (<=10 chars) in puzzle ${puzzle.id}: "${puzzle.keyTakeaway}"`,
        ).toBeGreaterThan(10);
      }
    });

    it(`validates stepExplanations has matching length, valid SAN, and explanations for 100% of ${name}`, () => {
      for (const puzzle of puzzles) {
        expect(
          puzzle.stepExplanations,
          `Missing stepExplanations array in puzzle ${puzzle.id}`,
        ).toBeDefined();
        expect(
          Array.isArray(puzzle.stepExplanations),
          `stepExplanations must be array in puzzle ${puzzle.id}`,
        ).toBe(true);
        expect(
          puzzle.stepExplanations!.length,
          `stepExplanations length (${puzzle.stepExplanations?.length}) does not match moves length (${puzzle.moves.length}) in puzzle ${puzzle.id}`,
        ).toBe(puzzle.moves.length);

        // Verify simulated move SAN matches stepExplanations SAN
        const chess = new Chess(puzzle.fen);
        for (let i = 0; i < puzzle.moves.length; i++) {
          const step = puzzle.stepExplanations![i]!;
          const moveUci = puzzle.moves[i]!;
          const from = moveUci.slice(0, 2);
          const to = moveUci.slice(2, 4);
          const promotion = moveUci.slice(4) || undefined;
          const currentActor = chess.turn();

          expect(step.plyIndex, `stepExplanation plyIndex mismatch at index ${i} in ${puzzle.id}`).toBe(i);
          expect(step.actor, `stepExplanation actor mismatch at index ${i} in ${puzzle.id}`).toBe(currentActor);
          expect(typeof step.explanation, `Missing explanation at ply ${i} in ${puzzle.id}`).toBe('string');
          expect(step.explanation.trim().length, `Empty explanation at ply ${i} in ${puzzle.id}`).toBeGreaterThan(0);

          const moveRes = chess.move({
            from: from as unknown as import('chess.js').Square,
            to: to as unknown as import('chess.js').Square,
            promotion,
          });
          expect(moveRes, `Illegal move at ply ${i} in ${puzzle.id}`).not.toBeNull();
          expect(step.moveSan, `stepExplanation moveSan mismatch at ply ${i} in ${puzzle.id}`).toBe(moveRes.san);
        }
      }
    });

    it(`validates decisive tactical payoff (checkmate OR ΔMaterial > 0) with zero equal trades or blunders for ${name}`, () => {
      for (const puzzle of puzzles) {
        // Arrange: Play out the full solution line in chess.js
        const chess = new Chess(puzzle.fen);
        for (const moveUci of puzzle.moves) {
          const from = moveUci.slice(0, 2);
          const to = moveUci.slice(2, 4);
          const promotion = moveUci.slice(4) || undefined;
          chess.move({
            from: from as unknown as import('chess.js').Square,
            to: to as unknown as import('chess.js').Square,
            promotion,
          });
        }

        const isCheckmate = chess.isCheckmate();
        const matDelta = calculateMaterialDelta(puzzle.fen, chess.fen(), puzzle.playerColor, isCheckmate);

        if (puzzle.tacticalReward === 'checkmate') {
          // Assert: For checkmate puzzles, final position MUST be checkmate
          expect(
            isCheckmate,
            `Puzzle ${puzzle.id} marked as checkmate but final position is NOT checkmate. Final FEN: ${chess.fen()}`,
          ).toBe(true);
        } else if (puzzle.tacticalReward === 'pawn_promotion') {
          // Assert: For pawn promotions, either checkmate or positive material / promotion achieved
          const hasGainOrQueen = matDelta.netCentipawns > 0 || isCheckmate || puzzle.moves.some((m) => m.length > 4);
          expect(
            hasGainOrQueen,
            `Pawn promotion puzzle ${puzzle.id} did not gain material or promote. Delta: ${matDelta.netCentipawns}`,
          ).toBe(true);
        } else {
          // Assert: For non-checkmate tactical puzzles, final position MUST achieve decisive net material gain (ΔMaterial > 0)
          // and must NOT be an equal trade or negative blunder.
          if (!isCheckmate) {
            expect(
              matDelta.netCentipawns,
              `Puzzle ${puzzle.id} (${puzzle.primaryTheme}) ended with non-positive material gain: ${matDelta.netCentipawns} cp. Expected ΔMaterial > 0.`,
            ).toBeGreaterThan(0);
            expect(
              matDelta.netPoints,
              `Puzzle ${puzzle.id} ended with netPoints <= 0 (${matDelta.netPoints}). Expected net point gain.`,
            ).toBeGreaterThanOrEqual(1);
          }
        }
      }
    });
  });
});
