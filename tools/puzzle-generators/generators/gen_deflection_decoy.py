from common import save_and_verify

DEFLECTIONS = []

def add_defl(id_num, fen, moves, rating, diff, title, subtitle, color, goal, reward, adv, summary, takeaway, target, key):
    DEFLECTIONS.append({
        "id": f"puz_defl_{str(id_num).zfill(3)}",
        "fen": fen,
        "moves": moves,
        "rating": rating,
        "ratingDeviation": 80,
        "themes": ["deflection_decoy", "captures_checks_threats"],
        "primaryTheme": "deflection_decoy",
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

# 1. Deflection on f7
add_defl(1, "r1bqk2r/pppp1ppp/2n5/4p3/2B1n3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1", ["c4f7", "e8f7", "d3e4"], 650, "novice",
         "King Deflection on f7 #1 ♝", "Bxf7+ deflects King and dxe4 wins the knight!", "w",
         "Sacrifice on f7 with check and capture on e4.", "win_pawn", "+1 Center Pawn ♟",
         "1. Bxf7+ deflected Black's King from e8. After 1...Kxf7, White captured 2. dxe4 winning the knight cleanly.",
         "Deflecting the enemy king strips castling rights and recovers material with interest.", ["f7", "e4"], ["c4", "d3"])

# 2. Deflection of f6 Defender
add_defl(2, "r1bq1rk1/ppp2ppp/2n5/3pP3/1b1P4/2N2N2/PPP2PPP/R1BQKB1R w KQ - 0 1", ["c1g5", "f7f6", "e5f6"], 700, "novice",
         "Deflection Pin on f6 #2 ♟", "Bg5 pins the Queen and exf6 wins a pawn!", "w",
         "Pin with Bg5 and break through on f6.", "win_pawn", "+1 Kingside Pawn ♟",
         "1. Bg5 deflected Black's pawn chain. After 1...f6, White opened lines with 2. exf6 gaining a pawn.",
         "Deflection pins in front of the enemy queen force defensive weaknesses.", ["g5", "f6"], ["c1", "e5"])

# 3. Black Queen Deflection on d5
add_defl(3, "r1bq1rk1/ppp2ppp/2n5/3N4/1b1P4/3B1N2/PP1B1PPP/R2QK2R b KQ - 0 1", ["d8d5", "d2b4", "c6b4"], 750, "novice",
         "Central Decoy Snatch on d5 #3 ♛", "...Qxd5 centralizes and ...Nxb4 recaptures!", "b",
         "Capture on d5 with the Queen and recapture on b4.", "win_minor_piece", "+3 Knight ⚔️",
         "1...Qxd5 won White's knight on d5. After 2. Bxb4, Black recaptured 2...Nxb4.",
         "Decoying pieces away from central defense wins material and outpost squares.", ["d5", "b4"], ["d8", "c6"])

# 4. Deflection of c6 Knight
add_disc_4 = ("r1bqk2r/pppp1ppp/2n5/3Pp3/1b2P3/5N2/PPP2PPP/R1BQKB1R w KQkq - 0 1", ["c2c3", "b4c5", "d5c6"], 800, "novice",
              "Deflecting the Bishop with c3 #4 ♟", "c3 deflects Bishop and dxc6 captures Knight!", "w",
              "Push c3 to kick the Bishop and capture on c6.", "win_minor_piece", "+3 Knight ⚔️",
              "1. c3 deflected Black's Bishop to c5, enabling White to capture 2. dxc6 winning the knight.",
              "Deflecting aggressive pieces before capturing hanging pieces is fundamentally sound.", ["c3", "c6"], ["c2", "d5"])
add_defl(4, *add_disc_4)

# 5. Black Deflection on e5
add_defl(5, "r1bqk2r/pppp1ppp/2n2n2/4N3/1b2P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 1", ["c6e5", "c2c3", "b4e7"], 850, "novice",
         "Knight Decoy Capture on e5 #5 ♞", "...Nxe5 captures overextended Knight!", "b",
         "Capture on e5 and preserve the Bishop.", "win_minor_piece", "+3 Knight ⚔️",
         "1...Nxe5 captured White's Knight on e5. After 2. c3, Black retreated 2...Be7 safely.",
         "Decoy captures punish premature knight leaps.", ["e5", "e7"], ["c6", "b4"])

# 6. King Decoy on d6
add_defl(6, "r1b1k2r/pppp1ppp/2n5/4P3/1b2N3/8/PPPP1PPP/R1BQKB1R w KQkq - 0 1", ["e4d6", "e8e7", "d6c8"], 900, "easy",
         "Knight Decoy Leap to d6 #6 ♞", "Nd6+ decoys the King and captures c8 Bishop!", "w",
         "Deliver Nd6+ and capture the c8 Bishop.", "win_minor_piece", "+3 Bishop ⚔️",
         "1. Nd6+ drove Black's King to e7, and White took 2. Nxc8+ up a full minor piece.",
         "Decoying kings onto awkward squares disrupts piece harmony.", ["d6", "c8"], ["e4", "d6"])

# 7. Corner Decoy on c7
add_defl(7, "r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1", ["d5c7", "e8e7", "c7a8"], 950, "easy",
         "Knight Fork-Decoy on c7 #7 ♞", "Nxc7+ decoys King and takes corner a8 Rook!", "w",
         "Deliver Nxc7+ and capture the a8 Rook.", "win_rook", "+5 Rook ♜",
         "1. Nxc7+ checked Black's King and forked the a8 Rook. After 1...Ke7, White captured 2. Nxa8.",
         "Forking decoys to c7 win corner rooks with ruthless efficiency.", ["c7", "a8"], ["d5", "c7"])

# 8. Black Central Pawn Deflection on e5
add_defl(8, "r1bqk2r/ppp2ppp/2n5/4P3/1b1N4/2N5/PPP2PPP/R1BQKB1R b KQkq - 0 1", ["c6e5", "c1d2", "e8g8"], 1000, "easy",
         "Black Central Pawn Snatch on e5 #8 ♟", "...Nxe5 wins the e5 pawn while c3 is pinned!", "b",
         "Capture on e5 and castle safely.", "win_pawn", "+1 Center Pawn ♟",
         "1...Nxe5 won the e5 pawn while White's c3 Knight was pinned. After 2. Bd2, Black castled 2...O-O.",
         "Deflecting defenders by pinning adjacent pieces wins center pawns.", ["e5", "g8"], ["c6", "e8"])

# 9. Deflection into Bishop Capture on b4
add_defl(9, "r1b1k2r/ppp2ppp/2n1pn2/3p4/1bPP4/2N1PN2/PP1B1PPP/R2QKB1R w KQkq - 0 1", ["c3d5", "e6d5", "d2b4"], 1050, "easy",
         "Deflection into Bishop Snatch #9 ♞", "Nxd5 deflects pawn and captures b4 Bishop!", "w",
         "Capture on d5 and take the loose b4 Bishop.", "win_minor_piece", "+3 Bishop ⚔️",
         "1. Nxd5 deflected Black's e-pawn. After 1...exd5, White captured 2. Bxb4.",
         "Deflecting central pawns opens lines to vulnerable flank pieces.", ["d5", "b4"], ["c3", "d2"])

# 10. Deflection on e6
add_defl(10, "3rkb1r/pppn1ppp/4pn2/8/3P4/2N2N2/PPP2PPP/R1BQR1K1 w k - 0 1", ["d4d5", "f8e7", "d5e6"], 1100, "easy",
         "Pawn Breakthrough on e6 #10 ♟", "d5 and dxe6 exploits the pinned e-file!", "w",
         "Push d5 and capture on e6.", "win_pawn", "+1 Center Pawn ♟",
         "1. d5 exploited the pinned e6 pawn. After 1...Be7, White captured 2. dxe6 breaking open Black's position.",
         "Push pawns against pinned enemy pawns to rip open files to the king.", ["d5", "e6"], ["d4", "e1"])

# 11. Deflection of Kingside Pawn Shield
add_defl(11, "r1bqk2r/pppp1ppp/2n5/4N3/2B1n3/8/PPPP1PPP/RNBQK2R w KQkq - 0 1", ["c4f7", "e8e7", "d2d4"], 1150, "easy",
         "Bishop Decoy on f7 #11 ♝", "Bxf7+ decoys King and d4 supports!", "w",
         "Capture f7 with check and establish the d4 center.", "win_pawn", "+1 Center Pawn ♟",
         "1. Bxf7+ drove Black's King to e7. White then fortified the center with 2. d4 maintaining devastating threats.",
         "Decoying attacks on f7 strip the King of castling rights forever.", ["f7", "d4"], ["c4", "d2"])

# 12. Black Decoy Leap to e4
add_defl(12, "r1bqk2r/ppp2ppp/2n2n2/3p4/1b1P4/2N2N2/PPP1BPPP/R1BQK2R b KQkq - 0 1", ["f6e4", "c1d2", "e4d2"], 1200, "easy",
         "Black Knight Decoy Leap to e4 #12 ♞", "...Ne4 attacks the pinned c3 Knight!", "b",
         "Jump to e4 and trade on d2.", "win_minor_piece", "+3 Bishop ⚔️",
         "1...Ne4 attacked the pinned c3 Knight. After 2. Bd2, Black traded 2...Nxd2 cleanly.",
         "Jumping into pins forces the opponent to yield the bishop pair.", ["e4", "d2"], ["f6", "e4"])

# 13. Knight Deflection on c6
add_defl(13, "r1bqk2r/ppp1bppp/2n5/1B1pN3/3P4/8/PPP2PPP/R1BQK2R w KQkq - 0 1", ["e5c6", "b7c6", "b5c6"], 1250, "medium",
         "Knight-Bishop Deflection on c6 #13 ♞", "Nxc6 eliminates defender and Bxc6+ forks!", "w",
         "Capture on c6 with Knight and deliver Bxc6+.", "win_minor_piece", "+3 Knight ⚔️",
         "1. Nxc6 eliminated Black's Knight. After 1...bxc6, White checked with 2. Bxc6+ winning the corner.",
         "Consecutive piece sacrifices and captures on c6 overwhelm queenside defenses.", ["c6", "c6"], ["e5", "b5"])

# 14. Queen Deflection Fork on c7
add_defl(14, "r1b1k2r/pppq1ppp/2n5/1B1NP3/8/5N2/PPP2PPP/R1BQK2R w KQkq - 0 1", ["d5c7", "d7c7", "b5c6"], 1300, "medium",
         "Knight Deflection Fork on c7 #14 ♞", "Nxc7+ deflects the Queen and Bxc6 trades cleanly!", "w",
         "Deliver Nxc7+ and capture on c6 with the Bishop.", "win_minor_piece", "+3 Knight ⚔️",
         "1. Nxc7+ deflected Black's Queen. After 1...Qxc7, White captured 2. Bxc6+ keeping full control.",
         "Discovered knight forks force heavy pieces onto vulnerable squares.", ["c7", "c6"], ["d5", "b5"])

# 15. Black Decoy Pawn Snatch on e4
add_defl(15, "r1bqk2r/pp1p1ppp/2n1pn2/8/1b1NP3/2N5/PPP1BPPP/R1BQK2R b KQkq - 0 1", ["f6e4", "d4c6", "b7c6"], 1350, "medium",
         "Black Decoy Snatch on e4 #15 ♟", "...Nxe4 exploits the pinned c3 Knight!", "b",
         "Capture on e4 and recapture on c6.", "win_pawn", "+1 Center Pawn ♟",
         "1...Nxe4 won the e4 pawn. After 2. Nxc6, Black recaptured 2...bxc6 with an active center.",
         "Exploiting pins with knight discoveries wins key central pawns.", ["e4", "c6"], ["f6", "b7"])

# 16. Deflecting the Castled Defender on f6
add_defl(16, "r1b1k2r/pppp1ppp/8/8/1b1q4/8/PPPPBPPP/R1BQK2R w KQkq - 0 1", ["c2c3", "d4e5", "c3b4"], 1400, "medium",
         "Pawn Fork & Deflection on c3 #16 ♟", "c3 attacks Queen and Bishop winning a piece!", "w",
         "Play c3 to fork the Queen and Bishop, winning a minor piece.", "win_minor_piece", "+3 Minor Piece ⚔️",
         "1. c3 forked Black's Queen on d4 and Bishop on b4. After 1...Qe5, White captured 2. cxb4 winning a piece cleanly.",
         "Pawn attacks against overloaded major pieces win decisive material.", ["c3", "b4"], ["c2", "c3"])

# 17. Deflecting the Pin with a3
add_defl(17, "r1b1k2r/pppp1ppp/8/8/1b1q4/4N3/PPPPBPPP/R1BQK2R w KQkq - 0 1", ["c2c3", "d4d6", "c3b4"], 1450, "medium",
         "Queen Deflection & Piece Capture #17 ♟", "c3 drives the Queen away and wins the Bishop!", "w",
         "Deflect the Queen with c3 and take the b4 Bishop.", "win_minor_piece", "+3 Bishop ⚔️",
         "1. c3 forced Black's Queen to retreat to d6, after which White snapped 2. cxb4.",
         "Deflecting Queen defenders leaves their targets undefended.", ["c3", "b4"], ["c2", "c3"])

# 18. Center Pawn Deflection on d5
add_defl(18, "r1bqk2r/pppp1ppp/2n2n2/3Pp3/1b2P3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 1", ["d5c6", "b7c6", "c1d2"], 1500, "hard",
         "Center Pawn Deflection on c6 #18 ♟", "dxc6 wins Knight and Bd2 neutralizes pin!", "w",
         "Capture on c6 and unpin with Bd2.", "win_minor_piece", "+3 Knight ⚔️",
         "1. dxc6 won Black's Knight on c6. After 1...bxc6, White played 2. Bd2 neutralizing all counterplay.",
         "Pawn breaks that eliminate pinned defenders decide opening battles.", ["c6", "d2"], ["d5", "c1"])

# 19. Black Center Liquidation Deflection on d4
add_defl(19, "r1bqk2r/pp2bppp/2n1pn2/2pp4/2PP4/2N1PN2/PP1B1PPP/R2QKB1R b KQkq - 0 1", ["c5d4", "e3d4", "c6d4"], 1550, "hard",
         "Black Central Pawn Snatch on d4 #19 ♟", "...cxd4 and ...Nxd4 wins White's central pawn!", "b",
         "Liquidate on d4 and capture the d4 pawn with the Knight.", "win_pawn", "+1 Center Pawn ♟",
         "1...cxd4 forced 2. exd4, after which Black grabbed 2...Nxd4 winning the d4 pawn.",
         "Exchanging pawns to isolate and capture central pawns nets clean material.", ["d4", "d4"], ["c5", "c6"])

# 20. Deflection Kick on b4
add_defl(20, "r1bqk2r/pp3ppp/2n1pn2/2pp4/1bPP4/2N1PN2/PP1B1PPP/R2QKB1R w KQkq - 0 1", ["c4d5", "e6d5", "d4c5"], 1600, "hard",
         "Deflecting Center Tension #20 ♟", "cxd5 and dxc5 breaks open the center!", "w",
         "Capture on d5 and win the c5 pawn.", "win_pawn", "+1 Pawn ♟",
         "1. cxd5 exd5 2. dxc5 won the c5 pawn cleanly.",
         "Opening lines in the center exposes enemy minor pieces.", ["d5", "c5"], ["c4", "d4"])

# 21. Queen Deflection Raid on b7
add_defl(21, "r2qk2r/pppb1ppp/2n1pn2/3p4/2PP4/1QN1PN2/PP2BPPP/R1B1K2R w KQkq - 0 1", ["b3b7", "a8b8", "b7a6"], 1650, "hard",
         "Queen Deflection Infiltration on b7 #21 ♛", "Qxb7 snatches the queenside pawn!", "w",
         "Capture b7 with the Queen and retreat to a6.", "win_pawn", "+1 Queenside Pawn ♟",
         "1. Qxb7 won Black's b7 pawn. When Black replied 1...Rab8, White retreated 2. Qa6 cleanly.",
         "Unmasking queen pathways onto the 7th rank wins free flank pawns.", ["b7", "a6"], ["b3", "b7"])

# 22. Black Deflection Snatch on e4
add_defl(22, "r1bqkb1r/pppp1ppp/2n2n2/4p3/1b2P3/2N2N2/PPPP1PPP/R1BQKB1R b KQkq - 0 1", ["b4c3", "d2c3", "f6e4"], 1700, "hard",
         "Black Deflection Pawn Snatch on e4 #22 ♟", "...Bxc3+ eliminates defender and ...Nxe4 wins pawn!", "b",
         "Capture on c3 and take the e4 pawn with the Knight.", "win_pawn", "+1 Center Pawn ♟",
         "1...Bxc3+ removed the guardian of e4. After 2. dxc3, Black captured 2...Nxe4.",
         "Removing the defending knight allows an immediate central pawn capture.", ["c3", "e4"], ["b4", "f6"])

# 23. Knight Deflection on e5
add_defl(23, "r1bqk2r/pppp1ppp/2n2n2/4p3/3PP3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 1", ["d4e5", "f6g4", "c1f4"], 1750, "hard",
         "Center Pawn Deflection on e5 #23 ♟", "dxe5 wins the pawn and Bf4 defends cleanly!", "w",
         "Capture on e5 and defend with Bf4.", "win_pawn", "+1 Center Pawn ♟",
         "1. dxe5 won Black's e5 pawn. When Black played 1...Ng4, White defended 2. Bf4 securing the extra pawn.",
         "Pawn discoveries that win center pawns must be immediately consolidated.", ["e5", "f4"], ["d4", "c1"])

# 24. Bishop Deflection Fork on a8
add_defl(24, "r3k2r/p1p2ppp/1pn1pn2/1B1p4/2PP4/P1N1PN2/1P3PPP/R1BQK2R w KQkq - 0 1", ["b5c6", "e8e7", "c6a8"], 1800, "expert",
         "Bishop Deflection Fork on a8 #24 ♝", "Bxc6+ checks King and captures the corner a8 Rook!", "w",
         "Deliver Bxc6+ and capture the a8 Rook.", "win_rook", "+5 Rook ♜",
         "1. Bxc6+ checked Black's King and attacked the a8 Rook. After 1...Ke7, White captured 2. Bxa8.",
         "Discovered diagonal attacks against uncastled kings sweep corner rooks.", ["c6", "a8"], ["b5", "c6"])

# 25. Black Deflection Pressure on c3
add_defl(25, "r1bqk2r/ppp2ppp/2n1pn2/3p4/1b1P4/2N1PN2/PPP1BPPP/R1BQK2R b KQkq - 0 1", ["f6e4", "c1d2", "b4c3"], 1850, "expert",
         "Black Deflection Pressure on c3 #25 📌", "...Ne4 piles pressure on the pinned Knight!", "b",
         "Jump to e4 and trade on c3.", "win_minor_piece", "+3 Knight ⚔️",
         "1...Ne4 attacked the pinned c3 Knight. After 2. Bd2, Black captured 2...Bxc3 winning the piece.",
         "Adding attackers to pinned pieces creates unstoppable discovered threats.", ["e4", "c3"], ["f6", "b4"])

# 26. Deflection Bishop Capture on b4
add_defl(26, "r1bqk2r/ppp2ppp/2n5/3pP3/1b1P4/P1N2N2/1PP1BPPP/R1BQK2R w KQkq - 0 1", ["a3b4", "c6b4", "e1g1"], 1900, "expert",
         "Pawn Deflection on b4 #26 ♟", "axb4 wins Black's Bishop on b4!", "w",
         "Capture on b4 and castle safely.", "win_minor_piece", "+3 Bishop ⚔️",
         "1. axb4 won Black's loose Bishop on b4. After 1...Nxb4, White castled 2. O-O up a full piece.",
         "Flank pawn advances win enemy pieces when their retreat squares are cut off.", ["b4", "g1"], ["a3", "e1"])

# 27. Black Central Deflection Snatch on e5
add_defl(27, "r1bqk2r/pppp1ppp/2n5/4P3/1b1N4/2N5/PPP2PPP/R1BQKB1R b KQkq - 0 1", ["c6e5", "c1d2", "e8g8"], 1950, "expert",
         "Black Deflection Snatch on e5 #27 ♟", "...Nxe5 wins the undefended e5 pawn!", "b",
         "Capture on e5 and castle safely.", "win_pawn", "+1 Center Pawn ♟",
         "1...Nxe5 won the e5 pawn while White's c3 Knight was pinned. After 2. Bd2, Black castled 2...O-O.",
         "Discovered strikes in the center win free material when defenders are pinned.", ["e5", "g8"], ["c6", "e8"])

# 28. Deflection Breakthrough on c6
add_defl(28, "r2qk2r/ppp1bppp/2n1pn2/3P4/3P4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 0 1", ["d5c6", "b7c6", "f1d3"], 2000, "expert",
         "Center Pawn Deflection on c6 #28 ♟", "dxc6 wins Black's Knight on c6!", "w",
         "Capture on c6 and develop the Bishop to d3.", "win_minor_piece", "+3 Knight ⚔️",
         "1. dxc6 won Black's Knight on c6. After 1...bxc6, White developed 2. Bd3 dominating the center.",
         "Discovered pawn captures disrupt the opponent's defensive structure completely.", ["c6", "d3"], ["d5", "f1"])

# 29. Central Pawn Deflection on c6
add_defl(29, "r1bqk2r/ppppbppp/2n5/3Pp3/4P3/5N2/PPP2PPP/R1BQKB1R w KQkq - 0 1", ["d5c6", "d7c6", "f1c4"], 2050, "expert",
         "Central Pawn Deflection on c6 #29 ♟", "dxc6 wins Knight and Bc4 develops with active diagonal control!", "w",
         "Capture on c6 and develop the Bishop to c4.", "win_minor_piece", "+3 Knight ⚔️",
         "1. dxc6 won Black's Knight on c6. After 1...dxc6, White developed 2. Bc4 controlling the crucial a2-g8 diagonal.",
         "Central pawn breakthroughs eliminate key defenders and open open attacking lines for bishops.", ["c6", "c4"], ["d5", "f1"])

# 30. Endgame Knight Liquidation Deflection
add_defl(30, "r1b1k2r/pppp1ppp/8/8/4n3/2P5/PP3PPP/R1B1KB1R w KQkq - 0 1", ["f1d3", "d7d5", "d3e4"], 2100, "expert",
         "Endgame Knight Deflection Removal #30 ♝", "Bd3 attacks the e4 Knight and Bxe4 liquidates!", "w",
         "Attack with Bd3 and capture the e4 Knight.", "win_minor_piece", "+3 Knight ⚔️",
         "1. Bd3 attacked the centralized e4 Knight, and after 1...d5, White captured 2. Bxe4 into a winning endgame.",
         "Liquidating the opponent's only active piece secures seamless endgame conversion.", ["d3", "e4"], ["f1", "d3"])

if __name__ == "__main__":
    save_and_verify("deflection_decoy.json", "DEFLECTION_DECOY_DATA", DEFLECTIONS)
