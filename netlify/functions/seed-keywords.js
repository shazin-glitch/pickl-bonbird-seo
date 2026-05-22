// netlify/functions/seed-keywords.js
// Manages seed keyword lists per brand, stored in Netlify Blobs.
// These are manually curated keywords (non-branded, competitor terms etc.)
// that don't appear in GSC because we don't rank for them yet.
//
// GET  ?brand=pickl|bonbird|all  — returns seed keywords
// POST { brand, keywords[] }     — save full list
// DELETE { brand, keyword }      — remove one keyword

const { getStore } = require('@netlify/blobs');

const SEED_KEY_PREFIX = 'seedKeywords:';

const DEFAULT_SEEDS = {
  pickl: [
    // High-value non-branded terms Pickl should own
    'best burger in dubai', 'best smash burger dubai', 'smash burger uae',
    'best burger abu dhabi', 'best burger sharjah', 'best burger near me dubai',
    'chicken sandwich dubai', 'best chicken burger dubai', 'hot dog dubai',
    'best fast food dubai', 'burger delivery dubai', 'smash burger delivery dubai',
    'best burger jbr', 'best burger city walk', 'best burger jlt',
    'plant based burger dubai', 'best fries dubai', 'loaded fries dubai',
    'best burger restaurant dubai', 'burger places dubai',
  ],
  bonbird: [
    // High-value non-branded terms Bonbird should own
    'best fried chicken dubai', 'crispy fried chicken dubai', 'fried chicken uae',
    'best fried chicken abu dhabi', 'fried chicken delivery dubai',
    'best chicken restaurant dubai', 'crispy chicken uae', 'chicken tenders dubai',
    'best chicken wrap dubai', 'chicken rice bowl dubai',
    'best fried chicken near me dubai', 'fried chicken motor city',
    'best fried chicken sharjah', 'chicken burger dubai',
    'fresh fried chicken dubai', 'korean fried chicken dubai',
    'best chicken sandwich dubai', 'fried chicken restaurant dubai',
  ],
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  try {
    // ── GET ────────────────────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const brandParam = event.queryStringParameters?.brand || 'all';
      const brands     = brandParam === 'all' ? ['pickl', 'bonbird'] : [brandParam];
      const result     = {};

      for (const brand of brands) {
        try {
          const stored = await store.get(`${SEED_KEY_PREFIX}${brand}`, { type: 'json' });
          result[brand] = {
            keywords:  stored?.keywords || DEFAULT_SEEDS[brand] || [],
            isDefault: !stored?.keywords,
            updatedAt: stored?.updatedAt || null,
          };
        } catch {
          result[brand] = { keywords: DEFAULT_SEEDS[brand] || [], isDefault: true, updatedAt: null };
        }
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // ── POST: save full list ───────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body     = JSON.parse(event.body || '{}');
      const brand    = body.brand;
      const keywords = body.keywords;

      if (!brand || !DEFAULT_SEEDS[brand]) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid brand' }) };
      }
      if (!Array.isArray(keywords)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'keywords must be an array' }) };
      }

      const cleaned = [...new Set(
        keywords.map(k => k.trim().toLowerCase()).filter(Boolean)
      )];

      await store.set(`${SEED_KEY_PREFIX}${brand}`, JSON.stringify({
        brand,
        keywords: cleaned,
        updatedAt: new Date().toISOString(),
      }));

      return { statusCode: 200, headers, body: JSON.stringify({ brand, keywords: cleaned, count: cleaned.length }) };
    }

    // ── DELETE: remove one keyword ─────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const body    = JSON.parse(event.body || '{}');
      const brand   = body.brand;
      const keyword = body.keyword?.trim().toLowerCase();

      if (!brand || !keyword) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'brand and keyword required' }) };
      }

      let existing = DEFAULT_SEEDS[brand] || [];
      try {
        const stored = await store.get(`${SEED_KEY_PREFIX}${brand}`, { type: 'json' });
        if (stored?.keywords) existing = stored.keywords;
      } catch { /* use defaults */ }

      const updated = existing.filter(k => k !== keyword);
      await store.set(`${SEED_KEY_PREFIX}${brand}`, JSON.stringify({
        brand,
        keywords: updated,
        updatedAt: new Date().toISOString(),
      }));

      return { statusCode: 200, headers, body: JSON.stringify({ brand, removed: keyword, remaining: updated.length }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[seed-keywords] Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
