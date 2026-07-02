// netlify/functions/onpage-audit-background.js
// Phase 2 — Site crawler / page inventory via DataForSEO OnPage API (Standard mode:
// task_post → poll summary → pages). THREE jobs from one crawl:
//   1. Page inventory  → pageInventory:<brand>  (the definitive page list Stage 2 needs)
//   2. Site audit      → onpageAudit:<brand>     (onpage_score + issue counts)
//   3. Trend           → onpageSnapshot:<brand>:<date>
//
// Uses DataForSEO (NOT Claude — runs fine regardless of Anthropic credits).
// Cost-bounded by max_crawl_pages. Manual trigger or monthly cron — NEVER weekly.
// One crawl per brand domain covers ALL markets (flat URL structure); each page is
// attributed to its market by URL, reusing getMarketPageTokens — so this is fully
// config-driven and needs zero changes when new markets/brands are added.

const { getStore } = require('@netlify/blobs');
const { getMarketsForBrand, getMarketPageTokens } = require('./_lib/international-config');
const { authorizeJob } = require('./_lib/auth');

const BASE = 'https://api.dataforseo.com/v3';
const BRAND_DOMAINS = { pickl: 'eatpickl.com', bonbird: 'bonbirdchicken.com' };

function getAuth() {
  return 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// URL → market (whole-segment token match; handles flat slugs like /bahrain-locations/).
function urlMatchesTokens(url, tokens) {
  if (!url || !tokens || !tokens.length) return false;
  const path = String(url).replace(/^https?:\/\/[^\/]+/, '').toLowerCase();
  return tokens.some(t => path === `/${t}` || path === `/${t}/` || path.startsWith(`/${t}/`) || path.startsWith(`/${t}-`));
}
function attributeMarket(url, brand) {
  const markets = getMarketsForBrand(brand); // config-driven — no hardcoded list
  for (const [key, m] of Object.entries(markets)) {
    if (urlMatchesTokens(url, getMarketPageTokens(m))) return key;
  }
  return 'uae'; // not an intl market page → home/UAE
}

async function dfsPost(path, payload, auth) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify([payload]),
  });
  return res.json();
}
async function dfsGet(path, auth) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: auth } });
  return res.json();
}

// Curated per-page issues. Field paths VERIFIED against a live 10-page crawl (2 Jul):
// duplicate_* are TOP-LEVEL numeric counts on the item; the rest are booleans in `checks`.
function pageIssues(item = {}, wordCount = 0) {
  const c = item.checks || {};
  const out = [];
  const has = (k) => c[k] === true;
  if (has('no_title'))                                                     out.push('missing title');
  if (has('title_too_long'))                                               out.push('title too long');
  if (has('title_too_short'))                                              out.push('title too short');
  if (has('no_description'))                                               out.push('missing meta description');
  if (has('no_h1_tag'))                                                    out.push('missing H1');
  if ((item.duplicate_title || 0) > 0 || has('duplicate_title_tag'))       out.push('duplicate title');
  if ((item.duplicate_description || 0) > 0)                               out.push('duplicate meta description');
  if ((item.duplicate_content || 0) > 0)                                   out.push('duplicate content');
  if (has('is_4xx_code'))                                                  out.push('4xx error');
  if (has('is_5xx_code'))                                                  out.push('5xx error');
  if (has('is_broken'))                                                    out.push('broken');
  if (typeof item.broken_links === 'number' && item.broken_links > 0)      out.push(`${item.broken_links} broken links`);
  else if (item.broken_links === true || c.has_broken_links === true)      out.push('has broken links');
  if (has('no_image_alt'))                                                 out.push('images missing alt');
  if (has('is_orphan_page'))                                               out.push('orphan page (no inbound links)');
  if (has('canonical_to_broken') || has('canonical_to_redirect'))          out.push('canonical issue');
  if (has('low_content_rate') || (wordCount && wordCount < 200))           out.push('thin content');
  return out;
}

async function auditBrand(brand, store, auth, maxPages) {
  const domain = BRAND_DOMAINS[brand];
  const tag = `[onpage/${brand}]`;
  if (!domain) { console.warn(`${tag} no domain configured`); return { error: 'no domain' }; }

  // 1) task_post — start the crawl (bounded by maxPages for cost).
  // Seed from the sitemap: market/location landing pages aren't linked from the main
  // nav, so a pure link-follow crawl misses them (validated: 15 pages vs 150 w/ sitemap).
  const post = await dfsPost('/on_page/task_post', {
    target: domain, max_crawl_pages: maxPages, load_resources: false,
    enable_javascript: false, respect_sitemap: true,
    custom_sitemap: `https://${domain}/sitemap_index.xml`, tag: 'nest-onpage',
  }, auth);
  if (post.status_code !== 20000) { console.warn(`${tag} task_post failed ${post.status_code}: ${post.status_message}`); return { error: `${post.status_code}: ${post.status_message}` }; }
  const taskId = post.tasks?.[0]?.id;
  if (!taskId) { console.warn(`${tag} no task id`); return { error: 'no task id' }; }
  console.log(`${tag} crawl started id=${taskId} max=${maxPages}`);

  // 2) poll summary until the crawl finishes (cap ~12 min; Netlify bg limit is 15).
  let summaryResult = null;
  for (let i = 0; i < 48; i++) {
    await sleep(15000);
    const s = await dfsGet(`/on_page/summary/${taskId}`, auth);
    const r = s.tasks?.[0]?.result?.[0];
    const progress = r?.crawl_progress;
    const done = r?.crawl_status?.pages_in_queue === 0 && (r?.crawl_status?.pages_crawled || 0) > 0;
    console.log(`${tag} poll ${i}: progress=${progress} crawled=${r?.crawl_status?.pages_crawled ?? '?'} queue=${r?.crawl_status?.pages_in_queue ?? '?'}`);
    if (progress === 'finished' || done) { summaryResult = r; break; }
    if (progress) summaryResult = r; // keep latest even if not finished (partial fallback)
  }
  if (!summaryResult) { console.warn(`${tag} crawl did not report progress`); return { error: 'crawl timeout / no summary' }; }

  const onpageScore = summaryResult.page_metrics?.onpage_score ?? null;
  const checks      = summaryResult.page_metrics?.checks || {};
  const totalPages  = summaryResult.crawl_status?.pages_crawled ?? summaryResult.domain_info?.total_pages ?? null;

  // 3) pages — per-page detail (one page of results up to maxPages)
  const pg = await dfsPost('/on_page/pages', { id: taskId, limit: maxPages }, auth);
  const items = pg.tasks?.[0]?.result?.[0]?.items || [];
  console.log(`${tag} pages fetched: ${items.length}`);

  const pages = items.map(it => {
    const url  = it.url || it.resource_url || '';
    const meta = it.meta || {};
    const wc   = meta.content?.plain_text_word_count ?? it.plain_text_word_count ?? 0;
    const h1   = Array.isArray(meta.htags?.h1) ? (meta.htags.h1[0] || null) : (meta.htags?.h1 || null);
    const status = it.status_code ?? null;
    const c = it.checks || {};
    return {
      url,
      market:          attributeMarket(url, brand),
      title:           meta.title || null,
      metaDescription: meta.description || null,
      h1,
      wordCount:       wc,
      statusCode:      status,
      inboundLinks:    meta.inbound_links_count ?? null,
      indexable:       (status >= 200 && status < 300) && c.is_broken !== true && c.is_4xx_code !== true && c.is_5xx_code !== true,
      issues:          pageIssues(it, wc),
    };
  }).filter(p => p.url && !/\/cdn-cgi\//.test(p.url)); // drop Cloudflare email-protection junk

  // Per-market rollup (drives the "Issues & Flags" view — e.g. market with 0 pages)
  const byMarket = {};
  for (const [key] of Object.entries(getMarketsForBrand(brand))) byMarket[key] = { pages: 0, thin: 0, missingMeta: 0, noH1: 0, errors: 0 };
  byMarket.uae = { pages: 0, thin: 0, missingMeta: 0, noH1: 0, errors: 0 };
  for (const p of pages) {
    const b = byMarket[p.market] || (byMarket[p.market] = { pages: 0, thin: 0, missingMeta: 0, noH1: 0, errors: 0 });
    b.pages++;
    if (p.wordCount && p.wordCount < 200) b.thin++;
    if (!p.metaDescription || !p.title)   b.missingMeta++;
    if (!p.h1)                            b.noH1++;
    if (p.statusCode && p.statusCode >= 400) b.errors++;
  }

  const crawledAt = new Date().toISOString();
  const audit = {
    brand, domain, crawledAt, onpageScore, totalPages,
    pageCount: pages.length, checks, byMarket,
    // field-path verification aid (Netlify logs aren't retained): sample raw shapes
    _debug: { summaryKeys: Object.keys(summaryResult.page_metrics || {}), firstPageSample: items[0] ? JSON.stringify(items[0]).slice(0, 1200) : null },
  };

  await store.set(`pageInventory:${brand}`, JSON.stringify({ brand, domain, crawledAt, totalPages, pages }));
  await store.set(`onpageAudit:${brand}`, JSON.stringify(audit));
  await store.set(`onpageSnapshot:${brand}:${crawledAt.slice(0, 10)}`, JSON.stringify({ crawledAt, onpageScore, totalPages: pages.length, checks }));
  console.log(`${tag} stored: ${pages.length} pages, onpage_score=${onpageScore}`);
  return { brand, pageCount: pages.length, onpageScore, byMarket };
}

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };

  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
  const auth  = getAuth();
  const qs    = event.queryStringParameters || {};
  const brands   = qs.brand ? [qs.brand] : ['pickl', 'bonbird'];
  const maxPages = Math.min(Math.max(parseInt(qs.maxPages, 10) || 250, 10), 1000);

  const results = {};
  for (const brand of brands) {
    try { results[brand] = await auditBrand(brand, store, auth, maxPages); }
    catch (e) { console.error(`[onpage] ${brand} failed:`, e.message); results[brand] = { error: e.message }; }
  }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, results }) };
};
