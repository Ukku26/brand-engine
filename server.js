// server.js
//
// This is the entry point. Run it with: npm start

require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');

const brandsRouter = require('./routes/brands');
const generateRouter = require('./routes/generate');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

// API routes
app.use('/api/brands', brandsRouter);
app.use('/api/brands', generateRouter);

// Platform specs — powers the cascading dropdowns in the Generate tab
app.get('/api/specs', (req, res) => {
  res.json(db.prepare('SELECT * FROM platform_specs ORDER BY format, platform, placement, size').all());
});

// Frontend (plain HTML/CSS/JS, no build step)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('\n⚠️  No ANTHROPIC_API_KEY found in .env - generation will fail until you add one.\n');
  }
  console.log(`Brand Engine running at http://localhost:${PORT}`);
});
