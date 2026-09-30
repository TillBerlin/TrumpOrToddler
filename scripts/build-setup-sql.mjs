#!/usr/bin/env node
/**
 * Generate setup.sql: the schema plus every seed statement, as one block you
 * can paste into the D1 console in the Cloudflare dashboard.
 *
 * This exists so the site can be set up entirely in a browser, with nothing
 * installed locally. Run it again after editing seed/statements.json:
 *
 *   npm run build:setup-sql
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSubmission, normalizeText } from '../src/lib/text.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const quote = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);

const parsed = JSON.parse(readFileSync(join(root, 'seed/statements.json'), 'utf8'));
const entries = Array.isArray(parsed) ? parsed : parsed.statements;

const seen = new Set();
const inserts = [];

for (const entry of entries) {
  const check = validateSubmission({ text: entry?.text, sourceNote: entry?.source_note ?? entry?.sourceNote });
  if (!check.ok) continue;
  const key = normalizeText(check.value.text);
  if (seen.has(key)) continue;
  seen.add(key);
  const { text, sourceNote, normText } = check.value;
  inserts.push(
    `INSERT OR IGNORE INTO statements (text, norm_text, source_note, status) VALUES (${quote(text)}, ${quote(normText)}, ${quote(sourceNote)}, 'approved');`,
  );
}

const output = [
  '-- Trump or Toddler -- complete first-time setup.',
  '--',
  '-- GENERATED FILE. Edit schema.sql or seed/statements.json instead, then run',
  '-- `npm run build:setup-sql`.',
  '--',
  '-- Paste all of this into the D1 console in the Cloudflare dashboard',
  '-- (Storage & Databases -> D1 -> your database -> Console) and hit Execute.',
  '-- Running it twice is safe: the tables are only created if missing, and',
  '-- statements already there keep the votes they have collected.',
  '',
  readFileSync(join(root, 'schema.sql'), 'utf8').trim(),
  '',
  `-- ${inserts.length} starting statements, all approved.`,
  ...inserts,
  '',
].join('\n');

writeFileSync(join(root, 'setup.sql'), output, 'utf8');
console.log(`  setup.sql written: schema + ${inserts.length} statements`);
