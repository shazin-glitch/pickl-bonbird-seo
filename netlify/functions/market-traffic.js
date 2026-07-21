// netlify/functions/market-traffic.js
// Per-market organic traffic from GSC — the "is SEO working, per market" view.
// One GSC property covers all markets, so we pull per page and attribute each page
// to its market (shared marketForUrl), then aggregate per market.
//
// METHODOLOGY (locked — see _lib/gsc.js):
//   • TOTAL per market  = PAGE-ONLY dimension (accurate; GSC drops no rows).
//   • BRANDED / NON-BRANDED split = PAGE+QUERY dimension, classified by isBrandedQuery.
//     This undercounts (GSC anonymizes rare queries) so it is NEVER used for Total —
//     only for the branded-vs-nonbranded breakdown. Non-branded is the real SEO KPI;
//     branded is awareness context.
// Both pulls run in parallel over the same date window.
//
//   GET ?brand=pickl&startDate=2026-06-01&endDate=2026-06-30
//     → { brand, range:{startDate,endDate}, markets:[{ key,label,flag,
//           total:{clicks,impressions,avgPosition,pages},
//           branded:{...}, nonBranded:{...} }], totals:{total,branded,nonBranded}, updatedAt }
//   Falls back to the last 28 days when no dates are supplied.

const { getStore } = require('@netlify/blobs');
const { getGscAccessToken, fetchGscPageOnly, fetchGscPageQuery } = require('./_lib/gsc');
const { INTERNATIONAL_MARKETS, marketForUrl, getMarketsMapAsync, marketForUrlAsync } = require('./_lib/international-config');
const { getBrandContext, isBrandedQuery } = require('./_lib/brand');
const { authorize, denied } = require('./_lib/auth');
const { gscPropertyFor } = require('./_lib/brands-config');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const json = (statusCode, body) => ({ statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const auth = await authorize(event);
  if (!auth.ok) return denied();

  const qs    = event.queryStringParameters || {};
  const brand = qs.brand || 'pickl';
  const site  = await gscPropertyFor(brand);
  if (!site) return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Unknown brand: ${brand}` }) };

  // Date window: explicit range wins (both must be valid YYYY-MM-DD), else last 28 days.
  const hasRange = DATE_RE.test(qs.startDate || '') && DATE_RE.test(qs.endDate || '');
  const window   = hasRange ? { startDate: qs.startDate, endDate: qs.endDate } : { days: 28 };

  try {
    const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const token = await getGscAccessToken(store);
    if (!token) return json(200, { brand, markets: [], totals: null, error: 'GSC not connected' });

    // Brand context drives the branded-term classifier (config-driven, scalable).
    const brandCtx = await getBrandContext(brand).catch(() => ({ brand }));

    // Two pulls in parallel: page-only (accurate Total) + page+query (branded split).
    const [pageOnly, pageQuery] = await Promise.all([
      fetchGscPageOnly(site, token, window),
      fetchGscPageQuery(site, token, window),
    ]);
    if (pageOnly.error)  return json(200, { brand, markets: [], totals: null, error: pageOnly.error });
    if (pageQuery.error) return json(200, { brand, markets: [], totals: null, error: pageQuery.error });

    // Per-market, per-segment accumulators. seg: total | branded | nonBranded.
    const blank = () => ({ clicks: 0, impressions: 0, posWeighted: 0, pages: new Set() });
    const agg = {}; // key → { total, branded, nonBranded }
    const seed = (k) => { if (!agg[k]) agg[k] = { total: blank(), branded: blank(), nonBranded: blank() }; };
    seed('uae');
    const intlMarketsMap = await getMarketsMapAsync();
    for (const [key, m] of Object.entries(intlMarketsMap)) if (m.brand === brand) seed(key);

    const add = (bucket, r) => {
      bucket.clicks      += r.clicks || 0;
      bucket.impressions += r.impressions || 0;
      bucket.posWeighted += (r.position || 0) * (r.impressions || 0); // impression-weighted avg pos
      if (r.page) bucket.pages.add(r.page);
    };

    // TOTAL — from the accurate page-only pull.
    for (const r of (pageOnly.rows || [])) {
      const key = await marketForUrlAsync(r.page, brand);
      seed(key);
      add(agg[key].total, r);
    }

    // BRANDED / NON-BRANDED — from the page+query pull, classified per query.
    for (const r of (pageQuery.rows || [])) {
      const key = await marketForUrlAsync(r.page, brand);
      seed(key);
      add(isBrandedQuery(r.keyword, brandCtx) ? agg[key].branded : agg[key].nonBranded, r);
    }

    const finalize = (b) => ({
      clicks: b.clicks,
      impressions: b.impressions,
      avgPosition: b.impressions ? Math.round((b.posWeighted / b.impressions) * 10) / 10 : null,
      pages: b.pages.size,
    });
    const label = (k) => k === 'uae' ? 'UAE' : (intlMarketsMap[k]?.label || k);
    const flag  = (k) => k === 'uae' ? '🇦🇪' : (intlMarketsMap[k]?.flag || '🌍');

    const markets = Object.entries(agg).map(([key, a]) => ({
      key, label: label(key), flag: flag(key),
      total:      finalize(a.total),
      branded:    finalize(a.branded),
      nonBranded: finalize(a.nonBranded),
    })).sort((x, y) => y.total.clicks - x.total.clicks || y.total.impressions - x.total.impressions);

    const sumSeg = (seg) => markets.reduce((t, m) => ({
      clicks: t.clicks + m[seg].clicks, impressions: t.impressions + m[seg].impressions,
    }), { clicks: 0, impressions: 0 });
    const totals = { total: sumSeg('total'), branded: sumSeg('branded'), nonBranded: sumSeg('nonBranded') };

    return json(200, {
      brand,
      range: { startDate: window.startDate || null, endDate: window.endDate || null, days: window.days || null },
      markets, totals, updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
