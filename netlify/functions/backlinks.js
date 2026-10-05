// netlify/functions/backlinks.js
// Backlink monitoring — read cached data and trigger manual refreshes.
//
// GET  ?brand=<slug>|all                — returns cached backlink data (+ history)
// POST { brand, action:'refresh' }      — fires backlinks-background for that brand
//
// All DataForSEO work lives in backlinks-background.js (live Backlinks endpoints).
// This file used to carry a second, dead copy of that code (task_post — an endpoint
// the Backlinks API doesn't have); removed.

const { getStore } = require('@netlify/blobs');
const { getBrand, getBrandSlugs } = require('./_lib/brands-config');

// ── Handler ───────────────────────────────────────────────────────────────────
const { authorize, denied, internalHeaders } = require('./_lib/auth');
exports.handler = async (event) => {
  if (event.httpMethod !== 'OPTIONS') { const _a = await authorize(event); if (!_a.ok) return denied(); }
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
      const brands     = brandParam === 'all' ? await getBrandSlugs() : [brandParam];
      const result     = {};

      for (const brand of brands) {
        try {
          const cached = await store.get(`backlinkData:${brand}`, { type: 'json' });
          const history = await store.get(`backlinkHistory:${brand}`, { type: 'json' });
          result[brand] = cached ? { ...cached, history: history || [] } : null;
        } catch {
          result[brand] = null;
        }
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // ── POST: trigger refresh ────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body   = JSON.parse(event.body || '{}');
      const brand  = body.brand;
      const action = body.action;

      if (action !== 'refresh') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
      }
      if (!brand || !(await getBrand(brand))) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid brand' }) };
      }

          // Background functions MUST be called at /.netlify/functions/<name> directly
      // (netlify.toml redirects do not apply to them). UI polls GET until fetchedAt changes.
      const base  = process.env.URL || 'http://localhost:8888';
      const bgUrl = `${base}/.netlify/functions/backlinks-background?brand=${brand}`;
      // MUST await — an un-awaited fetch is frozen when the function returns, so the
      // background invocation never fires. Awaiting resolves on the fast 202. MUST send
      // internalHeaders(): the job is gated by authorizeJob, and without them it 401'd.
      await fetch(bgUrl, { method: 'POST', headers: internalHeaders() }).catch(e => console.error('[backlinks] bg trigger failed:', e.message));

      return {
        statusCode: 202,
        headers,
        body: JSON.stringify({
          ok:      true,
          message: `Refresh started for ${brand} — poll GET /api/backlinks?brand=${brand} until fetchedAt updates`,
        }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[backlinks] Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
