from common import save_and_verify

SKEWERS = []

def add_skewer(id_num, fen, moves, rating, diff, title, subtitle, color, goal, reward, adv, summary, takeaway, target, key):
    SKEWERS.append({
        "id": f"puz_skewer_{str(id_num).zfill(3)}",
        "fen": fen,
        "moves": moves,
        "rating": rating,
        "ratingDeviation": 80,
        "themes": ["skewer", "captures_checks_threats"],
        "primaryTheme": "skewer",
        "difficulty": diff,
        "title": title,
        "subtitle": subtitle,
        "playerColor": color,
        "solutionPlies": len(moves),
        "tacticalGoal": goal,
        "tacticalReward": reward,
        "outcomeAdvantage": adv,
        "learningSummary": summary,
        "keyTakeaway": takeaway,
        "targetSquares": target,
        "keySquares": key
    })

# 1. 8th Rank Skewer on h8
add_skewer(1, "r3k3/7R/8/8/8/8/PPP2PPP/4K3 w - - 0 1", ["h7h8", "e8e7", "h8a8"], 650, "novice",
           "8th Rank Rook Skewer on h8 #1 ♜", "Rh8+ skewers the King to win the a8 Rook!", "w",
           "Deliver Rh8+ to skewer the King and win the a8 Rook.", "win_rook", "+5 Rook ♜",
           "1. Rh8+ checked Black's King on e8 and skewered right through to the undefended a8 Rook. After 1...Ke7, 2. Rxa8 won the Rook.",
           "A skewer attacks a more valuable piece in front, forcing it to move and exposing the piece behind.", ["h8", "a8"], ["h7", "h8"])

# 2. 8th Rank Skewer on a8
add_skewer(2, "4k2r/R7/8/8/8/8/PPP2PPP/4K3 w - - 0 1", ["a7a8", "e8e7", "a8h8"], 680, "novice",
           "8th Rank Rook Skewer on a8 #2 ♜", "Ra8+ skewers King to win the h8 Rook!", "w",
           "Play Ra8+ to skewer the King and win the corner h8 Rook.", "win_rook", "+5 Rook ♜",
           "1. Ra8+ checked the King on e8. When the King stepped aside to e7, White collected the h8 Rook with 2. Rxh8.",
           "Look for open 8th rank files when the enemy King and Rook share the back rank.", ["a8", "h8"], ["a7", "a8"])

# 3. Black 1st Rank Skewer on h1
add_skewer(3, "4k3/ppp2ppp/8/8/8/8/7r/R3K3 b - - 0 1", ["h2h1", "e1e2", "h1a1"], 710, "novice",
           "Black 1st Rank Rook Skewer on h1 #3 ♜", "Rh1+ skewers White's King to win the a1 Rook!", "b",
           "Deliver ...Rh1+ to skewer White's King and capture the a1 Rook.", "win_rook", "+5 Rook ♜",
           "1...Rh1+ checked White's King on e1. After 2. Ke2, Black grabbed 2...Rxa1 cleanly.",
           "Black's Rook on the 1st rank is just as deadly as White's on the 8th rank.", ["h1", "a1"], ["h2", "h1"])

# 4. Black 1st Rank Skewer on a1
add_skewer(4, "4k3/ppp2ppp/8/8/8/8/r7/4K2R b - - 0 1", ["a2a1", "e1e2", "a1h1"], 740, "novice",
           "Black 1st Rank Rook Skewer on a1 #4 ♜", "Ra1+ skewers King to win the h1 Rook!", "b",
           "Deliver ...Ra1+ to skewer the King and win the h1 Rook.", "win_rook", "+5 Rook ♜",
           "1...Ra1+ drove White's King away from e1, allowing Black to win 2...Rxh1.",
           "When Kings are caught in the center, rook checks on the edges win opposite corner pieces.", ["a1", "h1"], ["a2", "a1"])

# 5. Bishop Long Diagonal Skewer
add_skewer(5, "r3k2r/ppp2ppp/2q5/8/8/5B2/PPP2PPP/R3K2R w KQkq - 0 1", ["f3c6", "b7c6", "e1g1"], 780, "novice",
           "Bishop Long Diagonal Queen Skewer #5 ♝", "Bxc6+ skewers Queen and wrecks structure!", "w",
           "Capture the Queen on c6 with Bxc6+ and castle safely.", "win_queen", "+9 Queen ♛",
           "1. Bxc6+ captured Black's Queen on c6. After 1...bxc6, White castled 2. O-O with a decisive advantage.",
           "Bishops on long diagonals strike heavy enemy pieces with devastating impact.", ["c6", "g1"], ["f3", "e1"])

# 6. Bishop King-Rook Skewer on c3
add_skewer(6, "4k2r/ppp2ppp/8/8/8/2B5/PPP2PPP/4K2R w Kk - 0 1", ["c3g7", "h8g8", "g7f6"], 820, "novice",
           "Bishop Skewer on g7 #6 ♝", "Bxg7 attacks the corner h8 Rook!", "w",
           "Capture the g7 pawn and retreat to f6 with decisive control.", "win_pawn", "+1 Pawn ♟",
           "1. Bxg7 attacked Black's h8 Rook. After 1...Rg8, White repositioned 2. Bf6 with strong diagonal pressure.",
           "Bishops slicing across the board create continuous threats on enemy rooks.", ["g7", "f6"], ["c3", "g7"])

# 7. Black Bishop Skewer on g2
add_skewer(7, "r3k2r/ppp2ppp/2b5/8/8/8/PPP2PPP/4K2R b Kkq - 0 1", ["c6g2", "h1g1", "g2f3"], 860, "novice",
           "Black Bishop Skewer on g2 #7 ♝", "...Bxg2 attacks White's h1 Rook!", "b",
           "Capture g2 with ...Bxg2 and retreat safely to f3.", "win_pawn", "+1 Pawn ♟",
           "1...Bxg2 attacked White's h1 Rook, forcing 2. Rg1, after which Black preserved the Bishop on 2...Bf3.",
           "Flank pawn snatches by bishops force rooks onto passive squares.", ["g2", "f3"], ["c6", "g2"])

# 8. 7th Rank Rook Skewer on a8
add_skewer(8, "r4k1r/R7/8/8/8/8/PPP2PPP/4K3 w - - 0 1", ["a7a8", "f8e7", "a8h8"], 900, "easy",
           "7th Rank Double Rook Skewer on a8 #8 ♜", "Rxa8+ captures a8 and sweeps the h8 Rook!", "w",
           "Capture the a8 Rook with check and take the h8 Rook.", "win_rook", "+5 Rook ♜",
           "1. Rxa8+ won Black's a8 Rook with check. When the King stepped to e7, White collected 2. Rxh8.",
           "Catching the enemy King on the back rank allows rooks to sweep both corners.", ["a8", "h8"], ["a7", "a8"])

# 9. 7th Rank Rook Snatch on a8
add_skewer(9, "r1k5/R7/8/8/8/8/PPP2PPP/4K3 w - - 0 1", ["a7a8", "c8b7", "e1e2"], 940, "easy",
           "7th Rank Rook Snatch on a8 #9 ♜", "Rxa8+ captures the a8 Rook with check!", "w",
           "Capture the a8 Rook and centralize the King.", "win_rook", "+5 Rook ♜",
           "1. Rxa8+ won Black's corner Rook on a8. After 1...Kb7, White centralized 2. Ke2.",
           "Rook captures on the back rank come with decisive tempo.", ["a8", "e2"], ["a7", "e1"])

# 10. Black Queen Skewer on g2
add_skewer(10, "4k2r/ppp2ppp/8/8/4q3/8/PPP2PPP/R1B1K2R b KQk - 0 1", ["e4g2", "h1f1", "e8g8"], 980, "easy",
           "Black Queen Skewer on g2 #10 ♛", "...Qxg2 attacks the corner h1 Rook!", "b",
           "Capture g2 with the Queen and castle safely.", "win_pawn", "+1 Pawn ♟",
           "1...Qxg2 attacked White's h1 Rook, forcing 2. Rf1, and Black secured the King 2...O-O.",
           "Invading queens on the second rank create simultaneous pawn and piece threats.", ["g2", "g8"], ["e4", "e8"])

# 11. Queen Diagonal Skewer on e5
add_skewer(11, "r3k2r/ppp2ppp/8/4Q3/8/8/PPP2PPP/R1B1K2R w KQkq - 0 1", ["e5g7", "e8e7", "g7h8"], 1020, "easy",
           "Queen Skewer-Raid on g7 #11 ♛", "Qxg7 skewers the h8 Rook and wins heavy material!", "w",
           "Capture g7 with Qxg7 and take the corner h8 Rook.", "win_rook", "+5 Rook ♜",
           "1. Qxg7 attacked Black's h8 Rook. After 1...Ke7, White captured 2. Qxh8 winning a full Rook!",
           "Queens on the 7th rank strike across all files simultaneously.", ["g7", "h8"], ["e5", "g7"])

# 12. Queen Skewer on a5
add_skewer(12, "r3k2r/ppp2ppp/8/q6Q/8/8/PPP2PPP/R3K2R w KQkq - 0 1", ["h5a5", "e8g8", "e1g1"], 1060, "easy",
           "Cross-Board Queen Snatch on a5 #12 ♛", "Qxa5 captures the exposed Queen with check!", "w",
           "Capture the Queen on a5 and castle to safety.", "win_queen", "+9 Queen ♛",
           "1. Qxa5 captured Black's defenseless Queen. After 1...O-O, White castled 2. O-O up a full Queen.",
           "Loose pieces on the edges of the board are prime targets for cross-board queen tactics.", ["a5", "g1"], ["h5", "e1"])

# 13. Black Queen Cross-Board Snatch on a5
add_skewer(13, "r3k2r/ppp2ppp/8/Q6q/8/8/PPP2PPP/R3K2R b KQkq - 0 1", ["h5a5", "c2c3", "e8g8"], 1100, "easy",
           "Black Cross-Board Queen Snatch on a5 #13 ♛", "...Qxa5+ captures White's Queen!", "b",
           "Capture the Queen on a5 with check and castle to safety.", "win_queen", "+9 Queen ♛",
           "1...Qxa5+ won White's Queen on a5 with check. After 2. c3, Black castled 2...O-O with an insurmountable lead.",
           "Always calculate long-range queen captures along open ranks.", ["a5", "g8"], ["h5", "e8"])

# 14. 7th Rank Pawn Skewer on g7
add_skewer(14, "4k3/1R4p1/8/8/8/8/PPP2PPP/4K3 w - - 0 1", ["b7g7", "e8f8", "g7a7"], 1140, "easy",
           "7th Rank Rook Pawn Skewer #14 ♜", "Rxg7 wins pawn and attacks f8 King!", "w",
           "Capture the g7 pawn and reposition the Rook safely.", "win_pawn", "+1 Pawn ♟",
           "1. Rxg7 won Black's g7 pawn with tempo. When Black played 1...Kf8, White retreated 2. Ra7.",
           "Rooks on the 7th rank create relentless pawn-snatching skewers.", ["g7", "a7"], ["b7", "g7"])

# 15. Black 2nd Rank Pawn Skewer on g2
add_skewer(15, "4k3/ppp2ppp/8/8/8/8/1r4P1/4K3 b - - 0 1", ["b2g2", "e1f1", "g2a2"], 1180, "easy",
           "Black 2nd Rank Rook Pawn Skewer #15 ♜", "...Rxg2 captures the g2 pawn with tempo!", "b",
           "Capture g2 and retreat the Rook safely to a2.", "win_pawn", "+1 Pawn ♟",
           "1...Rxg2 won White's g2 pawn. After 2. Kf1, Black retreated 2...Ra2 maintaining an extra pawn.",
           "Active rooks on the second rank convert endgames by picking off flank pawns.", ["g2", "a2"], ["b2", "g2"])

# 16. Bishop Long Diagonal Skewer on a8
add_skewer(16, "r3k3/p1p2ppp/8/3B4/8/8/PPP2PPP/4K3 w - - 0 1", ["d5c6", "e8e7", "c6a8"], 1220, "medium",
           "Bishop Skewer-Fork on c6 #16 ♝", "Bc6+ checks King and takes the a8 Rook!", "w",
           "Deliver Bc6+ and capture the a8 Rook.", "win_rook", "+5 Rook ♜",
           "1. Bc6+ drove Black's King to e7, allowing White to capture 2. Bxa8 cleanly.",
           "Bishops on central diagonals strike both King and corner rooks simultaneously.", ["c6", "a8"], ["d5", "c6"])

# 17. Black Bishop Skewer on a1
add_skewer(17, "4k3/ppp2ppp/8/8/3b4/8/P1P2PPP/R3K3 b - - 0 1", ["d4c3", "e1e2", "c3a1"], 1260, "medium",
           "Black Bishop Skewer on c3 #17 ♝", "...Bc3+ checks King and captures the a1 Rook!", "b",
           "Deliver ...Bc3+ and win the corner a1 Rook.", "win_rook", "+5 Rook ♜",
           "1...Bc3+ drove White's King to e2, and Black won the corner Rook with 2...Bxa1.",
           "Diagonal skewers against centralized kings win corner pieces.", ["c3", "a1"], ["d4", "c3"])

# 18. Queen 7th Rank Skewer on g7
add_skewer(18, "r3k2r/ppp2ppp/8/4Q3/8/8/PPP2PPP/4K2R w Kkq - 0 1", ["e5g7", "e8d7", "g7h8"], 1300, "medium",
           "Queen Infiltration on g7 #18 ♛", "Qxg7 attacks King and takes h8 Rook!", "w",
           "Capture g7 with the Queen and win the h8 Rook.", "win_rook", "+5 Rook ♜",
           "1. Qxg7 attacked Black's King and the h8 Rook. After 1...Kd7, White captured 2. Qxh8.",
           "Major pieces on the 7th rank leave defenders with no good squares.", ["g7", "h8"], ["e5", "g7"])

# 19. Black Queen 2nd Rank Skewer on g2
add_skewer(19, "r3k2r/ppp2ppp/8/8/4q3/8/PPP2PPP/4K2R b Kkq - 0 1", ["e4g2", "e1d2", "g2h1"], 1340, "medium",
           "Black Queen Infiltration on g2 #19 ♛", "...Qxg2 skewers the corner h1 Rook!", "b",
           "Capture g2 with the Queen and take the h1 Rook.", "win_rook", "+5 Rook ♜",
           "1...Qxg2 attacked White's King and corner h1 Rook. After 2. Kd2, Black captured 2...Qxh1.",
           "Queen invasions on the second rank decimate enemy rook positions.", ["g2", "h1"], ["e4", "g2"])

# 20. Bishop Skewer on b7
add_skewer(20, "r3k2r/ppp2ppp/B7/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1", ["a6b7", "a8b8", "b7c6"], 1380, "medium",
           "Bishop Infiltration on b7 #20 ♝", "Bxb7 attacks the a8 Rook with tempo!", "w",
           "Capture on b7 and reposition to c6 with check.", "win_pawn", "+1 Pawn ♟",
           "1. Bxb7 won Black's b7 pawn and attacked the a8 Rook, consolidating with 2. Bc6+.",
           "Flank bishops slicing through enemy pawn chains create winning passed pawns.", ["b7", "c6"], ["a6", "b7"])

# 21. Black Bishop Skewer on b2
add_skewer(21, "r3k2r/ppp2ppp/8/8/8/b7/PPP2PPP/R3K2R b KQkq - 0 1", ["a3b2", "a1b1", "b2c3"], 1420, "medium",
           "Black Bishop Infiltration on b2 #21 ♝", "...Bxb2 snatches the b2 pawn!", "b",
           "Capture on b2 and check the King with ...Bc3+.", "win_pawn", "+1 Pawn ♟",
           "1...Bxb2 won White's b2 pawn. When White played 2. Rb1, Black replied 2...Bc3+ winning with check.",
           "Checking intermediate moves secure piece safety after snatching pawns.", ["b2", "c3"], ["a3", "b2"])

# 22. 7th Rank d-File Pawn Skewer
add_skewer(22, "4k3/3R2p1/8/8/8/8/PPP2PPP/4K3 w - - 0 1", ["d7g7", "e8f8", "g7a7"], 1460, "medium",
           "Rook 7th Rank Pawn Sweep #22 ♜", "Rxg7 wins pawn with check threat!", "w",
           "Capture g7 and retreat safely.", "win_pawn", "+1 Pawn ♟",
           "1. Rxg7 won Black's g7 pawn. After 1...Kf8, White retreated 2. Ra7 holding a decisive endgame lead.",
           "Pawn sweeps along the 7th rank clear the way for your own passed pawns.", ["g7", "a7"], ["d7", "g7"])

# 23. Black 2nd Rank d-File Pawn Skewer
add_skewer(23, "4k3/ppp2ppp/8/8/8/8/3r2P1/4K3 b - - 0 1", ["d2g2", "e1f1", "g2a2"], 1500, "hard",
           "Black 2nd Rank Pawn Sweep #23 ♜", "...Rxg2 captures the g2 pawn cleanly!", "b",
           "Capture g2 with the Rook and retreat to a2.", "win_pawn", "+1 Pawn ♟",
           "1...Rxg2 won White's g2 pawn. After 2. Kf1, Black retreated 2...Ra2 securing the win.",
           "Converting endgames requires picking off every loose enemy pawn with active rooks.", ["g2", "a2"], ["d2", "g2"])

# 24. Queen Skewer Infiltration on b7
add_skewer(24, "r3k2r/ppp2ppp/8/8/8/5Q2/PPP2PPP/4K2R w Kkq - 0 1", ["f3b7", "e8g8", "b7a8"], 1550, "hard",
           "Queen Diagonal Infiltration on b7 #24 ♛", "Qxb7 invades and captures the a8 Rook!", "w",
           "Capture on b7 and take the corner a8 Rook.", "win_rook", "+5 Rook ♜",
           "1. Qxb7 attacked Black's corner Rook. When Black castled 1...O-O, White captured 2. Qxa8.",
           "Invading along the diagonal skewers corner pieces even if the king castles.", ["b7", "a8"], ["f3", "b7"])

# 25. Black Queen Diagonal Infiltration on b2
add_skewer(25, "r3k2r/ppp2ppp/5q2/8/8/8/PPP2PPP/4K2R b Kkq - 0 1", ["f6b2", "e1g1", "b2a1"], 1600, "hard",
           "Black Queen Diagonal Infiltration on b2 #25 ♛", "...Qxb2 invades and wins the a1 Rook!", "b",
           "Capture on b2 and win the corner a1 Rook.", "win_rook", "+5 Rook ♜",
           "1...Qxb2 attacked White's a1 Rook. After 2. O-O, Black captured 2...Qxa1 cleanly.",
           "Black's Queen on b2 delivers the same deadly diagonal skewer as White's on b7.", ["b2", "a1"], ["f6", "b2"])

# 26. Queen Double-Rank Skewer on e4
add_skewer(26, "r3k2r/ppp2ppp/8/8/2Q5/8/PPP2PPP/R3K2R w KQkq - 0 1", ["c4e4", "e8f8", "e4b7"], 1650, "hard",
           "Queen Double-Rank Skewer on e4 #26 ♛", "Qe4+ checks King and invades b7!", "w",
           "Deliver Qe4+ and capture the b7 pawn.", "win_pawn", "+1 Pawn ♟",
           "1. Qe4+ forced Black's King to f8, and White snatched 2. Qxb7 attacking the a8 Rook.",
           "Double-rank skewers drive the king to the side and demolish the queenside.", ["e4", "b7"], ["c4", "e4"])

# 27. Black Queen Skewer on e4
add_skewer(27, "r3k2r/ppp2ppp/8/8/2q5/8/PPP2PPP/R3K2R b KQkq - 0 1", ["c4e4", "e1d2", "e4g2"], 1700, "hard",
           "Black Queen Skewer on e4 #27 ♛", "...Qe4+ drives King and captures g2!", "b",
           "Deliver ...Qe4+ and capture the g2 pawn.", "win_pawn", "+1 Pawn ♟",
           "1...Qe4+ drove White's King to d2, and Black captured 2...Qxg2 with an overwhelming attack.",
           "Invading the 2nd rank with the Queen leads directly to checkmating nets.", ["e4", "g2"], ["c4", "e4"])

# 28. Long Diagonal Corner Snatch on a8
add_skewer(28, "r3k2r/p1p2ppp/8/3B4/8/8/PPP2PPP/4K2R w Kkq - 0 1", ["d5a8", "e8e7", "a8e4"], 1750, "hard",
           "Long Diagonal Corner Snatch on a8 #28 ♝", "Bxa8 wins Black's trapped corner Rook!", "w",
           "Capture the corner a8 Rook and reposition the Bishop safely to e4.", "win_rook", "+5 Rook ♜",
           "1. Bxa8 won Black's corner Rook cleanly. After 1...Ke7, White repositioned 2. Be4 controlling key central squares.",
           "Diagonals that pierce the enemy back rank directly trap corner rooks.", ["a8", "e4"], ["d5", "a8"])

# 29. Master 8th Rank Skewer Payoff
add_skewer(29, "r6k/R7/8/8/8/8/PPP2PPP/4K3 w - - 0 1", ["a7a8", "h8g7", "e1e2"], 1850, "expert",
           "Master Corner Decapitation on a8 #29 ♜", "Rxa8+ captures the a8 Rook with check!", "w",
           "Capture the a8 Rook and centralize the King.", "win_rook", "+5 Rook ♜",
           "1. Rxa8+ captured Black's corner Rook with check. After 1...Kg7, White mobilized 2. Ke2.",
           "When corner pieces are trapped, systematic rook captures clear the board.", ["a8", "e2"], ["a7", "e1"])

# 30. Master 1st Rank Skewer Payoff
add_skewer(30, "4k2r/8/8/8/8/8/r7/R3K3 b - - 0 1", ["a2a1", "e1e2", "a1h1"], 1950, "expert",
           "Master Black Corner Decapitation on a1 #30 ♜", "...Rxa1+ skewers King and wins h1 Rook!", "b",
           "Capture the a1 Rook and win the h1 Rook.", "win_rook", "+5 Rook ♜",
           "1...Rxa1+ captured White's a1 Rook with check. After 2. Ke2, Black won 2...Rxh1 for a master victory.",
           "Back-rank dominance decides high-level master games instantly.", ["a1", "h1"], ["a2", "a1"])

if __name__ == "__main__":
    save_and_verify("skewers.json", "SKEWER_DATA", SKEWERS)
