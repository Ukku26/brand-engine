// lib/maxTokens.js
//
// Infers a reasonable max_tokens ceiling from the user's prompt.
// Avoids reserving 2,000 tokens for a one-line tagline request.
// The user can always override by passing a size hint in their prompt.

const RULES = [
  { pattern: /tagline|headline|slogan|subject line|title|one.?liner/i, tokens: 250 },
  { pattern: /tweet|caption|hook|teaser|short|brief/i,                 tokens: 400 },
  { pattern: /paragraph|intro|section|summary/i,                       tokens: 600 },
  { pattern: /email|newsletter|script|press release/i,                 tokens: 1200 },
  { pattern: /blog|article|essay|long.?form|full.?post/i,              tokens: 1800 },
];

const DEFAULT = 800;

function inferMaxTokens(prompt) {
  for (const { pattern, tokens } of RULES) {
    if (pattern.test(prompt)) return tokens;
  }
  return DEFAULT;
}

// When a platform spec is resolved, use it for precise token sizing
function inferMaxTokensFromSpec(spec) {
  const { content_type, size } = spec;

  if (['script', 'voiceover'].includes(content_type)) {
    const secs = parseSecs(size);
    if (secs) {
      // ~2.5 words/sec spoken; scripts add ~2x overhead for scene directions
      const multiplier = content_type === 'script' ? 2 : 1;
      return Math.min(2000, Math.round(secs * 2.5 * 1.4 * multiplier));
    }
  }

  if (size.includes('chars')) {
    const chars = parseInt(size.replace(/\D/g, ''), 10);
    return Math.min(1000, Math.round(chars / 4));
  }
  if (size.includes('words')) {
    const words = parseInt(size.replace(/\D/g, ''), 10);
    return Math.min(1000, Math.round(words * 1.4));
  }

  const fallback = { caption: 300, 'ad copy': 200, 'post copy': 500, headline: 100, description: 800 };
  return fallback[content_type] || DEFAULT;
}

function parseSecs(size) {
  const m = size.match(/(\d+)(min|s)/);
  if (!m) return null;
  return parseInt(m[1], 10) * (m[2] === 'min' ? 60 : 1);
}

module.exports = { inferMaxTokens, inferMaxTokensFromSpec };
