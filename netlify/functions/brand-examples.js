// netlify/functions/brand-examples.js
// Store and retrieve brand voice examples for AI content generation.
// Pasted manually via Settings → Brand Voice Examples.
// Stored in Blobs under key 'brandExamples:pickl' and 'brandExamples:bonbird'.
//
// GET  /api/brand-examples?brand=pickl   — get stored examples
// POST /api/brand-examples               — save examples { brand, examples }

const { ok, bad, preflight, parseBody, getSetting, setSetting, CORS } = require('./_lib/store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  const brand = event.queryStringParameters?.brand || JSON.parse(event.body || '{}').brand;

  if (event.httpMethod === 'GET') {
    if (!brand || !['pickl', 'bonbird'].includes(brand)) {
      return bad(400, 'brand must be pickl or bonbird');
    }
    try {
      const data = await getSetting(`brandExamples:${brand}`).catch(() => null);
      return ok({ brand, examples: data?.examples || '' });
    } catch (e) {
      return bad(500, e.message);
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = parseBody(event) || {};
      const { brand: b, examples } = body;
      if (!b || !['pickl', 'bonbird'].includes(b)) {
        return bad(400, 'brand must be pickl or bonbird');
      }
      if (typeof examples !== 'string') {
        return bad(400, 'examples must be a string');
      }
      // Limit to ~50KB to avoid Blobs abuse
      if (examples.length > 50000) {
        return bad(400, 'Examples too long (max 50,000 characters). Trim to your best pieces.');
      }
      await setSetting(`brandExamples:${b}`, { brand: b, examples: examples.trim(), updatedAt: Date.now() });
      return ok({ saved: true, brand: b, chars: examples.length });
    } catch (e) {
      return bad(500, e.message);
    }
  }

  return bad(405, 'Method not allowed');
};
