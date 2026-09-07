import { Chess } from 'chess.js';
import path from 'path';
import { validateAndEnrich, savePack } from '../validator.mjs';

const endgameData = [
  // --- Lucena Positions (White & Black) (1 - 10) ---
  // 1: White e-file Lucena
  ['4K3/4P1k1/8/8/R7/8/4r3/8 w - - 0 1',
   ['a4g4', 'g7f6', 'e8f8', 'e2h2', 'e7e8q'],
   'w', 1200, 'Lucena Position — e-File Bridge #1 👑', '1. Rg4+ Kf6 2. Kf8 Rh2 3. e8=Q! completes the Lucena conversion.'],
  // 2: White d-file Lucena
  ['3K4/3P1k2/8/8/R7/8/3r4/8 w - - 0 1',
   ['a4f4', 'f7e6', 'd8e8', 'd2h2', 'd7d8q'],
   'w', 1250, 'Lucena Position — d-File Bridge #2 👑', 'White forces the enemy king away before promoting on d8.'],
  // 3: White c-file Lucena
  ['2K5/2P1k3/8/8/R7/8/2r5/8 w - - 0 1',
   ['a4e4', 'e7f6', 'c8d7', 'c2h2', 'c7c8q'],
   'w', 1300, 'Lucena Position — c-File Escort #3 👑', 'White steps the King to d7 and promotes on c8.'],
  // 4: White f-file Lucena
  ['5K2/5P1k/8/8/R7/8/5r2/8 w - - 0 1',
   ['a4h4', 'h7g6', 'f8g8', 'f2f1', 'f7f8q'],
   'w', 1350, 'Lucena Position — f-File Shelter #4 👑', 'White drives Black\'s king to g6 and queens the f-pawn.'],
  // 5: White b-file Lucena
  ['1K6/1P1k4/8/8/R7/8/1r6/8 w - - 0 1',
   ['a4d4', 'd7e6', 'b8c7', 'b2h2', 'b7b8q'],
   'w', 1400, 'Lucena Position — b-File Conversion #5 👑', 'White crowns the b-pawn with 3. b8=Q.'],

  // 6: Black e-file Lucena
  ['8/4R3/8/r7/8/8/4p1K1/4k3 b - - 0 1',
   ['a5g5', 'g2f3', 'e1f1', 'e7h7', 'e2e1q'],
   'b', 1450, 'Black Lucena — e-File Bridge #6 👑', '1...Rg5+ 2. Kf3 Kf1 3...e1=Q! secures the win for Black.'],
  // 7: Black d-file Lucena
  ['8/3R4/8/r7/8/8/3p1K2/3k4 b - - 0 1',
   ['a5f5', 'f2e3', 'd1e1', 'd7h7', 'd2d1q'],
   'b', 1500, 'Black Lucena — d-File Breakthrough #7 👑', 'Black escorts the d-pawn to promotion on d1.'],
  // 8: Black c-file Lucena
  ['8/2R5/8/r7/8/8/2p1K3/2k5 b - - 0 1',
   ['a5e5', 'e2f3', 'c1d2', 'c7h7', 'c2c1q'],
   'b', 1550, 'Black Lucena — c-File Escort #8 👑', 'Black kings steps to d2 to clear c1 for the new queen.'],
  // 9: Black f-file Lucena
  ['8/5R2/8/r7/8/8/5p1K/5k2 b - - 0 1',
   ['a5h5', 'h2g3', 'f1e2', 'f7h7', 'f2f1q'],
   'b', 1600, 'Black Lucena — f-File Queen Promotion #9 👑', 'Black secures 3...f1=Q with decisive advantage.'],
  // 10: Black b-file Lucena
  ['8/1R6/8/r7/8/8/1p1K4/1k6 b - - 0 1',
   ['a5d5', 'd2e3', 'b1c2', 'b7h7', 'b2b1q'],
   'b', 1650, 'Black Lucena — b-File Conversion #10 👑', 'Black slides the King to c2 and promotes on b1.'],

  // --- Classic 3-Pawn Breakthroughs (11 - 16) ---
  // 11: White a/b/c Breakthrough (9 plies to Queen)
  ['8/ppp5/8/PPP5/8/8/8/4K2k w - - 0 1',
   ['b5b6', 'a7b6', 'c5c6', 'b7c6', 'a5a6', 'b6b5', 'a6a7', 'b5b4', 'a7a8q'],
   'w', 1700, 'Queenside 3-Pawn Breakthrough (1. b6!) #11 👑', '1. b6! creates an unstoppable passed a-pawn promoting to Queen on a8.'],
  // 12: White f/g/h Breakthrough (9 plies to Queen)
  ['8/5ppp/8/5PPP/8/8/8/4K2k w - - 0 1',
   ['g5g6', 'f7g6', 'h5h6', 'g7h6', 'f5f6', 'g6g5', 'f6f7', 'g5g4', 'f7f8q'],
   'w', 1750, 'Kingside 3-Pawn Breakthrough (1. g6!) #12 👑', '1. g6! forces an unstoppable passed f-pawn promoting on f8.'],
  // 13: Black a/b/c Breakthrough (9 plies to Queen)
  ['4K2k/8/8/8/ppp5/8/PPP5/8 b - - 0 1',
   ['b4b3', 'a2b3', 'c4c3', 'b2c3', 'a4a3', 'b3b4', 'a3a2', 'b4b5', 'a2a1q'],
   'b', 1800, 'Black Queenside Pawn Breakthrough #13 👑', '1...b3! creates an outside passed pawn that queens on a1.'],
  // 14: Black f/g/h Breakthrough (9 plies to Queen)
  ['4K2k/8/8/8/5ppp/8/5PPP/8 b - - 0 1',
   ['g4g3', 'f2g3', 'h4h3', 'g2h3', 'f4f3', 'g3g4', 'f3f2', 'g4g5', 'f2f1q'],
   'b', 1850, 'Black Kingside Pawn Breakthrough #14 👑', '1...g3! creates the winning f-pawn promoting on f1.'],
  // 15: White b6 with cxb6 (9 plies to Queen)
  ['8/ppp5/8/PPP5/8/8/8/4K1k1 w - - 0 1',
   ['b5b6', 'c7b6', 'a5a6', 'b7a6', 'c5c6', 'b6b5', 'c6c7', 'b5b4', 'c7c8q'],
   'w', 1900, 'Pawn Breakthrough Variation (1...cxb6) #15 👑', '1. b6 creates a winning passed c-pawn promoting on c8.'],
  // 16: Black b3 with cxb3 (9 plies to Queen)
  ['4K1k1/8/8/8/ppp5/8/PPP5/8 b - - 0 1',
   ['b4b3', 'c2b3', 'a4a3', 'b2a3', 'c4c3', 'b3b4', 'c3c2', 'b4b5', 'c2c1q'],
   'b', 1950, 'Black Pawn Breakthrough Variation #16 👑', '1...b3! escorts the passed c-pawn to promotion on c1.'],

  // --- King Escort & Opposition (17 - 24) ---
  // 17: White e-pawn escort (9 plies)
  ['4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
   ['e6d6', 'e8d8', 'e5e6', 'd8e8', 'e6e7', 'e8f7', 'd6d7', 'f7g7', 'e7e8q'],
   'w', 1500, 'Direct Opposition & Pawn Escort (e-Pawn) #17 👑', 'White takes opposition and shoulders the Black king to queen.'],
  // 18: White d-pawn escort (9 plies)
  ['3k4/8/3K4/3P4/8/8/8/8 w - - 0 1',
   ['d6e6', 'd8e8', 'd5d6', 'e8d8', 'd6d7', 'd8c7', 'e6e7', 'c7b7', 'd7d8q'],
   'w', 1550, 'd-Pawn King Shouldering Technique #18 👑', 'White controls the key squares in front of the passed pawn.'],
  // 19: White c-pawn escort (9 plies)
  ['2k5/8/2K5/2P5/8/8/8/8 w - - 0 1',
   ['c6d6', 'c8d8', 'c5c6', 'd8c8', 'c6c7', 'c8b7', 'd6d7', 'b7b6', 'c7c8q'],
   'w', 1600, 'c-Pawn King Opposition Mastery #19 👑', 'Systematic king escort forces promotion on c8.'],
  // 20: White f-pawn escort (9 plies)
  ['5k2/8/5K2/5P2/8/8/8/8 w - - 0 1',
   ['f6e6', 'f8e8', 'f5f6', 'e8f8', 'f6f7', 'f8g7', 'e6e7', 'g7g6', 'f7f8q'],
   'w', 1650, 'f-Pawn Flank Conversion #20 👑', 'White establishes control of the 7th rank to queen on f8.'],
  // 21: Black e-pawn escort (9 plies)
  ['8/8/8/8/4p3/4k3/8/4K3 b - - 0 1',
   ['e3d3', 'e1d1', 'e4e3', 'd1e1', 'e3e2', 'e1f2', 'd3d2', 'f2g3', 'e2e1q'],
   'b', 1700, 'Black King Opposition (e-Pawn) #21 👑', 'Black shoulders White\'s king and queens on e1.'],
  // 22: Black d-pawn escort (9 plies)
  ['8/8/8/8/3p4/3k4/8/3K4 b - - 0 1',
   ['d3e3', 'd1e1', 'd4d3', 'e1d1', 'd3d2', 'd1c2', 'e3e2', 'c2b3', 'd2d1q'],
   'b', 1750, 'Black d-Pawn King Escort #22 👑', 'Black seizes key squares to ensure d1 promotion.'],
  // 23: Black c-pawn escort (9 plies)
  ['8/8/8/8/2p5/2k5/8/2K5 b - - 0 1',
   ['c3d3', 'c1d1', 'c4c3', 'd1c1', 'c3c2', 'c1b2', 'd3d2', 'b2b3', 'c2c1q'],
   'b', 1800, 'Black c-Pawn King Shouldering #23 👑', 'Black guides the c-pawn safely to c1.'],
  // 24: Black f-pawn escort (9 plies)
  ['8/8/8/8/5p2/5k2/8/5K2 b - - 0 1',
   ['f3e3', 'f1e1', 'f4f3', 'e1f1', 'f3f2', 'f1g2', 'e3e2', 'g2g3', 'f2f1q'],
   'b', 1850, 'Black f-Pawn Conversion #24 👑', 'Black takes distant opposition and promotes on f1.'],

  // --- Rook Ending Passed Pawn Conversions (25 - 30) ---
  // 25: White a-pawn promotion
  ['8/P7/8/r7/8/k7/3K4/1R6 w - - 0 1',
   ['b1a1', 'a3b4', 'a1a5', 'b4a5', 'a7a8q'],
   'w', 1900, 'Rook Skewer into a8 Promotion #25 👑', '1. Ra1+ Kb4 2. Rxa5 Kxa5 3. a8=Q+ converts the rook ending.'],
  // 26: White h-pawn promotion
  ['8/7P/8/7r/8/7k/4K3/6R1 w - - 0 1',
   ['g1h1', 'h3g4', 'h1h5', 'g4h5', 'h7h8q'],
   'w', 1950, 'Rook Skewer into h8 Promotion #26 👑', '1. Rh1+ Kg4 2. Rxa5 Rxh5 3. h8=Q+ wins.'],
  // 27: Black a-pawn promotion
  ['1r4k1/8/K7/8/R7/8/p7/8 b - - 0 1',
   ['b8a8', 'a6b5', 'a8a4', 'b5a4', 'a2a1q'],
   'b', 2000, 'Black Rook Skewer into a1 Promotion #27 👑', '1...Ra8+ 2. Kb5 Rxa4 3. Kxa4 a1=Q+ wins the game.'],
  // 28: Black h-pawn promotion
  ['6r1/6k1/K7/8/7R/8/7p/8 b - - 0 1',
   ['g8h8', 'h4h8', 'g7h8', 'a6b5', 'h2h1q'],
   'b', 2050, 'Black Rook Deflection into h1 Promotion #28 👑', '1...Rh8 2. Rxh8 Kxh8 3. Kb5 h1=Q! secures the win.'],
  // 29: White 9-ply g-pawn escort
  ['6k1/8/6K1/6P1/8/8/8/8 w - - 0 1',
   ['g6h6', 'g8h8', 'g5g6', 'h8g8', 'g6g7', 'g8f7', 'h6h7', 'f7e7', 'g7g8q'],
   'w', 2100, 'Flank Opposition & 7th-Rank Domination (g-Pawn) #29 👑', 'White out-triangulates the defender to seal the g8 promotion square.'],
  // 30: Black 9-ply g-pawn escort
  ['8/8/8/8/6p1/6k1/8/6K1 b - - 0 1',
   ['g3h3', 'g1h1', 'g4g3', 'h1g1', 'g3g2', 'g1f2', 'h3h2', 'f2e2', 'g2g1q'],
   'b', 2150, 'Black Flank Opposition & 2nd-Rank Outflanking #30 👑', 'Black outflanks White\'s king with 4...Kh2 securing g1 promotion.']
];

const puzzles = [];
endgameData.forEach(([fen, moves, color, rating, title, subtitle], idx) => {
  const isLucena = idx < 10;
  const isBreakthrough = idx >= 10 && idx < 16;
  const isEscort = idx >= 16 && idx < 24;
  const isSkewerPromotion = idx >= 24;

  let theme = 'pawn_endgame';
  if (isLucena) theme = 'lucena_position';
  else if (isBreakthrough) theme = 'pawn_breakthrough';
  else if (isEscort) theme = 'king_opposition';
  else if (isSkewerPromotion) theme = 'rook_endgame';

  puzzles.push({
    id: 'puz_eg_' + String(idx + 1).padStart(3, '0'),
    fen,
    moves,
    rating,
    ratingDeviation: 80,
    themes: [theme, 'endgame_conversion'],
    primaryTheme: theme,
    difficulty: rating < 1500 ? 'medium' : (rating < 1800 ? 'hard' : 'expert'),
    title,
    subtitle,
    playerColor: color,
    solutionPlies: moves.length,
    tacticalGoal: isLucena ? 'Apply the Lucena bridge technique to escort the passed pawn to promotion.'
                : (isBreakthrough ? 'Execute the multi-pawn sacrifice breakthrough to create an unstoppable passed pawn.'
                : (isEscort ? 'Use opposition and king shouldering to escort the passed pawn.'
                : 'Liquidate into a winning queen promotion.')),
    tacticalReward: 'pawn_promotion',
    outcomeAdvantage: 'Queen Promotion ♛',
    learningSummary: `${subtitle} demonstrating precise endgame technique.`,
    keyTakeaway: isLucena ? 'The Lucena technique cuts off the enemy king and builds a bridge to promote the passed pawn.'
               : (isBreakthrough ? 'Pawn breakthroughs sacrifice secondary pawns to create a winning passed runner.'
               : 'King opposition and shouldering are fundamental to escorting passed pawns to promotion.'),
    targetSquares: [moves[moves.length - 1].slice(2, 4)],
    keySquares: [moves[0].slice(0, 2), moves[moves.length - 1].slice(2, 4)]
  });
});

console.log('Total Endgame Conversion puzzles generated:', puzzles.length);
savePack(path.resolve('apps/client/src/features/puzzles/data/endgame_conversion.json'), puzzles);
