#!/usr/bin/env node
/**
 * Generate setup.sql: the schema plus every seed statement, as one block you
 * can paste into the D1 console in the Cloudflare dashboard.
 *
 * This exists so the site can be set up entirely in a browser, with nothing
 * installed locally. Run it again after editing seed/statements.json:
 *
 *   npm run build:setup-sql
 *
 * The output deliberately contains NO `--` comments. The dashboard console is a
 * single-line input: a pasted file arrives with its newlines flattened, and a
 * `--` would then comment out everything that follows it, leaving the request
 * with no query at all. Explanations belong in README.md, not in this file.
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

/**
 * Strip `--` comments and blank lines from the schema, and put each statement
 * on a single line, so the whole file still works when newlines are lost.
 * Only the schema is treated this way: the INSERT lines are built from
 * validated text, where a `--` can only ever appear inside a quoted string.
 */
function compactSchema(sql) {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => `${statement};`);
}

const output = [...compactSchema(readFileSync(join(root, 'schema.sql'), 'utf8')), ...inserts, ''].join('\n');

writeFileSync(join(root, 'setup.sql'), output, 'utf8');
console.log(`  setup.sql written: schema + ${inserts.length} statements`);
