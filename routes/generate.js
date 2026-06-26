// routes/generate.js
//
// Handles: running a generation for a brand, listing history,
// and approving/rejecting a past generation.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { generate } = require('../lib/anthropic');
const { buildSystemPrompt } = require('../lib/buildSystemPrompt');

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

  const assets = db
    .prepare('SELECT * FROM brand_assets WHERE brand_id = ? ORDER BY created_at DESC')
    .all(brandId);

  const systemPrompt = buildSystemPrompt(pov, assets);

  let userPrompt = prompt.trim();
  if (approvedExamples.length > 0) {
    const examplesText = approvedExamples
      .map((ex, i) => `Example ${i + 1}\nRequest: ${ex.prompt}\nApproved output: ${ex.output}`)
      .join('\n\n');
    userPrompt = `Here are some previously approved outputs for this brand, for reference on tone and quality:\n\n${examplesText}\n\n---\n\nNew request: ${prompt.trim()}`;
  }

  try {
    const output = await generate(systemPrompt, userPrompt);

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
