import { Chess } from 'chess.js';
import path from 'path';
import { validateAndEnrich, savePack } from '../validator.mjs';

const smotheredData = [
  // --- White 7-ply Smothered Mates (1 - 8) ---
  // 1: Qc4, Ng5
  ['5r1k/5ppp/8/6N1/2Q5/8/8/6K1 w - - 0 1',
   ['g5f7', 'h8g8', 'f7h6', 'g8h8', 'c4g8', 'f8g8', 'h6f7'],
   'w', 1300, 'Philidor\'s Legacy with Qc4 & Ng5 #1 👑', '1. Nf7+ Kg8 2. Nh6+ Kh8 3. Qg8+ Rxg8 4. Nf7# executes classic smothered mate.'],
  // 2: Qb3, Ng5
  ['5r1k/5ppp/8/6N1/8/1Q6/8/6K1 w - - 0 1',
   ['g5f7', 'h8g8', 'f7h6', 'g8h8', 'b3g8', 'f8g8', 'h6f7'],
   'w', 1350, 'Philidor\'s Legacy with Qb3 #2 👑', 'White uses the b3 diagonal to deliver the smothered mate.'],
  // 3: Qa2, Ng5
  ['5r1k/5ppp/8/6N1/8/8/Q7/6K1 w - - 0 1',
   ['g5f7', 'h8g8', 'f7h6', 'g8h8', 'a2g8', 'f8g8', 'h6f7'],
   'w', 1400, 'Long-Diagonal Philidor with Qa2 #3 👑', 'Queen penetrates from a2 to set up 4. Nf7#.'],
  // 4: Qd5, Ng5
  ['5r1k/5ppp/8/3Q2N1/8/8/8/6K1 w - - 0 1',
   ['g5f7', 'h8g8', 'f7h6', 'g8h8', 'd5g8', 'f8g8', 'h6f7'],
   'w', 1450, 'Central Queen Philidor with Qd5 #4 👑', 'Centralized queen and knight dismantle Black\'s kingside.'],
  // 5: Qc4, Ne5
  ['5r1k/5ppp/8/4N3/2Q5/8/8/6K1 w - - 0 1',
   ['e5f7', 'h8g8', 'f7h6', 'g8h8', 'c4g8', 'f8g8', 'h6f7'],
   'w', 1500, 'Philidor with Ne5 Jumper #5 👑', 'Knight launches from e5 into f7 to begin the combination.'],
  // 6: Qb3, Ne5
  ['5r1k/5ppp/8/4N3/8/1Q6/8/6K1 w - - 0 1',
   ['e5f7', 'h8g8', 'f7h6', 'g8h8', 'b3g8', 'f8g8', 'h6f7'],
   'w', 1550, 'Philidor Double Check Cadence #6 👑', 'Knight and Queen double check leaves Black with only 2...Kh8.'],
  // 7: Qa2, Ne5
  ['5r1k/5ppp/8/4N3/8/8/Q7/6K1 w - - 0 1',
   ['e5f7', 'h8g8', 'f7h6', 'g8h8', 'a2g8', 'f8g8', 'h6f7'],
   'w', 1600, 'Philidor with Qa2 Battery #7 👑', 'Long-range Queen sacrifice on g8 forces rook capture.'],
  // 8: Qd5, Ne5
  ['5r1k/5ppp/8/3QN3/8/8/8/6K1 w - - 0 1',
   ['e5f7', 'h8g8', 'f7h6', 'g8h8', 'd5g8', 'f8g8', 'h6f7'],
   'w', 1650, 'Dominant Center Smothered Mate #8 👑', 'Queen and knight dominate the board to deliver 4. Nf7#.'],

  // --- White 5-ply / 3-ply Smothered Mates (9 - 15) ---
  // 9: 5-ply with Nh6 double check from f7
  ['5rk1/5Npp/8/8/2Q5/8/8/6K1 w - - 0 1',
   ['f7h6', 'g8h8', 'c4g8', 'f8g8', 'h6f7'],
   'w', 1700, 'Double Check Flash with Nh6+ #9 👑', '1. Nh6+ Kh8 2. Qg8+ Rxg8 3. Nf7# finishes Black in 5 plies.'],
  // 10: 5-ply with Qb3
  ['5rk1/5Npp/8/8/8/1Q6/8/6K1 w - - 0 1',
   ['f7h6', 'g8h8', 'b3g8', 'f8g8', 'h6f7'],
   'w', 1750, 'Double Check from b3 #10 👑', 'White delivers double check and Queen sacrifice on g8.'],
  // 11: 5-ply with Qa2
  ['5rk1/5Npp/8/8/8/8/Q7/6K1 w - - 0 1',
   ['f7h6', 'g8h8', 'a2g8', 'f8g8', 'h6f7'],
   'w', 1800, 'Double Check along a2-g8 Diagonal #11 👑', 'Double check forces the king to the corner before Qg8+.'],
  // 12: 5-ply with Qd5
  ['5rk1/5Npp/8/3Q4/8/8/8/6K1 w - - 0 1',
   ['f7h6', 'g8h8', 'd5g8', 'f8g8', 'h6f7'],
   'w', 1850, '5-Ply Central Smothered Sequence #12 👑', '1. Nh6+ Kh8 2. Qg8+ Rxg8 3. Nf7# concludes the attack.'],
  // 13: 3-ply with Nh6 and Qc4
  ['5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1',
   ['c4g8', 'f8g8', 'h6f7'],
   'w', 1900, 'Direct Queen Sacrifice on g8 #13 👑', '1. Qg8+ Rxg8 2. Nf7# executes the 3-ply finish.'],
  // 14: 3-ply with Nh6 and Qb3
  ['5r1k/6pp/7N/8/8/1Q6/8/6K1 w - - 0 1',
   ['b3g8', 'f8g8', 'h6f7'],
   'w', 1950, 'Queen Decoy on g8 #14 👑', '1. Qg8+ forces the rook into the corner before Nf7#.'],
  // 15: 3-ply with Nh6 and Qa2
  ['5r1k/6pp/7N/8/8/8/Q7/6K1 w - - 0 1',
   ['a2g8', 'f8g8', 'h6f7'],
   'w', 2000, 'Lightning Queen Sac on g8 #15 👑', '1. Qg8+ Rxg8 2. Nf7# ends the game on the spot.'],

  // --- Black 7-ply Smothered Mates (16 - 23) ---
  // 16: Qc5, Ng4
  ['6k1/8/8/2q5/6n1/8/5PPP/5R1K b - - 0 1',
   ['g4f2', 'h1g1', 'f2h3', 'g1h1', 'c5g1', 'f1g1', 'h3f2'],
   'b', 1300, 'Black Philidor\'s Legacy #16 👑', '1...Nf2+ 2. Kg1 3...Nh3+ 4. Kh1 5...Qg1+ 6. Rxg1 7...Nf2#.'],
  // 17: Qb6, Ng4
  ['6k1/8/1q6/8/6n1/8/5PPP/5R1K b - - 0 1',
   ['g4f2', 'h1g1', 'f2h3', 'g1h1', 'b6g1', 'f1g1', 'h3f2'],
   'b', 1350, 'Black Philidor with Qb6 #17 👑', 'Black uses the b6 diagonal to deliver smothered mate.'],
  // 18: Qa7, Ng4
  ['6k1/q7/8/8/6n1/8/5PPP/5R1K b - - 0 1',
   ['g4f2', 'h1g1', 'f2h3', 'g1h1', 'a7g1', 'f1g1', 'h3f2'],
   'b', 1400, 'Black Philidor with Qa7 Battery #18 👑', 'Long-range Queen sacrifice on g1 forces rook capture.'],
  // 19: Qd4, Ng4
  ['6k1/8/8/8/3q2n1/8/5PPP/5R1K b - - 0 1',
   ['g4f2', 'h1g1', 'f2h3', 'g1h1', 'd4g1', 'f1g1', 'h3f2'],
   'b', 1450, 'Black Central Queen Philidor #19 👑', 'Black dominates the center to deliver 4...Nf2#.'],
  // 20: Qc5, Ne4
  ['6k1/8/8/2q5/4n3/8/5PPP/5R1K b - - 0 1',
   ['e4f2', 'h1g1', 'f2h3', 'g1h1', 'c5g1', 'f1g1', 'h3f2'],
   'b', 1500, 'Black Philidor with Ne4 Jumper #20 👑', 'Knight launches from e4 into f2 to begin the combination.'],
  // 21: Qb6, Ne4
  ['6k1/8/1q6/8/4n3/8/5PPP/5R1K b - - 0 1',
   ['e4f2', 'h1g1', 'f2h3', 'g1h1', 'b6g1', 'f1g1', 'h3f2'],
   'b', 1550, 'Black Double Check Cadence #21 👑', 'Knight and Queen double check leaves White with only 2. Kh1.'],
  // 22: Qa7, Ne4
  ['6k1/q7/8/8/4n3/8/5PPP/5R1K b - - 0 1',
   ['e4f2', 'h1g1', 'f2h3', 'g1h1', 'a7g1', 'f1g1', 'h3f2'],
   'b', 1600, 'Black Philidor with Long Diagonal #22 👑', 'Black sacrifices the Queen on g1 before delivering Nf2#.'],
  // 23: Qd4, Ne4
  ['6k1/8/8/8/3qn3/8/5PPP/5R1K b - - 0 1',
   ['e4f2', 'h1g1', 'f2h3', 'g1h1', 'd4g1', 'f1g1', 'h3f2'],
   'b', 1650, 'Black Dominant Center Smothered Mate #23 👑', 'Black concludes the 7-ply sequence with 4...Nf2#.'],

  // --- Black 5-ply / 3-ply Smothered Mates (24 - 30) ---
  // 24: 5-ply with Nh3 double check from f2
  ['6k1/8/8/2q5/8/8/5nPP/5RK1 b - - 0 1',
   ['f2h3', 'g1h1', 'c5g1', 'f1g1', 'h3f2'],
   'b', 1700, 'Black Double Check Flash with Nh3+ #24 👑', '1...Nh3+ 2. Kh1 3...Qg1+ 4. Rxg1 5...Nf2#.'],
  // 25: 5-ply with Qb6
  ['6k1/8/1q6/8/8/8/5nPP/5RK1 b - - 0 1',
   ['f2h3', 'g1h1', 'b6g1', 'f1g1', 'h3f2'],
   'b', 1750, 'Black Double Check from b6 #25 👑', 'Double check forces White into 2. Kh1 before Qg1+.'],
  // 26: 5-ply with Qa7
  ['6k1/q7/8/8/8/8/5nPP/5RK1 b - - 0 1',
   ['f2h3', 'g1h1', 'a7g1', 'f1g1', 'h3f2'],
   'b', 1800, 'Black 5-Ply Queen Sac from a7 #26 👑', 'Black deflects White\'s rook to deliver 3...Nf2#.'],
  // 27: 5-ply with Qd4
  ['6k1/8/8/8/3q4/8/5nPP/5RK1 b - - 0 1',
   ['f2h3', 'g1h1', 'd4g1', 'f1g1', 'h3f2'],
   'b', 1850, 'Black Central 5-Ply Smothered Finish #27 👑', '1...Nh3+ 2. Kh1 3...Qg1+ 4. Rxg1 5...Nf2#.'],
  // 28: 3-ply with Nh3 and Qc5
  ['6k1/8/8/2q5/8/7n/6PP/5R1K b - - 0 1',
   ['c5g1', 'f1g1', 'h3f2'],
   'b', 1900, 'Black Direct Queen Sacrifice on g1 #28 👑', '1...Qg1+ 2. Rxg1 3...Nf2#.'],
  // 29: 3-ply with Nh3 and Qb6
  ['6k1/8/1q6/8/8/7n/6PP/5R1K b - - 0 1',
   ['b6g1', 'f1g1', 'h3f2'],
   'b', 1950, 'Black Queen Decoy on g1 #29 👑', '1...Qg1+ forces White\'s rook into g1 before Nf2#.'],
  // 30: 3-ply with Nh3 and Qa7
  ['6k1/q7/8/8/8/7n/6PP/5R1K b - - 0 1',
   ['a7g1', 'f1g1', 'h3f2'],
   'b', 2000, 'Black Lightning Queen Sac on g1 #30 👑', '1...Qg1+ 2. Rxg1 3...Nf2# ends the game immediately.']
];

const puzzles = [];
smotheredData.forEach(([fen, moves, color, rating, title, subtitle], idx) => {
  puzzles.push({
    id: 'puz_sm_' + String(idx + 1).padStart(3, '0'),
    fen,
    moves,
    rating,
    ratingDeviation: 80,
    themes: ['smothered_mate', 'captures_checks_threats'],
    primaryTheme: 'smothered_mate',
    difficulty: rating < 1500 ? 'medium' : (rating < 1800 ? 'hard' : 'expert'),
    title,
    subtitle,
    playerColor: color,
    solutionPlies: moves.length,
    tacticalGoal: 'Sacrifice the Queen and execute the smothered checkmate with the Knight.',
    tacticalReward: 'checkmate',
    outcomeAdvantage: 'Checkmate 👑',
    learningSummary: `${subtitle} executing the classic Philidor smothered mate sequence.`,
    keyTakeaway: 'The smothered mate traps the king behind its own pieces using double check and a forcing queen sacrifice.',
    targetSquares: [moves[moves.length - 1].slice(2, 4)],
    keySquares: [moves[0].slice(0, 2), moves[moves.length - 1].slice(2, 4)]
  });
});

console.log('Total Smothered Mate puzzles generated:', puzzles.length);
savePack(path.resolve('apps/client/src/features/puzzles/data/smothered.json'), puzzles);
