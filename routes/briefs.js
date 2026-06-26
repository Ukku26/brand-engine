// routes/briefs.js
//
// Campaign briefs — named containers for a campaign or project.
// Each brief belongs to a brand and can carry its own context, assets,
// and a default campaign objective. Generations within a brief inherit
// the brief context and can override the objective per generation.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { generate } = require('../lib/anthropic');
const { buildSystemPrompt } = require('../lib/buildSystemPrompt');
const { topAssets, buildEmbedding } = require('../lib/tfidf');
const { inferMaxTokens, inferMaxTokensFromSpec } = require('../lib/maxTokens');

// --- Briefs CRUD -------------------------------------------------------

router.get('/:brandId/briefs', (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM briefs WHERE brand_id = ?
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END, created_at DESC`
  ).all(req.params.brandId);
  res.json(rows);
});

router.post('/:brandId/briefs', (req, res) => {
  const { name, context, objective, status } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Brief name is required.' });
  }
  const result = db.prepare(
    `INSERT INTO briefs (brand_id, name, context, objective, status) VALUES (?, ?, ?, ?, ?)`
  ).run(req.params.brandId, name.trim(), context || '', objective || '', status || 'active');

  res.status(201).json(db.prepare('SELECT * FROM briefs WHERE id = ?').get(result.lastInsertRowid));
});

router.get('/:brandId/briefs/:briefId', (req, res) => {
  const brief = db.prepare('SELECT * FROM briefs WHERE id = ? AND brand_id = ?')
    .get(req.params.briefId, req.params.brandId);
  if (!brief) return res.status(404).json({ error: 'Brief not found.' });
  res.json(brief);
});

router.put('/:brandId/briefs/:briefId', (req, res) => {
  const { name, context, objective, status } = req.body;
  db.prepare(
    `UPDATE briefs SET name = ?, context = ?, objective = ?, status = ? WHERE id = ? AND brand_id = ?`
  ).run(
    name || '', context || '', objective || '', status || 'active',
    req.params.briefId, req.params.brandId
  );
  const updated = db.prepare('SELECT * FROM briefs WHERE id = ?').get(req.params.briefId);
  res.json(updated);
});

router.delete('/:brandId/briefs/:briefId', (req, res) => {
  db.prepare('DELETE FROM briefs WHERE id = ? AND brand_id = ?')
    .run(req.params.briefId, req.params.brandId);
  res.status(204).end();
});

// --- Brief assets -------------------------------------------------------

router.get('/:brandId/briefs/:briefId/assets', (req, res) => {
  const assets = db.prepare(
    'SELECT * FROM brief_assets WHERE brief_id = ? AND brand_id = ? ORDER BY created_at DESC'
  ).all(req.params.briefId, req.params.brandId);
  res.json(assets);
});

router.post('/:brandId/briefs/:briefId/assets', (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are both required.' });
  }
  const embedding = buildEmbedding(`${title} ${content}`);
  const result = db.prepare(
    'INSERT INTO brief_assets (brief_id, brand_id, title, content, embedding) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.briefId, req.params.brandId, title.trim(), content, embedding);

  res.status(201).json(db.prepare('SELECT * FROM brief_assets WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/:brandId/briefs/:briefId/assets/:assetId', (req, res) => {
  db.prepare('DELETE FROM brief_assets WHERE id = ? AND brief_id = ? AND brand_id = ?')
    .run(req.params.assetId, req.params.briefId, req.params.brandId);
  res.status(204).end();
});

// --- Generation within a brief ------------------------------------------

router.post('/:brandId/briefs/:briefId/generate', async (req, res) => {
  const { brandId, briefId } = req.params;
  const { prompt, format, platform, placement, size, objective } = req.body;

  if (!prompt?.trim()) return res.status(400).json({ error: 'A prompt is required.' });

  const brief = db.prepare('SELECT * FROM briefs WHERE id = ? AND brand_id = ?').get(briefId, brandId);
  if (!brief) return res.status(404).json({ error: 'Brief not found.' });

  const pov = db.prepare('SELECT * FROM brand_pov WHERE brand_id = ?').get(brandId);
  if (!pov) return res.status(404).json({ error: 'Brand not found.' });

  const spec = (format && platform && placement && size)
    ? db.prepare('SELECT * FROM platform_specs WHERE format=? AND platform=? AND placement=? AND size=?')
        .get(format, platform, placement, size)
    : null;

  // Objective: per-generation override → brief default → none
  const effectiveObjective = objective || brief.objective || null;

  // Approved examples from THIS brief only (few-shot)
  const approvedExamples = db.prepare(
    `SELECT prompt, output FROM generations WHERE brief_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 3`
  ).all(briefId);

  // RAG: top-2 brand assets + top-2 brief assets
  const allBrandAssets = db.prepare('SELECT * FROM brand_assets WHERE brand_id = ? ORDER BY created_at DESC').all(brandId);
  const allBriefAssets = db.prepare('SELECT * FROM brief_assets WHERE brief_id = ? ORDER BY created_at DESC').all(briefId);
  const relevantBrandAssets = topAssets(prompt.trim(), allBrandAssets, 2);
  const relevantBriefAssets = topAssets(prompt.trim(), allBriefAssets, 2);

  const maxTokens = spec ? inferMaxTokensFromSpec(spec) : inferMaxTokens(prompt.trim());

  const systemPrompt = buildSystemPrompt(pov, relevantBrandAssets, approvedExamples, spec, {
    briefAssets: relevantBriefAssets,
    objective: effectiveObjective,
  });

  // Prepend brief context to the user turn
  const userPrompt = brief.context && brief.context.trim()
    ? `CAMPAIGN BRIEF CONTEXT:\n${brief.context.trim()}\n\n---\n\n${prompt.trim()}`
    : prompt.trim();

  try {
    const output = await generate(systemPrompt, userPrompt, maxTokens);

    const result = db.prepare(
      `INSERT INTO generations (brand_id, brief_id, prompt, output, format, platform, placement, size, content_type, objective)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      brandId, briefId, prompt.trim(), output,
      spec?.format || null, spec?.platform || null,
      spec?.placement || null, spec?.size || null,
      spec?.content_type || null, effectiveObjective || null
    );

    res.status(201).json(db.prepare('SELECT * FROM generations WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    console.error('Generation failed:', err.message);
    res.status(500).json({ error: 'Generation failed. Check your ANTHROPIC_API_KEY.' });
  }
});

// --- Brief history + approve/reject -------------------------------------

router.get('/:brandId/briefs/:briefId/generations', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM generations WHERE brief_id = ? AND brand_id = ? ORDER BY created_at DESC'
  ).all(req.params.briefId, req.params.brandId);
  res.json(rows);
});

router.put('/:brandId/briefs/:briefId/generations/:genId', (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved, rejected, or pending.' });
  }
  db.prepare('UPDATE generations SET status = ? WHERE id = ? AND brief_id = ? AND brand_id = ?')
    .run(status, req.params.genId, req.params.briefId, req.params.brandId);
  res.json(db.prepare('SELECT * FROM generations WHERE id = ?').get(req.params.genId));
});

module.exports = router;
