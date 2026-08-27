import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';
import { validateAndEnrich, savePack } from './validator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..');
const PACKS_DIR = path.resolve(__dirname, 'packs');

console.log('🚀 Compiling and verifying all 11 Curated Authentic Packs...');

