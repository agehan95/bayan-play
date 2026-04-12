const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const https = require('https');

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

exports.generateQuestions = onCall(
  { secrets: [anthropicKey] },
  async (request) => {
    const { sourceText, config } = request.data;
    const { count = 10, type = 'mixed', difficulty = 'medium' } = config || {};

    if (!sourceText) throw new HttpsError('invalid-argument', 'sourceText is required');

    const prompt = `You are a quiz question generator for an Islamic studies and Arabic teaching platform.

Generate exactly ${count} questions from the following source material.
Question type: ${type} (mc = multiple choice with 4 options, tf = true/false, mixed = both)
Difficulty: ${difficulty}

For each question return a JSON object with these exact fields:
- text: the question string
- type: "mc" or "tf"
- options: array of answer strings (4 for mc, exactly ["True","False"] for tf)
- correct_index: 0-based index of correct answer
- difficulty: "easy", "medium", or "hard"
- excerpt: the exact sentence from the source this question is based on (1-2 sentences max)

Return ONLY a valid JSON array. No markdown, no backticks, no explanation, no preamble. Start with [ and end with ].

Source material:
---
${sourceText.slice(0, 10000)}
---`;

    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    // Use native https module — guaranteed available in Node.js
    const responseText = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey.value(),
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    console.log('Anthropic raw response (first 500 chars):', responseText.slice(0, 500));

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse Anthropic response:', responseText.slice(0, 1000));
      throw new HttpsError('internal', 'Anthropic API returned invalid JSON');
    }

    if (parsed.error) {
      console.error('Anthropic API error:', parsed.error);
      throw new HttpsError('internal', `Anthropic error: ${parsed.error.message || parsed.error.type}`);
    }

    const text = parsed.content?.[0]?.text || '';
    console.log('Claude text response (first 500 chars):', text.slice(0, 500));

    if (!text) {
      throw new HttpsError('internal', 'Claude returned empty response');
    }

    // Strip any accidental markdown fences
    const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let questions;
    try {
      questions = JSON.parse(clean);
    } catch (e) {
      console.error('Failed to parse Claude questions JSON:', clean.slice(0, 500));
      throw new HttpsError('internal', 'Failed to parse generated questions — Claude returned non-JSON text');
    }

    if (!Array.isArray(questions)) {
      throw new HttpsError('internal', 'Claude response was not an array');
    }

    console.log(`Successfully generated ${questions.length} questions`);
    return { questions };
  }
);