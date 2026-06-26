// routes/generate.js
//
// Handles: running a generation for a brand, listing history,
// and approving/rejecting a past generation.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { generate } = require('../lib/anthropic');
const { buildSystemPrompt } = require('../lib/buildSystemPrompt');
const { topAssets } = require('../lib/tfidf');
const { inferMaxTokens } = require('../lib/maxTokens');

router.post('/:brandId/generate', async (req, res) => {
  const { brandId } = req.params;
  const { prompt } = req.body;

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'A prompt is required.' });
  }

  const pov = db.prepare('SELECT * FROM brand_pov WHERE brand_id = ?').get(brandId);
  if (!pov) return res.status(404).json({ error: 'Brand not found.' });

  // Approved past generations for this brand only - used as few-shot
  // examples so the system gradually reflects what's actually been
  // approved, without needing real fine-tuning.
  const approvedExamples = db
    .prepare(
      `SELECT prompt, output FROM generations
       WHERE brand_id = ? AND status = 'approved'
       ORDER BY created_at DESC LIMIT 3`
    )
    .all(brandId);

  const allAssets = db
    .prepare('SELECT * FROM brand_assets WHERE brand_id = ? ORDER BY created_at DESC')
    .all(brandId);

  // P2: Retrieve only the top-2 most relevant assets via TF cosine similarity
  const relevantAssets = topAssets(prompt.trim(), allAssets, 2);

  // P2: Infer a sensible max_tokens ceiling from the prompt rather than always 2000
  const maxTokens = inferMaxTokens(prompt.trim());

  // Pass approvedExamples into the system prompt (cached) instead of the user turn
  const systemPrompt = buildSystemPrompt(pov, relevantAssets, approvedExamples);
  const userPrompt = prompt.trim();

  try {
    const output = await generate(systemPrompt, userPrompt, maxTokens);

    const insert = db.prepare(
      'INSERT INTO generations (brand_id, prompt, output) VALUES (?, ?, ?)'
    );
    const result = insert.run(brandId, prompt.trim(), output);

    const record = db.prepare('SELECT * FROM generations WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(record);
  } catch (err) {
    console.error('Generation failed:', err.message);
    res.status(500).json({ error: 'Generation failed. Check your ANTHROPIC_API_KEY in .env and try again.' });
  }
});

router.get('/:brandId/generations', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM generations WHERE brand_id = ? ORDER BY created_at DESC')
    .all(req.params.brandId);
  res.json(rows);
});

router.put('/:brandId/generations/:genId', (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved, rejected, or pending.' });
  }

  // Scoped to brand_id - can't accidentally touch another brand's row.
  db.prepare('UPDATE generations SET status = ? WHERE id = ? AND brand_id = ?').run(
    status,
    req.params.genId,
    req.params.brandId
  );

  const updated = db.prepare('SELECT * FROM generations WHERE id = ?').get(req.params.genId);
  res.json(updated);
});

module.exports = router;
