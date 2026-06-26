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

const MAX_ASSET_CHARS = 12000;
const MAX_BRAND_BOOK_CHARS = 8000;

const OBJECTIVE_INSTRUCTIONS = {
  reach: `CREATIVE OBJECTIVE: Maximise Reach
Write for the broadest possible audience. One idea, instantly understood. No CTA required. Prioritise stopping power and memorability over information density.`,

  awareness: `CREATIVE OBJECTIVE: Brand Awareness
Lead with emotion and storytelling. Build memory structures — link the brand to a feeling, a moment, or a truth. The brand should feel unmistakable, not generic. No hard sell. One clear idea, simply told.`,

  'mental-availability': `CREATIVE OBJECTIVE: Mental Availability
Link this brand to a specific category entry point or moment of need. "When you need X, think this brand." Not about features — about owning a mental space so the brand surfaces first at the moment of purchase.`,

  engagement: `CREATIVE OBJECTIVE: Drive Engagement
Write for social-native behaviour. The first line or frame must earn the scroll-stop. Invite reaction, spark a comment, give people a reason to share. Active voice, direct address, no passive tone. Feels like it belongs in the feed.`,

  'lead-gen': `CREATIVE OBJECTIVE: Lead Generation / Form Fill
Lead with the single most compelling benefit or offer. Simple language, one clear action. State the CTA plainly. Add urgency only where truthful. Remove anything that doesn't move the reader toward the action.`,

  conversion: `CREATIVE OBJECTIVE: Immediate Purchase / Conversion
Offer-first. Price, saving, or deadline prominent where relevant. No preamble, no storytelling. Single unambiguous CTA. Urgency and specificity over cleverness. Performance copy — measure it by the click.`,

  retention: `CREATIVE OBJECTIVE: Retention & Loyalty
Write as if to a customer who already chose this brand and made the right call. Warm, community-first tone. Acknowledge loyalty or reinforce their decision. Reward-focused where relevant. No hard sell.`,
};

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

// assets = top-2 brand assets (RAG filtered).
// ctx = { briefAssets: [], objective: null } — optional campaign-level context.
// pov.pov_compiled used when available (P3 compiled paragraph).
// pov.brand_book included as separate section when present.
function buildSystemPrompt(pov, assets, approvedExamples = [], spec = null, ctx = {}) {
  const { briefAssets = [], objective = null } = ctx;

  const brandAssetText = assets
    .map((a) => `### ${a.title}\n${a.content}`)
    .join('\n\n')
    .slice(0, MAX_ASSET_CHARS);

  const briefAssetText = briefAssets
    .map((a) => `### ${a.title}\n${a.content}`)
    .join('\n\n')
    .slice(0, MAX_ASSET_CHARS);

  // Use compiled POV paragraph if available; fall back to structured fields
  let povBlock;
  if (pov.pov_compiled) {
    povBlock = `BRAND POINT OF VIEW\n${pov.pov_compiled}`;
    if (pov.voice_rules) povBlock += `\n\nVOICE RULES\n${pov.voice_rules}`;
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

  const brandBookBlock = pov.brand_book && pov.brand_book.trim()
    ? `BRAND BOOK & GUIDELINES\n${pov.brand_book.trim().slice(0, MAX_BRAND_BOOK_CHARS)}`
    : '';

  const examplesBlock = approvedExamples.length > 0
    ? `APPROVED EXAMPLES (calibrate tone and quality against these)\n${
        approvedExamples
          .map((ex, i) => `Example ${i + 1}\nRequest: ${ex.prompt}\nApproved output: ${ex.output}`)
          .join('\n\n')
      }`
    : '';

  const objectiveBlock = objective && OBJECTIVE_INSTRUCTIONS[objective]
    ? OBJECTIVE_INSTRUCTIONS[objective]
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
    brandBookBlock,
    brandAssetText && `BRAND ASSETS\n${brandAssetText}`,
    briefAssetText && `CAMPAIGN REFERENCE MATERIAL\n${briefAssetText}`,
    examplesBlock,
    objectiveBlock,
    specInstruction && `CONTENT SPECIFICATION — FOLLOW EXACTLY\n${specInstruction}`,
    `When you respond, produce only the requested creative output - no
preamble explaining what you're about to do, unless the user's request
specifically asks for an explanation.`,
  ].filter(Boolean).join('\n\n');

  return parts;
}

module.exports = { buildSystemPrompt };
