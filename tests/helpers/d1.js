/**
 * A stand-in for the D1 binding, backed by real SQLite.
 *
 * It implements just the slice of the D1 API the functions use, so the tests
 * exercise the actual SQL -- including the UNIQUE constraints that enforce
 * one vote per player and reject duplicate statements.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeText } from '../../src/lib/text.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// node:sqlite is loaded through require so the test bundler leaves it alone.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

class Statement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    return new Statement(this.db, this.sql, args);
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.args) ?? null;
  }

  async all() {
    return { success: true, results: this.db.prepare(this.sql).all(...this.args) };
  }
}

export function createTestDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(resolve(root, 'schema.sql'), 'utf8'));

  return {
    prepare: (sql) => new Statement(db, sql),
    /** Test-only escape hatch for arranging fixtures and asserting state. */
    raw: db,
  };
}

export function addStatement(
  db,
  { text, status = 'approved', trump = 0, toddler = 0, funny = 0, meh = 0, sourceNote = null },
) {
  const result = db.raw
    .prepare(
      `INSERT INTO statements (text, norm_text, source_note, status, trump_votes, toddler_votes, funny_votes, meh_votes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    // Same normalisation the real endpoints use, so the UNIQUE constraint
    // behaves in tests exactly as it does in production.
    .run(text, normalizeText(text), sourceNote, status, trump, toddler, funny, meh);
  return Number(result.lastInsertRowid);
}

export function getVote(db, statementId, playerId) {
  return db.raw.prepare('SELECT * FROM votes WHERE statement_id = ? AND player_id = ?').get(statementId, playerId);
}

export function getStatement(db, id) {
  return db.raw.prepare('SELECT * FROM statements WHERE id = ?').get(id);
}

export function postJson(url, body, { ip = '203.0.113.5', headers = {} } = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...headers },
    body: JSON.stringify(body),
  });
}

export function makeEnv(db, overrides = {}) {
  return { DB: db, ADMIN_TOKEN: 'test-token', RATE_SALT: 'test-salt', ...overrides };
}
