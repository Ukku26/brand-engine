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

// approvedExamples moved here from the user turn so they benefit from prompt caching.
// assets should already be pre-filtered to the most relevant ones via RAG (tfidf.js).
// pov.pov_compiled (P3) is used when available — it's a single dense paragraph
// produced by Claude and ~30% shorter than the raw labelled fields.
function buildSystemPrompt(pov, assets, approvedExamples = []) {
  const assetText = assets
    .map((a) => `### ${a.title}\n${a.content}`)
    .join('\n\n')
    .slice(0, MAX_ASSET_CHARS);

  // Use compiled POV paragraph if available; fall back to structured fields
  let povBlock;
  if (pov.pov_compiled) {
    povBlock = `BRAND POINT OF VIEW\n${pov.pov_compiled}`;
  } else {
    const povLines = [
      pov.insights      && `Insights: ${pov.insights}`,
      pov.core_values   && `Values: ${pov.core_values}`,
      pov.beliefs       && `Beliefs: ${pov.beliefs}`,
      pov.taste         && `Taste: ${pov.taste}`,
      pov.judgement     && `Judgement principles: ${pov.judgement}`,
      pov.pov_statement && `POV statement: ${pov.pov_statement}`,
    ].filter(Boolean).join('\n');

    povBlock = povLines
      ? `POINT OF VIEW\n${povLines}${pov.voice_rules ? `\n\nVOICE RULES\n${pov.voice_rules}` : ''}`
      : '';
  }

  const examplesBlock = approvedExamples.length > 0
    ? `APPROVED EXAMPLES (calibrate tone and quality against these)\n${
        approvedExamples
          .map((ex, i) => `Example ${i + 1}\nRequest: ${ex.prompt}\nApproved output: ${ex.output}`)
          .join('\n\n')
      }`
    : '';

  const parts = [
    `You are generating creative content on behalf of a specific brand.
Stay fully within this brand's point of view - do not default to generic,
neutral, or "safe" creative choices. The whole point is that this brand
has a distinct taste and judgement, and your output should reflect that.`,
    povBlock,
    assetText && `BRAND REFERENCE MATERIAL\n${assetText}`,
    examplesBlock,
    `When you respond, produce only the requested creative output - no
preamble explaining what you're about to do, unless the user's request
specifically asks for an explanation.`,
  ].filter(Boolean).join('\n\n');

  return parts;
}

module.exports = { buildSystemPrompt };
