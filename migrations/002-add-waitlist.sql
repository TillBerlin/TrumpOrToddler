CREATE TABLE IF NOT EXISTS waitlist ( email TEXT NOT NULL PRIMARY KEY, consent TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')) );
