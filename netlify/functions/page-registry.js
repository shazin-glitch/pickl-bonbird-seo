// netlify/functions/page-registry.js
// Read/refresh the live-page registry (Phase 1). GET returns the stored
// pageRegistry:<brand>; POST fires page-registry-background to rebuild it.
//   GET  ?brand=bonbird            → { brand, domain, builtAt, summary, pages:[...] }
//   POST { brand }                 → triggers a rebuild (background), returns 202
// Gated (rule #11): the registry lists our full live-page footprint — not public.

const { getStore } = require('@netlify/blobs');
const { authorize, denied, internalHeaders } = require('./_lib/auth');

const SITE = process.env.URL || process.env.NETLIFY_URL || 'https://yolkseo.netlify.app';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const auth = await authorize(event);
  if (!auth.ok) return denied();

  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

  if (event.httpMethod === 'GET') {
    const brand = (event.queryStringParameters || {}).brand || 'pickl';
    const data = await store.get(`pageRegistry:${brand}`, { type: 'json' }).catch(() => null);
    if (!data) return json(200, { brand, pages: [], summary: {}, builtAt: null, note: 'not built yet — POST to build' });
    return json(200, data);
  }

  if (event.httpMethod === 'POST') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
    const brand = body.brand || 'pickl';
    // Fire the background builder (returns 202); don't await its full run.
    fetch(`${SITE}/.netlify/functions/page-registry-background?brand=${encodeURIComponent(brand)}`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }), body: '{}',
    }).catch(e => console.error('[page-registry] failed to fire builder:', e.message));
    return json(202, { ok: true, building: brand });
  }

  return json(405, { error: 'Method Not Allowed' });
};
