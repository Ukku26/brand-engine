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

const DEFAULT = 800; // down from the original 2000

function inferMaxTokens(prompt) {
  for (const { pattern, tokens } of RULES) {
    if (pattern.test(prompt)) return tokens;
  }
  return DEFAULT;
}

module.exports = { inferMaxTokens };
