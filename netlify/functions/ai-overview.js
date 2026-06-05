// netlify/functions/ai-overview.js
// AI Overview Visibility — read cached data and trigger manual refresh.
//
// GET ?brand=pickl|bonbird|all  — returns cached data + 12-week history
// POST { brand, action:'refresh' } — fires background function, returns 202 immediately
//
// UI polls GET after POST until checkedAt timestamp changes.

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  try {
    // ── GET: return cached data ──────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const brandParam = event.queryStringParameters?.brand || 'all';
      const brands     = brandParam === 'all' ? ['pickl', 'bonbird'] : [brandParam];
      const result     = {};

      for (const brand of brands) {
        const [data, history] = await Promise.all([
          store.get(`aiOverviewData:${brand}`,    { type: 'json' }).catch(() => null),
          store.get(`aiOverviewHistory:${brand}`, { type: 'json' }).catch(() => null),
        ]);
        result[brand] = { data: data || [], history: history || [] };
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // ── POST: trigger background refresh ────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body   = JSON.parse(event.body || '{}');
      const brand  = body.brand;
      const action = body.action;

      if (action !== 'refresh') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
      }
      if (!brand || !['pickl', 'bonbird'].includes(brand)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid brand' }) };
      }

      // Fire background function — returns 202 immediately, runs up to 15 min
      const base  = process.env.URL || 'http://localhost:8888';
      const bgUrl = `${base}/.netlify/functions/ai-overview-background?brand=${brand}`;
      fetch(bgUrl).catch(e => console.error('[ai-overview] bg trigger failed:', e.message));

      return {
        statusCode: 202,
        headers,
        body: JSON.stringify({
          ok:      true,
          message: `Check started for ${brand} — poll GET /api/ai-overview?brand=${brand} every 30s for results`,
        }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[ai-overview] Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
