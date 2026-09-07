import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..');
const PACKS_DIR = path.resolve(__dirname, 'packs');

console.log('♟️ Generating 11 High-Pedagogy Curated Packs...');

function getMat(c) {
  let w = 0, b = 0;
  for (const row of c.board()) {
    for (const piece of row) {
      if (!piece || piece.type === 'k') continue;
      const val = { p: 100, n: 320, b: 330, r: 500, q: 900 }[piece.type] || 0;
      if (piece.color === 'w') w += val; else b += val;
    }
  }
  return { w, b };
}

export function buildAndValidatePuzzle(p) {
  const chess = new Chess(p.fen);
  if (chess.turn() !== p.playerColor) {
    throw new Error(`[${p.id}] Turn mismatch: def=${p.playerColor}, fen=${chess.turn()}`);
  }

  if (p.moves.length % 2 !== 1) {
    throw new Error(`[${p.id}] Odd-ply invariant failed: moves.length=${p.moves.length}`);
  }

  const initialM = getMat(chess);
  const stepExplanations = [];

  for (let i = 0; i < p.moves.length; i++) {
    const moveUci = p.moves[i];
    const from = moveUci.slice(0, 2);
    const to = moveUci.slice(2, 4);
    const promo = moveUci.slice(4) || undefined;
    const actor = chess.turn();

    const res = chess.move({ from, to, promotion: promo });
    if (!res) {
      throw new Error(`[${p.id}] Illegal move ${moveUci} at ply ${i} from FEN ${chess.fen()}`);
    }

    const customExp = p.stepExplanations?.[i]?.explanation;
    let exp = customExp;
    if (!exp) {
      if (res.san.includes('#')) {
        exp = `${actor === 'w' ? 'White' : 'Black'} delivers checkmate with ${res.san}! 👑`;
      } else if (res.captured) {
        exp = `${actor === 'w' ? 'White' : 'Black'} captures on ${to} with ${res.san}!`;
      } else if (res.san.includes('+')) {
        exp = `${actor === 'w' ? 'White' : 'Black'} gives check with ${res.san}!`;
      } else {
        exp = `${actor === 'w' ? 'White' : 'Black'} plays ${res.san}.`;
      }
    }

    stepExplanations.push({
      plyIndex: i,
      moveSan: res.san,
      moveUci,
      actor,
      explanation: exp,
    });
  }

  const isCheckmate = chess.isCheckmate();
  if (p.tacticalReward === 'checkmate' && !isCheckmate) {
    throw new Error(`[${p.id}] Expected checkmate, but final board is not mate: ${chess.fen()}`);
  }

  const finalM = getMat(chess);
  const netInit = p.playerColor === 'w' ? (initialM.w - initialM.b) : (initialM.b - initialM.w);
  const netFin = p.playerColor === 'w' ? (finalM.w - finalM.b) : (finalM.b - finalM.w);
  const delta = netFin - netInit;

  if (p.tacticalReward !== 'checkmate' && delta <= 0 && !isCheckmate) {
    throw new Error(`[${p.id}] Non-checkmate puzzle ended with non-positive material delta (${delta} cp)`);
  }

  return {
    id: p.id,
    fen: p.fen,
    moves: p.moves,
    rating: p.rating,
    ratingDeviation: p.ratingDeviation || 85,
    themes: p.themes,
    primaryTheme: p.primaryTheme,
    difficulty: p.difficulty,
    title: p.title,
    subtitle: p.subtitle || p.tacticalGoal,
    playerColor: p.playerColor,
    solutionPlies: p.moves.length,
    tacticalGoal: p.tacticalGoal,
    tacticalReward: p.tacticalReward,
    outcomeAdvantage: p.outcomeAdvantage,
    learningSummary: p.learningSummary,
    keyTakeaway: p.keyTakeaway,
    stepExplanations,
    targetSquares: p.targetSquares || [],
    keySquares: p.keySquares || [],
  };
}

export function savePackData(packName, varName, rawPuzzles) {
  const verified = rawPuzzles.map(buildAndValidatePuzzle);
  const fens = new Set(verified.map(p => p.fen));
  const uniqueRatio = fens.size / verified.length;

  if (uniqueRatio < 0.80) {
    throw new Error(`[${packName}] Unique FEN ratio ${(uniqueRatio * 100).toFixed(1)}% < 80% (${fens.size}/${verified.length})`);
  }

  fs.writeFileSync(path.join(DATA_DIR, `${packName}.json`), JSON.stringify(verified, null, 2) + '\n', 'utf-8');
  fs.writeFileSync(path.join(PACKS_DIR, `${packName}_pack.mjs`), `export const ${varName} = ${JSON.stringify(verified, null, 2)};\n`, 'utf-8');
  console.log(`✅ Pack ${packName} (${verified.length} puzzles, ${(uniqueRatio * 100).toFixed(1)}% unique FENs) written!`);
  return verified;
}
