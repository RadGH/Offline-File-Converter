/**
 * generate-matrix-report.mjs
 * Reads test-results/matrix-results.jsonl and writes MATRIX.md at project root.
 *
 * Usage: node scripts/generate-matrix-report.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const JSONL_PATH = path.join(ROOT, 'test-results', 'matrix-results.jsonl');
const OUTPUT_PATH = path.join(ROOT, 'MATRIX.md');

const INPUTS = ['jpg', 'png', 'webp', 'avif', 'heic', 'gif', 'bmp'];
const OUTPUTS = ['jpeg', 'png', 'webp', 'avif', 'gif'];

// Labels for table headers/rows
const INPUT_LABELS = { jpg: 'JPEG', png: 'PNG', webp: 'WebP', avif: 'AVIF', heic: 'HEIC', gif: 'GIF', bmp: 'BMP' };
const OUTPUT_LABELS = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP', avif: 'AVIF', gif: 'GIF' };

if (!fs.existsSync(JSONL_PATH)) {
  console.error(`ERROR: ${JSONL_PATH} not found. Run "npm run test:matrix" first.`);
  process.exit(1);
}

/** @type {Array<{input:string,output:string,status:'pass'|'fail',error?:string,outputSize:number,durationMs:number}>} */
const results = fs
  .readFileSync(JSONL_PATH, 'utf8')
  .trim()
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

// Build lookup map: "input:output" → result
const map = new Map();
for (const r of results) {
  map.set(`${r.input}:${r.output}`, r);
}

// Compute stats
const total = INPUTS.length * OUTPUTS.length; // 35
let passing = 0;
const failures = [];

for (const r of results) {
  if (r.status === 'pass') passing++;
  else failures.push(r);
}

// Format date
const now = new Date();
const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');

// ── Build main pass/fail table ──────────────────────────────────────────────
const headerCols = OUTPUTS.map((o) => `→ ${OUTPUT_LABELS[o]}`);
const headerRow = `|         | ${headerCols.join(' | ')} |`;
const sepRow = `|---------|${OUTPUTS.map(() => '--------|').join('')}`;

const dataRows = INPUTS.map((inp) => {
  const cells = OUTPUTS.map((out) => {
    const r = map.get(`${inp}:${out}`);
    if (!r) return '⬜'; // no result (test didn't run)
    return r.status === 'pass' ? '✅' : '❌';
  });
  const label = INPUT_LABELS[inp].padEnd(7);
  return `| ${label} | ${cells.join(' | ')} |`;
});

// ── Build timing table ───────────────────────────────────────────────────────
const timingHeaderRow = `|         | ${headerCols.join(' | ')} |`;
const timingSepRow = sepRow;

const timingRows = INPUTS.map((inp) => {
  const cells = OUTPUTS.map((out) => {
    const r = map.get(`${inp}:${out}`);
    if (!r) return '—';
    return `${(r.durationMs / 1000).toFixed(1)}s`;
  });
  const label = INPUT_LABELS[inp].padEnd(7);
  return `| ${label} | ${cells.join(' | ')} |`;
});

// ── Build failures section ───────────────────────────────────────────────────
let failuresSection = '';
if (failures.length === 0) {
  failuresSection = '_No failures._';
} else {
  failuresSection = failures
    .map((r) => {
      const inLabel = INPUT_LABELS[r.input] ?? r.input;
      const outLabel = OUTPUT_LABELS[r.output] ?? r.output;
      return `- **${inLabel} → ${outLabel}**: ${r.error ?? 'Unknown error'}`;
    })
    .join('\n');
}

// ── Assemble MATRIX.md ───────────────────────────────────────────────────────
const md = `# Conversion Matrix — Last run: ${dateStr}

${passing}/${total} passing${failures.length > 0 ? ` — ${failures.length} failure${failures.length === 1 ? '' : 's'}` : ''}.

## Pass / Fail Grid

${headerRow}
${sepRow}
${dataRows.join('\n')}

## Failures

${failuresSection}

## Timing (seconds per cell)

${timingHeaderRow}
${timingSepRow}
${timingRows.join('\n')}
`;

fs.writeFileSync(OUTPUT_PATH, md, 'utf8');
console.log(`MATRIX.md written — ${passing}/${total} passing.`);
if (failures.length > 0) {
  console.log(`Failures (${failures.length}):`);
  for (const f of failures) {
    const inLabel = INPUT_LABELS[f.input] ?? f.input;
    const outLabel = OUTPUT_LABELS[f.output] ?? f.output;
    console.log(`  ${inLabel} → ${outLabel}: ${f.error ?? 'unknown'}`);
  }
}
