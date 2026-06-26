// lib/anthropic.js
//
// Tiny wrapper so the rest of the app just calls `generate(...)`
// instead of dealing with the SDK directly.

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.MODEL || 'claude-sonnet-4-6';

async function generate(systemPrompt, userPrompt, maxTokens = 800) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    // Cache the system prompt block — POV + assets + examples are stable
    // between calls for the same brand. Cache hits cost ~10% of input price.
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  if (process.env.NODE_ENV !== 'production') {
    const u = response.usage;
    console.log(
      `[tokens] in:${u.input_tokens} cached_read:${u.cache_read_input_tokens ?? 0} cached_write:${u.cache_creation_input_tokens ?? 0} out:${u.output_tokens} max:${maxTokens}`
    );
  }

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

// P3: Compress a brand's POV fields into a single dense paragraph.
// Called async after POV is saved — doesn't block the save response.
// Result stored in brand_pov.pov_compiled and used in place of the raw fields.
async function compilePov(pov) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const fields = [
    pov.insights      && `Insights: ${pov.insights}`,
    pov.core_values   && `Values: ${pov.core_values}`,
    pov.beliefs       && `Beliefs: ${pov.beliefs}`,
    pov.taste         && `Taste: ${pov.taste}`,
    pov.judgement     && `Judgement: ${pov.judgement}`,
    pov.pov_statement && `POV: ${pov.pov_statement}`,
    pov.voice_rules   && `Voice rules: ${pov.voice_rules}`,
  ].filter(Boolean).join('\n');

  if (!fields) return null;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: `Compress the brand POV below into a single dense paragraph (max 150 words)
for use inside an AI system prompt. Start with "This brand". Capture the distinct
character, taste, and voice without generic filler. Output only the paragraph.`,
    messages: [{ role: 'user', content: fields }],
  });

  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

module.exports = { generate, compilePov };
