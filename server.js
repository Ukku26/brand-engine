// server.js
//
// This is the entry point. Run it with: npm start

require('dotenv').config();
const express = require('express');
const path = require('path');

const brandsRouter = require('./routes/brands');
const generateRouter = require('./routes/generate');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

// API routes
app.use('/api/brands', brandsRouter);
app.use('/api/brands', generateRouter);

// Frontend (plain HTML/CSS/JS, no build step)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('\n⚠️  No ANTHROPIC_API_KEY found in .env - generation will fail until you add one.\n');
  }
  console.log(`Brand Engine running at http://localhost:${PORT}`);
});
