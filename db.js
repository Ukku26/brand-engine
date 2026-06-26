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

// On Railway, RAILWAY_VOLUME_MOUNT_PATH points to a persistent disk.
// Locally it's unset, so we fall back to the project root.
const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const db = new Database(path.join(DB_DIR, 'data.db'));

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

  CREATE TABLE IF NOT EXISTS platform_specs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    format       TEXT NOT NULL,
    platform     TEXT NOT NULL,
    placement    TEXT NOT NULL,
    size         TEXT NOT NULL,
    size_label   TEXT NOT NULL,
    dimensions   TEXT NOT NULL,
    content_type TEXT NOT NULL,
    UNIQUE(format, platform, placement, size)
  );
`);

// Schema migrations — ADD COLUMN fails silently if column already exists
[
  'ALTER TABLE brand_assets ADD COLUMN embedding TEXT',
  'ALTER TABLE brand_pov    ADD COLUMN pov_compiled TEXT',
  'ALTER TABLE generations  ADD COLUMN format TEXT',
  'ALTER TABLE generations  ADD COLUMN platform TEXT',
  'ALTER TABLE generations  ADD COLUMN placement TEXT',
  'ALTER TABLE generations  ADD COLUMN size TEXT',
  'ALTER TABLE generations  ADD COLUMN content_type TEXT',
].forEach((sql) => { try { db.exec(sql); } catch (_) {} });

// Seed platform_specs (INSERT OR IGNORE = idempotent re-runs)
const seedSpec = db.prepare(`
  INSERT OR IGNORE INTO platform_specs (format, platform, placement, size, size_label, dimensions, content_type)
  VALUES (@format, @platform, @placement, @size, @size_label, @dimensions, @content_type)
`);

const SPECS = [
  // ── VIDEO ─────────────────────────────────────────────────────────────
  // Instagram
  { format:'video', platform:'instagram', placement:'reels',     size:'15s',   size_label:'15 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'instagram', placement:'reels',     size:'30s',   size_label:'30 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'instagram', placement:'reels',     size:'60s',   size_label:'60 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'instagram', placement:'reels',     size:'90s',   size_label:'90 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'instagram', placement:'stories',   size:'15s',   size_label:'15 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'instagram', placement:'feed',      size:'30s',   size_label:'30 seconds',              dimensions:'1080×1080', content_type:'script' },
  { format:'video', platform:'instagram', placement:'feed',      size:'60s',   size_label:'60 seconds',              dimensions:'1080×1080', content_type:'script' },
  { format:'video', platform:'instagram', placement:'sponsored', size:'15s',   size_label:'15 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'instagram', placement:'sponsored', size:'30s',   size_label:'30 seconds',              dimensions:'1080×1920', content_type:'script' },
  // Facebook
  { format:'video', platform:'facebook',  placement:'reels',     size:'15s',   size_label:'15 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'facebook',  placement:'reels',     size:'30s',   size_label:'30 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'facebook',  placement:'reels',     size:'60s',   size_label:'60 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'facebook',  placement:'feed',      size:'30s',   size_label:'30 seconds',              dimensions:'1280×720',  content_type:'script' },
  { format:'video', platform:'facebook',  placement:'feed',      size:'60s',   size_label:'60 seconds',              dimensions:'1280×720',  content_type:'script' },
  { format:'video', platform:'facebook',  placement:'stories',   size:'15s',   size_label:'15 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'facebook',  placement:'sponsored', size:'15s',   size_label:'15 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'facebook',  placement:'sponsored', size:'30s',   size_label:'30 seconds',              dimensions:'1080×1920', content_type:'script' },
  // YouTube
  { format:'video', platform:'youtube',   placement:'feed',      size:'30s',   size_label:'30 seconds',              dimensions:'1920×1080', content_type:'script' },
  { format:'video', platform:'youtube',   placement:'feed',      size:'60s',   size_label:'60 seconds',              dimensions:'1920×1080', content_type:'script' },
  { format:'video', platform:'youtube',   placement:'feed',      size:'3min',  size_label:'3 minutes',               dimensions:'1920×1080', content_type:'script' },
  { format:'video', platform:'youtube',   placement:'feed',      size:'5min',  size_label:'5 minutes',               dimensions:'1920×1080', content_type:'script' },
  { format:'video', platform:'youtube',   placement:'feed',      size:'10min', size_label:'10 minutes',              dimensions:'1920×1080', content_type:'script' },
  { format:'video', platform:'youtube',   placement:'shorts',    size:'15s',   size_label:'15 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'youtube',   placement:'shorts',    size:'30s',   size_label:'30 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'youtube',   placement:'shorts',    size:'60s',   size_label:'60 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'youtube',   placement:'pre-roll',  size:'15s',   size_label:'15 sec (unskippable)',    dimensions:'1920×1080', content_type:'script' },
  { format:'video', platform:'youtube',   placement:'pre-roll',  size:'30s',   size_label:'30 seconds',              dimensions:'1920×1080', content_type:'script' },
  // TikTok
  { format:'video', platform:'tiktok',    placement:'feed',      size:'15s',   size_label:'15 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'tiktok',    placement:'feed',      size:'30s',   size_label:'30 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'tiktok',    placement:'feed',      size:'60s',   size_label:'60 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'tiktok',    placement:'feed',      size:'3min',  size_label:'3 minutes',               dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'tiktok',    placement:'sponsored', size:'15s',   size_label:'15 seconds',              dimensions:'1080×1920', content_type:'script' },
  { format:'video', platform:'tiktok',    placement:'sponsored', size:'30s',   size_label:'30 seconds',              dimensions:'1080×1920', content_type:'script' },
  // LinkedIn
  { format:'video', platform:'linkedin',  placement:'feed',      size:'30s',   size_label:'30 seconds',              dimensions:'1920×1080', content_type:'script' },
  { format:'video', platform:'linkedin',  placement:'feed',      size:'60s',   size_label:'60 seconds',              dimensions:'1920×1080', content_type:'script' },
  { format:'video', platform:'linkedin',  placement:'feed',      size:'3min',  size_label:'3 minutes',               dimensions:'1920×1080', content_type:'script' },
  { format:'video', platform:'linkedin',  placement:'sponsored', size:'15s',   size_label:'15 seconds',              dimensions:'1920×1080', content_type:'script' },
  { format:'video', platform:'linkedin',  placement:'sponsored', size:'30s',   size_label:'30 seconds',              dimensions:'1920×1080', content_type:'script' },
  // Twitter/X
  { format:'video', platform:'twitter',   placement:'feed',      size:'15s',   size_label:'15 seconds',              dimensions:'1280×720',  content_type:'script' },
  { format:'video', platform:'twitter',   placement:'feed',      size:'30s',   size_label:'30 seconds',              dimensions:'1280×720',  content_type:'script' },
  { format:'video', platform:'twitter',   placement:'feed',      size:'60s',   size_label:'60 seconds',              dimensions:'1280×720',  content_type:'script' },
  // Pinterest
  { format:'video', platform:'pinterest', placement:'feed',      size:'15s',   size_label:'15 seconds',              dimensions:'1000×1500', content_type:'script' },
  { format:'video', platform:'pinterest', placement:'feed',      size:'30s',   size_label:'30 seconds',              dimensions:'1000×1500', content_type:'script' },
  { format:'video', platform:'pinterest', placement:'feed',      size:'60s',   size_label:'60 seconds',              dimensions:'1000×1500', content_type:'script' },

  // ── AUDIO ─────────────────────────────────────────────────────────────
  { format:'audio', platform:'instagram', placement:'reels',     size:'15s',   size_label:'15 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'instagram', placement:'reels',     size:'30s',   size_label:'30 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'instagram', placement:'reels',     size:'60s',   size_label:'60 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'instagram', placement:'stories',   size:'15s',   size_label:'15 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'facebook',  placement:'reels',     size:'15s',   size_label:'15 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'facebook',  placement:'reels',     size:'30s',   size_label:'30 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'facebook',  placement:'reels',     size:'60s',   size_label:'60 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'tiktok',    placement:'feed',      size:'15s',   size_label:'15 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'tiktok',    placement:'feed',      size:'30s',   size_label:'30 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'tiktok',    placement:'feed',      size:'60s',   size_label:'60 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'youtube',   placement:'shorts',    size:'15s',   size_label:'15 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'youtube',   placement:'shorts',    size:'30s',   size_label:'30 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'youtube',   placement:'shorts',    size:'60s',   size_label:'60 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'youtube',   placement:'pre-roll',  size:'15s',   size_label:'15 sec (unskippable)',    dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'youtube',   placement:'pre-roll',  size:'30s',   size_label:'30 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'twitter',   placement:'feed',      size:'30s',   size_label:'30 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'twitter',   placement:'feed',      size:'60s',   size_label:'60 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'linkedin',  placement:'feed',      size:'30s',   size_label:'30 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'linkedin',  placement:'feed',      size:'60s',   size_label:'60 seconds',              dimensions:'—',         content_type:'voiceover' },
  { format:'audio', platform:'linkedin',  placement:'feed',      size:'3min',  size_label:'3 minutes',               dimensions:'—',         content_type:'voiceover' },

  // ── IMAGE ─────────────────────────────────────────────────────────────
  { format:'image', platform:'instagram', placement:'feed',      size:'1080×1080', size_label:'Square (1:1)',         dimensions:'1080×1080', content_type:'caption' },
  { format:'image', platform:'instagram', placement:'feed',      size:'1080×1350', size_label:'Portrait (4:5)',       dimensions:'1080×1350', content_type:'caption' },
  { format:'image', platform:'instagram', placement:'stories',   size:'1080×1920', size_label:'Vertical (9:16)',      dimensions:'1080×1920', content_type:'caption' },
  { format:'image', platform:'instagram', placement:'carousel',  size:'1080×1080', size_label:'Square (1:1)',         dimensions:'1080×1080', content_type:'caption' },
  { format:'image', platform:'instagram', placement:'sponsored', size:'1080×1080', size_label:'Square (1:1)',         dimensions:'1080×1080', content_type:'ad copy' },
  { format:'image', platform:'instagram', placement:'sponsored', size:'1080×1920', size_label:'Vertical (9:16)',      dimensions:'1080×1920', content_type:'ad copy' },
  { format:'image', platform:'facebook',  placement:'feed',      size:'1200×628',  size_label:'Landscape (1.91:1)',   dimensions:'1200×628',  content_type:'caption' },
  { format:'image', platform:'facebook',  placement:'feed',      size:'1080×1080', size_label:'Square (1:1)',         dimensions:'1080×1080', content_type:'caption' },
  { format:'image', platform:'facebook',  placement:'stories',   size:'1080×1920', size_label:'Vertical (9:16)',      dimensions:'1080×1920', content_type:'caption' },
  { format:'image', platform:'facebook',  placement:'carousel',  size:'1080×1080', size_label:'Square (1:1)',         dimensions:'1080×1080', content_type:'ad copy' },
  { format:'image', platform:'facebook',  placement:'sponsored', size:'1200×628',  size_label:'Landscape (1.91:1)',   dimensions:'1200×628',  content_type:'ad copy' },
  { format:'image', platform:'twitter',   placement:'feed',      size:'1600×900',  size_label:'Landscape (16:9)',     dimensions:'1600×900',  content_type:'post copy' },
  { format:'image', platform:'twitter',   placement:'feed',      size:'1080×1080', size_label:'Square (1:1)',         dimensions:'1080×1080', content_type:'post copy' },
  { format:'image', platform:'linkedin',  placement:'feed',      size:'1200×627',  size_label:'Landscape (1.91:1)',   dimensions:'1200×627',  content_type:'post copy' },
  { format:'image', platform:'linkedin',  placement:'feed',      size:'1080×1080', size_label:'Square (1:1)',         dimensions:'1080×1080', content_type:'post copy' },
  { format:'image', platform:'linkedin',  placement:'banner',    size:'1584×396',  size_label:'Banner (4:1)',         dimensions:'1584×396',  content_type:'headline' },
  { format:'image', platform:'linkedin',  placement:'sponsored', size:'1200×627',  size_label:'Landscape (1.91:1)',   dimensions:'1200×627',  content_type:'ad copy' },
  { format:'image', platform:'pinterest', placement:'feed',      size:'1000×1500', size_label:'Portrait (2:3)',       dimensions:'1000×1500', content_type:'caption' },
  { format:'image', platform:'pinterest', placement:'feed',      size:'1000×1000', size_label:'Square (1:1)',         dimensions:'1000×1000', content_type:'caption' },
  { format:'image', platform:'youtube',   placement:'banner',    size:'2560×1440', size_label:'Channel Art',          dimensions:'2560×1440', content_type:'headline' },
  { format:'image', platform:'tiktok',    placement:'feed',      size:'1080×1920', size_label:'Vertical (9:16)',      dimensions:'1080×1920', content_type:'caption' },

  // ── GIF ───────────────────────────────────────────────────────────────
  { format:'gif',   platform:'instagram', placement:'feed',      size:'1080×1080', size_label:'Square (1:1)',         dimensions:'1080×1080', content_type:'caption' },
  { format:'gif',   platform:'instagram', placement:'feed',      size:'1080×1350', size_label:'Portrait (4:5)',       dimensions:'1080×1350', content_type:'caption' },
  { format:'gif',   platform:'instagram', placement:'stories',   size:'1080×1920', size_label:'Vertical (9:16)',      dimensions:'1080×1920', content_type:'caption' },
  { format:'gif',   platform:'twitter',   placement:'feed',      size:'1280×720',  size_label:'Landscape (16:9)',     dimensions:'1280×720',  content_type:'caption' },
  { format:'gif',   platform:'twitter',   placement:'feed',      size:'1080×1080', size_label:'Square (1:1)',         dimensions:'1080×1080', content_type:'caption' },
  { format:'gif',   platform:'facebook',  placement:'feed',      size:'1280×720',  size_label:'Landscape (16:9)',     dimensions:'1280×720',  content_type:'caption' },
  { format:'gif',   platform:'facebook',  placement:'feed',      size:'1080×1080', size_label:'Square (1:1)',         dimensions:'1080×1080', content_type:'caption' },
  { format:'gif',   platform:'linkedin',  placement:'feed',      size:'1200×627',  size_label:'Landscape (1.91:1)',   dimensions:'1200×627',  content_type:'caption' },

  // ── TEXT ──────────────────────────────────────────────────────────────
  { format:'text',  platform:'instagram', placement:'feed',      size:'2200 chars',size_label:'2,200 characters',    dimensions:'—',         content_type:'caption' },
  { format:'text',  platform:'instagram', placement:'stories',   size:'2200 chars',size_label:'2,200 characters',    dimensions:'—',         content_type:'caption' },
  { format:'text',  platform:'twitter',   placement:'feed',      size:'280 chars', size_label:'280 characters',      dimensions:'—',         content_type:'post copy' },
  { format:'text',  platform:'linkedin',  placement:'feed',      size:'3000 chars',size_label:'3,000 characters',    dimensions:'—',         content_type:'post copy' },
  { format:'text',  platform:'linkedin',  placement:'sponsored', size:'150 chars', size_label:'150 characters',      dimensions:'—',         content_type:'ad copy' },
  { format:'text',  platform:'facebook',  placement:'feed',      size:'400 words', size_label:'~400 words',          dimensions:'—',         content_type:'post copy' },
  { format:'text',  platform:'tiktok',    placement:'feed',      size:'2200 chars',size_label:'2,200 characters',    dimensions:'—',         content_type:'caption' },
  { format:'text',  platform:'youtube',   placement:'feed',      size:'5000 chars',size_label:'5,000 characters',    dimensions:'—',         content_type:'description' },
  { format:'text',  platform:'pinterest', placement:'feed',      size:'500 chars', size_label:'500 characters',      dimensions:'—',         content_type:'caption' },
];

const insertAll = db.transaction(() => { SPECS.forEach((s) => seedSpec.run(s)); });
insertAll();

module.exports = db;
