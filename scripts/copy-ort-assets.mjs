/**
 * Copy ORT WASM + mjs files to public/ort/ so they are served same-origin.
 *
 * Invoked automatically via the "prebuild" npm lifecycle script.
 * Run manually: node scripts/copy-ort-assets.mjs
 */

import { copyFile, mkdir, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const SRC_DIR = join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');
const DST_DIR = join(ROOT, 'public', 'ort');

async function main() {
  await mkdir(DST_DIR, { recursive: true });

  const files = await readdir(SRC_DIR);
  const targets = files.filter((f) => {
    const ext = extname(f);
    return ext === '.wasm' || ext === '.mjs';
  });

  let copied = 0;
  for (const file of targets) {
    await copyFile(join(SRC_DIR, file), join(DST_DIR, file));
    copied++;
  }

  console.log(`[copy-ort-assets] Copied ${copied} files to public/ort/`);
}

main().catch((err) => {
  console.error('[copy-ort-assets] Error:', err);
  process.exit(1);
});
