import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';
import { validatePuzzle, savePack } from './generate_complete_curated_db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Generating 11 Verified, High-Pedagogy Curated Packs with Clean Attack Corridors...');

// -------------------------------------------------------------------------
// 1. FORKS (32 Puzzles)
// -------------------------------------------------------------------------
const FORKS = [];

// White Knight Forks on c7 (16 puzzles)
for (let i = 0; i < 16; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'e8');
  chess.put({ type: 'r', color: 'b' }, 'a8');
  chess.put({ type: 'r', color: 'b' }, 'h8');
  chess.put({ type: 'p', color: 'b' }, 'a7');
  chess.put({ type: 'p', color: 'b' }, 'b7');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'e1');
  chess.put({ type: 'n', color: 'w' }, 'b5');
  chess.put({ type: 'r', color: 'w' }, 'h1');
  chess.put({ type: 'p', color: 'w' }, 'a2');
  chess.put({ type: 'p', color: 'w' }, 'b2');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'd3');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'd6');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'e3');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'e6');
  if (i >= 5) chess.put({ type: 'b', color: 'w' }, 'c1');
  if (i >= 6) chess.put({ type: 'b', color: 'b' }, 'c8');
  if (i >= 7) chess.put({ type: 'b', color: 'w' }, 'd2');
  if (i >= 8) chess.put({ type: 'b', color: 'b' }, 'd7');
  if (i >= 9) chess.put({ type: 'n', color: 'w' }, 'f3');
  if (i >= 10) chess.put({ type: 'n', color: 'b' }, 'f6');
  if (i >= 11) chess.put({ type: 'r', color: 'w' }, 'a1');
  if (i >= 12) chess.put({ type: 'p', color: 'w' }, 'a3');
  if (i >= 13) chess.put({ type: 'p', color: 'b' }, 'a6');
  if (i >= 14) chess.put({ type: 'p', color: 'w' }, 'h3');
  if (i >= 15) chess.put({ type: 'p', color: 'b' }, 'h6');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  FORKS.push({
    id: `puz_fork_${String(i + 1).padStart(3, '0')}`,
    fen,
    moves: ["b5c7", "e8d8", "c7a8"],
    rating: 650 + i * 25,
    themes: ["fork", "captures_checks_threats"],
    primaryTheme: "fork",
    difficulty: i < 6 ? "novice" : i < 12 ? "easy" : "medium",
    title: `Knight Fork on c7 #${i + 1} ♞`,
    playerColor: "w",
    tacticalGoal: "Deliver Nc7+ to fork King and a8 Rook, then capture on a8.",
    tacticalReward: "win_rook",
    outcomeAdvantage: "+5 Rook ♜",
    learningSummary: "1. Nxc7+ checked the King and forked the a8 Rook, winning 2. Nxa8 cleanly!",
    keyTakeaway: "Knights on c7 simultaneously attack the King on e8 and the undefended corner Rook on a8."
  });
}

// Black Knight Forks on c2 winning a1 Rook (16 puzzles)
for (let i = 0; i < 16; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'w' }, 'e1');
  chess.put({ type: 'r', color: 'w' }, 'a1');
  chess.put({ type: 'r', color: 'w' }, 'h1');
  chess.put({ type: 'p', color: 'w' }, 'a2');
  chess.put({ type: 'p', color: 'w' }, 'b2');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  chess.put({ type: 'k', color: 'b' }, 'e8');
  chess.put({ type: 'n', color: 'b' }, 'e3');
  chess.put({ type: 'r', color: 'b' }, 'h8');
  chess.put({ type: 'p', color: 'b' }, 'a7');
  chess.put({ type: 'p', color: 'b' }, 'b7');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  if (i >= 1) chess.put({ type: 'p', color: 'b' }, 'd6');
  if (i >= 2) chess.put({ type: 'p', color: 'w' }, 'd3');
  if (i >= 3) chess.put({ type: 'p', color: 'b' }, 'e6');
  if (i >= 4) chess.put({ type: 'p', color: 'w' }, 'e2');
  if (i >= 5) chess.put({ type: 'b', color: 'b' }, 'c8');
  if (i >= 6) chess.put({ type: 'b', color: 'w' }, 'c1');
  if (i >= 7) chess.put({ type: 'b', color: 'b' }, 'd7');
  if (i >= 8) chess.put({ type: 'b', color: 'w' }, 'd2');
  if (i >= 9) chess.put({ type: 'n', color: 'b' }, 'f6');
  if (i >= 10) chess.put({ type: 'n', color: 'w' }, 'f3');
  if (i >= 11) chess.put({ type: 'r', color: 'b' }, 'a8');
  if (i >= 12) chess.put({ type: 'p', color: 'b' }, 'a6');
  if (i >= 13) chess.put({ type: 'p', color: 'w' }, 'a3');
  if (i >= 14) chess.put({ type: 'p', color: 'b' }, 'h6');
  if (i >= 15) chess.put({ type: 'p', color: 'w' }, 'h3');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'b';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  FORKS.push({
    id: `puz_fork_${String(i + 17).padStart(3, '0')}`,
    fen,
    moves: ["e3c2", "e1d1", "c2a1"],
    rating: 1050 + i * 25,
    themes: ["fork", "captures_checks_threats"],
    primaryTheme: "fork",
    difficulty: i < 6 ? "medium" : i < 12 ? "hard" : "expert",
    title: `Black Knight Fork on c2 #${i + 17} ♞`,
    playerColor: "b",
    tacticalGoal: "Deliver Nxc2+ to fork White King and a1 Rook, winning on a1.",
    tacticalReward: "win_rook",
    outcomeAdvantage: "+5 Rook ♜",
    learningSummary: "1... Nxc2+ checked White's King on e1 and forked the a1 Rook, winning 2... Nxa1 cleanly!",
    keyTakeaway: "Black knights on c2 mirror White knights on c7 to devastating effect."
  });
}
savePack('forks', 'FORK_DATA', FORKS);

// -------------------------------------------------------------------------
// 2. PINS (32 Puzzles)
// -------------------------------------------------------------------------
const PINS = [];
// 16 Absolute Bishop Pins & Captures on d7 (Bxd7+ Qxd7 Ne2)
for (let i = 0; i < 16; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'e8');
  chess.put({ type: 'q', color: 'b' }, 'd8');
  chess.put({ type: 'r', color: 'b' }, 'd7');
  chess.put({ type: 'b', color: 'b' }, 'f8');
  chess.put({ type: 'r', color: 'b' }, 'h8');
  chess.put({ type: 'p', color: 'b' }, 'a7');
  chess.put({ type: 'p', color: 'b' }, 'b7');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'e1');
  chess.put({ type: 'b', color: 'w' }, 'b5');
  chess.put({ type: 'n', color: 'w' }, 'g1');
  chess.put({ type: 'r', color: 'w' }, 'a1');
  chess.put({ type: 'p', color: 'w' }, 'a2');
  chess.put({ type: 'p', color: 'w' }, 'b2');
  chess.put({ type: 'p', color: 'w' }, 'c2');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'd3');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'e6');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'e3');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'a6');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'a3');
  if (i >= 6) chess.put({ type: 'p', color: 'b' }, 'h6');
  if (i >= 7) chess.put({ type: 'p', color: 'w' }, 'h3');
  if (i >= 8) chess.put({ type: 'b', color: 'w' }, 'c1');
  if (i >= 9) chess.put({ type: 'b', color: 'b' }, 'c8');
  if (i >= 10) chess.put({ type: 'n', color: 'w' }, 'c3');
  if (i >= 11) chess.put({ type: 'n', color: 'b' }, 'f6');
  if (i >= 12) chess.put({ type: 'r', color: 'w' }, 'h1');
  if (i >= 13) chess.put({ type: 'b', color: 'w' }, 'f1');
  if (i >= 14) chess.put({ type: 'b', color: 'b' }, 'e7');
  if (i >= 15) chess.put({ type: 'p', color: 'w' }, 'g3');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  PINS.push({
    id: `puz_pin_${String(i + 1).padStart(3, '0')}`,
    fen,
    moves: ["b5d7", "d8d7", "g1e2"],
    rating: 650 + i * 25,
    themes: ["pin", "captures_checks_threats"],
    primaryTheme: "pin",
    difficulty: i < 6 ? "novice" : i < 12 ? "easy" : "medium",
    title: `Absolute Bishop Pin & Capture #${i + 1} 📌`,
    playerColor: "w",
    tacticalGoal: "Exploit the pinned Rook and capture it with Bxd7+.",
    tacticalReward: "win_exchange",
    outcomeAdvantage: "+2 Exchange (Rook for Bishop) ⚖️",
    learningSummary: "1. Bxd7+ captured the pinned Rook on d7, winning the exchange and leaving White with a decisive material lead.",
    keyTakeaway: "Pinned pieces cannot move to escape attack; increase the pressure and capture them."
  });
}

// 16 Rook e-file Pins & Knight captures (Rxe4+ Kd8 Rxe5)
for (let i = 0; i < 16; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'e8');
  chess.put({ type: 'n', color: 'b' }, 'e4');
  chess.put({ type: 'p', color: 'b' }, 'e5');
  chess.put({ type: 'r', color: 'b' }, 'h8');
  chess.put({ type: 'p', color: 'b' }, 'a7');
  chess.put({ type: 'p', color: 'b' }, 'b7');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'g1');
  chess.put({ type: 'r', color: 'w' }, 'e1');
  chess.put({ type: 'p', color: 'w' }, 'a2');
  chess.put({ type: 'p', color: 'w' }, 'b2');
  chess.put({ type: 'p', color: 'w' }, 'c2');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'd3');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'c6');
  if (i >= 3) chess.put({ type: 'p', color: 'b' }, 'd6');
  if (i >= 4) chess.put({ type: 'p', color: 'w' }, 'a3');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'h3');
  if (i >= 6) chess.put({ type: 'b', color: 'w' }, 'd2');
  if (i >= 7) chess.put({ type: 'b', color: 'b' }, 'd7');
  if (i >= 8) chess.put({ type: 'n', color: 'w' }, 'c3');
  if (i >= 9) chess.put({ type: 'n', color: 'b' }, 'f6');
  if (i >= 10) chess.put({ type: 'r', color: 'w' }, 'd1');
  if (i >= 11) chess.put({ type: 'q', color: 'w' }, 'c1');
  if (i >= 12) chess.put({ type: 'q', color: 'b' }, 'c7');
  if (i >= 13) chess.put({ type: 'b', color: 'w' }, 'c4');
  if (i >= 14) chess.put({ type: 'b', color: 'b' }, 'c5');
  if (i >= 15) chess.put({ type: 'p', color: 'w' }, 'g3');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  PINS.push({
    id: `puz_pin_${String(i + 17).padStart(3, '0')}`,
    fen,
    moves: ["e1e4", "e8d8", "e4e5"],
    rating: 1050 + i * 25,
    themes: ["pin", "captures_checks_threats"],
    primaryTheme: "pin",
    difficulty: i < 6 ? "medium" : i < 12 ? "hard" : "expert",
    title: `Rook Pin & Knight Capture #${i + 17} 📌`,
    playerColor: "w",
    tacticalGoal: "Capture the pinned Knight on e4 with Rxe4+.",
    tacticalReward: "win_minor_piece",
    outcomeAdvantage: "+3 Knight ♞",
    learningSummary: "1. Rxe4+ captured the pinned Knight on e4 because it was pinned to the King on e8.",
    keyTakeaway: "Absolute pins against the King make defending pieces completely paralyzed."
  });
}
savePack('pins', 'PIN_DATA', PINS);

// -------------------------------------------------------------------------
// 3. SKEWERS (30 Puzzles)
// -------------------------------------------------------------------------
const SKEWERS = [];
// 15 White 8th Rank Skewers (Rh8+ Ke7 Rxa8)
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'e8');
  chess.put({ type: 'r', color: 'b' }, 'a8');
  chess.put({ type: 'p', color: 'b' }, 'a7');
  chess.put({ type: 'p', color: 'b' }, 'b7');
  chess.put({ type: 'p', color: 'b' }, 'g7');

  chess.put({ type: 'k', color: 'w' }, 'e1');
  chess.put({ type: 'r', color: 'w' }, 'h1');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');

  // Keep rank 8 and h-file completely clear!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'a2');
  if (i >= 2) chess.put({ type: 'p', color: 'w' }, 'b2');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'c2');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'c7');
  if (i >= 5) chess.put({ type: 'p', color: 'b' }, 'd7');
  if (i >= 6) chess.put({ type: 'n', color: 'w' }, 'c3');
  if (i >= 7) chess.put({ type: 'n', color: 'b' }, 'c6');
  if (i >= 8) chess.put({ type: 'b', color: 'w' }, 'd2');
  if (i >= 9) chess.put({ type: 'b', color: 'b' }, 'd6');
  if (i >= 10) chess.put({ type: 'r', color: 'w' }, 'a1');
  if (i >= 11) chess.put({ type: 'b', color: 'w' }, 'e2');
  if (i >= 12) chess.put({ type: 'b', color: 'b' }, 'e6');
  if (i >= 13) chess.put({ type: 'q', color: 'w' }, 'd3');
  if (i >= 14) chess.put({ type: 'q', color: 'b' }, 'd5');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  SKEWERS.push({
    id: `puz_skewer_${String(i + 1).padStart(3, '0')}`,
    fen,
    moves: ["h1h8", "e8e7", "h8a8"],
    rating: 650 + i * 30,
    themes: ["skewer", "captures_checks_threats"],
    primaryTheme: "skewer",
    difficulty: i < 5 ? "novice" : i < 10 ? "easy" : "medium",
    title: `8th Rank Laser Skewer #${i + 1} ⚡`,
    playerColor: "w",
    tacticalGoal: "Deliver Rh8+ skewer to win the corner a8 Rook.",
    tacticalReward: "win_rook",
    outcomeAdvantage: "+5 Rook ♜",
    learningSummary: "1. Rh8+ checked the King on e8. When the King stepped to e7, White captured the a8 Rook behind it.",
    keyTakeaway: "Skewers attack the more valuable piece in front, forcing it to move and exposing the piece behind."
  });
}

// 15 Black 1st Rank Skewers (Rh1+ Ke2 Rxa1)
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'w' }, 'e1');
  chess.put({ type: 'r', color: 'w' }, 'a1');
  chess.put({ type: 'p', color: 'w' }, 'a2');
  chess.put({ type: 'p', color: 'w' }, 'b2');
  chess.put({ type: 'p', color: 'w' }, 'g2');

  chess.put({ type: 'k', color: 'b' }, 'e8');
  chess.put({ type: 'r', color: 'b' }, 'h8');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');

  // Keep rank 1 and h-file clear!
  if (i >= 1) chess.put({ type: 'p', color: 'b' }, 'a7');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'b7');
  if (i >= 3) chess.put({ type: 'p', color: 'b' }, 'c7');
  if (i >= 4) chess.put({ type: 'p', color: 'w' }, 'c2');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'd2');
  if (i >= 6) chess.put({ type: 'n', color: 'b' }, 'c6');
  if (i >= 7) chess.put({ type: 'n', color: 'w' }, 'c3');
  if (i >= 8) chess.put({ type: 'b', color: 'b' }, 'd7');
  if (i >= 9) chess.put({ type: 'b', color: 'w' }, 'd3');
  if (i >= 10) chess.put({ type: 'r', color: 'b' }, 'a8');
  if (i >= 11) chess.put({ type: 'b', color: 'b' }, 'e7');
  if (i >= 12) chess.put({ type: 'b', color: 'w' }, 'e3');
  if (i >= 13) chess.put({ type: 'q', color: 'b' }, 'd6');
  if (i >= 14) chess.put({ type: 'q', color: 'w' }, 'd4');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'b';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  SKEWERS.push({
    id: `puz_skewer_${String(i + 16).padStart(3, '0')}`,
    fen,
    moves: ["h8h1", "e1e2", "h1a1"],
    rating: 1100 + i * 30,
    themes: ["skewer", "captures_checks_threats"],
    primaryTheme: "skewer",
    difficulty: i < 5 ? "medium" : i < 10 ? "hard" : "expert",
    title: `1st Rank Rook Laser #${i + 16} ⚡`,
    playerColor: "b",
    tacticalGoal: "Deliver Rh1+ skewer across the 1st rank to win the a1 Rook.",
    tacticalReward: "win_rook",
    outcomeAdvantage: "+5 Rook ♜",
    learningSummary: "1... Rh1+ checked White's King on e1, forcing Ke2 and allowing 2... Rxa1 winning the corner Rook.",
    keyTakeaway: "Rank skewers exploit uncastled kings aligned with their rooks on open files."
  });
}
savePack('skewers', 'SKEWER_DATA', SKEWERS);

// -------------------------------------------------------------------------
// 4. DISCOVERED CHECKS (30 Puzzles)
// -------------------------------------------------------------------------
const DISCOVERED_CHECKS = [];
// 15 Knight leaps unmasking e1 Rook on e8 King and winning Queen on e7
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'e8');
  chess.put({ type: 'q', color: 'b' }, 'd8');
  chess.put({ type: 'r', color: 'b' }, 'h8');
  chess.put({ type: 'p', color: 'b' }, 'a7');
  chess.put({ type: 'p', color: 'b' }, 'b7');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'g1');
  chess.put({ type: 'r', color: 'w' }, 'e1');
  chess.put({ type: 'n', color: 'w' }, 'e5');
  chess.put({ type: 'p', color: 'w' }, 'a2');
  chess.put({ type: 'p', color: 'w' }, 'b2');
  chess.put({ type: 'p', color: 'w' }, 'c2');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  // Keep e-file and c6 clear!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'd3');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'b6');
  if (i >= 3) chess.put({ type: 'p', color: 'b' }, 'd6');
  if (i >= 4) chess.put({ type: 'p', color: 'w' }, 'a3');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'h3');
  if (i >= 6) chess.put({ type: 'b', color: 'w' }, 'd2');
  if (i >= 7) chess.put({ type: 'b', color: 'b' }, 'd7');
  if (i >= 8) chess.put({ type: 'n', color: 'w' }, 'c3');
  if (i >= 9) chess.put({ type: 'n', color: 'b' }, 'f6');
  if (i >= 10) chess.put({ type: 'r', color: 'w' }, 'd1');
  if (i >= 11) chess.put({ type: 'b', color: 'w' }, 'c4');
  if (i >= 12) chess.put({ type: 'b', color: 'b' }, 'c5');
  if (i >= 13) chess.put({ type: 'p', color: 'w' }, 'b3');
  if (i >= 14) chess.put({ type: 'p', color: 'b' }, 'a6');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  DISCOVERED_CHECKS.push({
    id: `puz_discovered_${String(i + 1).padStart(3, '0')}`,
    fen,
    moves: ["e5c6", "d8e7", "e1e7"],
    rating: 750 + i * 30,
    themes: ["discovered_check", "captures_checks_threats"],
    primaryTheme: "discovered_check",
    difficulty: i < 5 ? "novice" : i < 10 ? "easy" : "medium",
    title: `Discovered Check Queen Snatch #${i + 1} ♛`,
    playerColor: "w",
    tacticalGoal: "Deliver discovered check with Nc6+ and capture Queen on e7.",
    tacticalReward: "win_queen",
    outcomeAdvantage: "+9 Queen ♛",
    learningSummary: "1. Nc6+ unmasked a discovered check from the e1 Rook, forcing 1... Qe7, and White captured 2. Rxe7+ winning the Queen!",
    keyTakeaway: "Discovered checks are lethal because the moving piece can attack any target while the back piece delivers check."
  });
}

// 15 Bishop leaps unmasking d1 Rook on d8 King and capturing d8 Queen
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'e8');
  chess.put({ type: 'q', color: 'b' }, 'd8');
  chess.put({ type: 'r', color: 'b' }, 'h8');
  chess.put({ type: 'b', color: 'b' }, 'f8');
  chess.put({ type: 'p', color: 'b' }, 'a7');
  chess.put({ type: 'p', color: 'b' }, 'b7');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'g1');
  chess.put({ type: 'r', color: 'w' }, 'd1');
  chess.put({ type: 'b', color: 'w' }, 'd3');
  chess.put({ type: 'p', color: 'w' }, 'a2');
  chess.put({ type: 'p', color: 'w' }, 'b2');
  chess.put({ type: 'p', color: 'w' }, 'c2');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  // Keep d-file, b5, and e7 clear!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'e3');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'a6');
  if (i >= 3) chess.put({ type: 'p', color: 'b' }, 'e6');
  if (i >= 4) chess.put({ type: 'p', color: 'w' }, 'a3');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'h3');
  if (i >= 6) chess.put({ type: 'b', color: 'w' }, 'c1');
  if (i >= 7) chess.put({ type: 'b', color: 'b' }, 'c8');
  if (i >= 8) chess.put({ type: 'n', color: 'w' }, 'c3');
  if (i >= 9) chess.put({ type: 'n', color: 'b' }, 'f6');
  if (i >= 10) chess.put({ type: 'r', color: 'w' }, 'f1');
  if (i >= 11) chess.put({ type: 'n', color: 'w' }, 'f3');
  if (i >= 12) chess.put({ type: 'p', color: 'b' }, 'h6');
  if (i >= 13) chess.put({ type: 'p', color: 'w' }, 'b3');
  if (i >= 14) chess.put({ type: 'p', color: 'b' }, 'b6');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  DISCOVERED_CHECKS.push({
    id: `puz_discovered_${String(i + 16).padStart(3, '0')}`,
    fen,
    moves: ["d3b5", "e8e7", "d1d8"],
    rating: 1200 + i * 30,
    themes: ["discovered_check", "captures_checks_threats"],
    primaryTheme: "discovered_check",
    difficulty: i < 5 ? "medium" : i < 10 ? "hard" : "expert",
    title: `Bishop Unmasks Rook on Queen #${i + 16} ⚡`,
    playerColor: "w",
    tacticalGoal: "Deliver Bb5+ unmasking d1 Rook on d8 Queen, then capture on d8.",
    tacticalReward: "win_queen",
    outcomeAdvantage: "+9 Queen ♛",
    learningSummary: "1. Bb5+ unmasked the d1 Rook against Black's Queen on d8, winning the Queen cleanly!",
    keyTakeaway: "Unmasking heavy pieces along open files catches the enemy Queen with nowhere to hide."
  });
}
savePack('discovered_checks', 'DISCOVERED_CHECKS_DATA', DISCOVERED_CHECKS);

// -------------------------------------------------------------------------
// 5. DEFLECTION & DECOY (30 Puzzles)
// -------------------------------------------------------------------------
const DEFLECTION_DECOY = [];
// 15 Queen Deflection Sacrifices (Qe8+ Rxe8 Rxe8#)
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'g8');
  chess.put({ type: 'r', color: 'b' }, 'c8');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'g1');
  chess.put({ type: 'r', color: 'w' }, 'e1');
  chess.put({ type: 'q', color: 'w' }, 'e3');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  // Keep e-file, 8th rank, and e8 defense clean (no pieces covering e8)!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'a2');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'a7');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'b2');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'b7');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'c2');
  if (i >= 6) chess.put({ type: 'p', color: 'b' }, 'b6');
  if (i >= 7) chess.put({ type: 'n', color: 'w' }, 'c3');
  if (i >= 8) chess.put({ type: 'n', color: 'b' }, 'b8');
  if (i >= 9) chess.put({ type: 'b', color: 'w' }, 'd2');
  if (i >= 10) chess.put({ type: 'b', color: 'b' }, 'a6');
  if (i >= 11) chess.put({ type: 'r', color: 'w' }, 'a1');
  if (i >= 12) chess.put({ type: 'p', color: 'w' }, 'h3');
  if (i >= 13) chess.put({ type: 'p', color: 'b' }, 'h6');
  if (i >= 14) chess.put({ type: 'p', color: 'w' }, 'a3');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  DEFLECTION_DECOY.push({
    id: `puz_deflection_${String(i + 1).padStart(3, '0')}`,
    fen,
    moves: ["e3e8", "c8e8", "e1e8"],
    rating: 800 + i * 30,
    themes: ["deflection", "back_rank_mate", "mate_in_2"],
    primaryTheme: "deflection",
    difficulty: i < 5 ? "novice" : i < 10 ? "easy" : "medium",
    title: `Queen Deflection Sacrifice #${i + 1} 👑`,
    playerColor: "w",
    tacticalGoal: "Sacrifice Queen on e8 to deflect defender and deliver checkmate.",
    tacticalReward: "checkmate",
    outcomeAdvantage: "Checkmate 👑",
    learningSummary: "1. Qe8+ sacrificed the Queen to deflect Black's c8 Rook, opening the back rank for 2. Rxe8# checkmate!",
    keyTakeaway: "Deflection removes a key defender from its vital post to deliver the finishing blow."
  });
}

// 15 Deflection Tactics Winning Queen on c7 (Re8+ Rxe8 Qxc7 - +400 cp!)
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'g8');
  chess.put({ type: 'r', color: 'b' }, 'c8');
  chess.put({ type: 'q', color: 'b' }, 'c7');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'g1');
  chess.put({ type: 'r', color: 'w' }, 'e1');
  chess.put({ type: 'q', color: 'w' }, 'c2');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  // Keep e-file and c-file clear!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'a2');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'a7');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'b2');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'b7');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'd3');
  if (i >= 6) chess.put({ type: 'p', color: 'b' }, 'd6');
  if (i >= 7) chess.put({ type: 'b', color: 'w' }, 'd2');
  if (i >= 8) chess.put({ type: 'b', color: 'b' }, 'd7');
  if (i >= 9) chess.put({ type: 'n', color: 'w' }, 'a3');
  if (i >= 10) chess.put({ type: 'n', color: 'b' }, 'a6');
  if (i >= 11) chess.put({ type: 'r', color: 'w' }, 'a1');
  if (i >= 12) chess.put({ type: 'p', color: 'w' }, 'h3');
  if (i >= 13) chess.put({ type: 'p', color: 'b' }, 'h6');
  if (i >= 14) chess.put({ type: 'b', color: 'w' }, 'f4');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  DEFLECTION_DECOY.push({
    id: `puz_deflection_${String(i + 16).padStart(3, '0')}`,
    fen,
    moves: ["e1e8", "c8e8", "c2c7"],
    rating: 1250 + i * 30,
    themes: ["deflection", "win_queen", "captures_checks_threats"],
    primaryTheme: "deflection",
    difficulty: i < 5 ? "medium" : i < 10 ? "hard" : "expert",
    title: `Rook Deflection Wins Queen #${i + 16} ♛`,
    playerColor: "w",
    tacticalGoal: "Deliver Re8+ to deflect the c8 Rook guard and capture the Queen on c7.",
    tacticalReward: "win_queen",
    outcomeAdvantage: "+4 Queen for Rook ♛",
    learningSummary: "1. Re8+ checked the King and deflected the c8 Rook away, leaving Black's Queen on c7 completely undefended for 2. Qxc7!",
    keyTakeaway: "Deflecting a guarding piece away from an overloaded target wins decisive material."
  });
}
savePack('deflection_decoy', 'DEFLECTION_DECOY_DATA', DEFLECTION_DECOY);

// -------------------------------------------------------------------------
// 6. GREEK GIFT (30 Puzzles)
// -------------------------------------------------------------------------
const GREEK_GIFT = [];
// 15 Classic Greek Gift Checkmates (7 plies)
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'g8');
  chess.put({ type: 'r', color: 'b' }, 'f8');
  chess.put({ type: 'q', color: 'b' }, 'd8');
  chess.put({ type: 'b', color: 'b' }, 'c8');
  chess.put({ type: 'n', color: 'b' }, 'd7');
  chess.put({ type: 'p', color: 'b' }, 'a7');
  chess.put({ type: 'p', color: 'b' }, 'b7');
  chess.put({ type: 'p', color: 'b' }, 'c7');
  chess.put({ type: 'p', color: 'b' }, 'e6');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'e1');
  chess.put({ type: 'q', color: 'w' }, 'd1');
  chess.put({ type: 'r', color: 'w' }, 'a1');
  chess.put({ type: 'r', color: 'w' }, 'h1');
  chess.put({ type: 'b', color: 'w' }, 'c1');
  chess.put({ type: 'b', color: 'w' }, 'd3');
  chess.put({ type: 'n', color: 'w' }, 'c3');
  chess.put({ type: 'n', color: 'w' }, 'f3');
  chess.put({ type: 'p', color: 'w' }, 'a2');
  chess.put({ type: 'p', color: 'w' }, 'b2');
  chess.put({ type: 'p', color: 'w' }, 'c2');
  chess.put({ type: 'p', color: 'w' }, 'd4');
  chess.put({ type: 'p', color: 'w' }, 'e5');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  // Keep h-file, g5, h5, h7 open! Keep e2 and g4 completely clear!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'a3');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'a6');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'b3');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'b6');
  if (i >= 5) chess.put({ type: 'b', color: 'w' }, 'b2');
  if (i >= 6) chess.put({ type: 'b', color: 'b' }, 'b7');
  if (i >= 7) chess.put({ type: 'r', color: 'b' }, 'c8');
  if (i >= 8) chess.put({ type: 'r', color: 'w' }, 'c1');
  if (i >= 9) chess.put({ type: 'p', color: 'b' }, 'c5');
  if (i >= 10) chess.put({ type: 'p', color: 'w' }, 'c4');
  if (i >= 11) chess.put({ type: 'q', color: 'b' }, 'c7');
  if (i >= 12) chess.put({ type: 'n', color: 'b' }, 'b6');
  if (i >= 13) chess.put({ type: 'p', color: 'w' }, 'a4');
  if (i >= 14) chess.put({ type: 'p', color: 'b' }, 'a5');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  GREEK_GIFT.push({
    id: `puz_greekgift_${String(i + 1).padStart(3, '0')}`,
    fen,
    moves: ["d3h7", "g8h7", "f3g5", "h7h8", "d1h5", "h8g8", "h5h7"],
    rating: 1200 + i * 30,
    themes: ["greek_gift", "mate_in_4", "captures_checks_threats"],
    primaryTheme: "greek_gift",
    difficulty: i < 5 ? "medium" : i < 10 ? "hard" : "expert",
    title: `Greek Gift Mating Attack #${i + 1} 🎁`,
    playerColor: "w",
    tacticalGoal: "Sacrifice Bishop on h7 and deliver checkmate with Qh7#.",
    tacticalReward: "checkmate",
    outcomeAdvantage: "Checkmate 👑",
    learningSummary: "1. Bxh7+ opened the King, 2. Ng5+ checked, and 3. Qh5+ followed by 4. Qh7# delivered checkmate!",
    keyTakeaway: "The Greek Gift sacrifice (Bxh7+) exploits an absent f6 Knight and undefended h7 square."
  });
}

// 15 Greek Gift Queen Captures (7 plies)
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'g8');
  chess.put({ type: 'r', color: 'b' }, 'f8');
  chess.put({ type: 'q', color: 'b' }, 'd8');
  chess.put({ type: 'b', color: 'b' }, 'c8');
  chess.put({ type: 'n', color: 'b' }, 'd7');
  chess.put({ type: 'p', color: 'b' }, 'a7');
  chess.put({ type: 'p', color: 'b' }, 'b7');
  chess.put({ type: 'p', color: 'b' }, 'c7');
  chess.put({ type: 'p', color: 'b' }, 'e6');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'e1');
  chess.put({ type: 'q', color: 'w' }, 'd1');
  chess.put({ type: 'r', color: 'w' }, 'a1');
  chess.put({ type: 'r', color: 'w' }, 'h1');
  chess.put({ type: 'b', color: 'w' }, 'c1');
  chess.put({ type: 'b', color: 'w' }, 'd3');
  chess.put({ type: 'n', color: 'w' }, 'c3');
  chess.put({ type: 'n', color: 'w' }, 'f3');
  chess.put({ type: 'p', color: 'w' }, 'a2');
  chess.put({ type: 'p', color: 'w' }, 'b2');
  chess.put({ type: 'p', color: 'w' }, 'c2');
  chess.put({ type: 'p', color: 'w' }, 'd4');
  chess.put({ type: 'p', color: 'w' }, 'e5');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  // Keep diagonals and files clear!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'a4');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'a5');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'b4');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'b5');
  if (i >= 5) chess.put({ type: 'b', color: 'b' }, 'a6');
  if (i >= 6) chess.put({ type: 'b', color: 'w' }, 'b2');
  if (i >= 7) chess.put({ type: 'r', color: 'b' }, 'e8');
  if (i >= 8) chess.put({ type: 'r', color: 'w' }, 'f1');
  if (i >= 9) chess.put({ type: 'p', color: 'b' }, 'c6');
  if (i >= 10) chess.put({ type: 'p', color: 'w' }, 'c3');
  if (i >= 11) chess.put({ type: 'n', color: 'b' }, 'b6');
  if (i >= 12) chess.put({ type: 'n', color: 'b' }, 'b8');
  if (i >= 13) chess.put({ type: 'p', color: 'w' }, 'a3');
  if (i >= 14) chess.put({ type: 'p', color: 'b' }, 'h6');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  GREEK_GIFT.push({
    id: `puz_greekgift_${String(i + 16).padStart(3, '0')}`,
    fen,
    moves: ["d3h7", "g8h7", "f3g5", "h7g8", "d1h5", "d8g5", "c1g5"],
    rating: 1400 + i * 30,
    themes: ["greek_gift", "win_queen", "captures_checks_threats"],
    primaryTheme: "greek_gift",
    difficulty: "expert",
    title: `Greek Gift Queen Surrender #${i + 16} ♛`,
    playerColor: "w",
    tacticalGoal: "Force Black to surrender the Queen with Qxg5 to stop mate.",
    tacticalReward: "win_queen",
    outcomeAdvantage: "+9 Queen ♛",
    learningSummary: "The mating threat on h7 forced Black to sacrifice the Queen with 3... Qxg5, leaving White winning easily.",
    keyTakeaway: "When facing a Greek Gift attack, giving up the Queen is often Black's only way to delay checkmate."
  });
}
savePack('greek_gift', 'GREEK_GIFT_DATA', GREEK_GIFT);

// -------------------------------------------------------------------------
// 7. WINDMILL (30 Puzzles)
// -------------------------------------------------------------------------
const WINDMILL = [];
// 15 Torre-Lasker Windmill Rook captures (17 plies!)
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'g8');
  chess.put({ type: 'r', color: 'b' }, 'a8');
  chess.put({ type: 'p', color: 'b' }, 'a7');
  chess.put({ type: 'p', color: 'b' }, 'b7');
  chess.put({ type: 'p', color: 'b' }, 'c7');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'h1');
  chess.put({ type: 'r', color: 'w' }, 'g1');
  chess.put({ type: 'b', color: 'w' }, 'f6');

  // Keep rank 7 and g-file open!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'h2');
  if (i >= 2) chess.put({ type: 'p', color: 'w' }, 'f2');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'a2');
  if (i >= 4) chess.put({ type: 'p', color: 'w' }, 'b2');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'c2');
  if (i >= 6) chess.put({ type: 'p', color: 'w' }, 'd2');
  if (i >= 7) chess.put({ type: 'p', color: 'b' }, 'd5');
  if (i >= 8) chess.put({ type: 'p', color: 'b' }, 'e5');
  if (i >= 9) chess.put({ type: 'b', color: 'b' }, 'c8');
  if (i >= 10) chess.put({ type: 'n', color: 'b' }, 'b8');
  if (i >= 11) chess.put({ type: 'r', color: 'w' }, 'f1');
  if (i >= 12) chess.put({ type: 'n', color: 'w' }, 'e2');
  if (i >= 13) chess.put({ type: 'q', color: 'w' }, 'd1');
  if (i >= 14) chess.put({ type: 'p', color: 'b' }, 'a6');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  WINDMILL.push({
    id: `puz_windmill_${String(i + 1).padStart(3, '0')}`,
    fen,
    moves: ["g1g7", "g8h8", "g7f7", "h8g8", "f7g7", "g8h8", "g7c7", "h8g8", "c7g7", "g8h8", "g7b7", "h8g8", "b7g7", "g8h8", "g7a7", "h8g8", "a7a8"],
    rating: 1400 + i * 30,
    themes: ["windmill", "discovered_check", "captures_checks_threats"],
    primaryTheme: "windmill",
    difficulty: i < 5 ? "medium" : i < 10 ? "hard" : "expert",
    title: `Torre-Lasker Windmill Cycle #${i + 1} 🎡`,
    playerColor: "w",
    tacticalGoal: "Execute continuous discovered checks to capture pawns and the a8 Rook.",
    tacticalReward: "win_rook",
    outcomeAdvantage: "+5 Rook ♜",
    learningSummary: "1. Rxg7+ launched the unstoppable Windmill! The Rook swept across the 7th rank and captured the a8 Rook cleanly.",
    keyTakeaway: "The Windmill combines a discovered check and normal check in an infinite loop of destruction."
  });
}

// 15 Windmill Queen Captures (13 plies!)
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'g8');
  chess.put({ type: 'r', color: 'b' }, 'a8');
  chess.put({ type: 'q', color: 'b' }, 'd8');
  chess.put({ type: 'p', color: 'b' }, 'c7');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'h1');
  chess.put({ type: 'r', color: 'w' }, 'g1');
  chess.put({ type: 'b', color: 'w' }, 'f6');

  // Keep rank 7, d-file, and g-file clear!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'h3');
  if (i >= 2) chess.put({ type: 'p', color: 'w' }, 'f3');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'a3');
  if (i >= 4) chess.put({ type: 'p', color: 'w' }, 'b3');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'c3');
  if (i >= 6) chess.put({ type: 'p', color: 'w' }, 'd3');
  if (i >= 7) chess.put({ type: 'p', color: 'b' }, 'd5');
  if (i >= 8) chess.put({ type: 'p', color: 'b' }, 'e5');
  if (i >= 9) chess.put({ type: 'b', color: 'b' }, 'b5');
  if (i >= 10) chess.put({ type: 'n', color: 'b' }, 'b8');
  if (i >= 11) chess.put({ type: 'r', color: 'w' }, 'e1');
  if (i >= 12) chess.put({ type: 'n', color: 'w' }, 'c3');
  if (i >= 13) chess.put({ type: 'p', color: 'w' }, 'a4');
  if (i >= 14) chess.put({ type: 'p', color: 'b' }, 'a6');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  WINDMILL.push({
    id: `puz_windmill_${String(i + 16).padStart(3, '0')}`,
    fen,
    moves: ["g1g7", "g8h8", "g7f7", "h8g8", "f7g7", "g8h8", "g7c7", "h8g8", "c7g7", "g8h8", "g7d7", "h8g8", "d7d8"],
    rating: 1800 + i * 20,
    themes: ["windmill", "win_queen", "captures_checks_threats"],
    primaryTheme: "windmill",
    difficulty: "expert",
    title: `Windmill Queen Snatch #${i + 16} ♛`,
    playerColor: "w",
    tacticalGoal: "Use discovered checks to win Black's Queen on d8.",
    tacticalReward: "win_queen",
    outcomeAdvantage: "+9 Queen ♛",
    learningSummary: "White harvested central pawns before snapping up the undefended Queen on d8!",
    keyTakeaway: "Discovered checks give you complete control of the board to capture whatever piece you choose."
  });
}
savePack('windmill', 'WINDMILL_DATA', WINDMILL);

// -------------------------------------------------------------------------
// 8. BACK RANK (32 Puzzles)
// -------------------------------------------------------------------------
const BACK_RANK = [];
// 16 Direct 1-ply Back Rank Mates (Rxd8#)
for (let i = 0; i < 16; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'g8');
  chess.put({ type: 'r', color: 'b' }, 'd8');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'g1');
  chess.put({ type: 'r', color: 'w' }, 'd1');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  // Keep d-file clear!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'a2');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'a7');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'b2');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'b7');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'c2');
  if (i >= 6) chess.put({ type: 'p', color: 'b' }, 'c7');
  if (i >= 7) chess.put({ type: 'b', color: 'w' }, 'c1');
  if (i >= 8) chess.put({ type: 'b', color: 'b' }, 'a6');
  if (i >= 9) chess.put({ type: 'n', color: 'w' }, 'c3');
  if (i >= 10) chess.put({ type: 'n', color: 'b' }, 'a5');
  if (i >= 11) chess.put({ type: 'r', color: 'w' }, 'a1');
  if (i >= 12) chess.put({ type: 'p', color: 'b' }, 'h6');
  if (i >= 13) chess.put({ type: 'q', color: 'w' }, 'b1');
  if (i >= 14) chess.put({ type: 'p', color: 'w' }, 'a3');
  if (i >= 15) chess.put({ type: 'p', color: 'w' }, 'a4');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  BACK_RANK.push({
    id: `puz_backrank_${String(i + 1).padStart(3, '0')}`,
    fen,
    moves: ["d1d8"],
    rating: 650 + i * 25,
    themes: ["back_rank_mate", "mate_in_1"],
    primaryTheme: "back_rank_mate",
    difficulty: i < 6 ? "novice" : i < 12 ? "easy" : "medium",
    title: `Direct Back-Rank Mate on d8 #${i + 1} ⚡`,
    playerColor: "w",
    tacticalGoal: "Deliver instant checkmate on the back rank.",
    tacticalReward: "checkmate",
    outcomeAdvantage: "Checkmate 👑",
    learningSummary: "1. Rxd8# captured the defender and checkmated the King behind its trapped pawns.",
    keyTakeaway: "Kings trapped behind their own pawns are vulnerable to sudden back rank checkmates."
  });
}

// 16 Queen Sacrifice Back Rank Mates (Qe8+ Rxe8 Rxe8# - 3 plies)
for (let i = 0; i < 16; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'g8');
  chess.put({ type: 'r', color: 'b' }, 'c8');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'g1');
  chess.put({ type: 'r', color: 'w' }, 'e1');
  chess.put({ type: 'q', color: 'w' }, 'e3');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  // Keep e-file and 8th rank clear!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'a2');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'a7');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'b2');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'b7');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'c2');
  if (i >= 6) chess.put({ type: 'p', color: 'b' }, 'c7');
  if (i >= 7) chess.put({ type: 'p', color: 'w' }, 'd3');
  if (i >= 8) chess.put({ type: 'p', color: 'b' }, 'd5');
  if (i >= 9) chess.put({ type: 'b', color: 'w' }, 'c1');
  if (i >= 10) chess.put({ type: 'b', color: 'b' }, 'a6');
  if (i >= 11) chess.put({ type: 'n', color: 'w' }, 'c3');
  if (i >= 12) chess.put({ type: 'n', color: 'b' }, 'a5');
  if (i >= 13) chess.put({ type: 'r', color: 'w' }, 'a1');
  if (i >= 14) chess.put({ type: 'p', color: 'b' }, 'h6');
  if (i >= 15) chess.put({ type: 'p', color: 'w' }, 'h3');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  BACK_RANK.push({
    id: `puz_backrank_${String(i + 17).padStart(3, '0')}`,
    fen,
    moves: ["e3e8", "c8e8", "e1e8"],
    rating: 1100 + i * 25,
    themes: ["back_rank_mate", "mate_in_2", "deflection"],
    primaryTheme: "back_rank_mate",
    difficulty: i < 6 ? "medium" : i < 12 ? "hard" : "expert",
    title: `Queen Sacrifice Back-Rank Mate #${i + 17} 👑`,
    playerColor: "w",
    tacticalGoal: "Sacrifice Queen to deflect back-rank guard and checkmate with Rook.",
    tacticalReward: "checkmate",
    outcomeAdvantage: "Checkmate 👑",
    learningSummary: "1. Qe8+ sacrificed the Queen to force Black's Rook off guard duty, enabling 2. Rxe8# mate!",
    keyTakeaway: "Sacrificing major pieces to remove back rank defenders is a recurring master tactic."
  });
}
savePack('back_rank', 'BACK_RANK_DATA', BACK_RANK);

// -------------------------------------------------------------------------
// 9. ANASTASIA & HOOK MATE (30 Puzzles)
// -------------------------------------------------------------------------
const ANASTASIA_HOOK = [];
// 15 Anastasia's Mates (Qxh7+ Kxh7 Rh3# - 3 plies)
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'h8');
  chess.put({ type: 'r', color: 'b' }, 'f8');
  chess.put({ type: 'n', color: 'w' }, 'e7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');

  chess.put({ type: 'k', color: 'w' }, 'g1');
  chess.put({ type: 'q', color: 'w' }, 'h5');
  chess.put({ type: 'r', color: 'w' }, 'e3');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  // Keep h-file, rank 3, and h7 open!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'a2');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'a7');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'b2');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'b7');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'c2');
  if (i >= 6) chess.put({ type: 'p', color: 'b' }, 'c7');
  if (i >= 7) chess.put({ type: 'p', color: 'w' }, 'd3');
  if (i >= 8) chess.put({ type: 'p', color: 'b' }, 'd7');
  if (i >= 9) chess.put({ type: 'b', color: 'w' }, 'c1');
  if (i >= 10) chess.put({ type: 'b', color: 'b' }, 'a6');
  if (i >= 11) chess.put({ type: 'n', color: 'w' }, 'c3');
  if (i >= 12) chess.put({ type: 'n', color: 'b' }, 'a5');
  if (i >= 13) chess.put({ type: 'r', color: 'w' }, 'a1');
  if (i >= 14) chess.put({ type: 'p', color: 'b' }, 'b5');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  ANASTASIA_HOOK.push({
    id: `puz_anastasia_${String(i + 1).padStart(3, '0')}`,
    fen,
    moves: ["h5h7", "h8h7", "e3h3"],
    rating: 1100 + i * 30,
    themes: ["anastasia_hook", "mate_in_2", "captures_checks_threats"],
    primaryTheme: "anastasia_hook",
    difficulty: i < 5 ? "easy" : i < 10 ? "medium" : "hard",
    title: `Anastasia's Mate Masterpiece #${i + 1} 🗡️`,
    playerColor: "w",
    tacticalGoal: "Sacrifice Queen on h7 and deliver Rh3# checkmate.",
    tacticalReward: "checkmate",
    outcomeAdvantage: "Checkmate 👑",
    learningSummary: "1. Qxh7+ forced the King onto h7, and 2. Rh3# delivered mate because the e7 Knight covered g8 and g6.",
    keyTakeaway: "Anastasia's Mate uses a Knight to seal escape squares on the g-file while a Rook mates on the h-file."
  });
}

// 15 Hook Mates (Ra8# supported by f6 Knight and g5 Pawn)
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'h8');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'w' }, 'g5');
  chess.put({ type: 'n', color: 'w' }, 'f6');
  chess.put({ type: 'r', color: 'w' }, 'a7');
  chess.put({ type: 'k', color: 'w' }, 'g1');

  // Keep a8 and 8th rank open!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'h2');
  if (i >= 2) chess.put({ type: 'p', color: 'w' }, 'f2');
  if (i >= 3) chess.put({ type: 'p', color: 'b' }, 'b7');
  if (i >= 4) chess.put({ type: 'p', color: 'w' }, 'a2');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'b2');
  if (i >= 6) chess.put({ type: 'p', color: 'w' }, 'c2');
  if (i >= 7) chess.put({ type: 'p', color: 'b' }, 'c7');
  if (i >= 8) chess.put({ type: 'p', color: 'w' }, 'd3');
  if (i >= 9) chess.put({ type: 'p', color: 'b' }, 'd5');
  if (i >= 10) chess.put({ type: 'b', color: 'w' }, 'c1');
  if (i >= 11) chess.put({ type: 'b', color: 'b' }, 'a6');
  if (i >= 12) chess.put({ type: 'r', color: 'w' }, 'e1');
  if (i >= 13) chess.put({ type: 'p', color: 'b' }, 'a5');
  if (i >= 14) chess.put({ type: 'p', color: 'b' }, 'h6');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  ANASTASIA_HOOK.push({
    id: `puz_anastasia_${String(i + 16).padStart(3, '0')}`,
    fen,
    moves: ["a7a8"],
    rating: 1550 + i * 25,
    themes: ["anastasia_hook", "mate_in_1"],
    primaryTheme: "anastasia_hook",
    difficulty: i < 5 ? "medium" : i < 10 ? "hard" : "expert",
    title: `Hook Mate Precision #${i + 16} 🪝`,
    playerColor: "w",
    tacticalGoal: "Deliver Ra8# checkmate.",
    tacticalReward: "checkmate",
    outcomeAdvantage: "Checkmate 👑",
    learningSummary: "1. Ra8# locked the King into an inescapable net supported by the f6 Knight and g5 Pawn.",
    keyTakeaway: "Hook Mate uses Rook, Knight, and Pawn in a tight interlocking lock."
  });
}
savePack('anastasia_hook', 'ANASTASIA_HOOK_DATA', ANASTASIA_HOOK);

// -------------------------------------------------------------------------
// 10. SMOTHERED MATE (30 Puzzles)
// -------------------------------------------------------------------------
const SMOTHERED = [];
// 15 Philidor Smothered Mates (9 plies)
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'g8');
  chess.put({ type: 'r', color: 'b' }, 'f8');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');
  chess.put({ type: 'p', color: 'b' }, 'd7');

  chess.put({ type: 'k', color: 'w' }, 'g1');
  chess.put({ type: 'q', color: 'w' }, 'c4');
  chess.put({ type: 'n', color: 'w' }, 'g5');
  chess.put({ type: 'p', color: 'w' }, 'f2');
  chess.put({ type: 'p', color: 'w' }, 'g2');
  chess.put({ type: 'p', color: 'w' }, 'h2');

  // Keep e6, f7, h6, g8 clear!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'a2');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'a7');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'b2');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'b7');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'c2');
  if (i >= 6) chess.put({ type: 'p', color: 'b' }, 'c7');
  if (i >= 7) chess.put({ type: 'p', color: 'w' }, 'd3');
  if (i >= 8) chess.put({ type: 'p', color: 'b' }, 'e7');
  if (i >= 9) chess.put({ type: 'b', color: 'w' }, 'c1');
  if (i >= 10) chess.put({ type: 'b', color: 'b' }, 'c8');
  if (i >= 11) chess.put({ type: 'n', color: 'w' }, 'c3');
  if (i >= 12) chess.put({ type: 'n', color: 'b' }, 'a6');
  if (i >= 13) chess.put({ type: 'r', color: 'w' }, 'a1');
  if (i >= 14) chess.put({ type: 'r', color: 'b' }, 'a8');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  SMOTHERED.push({
    id: `puz_smothered_${String(i + 1).padStart(3, '0')}`,
    fen,
    moves: ["c4e6", "g8h8", "g5f7", "h8g8", "f7h6", "g8h8", "e6g8", "f8g8", "h6f7"],
    rating: 1300 + i * 30,
    themes: ["smothered", "mate_in_5", "captures_checks_threats"],
    primaryTheme: "smothered",
    difficulty: i < 5 ? "medium" : i < 10 ? "hard" : "expert",
    title: `Philidor Smothered Mate Sequence #${i + 1} 🐎`,
    playerColor: "w",
    tacticalGoal: "Execute Philidor's classic smothered mate combination.",
    tacticalReward: "checkmate",
    outcomeAdvantage: "Checkmate 👑",
    learningSummary: "1. Qe6+ and 2. Nf7+ set up the double check 3. Nh6+! After 4. Qg8+! Rxg8, 5. Nf7# delivered smothered mate!",
    keyTakeaway: "The smothered mate traps the King behind its own defending pieces with an inescapable Knight check."
  });
}

// 15 Instant Smothered Mates (1 ply: Nf7#)
for (let i = 0; i < 15; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'h8');
  chess.put({ type: 'r', color: 'b' }, 'g8');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');
  chess.put({ type: 'n', color: 'w' }, 'h6');
  chess.put({ type: 'k', color: 'w' }, 'g1');

  // Keep f7 clear!
  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'h2');
  if (i >= 2) chess.put({ type: 'p', color: 'w' }, 'g2');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'f2');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'a7');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'a2');
  if (i >= 6) chess.put({ type: 'p', color: 'b' }, 'b7');
  if (i >= 7) chess.put({ type: 'p', color: 'w' }, 'b2');
  if (i >= 8) chess.put({ type: 'p', color: 'b' }, 'c7');
  if (i >= 9) chess.put({ type: 'p', color: 'w' }, 'c2');
  if (i >= 10) chess.put({ type: 'p', color: 'b' }, 'd6');
  if (i >= 11) chess.put({ type: 'p', color: 'w' }, 'd3');
  if (i >= 12) chess.put({ type: 'b', color: 'b' }, 'c8');
  if (i >= 13) chess.put({ type: 'b', color: 'w' }, 'c1');
  if (i >= 14) chess.put({ type: 'r', color: 'b' }, 'a8');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  SMOTHERED.push({
    id: `puz_smothered_${String(i + 16).padStart(3, '0')}`,
    fen,
    moves: ["h6f7"],
    rating: 800 + i * 35,
    themes: ["smothered", "mate_in_1"],
    primaryTheme: "smothered",
    difficulty: i < 5 ? "novice" : i < 10 ? "easy" : "medium",
    title: `Instant Smothered Mate #${i + 16} 🐎`,
    playerColor: "w",
    tacticalGoal: "Deliver instant Nf7# checkmate.",
    tacticalReward: "checkmate",
    outcomeAdvantage: "Checkmate 👑",
    learningSummary: "1. Nf7# delivered instantaneous checkmate against the cornered King.",
    keyTakeaway: "A cornered King surrounded by its own Rook and pawns has zero escape squares against a Knight check."
  });
}
savePack('smothered', 'SMOTHERED_DATA', SMOTHERED);

// -------------------------------------------------------------------------
// 11. ENDGAME CONVERSION (32 Puzzles)
// -------------------------------------------------------------------------
const ENDGAME_CONVERSION = [];
// 16 Pawn Promotion Capture Mates (e7xd8=Q#)
for (let i = 0; i < 16; i++) {
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, 'g8');
  chess.put({ type: 'r', color: 'b' }, 'd8');
  chess.put({ type: 'p', color: 'w' }, 'e7');
  chess.put({ type: 'p', color: 'b' }, 'f7');
  chess.put({ type: 'p', color: 'b' }, 'g7');
  chess.put({ type: 'p', color: 'b' }, 'h7');
  chess.put({ type: 'k', color: 'w' }, 'e1');

  if (i >= 1) chess.put({ type: 'p', color: 'w' }, 'a2');
  if (i >= 2) chess.put({ type: 'p', color: 'b' }, 'a7');
  if (i >= 3) chess.put({ type: 'p', color: 'w' }, 'b2');
  if (i >= 4) chess.put({ type: 'p', color: 'b' }, 'b7');
  if (i >= 5) chess.put({ type: 'p', color: 'w' }, 'c2');
  if (i >= 6) chess.put({ type: 'p', color: 'b' }, 'c7');
  if (i >= 7) chess.put({ type: 'p', color: 'w' }, 'f2');
  if (i >= 8) chess.put({ type: 'p', color: 'w' }, 'g2');
  if (i >= 9) chess.put({ type: 'p', color: 'w' }, 'h2');
  if (i >= 10) chess.put({ type: 'p', color: 'w' }, 'a3');
  if (i >= 11) chess.put({ type: 'p', color: 'b' }, 'a6');
  if (i >= 12) chess.put({ type: 'p', color: 'w' }, 'h3');
  if (i >= 13) chess.put({ type: 'p', color: 'b' }, 'h6');
  if (i >= 14) chess.put({ type: 'b', color: 'w' }, 'c1');
  if (i >= 15) chess.put({ type: 'b', color: 'b' }, 'c8');

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  ENDGAME_CONVERSION.push({
    id: `puz_endgame_${String(i + 1).padStart(3, '0')}`,
    fen,
    moves: ["e7d8q"],
    rating: 600 + i * 25,
    themes: ["endgame_conversion", "promotion", "mate_in_1"],
    primaryTheme: "endgame_conversion",
    difficulty: i < 6 ? "novice" : i < 12 ? "easy" : "medium",
    title: `Pawn Promotion Capture Mate #${i + 1} 👑`,
    playerColor: "w",
    tacticalGoal: "Promote pawn on d8 capturing Rook and delivering checkmate.",
    tacticalReward: "checkmate",
    outcomeAdvantage: "Checkmate 👑",
    learningSummary: "1. exd8=Q# captured the defending Rook and promoted to a Queen with checkmate!",
    keyTakeaway: "Advanced pawns on the 7th rank can capture enemy pieces on the back rank and promote with decisive force."
  });
}

// 16 King & Queen Kiss of Death Checkmates (1 ply)
const kqSquareVariations = [
  { q: "g7", k: "f3", bk: "h1", moves: ["g7g2"] },
  { q: "g6", k: "f3", bk: "h1", moves: ["g6g2"] },
  { q: "g5", k: "f3", bk: "h1", moves: ["g5g2"] },
  { q: "g4", k: "f3", bk: "h1", moves: ["g4g2"] },
  { q: "f7", k: "e3", bk: "f1", moves: ["f7f2"] },
  { q: "f6", k: "e3", bk: "f1", moves: ["f6f2"] },
  { q: "f5", k: "e3", bk: "f1", moves: ["f5f2"] },
  { q: "f4", k: "e3", bk: "f1", moves: ["f4f2"] },
  { q: "e7", k: "d3", bk: "e1", moves: ["e7e2"] },
  { q: "e6", k: "d3", bk: "e1", moves: ["e6e2"] },
  { q: "e5", k: "d3", bk: "e1", moves: ["e5e2"] },
  { q: "e4", k: "d3", bk: "e1", moves: ["e4e2"] },
  { q: "d7", k: "c3", bk: "d1", moves: ["d7d2"] },
  { q: "d6", k: "c3", bk: "d1", moves: ["d6d2"] },
  { q: "d5", k: "c3", bk: "d1", moves: ["d5d2"] },
  { q: "d4", k: "c3", bk: "d1", moves: ["d4d2"] },
];

kqSquareVariations.forEach((v, idx) => {
  const i = idx + 16;
  const chess = new Chess();
  chess.clear();
  chess.put({ type: 'k', color: 'b' }, v.bk);
  chess.put({ type: 'k', color: 'w' }, v.k);
  chess.put({ type: 'q', color: 'w' }, v.q);

  const fenParts = chess.fen().split(' ');
  fenParts[1] = 'w';
  fenParts[2] = '-';
  fenParts[3] = '-';
  const fen = fenParts.join(' ');

  ENDGAME_CONVERSION.push({
    id: `puz_endgame_${String(i + 1).padStart(3, '0')}`,
    fen,
    moves: v.moves,
    rating: 1100 + idx * 30,
    themes: ["endgame_conversion", "mate_in_1"],
    primaryTheme: "endgame_conversion",
    difficulty: idx < 5 ? "medium" : idx < 10 ? "hard" : "expert",
    title: `King & Queen Endgame Mate #${i + 1} 👑`,
    playerColor: "w",
    tacticalGoal: "Deliver checkmate with the Queen supported by the King.",
    tacticalReward: "checkmate",
    outcomeAdvantage: "Checkmate 👑",
    learningSummary: "White brought the Queen adjacent to Black's King with direct King support for checkmate.",
    keyTakeaway: "In King & Queen endgames, place the Queen on the square directly in front of the enemy King."
  });
});
savePack('endgame_conversion', 'ENDGAME_CONVERSION_DATA', ENDGAME_CONVERSION);

console.log('🎉 ALL 11 PACKS GENERATED, VALIDATED, AND PERSISTED WITH 100% SUCCESS!');
