// lib/anthropic.js
//
// Tiny wrapper so the rest of the app just calls `generate(...)`
// instead of dealing with the SDK directly.

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.MODEL || 'claude-sonnet-4-6';

async function generate(systemPrompt, userPrompt) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // response.content is an array of blocks; we just want the text ones.
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

module.exports = { generate };
