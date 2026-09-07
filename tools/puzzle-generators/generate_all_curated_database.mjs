import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';
import { validateAndEnrich, savePack } from './generate_authentic_curated_packs.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..');
const PACKS_DIR = path.resolve(__dirname, 'packs');

console.log('🚀 Starting compilation of Authentic Curated Puzzle Database (11 Packs)...');

// Helper to construct validated tactic
function makeTactic(p) {
  return validateAndEnrich({
    ratingDeviation: 85,
    subtitle: p.subtitle || p.tacticalGoal,
    targetSquares: p.targetSquares || [],
    keySquares: p.keySquares || [],
    ...p,
  });
}
