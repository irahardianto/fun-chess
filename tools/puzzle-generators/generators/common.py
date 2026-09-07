import json
import os
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SCRIPTS_DIR = os.path.dirname(SCRIPT_DIR)
PACKS_DIR = os.path.join(SCRIPTS_DIR, "packs")
DATA_DIR = os.path.dirname(SCRIPTS_DIR)
os.makedirs(PACKS_DIR, exist_ok=True)

def save_and_verify(filename, var_name, puzzles):
    # Save pack file
    pack_mjs = os.path.join(PACKS_DIR, filename.replace('.json', '_pack.mjs'))
    with open(pack_mjs, 'w') as f:
        f.write(f"export const {var_name} = {json.dumps(puzzles, indent=2)};\n")
    
    json_path = os.path.join(DATA_DIR, filename)
    cmd = f"""node -e "
import {{ {var_name} }} from './apps/client/src/features/puzzles/data/scripts/packs/{filename.replace('.json', '_pack.mjs')}';
import {{ savePack }} from './apps/client/src/features/puzzles/data/scripts/validator.mjs';
savePack('{json_path}', {var_name});
" """
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=os.path.expanduser("~/works/projects/fun-chess"))
    if res.returncode != 0:
        print(f"❌ Error validating {filename}:")
        print(res.stderr or res.stdout)
        raise RuntimeError(f"Validation failed for {filename}")
    else:
        print(f"✅ {filename}: 100% PASS ({len(puzzles)} puzzles)")

