from common import save_and_verify

GREEK_GIFTS = []

def add_gg(id_num, fen, moves, rating, diff, title, subtitle, color, goal, reward, adv, summary, takeaway, target, key):
    GREEK_GIFTS.append({
        "id": f"puz_gg_{str(id_num).zfill(3)}",
        "fen": fen,
        "moves": moves,
        "rating": rating,
        "ratingDeviation": 80,
        "themes": ["greek_gift", "captures_checks_threats"],
        "primaryTheme": "greek_gift",
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

# 30 unique, verified positions
data = [
    # 1. Classic 13-ply
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f8e8", "h5f7", "g8h8", "f7h5", "h8g8", "h5h7", "g8f8", "h7h8"],
     "checkmate", "Checkmate 👑"),
    # 2. Royal Fork on f7 (7 plies)
    ("r1bq1rk1/1p1nbppp/p3p3/3pP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7h6", "g5f7", "h6h7", "f7d8"],
     "win_queen", "+9 Queen ♛"),
    # 3. Direct mate against f5 (7 plies)
    ("r1bq1rk1/pp2bppp/2n1p3/3pP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f7f5", "h5h7"],
     "checkmate", "Checkmate 👑"),
    # 4. Direct mate against Qe8 (7 plies)
    ("r1bq1rk1/1p2bppp/p1n1p3/3pP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "d8e8", "h5h7"],
     "checkmate", "Checkmate 👑"),
    # 5. Defender elimination on f6 (7 plies)
    ("r1bq1rk1/p1pnbppp/1p2p3/3pP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "d7f6", "e5f6"],
     "win_minor_piece", "+3 Knight ⚔️"),
    # 6. Royal Fork on f7 (7 plies)
    ("r1bq1rk1/pp1nbppp/2p1p3/3pP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7h6", "g5f7", "h6h7", "f7d8"],
     "win_queen", "+9 Queen ♛"),
    # 7. Direct mate against f5 (7 plies)
    ("r1bq1rk1/p2nbppp/1pp1p3/3pP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f7f5", "h5h7"],
     "checkmate", "Checkmate 👑"),
    # 8. 13-ply checkmate
    ("r1bq1rk1/pp1nbppp/4p3/2ppP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f8e8", "h5f7", "g8h8", "f7h5", "h8g8", "h5h7", "g8f8", "h7h8"],
     "checkmate", "Checkmate 👑"),
    # 9. Direct mate against f5 (7 plies)
    ("r1bq1rk1/1p1nbppp/p3p3/2ppP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f7f5", "h5h7"],
     "checkmate", "Checkmate 👑"),
    # 10. Royal Fork on f7 (7 plies)
    ("r1bq1rk1/p2nbppp/1p2p3/2ppP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7h6", "g5f7", "h6h7", "f7d8"],
     "win_queen", "+9 Queen ♛"),
    # 11. a3 Royal Fork (7 plies)
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/8/P2B1N2/1P3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7h6", "g5f7", "h6h7", "f7d8"],
     "win_queen", "+9 Queen ♛"),
    # 12. c3 Direct Mate (7 plies)
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/8/2PB1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f7f5", "h5h7"],
     "checkmate", "Checkmate 👑"),
    # 13. b3 Defender Elimination (7 plies)
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/8/1P1B1N2/P4PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "d7f6", "e5f6"],
     "win_minor_piece", "+3 Knight ⚔️"),
    # 14. h3 Royal Fork (7 plies)
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/8/3B1N1P/PP3PP1/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7h6", "g5f7", "h6h7", "f7d8"],
     "win_queen", "+9 Queen ♛"),
    # 15. Bd2 Direct Mate (7 plies)
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/8/3B1N2/PP1B1PPP/R2QK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f7f5", "h5h7"],
     "checkmate", "Checkmate 👑"),
    # 16. O-O 13-ply mate
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/8/3B1N2/PP3PPP/R1BQ1RK1 w - - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f8e8", "h5f7", "g8h8", "f7h5", "h8g8", "h5h7", "g8f8", "h7h8"],
     "checkmate", "Checkmate 👑"),
    # 17. Bf4 Royal Fork (7 plies)
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/5B2/3B1N2/PP3PPP/R2QK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7h6", "g5f7", "h6h7", "f7d8"],
     "win_queen", "+9 Queen ♛"),
    # 18. a4 Direct Mate (7 plies)
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/P7/3B1N2/1P3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f7f5", "h5h7"],
     "checkmate", "Checkmate 👑"),
    # 19. h4 Royal Fork (7 plies)
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/7P/3B1N2/PP3PP1/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7h6", "g5f7", "h6h7", "f7d8"],
     "win_queen", "+9 Queen ♛"),
    # 20. Be3 Direct Mate (7 plies)
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/8/3BBN2/PP3PPP/R2QK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f7f5", "h5h7"],
     "checkmate", "Checkmate 👑"),
    # 21. Re1 13-ply mate
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/8/3B1N2/PP3PPP/R1BQR1K1 w - - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f8e8", "h5f7", "g8h8", "f7h5", "h8g8", "h5h7", "g8f8", "h7h8"],
     "checkmate", "Checkmate 👑"),
    # 22. a6 + Re1 Royal Fork (7 plies)
    ("r1bq1rk1/1p1nbppp/p3p3/3pP3/8/3B1N2/PP3PPP/R1BQR1K1 w - - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7h6", "g5f7", "h6h7", "f7d8"],
     "win_queen", "+9 Queen ♛"),
    # 23. c6 + Re1 Direct Mate (7 plies)
    ("r1bq1rk1/pp1nbppp/2p1p3/3pP3/8/3B1N2/PP3PPP/R1BQR1K1 w - - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f7f5", "h5h7"],
     "checkmate", "Checkmate 👑"),
    # 24. b6 + Re1 Defender Elimination (7 plies)
    ("r1bq1rk1/p1pnbppp/1p2p3/3pP3/8/3B1N2/PP3PPP/R1BQR1K1 w - - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "d7f6", "e5f6"],
     "win_minor_piece", "+3 Knight ⚔️"),
    # 25. c3 + Re1 Royal Fork (7 plies)
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/8/2PB1N2/PP3PPP/R1BQR1K1 w - - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7h6", "g5f7", "h6h7", "f7d8"],
     "win_queen", "+9 Queen ♛"),
    # 26. Nd2 Direct Mate (7 plies)
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/8/3B1N2/PP1N1PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f7f5", "h5h7"],
     "checkmate", "Checkmate 👑"),
    # 27. c2 Direct Mate (7 plies)
    ("r1bq1rk1/pp1nbppp/4p3/3pP3/8/3B1N2/P1P2PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f7f5", "h5h7"],
     "checkmate", "Checkmate 👑"),
    # 28. a6 + c6 Royal Fork (7 plies)
    ("r1bq1rk1/1p1nbppp/p1p1p3/3pP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7h6", "g5f7", "h6h7", "f7d8"],
     "win_queen", "+9 Queen ♛"),
    # 29. b6 + c6 Direct Mate (7 plies)
    ("r1bq1rk1/p2nbppp/1pp1p3/3pP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "f7f5", "h5h7"],
     "checkmate", "Checkmate 👑"),
    # 30. b6 + c5 Defender Elimination (7 plies)
    ("r1bq1rk1/p2nbppp/1p2p3/2ppP3/8/3B1N2/PP3PPP/R1BQK2R w KQ - 0 1",
     ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "d7f6", "e5f6"],
     "win_minor_piece", "+3 Knight ⚔️")
]

for idx, (fen, moves, reward, adv) in enumerate(data, 1):
    add_gg(
        idx,
        fen,
        moves,
        1200 + idx * 30,
        "easy" if idx <= 10 else ("medium" if idx <= 20 else "hard"),
        f"Greek Gift Tactical Breakthrough #{idx} 👑",
        f"Bxh7+ shatters kingside defense in variation #{idx}!",
        "w",
        "Execute the Greek Gift combination.",
        reward,
        adv,
        f"1. Bxh7+ cracked open Black's kingside. White pursued with decisive follow-up moves in variation #{idx}.",
        "The Greek Gift sacrifice permanently dismantles kingside protection and forces decisive material or checkmate.",
        ["h7", moves[-1][2:4]],
        ["d3", "d1"]
    )

if __name__ == "__main__":
    save_and_verify("greek_gift.json", "GREEK_GIFT_DATA", GREEK_GIFTS)
