-- Unlocked IQ: initial schema.
-- results: one row per finished test the user chose to save/share (payload may include the optional display name).
-- responses: anonymous per-item outcomes, written only with explicit consent. No name, no IP.

CREATE TABLE IF NOT EXISTS results (
  id         TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  iq         INTEGER NOT NULL,
  mode       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_results_created_at ON results (created_at);
CREATE INDEX IF NOT EXISTS idx_results_mode ON results (mode);

CREATE TABLE IF NOT EXISTS responses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL,
  seed        INTEGER NOT NULL,
  correct     INTEGER NOT NULL,
  mode        TEXT NOT NULL,
  theta       REAL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_responses_template ON responses (template_id);
CREATE INDEX IF NOT EXISTS idx_responses_created_at ON responses (created_at);
