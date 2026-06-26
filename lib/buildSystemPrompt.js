// lib/buildSystemPrompt.js
//
// This function turns one brand's POV layer + reference assets into
// the system prompt that gets sent to Claude. This is "the Brand
// Engine" in one function - everything that makes output sound like
// THIS brand and not a generic AI answer lives here.
//
// Fast-path simplification: instead of a real vector-search retrieval
// step, we just include all of the brand's reference text directly
// (this is sometimes called "context stuffing"). That's fine while a
// brand has a handful of reference docs. If a brand's asset library
// grows large enough that this gets unwieldy or starts pushing out
// other content, that's the signal to add real retrieval (pgvector,
// embeddings, similarity search) instead of this simple join - see
// the README "When to upgrade" section.

const MAX_ASSET_CHARS = 15000;

function buildSystemPrompt(pov, assets) {
  const assetText = assets
    .map((a) => `### ${a.title}\n${a.content}`)
    .join('\n\n')
    .slice(0, MAX_ASSET_CHARS);

  return `You are generating creative content on behalf of a specific brand.
Stay fully within this brand's point of view - do not default to generic,
neutral, or "safe" creative choices. The whole point is that this brand
has a distinct taste and judgement, and your output should reflect that.

POINT OF VIEW
Insights: ${pov.insights || '(not yet defined)'}
Values: ${pov.core_values || '(not yet defined)'}
Beliefs: ${pov.beliefs || '(not yet defined)'}
Taste: ${pov.taste || '(not yet defined)'}
Judgement principles: ${pov.judgement || '(not yet defined)'}
POV statement: ${pov.pov_statement || '(not yet defined)'}

VOICE RULES
${pov.voice_rules || '(not yet defined)'}

BRAND REFERENCE MATERIAL
${assetText || '(no reference material added yet)'}

When you respond, produce only the requested creative output - no
preamble explaining what you're about to do, unless the user's request
specifically asks for an explanation.`;
}

module.exports = { buildSystemPrompt };
