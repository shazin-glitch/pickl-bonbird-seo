// netlify/functions/market-planner-background.js
// Builds a Market Planner plan (the Claude clustering call is too slow for the
// synchronous function limit → do it here, 15-min budget). Stores the result at
// marketPlan:<brand>:<market>; the sync /api/market-planner action:'get' polls it.
// NOT scheduled (so it's HTTP-invocable — Netlify 403s scheduled fns). See rule 7:
// must be called at /.netlify/functions/market-planner-background directly.

const { getStore } = require('@netlify/blobs');
const { authorizeJob, internalHeaders } = require('./_lib/auth');
const { buildMarketPlan } = require('./_lib/market-planner');

function store() {
  return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}
const KEY = (b, m) => `marketPlan:${b}:${m || 'uae'}`;

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };

  const qs = event.queryStringParameters || {};
  let brand, market;
  try { const b = JSON.parse(event.body || '{}'); brand = b.brand || qs.brand; market = b.market || qs.market; }
  catch { brand = qs.brand; market = qs.market; }
  if (!brand) return { statusCode: 400, body: JSON.stringify({ error: 'brand required' }) };

  const key = KEY(brand, market);
  console.log(`[market-planner-bg] building ${key}`);
  try {
    // verifyTargets: resolve every meta_update target read-only so dead pre-rebuild
    // URLs from GSC history don't dilute the launch set (v7.9.28). Safe here — the
    // background fn has a 15-min budget; the sync API never would.
    const plan = await buildMarketPlan({
      brand, market,
      verifyTargets: true,
      site: process.env.URL || 'https://yolkseo.netlify.app',
      headers: internalHeaders(),
    });   // includes the Claude clustering call
    await store().setJSON(key, { ...plan, status: 'ready', builtAt: Date.now() });
    console.log(`[market-planner-bg] ${key} ready — ${plan.total} items (mode ${plan.mode})`);
  } catch (e) {
    console.error(`[market-planner-bg] ${key} failed:`, e.message);
    await store().setJSON(key, { brand, market: market || 'uae', status: 'error', error: e.message, builtAt: Date.now() }).catch(() => {});
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
