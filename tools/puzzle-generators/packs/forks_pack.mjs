export const FORK_DATA = [
  {
    "id": "puz_fork_001",
    "fen": "r1b1k2r/pppp1ppp/8/1N6/8/8/PPPP1PPP/R1B1KB1R w KQkq - 0 1",
    "moves": [
      "b5c7",
      "e8d8",
      "c7a8"
    ],
    "rating": 650,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "novice",
    "title": "Knight Fork on c7 #1 \u265e",
    "subtitle": "Deliver Nc7+ to fork King and a8 Rook!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Deliver Nc7+ to fork King and a8 Rook",
    "tacticalReward": "win_rook",
    "outcomeAdvantage": "+5 Rook \u265c",
    "learningSummary": "1. Nc7+ checked Black's King on e8 and attacked the corner a8 Rook. When the King moved to d8, 2. Nxa8 captured the Rook cleanly!",
    "keyTakeaway": "Knights on c7 or c2 are deadly because they simultaneously strike King and corner Rooks.",
    "targetSquares": [
      "c7",
      "a8"
    ],
    "keySquares": [
      "b5",
      "c7"
    ]
  },
  {
    "id": "puz_fork_002",
    "fen": "r3k2r/pppb1ppp/4N3/8/8/8/PPP2PPP/R1B1K2R w KQkq - 0 1",
    "moves": [
      "e6c7",
      "e8e7",
      "c7a8"
    ],
    "rating": 680,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "novice",
    "title": "Knight Fork on c7 #2 \u265e",
    "subtitle": "Nc7+ strikes the King on e8 and Rook on a8!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Jump to c7 with check, winning the corner Rook.",
    "tacticalReward": "win_rook",
    "outcomeAdvantage": "+5 Rook \u265c",
    "learningSummary": "1. Nxc7+ checks the King on e8 while attacking a8. After 1...Ke7, White grabs the Rook with 2. Nxa8.",
    "keyTakeaway": "Look for undefended corner pieces when a Knight can land on the c7/c2 outposts.",
    "targetSquares": [
      "c7",
      "a8"
    ],
    "keySquares": [
      "e6",
      "c7"
    ]
  },
  {
    "id": "puz_fork_003",
    "fen": "r1b1k2r/ppp2ppp/8/8/8/4n3/PPPB1PPP/R3K2R b KQkq - 0 1",
    "moves": [
      "e3c2",
      "e1e2",
      "c2a1"
    ],
    "rating": 710,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "novice",
    "title": "Black Knight Fork on c2 #3 \u265e",
    "subtitle": "Black delivers ...Nc2+ to win White's a1 Rook!",
    "playerColor": "b",
    "solutionPlies": 3,
    "tacticalGoal": "Deliver ...Nc2+ to fork the King and win the a1 Rook.",
    "tacticalReward": "win_rook",
    "outcomeAdvantage": "+5 Rook \u265c",
    "learningSummary": "1...Nxc2+ delivered a royal fork against White's King and the corner a1 Rook. After 2. Ke2, Black played 2...Nxa1!",
    "keyTakeaway": "Black's Knight on c2 mirrors the power of White's Knight on c7.",
    "targetSquares": [
      "c2",
      "a1"
    ],
    "keySquares": [
      "e3",
      "c2"
    ]
  },
  {
    "id": "puz_fork_004",
    "fen": "r1bqk2r/pppp1ppp/8/2b1n3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 1",
    "moves": [
      "d2d4",
      "c5d6",
      "d4e5"
    ],
    "rating": 740,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "novice",
    "title": "Center Pawn Fork on d4 #4 \u265f",
    "subtitle": "Push d4 to attack Bishop and Knight at once!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Advance the d-pawn to fork Black's minor pieces.",
    "tacticalReward": "win_minor_piece",
    "outcomeAdvantage": "+3 Minor Piece \u2694\ufe0f",
    "learningSummary": "1. d4 attacked both Black's Bishop on c5 and Knight on e5. When the Bishop retreated to d6, White captured the Knight with 2. dxe5!",
    "keyTakeaway": "Pawns attacking two enemy pieces on the same rank guarantee winning a piece.",
    "targetSquares": [
      "d4",
      "e5"
    ],
    "keySquares": [
      "d2",
      "d4"
    ]
  },
  {
    "id": "puz_fork_005",
    "fen": "r1bqk2r/pppp1ppp/2n5/4p3/2B1N3/5N2/PPPP1PPP/R1BQK2R b KQkq - 0 1",
    "moves": [
      "d7d5",
      "c4d3",
      "d5e4"
    ],
    "rating": 770,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "novice",
    "title": "Black Center Pawn Fork on d5 #5 \u265f",
    "subtitle": "Strike in the center with ...d5 to fork White's pieces!",
    "playerColor": "b",
    "solutionPlies": 3,
    "tacticalGoal": "Push ...d5 to fork White's Bishop and Knight.",
    "tacticalReward": "win_minor_piece",
    "outcomeAdvantage": "+3 Minor Piece \u2694\ufe0f",
    "learningSummary": "1...d5 struck the center, simultaneously attacking White's Bishop on c4 and Knight on e4, winning a full piece after 2. Bd3 dxe4.",
    "keyTakeaway": "The central pawn push ...d5 is a fundamental tactic against uncoordinated minor pieces.",
    "targetSquares": [
      "d5",
      "e4"
    ],
    "keySquares": [
      "d7",
      "d5"
    ]
  },
  {
    "id": "puz_fork_006",
    "fen": "r1bqk2r/pppp1ppp/8/8/2n5/2N5/PPP2PPP/R1BQ1RK1 w kq - 0 1",
    "moves": [
      "d1e2",
      "d8e7",
      "e2c4"
    ],
    "rating": 800,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "novice",
    "title": "Queen Check Fork on e2 #6 \u265b",
    "subtitle": "Qe2+ checks King and captures the loose Knight!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Play Qe2+ to check the King and pick up the unprotected Knight on c4.",
    "tacticalReward": "win_minor_piece",
    "outcomeAdvantage": "+3 Minor Piece \u2694\ufe0f",
    "learningSummary": "1. Qe2+ attacked Black's King and the undefended Knight on c4. After Black blocked with 1...Qe7, White captured 2. Qxc4 cleanly!",
    "keyTakeaway": "Always check for loose pieces on the open board when you have a check available.",
    "targetSquares": [
      "e2",
      "c4"
    ],
    "keySquares": [
      "d1",
      "e2"
    ]
  },
  {
    "id": "puz_fork_007",
    "fen": "r1bqk2r/ppp2ppp/3p4/8/4N3/2P5/PP3PPP/R1BQK2R b KQkq - 0 1",
    "moves": [
      "d8e7",
      "d1e2",
      "e7e4"
    ],
    "rating": 830,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "novice",
    "title": "Black Queen Central Strike #7 \u265b",
    "subtitle": "Pin and fork on e-file with ...Qe7!",
    "playerColor": "b",
    "solutionPlies": 3,
    "tacticalGoal": "Pin and win the undefended Knight on e4 with ...Qe7.",
    "tacticalReward": "win_minor_piece",
    "outcomeAdvantage": "+3 Minor Piece \u2694\ufe0f",
    "learningSummary": "1...Qe7 pinned White's Knight to the King on e1. Since the Knight could not escape, Black captured 2...Qxe4 next move.",
    "keyTakeaway": "A pin along an open file against the enemy King wins immobilized pieces.",
    "targetSquares": [
      "e7",
      "e4"
    ],
    "keySquares": [
      "d8",
      "e7"
    ]
  },
  {
    "id": "puz_fork_008",
    "fen": "r3k2r/p1p2ppp/8/3B4/8/8/PPP2PPP/R3K2R w KQkq - 0 1",
    "moves": [
      "d5c6",
      "e8e7",
      "c6a8"
    ],
    "rating": 860,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "novice",
    "title": "Bishop Diagonal Fork on c6 #8 \u265d",
    "subtitle": "Bc6+ attacks King on e8 and Rook on a8!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Play Bc6+ to fork the King and corner Rook.",
    "tacticalReward": "win_rook",
    "outcomeAdvantage": "+5 Rook \u265c",
    "learningSummary": "1. Bc6+ checked Black's King and sliced across to the unprotected a8 Rook. After 1...Ke7, 2. Bxa8 won the Rook!",
    "keyTakeaway": "Bishops on open diagonals can fork a centralized King and an undefended corner Rook.",
    "targetSquares": [
      "c6",
      "a8"
    ],
    "keySquares": [
      "d5",
      "c6"
    ]
  },
  {
    "id": "puz_fork_009",
    "fen": "r3k2r/ppp2ppp/8/8/3b4/8/P1P2PPP/R3K2R b KQkq - 0 1",
    "moves": [
      "d4c3",
      "e1e2",
      "c3a1"
    ],
    "rating": 890,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "novice",
    "title": "Black Bishop Diagonal Skewer-Fork #9 \u265d",
    "subtitle": "Deliver ...Bc3+ to fork King and a1 Rook!",
    "playerColor": "b",
    "solutionPlies": 3,
    "tacticalGoal": "Deliver ...Bc3+ to win White's corner Rook.",
    "tacticalReward": "win_rook",
    "outcomeAdvantage": "+5 Rook \u265c",
    "learningSummary": "1...Bc3+ checked White's King on e1 while aiming directly at the undefended a1 Rook, winning 2...Bxa1!",
    "keyTakeaway": "Long-range Bishops excel at attacking two distant pieces at once.",
    "targetSquares": [
      "c3",
      "a1"
    ],
    "keySquares": [
      "d4",
      "c3"
    ]
  },
  {
    "id": "puz_fork_010",
    "fen": "r4rk1/pp1q1ppp/8/3N4/8/8/PPP2PPP/R2Q1RK1 w - - 0 1",
    "moves": [
      "d5f6",
      "g7f6",
      "d1d7"
    ],
    "rating": 920,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "easy",
    "title": "Knight Sacrifice Royal Fork #10 \u265e",
    "subtitle": "Nf6+ checks King and uncovers the Queen!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Play Nf6+ to deflect Black's g-pawn and capture the Queen on d7.",
    "tacticalReward": "win_queen",
    "outcomeAdvantage": "+9 Queen \u265b",
    "learningSummary": "1. Nf6+ checked Black's King and attacked the Queen on d7. After 1...gxf6, White captured 2. Qxd7 winning the Queen!",
    "keyTakeaway": "A check that attacks the enemy Queen must be answered, leaving the Queen vulnerable.",
    "targetSquares": [
      "f6",
      "d7"
    ],
    "keySquares": [
      "d5",
      "f6"
    ]
  },
  {
    "id": "puz_fork_011",
    "fen": "r2q1rk1/ppp2ppp/8/8/8/5n2/PP1Q1PPP/R3R1K1 b - - 0 1",
    "moves": [
      "f3d2",
      "e1e8",
      "f8e8"
    ],
    "rating": 950,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "easy",
    "title": "Black Knight Discovered Strike #11 \u265e",
    "subtitle": "Capture White's Queen on d2!",
    "playerColor": "b",
    "solutionPlies": 3,
    "tacticalGoal": "Capture White's Queen on d2 with the Knight.",
    "tacticalReward": "win_queen",
    "outcomeAdvantage": "+9 Queen \u265b",
    "learningSummary": "1...Nxd2 captured White's Queen on d2. When White tried 2. Rxe8+, Black recaptured 2...Rxe8 remaining up a full Queen.",
    "keyTakeaway": "Tactical strikes that win the enemy Queen decide the game immediately.",
    "targetSquares": [
      "d2",
      "e8"
    ],
    "keySquares": [
      "f3",
      "d2"
    ]
  },
  {
    "id": "puz_fork_012",
    "fen": "r1bqk2r/ppppbppp/2n5/4N3/4n3/2N5/PPPP1PPP/R1BQKB1R w KQkq - 0 1",
    "moves": [
      "e5c6",
      "b7c6",
      "c3e4"
    ],
    "rating": 980,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "easy",
    "title": "Knight Trade into Piece Win #12 \u265e",
    "subtitle": "Trade on c6 and capture the undefended e4 Knight!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Trade on c6 and capture the undefended e4 Knight.",
    "tacticalReward": "win_minor_piece",
    "outcomeAdvantage": "+3 Minor Piece \u2694\ufe0f",
    "learningSummary": "1. Nxc6 removed Black defender on c6. After 1...bxc6, White captured 2. Nxe4 cleanly.",
    "keyTakeaway": "Removing the defender allows you to win hanging enemy pieces.",
    "targetSquares": [
      "c6",
      "e4"
    ],
    "keySquares": [
      "e5",
      "c3"
    ]
  },
  {
    "id": "puz_fork_013",
    "fen": "r3k2r/ppp2ppp/8/3Q4/8/8/PPP2PPP/R3K2R w KQkq - 0 1",
    "moves": [
      "d5e5",
      "e8d8",
      "e5g7"
    ],
    "rating": 1020,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "easy",
    "title": "Central Queen Double Attack #13 \u265b",
    "subtitle": "Qe5+ checks King and targets g7!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Check the King with Qe5+ and capture the g7 pawn with tempo.",
    "tacticalReward": "win_pawn",
    "outcomeAdvantage": "+1 Pawn \u265f",
    "learningSummary": "1. Qe5+ forced Black's King to d8, and White followed up with 2. Qxg7 attacking the h8 Rook!",
    "keyTakeaway": "Centralized Queens dominate the board by creating threats on both flanks simultaneously.",
    "targetSquares": [
      "e5",
      "g7"
    ],
    "keySquares": [
      "d5",
      "e5"
    ]
  },
  {
    "id": "puz_fork_014",
    "fen": "r2qk2r/ppp2ppp/8/3n1b2/4P3/8/PPP2PPP/R1BQK2R w KQkq - 0 1",
    "moves": [
      "e4f5",
      "d8e7",
      "d1e2"
    ],
    "rating": 1060,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "easy",
    "title": "Central Pawn Breakthrough Fork #14 \u265f",
    "subtitle": "Win a minor piece with the e4 pawn fork!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Capture the piece on f5 and consolidate with Qe2.",
    "tacticalReward": "win_minor_piece",
    "outcomeAdvantage": "+3 Minor Piece \u2694\ufe0f",
    "learningSummary": "1. exf5 captured Black's Bishop. After 1...Qe7+, White blocked calmly with 2. Qe2 maintaining the piece advantage.",
    "keyTakeaway": "When ahead material from a fork, trading Queens neutralizes opponent counterplay.",
    "targetSquares": [
      "f5",
      "e2"
    ],
    "keySquares": [
      "e4",
      "f5"
    ]
  },
  {
    "id": "puz_fork_015",
    "fen": "r1bqk2r/ppp2ppp/8/8/4p3/3N1B2/PPP2PPP/R1BQK2R b KQkq - 0 1",
    "moves": [
      "e4f3",
      "d1f3",
      "e8g8"
    ],
    "rating": 1100,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "easy",
    "title": "Black Pawn Strike on f3 #15 \u265f",
    "subtitle": "Capture White's Bishop and castle safely!",
    "playerColor": "b",
    "solutionPlies": 3,
    "tacticalGoal": "Capture White's Bishop with ...exf3 and castle to safety.",
    "tacticalReward": "win_minor_piece",
    "outcomeAdvantage": "+3 Minor Piece \u2694\ufe0f",
    "learningSummary": "1...exf3 captured White's Bishop. After White recaptured 2. Qxf3, Black castled 2...O-O with a solid extra piece.",
    "keyTakeaway": "After winning material with a pawn fork, bring your King to safety right away.",
    "targetSquares": [
      "f3",
      "g8"
    ],
    "keySquares": [
      "e4",
      "f3"
    ]
  },
  {
    "id": "puz_fork_016",
    "fen": "r3k2r/ppp2ppp/2n1b3/1N1q4/8/8/PPP2PPP/R1B1KB1R w KQkq - 0 1",
    "moves": [
      "b5c7",
      "e8d7",
      "c7d5"
    ],
    "rating": 1140,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "easy",
    "title": "Royal Knight Fork on c7 #16 \u265e",
    "subtitle": "Nc7+ forks King and Queen!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Deliver Nc7+ to fork the King on e8 and win the Queen on d5.",
    "tacticalReward": "win_queen",
    "outcomeAdvantage": "+9 Queen \u265b",
    "learningSummary": "1. Nc7+ checked Black's King and forked the d5 Queen. After 1...Kd7, White captured 2. Nxd5 winning decisive material.",
    "keyTakeaway": "Forks against the enemy King and Queen (royal forks) result in immediate material victory.",
    "targetSquares": [
      "c7",
      "d5"
    ],
    "keySquares": [
      "b5",
      "c7"
    ]
  },
  {
    "id": "puz_fork_017",
    "fen": "r2q1r2/ppp2pkp/4N3/8/8/8/PPP2PPP/R1B1K2R w KQ - 0 1",
    "moves": [
      "e6d8",
      "f8d8",
      "c1e3"
    ],
    "rating": 1180,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "easy",
    "title": "Royal Fork Payoff on d8 #17 \u265e",
    "subtitle": "Collect the Queen after the royal fork!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Capture the Queen on d8 and develop the Bishop to e3.",
    "tacticalReward": "win_queen",
    "outcomeAdvantage": "+9 Queen \u265b",
    "learningSummary": "1. Nxd8 captured Black's Queen cleanly. After 1...Raxd8, White developed 2. Be3 with an overwhelming material lead.",
    "keyTakeaway": "When a royal fork hits King and Queen, grab the Queen without hesitation.",
    "targetSquares": [
      "d8",
      "e3"
    ],
    "keySquares": [
      "e6",
      "d8"
    ]
  },
  {
    "id": "puz_fork_018",
    "fen": "r1b1k2r/ppp2ppp/8/8/8/4n3/PPP2PPP/R2Q1RK1 b kq - 0 1",
    "moves": [
      "e3d1",
      "f1d1",
      "e8g8"
    ],
    "rating": 1220,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "medium",
    "title": "Black Royal Fork Payoff #18 \u265e",
    "subtitle": "Snag White's Queen on d1 and castle!",
    "playerColor": "b",
    "solutionPlies": 3,
    "tacticalGoal": "Capture White's Queen on d1 and secure King safety.",
    "tacticalReward": "win_queen",
    "outcomeAdvantage": "+9 Queen \u265b",
    "learningSummary": "1...Nxd1 captured White's Queen. After 2. Rxd1, Black castled 2...O-O maintaining an easy win.",
    "keyTakeaway": "Material superiority simplifies the endgame to a straightforward victory.",
    "targetSquares": [
      "d1",
      "g8"
    ],
    "keySquares": [
      "e3",
      "d1"
    ]
  },
  {
    "id": "puz_fork_019",
    "fen": "r4rk1/ppp2ppp/8/3B4/8/8/PPP2PPP/R3K2R w KQ - 0 1",
    "moves": [
      "d5b7",
      "a8b8",
      "b7f3"
    ],
    "rating": 1260,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "medium",
    "title": "Bishop Queenside Snack on b7 #19 \u265d",
    "subtitle": "Bxb7 attacks Rook and wins a key pawn!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Capture the b7 pawn and retreat the Bishop safely to f3.",
    "tacticalReward": "win_pawn",
    "outcomeAdvantage": "+1 Pawn \u265f",
    "learningSummary": "1. Bxb7 won Black's b7 pawn and attacked the a8 Rook. After 1...Rab8, White preserved the Bishop on 2. Bf3.",
    "keyTakeaway": "Active Bishops on open diagonals can snatch pawns and retreat safely.",
    "targetSquares": [
      "b7",
      "f3"
    ],
    "keySquares": [
      "d5",
      "b7"
    ]
  },
  {
    "id": "puz_fork_020",
    "fen": "r4k2/pppN1ppp/8/2q5/8/8/PPP2PPP/R1B1K2R w KQ - 0 1",
    "moves": [
      "d7c5",
      "f8e7",
      "c5b3"
    ],
    "rating": 1300,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "medium",
    "title": "Royal Knight Leap on c5 #20 \u265e",
    "subtitle": "Capture the Queen on c5 and retreat to safety!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Capture the enemy Queen on c5 with the Knight.",
    "tacticalReward": "win_queen",
    "outcomeAdvantage": "+9 Queen \u265b",
    "learningSummary": "1. Nxc5 captured Black's Queen after the check on d7, leaving White completely winning.",
    "keyTakeaway": "Executing the second half of a tactic cleanly is just as vital as finding the initial fork.",
    "targetSquares": [
      "c5",
      "b3"
    ],
    "keySquares": [
      "d7",
      "c5"
    ]
  },
  {
    "id": "puz_fork_021",
    "fen": "r1b1k2r/ppp2ppp/8/8/2Q5/8/PPPn1PPP/R3K2R b KQkq - 0 1",
    "moves": [
      "d2c4",
      "e1e2",
      "c4b2"
    ],
    "rating": 1340,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "medium",
    "title": "Black Knight Snaps Queen on c4 #21 \u265e",
    "subtitle": "Take the Queen on c4 and grab the b2 pawn!",
    "playerColor": "b",
    "solutionPlies": 3,
    "tacticalGoal": "Capture White's Queen on c4 and gobble the b2 pawn.",
    "tacticalReward": "win_queen",
    "outcomeAdvantage": "+9 Queen \u265b",
    "learningSummary": "1...Nxc4 captured White's Queen. After 2. Ke2, Black grabbed 2...Nxb2 for extra measure.",
    "keyTakeaway": "A well-placed Knight inside the enemy camp wreaks havoc on major pieces.",
    "targetSquares": [
      "c4",
      "b2"
    ],
    "keySquares": [
      "d2",
      "c4"
    ]
  },
  {
    "id": "puz_fork_022",
    "fen": "r2q1rk1/1ppn1ppp/1N6/8/8/8/PPP2PPP/R1B1K2R w KQ - 0 1",
    "moves": [
      "b6a8",
      "d8a8",
      "e1g1"
    ],
    "rating": 1380,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "medium",
    "title": "Knight Infiltration on a8 #22 \u265e",
    "subtitle": "Capture the corner a8 Rook and castle!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Take the corner Rook on a8 and castle to safety.",
    "tacticalReward": "win_rook",
    "outcomeAdvantage": "+5 Rook \u265c",
    "learningSummary": "1. Nxa8 captured Black's corner Rook. After 1...Qxa8, White castled 2. O-O with a decisive material lead.",
    "keyTakeaway": "Securing material and then castling prevents any desperate counter-attacks.",
    "targetSquares": [
      "a8",
      "g1"
    ],
    "keySquares": [
      "b6",
      "a8"
    ]
  },
  {
    "id": "puz_fork_023",
    "fen": "r3k2r/p1p2ppp/2n5/1B6/8/8/PPP2PPP/R1B1K2R w KQkq - 0 1",
    "moves": [
      "b5c6",
      "e8e7",
      "c6a8"
    ],
    "rating": 1420,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "medium",
    "title": "Bishop Fork Win on a8 #23 \u265d",
    "subtitle": "Bxc6+ forks King and wins the a8 Rook!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Play Bxc6+ to fork King and capture the a8 Rook.",
    "tacticalReward": "win_rook",
    "outcomeAdvantage": "+5 Rook \u265c",
    "learningSummary": "1. Bxc6+ checked the King and won the corner a8 Rook cleanly.",
    "keyTakeaway": "Pinning and attacking along the long diagonal forces heavy material gains.",
    "targetSquares": [
      "c6",
      "a8"
    ],
    "keySquares": [
      "b5",
      "c6"
    ]
  },
  {
    "id": "puz_fork_024",
    "fen": "r1b1k2r/ppp2ppp/8/4q3/8/8/PNN2PPP/R4RK1 b kq - 0 1",
    "moves": [
      "e5b2",
      "f1b1",
      "b2f6"
    ],
    "rating": 1460,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "medium",
    "title": "Black Queen Infiltration on b2 #24 \u265b",
    "subtitle": "Capture the b2 Knight and retreat to f6!",
    "playerColor": "b",
    "solutionPlies": 3,
    "tacticalGoal": "Capture the Knight on b2 and retreat safely.",
    "tacticalReward": "win_minor_piece",
    "outcomeAdvantage": "+3 Minor Piece \u2694\ufe0f",
    "learningSummary": "1...Qxb2 grabbed White's unprotected Knight on b2, and after 2. Rfb1, Black retreated 2...Qf6 safely.",
    "keyTakeaway": "Always ensure your Queen has an escape route after capturing in enemy territory.",
    "targetSquares": [
      "b2",
      "f6"
    ],
    "keySquares": [
      "e5",
      "b2"
    ]
  },
  {
    "id": "puz_fork_025",
    "fen": "r2q1rk1/pp1b1ppp/3p4/4nN2/8/8/PPP2PPP/R1BQR1K1 w - - 0 1",
    "moves": [
      "f5d6",
      "d8f6",
      "d6e4"
    ],
    "rating": 1500,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "hard",
    "title": "Knight Outpost Double Attack on d6 #25 \u265e",
    "subtitle": "Nxd6 attacks Queen and Bishop!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Win the d6 pawn and reposition the Knight on e4.",
    "tacticalReward": "win_pawn",
    "outcomeAdvantage": "+1 Pawn \u265f",
    "learningSummary": "1. Nxd6 won the isolated d6 pawn and attacked both e5 and d7. After 1...Qf6, White repositioned 2. Ne4.",
    "keyTakeaway": "Outpost Knights in the enemy center control vital escape squares and target weak pawns.",
    "targetSquares": [
      "d6",
      "e4"
    ],
    "keySquares": [
      "f5",
      "d6"
    ]
  },
  {
    "id": "puz_fork_026",
    "fen": "r2q1rk1/pppb1ppp/2N5/8/8/8/PPP2PPP/R1B1R1K1 w - - 0 1",
    "moves": [
      "c6d8",
      "a8d8",
      "c1f4"
    ],
    "rating": 1550,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "hard",
    "title": "Knight Decapitation on d8 #26 \u265e",
    "subtitle": "Take Black's Queen on d8 and develop Bf4!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Capture the Queen on d8 and activate the dark-squared Bishop.",
    "tacticalReward": "win_queen",
    "outcomeAdvantage": "+9 Queen \u265b",
    "learningSummary": "1. Nxd8 eliminated Black's Queen. After 1...Raxd8, White activated 2. Bf4 with overwhelming endgame control.",
    "keyTakeaway": "Trading down when ahead in material transitions directly into an easily won endgame.",
    "targetSquares": [
      "d8",
      "f4"
    ],
    "keySquares": [
      "c6",
      "d8"
    ]
  },
  {
    "id": "puz_fork_027",
    "fen": "r3k2r/ppp2ppp/4b3/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1",
    "moves": [
      "d5c7",
      "e8e7",
      "c7a8"
    ],
    "rating": 1600,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "hard",
    "title": "Outpost Knight Fork on c7 #27 \u265e",
    "subtitle": "Nc7+ forks King and wins the a8 Rook!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Deliver Nc7+ to fork King and Rook.",
    "tacticalReward": "win_rook",
    "outcomeAdvantage": "+5 Rook \u265c",
    "learningSummary": "1. Nc7+ forked the King and corner Rook cleanly.",
    "keyTakeaway": "Active knights in open positions strike both flanks effortlessly.",
    "targetSquares": [
      "c7",
      "a8"
    ],
    "keySquares": [
      "d5",
      "c7"
    ]
  },
  {
    "id": "puz_fork_028",
    "fen": "r1bqk2r/pppp1ppp/8/3Np3/1bBnP3/3P1N2/PPP2PPP/R1BQK2R w KQkq - 0 1",
    "moves": [
      "d5b4",
      "d4f3",
      "d1f3"
    ],
    "rating": 1650,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "hard",
    "title": "Tactical Piece Snatch on b4 #28 \u265e",
    "subtitle": "Nxb4 wins Black's exposed Bishop!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Capture the loose Bishop on b4 and recapture on f3 with the Queen.",
    "tacticalReward": "win_minor_piece",
    "outcomeAdvantage": "+3 Minor Piece \u2694\ufe0f",
    "learningSummary": "1. Nxb4 won Black's loose Bishop on b4. After 1...Nxf3+, White recaptured 2. Qxf3 defending with an extra piece.",
    "keyTakeaway": "Tactical calculation must verify all opponent intermediate checks before capturing.",
    "targetSquares": [
      "b4",
      "f3"
    ],
    "keySquares": [
      "d5",
      "b4"
    ]
  },
  {
    "id": "puz_fork_029",
    "fen": "r3k2r/ppp2ppp/8/8/4Q3/8/PPP2PPP/R3K2R w KQkq - 0 1",
    "moves": [
      "e4b7",
      "e8g8",
      "b7a8"
    ],
    "rating": 1700,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "hard",
    "title": "Queen Fork Infiltration on b7 #29 \u265b",
    "subtitle": "Qxb7 attacks the a8 Rook and wins material!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Capture on b7 and win the a8 Rook.",
    "tacticalReward": "win_rook",
    "outcomeAdvantage": "+5 Rook \u265c",
    "learningSummary": "1. Qxb7 attacked Black corner Rook. When Black castled 1...O-O, White captured 2. Qxa8.",
    "keyTakeaway": "Queens invading the 7th rank quickly gobble up loose pieces.",
    "targetSquares": [
      "b7",
      "a8"
    ],
    "keySquares": [
      "e4",
      "b7"
    ]
  },
  {
    "id": "puz_fork_030",
    "fen": "4k3/pp3ppp/5N2/8/8/8/PPP2PPP/4K3 w - - 0 1",
    "moves": [
      "f6h7",
      "f7f6",
      "e1e2"
    ],
    "rating": 1820,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "expert",
    "title": "Endgame Flank Knight Raid on h7 #30 \u265e",
    "subtitle": "Nxh7 grabs a kingside pawn with check!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Capture the h7 pawn and march the King forward to support.",
    "tacticalReward": "win_pawn",
    "outcomeAdvantage": "+1 Passed Pawn \u265f",
    "learningSummary": "1. Nxh7 snatched a crucial kingside pawn with check. When Black played 1...f6 to trap the Knight, White brought the King 2. Ke2.",
    "keyTakeaway": "In Knight endgames, outside passed pawns created by flank captures decide the race.",
    "targetSquares": [
      "h7",
      "e2"
    ],
    "keySquares": [
      "f6",
      "h7"
    ]
  },
  {
    "id": "puz_fork_031",
    "fen": "r7/ppp2pkp/8/8/3Q4/8/PPP2PPP/R5K1 w - - 0 1",
    "moves": [
      "d4e5",
      "g7g8",
      "e5c7"
    ],
    "rating": 1870,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "expert",
    "title": "Major Piece Infiltration on c7 #31 \u265b",
    "subtitle": "Qe5+ drives the King away to win c7!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Deliver Qe5+ and capture the defenseless c7 pawn.",
    "tacticalReward": "win_pawn",
    "outcomeAdvantage": "+1 Decisive Pawn \u265f",
    "learningSummary": "1. Qe5+ checked Black's King on g7, and after 1...Kg8, White captured 2. Qxc7 establishing a winning Queen outpost.",
    "keyTakeaway": "A centralized Queen that gives check before capturing pawns prevents opponent counter-checks.",
    "targetSquares": [
      "e5",
      "c7"
    ],
    "keySquares": [
      "d4",
      "e5"
    ]
  },
  {
    "id": "puz_fork_032",
    "fen": "r4k2/ppp2ppp/8/3N4/8/8/PPP2PPP/4K3 w - - 0 1",
    "moves": [
      "d5c7",
      "a8c8",
      "c7b5"
    ],
    "rating": 1950,
    "ratingDeviation": 80,
    "themes": [
      "fork",
      "captures_checks_threats"
    ],
    "primaryTheme": "fork",
    "difficulty": "expert",
    "title": "Endgame Knight Pawn Fork on c7 #32 \u265e",
    "subtitle": "Nxc7 wins a vital pawn and retreats safely!",
    "playerColor": "w",
    "solutionPlies": 3,
    "tacticalGoal": "Capture the c7 pawn and reposition the Knight to b5.",
    "tacticalReward": "win_pawn",
    "outcomeAdvantage": "+1 Passed Pawn \u265f",
    "learningSummary": "1. Nxc7 won the c7 pawn. After 1...Rc8, White repositioned 2. Nb5 safely.",
    "keyTakeaway": "In minor piece endgames, every extra pawn counts toward promotion.",
    "targetSquares": [
      "c7",
      "b5"
    ],
    "keySquares": [
      "d5",
      "c7"
    ]
  }
];
