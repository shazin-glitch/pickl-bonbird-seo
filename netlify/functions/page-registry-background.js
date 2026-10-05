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

const HTTP_CHECK_CAP = 150; // bound out-of-sitemap HTTP checks (redirect/noindex detection)
const HTTP_CONCURRENCY = 4;  // parallel out-of-sitemap fetches (8 tripped the site CDN rate-limit → inconclusive checks)
const INDEX_INSPECT_CAP = 400; // bound URL-Inspection calls/brand/run (GSC quota = 2000/day)
const STUCK_INDEX_DAYS = 14;   // live + should-index + 0 impressions for this long = indexing concern (Google usually indexes within ~2 weeks)
const INDEX_CONCURRENCY = 5;   // parallel URL-Inspection calls (quota = 600/min)
const EVENT_RESOLVE_CAP = 150; // bound per-run HTTP checks of work-log URLs we can't place (each is checked once, then remembered)

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
  catch (e) { return { fetched: false, indexable: null, status: 'unreachable', httpStatus: 'neterr:' + (e.cause?.code || e.name || 'error') }; }
  // A URL that REDIRECTS is not a live page — its canonical target is what belongs
  // in the sitemap (and is there). Flagging it as "live but missing from sitemap" is a
  // false positive; mark it 'redirect' so it's excluded from that check. Catches the
  // ISO-market redirects (/, /dubai/, /oman/, /sharjah/aljada/ → /ae/… , /om/…).
  if (r.redirected || (r.status >= 300 && r.status < 400)) {
    return { fetched: true, indexable: false, status: 'redirect', finalUrl: (r.url && r.url !== url) ? r.url : (r.headers.get('location') || null) };
  }
  // A 404/410 is a DEAD page — not live, even while GSC still reports it for weeks after
  // (that lag makes a dead URL look "indexed" via has-impressions). Mark it 'gone' so it's
  // excluded from the live registry, same as a redirect. (5xx/other = transient → keep.)
  if (r.status === 404 || r.status === 410) return { fetched: true, indexable: false, status: 'gone', httpStatus: r.status };
  if (!r.ok) return { fetched: false, indexable: null, status: 'unreachable', httpStatus: r.status }; // 429/403/5xx — inconclusive, NOT live
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

  // The non-canonical host twin (www ↔ apex). A domain GSC property reports rows for BOTH
  // hosts, so keying them separately listed the same page twice (double-counted in every
  // total). canon() folds the twin onto the brand's canonical domain.
  const aliasHost = domain.startsWith('www.') ? domain.slice(4) : `www.${domain}`;
  const canon = u => {
    const n = normUrl(u); if (!n) return null;
    try { const x = new URL(n); if (x.host === aliasHost) x.host = domain; return x.toString(); } catch { return n; }
  };

  const [sitemapMap, gscRes, marketsMap, nestUrlsRaw, prior, eventLog] = await Promise.all([
    collectSitemap(domain),
    token ? fetchGscPageOnly(site, token, { days: 90 }) : Promise.resolve({ rows: [] }),
    getMarketsForBrandAsync(brand),
    nestCreatedUrls(brand),
    store.get(`pageRegistry:${brand}`, { type: 'json' }).catch(() => null),
    store.get(`seoEvents:${brand}`, { type: 'json' }).catch(() => null),
  ]);
  const nestUrls = new Set([...nestUrlsRaw].map(canon).filter(Boolean));

  // HARDENING: if GSC is unavailable (no token, auth error, or empty), rebuilding would
  // zero every page's impressions/clicks/position — overwriting a good registry with a
  // blank one (the recurring token-expiry bug). When we have a prior registry that still
  // has traffic, preserve it and skip this cycle rather than wipe it. (First build / a
  // genuinely-empty property still proceeds.)
  const gscUnavailable = !token || gscRes.error || (gscRes.rows || []).length === 0;
  const priorHadTraffic = (prior?.pages || []).some(p => (p.impressions || 0) > 0);
  if (gscUnavailable && priorHadTraffic) {
    console.warn(`${tag} GSC unavailable (${!token ? 'no token' : gscRes.error || 'empty rows'}) — preserved prior registry (${prior.pages.length} pages), skipped rebuild`);
    return { brand, skipped: true, reason: 'GSC unavailable — preserved prior registry' };
  }

  const sitemapUrls = new Set(sitemapMap.keys());

  const marketSlugs = new Set(Object.values(marketsMap).map(m => m.marketSlug).filter(Boolean));
  const citySlugs = new Set();
  await Promise.all(Object.keys(marketsMap).map(async key => {
    const cities = await citiesForMarketAsync(key).catch(() => []);
    for (const c of (cities || [])) if (c && c.slug) citySlugs.add(String(c.slug).toLowerCase());
  }));
  const gscByUrl = new Map();
  const alias = { impressions: 0, clicks: 0, urls: 0 };
  for (const r of (gscRes.rows || [])) {
    const raw = normUrl(r.page), n = canon(r.page);
    if (!n) continue;
    if (raw !== n) { alias.impressions += r.impressions || 0; alias.clicks += r.clicks || 0; alias.urls++; }
    const ex = gscByUrl.get(n);
    if (!ex) { gscByUrl.set(n, { ...r }); continue; }
    // same page reported under both hosts → merge (impression-weighted position)
    const ti = (ex.impressions || 0) + (r.impressions || 0);
    if (ti && ex.position != null && r.position != null) ex.position = +(((ex.position * (ex.impressions || 0)) + (r.position * (r.impressions || 0))) / ti).toFixed(1);
    ex.impressions = ti; ex.clicks = (ex.clicks || 0) + (r.clicks || 0);
  }
  // Host health: if Google is sending traffic to the twin host, it MUST 301 to the canonical
  // one. (Found live: https://www.bonbirdchicken.com/* returned Cloudflare 526 — every
  // www result Google showed landed on an error page.) One cheap request per run.
  let hostAlias = null;
  if (alias.urls) {
    let httpStatus = null, ok = false;
    try {
      const r = await fetch(`https://${aliasHost}/`, { redirect: 'follow' });
      httpStatus = r.status;
      ok = r.ok && new URL(r.url).host === domain; // must END on the canonical host
    } catch { httpStatus = 'unreachable'; }
    hostAlias = { host: aliasHost, httpStatus, ok, urls: alias.urls, impressions: alias.impressions, clicks: alias.clicks };
    if (!ok) console.warn(`${tag} twin host ${aliasHost} is NOT redirecting to ${domain} (HTTP ${httpStatus}) — ${alias.impressions} impr/90d going to it`);
  }
  const priorSeen = new Map((prior?.pages || []).map(p => [p.url, p.firstSeen]));
  const now = new Date().toISOString();

  // universe = everything we can see is live: sitemap ∪ GSC pages ∪ Nest-created URLs
  const universe = new Set([...sitemapUrls, ...gscByUrl.keys(), ...nestUrls]);

  // HTTP-verify every out-of-sitemap URL. The Yoast sitemap is the authoritative list of
  // live 200 canonical pages, so an out-of-sitemap URL is one of: (a) a 301'd legacy URL
  // that GSC STILL reports impressions for (migration lag — Google keeps the old URL for
  // months after a redirect) — this must be marked 'redirect', NOT shown as a live
  // duplicate that double-counts impressions; (b) a genuinely live page missing from the
  // sitemap; or (c) a noindex page. The old code skipped URLs that had impressions, so the
  // 301'd legacy URLs (/dubai/, /uae-menu/, …) were listed as live pages — the bug that
  // produced a false "cannibalization" reading. Prioritise by impressions (the ones that
  // distort the numbers most), then Nest-created; bounded + parallel.
  const outOfSitemap = [...universe].filter(u => !sitemapUrls.has(u));
  outOfSitemap.sort((a, b) =>
    ((gscByUrl.get(b)?.impressions || 0) - (gscByUrl.get(a)?.impressions || 0))
    || ((nestUrls.has(b) ? 1 : 0) - (nestUrls.has(a) ? 1 : 0)));
  const robotsMap = new Map();
  await mapLimit(outOfSitemap.slice(0, HTTP_CHECK_CAP), HTTP_CONCURRENCY, async (u) => { robotsMap.set(u, await robotsIndexable(u)); });
  // Inconclusive checks (CDN rate-limit 429, 5xx, network) get ONE gentle retry — a burst
  // of checks from Netlify can trip the site's Cloudflare limits, and an inconclusive result
  // used to fall through to "GSC has data → assume live" (44 dead/301'd Bonbird URLs listed
  // as live pages on 2026-10-05).
  const inconclusive = [...robotsMap].filter(([, r]) => r.status === 'unreachable').map(([u]) => u);
  if (inconclusive.length) {
    await new Promise(r => setTimeout(r, 3000));
    await mapLimit(inconclusive, 2, async (u) => { robotsMap.set(u, await robotsIndexable(u)); });
  }
  const httpCheck = { checked: robotsMap.size, unchecked: Math.max(0, outOfSitemap.length - HTTP_CHECK_CAP), retried: inconclusive.length, stillInconclusive: {} };
  for (const r of robotsMap.values()) if (r.status === 'unreachable') { const k = String(r.httpStatus || 'unknown'); httpCheck.stillInconclusive[k] = (httpCheck.stillInconclusive[k] || 0) + 1; }
  if (Object.keys(httpCheck.stillInconclusive).length) console.warn(`${tag} HTTP checks still inconclusive after retry:`, JSON.stringify(httpCheck.stillInconclusive));
  // Remembered fates from earlier runs — used when today's check is inconclusive.
  const priorRedirects = prior?.redirects || {}, priorGone = new Set(prior?.gone || []);

  const allPages = [...universe].map(url => {
    const g = gscByUrl.get(url) || null;
    const inSitemap = sitemapUrls.has(url);
    const rb = robotsMap.get(url);
    let indexable, indexNote, redirectTo = null;
    if (rb && rb.status === 'gone') { indexable = false; indexNote = 'gone'; } // 404/410 — DEAD, checked first (beats sitemap/impressions lag)
    else if (inSitemap) { indexable = true; indexNote = 'in-sitemap'; }
    else if (rb && rb.status === 'redirect') { indexable = false; indexNote = 'redirect'; redirectTo = rb.finalUrl || null; } // 301'd — checked before impressions
    else if (rb && (rb.status === 'noindex' || rb.status === 'index')) { indexable = rb.indexable; indexNote = rb.status; }
    // today's check was inconclusive/skipped → trust what an earlier run PROVED about this URL
    else if (priorGone.has(url)) { indexable = false; indexNote = 'gone'; }
    else if (priorRedirects[url]) { indexable = false; indexNote = 'redirect'; redirectTo = priorRedirects[url]; }
    else if (g) { indexable = true; indexNote = rb ? 'unverified' : 'has-impressions'; } // in GSC; check inconclusive (unverified) or past cap — assume live
    else if (rb) { indexable = rb.indexable; indexNote = rb.status; }
    else { indexable = null; indexNote = 'unknown'; }
    const impressions = g ? g.impressions : 0;
    const clicks = g ? g.clicks : 0;
    let status;
    if (indexNote === 'redirect') status = 'redirect';
    else if (indexNote === 'gone') status = 'gone';
    else if (indexable === false) status = 'noindex';
    else if (clicks > 1) status = 'ranking';
    else if (impressions > 0) status = 'indexed';
    else status = 'new';
    return {
      url,
      market: attributeMarket(url, marketsMap),
      pageType: classify(url, marketSlugs, citySlugs),
      inSitemap,
      indexable, indexNote, redirectTo,
      impressions, clicks,
      position: g ? g.position : null,
      nestCreated: nestUrls.has(url),
      status,
      lastmod: sitemapMap.get(url) || null,
      firstSeen: priorSeen.get(url) || now,
      lastSeen: now,
    };
  }).sort((a, b) => (b.clicks - a.clicks) || (b.impressions - a.impressions));

  // A 301'd URL is NOT a live page — drop it from the registry so it's never shown as a
  // live duplicate. But its impressions are REAL demand (GSC still attributes them to the
  // old URL for months post-migration), so FOLD them into the redirect TARGET rather than
  // dropping them — otherwise the market total collapses during the transition. Result: no
  // duplicate rows AND accurate totals, attributed to the live page.
  // 404/410 pages are DEAD — drop them too (GSC lag keeps reporting them for weeks, which
  // otherwise shows a dead URL as a live "indexed" page + a phantom ranking drop).
  const redirectPages = allPages.filter(p => p.status === 'redirect');
  const gonePages = allPages.filter(p => p.status === 'gone');
  const pages = allPages.filter(p => p.status !== 'redirect' && p.status !== 'gone');
  if (gonePages.length) console.log(`${tag} excluded ${gonePages.length} dead (404/410) page(s) from the live registry`);
  const byUrl = new Map(pages.map(p => [p.url, p]));
  let folded = 0;
  for (const rp of redirectPages) {
    if (!rp.impressions && !rp.clicks) continue;
    const target = rp.redirectTo ? byUrl.get(normUrl(rp.redirectTo)) : null;
    if (target) { target.impressions += rp.impressions; target.clicks += rp.clicks; target.foldedFromRedirect = (target.foldedFromRedirect || 0) + rp.impressions; folded++; }
  }
  pages.sort((a, b) => (b.clicks - a.clicks) || (b.impressions - a.impressions)); // re-sort after folding
  if (redirectPages.length) console.log(`${tag} excluded ${redirectPages.length} redirect(s), folded ${folded} into their targets`);

  // ── Redirect + dead-URL memory (keeps the work log joinable across migrations) ──
  // seoEvents is keyed by the URL at the time of the work. After a URL migration (Bonbird's
  // ISO move: /pakistan/ → /pk/, /oman/ → /om/) those URLs leave the live registry, so the
  // Outcomes view could join only 40 of 151 logged Bonbird pages and showed the rest as
  // 0 clicks ("Pakistan 0/10"). Persist every redirect (from → to) and every dead URL seen —
  // ACCUMULATED across runs, because GSC eventually stops reporting old URLs — and HTTP-
  // resolve any logged URL we still can't place (checked once, then remembered).
  const redirects = { ...(prior?.redirects || {}) };
  const gone = new Set(prior?.gone || []);
  for (const rp of redirectPages) { const to = canon(rp.redirectTo); if (to && to !== rp.url) redirects[rp.url] = to; }
  for (const gp of gonePages) gone.add(gp.url);
  // PROVEN live again (in sitemap / fetched 200) → forget the old fate. An unverified "live"
  // page must not erase memory, or one rate-limited run would wipe the redirect map.
  for (const p of pages) if (p.inSitemap || p.indexNote === 'index' || p.indexNote === 'noindex') { delete redirects[p.url]; gone.delete(p.url); }
  const unplaced = [...new Set(((eventLog && eventLog.events) || []).map(e => canon(e.url)).filter(Boolean))]
    .filter(u => !byUrl.has(u) && !redirects[u] && !gone.has(u));
  const toResolve = unplaced.slice(0, EVENT_RESOLVE_CAP);
  await mapLimit(toResolve, HTTP_CONCURRENCY, async (u) => {
    const r = await robotsIndexable(u);
    if (r.status === 'redirect') { const to = canon(r.finalUrl); if (to && to !== u) redirects[u] = to; }
    else if (r.status === 'gone') gone.add(u);
  });
  if (toResolve.length) console.log(`${tag} resolved ${toResolve.length} unplaced work-log URL(s)${unplaced.length > toResolve.length ? ` (capped from ${unplaced.length})` : ''}`);

  // ── Real Google index status ─────────────────────────────────────────────
  // "indexable" only says the page ALLOWS indexing; it does NOT mean Google indexed it.
  // KEY shortcut: a page with impressions is BY DEFINITION indexed (it appeared in search
  // results), so it needs no API call — only 0-impression pages raise the real "is it in
  // the index?" question. So we URL-Inspect ONLY indexable, non-redirect, 0-impression
  // pages (typically a handful — the "in sitemap for weeks, still nothing" cases). This
  // keeps the job fast + far under GSC quota. Reuses a prior reading when unchanged.
  if (token) {
    const priorIdx = new Map((prior?.pages || []).map(p => [p.url, { indexState: p.indexState, lastmod: p.lastmod }]));
    const toInspect = [];
    for (const p of pages) {
      if (p.impressions > 0) { p.indexState = { indexed: true, verdict: 'PASS', coverageState: 'Serving impressions', inferred: true, checkedAt: Date.now() }; continue; }
      if (p.indexable === false || p.indexNote === 'redirect') { p.indexState = null; continue; } // deliberately out of index
      const pr = priorIdx.get(p.url);
      if (pr && pr.lastmod === p.lastmod && pr.indexState && pr.indexState.indexed === true && !pr.indexState.inferred) { p.indexState = pr.indexState; continue; }
      toInspect.push(p);
    }
    const capped = toInspect.slice(0, INDEX_INSPECT_CAP);
    await mapLimit(capped, INDEX_CONCURRENCY, async (p) => {
      const r = await inspectIndex(site, token, p.url);
      p.indexState = r || (priorIdx.get(p.url)?.indexState) || null; // keep prior reading on API failure
    });
    console.log(`${tag} URL-inspected ${capped.length} zero-impression page(s)${toInspect.length > capped.length ? ` (capped from ${toInspect.length})` : ''}`);
  }

  // ── The DURABLE indexing signal (what the alert + State-of-SEO trust) ──────
  // The URL-Inspection verdict is Google's LAST-KNOWN state and can lag the live GSC UI
  // (it reported "Submitted and indexed" for pages the live check showed as not indexed),
  // so we never treat it as truth on its own. The robust signal is behavioural + aged: a
  // page that is meant to be indexed (indexable + in the sitemap) but has pulled ZERO
  // impressions after being live for STUCK_INDEX_DAYS is an indexing concern — it either
  // isn't indexed or isn't serving, and either way needs a human look. The Inspection
  // verdict rides along as supporting detail, labelled last-crawl.
  const DAY = 864e5;
  // Age from the EARLIEST evidence the page was live — the older of its sitemap <lastmod>
  // (publish/update date) and firstSeen (first registry sighting). firstSeen alone
  // undercounts pages that were live before the registry started tracking them.
  const ageDays = p => {
    const ts = [p.lastmod, p.firstSeen].map(x => x ? new Date(x).getTime() : NaN).filter(x => !isNaN(x));
    const oldest = ts.length ? Math.min(...ts) : new Date(now).getTime();
    return Math.max(0, Math.floor((Date.now() - oldest) / DAY));
  };
  const concerns = pages.filter(p => p.indexable === true && p.inSitemap && p.impressions === 0 && ageDays(p) >= STUCK_INDEX_DAYS);
  for (const p of concerns) p.indexConcern = true;

  const summary = {
    total: pages.length,
    inSitemap: pages.filter(p => p.inSitemap).length,
    withTraffic: pages.filter(p => p.clicks > 0).length,
    noindexFlags: pages.filter(p => p.status === 'noindex').length,
    redirectsExcluded: redirectPages.length,
    indexChecked: pages.filter(p => p.indexState).length,
    indexed: pages.filter(p => p.indexState && p.indexState.indexed).length,
    // durable indexing concerns (the trusted signal): live + should-index + 0 impr + aged
    indexingConcerns: concerns.length,
    indexingConcernUrls: concerns.map(p => ({
      url: p.url, market: p.market, pageType: p.pageType, ageDays: ageDays(p), nestCreated: p.nestCreated,
      lastCrawlVerdict: p.indexState ? (p.indexState.coverageState || p.indexState.verdict) : null, // supporting detail, may lag
    })),
    nestCreated: pages.filter(p => p.nestCreated).length,
    redirectsKnown: Object.keys(redirects).length,
    httpCheck, // out-of-sitemap verification health — stillInconclusive {code: n} means some "live" pages are unverified
    hostAlias, // null = no twin-host traffic; else { host, httpStatus, ok, … } — ok:false is a live site fault
    byMarket: {},
  };
  for (const p of pages) {
    const b = summary.byMarket[p.market] || (summary.byMarket[p.market] = { pages: 0, clicks: 0, impressions: 0 });
    b.pages++; b.clicks += p.clicks; b.impressions += p.impressions;
  }

  await store.set(`pageRegistry:${brand}`, JSON.stringify({ brand, domain, builtAt: now, summary, pages, redirects, gone: [...gone] }));

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
    const log = eventLog || { brand, events: [] };
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
