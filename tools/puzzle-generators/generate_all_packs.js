const { Chess } = require('chess.js');
const fs = require('fs');
const path = require('path');

function validateAndEnrich(p) {
  const chess = new Chess(p.fen);
  if (chess.turn() !== p.playerColor) {
    throw new Error(`[${p.id}] playerColor mismatch: def=${p.playerColor}, FEN=${chess.turn()}`);
  }

  const stepExplanations = [];
  let moveIdx = 0;

  for (const moveUci of p.moves) {
    const from = moveUci.slice(0, 2);
    const to = moveUci.slice(2, 4);
    const promo = moveUci.slice(4) || undefined;
    const actor = chess.turn();

    const moveRes = chess.move({ from, to, promotion: promo });
    if (!moveRes) {
      throw new Error(`[${p.id}] Illegal move ${moveUci} at ply ${moveIdx} in FEN ${chess.fen()}`);
    }

    const customExp = p.stepExplanations && p.stepExplanations[moveIdx] && p.stepExplanations[moveIdx].explanation;
    let explanation = customExp;
    if (!explanation) {
      if (moveRes.san.includes('#')) {
        explanation = `${actor === 'w' ? 'White' : 'Black'} delivers checkmate with ${moveRes.san}! 👑`;
      } else if (moveRes.captured) {
        explanation = `${actor === 'w' ? 'White' : 'Black'} plays ${moveRes.san}, capturing the enemy ${moveRes.captured.toUpperCase()}!`;
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

  if (p.tacticalReward === 'checkmate' && !chess.isCheckmate()) {
    throw new Error(`[${p.id}] Expected checkmate at end, but FEN is not checkmate: ${chess.fen()}`);
  }

  return {
    id: p.id,
    fen: p.fen,
    moves: p.moves,
    rating: p.rating,
    ratingDeviation: p.ratingDeviation || 90,
    themes: p.themes,
    primaryTheme: p.primaryTheme,
    difficulty: p.difficulty,
    title: p.title,
    subtitle: p.subtitle,
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

console.log("Validator helper initialized successfully.");
