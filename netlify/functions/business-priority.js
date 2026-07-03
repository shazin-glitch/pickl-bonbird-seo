// netlify/functions/business-priority.js
// Stores the human "business judgment" input that the SEO opportunity engine can't
// infer: which products/terms and which markets matter commercially. The keyword
// worklist re-weights by this, so it points at what makes money — not just raw SEO
// opportunity. Per-brand config in Blobs (scalable, #12): adding a brand/market needs
// no code change; a neutral default (no config) leaves scoring unchanged.
//
//   GET  ?brand=pickl              → { products:[...], markets:[...], growthNote, updatedAt }
//   POST { brand, products, markets, growthNote }  → save (admin/manager)

const { getStore } = require('@netlify/blobs');
const { authorize, denied } = require('./_lib/auth');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const KEY = (brand) => `businessPriority:${brand}`;
const EMPTY = { products: [], markets: [], growthNote: '', updatedAt: null };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const auth = await authorize(event);
  if (!auth.ok) return denied();

  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
  const qs    = event.queryStringParameters || {};

  if (event.httpMethod === 'GET') {
    const brand = qs.brand || 'pickl';
    const cfg = await store.get(KEY(brand), { type: 'json' }).catch(() => null);
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(cfg || EMPTY) };
  }

  if (event.httpMethod === 'POST') {
    // Only session users with manager/admin role may change business priorities.
    if (auth.via === 'session' && !['admin', 'manager'].includes(auth.user?.role)) {
      return { statusCode: 403, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Manager or admin only' }) };
    }
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
    const brand = body.brand || 'pickl';
    const clean = (arr) => Array.isArray(arr) ? [...new Set(arr.map(s => String(s || '').trim().toLowerCase()).filter(Boolean))].slice(0, 40) : [];
    const cfg = {
      products:   clean(body.products),
      markets:    clean(body.markets),
      growthNote: String(body.growthNote || '').slice(0, 500),
      updatedAt:  new Date().toISOString(),
    };
    await store.set(KEY(brand), JSON.stringify(cfg));
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, ...cfg }) };
  }

  return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
