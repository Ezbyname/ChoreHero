#!/usr/bin/env node
// Bounded, standalone validation that every hard-coded UUID literal in
// seed-rewards-redemption-qa-data.mjs is a syntactically valid UUID
// (32 hex digits, 8-4-4-4-12, hyphenated). Reads the fixture script's own
// source as plain text and extracts every UUID-shaped literal — does not
// import or execute that script, so this has no Supabase dependency and
// makes no network call. Exits non-zero if any literal fails to parse.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetPath = path.resolve(__dirname, 'seed-rewards-redemption-qa-data.mjs');
const source = readFileSync(targetPath, 'utf8');

// Matches any single-quoted string that looks like a UUID shape at all
// (so a genuinely malformed one, like the original '...-00rr-...' ids,
// still gets caught and reported instead of silently skipped).
const UUID_LITERAL = /'([0-9a-zA-Z]{8}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{12})'/g;
const VALID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const found = new Set();
let m;
while ((m = UUID_LITERAL.exec(source)) !== null) {
  found.add(m[1]);
}

if (found.size === 0) {
  console.error('No UUID-shaped literals found — the extraction pattern itself may be wrong.');
  process.exit(1);
}

let allValid = true;
console.log(`Checked ${found.size} UUID literal(s) in ${path.basename(targetPath)}:\n`);
for (const uuid of found) {
  const valid = VALID_UUID.test(uuid);
  if (!valid) allValid = false;
  console.log(`  ${uuid} -> ${valid ? 'VALID' : 'INVALID'}`);
}

console.log();
if (allValid) {
  console.log('All UUID literals are valid.');
  process.exit(0);
} else {
  console.error('One or more UUID literals are INVALID.');
  process.exit(1);
}
