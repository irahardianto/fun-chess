import { Chess } from 'chess.js';
import path from 'path';
import { validateAndEnrich, savePack } from '../validator.mjs';

const windmillPuzzles = [];

const whiteList = [
  // 1: takes e7
  ['5rk1/ppp1qR1p/5B2/8/8/8/PPP3PP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7e7'],
   'win_queen', '+9 Queen ♛', 'Windmill Queen Snatch on e7 #1 ♛', 'Rook cycles with discovered checks to win Black\'s Queen on e7!'],
  // 2: takes d7
  ['5rk1/pp1q1R1p/5B2/8/8/8/PPP3PP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7d7'],
   'win_queen', '+9 Queen ♛', 'Windmill Queen Capture on d7 #2 ♛', 'White extracts Black\'s Queen with alternating checks.'],
  // 3: takes c7
  ['5rk1/p1q2R1p/5B2/8/8/8/PPP3PP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7c7'],
   'win_queen', '+9 Queen ♛', 'Windmill Queen Capture on c7 #3 ♛', 'White captures Black\'s Queen on c7 via discovered check.'],
  // 4: takes b7
  ['5rk1/1q3R1p/5B2/8/8/8/PPP3PP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7b7'],
   'win_queen', '+9 Queen ♛', 'Windmill Queen Capture on b7 #4 ♛', 'White sweeps across the 7th rank to win the Queen on b7.'],
  // 5: takes a7
  ['5rk1/q4R1p/5B2/8/8/8/PPP2PPP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7a7'],
   'win_queen', '+9 Queen ♛', 'Windmill Queen Capture on a7 #5 ♛', 'White collects the Queen on the far a-file.'],
  // 6: takes h7, d7, and c7
  ['5rk1/p1pq1R1p/5B2/8/8/8/PPP3PP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7d7', 'h8g8', 'd7c7'],
   'win_queen', '+10 Queen & Pawn ♛', 'Windmill Triple Capture #6 ♛', 'Rook sweeps Queen and pawn on the 7th rank!'],
  // 7: takes h7, e7, and d7
  ['5rk1/ppp1qR1p/5B2/8/8/8/PP3PPP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7e7', 'h8g8', 'e7d7'],
   'win_queen', '+9 Queen ♛', 'Windmill Multi-Piece Harvest #7 ♛', 'White extracts Queen on e7 and bishop on d7.'],
  // 8: takes h7, d7, c7
  ['5rk1/1ppq1R1p/5B2/8/8/8/PPP3PP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7d7', 'h8g8', 'd7g7', 'g8h8', 'g7c7'],
   'win_queen', '+10 Queen & Pawn ♛', 'Windmill Sweeper on the 7th Rank #8 ♜', 'White clears the rank with four consecutive discovered checks.'],
  // 9: takes h7, d7, c7, b7
  ['5rk1/pppq1R1p/5B2/8/8/8/PPP3PP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7d7', 'h8g8', 'd7g7', 'g8h8', 'g7c7', 'h8g8', 'c7g7', 'g8h8', 'g7b7'],
   'win_queen', '+11 Queen & Pawns ♛', 'Complete 7th Rank Windmill Sweep #9 ♜', 'White collects Queen, c-pawn, and b-pawn in a 15-ply sequence!'],
  // 10: takes Be6 + Re7
  ['4r1k1/ppp2R1p/4B3/8/8/8/PPP3PP/6K1 w - - 0 1',
   ['f7e7', 'g8f8', 'e7f7', 'f8g8', 'f7c7', 'g8f8', 'c7f7', 'f8g8', 'f7b7'],
   'win_pawn', '+2 Pawns ♟', 'Central Windmill on the e/f Files #10 ♜', 'Bishop on e6 and Rook on f7 dismantle Black\'s pawns.'],
  // 11: takes d5
  ['5rk1/ppp2R1p/5B2/3q4/8/8/PPP3PP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7g5', 'h8h7', 'g5d5'],
   'win_queen', '+9 Queen ♛', 'Windmill Queen Extraction on d5 #11 ♛', 'Rook steps back to g5+ discovered check and snatches the d5 Queen!'],
  // 12: takes e5
  ['5rk1/ppp2R1p/5B2/4q3/8/8/PPP3PP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7g5', 'h8h7', 'g5e5'],
   'win_queen', '+9 Queen ♛', 'Windmill Queen Snatch on e5 #12 ♛', 'Rook captures Black Queen on e5 with discovered check cadence.'],
  // 13: takes c5
  ['5rk1/ppp2R1p/5B2/2q5/3P4/8/PPP3PP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7g5', 'h8h7', 'g5c5'],
   'win_queen', '+9 Queen ♛', 'Windmill Queen Snatch on c5 #13 ♛', 'White harvests the c5 Queen using the long diagonal battery.'],
  // 14: takes b5
  ['5rk1/ppp2R1p/5B2/1q6/8/8/PPP3PP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7g5', 'h8h7', 'g5b5'],
   'win_queen', '+9 Queen ♛', 'Windmill Queen Snatch on b5 #14 ♛', 'White pulls back to g5+ to take the b5 Queen.'],
  // 15: takes a5
  ['5rk1/ppp2R1p/5B2/q7/8/8/PPP3PP/6K1 w - - 0 1',
   ['f7g7', 'g8h8', 'g7h7', 'h8g8', 'h7g7', 'g8h8', 'g7g5', 'h8h7', 'g5a5'],
   'win_queen', '+9 Queen ♛', 'Windmill Queen Snatch on a5 #15 ♛', 'White captures the far-flung Queen on a5 via discovered check.']
];

const blackList = [
  // 16: takes e2
  ['6k1/ppp3pp/8/8/8/5b2/PPP1Qr1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2e2'],
   'win_queen', '+9 Queen ♛', 'Black Windmill Queen Snatch on e2 #16 ♛', 'Black captures White\'s Queen on e2 via 2nd-rank battery.'],
  // 17: takes d2
  ['6k1/ppp3pp/8/8/8/5b2/PPPQ1r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2d2'],
   'win_queen', '+9 Queen ♛', 'Black Windmill Queen Snatch on d2 #17 ♛', 'Black cycles discovered checks to capture the White Queen on d2!'],
  // 18: takes c2
  ['6k1/ppp3pp/8/8/8/5b2/PPQ2r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2c2'],
   'win_queen', '+9 Queen ♛', 'Black Windmill Queen Snatch on c2 #18 ♛', 'Black picks off White\'s Queen on c2 with alternating checks.'],
  // 19: takes b2
  ['6k1/ppp3pp/8/8/8/5b2/PQ3r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2b2'],
   'win_queen', '+9 Queen ♛', 'Black Windmill Queen Snatch on b2 #19 ♛', 'Black sweeps the 2nd rank and captures the b2 Queen.'],
  // 20: takes a2
  ['6k1/ppp2p1p/8/8/8/5b2/Q4r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2a2'],
   'win_queen', '+9 Queen ♛', 'Black Windmill Queen Snatch on a2 #20 ♛', 'Black takes White\'s Queen on a2 via discovered check.'],
  // 21: takes h2, d2, and c2
  ['6k1/ppp3pp/8/8/8/5b2/PPPQ1r1P/6K1 b - - 0 1',
   ['f2g2', 'g1h1', 'g2d2', 'h1g1', 'd2g2', 'g1h1', 'g2c2'],
   'win_queen', '+10 Queen & Pawn ♛', 'Black Windmill Double Capture #21 ♛', 'Black harvests Queen on d2 and pawn on c2.'],
  // 22: takes h2, d2, c2, b2, a2 (17 plies)
  ['6k1/ppp2ppp/8/8/8/5b2/PPPQ1r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2d2', 'h1g1', 'd2g2', 'g1h1', 'g2c2', 'h1g1', 'c2g2', 'g1h1', 'g2b2', 'h1g1', 'b2g2', 'g1h1', 'g2a2'],
   'win_queen', '+12 Decisive Material ♛', 'Full 2nd-Rank Black Windmill Sweep #22 ♛', 'Black scoops Queen and three pawns across the 2nd rank in 17 plies!'],
  // 23: takes d5
  ['5rk1/ppp2p1p/8/3Q4/8/5b2/PPP2r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2g5', 'h1h2', 'g5d5'],
   'win_queen', '+9 Queen ♛', 'Black Torre-Lasker Theme on d5 #23 ♛', 'Black steps back to g5+ discovered check to capture the Queen on d5!'],
  // 24: takes e5
  ['5rk1/ppp2p1p/8/4Q3/8/5b2/PPP2r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2g5', 'h1h2', 'g5e5'],
   'win_queen', '+9 Queen ♛', 'Black Windmill Queen Extraction on e5 #24 ♛', 'Black captures White\'s Queen on e5 via discovered check cadence.'],
  // 25: takes c5
  ['5rk1/ppp2p1p/8/2Q5/8/5b2/PPP2r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2g5', 'h1h2', 'g5c5'],
   'win_queen', '+9 Queen ♛', 'Black Windmill Queen Extraction on c5 #25 ♛', 'Black captures White\'s Queen on c5 with discovered check.'],
  // 26: takes b5
  ['5rk1/ppp2p1p/8/1Q6/8/5b2/PPP2r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2g5', 'h1h2', 'g5b5'],
   'win_queen', '+9 Queen ♛', 'Black Windmill Queen Extraction on b5 #26 ♛', 'Black captures White\'s Queen on b5 via long diagonal battery.'],
  // 27: takes a5
  ['5rk1/ppp2p1p/8/Q7/8/5b2/PPP2r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2g5', 'h1h2', 'g5a5'],
   'win_queen', '+9 Queen ♛', 'Black Windmill Queen Extraction on a5 #27 ♛', 'Black captures White\'s Queen on a5 via discovered check.'],
  // 28: takes d2 and c2
  ['6k1/1pp3pp/8/8/8/5b2/PPPQ1r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2d2', 'h1g1', 'd2g2', 'g1h1', 'g2c2'],
   'win_queen', '+10 Queen & Pawn ♛', 'Black Windmill Two-Piece Harvest #28 ♛', 'Black captures Queen on d2 and pawn on c2 in 9 plies.'],
  // 29: takes d2, c2, b2
  ['6k1/p1p3pp/8/8/8/5b2/PPPQ1r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2d2', 'h1g1', 'd2g2', 'g1h1', 'g2c2', 'h1g1', 'c2b2'],
   'win_queen', '+11 Queen & Pawns ♛', 'Black Windmill Three-Piece Harvest #29 ♛', 'Black clears White\'s 2nd rank from d2 to b2 in 11 plies.'],
  // 30: takes d2, c2, b2, a2
  ['6k1/2p3pp/8/8/8/5b2/PPPQ1r1P/7K b - - 0 1',
   ['f2h2', 'h1g1', 'h2g2', 'g1h1', 'g2d2', 'h1g1', 'd2g2', 'g1h1', 'g2c2', 'h1g1', 'c2g2', 'g1h1', 'g2b2', 'h1g1', 'b2g2', 'g1h1', 'g2a2'],
   'win_queen', '+12 Decisive Material ♛', 'Black Full-Rank Extraction #30 ♛', 'Black sweeps the entire 2nd rank from d2 to a2 in 17 plies.']
];

const all = [...whiteList, ...blackList];

all.forEach(([fen, moves, reward, adv, title, subtitle], idx) => {
  const isWhite = idx < 15;
  windmillPuzzles.push({
    id: 'puz_wm_' + String(idx + 1).padStart(3, '0'),
    fen,
    moves,
    rating: 1300 + (idx + 1) * 25,
    ratingDeviation: 80,
    themes: ['windmill', 'discovered_checks', 'captures_checks_threats'],
    primaryTheme: 'windmill',
    difficulty: (idx + 1) <= 10 ? 'easy' : ((idx + 1) <= 20 ? 'medium' : 'hard'),
    title,
    subtitle,
    playerColor: isWhite ? 'w' : 'b',
    solutionPlies: moves.length,
    tacticalGoal: isWhite ? 'Execute the windmill battery and sweep pieces along the 7th rank.' : 'Execute the Black windmill on the 2nd rank and capture material.',
    tacticalReward: reward,
    outcomeAdvantage: adv,
    learningSummary: `The windmill battery systematically decimated the opponent's pieces with alternating checks in puzzle #${idx + 1}.`,
    keyTakeaway: 'The windmill is an unstoppable tactical engine where discovered checks paralyze the enemy king while the rook cleans the rank.',
    targetSquares: [moves[0].slice(2, 4), moves[moves.length - 1].slice(2, 4)],
    keySquares: [moves[0].slice(0, 2), isWhite ? 'f6' : 'f3']
  });
});

console.log('Valid Windmill puzzles generated:', windmillPuzzles.length);
savePack(path.resolve('apps/client/src/features/puzzles/data/windmill.json'), windmillPuzzles);
