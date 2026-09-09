import * as fs from 'fs';
import * as path from 'path';

let Chess;
try {
  const chessModule = await import('chess.js');
  Chess = chessModule.Chess || chessModule.default?.Chess || chessModule.default;
} catch {
  const chessModule = await import('../../apps/server/node_modules/chess.js/dist/esm/chess.js');
  Chess = chessModule.Chess || chessModule.default?.Chess || chessModule.default;
}


const SQUARE_REGEX = /^[a-h][1-8]$/;

const VALID_TACTICAL_REWARDS = new Set([
  'checkmate',
  'win_queen',
  'win_rook',
  'win_minor_piece',
  'win_exchange',
  'win_pawn',
  'pawn_promotion',
  'perpetual_defense',
  'escape_danger',
]);

const VALID_DIFFICULTIES = new Set(['novice', 'easy', 'medium', 'hard', 'expert']);

export function validateAndEnrich(p) {
  if (!p.id || typeof p.id !== 'string') {
    throw new Error(`[${p?.id}] Invalid or missing 'id'`);
  }
  if (!p.fen || typeof p.fen !== 'string') {
    throw new Error(`[${p.id}] Invalid or missing 'fen'`);
  }
  if (!Array.isArray(p.moves) || p.moves.length === 0) {
    throw new Error(`[${p.id}] 'moves' must be a non-empty array`);
  }
  if (p.moves.length % 2 !== 1) {
    throw new Error(
      `[${p.id}] Odd-Ply Invariant violated: moves length is ${p.moves.length}. Puzzles must end on the player's decisive move!`
    );
  }

  const chess = new Chess(p.fen);
  if (chess.turn() !== p.playerColor) {
    throw new Error(`[${p.id}] playerColor mismatch: def=${p.playerColor}, FEN=${chess.turn()}`);
  }

  if (!p.targetSquares || !Array.isArray(p.targetSquares) || p.targetSquares.length === 0) {
    throw new Error(`[${p.id}] targetSquares must be a non-empty array of board squares`);
  }
  for (const sq of p.targetSquares) {
    if (!SQUARE_REGEX.test(sq)) {
      throw new Error(`[${p.id}] Invalid square in targetSquares: "${sq}"`);
    }
  }

  if (!p.keySquares || !Array.isArray(p.keySquares) || p.keySquares.length === 0) {
    throw new Error(`[${p.id}] keySquares must be a non-empty array of board squares`);
  }
  for (const sq of p.keySquares) {
    if (!SQUARE_REGEX.test(sq)) {
      throw new Error(`[${p.id}] Invalid square in keySquares: "${sq}"`);
    }
  }

  if (!VALID_DIFFICULTIES.has(p.difficulty)) {
    throw new Error(`[${p.id}] Invalid difficulty: "${p.difficulty}"`);
  }
  if (!VALID_TACTICAL_REWARDS.has(p.tacticalReward)) {
    throw new Error(`[${p.id}] Invalid tacticalReward: "${p.tacticalReward}"`);
  }
  if (!p.tacticalGoal || typeof p.tacticalGoal !== 'string' || p.tacticalGoal.trim().length <= 10) {
    throw new Error(`[${p.id}] tacticalGoal must be string > 10 chars`);
  }
  if (!p.learningSummary || typeof p.learningSummary !== 'string' || p.learningSummary.trim().length <= 15) {
    throw new Error(`[${p.id}] learningSummary must be string > 15 chars`);
  }
  if (!p.keyTakeaway || typeof p.keyTakeaway !== 'string' || p.keyTakeaway.trim().length <= 10) {
    throw new Error(`[${p.id}] keyTakeaway must be string > 10 chars`);
  }
  if (!p.outcomeAdvantage || typeof p.outcomeAdvantage !== 'string' || p.outcomeAdvantage.trim().length === 0) {
    throw new Error(`[${p.id}] outcomeAdvantage must be non-empty string`);
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
      throw new Error(
        `[${p.id}] Exception playing move ${moveUci} (from: ${from}, to: ${to}) at ply ${moveIdx} in position ${chess.fen()}: ${err.message}`
      );
    }

    if (!moveRes) {
      throw new Error(`[${p.id}] Illegal move ${moveUci} at ply ${moveIdx} in position ${chess.fen()}`);
    }

    const customExp =
      p.stepExplanations && p.stepExplanations[moveIdx] && p.stepExplanations[moveIdx].explanation;
    let explanation = customExp;
    if (!explanation) {
      if (moveRes.san.includes('#')) {
        explanation = `${actor === 'w' ? 'White' : 'Black'} delivers checkmate with ${moveRes.san}! 👑`;
      } else if (moveRes.captured) {
        explanation = `${actor === 'w' ? 'White' : 'Black'} plays ${moveRes.san}, capturing the enemy ${moveRes.captured.toUpperCase()} on ${to}!`;
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
    let w = 0,
      b = 0;
    for (const row of c.board()) {
      for (const piece of row) {
        if (!piece || piece.type === 'k') continue;
        const val = { p: 100, n: 320, b: 330, r: 500, q: 900 }[piece.type] || 0;
        if (piece.color === 'w') w += val;
        else b += val;
      }
    }
    return { w, b };
  };
  const initM = getMat(initialChess);
  const finM = getMat(chess);
  const netInit = p.playerColor === 'w' ? initM.w - initM.b : initM.b - initM.w;
  const netFin = p.playerColor === 'w' ? finM.w - finM.b : finM.b - finM.w;
  const deltaCp = netFin - netInit;

  const hasPromotion = p.moves.some((m) => m.length > 4);
  if (!isCheckmate && !hasPromotion && deltaCp <= 0 && p.tacticalReward !== 'pawn_promotion') {
    throw new Error(
      `[${p.id}] Non-checkmate puzzle ended with non-positive material delta: ${deltaCp} cp (expected deltaCp > 0)`
    );
  }

  // Terminal safety check: Ensure opponent has no immediate checkmate refutation
  if (!isCheckmate) {
    const oppMoves = chess.moves({ verbose: true });
    for (const oppMove of oppMoves) {
      const sim = new Chess(chess.fen());
      sim.move(oppMove);
      if (sim.isCheckmate()) {
        throw new Error(
          `[${p.id}] Terminal Safety Violation: Opponent has counter-checkmate ${oppMove.san} in final position ${chess.fen()}`
        );
      }
    }
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
    targetSquares: p.targetSquares,
    keySquares: p.keySquares,
  };
}

export function savePack(filePath, puzzles) {
  if (!Array.isArray(puzzles) || puzzles.length < 30) {
    throw new Error(
      `Pack ${path.basename(filePath)} must contain at least 30 puzzles, but found ${puzzles?.length || 0}`
    );
  }

  const enriched = puzzles.map(validateAndEnrich);

  // Validate 100% unique FENs
  const fenSet = new Set();
  for (const p of enriched) {
    const boardFen = p.fen.split(' ')[0];
    if (fenSet.has(boardFen)) {
      throw new Error(`[${p.id}] Duplicate FEN detected in ${path.basename(filePath)}: ${p.fen}`);
    }
    fenSet.add(boardFen);
  }

  // Validate >= 90% unique move lines
  const moveLines = new Set();
  for (const p of enriched) {
    moveLines.add(p.moves.join(' '));
  }
  const moveRatio = moveLines.size / enriched.length;
  if (moveRatio < 0.9) {
    throw new Error(
      `Pack ${path.basename(filePath)} move line uniqueness ratio is ${(moveRatio * 100).toFixed(1)}% (${moveLines.size}/${enriched.length}), expected >= 90%`
    );
  }

  fs.writeFileSync(filePath, JSON.stringify(enriched, null, 2) + '\n', 'utf-8');
  console.info(
    `[${new Date().toISOString()}] [INFO] Successfully saved ${enriched.length} authentic puzzles to ${path.basename(filePath)} ` +
    JSON.stringify({
      pack: path.basename(filePath),
      puzzles: enriched.length,
      uniqueFens: fenSet.size,
      uniqueLinesRatio: `${(moveRatio * 100).toFixed(1)}%`,
    })
  );
}

export function validateAllPacks(dataDir = path.resolve('apps/client/src/features/puzzles/data')) {
  const packs = [
    'forks.json',
    'pins.json',
    'skewers.json',
    'discovered_checks.json',
    'deflection_decoy.json',
    'greek_gift.json',
    'windmill.json',
    'back_rank.json',
    'anastasia_hook.json',
    'smothered.json',
    'endgame_conversion.json',
  ];

  let totalPuzzles = 0;
  const globalFenSet = new Set();
  const summary = [];

  for (const pack of packs) {
    const fullPath = path.join(dataDir, pack);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Pack file not found: ${fullPath}`);
    }
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    if (!Array.isArray(raw) || raw.length < 30) {
      throw new Error(`Pack ${pack} has fewer than 30 puzzles: ${raw?.length || 0}`);
    }

    const enriched = raw.map(validateAndEnrich);
    const moveLines = new Set(enriched.map(p => p.moves.join(' ')));
    const packFens = new Set();

    for (const p of enriched) {
      const boardFen = p.fen.split(' ')[0];
      if (packFens.has(boardFen)) {
        throw new Error(`[${p.id}] Intra-pack duplicate FEN in ${pack}: ${p.fen}`);
      }
      packFens.add(boardFen);
      globalFenSet.add(boardFen);
    }

    const moveRatio = moveLines.size / enriched.length;
    if (moveRatio < 0.9) {
      throw new Error(`[${pack}] Unique move line ratio ${(moveRatio * 100).toFixed(1)}% < 90%`);
    }

    totalPuzzles += enriched.length;
    summary.push({
      pack,
      puzzles: enriched.length,
      uniqueFens: packFens.size,
      uniqueLinesRatio: (moveRatio * 100).toFixed(1) + '%',
      status: '100% PASS'
    });
  }

  return {
    totalPacks: packs.length,
    totalPuzzles,
    globalUniqueFens: globalFenSet.size,
    summary,
  };
}

if (process.argv[1] && process.argv[1].endsWith('validator.mjs')) {
  try {
    const res = validateAllPacks();
    console.table(res.summary);
    console.info(
      `[${new Date().toISOString()}] [INFO] ALL ${res.totalPacks} PACKS VALIDATED ` +
      JSON.stringify({
        totalPacks: res.totalPacks,
        totalPuzzles: res.totalPuzzles,
        globalUniqueFens: res.globalUniqueFens,
        status: "100% PASS",
      })
    );
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] [ERROR] Validation failed: ` +
      JSON.stringify({
        error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
      })
    );
    process.exit(1);
  }
}

