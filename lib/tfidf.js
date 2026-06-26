// lib/tfidf.js
//
// Lightweight local RAG — no external embedding API needed.
// Uses TF (term frequency) vectors + cosine similarity to find
// the most relevant assets for a given prompt.
//
// Good enough for a brand with dozens of reference docs. If the library
// grows into hundreds of long docs and relevance starts to miss, that's
// the signal to switch to a real embedding model (see README "When to upgrade").

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2); // skip very short words
}

function termFreq(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  return tf;
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (const k of Object.keys(a)) {
    if (b[k]) dot += a[k] * b[k];
    magA += a[k] ** 2;
  }
  for (const v of Object.values(b)) magB += v ** 2;
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Call this when an asset is saved — store the result as JSON in `embedding`
function buildEmbedding(text) {
  return JSON.stringify(termFreq(tokenize(text)));
}

// Returns the topN most relevant assets for a prompt.
// Falls back to all assets if fewer than topN exist or none have embeddings.
function topAssets(promptText, assets, topN = 2) {
  if (assets.length <= topN) return assets;

  const queryTF = termFreq(tokenize(promptText));
  const scored = assets.map((a) => {
    const vec = a.embedding ? JSON.parse(a.embedding) : {};
    return { ...a, _score: cosineSimilarity(queryTF, vec) };
  });

  // If everything scored 0 (no overlap), return the most recent topN
  const allZero = scored.every((a) => a._score === 0);
  if (allZero) return assets.slice(0, topN);

  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, topN);
}

module.exports = { buildEmbedding, topAssets };
