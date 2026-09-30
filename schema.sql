-- Trump or Toddler -- database schema (Cloudflare D1 / SQLite)
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS statements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  text          TEXT    NOT NULL,
  -- lowercased, whitespace-collapsed copy of `text`, used to reject duplicates
  norm_text     TEXT    NOT NULL UNIQUE,
  source_note   TEXT,
  status        TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'hidden')),
  trump_votes   INTEGER NOT NULL DEFAULT 0,
  toddler_votes INTEGER NOT NULL DEFAULT 0,
  -- How people rated the statement after seeing the result. This, not the
  -- Trump/Toddler split, is what decides which statement comes next: an even
  -- split can mean "torn between two good answers" or "applies to neither",
  -- and only asking tells you which.
  funny_votes   INTEGER NOT NULL DEFAULT 0,
  meh_votes     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_statements_status ON statements (status);

CREATE TABLE IF NOT EXISTS votes (
  statement_id INTEGER NOT NULL REFERENCES statements (id) ON DELETE CASCADE,
  player_id    TEXT    NOT NULL,
  choice       TEXT    NOT NULL CHECK (choice IN ('trump', 'toddler')),
  -- How long the player took to decide. Answers faster than a person can read
  -- the statement are recorded but not counted, so click-through does not move
  -- the numbers.
  decision_ms  INTEGER,
  -- Set later, when the player rates the statement. NULL until they do, which
  -- is also what stops a second rating from counting twice.
  rating       TEXT    CHECK (rating IS NULL OR rating IN ('funny', 'meh')),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (statement_id, player_id)
);

-- One row per rate-limited action. Rows older than the window are deleted on
-- write, so this holds nothing beyond what the limiter currently needs.
-- `bucket` is 'vote:<hash>' / 'submit:<hash>' where <hash> is a salted SHA-256
-- of the IP -- the raw address is never stored.
CREATE TABLE IF NOT EXISTS rate_events (
  bucket     TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_events ON rate_events (bucket, created_at);
