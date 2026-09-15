// netlify/functions/monthly-trend-background.js
// Phase 7c — MONTHLY per-market organic trend, the data behind the CEO's month-on-month
// tracker (impressions first, overall + per market). FREE: one GSC page-dimension pull per
// month, bucketed to markets by URL tokens (same attribution as the registry). Backfills
// ~13 months on first run (GSC retains ~16), then refreshes the most recent months weekly
// as their data matures. No DataForSEO, no paid crawl.
//
// Writes monthlyTrend:<brand> = { months:[{ month:'YYYY-MM',
//   total:{impressions,clicks,position}, byMarket:{ <marketKey>:{impressions,clicks,position} } }] }.
// Read via /api/page-registry?monthly=1&brand=<brand>. Config-driven (markets from accessors).

const { getStore } = require('@netlify/blobs');
const { getGscAccessToken, fetchGscPageOnly } = require('./_lib/gsc');
const { getMarketsForBrandAsync, getMarketPageTokens } = require('./_lib/international-config');
const { getBrandSlugs, gscPropertyFor } = require('./_lib/brands-config');
const { authorizeJob } = require('./_lib/auth');

const BACKFILL_MONTHS = 13; // first run: build this many months of history
const REFRESH_MONTHS  = 3;  // later runs: recompute the most recent N (recent GSC data matures)
const KEEP_MONTHS     = 18; // cap stored history

function monthKey(d) { return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
function monthRange(y, m) { // m is 0-based
  const start = new Date(Date.UTC(y, m, 1));
  const end   = new Date(Date.UTC(y, m + 1, 0)); // last day of month
  const today = new Date();
  const fmt = d => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end > today ? today : end) };
}
// URL → market (whole-segment token match; same rule as the registry / onpage crawl).
function urlMatchesTokens(url, tokens) {
  if (!url || !tokens || !tokens.length) return false;
  const p = String(url).replace(/^https?:\/\/[^\/]+/, '').toLowerCase();
  return tokens.some(t => p === `/${t}` || p === `/${t}/` || p.startsWith(`/${t}/`) || p.startsWith(`/${t}-`));
}
function attributeMarket(url, markets) {
  for (const [key, m] of Object.entries(markets)) { if (urlMatchesTokens(url, getMarketPageTokens(m))) return key; }
  return 'uae';
}

async function buildMonth(site, token, markets, y, m) {
  const { startDate, endDate } = monthRange(y, m);
  const { rows } = await fetchGscPageOnly(site, token, { startDate, endDate });
  const total = { impr: 0, clicks: 0, posw: 0 };
  const byMarket = {};
  for (const r of (rows || [])) {
    const mk = attributeMarket(r.page, markets);
    const b = byMarket[mk] || (byMarket[mk] = { impr: 0, clicks: 0, posw: 0 });
    b.impr += r.impressions; b.clicks += r.clicks; b.posw += r.position * r.impressions;
    total.impr += r.impressions; total.clicks += r.clicks; total.posw += r.position * r.impressions;
  }
  const fin = o => ({ impressions: o.impr, clicks: o.clicks, position: o.impr ? +(o.posw / o.impr).toFixed(1) : null });
  const bm = {}; for (const k in byMarket) bm[k] = fin(byMarket[k]);
  return { month: monthKey(new Date(Date.UTC(y, m, 1))), total: fin(total), byMarket: bm };
}

async function buildBrand(brand, store, token) {
  const tag = `[monthly/${brand}]`;
  const site = (await gscPropertyFor(brand)) || null;
  if (!site || !token) { console.warn(`${tag} no gsc`); return { error: 'no gsc' }; }
  const markets = await getMarketsForBrandAsync(brand);
  const prior = await store.get(`monthlyTrend:${brand}`, { type: 'json' }).catch(() => null);
  const now = new Date();
  const count = prior ? REFRESH_MONTHS : BACKFILL_MONTHS;
  const toBuild = [];
  for (let i = count - 1; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); toBuild.push([d.getUTCFullYear(), d.getUTCMonth()]); }

  const map = new Map((prior?.months || []).map(x => [x.month, x]));
  for (const [y, m] of toBuild) {
    try { const r = await buildMonth(site, token, markets, y, m); map.set(r.month, r); }
    catch (e) { console.warn(`${tag} ${y}-${m + 1} failed:`, e.message); }
  }
  const months = [...map.values()].sort((a, b) => (a.month < b.month ? -1 : 1)).slice(-KEEP_MONTHS);
  await store.set(`monthlyTrend:${brand}`, JSON.stringify({ brand, builtAt: new Date().toISOString(), months }));
  console.log(`${tag} ${months.length} months (${prior ? 'refresh' : 'backfill'}); latest ${months[months.length - 1]?.month} = ${months[months.length - 1]?.total.impressions} impr`);
  return { brand, months: months.length };
}

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };
  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
  const token = await getGscAccessToken(store);
  const qs = event.queryStringParameters || {};
  const brands = qs.brand ? [qs.brand] : await getBrandSlugs();
  const results = {};
  for (const brand of brands) {
    try { results[brand] = await buildBrand(brand, store, token); }
    catch (e) { console.error(`[monthly] ${brand} failed:`, e.message); results[brand] = { error: e.message }; }
  }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, gscConnected: !!token, results }) };
};
