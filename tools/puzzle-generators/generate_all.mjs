import * as path from 'path';
import { fileURLToPath } from 'url';
import { savePack } from './validator.mjs';

import { FORK_DATA } from './packs/forks_pack.mjs';
import { PIN_DATA } from './packs/pins_pack.mjs';
import { SKEWER_DATA } from './packs/skewers_pack.mjs';
import { DISCOVERED_CHECK_DATA } from './packs/discovered_checks_pack.mjs';
import { DEFLECTION_DECOY_DATA } from './packs/deflection_decoy_pack.mjs';
import { GREEK_GIFT_DATA } from './packs/greek_gift_pack.mjs';
import { WINDMILL_DATA } from './packs/windmill_pack.mjs';
import { BACK_RANK_DATA } from './packs/back_rank_pack.mjs';
import { ANASTASIA_HOOK_DATA } from './packs/anastasia_hook_pack.mjs';
import { SMOTHERED_DATA } from './packs/smothered_pack.mjs';
import { ENDGAME_CONVERSION_DATA } from './packs/endgame_conversion_pack.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..');

const PACKS = [
  { file: 'forks.json', data: FORK_DATA },
  { file: 'pins.json', data: PIN_DATA },
  { file: 'skewers.json', data: SKEWER_DATA },
  { file: 'discovered_checks.json', data: DISCOVERED_CHECK_DATA },
  { file: 'deflection_decoy.json', data: DEFLECTION_DECOY_DATA },
  { file: 'greek_gift.json', data: GREEK_GIFT_DATA },
  { file: 'windmill.json', data: WINDMILL_DATA },
  { file: 'back_rank.json', data: BACK_RANK_DATA },
  { file: 'anastasia_hook.json', data: ANASTASIA_HOOK_DATA },
  { file: 'smothered.json', data: SMOTHERED_DATA },
  { file: 'endgame_conversion.json', data: ENDGAME_CONVERSION_DATA },
];

let totalPuzzles = 0;
for (const pack of PACKS) {
  const targetPath = path.join(DATA_DIR, pack.file);
  savePack(targetPath, pack.data);
  totalPuzzles += pack.data.length;
}

console.info(
  `[${new Date().toISOString()}] [INFO] Successfully generated all ${PACKS.length} puzzle packs ` +
  JSON.stringify({
    totalPacks: PACKS.length,
    totalPuzzles,
    status: "success",
  })
);
