import { Chess } from 'chess.js';
import path from 'path';
import { validateAndEnrich, savePack } from '../validator.mjs';

const puzzlesData = [
  // --- Anastasia's Mates (1 - 15) ---
  // 1: White d5-f4-d3
  ['5rk1/5ppp/8/3N4/5R2/3Q4/8/6K1 w - - 0 1',
   ['d5e7', 'g8h8', 'd3h7', 'h8h7', 'f4h4'],
   'w', 1200, 'Anastasia\'s Mate with f4 Rook #1 👑', '1. Ne7+ Kh8 2. Qxh7+ Kxh7 3. Rh4# seals Black along the h-file.'],
  // 2: White d5-e3-d3
  ['5rk1/5ppp/8/3N4/8/3QR3/8/6K1 w - - 0 1',
   ['d5e7', 'g8h8', 'd3h7', 'h8h7', 'e3h3'],
   'w', 1250, 'Anastasia\'s Mate from e3 #2 👑', 'White executes the classic queen sacrifice and rook mate on h3.'],
  // 3: White d5-d4-d3
  ['5rk1/5ppp/8/3N4/3R4/3Q4/8/6K1 w - - 0 1',
   ['d5e7', 'g8h8', 'd3h7', 'h8h7', 'd4h4'],
   'w', 1300, 'Anastasia\'s Mate with d4 Rook #3 👑', 'Rook sweeps from d4 to h4 for checkmate.'],
  // 4: White d5-c4-d3
  ['5rk1/5ppp/8/3N4/2R5/3Q4/8/6K1 w - - 0 1',
   ['d5e7', 'g8h8', 'd3h7', 'h8h7', 'c4h4'],
   'w', 1350, 'Anastasia\'s Mate from c4 #4 👑', 'Queen sacrifice on h7 opens the h-file for the c4 rook.'],
  // 5: White d5-b4-d3
  ['5rk1/5ppp/8/3N4/1R6/3Q4/8/6K1 w - - 0 1',
   ['d5e7', 'g8h8', 'd3h7', 'h8h7', 'b4h4'],
   'w', 1400, 'Anastasia\'s Mate from b4 #5 👑', 'Long-range rook slide to h4 concludes the Anastasia combination.'],
  // 6: White d5-a4-d3
  ['5rk1/5ppp/8/3N4/R7/3Q4/8/6K1 w - - 0 1',
   ['d5e7', 'g8h8', 'd3h7', 'h8h7', 'a4h4'],
   'w', 1450, 'Anastasia\'s Full-Rank Sweep #6 👑', 'Rook on a4 travels all the way to h4 for mate.'],
  // 7: White f5-f4-d3
  ['5rk1/5ppp/8/5N2/5R2/3Q4/8/6K1 w - - 0 1',
   ['f5e7', 'g8h8', 'd3h7', 'h8h7', 'f4h4'],
   'w', 1500, 'Anastasia\'s Mate from f5 #7 👑', 'Knight jumps from f5 to e7 establishing the key cutoff.'],
  // 8: White f5-f3-d3
  ['5rk1/5ppp/8/5N2/8/3Q1R2/8/6K1 w - - 0 1',
   ['f5e7', 'g8h8', 'd3h7', 'h8h7', 'f3h3'],
   'w', 1550, 'Anastasia\'s Mate with f3 Rook #8 👑', '1. Ne7+ followed by Qxh7+ and Rh3#.'],

  // 9: Black d4-f5-d6
  ['6k1/8/3q4/5r2/3n4/8/5PPP/5RK1 b - - 0 1',
   ['d4e2', 'g1h1', 'd6h2', 'h1h2', 'f5h5'],
   'b', 1600, 'Black Anastasia\'s Mate #9 👑', '1...Ne2+ 2. Kh1 3...Qxh2+ 4. Kxh2 5...Rh5#.'],
  // 10: Black d4-f6-d6
  ['6k1/8/3q1r2/8/3n4/8/5PPP/5RK1 b - - 0 1',
   ['d4e2', 'g1h1', 'd6h2', 'h1h2', 'f6h6'],
   'b', 1650, 'Black Anastasia\'s Mate from f6 #10 👑', 'Black rook on f6 delivers the final checkmate on h6.'],
  // 11: Black d4-d5-d6
  ['6k1/8/3q4/3r4/3n4/8/5PPP/5RK1 b - - 0 1',
   ['d4e2', 'g1h1', 'd6h2', 'h1h2', 'd5h5'],
   'b', 1700, 'Black Anastasia\'s Mate from d5 #11 👑', 'Central d5 rook slides to h5 to deliver mate.'],
  // 12: Black d4-c5-d6
  ['6k1/8/3q4/2r5/3n4/8/5PPP/5RK1 b - - 0 1',
   ['d4e2', 'g1h1', 'd6h2', 'h1h2', 'c5h5'],
   'b', 1750, 'Black Anastasia\'s Mate from c5 #12 👑', 'Queen sacrifice breaks White\'s shelter before 3...Rh5#.'],
  // 13: Black d4-b5-d6
  ['6k1/8/3q4/1r6/3n4/8/5PPP/5RK1 b - - 0 1',
   ['d4e2', 'g1h1', 'd6h2', 'h1h2', 'b5h5'],
   'b', 1800, 'Black Anastasia\'s Mate from b5 #13 👑', 'Long-range rook slide to h5 finishes the combination.'],
  // 14: Black d4-a5-d6
  ['6k1/8/3q4/r7/3n4/8/5PPP/5RK1 b - - 0 1',
   ['d4e2', 'g1h1', 'd6h2', 'h1h2', 'a5h5'],
   'b', 1850, 'Black Anastasia\'s Full-Rank Sweep #14 👑', 'Rook sweeps from a5 to h5.'],
  // 15: Black f4-f5-d6
  ['6k1/8/3q4/5r2/5n2/8/5PPP/5RK1 b - - 0 1',
   ['f4e2', 'g1h1', 'd6h2', 'h1h2', 'f5h5'],
   'b', 1900, 'Black Anastasia\'s Mate from f4 #15 👑', 'Knight on f4 initiates the 5-ply Anastasia mate.'],

  // --- Hook Mates (16 - 30) ---
  // 16: White d1-d8-e8
  ['5k2/5p2/4pNp1/4P1P1/8/8/8/3R2K1 w - - 0 1',
   ['d1d8', 'f8e7', 'd8e8'],
   'w', 1200, 'Classic White Hook Mate on e8 #16 👑', '1. Rd8+ Ke7 2. Re8# supported by the f6 Knight.'],
  // 17: White c1-c8-e8
  ['5k2/5p2/4pNp1/4P1P1/8/8/8/2R3K1 w - - 0 1',
   ['c1c8', 'f8e7', 'c8e8'],
   'w', 1250, 'White Hook Mate from c1 #17 👑', 'Rook checks on c8 before delivering Re8#.'],
  // 18: White b1-b8-e8
  ['5k2/5p2/4pNp1/4P1P1/8/8/8/1R4K1 w - - 0 1',
   ['b1b8', 'f8e7', 'b8e8'],
   'w', 1300, 'White Hook Mate from b1 #18 👑', 'White slides the b-file rook into the hook mate.'],
  // 19: White a1-a8-e8
  ['5k2/5p2/4pNp1/4P1P1/8/8/8/R5K1 w - - 0 1',
   ['a1a8', 'f8e7', 'a8e8'],
   'w', 1350, 'White Hook Mate from a1 #19 👑', 'Long-range rook check forces the king to e7 before Re8#.'],
  // 20: White d2-d8-e8
  ['5k2/5p2/4pNp1/4P1P1/8/8/3R4/6K1 w - - 0 1',
   ['d2d8', 'f8e7', 'd8e8'],
   'w', 1400, 'White Hook Mate from d2 #20 👑', '2nd-rank rook penetrates on d8 to deliver the hook mate.'],
  // 21: White c2-c8-e8
  ['5k2/5p2/4pNp1/4P1P1/8/8/2R5/6K1 w - - 0 1',
   ['c2c8', 'f8e7', 'c8e8'],
   'w', 1450, 'White Hook Mate from c2 #21 👑', 'White rook crashes in on c8 before administering Re8#.'],
  // 22: White b2-b8-e8
  ['5k2/5p2/4pNp1/4P1P1/8/8/1R6/6K1 w - - 0 1',
   ['b2b8', 'f8e7', 'b8e8'],
   'w', 1500, 'White Hook Mate from b2 #22 👑', 'b2 rook delivers the forcing check on b8.'],
  // 23: White a2-a8-e8
  ['5k2/5p2/4pNp1/4P1P1/8/8/R7/6K1 w - - 0 1',
   ['a2a8', 'f8e7', 'a8e8'],
   'w', 1550, 'White Hook Mate from a2 #23 👑', 'Rook on a2 drives Black\'s king into the fatal hook.'],

  // 24: Black d8-d1-e1
  ['k2r4/8/8/8/4p1p1/4PnP1/5P2/5K2 b - - 0 1',
   ['d8d1', 'f1e2', 'd1e1'],
   'b', 1600, 'Black Hook Mate on e1 #24 👑', '1...Rd1+ 2. Ke2 3...Re1# supported by the f3 knight.'],
  // 25: Black c8-c1-e1
  ['k1r5/8/8/8/4p1p1/4PnP1/5P2/5K2 b - - 0 1',
   ['c8c1', 'f1e2', 'c1e1'],
   'b', 1650, 'Black Hook Mate from c8 #25 👑', 'Rook penetrates from c8 into e1.'],
  // 26: Black b8-b1-e1
  ['kr6/8/8/8/4p1p1/4PnP1/5P2/5K2 b - - 0 1',
   ['b8b1', 'f1e2', 'b1e1'],
   'b', 1700, 'Black Hook Mate from b8 #26 👑', 'Black slides b-file rook into the hook mate.'],
  // 27: Black a8-a1-e1
  ['r1k5/8/8/8/4p1p1/4PnP1/5P2/5K2 b - - 0 1',
   ['a8a1', 'f1e2', 'a1e1'],
   'b', 1750, 'Black Hook Mate from a8 #27 👑', 'Long-range a8 rook check forces Ke2 before Re1#.'],
  // 28: Black d7-d1-e1
  ['k7/3r4/8/8/4p1p1/4PnP1/5P2/5K2 b - - 0 1',
   ['d7d1', 'f1e2', 'd1e1'],
   'b', 1800, 'Black Hook Mate from d7 #28 👑', '7th-rank rook crashes in on d1 to deliver Re1#.'],
  // 29: Black c7-c1-e1
  ['k7/2r5/8/8/4p1p1/4PnP1/5P2/5K2 b - - 0 1',
   ['c7c1', 'f1e2', 'c1e1'],
   'b', 1850, 'Black Hook Mate from c7 #29 👑', 'Black forces Ke2 before the decisive Re1#.'],
  // 30: Black b7-b1-e1
  ['k7/1r6/8/8/4p1p1/4PnP1/5P2/5K2 b - - 0 1',
   ['b7b1', 'f1e2', 'b1e1'],
   'b', 1900, 'Black Hook Mate from b7 #30 👑', 'Rook on b7 completes the hook mate combination.']
];

const puzzles = [];
puzzlesData.forEach(([fen, moves, color, rating, title, subtitle], idx) => {
  const isAnastasia = idx < 15;
  puzzles.push({
    id: 'puz_ah_' + String(idx + 1).padStart(3, '0'),
    fen,
    moves,
    rating,
    ratingDeviation: 80,
    themes: [isAnastasia ? 'anastasia_mate' : 'hook_mate', 'captures_checks_threats'],
    primaryTheme: isAnastasia ? 'anastasia_mate' : 'hook_mate',
    difficulty: rating < 1400 ? 'easy' : (rating < 1700 ? 'medium' : 'hard'),
    title,
    subtitle,
    playerColor: color,
    solutionPlies: moves.length,
    tacticalGoal: isAnastasia ? 'Sacrifice on the h-file and execute Anastasia\'s checkmate.' : 'Coordinate Rook, Knight, and Pawn to execute the Hook Mate.',
    tacticalReward: 'checkmate',
    outcomeAdvantage: 'Checkmate 👑',
    learningSummary: `${subtitle} demonstrating lethal Knight and Rook coordination.`,
    keyTakeaway: isAnastasia ? 'Anastasia\'s mate traps the king on the h-file using a Knight to guard g8 and g6.' : 'The Hook Mate pairs a Rook and a pawn-protected Knight to build an inescapable mating net.',
    targetSquares: [moves[moves.length - 1].slice(2, 4)],
    keySquares: [moves[0].slice(0, 2), moves[moves.length - 1].slice(2, 4)]
  });
});

console.log('Total Anastasia & Hook Mate puzzles generated:', puzzles.length);
savePack(path.resolve('apps/client/src/features/puzzles/data/anastasia_hook.json'), puzzles);
