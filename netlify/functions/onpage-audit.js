// netlify/functions/onpage-audit.js
// Read endpoint for the OnPage crawler (Phase 2).
//   GET  ?brand=pickl            → { audit, inventorySummary }   (gated read)
//   GET  ?brand=pickl&pages=1    → also include the full page inventory
//   POST { brand, maxPages }     → fire onpage-audit-background as a true bg job
// Non-public data (site audit + page inventory) → gated. OPTIONS bypassed for CORS.

const { getStore } = require('@netlify/blobs');
const { authorize, denied, internalHeaders } = require('./_lib/auth');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const _a = await authorize(event);
  if (!_a.ok) return denied();

  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
  const qs    = event.queryStringParameters || {};
  const brand = qs.brand || 'pickl';

  if (event.httpMethod === 'GET') {
    const audit     = await store.get(`onpageAudit:${brand}`, { type: 'json' }).catch(() => null);
    const inventory = await store.get(`pageInventory:${brand}`, { type: 'json' }).catch(() => null);
    const body = {
      brand,
      audit: audit || null,
      inventorySummary: inventory ? { crawledAt: inventory.crawledAt, totalPages: inventory.pages?.length || 0 } : null,
      pages: qs.pages ? (inventory?.pages || []) : undefined,
    };
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }

  if (event.httpMethod === 'POST') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { /* ignore */ }
    const b  = body.brand || 'pickl';
    const mp = body.maxPages ? `&maxPages=${parseInt(body.maxPages, 10)}` : '';
    // fire-and-forget the background crawl (background fns must be hit at their direct path)
    fetch(`${SITE_URL}/.netlify/functions/onpage-audit-background?brand=${b}${mp}`, { headers: internalHeaders() }).catch(() => {});
    return { statusCode: 202, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, message: 'Crawl started', brand: b }) };
  }

  return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
