// db.js
//
// This file sets up a local SQLite database (a single file: data.db).
// No separate database server to install or run - it's just a file
// on disk that better-sqlite3 reads and writes.
//
// THE MOST IMPORTANT IDEA IN THIS WHOLE APP:
// Every table below that holds brand content has a `brand_id` column.
// Every query anywhere in the app filters by that column.
// That's the entire mechanism that keeps Brand A's stuff from
// ever mixing with Brand B's stuff. If you add new tables later,
// give them a brand_id column too and filter by it.

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));

// WAL mode = better performance, avoids some "database is locked" errors
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- The "POV Layer" from the playbook: insights, values, beliefs,
  -- taste, judgement, point of view. One row per brand.
  CREATE TABLE IF NOT EXISTS brand_pov (
    brand_id INTEGER PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
    insights TEXT DEFAULT '',
    core_values TEXT DEFAULT '',
    beliefs TEXT DEFAULT '',
    taste TEXT DEFAULT '',
    judgement TEXT DEFAULT '',
    pov_statement TEXT DEFAULT '',
    voice_rules TEXT DEFAULT ''
  );

  -- The "Asset Layer": reference material the brand workspace can pull
  -- from when generating (past campaigns, guidelines, product info, etc).
  -- For the fast path we just paste text in - no file uploads needed yet.
  CREATE TABLE IF NOT EXISTS brand_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- The "Memory Layer": every generation request and its result,
  -- plus an approve/reject status so good outputs can be reused later.
  CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    output TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Schema migrations — ADD COLUMN fails silently if column already exists
[
  'ALTER TABLE brand_assets ADD COLUMN embedding TEXT',
  'ALTER TABLE brand_pov    ADD COLUMN pov_compiled TEXT',
].forEach((sql) => { try { db.exec(sql); } catch (_) {} });

module.exports = db;
