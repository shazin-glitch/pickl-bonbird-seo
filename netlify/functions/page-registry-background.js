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
const { getMarketsForBrandAsync, getMarketPageTokens, citiesForMarketAsync } = require('./_lib/international-config');
const { getBrandSlugs, ownDomainFor, gscPropertyFor } = require('./_lib/brands-config');
const { listApprovals } = require('./_lib/store');
const { authorizeJob, internalHeaders } = require('./_lib/auth');

const SITE = process.env.URL || process.env.NETLIFY_URL || 'https://yolkseo.netlify.app';

const ROBOTS_FETCH_CAP = 40; // bound live page fetches (noindex confirmation) for cost/time
const INDEX_INSPECT_CAP = 400; // bound URL-Inspection calls/brand/run (GSC quota = 2000/day)
const INDEX_CONCURRENCY = 5;   // parallel URL-Inspection calls (quota = 600/min)

// Run async fn over items with at most `limit` in flight; preserves order; never rejects.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (true) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Ask Google the ACTUAL index state of a URL (not just "is it indexable"). Returns
// { verdict, coverageState, lastCrawlTime, indexed, checkedAt } or null on error.
// verdict 'PASS' = the URL is on Google (indexed); anything else = not indexed, with
// coverageState giving the human reason ("Crawled - currently not indexed", "Discovered
// - currently not indexed", "URL is unknown to Google", …).
async function inspectIndex(site, token, url) {
  try {
    const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: site }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const idx = data?.inspectionResult?.indexStatusResult;
    if (!idx) return null;
    return {
      verdict: idx.verdict || null,
      coverageState: idx.coverageState || null,
      lastCrawlTime: idx.lastCrawlTime || null,
      indexed: idx.verdict === 'PASS',
      checkedAt: Date.now(),
    };
  } catch { return null; }
}

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

// ISO week key (YYYY-Www) so a same-week rerun overwrites rather than piling up docs.
function isoWeek(d) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((dt - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

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
function classify(url, marketSlugs, citySlugs) {
  const segs = pathOf(url).split('/').filter(Boolean);
  if (!segs.length) return 'home';
  if (KNOWN[segs[0]]) return KNOWN[segs[0]];
  if (marketSlugs.has(segs[0])) {
    const rest = segs.slice(1);
    if (rest.length === 0) return 'market_home';
    if (KNOWN[rest[0]]) return KNOWN[rest[0]];
    if (rest[0] === 'journal') return 'journal';
    // market/{city}/ = city hub; market/{other}/ = a product/other page (config decides)
    if (rest.length === 1) return citySlugs.has(rest[0]) ? 'city_hub' : 'product';
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
// Parse <url> entries into {loc, lastmod} — Yoast stamps <lastmod> on every page, so
// this gives us each page's modified date for free (drives the SEO event log).
function urlEntries(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map(m => ({
    loc:     (m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/i) || [])[1] || null,
    lastmod: (m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i) || [])[1] || null,
  })).filter(e => e.loc);
}

// Returns Map(normUrl → lastmod|null).
async function collectSitemap(domain) {
  const index = await fetchText(`https://${domain}/sitemap_index.xml`);
  const subs = locs(index).filter(u => /\.xml($|\?)/i.test(u));
  const out = new Map();
  // If no index (some sites expose a flat sitemap.xml), fall back to that.
  const sitemaps = subs.length ? subs : [`https://${domain}/sitemap.xml`];
  for (const sm of sitemaps) {
    for (const e of urlEntries(await fetchText(sm))) { const n = normUrl(e.loc); if (n && !out.has(n)) out.set(n, e.lastmod); }
  }
  return out;
}

async function robotsIndexable(url) {
  let r;
  try { r = await fetch(url, { redirect: 'follow' }); }
  catch { return { fetched: false, indexable: null, status: 'unreachable' }; }
  // A URL that REDIRECTS is not a live page — its canonical target is what belongs
  // in the sitemap (and is there). Flagging it as "live but missing from sitemap" is a
  // false positive; mark it 'redirect' so it's excluded from that check. Catches the
  // ISO-market redirects (/, /dubai/, /oman/, /sharjah/aljada/ → /ae/… , /om/…).
  if (r.redirected || (r.status >= 300 && r.status < 400)) {
    return { fetched: true, indexable: false, status: 'redirect' };
  }
  if (!r.ok) return { fetched: false, indexable: null, status: 'unreachable' };
  const html = await r.text().catch(() => null);
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

  const [sitemapMap, gscRes, marketsMap, nestUrls, prior] = await Promise.all([
    collectSitemap(domain),
    token ? fetchGscPageOnly(site, token, { days: 90 }) : Promise.resolve({ rows: [] }),
    getMarketsForBrandAsync(brand),
    nestCreatedUrls(brand),
    store.get(`pageRegistry:${brand}`, { type: 'json' }).catch(() => null),
  ]);
  const sitemapUrls = new Set(sitemapMap.keys());

  const marketSlugs = new Set(Object.values(marketsMap).map(m => m.marketSlug).filter(Boolean));
  const citySlugs = new Set();
  await Promise.all(Object.keys(marketsMap).map(async key => {
    const cities = await citiesForMarketAsync(key).catch(() => []);
    for (const c of (cities || [])) if (c && c.slug) citySlugs.add(String(c.slug).toLowerCase());
  }));
  const gscByUrl = new Map();
  for (const r of (gscRes.rows || [])) { const n = normUrl(r.page); if (n) gscByUrl.set(n, r); }
  const priorSeen = new Map((prior?.pages || []).map(p => [p.url, p.firstSeen]));
  const now = new Date().toISOString();

  // universe = everything we can see is live: sitemap ∪ GSC pages ∪ Nest-created URLs
  const universe = new Set([...sitemapUrls, ...gscByUrl.keys(), ...nestUrls]);

  // Confirm indexability by fetching robots ONLY where it's genuinely in doubt: a page
  // missing from the sitemap AND absent from GSC (0 impressions). A page with impressions
  // is obviously indexed (no fetch needed); an in-sitemap page is indexable (Yoast drops
  // noindex from the sitemap). Nest-created pages checked first, bounded by the cap — this
  // is what catches a stray noindex like /om/chicken-tenders/.
  const candidates = [...universe].filter(u => !sitemapUrls.has(u) && !gscByUrl.has(u));
  candidates.sort((a, b) => (nestUrls.has(b) ? 1 : 0) - (nestUrls.has(a) ? 1 : 0));
  const robotsMap = new Map();
  let fetched = 0;
  for (const u of candidates) {
    if (fetched >= ROBOTS_FETCH_CAP) break;
    robotsMap.set(u, await robotsIndexable(u));
    fetched++;
  }

  const pages = [...universe].map(url => {
    const g = gscByUrl.get(url) || null;
    const inSitemap = sitemapUrls.has(url);
    const rb = robotsMap.get(url);
    let indexable, indexNote;
    if (inSitemap) { indexable = true; indexNote = 'in-sitemap'; }
    else if (g) { indexable = true; indexNote = 'has-impressions'; }
    else if (rb) { indexable = rb.indexable; indexNote = rb.status; }
    else { indexable = null; indexNote = 'unknown'; }
    const impressions = g ? g.impressions : 0;
    const clicks = g ? g.clicks : 0;
    let status;
    if (indexNote === 'redirect') status = 'redirect';
    else if (indexable === false) status = 'noindex';
    else if (clicks > 1) status = 'ranking';
    else if (impressions > 0) status = 'indexed';
    else status = 'new';
    return {
      url,
      market: attributeMarket(url, marketsMap),
      pageType: classify(url, marketSlugs, citySlugs),
      inSitemap,
      indexable, indexNote,
      impressions, clicks,
      position: g ? g.position : null,
      nestCreated: nestUrls.has(url),
      status,
      lastmod: sitemapMap.get(url) || null,
      firstSeen: priorSeen.get(url) || now,
      lastSeen: now,
    };
  }).sort((a, b) => (b.clicks - a.clicks) || (b.impressions - a.impressions));

  // ── Real Google index status (URL Inspection) ────────────────────────────
  // "indexable" only says the page ALLOWS indexing; it does NOT mean Google indexed it.
  // Ask Google directly so the Nest can report pages that are live + allowed but NOT in
  // the index (the common "in sitemap for weeks, still 0 impressions" case). Quota-savvy:
  // reuse a prior PASS verdict when the page is unchanged (lastmod same) — only (re)inspect
  // pages that are new, previously-not-indexed, or edited, so we keep watching the ones that
  // still need to land. Skips noindex/redirect pages (deliberately out of the index).
  if (token) {
    const priorIdx = new Map((prior?.pages || []).map(p => [p.url, { indexState: p.indexState, lastmod: p.lastmod }]));
    const toInspect = [];
    for (const p of pages) {
      if (p.indexable === false || p.indexNote === 'redirect') { p.indexState = null; continue; }
      const pr = priorIdx.get(p.url);
      const unchanged = pr && pr.lastmod === p.lastmod;
      if (unchanged && pr.indexState && pr.indexState.indexed === true) { p.indexState = pr.indexState; continue; } // still indexed, skip
      toInspect.push(p);
    }
    const capped = toInspect.slice(0, INDEX_INSPECT_CAP);
    await mapLimit(capped, INDEX_CONCURRENCY, async (p) => {
      const r = await inspectIndex(site, token, p.url);
      // on API failure keep any prior reading rather than blanking it
      p.indexState = r || (priorIdx.get(p.url)?.indexState) || null;
    });
    console.log(`${tag} URL-inspected ${capped.length} page(s)${toInspect.length > capped.length ? ` (capped from ${toInspect.length})` : ''}`);
  }

  // A page is "not indexed" only when Google was actually asked and said so (indexState
  // present and indexed===false) AND it's meant to be indexed (indexable, not a redirect).
  const notIndexed = pages.filter(p => p.indexable !== false && p.indexNote !== 'redirect' && p.indexState && p.indexState.indexed === false);

  const summary = {
    total: pages.length,
    inSitemap: pages.filter(p => p.inSitemap).length,
    withTraffic: pages.filter(p => p.clicks > 0).length,
    noindexFlags: pages.filter(p => p.status === 'noindex').length,
    indexChecked: pages.filter(p => p.indexState).length,
    indexed: pages.filter(p => p.indexState && p.indexState.indexed).length,
    notIndexed: notIndexed.length,
    notIndexedUrls: notIndexed.map(p => ({ url: p.url, market: p.market, pageType: p.pageType, reason: p.indexState.coverageState, nestCreated: p.nestCreated })),
    nestCreated: pages.filter(p => p.nestCreated).length,
    byMarket: {},
  };
  for (const p of pages) {
    const b = summary.byMarket[p.market] || (summary.byMarket[p.market] = { pages: 0, clicks: 0, impressions: 0 });
    b.pages++; b.clicks += p.clicks; b.impressions += p.impressions;
  }

  await store.set(`pageRegistry:${brand}`, JSON.stringify({ brand, domain, builtAt: now, summary, pages }));

  // Phase 2 (additive): per-page WEEKLY snapshot → the trend series the Monday view needs.
  // Compact rows (url/clicks/impr/pos/market); keyed by ISO week so reruns overwrite.
  const week = isoWeek(new Date());
  const snap = pages.map(p => ({ u: p.url, m: p.market, c: p.clicks, i: p.impressions, p: p.position }));
  await store.set(`pageSnapshot:${brand}:${week}`, JSON.stringify({ brand, week, builtAt: now, pages: snap }));

  // Phase 7a (additive): SEO EVENT LOG — the "work done" side of the outcome loop.
  // Detects work by diffing against the prior registry: a NEW content page = "published",
  // a page whose sitemap lastmod ADVANCED = "edited" — capturing ALL work (manual WP edits
  // AND Nest publishes) for free from the sitemap's <lastmod>. First run backfills our
  // already-shipped pages so the Outcomes view isn't empty. Append-only, capped.
  try {
    const isContent = u => !/\/wp-content\//i.test(u) && !/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|csv)(\?|$)/i.test(u);
    const log = (await store.get(`seoEvents:${brand}`, { type: 'json' }).catch(() => null)) || { brand, events: [] };
    const firstTime = !log.events.length;
    const priorByUrl = new Map((prior?.pages || []).map(p => [p.url, p]));
    const ev = [];
    for (const p of pages) {
      if (!isContent(p.url)) continue;
      const pr = priorByUrl.get(p.url);
      if (firstTime) {
        // one-time seed: our shipped pages, dated by sitemap lastmod (the recent Nest work)
        if (p.nestCreated) ev.push({ type: 'published', url: p.url, market: p.market, pageType: p.pageType, at: p.lastmod || p.firstSeen || now, nestCreated: true, backfill: true });
      } else if (!pr) {
        ev.push({ type: 'published', url: p.url, market: p.market, pageType: p.pageType, at: p.lastmod || now, nestCreated: p.nestCreated });
      } else if (p.lastmod && pr.lastmod && p.lastmod > pr.lastmod) {
        ev.push({ type: 'edited', url: p.url, market: p.market, pageType: p.pageType, at: p.lastmod, nestCreated: p.nestCreated });
      }
    }
    if (ev.length) {
      const seen = new Set(log.events.map(e => `${e.type}|${e.url}|${e.at}`));
      for (const e of ev) { const k = `${e.type}|${e.url}|${e.at}`; if (!seen.has(k)) { log.events.push({ ...e, loggedAt: now }); seen.add(k); } }
      log.events = log.events.slice(-1000);
      await store.set(`seoEvents:${brand}`, JSON.stringify(log));
      console.log(`${tag} logged ${ev.length} SEO event(s)${firstTime ? ' (first-run backfill)' : ''}`);
    }
  } catch (e) { console.warn(`${tag} event log failed:`, e.message); }

  console.log(`${tag} ${pages.length} live pages (${summary.inSitemap} in sitemap, ${summary.withTraffic} with traffic, ${summary.noindexFlags} noindex, ${summary.nestCreated} nest-created) · snapshot ${week}`);
  return { brand, week, ...summary };
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

  // Chain Perch sync (Phase 6) so findings become tracked tasks off the FRESH registry.
  try {
    await fetch(`${SITE}/.netlify/functions/perch-sync-background`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }), body: '{}',
    });
  } catch (e) { console.error('[registry] failed to fire perch-sync:', e.message); }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, gscConnected: !!token, results }) };
};
