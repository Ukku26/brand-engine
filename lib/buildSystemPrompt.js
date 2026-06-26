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

// Exact deliverable instructions keyed by content_type.
// These are injected as hard constraints so Claude knows exactly what to produce
// without the user needing to describe format, length, or structure in their prompt.
const SPEC_INSTRUCTIONS = {
  script: (spec) => {
    const secs = parseDurSecs(spec.size);
    const words = secs ? Math.round(secs * 2.5) : null;
    return [
      `Write a VIDEO SCRIPT for this exact specification:`,
      `  Platform: ${cap(spec.platform)} · Placement: ${cap(spec.placement)}`,
      `  Dimensions: ${spec.dimensions} · Duration: ${spec.size_label}`,
      words ? `  Spoken word budget: ~${words} words at natural pace (2.5 words/sec)` : '',
      ``,
      `FORMAT YOUR SCRIPT AS:`,
      `  [Scene description in square brackets]`,
      `  ON-SCREEN TEXT IN CAPS`,
      `  Voiceover: spoken words on their own line`,
      ``,
      `Do not exceed the duration. Every second counts.`,
    ].filter((l) => l !== null).join('\n');
  },

  voiceover: (spec) => {
    const secs = parseDurSecs(spec.size);
    const words = secs ? Math.round(secs * 2.5) : null;
    return [
      `Write a VOICEOVER SCRIPT only — no scene directions, no visual notes.`,
      `  Platform: ${cap(spec.platform)} · Placement: ${cap(spec.placement)} · Duration: ${spec.size_label}`,
      words ? `  Word budget: ~${words} words at natural speaking pace (2.5 words/sec)` : '',
      `Output only the spoken words, nothing else.`,
    ].filter(Boolean).join('\n');
  },

  caption: (spec) => [
    `Write a SOCIAL MEDIA CAPTION.`,
    `  Platform: ${cap(spec.platform)} · Placement: ${cap(spec.placement)} · Max length: ${spec.size_label}`,
    `  Use line breaks for readability. Do not add hashtags unless specifically asked.`,
  ].join('\n'),

  'ad copy': (spec) => [
    `Write AD COPY optimised for paid placement.`,
    `  Platform: ${cap(spec.platform)} · Placement: ${cap(spec.placement)}`,
    spec.dimensions !== '—' ? `  Dimensions: ${spec.dimensions} · ` : `  `,
    `Max length: ${spec.size_label}`,
    `  Lead with the benefit. End with a clear call to action. Be direct — every word pays.`,
  ].filter(Boolean).join('\n'),

  'post copy': (spec) => [
    `Write ORGANIC POST COPY.`,
    `  Platform: ${cap(spec.platform)} · Placement: ${cap(spec.placement)} · Max length: ${spec.size_label}`,
    `  Natural, non-promotional tone. Write for the feed, not an ad break.`,
  ].join('\n'),

  headline: (spec) => [
    `Write a SHORT HEADLINE or title.`,
    `  Platform: ${cap(spec.platform)} · Placement: ${cap(spec.placement)}`,
    spec.dimensions !== '—' ? `  Dimensions: ${spec.dimensions}` : '',
    `  Aim for under 10 words. Punchy, specific, on-brand.`,
  ].filter(Boolean).join('\n'),

  description: (spec) => [
    `Write a PLATFORM DESCRIPTION.`,
    `  Platform: ${cap(spec.platform)} · Placement: ${cap(spec.placement)} · Max length: ${spec.size_label}`,
    `  Include relevant keywords naturally. Use short paragraphs.`,
  ].join('\n'),
};

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function parseDurSecs(size) {
  const m = size && size.match(/(\d+)(min|s)/);
  if (!m) return null;
  return parseInt(m[1], 10) * (m[2] === 'min' ? 60 : 1);
}

// approvedExamples moved here from the user turn so they benefit from prompt caching.
// assets should already be pre-filtered to the most relevant ones via RAG (tfidf.js).
// pov.pov_compiled (P3) is used when available — it's a single dense paragraph
// produced by Claude and ~30% shorter than the raw labelled fields.
// spec (optional) is a resolved platform_specs row — injects hard format constraints.
function buildSystemPrompt(pov, assets, approvedExamples = [], spec = null) {
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

  const specInstruction = spec && SPEC_INSTRUCTIONS[spec.content_type]
    ? SPEC_INSTRUCTIONS[spec.content_type](spec)
    : null;

  const parts = [
    `You are generating creative content on behalf of a specific brand.
Stay fully within this brand's point of view - do not default to generic,
neutral, or "safe" creative choices. The whole point is that this brand
has a distinct taste and judgement, and your output should reflect that.`,
    povBlock,
    assetText && `BRAND REFERENCE MATERIAL\n${assetText}`,
    examplesBlock,
    specInstruction && `CONTENT SPECIFICATION — FOLLOW EXACTLY\n${specInstruction}`,
    `When you respond, produce only the requested creative output - no
preamble explaining what you're about to do, unless the user's request
specifically asks for an explanation.`,
  ].filter(Boolean).join('\n\n');

  return parts;
}

module.exports = { buildSystemPrompt };
