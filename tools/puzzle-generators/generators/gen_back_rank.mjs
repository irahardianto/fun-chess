import { Chess } from 'chess.js';
import path from 'path';
import { validateAndEnrich, savePack } from '../validator.mjs';

const backRankData = [
  // 1. White 1-ply d8 mate
  ['6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1', ['d1d8'], 'w', 650, 'Back-Rank Mate on d8 #1 👑', '1. Rd8# delivers instant back-rank checkmate.'],
  // 2. White 1-ply e8 mate
  ['6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', ['e1e8'], 'w', 680, 'Back-Rank Mate on e8 #2 👑', '1. Re8# slides across the open e-file.'],
  // 3. White 1-ply c8 mate
  ['6k1/5ppp/8/8/8/8/8/2R3K1 w - - 0 1', ['c1c8'], 'w', 700, 'Back-Rank Mate on c8 #3 👑', '1. Rc8# seals the back rank on the c-file.'],
  // 4. White 1-ply b8 mate
  ['6k1/5ppp/8/8/8/8/8/1R4K1 w - - 0 1', ['b1b8'], 'w', 720, 'Back-Rank Mate on b8 #4 👑', '1. Rb8# penetrates on the open b-file.'],
  // 5. White 1-ply a8 mate
  ['6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8'], 'w', 750, 'Back-Rank Mate on a8 #5 👑', '1. Ra8# finishes the game along the a-file.'],
  // 6. White 1-ply Qd8 mate from d2
  ['6k1/5ppp/8/8/8/8/3Q4/6K1 w - - 0 1', ['d2d8'], 'w', 770, 'Back-Rank Queen Mate on d8 #6 👑', '1. Qd8# invades on the d-file.'],
  // 7. White 1-ply Qe8 mate from e2
  ['6k1/5ppp/8/8/8/8/4Q3/6K1 w - - 0 1', ['e2e8'], 'w', 800, 'Back-Rank Queen Mate on e8 #7 👑', '1. Qe8# delivers unstoppable checkmate.'],
  // 8. White 1-ply Qc8 mate from c2
  ['6k1/5ppp/8/8/8/8/2Q5/6K1 w - - 0 1', ['c2c8'], 'w', 830, 'Back-Rank Queen Mate on c8 #8 👑', '1. Qc8# finishes Black along the c-file.'],

  // 9. Black 1-ply d1 mate
  ['3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', ['d8d1'], 'b', 850, 'Black Back-Rank Mate on d1 #9 👑', '1...Rd1# punishes White\'s lack of luft.'],
  // 10. Black 1-ply e1 mate
  ['4r1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', ['e8e1'], 'b', 880, 'Black Back-Rank Mate on e1 #10 👑', '1...Re1# checks White along the e-file.'],
  // 11. Black 1-ply c1 mate
  ['2r3k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', ['c8c1'], 'b', 900, 'Black Back-Rank Mate on c1 #11 👑', '1...Rc1# penetrates on the open c-file.'],
  // 12. Black 1-ply b1 mate
  ['1r4k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', ['b8b1'], 'b', 920, 'Black Back-Rank Mate on b1 #12 👑', '1...Rb1# concludes the back-rank attack.'],
  // 13. Black 1-ply a1 mate
  ['r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', ['a8a1'], 'b', 950, 'Black Back-Rank Mate on a1 #13 👑', '1...Ra1# delivers mate along the a-file.'],
  // 14. Black 1-ply Qd1 mate from d7
  ['6k1/3q1ppp/8/8/8/8/5PPP/6K1 b - - 0 1', ['d7d1'], 'b', 970, 'Black Queen Mate on d1 #14 👑', '1...Qd1# invades the 1st rank with decisive force.'],
  // 15. Black 1-ply Qe1 mate from e7
  ['6k1/4q1pp/8/8/8/8/5PPP/6K1 b - - 0 1', ['e7e1'], 'b', 1000, 'Black Queen Mate on e1 #15 👑', '1...Qe1# delivers instant checkmate on the e-file.'],
  // 16. Black 1-ply Qc1 mate from c7
  ['6k1/2q1pppp/8/8/8/8/5PPP/6K1 b - - 0 1', ['c7c1'], 'b', 1030, 'Black Queen Mate on c1 #16 👑', '1...Qc1# finishes White along the c-file.'],

  // 17. White 3-ply d2d8 a8d8 d1d8
  ['r5k1/5ppp/8/8/8/8/3R4/3R2K1 w - - 0 1', ['d2d8', 'a8d8', 'd1d8'], 'w', 1050, 'Doubled Rooks on the d-File #17 👑', '1. Rd8+ Rxd8 2. Rxd8# overpowers the defender.'],
  // 18. White 3-ply e2e8 a8e8 e1e8
  ['r5k1/5ppp/8/8/8/8/4R3/4R1K1 w - - 0 1', ['e2e8', 'a8e8', 'e1e8'], 'w', 1100, 'Doubled Rooks on the e-File #18 👑', '1. Re8+ Rxe8 2. Rxe8# crushes the back rank.'],
  // 19. White 3-ply c2c8 a8c8 c1c8
  ['r5k1/5ppp/8/8/8/8/2R5/2R3K1 w - - 0 1', ['c2c8', 'a8c8', 'c1c8'], 'w', 1150, 'Doubled Rooks on the c-File #19 👑', '1. Rc8+ Rxc8 2. Rxc8# overpowers c8.'],
  // 20. White 3-ply b2b8 a8b8 b1b8
  ['r5k1/5ppp/8/8/8/8/1R6/1R4K1 w - - 0 1', ['b2b8', 'a8b8', 'b1b8'], 'w', 1200, 'Doubled Rooks on the b-File #20 👑', '1. Rb8+ Rxb8 2. Rxb8# finishes Black on b8.'],
  // 21. White 3-ply d3d8 a8d8 d1d8
  ['r5k1/5ppp/8/8/8/3R4/8/3R2K1 w - - 0 1', ['d3d8', 'a8d8', 'd1d8'], 'w', 1250, '3rd-Rank Lift into Back Rank #21 👑', '1. Rd8+ Rxd8 2. Rxd8# executes a clean sacrifice.'],
  // 22. White 3-ply e3e8 a8e8 e1e8
  ['r5k1/5ppp/8/8/8/4R3/8/4R1K1 w - - 0 1', ['e3e8', 'a8e8', 'e1e8'], 'w', 1300, '3rd-Rank Lift on the e-File #22 👑', '1. Re8+ Rxe8 2. Rxe8# overwhelms Black.'],
  // 23. White 3-ply c3c8 a8c8 c1c8
  ['r5k1/5ppp/8/8/8/2R5/8/2R3K1 w - - 0 1', ['c3c8', 'a8c8', 'c1c8'], 'w', 1350, '3rd-Rank Lift on the c-File #23 👑', '1. Rc8+ Rxc8 2. Rxc8# finishes the game.'],
  // 24. White 3-ply e2e8 with Qd7
  ['6k1/3q1ppp/8/8/8/8/4R3/4R1K1 w - - 0 1', ['e2e8', 'd7e8', 'e1e8'], 'w', 1400, 'Queen Deflection into Back-Rank Mate #24 👑', '1. Re8+ Qxe8 2. Rxe8# overpowers the Queen defender.'],

  // 25. Black 3-ply d7d1 a1d1 d8d1
  ['3r2k1/3r4/8/8/8/8/5PPP/R5K1 b - - 0 1', ['d7d1', 'a1d1', 'd8d1'], 'b', 1450, 'Black Doubled Rooks on d1 #25 👑', '1...Rd1+ 2. Rxd1 Rxd1# overpowers the 1st rank.'],
  // 26. Black 3-ply e7e1 a1e1 e8e1
  ['4r1k1/4r3/8/8/8/8/5PPP/R5K1 b - - 0 1', ['e7e1', 'a1e1', 'e8e1'], 'b', 1500, 'Black Doubled Rooks on e1 #26 👑', '1...Re1+ 2. Rxe1 Rxe1# breaks through on e1.'],
  // 27. Black 3-ply c7c1 a1c1 c8c1
  ['2r3k1/2r5/8/8/8/8/5PPP/R5K1 b - - 0 1', ['c7c1', 'a1c1', 'c8c1'], 'b', 1550, 'Black Doubled Rooks on c1 #27 👑', '1...Rc1+ 2. Rxc1 Rxc1# concludes the assault.'],
  // 28. Black 3-ply b7b1 a1b1 b8b1
  ['1r4k1/1r6/8/8/8/8/5PPP/R5K1 b - - 0 1', ['b7b1', 'a1b1', 'b8b1'], 'b', 1600, 'Black Doubled Rooks on b1 #28 👑', '1...Rb1+ 2. Rxb1 Rxb1# crushes the 1st rank.'],
  // 29. Black 3-ply d6d1 a1d1 d8d1
  ['3r2k1/8/3r4/8/8/8/5PPP/R5K1 b - - 0 1', ['d6d1', 'a1d1', 'd8d1'], 'b', 1650, 'Black 6th-Rank Lift into d1 #29 👑', '1...Rd1+ 2. Rxd1 Rxd1# executes the sacrifice.'],
  // 30. Black 3-ply e6e1 a1e1 e8e1
  ['4r1k1/8/4r3/8/8/8/5PPP/R5K1 b - - 0 1', ['e6e1', 'a1e1', 'e8e1'], 'b', 1700, 'Black 6th-Rank Lift into e1 #30 👑', '1...Re1+ 2. Rxe1 Rxe1# completes the corridor mate.'],
  // 31. Black 3-ply c6c1 a1c1 c8c1
  ['2r3k1/8/2r5/8/8/8/5PPP/R5K1 b - - 0 1', ['c6c1', 'a1c1', 'c8c1'], 'b', 1750, 'Black 6th-Rank Lift into c1 #31 👑', '1...Rc1+ 2. Rxc1 Rxc1# finishes White.'],
  // 32. Black 3-ply e7e1 with Qd1
  ['4r1k1/4r3/8/8/8/8/5PPP/3Q2K1 b - - 0 1', ['e7e1', 'd1e1', 'e8e1'], 'b', 1800, 'Black Queen Deflection on e1 #32 👑', '1...Re1+ 2. Qxe1 Rxe1# overpowers White\'s Queen.']
];

const puzzles = [];
backRankData.forEach(([fen, moves, color, rating, title, subtitle], idx) => {
  puzzles.push({
    id: 'puz_br_' + String(idx + 1).padStart(3, '0'),
    fen,
    moves,
    rating,
    ratingDeviation: 80,
    themes: ['back_rank', 'captures_checks_threats'],
    primaryTheme: 'back_rank',
    difficulty: rating < 1000 ? 'easy' : (rating < 1500 ? 'medium' : 'hard'),
    title,
    subtitle,
    playerColor: color,
    solutionPlies: moves.length,
    tacticalGoal: 'Penetrate the enemy back rank and deliver checkmate.',
    tacticalReward: 'checkmate',
    outcomeAdvantage: 'Checkmate 👑',
    learningSummary: `${subtitle} exploiting the trapped enemy king with zero escape squares.`,
    keyTakeaway: 'Kings lacking escape squares (luft) are vulnerable to decisive corridor checkmates along open files.',
    targetSquares: [moves[0].slice(2, 4)],
    keySquares: [moves[0].slice(0, 2), moves[0].slice(2, 4)]
  });
});

console.log('Total Back-Rank puzzles generated:', puzzles.length);
savePack(path.resolve('apps/client/src/features/puzzles/data/back_rank.json'), puzzles);
