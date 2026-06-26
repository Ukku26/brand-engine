// routes/brands.js
//
// Every route here that touches brand content takes :brandId from the
// URL and uses it in the SQL WHERE clause. That's the isolation rule
// in practice - see the note at the top of db.js.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { buildEmbedding } = require('../lib/tfidf');
const { compilePov } = require('../lib/anthropic');

// --- Brands ---------------------------------------------------------

router.get('/', (req, res) => {
  const brands = db.prepare('SELECT * FROM brands ORDER BY name').all();
  res.json(brands);
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Brand name is required.' });
  }

  const insert = db.prepare('INSERT INTO brands (name) VALUES (?)');
  const result = insert.run(name.trim());

  // Create an empty POV row up front so later GETs always find something.
  db.prepare('INSERT INTO brand_pov (brand_id) VALUES (?)').run(result.lastInsertRowid);

  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(brand);
});

router.delete('/:brandId', (req, res) => {
  db.prepare('DELETE FROM brands WHERE id = ?').run(req.params.brandId);
  res.status(204).end();
});

// --- POV layer -------------------------------------------------------

router.get('/:brandId/pov', (req, res) => {
  const pov = db
    .prepare('SELECT * FROM brand_pov WHERE brand_id = ?')
    .get(req.params.brandId);

  if (!pov) return res.status(404).json({ error: 'Brand not found.' });
  res.json(pov);
});

router.put('/:brandId/pov', (req, res) => {
  const { insights, core_values, beliefs, taste, judgement, pov_statement, voice_rules, brand_book } = req.body;

  // Clear pov_compiled so the next generation uses raw fields until
  // the async recompile finishes.
  db.prepare(
    `UPDATE brand_pov SET
      insights = ?, core_values = ?, beliefs = ?, taste = ?,
      judgement = ?, pov_statement = ?, voice_rules = ?, brand_book = ?, pov_compiled = NULL
     WHERE brand_id = ?`
  ).run(
    insights || '',
    core_values || '',
    beliefs || '',
    taste || '',
    judgement || '',
    pov_statement || '',
    voice_rules || '',
    brand_book || '',
    req.params.brandId
  );

  const updated = db.prepare('SELECT * FROM brand_pov WHERE brand_id = ?').get(req.params.brandId);
  res.json(updated);

  // P3: Compile the POV into a dense paragraph in the background.
  // Don't await — the save response has already gone back to the client.
  compilePov(updated).then((compiled) => {
    if (compiled) {
      db.prepare('UPDATE brand_pov SET pov_compiled = ? WHERE brand_id = ?')
        .run(compiled, req.params.brandId);
      console.log(`[pov] compiled for brand ${req.params.brandId} (${compiled.length} chars)`);
    }
  }).catch((err) => {
    console.warn('[pov] compile failed (will use raw fields):', err.message);
  });
});

// --- Asset layer -------------------------------------------------------

router.get('/:brandId/assets', (req, res) => {
  const assets = db
    .prepare('SELECT * FROM brand_assets WHERE brand_id = ? ORDER BY created_at DESC')
    .all(req.params.brandId);
  res.json(assets);
});

router.post('/:brandId/assets', (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are both required.' });
  }

  // P2: Build a TF vector from title + content and store it for RAG retrieval
  const embedding = buildEmbedding(`${title} ${content}`);

  const insert = db.prepare(
    'INSERT INTO brand_assets (brand_id, title, content, embedding) VALUES (?, ?, ?, ?)'
  );
  const result = insert.run(req.params.brandId, title.trim(), content, embedding);

  const asset = db.prepare('SELECT * FROM brand_assets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(asset);
});

router.delete('/:brandId/assets/:assetId', (req, res) => {
  // Scoped to brand_id too, not just the asset id - a brandId mismatch
  // here just deletes nothing, it can never delete another brand's row.
  db.prepare('DELETE FROM brand_assets WHERE id = ? AND brand_id = ?').run(
    req.params.assetId,
    req.params.brandId
  );
  res.status(204).end();
});

module.exports = router;
