// netlify/functions/page-registry-background.js
// Phase 1 (NEST-REFINEMENT-PLAN) — the LIVE-PAGE REGISTRY: one source of truth for
// "what is actually live", so reporting stops being anchored on the approval queue
// (which knew about ~8 pages while ~198 were live). Built from FREE sources only:
//   • the Yoast sitemaps (authoritative live-URL list, always current, zero cost)
//   • the GSC page list (per-page impressions/clicks/position, last 90d)
//   • the Nest approval queue (to mark which live pages the Nest created)
// NO paid crawl — that's onpage-audit-background (metered DataForSEO, monthly). This job
// is safe to run weekly. It WRITES ONE NEW KEY, pageRegistry:<brand>, and never touches
// pageInventory:<brand> (the OnPage crawl) or any approval record.
//
// Config-driven (rule #2): brands from getBrandSlugs, markets from getMarketsForBrandAsync,
// market attribution from getMarketPageTokens — a new brand/market needs no code edit.

const { getStore } = require('@netlify/blobs');
const { getGscAccessToken, fetchGscPageOnly } = require('./_lib/gsc');
const { getMarketsForBrandAsync, getMarketPageTokens } = require('./_lib/international-config');
const { getBrandSlugs, ownDomainFor, gscPropertyFor } = require('./_lib/brands-config');
const { listApprovals } = require('./_lib/store');
const { authorizeJob } = require('./_lib/auth');

const ROBOTS_FETCH_CAP = 40; // bound live page fetches (noindex confirmation) for cost/time

// --- URL helpers -----------------------------------------------------------
function normUrl(u) {
  if (!u) return null;
  let s = String(u).trim();
  if (!/^https?:\/\//i.test(s)) return null;          // skip relative / ?page_id= forms
  try {
    const url = new URL(s);
    let p = url.pathname;
    if (!p.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(p)) p += '/'; // trailing slash for dir-style
    return `${url.protocol}//${url.host.toLowerCase()}${p}`;
  } catch { return null; }
}
function pathOf(u) { try { return new URL(u).pathname.toLowerCase(); } catch { return u; } }

// --- market attribution (same whole-segment token match as onpage-audit) ---
function urlMatchesTokens(url, tokens) {
  if (!url || !tokens || !tokens.length) return false;
  const path = pathOf(url);
  return tokens.some(t => path === `/${t}` || path === `/${t}/` || path.startsWith(`/${t}/`) || path.startsWith(`/${t}-`));
}
function attributeMarket(url, markets) {
  for (const [key, m] of Object.entries(markets)) {
    if (urlMatchesTokens(url, getMarketPageTokens(m))) return key;
  }
  return 'uae';
}

// --- page type (best-effort classifier; display aid, not load-bearing) -----
const KNOWN = { order:'order', menu:'menu', locations:'locations', journal:'journal',
  franchise:'franchise', 'contact-us':'contact', philosophy:'philosophy', games:'games',
  'join-us':'careers', 'uae-menu':'menu', 'pakistan-menu':'menu' };
function classify(url, marketSlugs) {
  const segs = pathOf(url).split('/').filter(Boolean);
  if (!segs.length) return 'home';
  if (KNOWN[segs[0]]) return KNOWN[segs[0]];
  if (marketSlugs.has(segs[0])) {
    const rest = segs.slice(1);
    if (rest.length === 0) return 'market_home';
    if (KNOWN[rest[0]]) return KNOWN[rest[0]];
    if (rest[0] === 'journal') return 'journal';
    if (rest.length === 1) return 'page';        // product/other single page under a market
    if (rest.length === 2) return 'city_hub';
    return 'venue';                              // market/city/venue(/...)
  }
  return 'page';
}

// --- sitemap ---------------------------------------------------------------
async function fetchText(url) {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}
function locs(xml) { return xml ? [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1]) : []; }

async function collectSitemapUrls(domain) {
  const index = await fetchText(`https://${domain}/sitemap_index.xml`);
  const subs = locs(index).filter(u => /\.xml($|\?)/i.test(u));
  const out = new Set();
  // If no index (some sites expose a flat sitemap.xml), fall back to that.
  const sitemaps = subs.length ? subs : [`https://${domain}/sitemap.xml`];
  for (const sm of sitemaps) {
    const xml = await fetchText(sm);
    for (const u of locs(xml)) { const n = normUrl(u); if (n) out.add(n); }
  }
  return out;
}

async function robotsIndexable(url) {
  const html = await fetchText(url);
  if (html == null) return { fetched: false, indexable: null, status: 'unreachable' };
  const m = html.match(/<meta[^>]+name=["']robots["'][^>]*>/i);
  const content = m ? ((m[0].match(/content=["']([^"']+)["']/i) || [])[1] || '').toLowerCase() : '';
  const noindex = /noindex/.test(content);
  return { fetched: true, indexable: !noindex, status: noindex ? 'noindex' : 'index' };
}

// --- approval URLs (which live pages the Nest created) ----------------------
async function nestCreatedUrls(brand) {
  const set = new Set();
  let items = [];
  try { items = await listApprovals({ brand }); } catch { /* store may be empty */ }
  for (const it of items) {
    for (const cand of [it.publishResult?.ref, it.payload?.url, it.payload?.liveUrl, it.payload?.path]) {
      const n = normUrl(cand);
      if (n) set.add(n);
    }
  }
  return set;
}

async function buildBrand(brand, store, token) {
  const tag = `[registry/${brand}]`;
  const domain = await ownDomainFor(brand);
  if (!domain) { console.warn(`${tag} no domain`); return { error: 'no domain' }; }
  const site = (await gscPropertyFor(brand)) || `https://${domain}/`;

  const [sitemapUrls, gscRes, marketsMap, nestUrls, prior] = await Promise.all([
    collectSitemapUrls(domain),
    token ? fetchGscPageOnly(site, token, { days: 90 }) : Promise.resolve({ rows: [] }),
    getMarketsForBrandAsync(brand),
    nestCreatedUrls(brand),
    store.get(`pageRegistry:${brand}`, { type: 'json' }).catch(() => null),
  ]);

  const marketSlugs = new Set(Object.values(marketsMap).map(m => m.marketSlug).filter(Boolean));
  const gscByUrl = new Map();
  for (const r of (gscRes.rows || [])) { const n = normUrl(r.page); if (n) gscByUrl.set(n, r); }
  const priorSeen = new Map((prior?.pages || []).map(p => [p.url, p.firstSeen]));
  const now = new Date().toISOString();

  // universe = everything we can see is live: sitemap ∪ GSC pages ∪ Nest-created URLs
  const universe = new Set([...sitemapUrls, ...gscByUrl.keys(), ...nestUrls]);

  // confirm indexability by fetching robots ONLY where it's in doubt (not in sitemap but
  // known to exist) — bounded. In-sitemap ⇒ indexable (Yoast excludes noindex).
  const doubtful = [...universe].filter(u => !sitemapUrls.has(u));
  const robotsMap = new Map();
  let fetched = 0;
  for (const u of doubtful) {
    if (fetched >= ROBOTS_FETCH_CAP) break;
    if (!nestUrls.has(u) && !gscByUrl.has(u)) continue; // only spend fetches on pages that matter
    robotsMap.set(u, await robotsIndexable(u));
    fetched++;
  }

  const pages = [...universe].map(url => {
    const g = gscByUrl.get(url) || null;
    const inSitemap = sitemapUrls.has(url);
    const rb = robotsMap.get(url);
    let indexable, indexNote;
    if (inSitemap) { indexable = true; indexNote = 'in-sitemap'; }
    else if (rb) { indexable = rb.indexable; indexNote = rb.status; }
    else { indexable = null; indexNote = 'unknown'; }
    const impressions = g ? g.impressions : 0;
    const clicks = g ? g.clicks : 0;
    let status;
    if (indexable === false) status = 'noindex';
    else if (clicks > 1) status = 'ranking';
    else if (impressions > 0) status = 'indexed';
    else status = 'new';
    return {
      url,
      market: attributeMarket(url, marketsMap),
      pageType: classify(url, marketSlugs),
      inSitemap,
      indexable, indexNote,
      impressions, clicks,
      position: g ? g.position : null,
      nestCreated: nestUrls.has(url),
      status,
      firstSeen: priorSeen.get(url) || now,
      lastSeen: now,
    };
  }).sort((a, b) => (b.clicks - a.clicks) || (b.impressions - a.impressions));

  const summary = {
    total: pages.length,
    inSitemap: pages.filter(p => p.inSitemap).length,
    withTraffic: pages.filter(p => p.clicks > 0).length,
    noindexFlags: pages.filter(p => p.status === 'noindex').length,
    nestCreated: pages.filter(p => p.nestCreated).length,
    byMarket: {},
  };
  for (const p of pages) {
    const b = summary.byMarket[p.market] || (summary.byMarket[p.market] = { pages: 0, clicks: 0, impressions: 0 });
    b.pages++; b.clicks += p.clicks; b.impressions += p.impressions;
  }

  await store.set(`pageRegistry:${brand}`, JSON.stringify({ brand, domain, builtAt: now, summary, pages }));
  console.log(`${tag} ${pages.length} live pages (${summary.inSitemap} in sitemap, ${summary.withTraffic} with traffic, ${summary.noindexFlags} noindex, ${summary.nestCreated} nest-created)`);
  return { brand, ...summary };
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
    catch (e) { console.error(`[registry] ${brand} failed:`, e.message); results[brand] = { error: e.message }; }
  }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, gscConnected: !!token, results }) };
};
