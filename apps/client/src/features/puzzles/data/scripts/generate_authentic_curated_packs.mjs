import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..');
const PACKS_DIR = path.resolve(__dirname, 'packs');

console.log('🧪 Compiling and verifying all 11 authentic puzzle packs...');

function validateAndEnrich(p) {
  if (!p.id || !p.fen || !p.moves || p.moves.length === 0) {
    throw new Error(`[${p?.id}] Missing required fields: id, fen, or moves`);
  }

  // Enforce Odd-Ply Invariant
  if (p.moves.length % 2 !== 1) {
    throw new Error(`[${p.id}] Odd-Ply Invariant violated! moves.length=${p.moves.length} (must be odd). Moves: ${p.moves.join(' ')}`);
  }

  const chess = new Chess(p.fen);
  if (chess.turn() !== p.playerColor) {
    throw new Error(`[${p.id}] playerColor mismatch: def=${p.playerColor}, FEN=${chess.turn()}`);
  }

  const stepExplanations = [];
  let moveIdx = 0;

  for (const moveUci of p.moves) {
    const cleanUci = moveUci.replace(/[+#]/g, '');
    const from = cleanUci.slice(0, 2);
    const to = cleanUci.slice(2, 4);
    const promo = cleanUci.slice(4) || undefined;
    const actor = chess.turn();

    let moveRes;
    try {
      moveRes = chess.move({ from, to, promotion: promo });
    } catch (err) {
      throw new Error(`[${p.id}] Exception playing move ${moveUci} (from: ${from}, to: ${to}) at ply ${moveIdx} in position ${chess.fen()}: ${err.message}`);
    }

    if (!moveRes) {
      throw new Error(`[${p.id}] Illegal move ${moveUci} at ply ${moveIdx} in position ${chess.fen()}`);
    }

    const customExp = p.stepExplanations && p.stepExplanations[moveIdx] && p.stepExplanations[moveIdx].explanation;
    let explanation = customExp;
    if (!explanation) {
      if (moveRes.san.includes('#')) {
        explanation = `${actor === 'w' ? 'White' : 'Black'} delivers checkmate with ${moveRes.san}! 👑`;
      } else if (moveRes.captured) {
        explanation = `${actor === 'w' ? 'White' : 'Black'} plays ${moveRes.san}, capturing on ${to}!`;
      } else if (moveRes.san.includes('+')) {
        explanation = `${actor === 'w' ? 'White' : 'Black'} checks the King with ${moveRes.san}!`;
      } else {
        explanation = `${actor === 'w' ? 'White' : 'Black'} plays ${moveRes.san}.`;
      }
    }

    stepExplanations.push({
      plyIndex: moveIdx,
      moveSan: moveRes.san,
      moveUci,
      actor,
      explanation,
    });
    moveIdx++;
  }

  const isCheckmate = chess.isCheckmate();
  if (p.tacticalReward === 'checkmate' && !isCheckmate) {
    throw new Error(`[${p.id}] Expected checkmate at end, but final position is NOT checkmate: ${chess.fen()}`);
  }

  // Calculate material delta
  const initialChess = new Chess(p.fen);
  const getMat = (c) => {
    let w = 0, b = 0;
    for (const row of c.board()) {
      for (const piece of row) {
        if (!piece || piece.type === 'k') continue;
        const val = { p: 100, n: 320, b: 330, r: 500, q: 900 }[piece.type] || 0;
        if (piece.color === 'w') w += val; else b += val;
      }
    }
    return { w, b };
  };
  const initM = getMat(initialChess);
  const finM = getMat(chess);
  const netInit = p.playerColor === 'w' ? (initM.w - initM.b) : (initM.b - initM.w);
  const netFin = p.playerColor === 'w' ? (finM.w - finM.b) : (finM.b - finM.w);
  const deltaCp = netFin - netInit;

  if (p.tacticalReward !== 'checkmate' && deltaCp <= 0 && !isCheckmate) {
    throw new Error(`[${p.id}] Non-checkmate puzzle ended with non-positive material delta: ${deltaCp} cp (expected deltaCp > 0)`);
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

function savePack(filename, packVarName, puzzles) {
  const enriched = puzzles.map(validateAndEnrich);
  const fens = new Set(enriched.map(p => p.fen));
  const uniqueRatio = fens.size / enriched.length;
  if (uniqueRatio < 0.80) {
    throw new Error(`[${filename}] Insufficient unique FENs: ${fens.size}/${enriched.length} (${(uniqueRatio * 100).toFixed(1)}% < 80%)`);
  }

  // Save JSON
  const jsonPath = path.join(DATA_DIR, filename);
  fs.writeFileSync(jsonPath, JSON.stringify(enriched, null, 2) + '\n', 'utf-8');

  // Save pack mjs
  const packMjsPath = path.join(PACKS_DIR, filename.replace('.json', '_pack.mjs'));
  fs.writeFileSync(packMjsPath, `export const ${packVarName} = ${JSON.stringify(enriched, null, 2)};\n`, 'utf-8');

  console.log(`✅ [${filename}] Verified ${enriched.length} puzzles with ${(uniqueRatio * 100).toFixed(1)}% unique FENs (All odd-ply compliant!)`);
  return enriched;
}

export { validateAndEnrich, savePack };
