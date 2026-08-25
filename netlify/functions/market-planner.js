// netlify/functions/market-planner.js
// /api/market-planner — Market Planner API (see /MARKET-PLANNER-PLAN.md).
// The plan build runs a Claude clustering call too slow for the synchronous function
// limit, so it's async: 'plan' fires the background worker + returns 202; 'get' polls
// the stored plan. Gated (returns non-public strategy data). P3 adds 'execute'.

const { authorize, denied, internalHeaders } = require('./_lib/auth');
const { getStore } = require('@netlify/blobs');

function store() {
  return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}
const KEY = (b, m) => `marketPlan:${b}:${m || 'uae'}`;
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status, body) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const a = await authorize(event);
  if (!a.ok) return denied();

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const action = body.action || 'get';
  const brand  = body.brand;
  const market = body.market;
  if (!brand) return json(400, { error: 'brand is required' });
  const key = KEY(brand, market);

  // ── Kick off a build (background — the Claude call is too slow for sync). ──
  if (action === 'plan') {
    // Don't double-fire: if a build started < 3 min ago, just report building.
    const existing = await store().get(key, { type: 'json' }).catch(() => null);
    if (existing && existing.status === 'building' && (Date.now() - (existing.startedAt || 0) < 3 * 60 * 1000)) {
      return json(200, { status: 'building', startedAt: existing.startedAt });
    }
    await store().setJSON(key, { brand, market: market || 'uae', status: 'building', startedAt: Date.now() });
    const base = process.env.URL || 'https://yolkseo.netlify.app';
    try {
      await fetch(`${base}/.netlify/functions/market-planner-background`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ brand, market }),
      });
    } catch (e) { console.warn('[market-planner] bg trigger failed:', e.message); }
    return json(202, { status: 'building' });
  }

  // ── Poll the stored plan. ──
  if (action === 'get') {
    const p = await store().get(key, { type: 'json' }).catch(() => null);
    return json(200, p || { status: 'none' });
  }

  // action:'execute' arrives in P3.
  return json(400, { error: `unknown or not-yet-implemented action: ${action}` });
};
