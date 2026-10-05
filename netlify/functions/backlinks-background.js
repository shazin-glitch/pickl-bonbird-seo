// netlify/functions/backlinks-background.js
// Weekly backlink monitoring (own domain + configured competitors), stored for the
// Backlinks tab + the State-of-SEO authority summary.
//
// DataForSEO Backlinks API is LIVE-ONLY — it has no task_post/task_get mode. The old
// code called `backlinks/referring_domains/task_post`, which does not exist, so every
// run since June failed with "Submit error: Not Found" (rule #5's Standard-mode rule
// covers SERP + OnPage crawls; Backlinks, like the Labs lookups, is live-only).
//   • backlinks/summary/live           — exact totals per domain (1 call each)
//   • backlinks/referring_domains/live — top linkers, OWN domain only (new/lost delta)
//
// Fired weekly by cron-weekly-background + on demand from the Backlinks tab (POST
// /api/backlinks). NO `schedule` in netlify.toml — a scheduled fn 403s every HTTP call.

const { getStore } = require('@netlify/blobs');
const { authorizeJob } = require('./_lib/auth');
const { getBrand, getBrandSlugs } = require('./_lib/brands-config');

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const TOP_DOMAINS = 20;

function getAuthHeader() {
  return 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
}

async function live(path, body, authHeader) {
  const res = await fetch(`${DATAFORSEO_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify([body]),
  });
  const data = await res.json().catch(() => ({}));
  if (data.status_code !== 20000) throw new Error(`DataForSEO ${path}: ${data.status_message || res.status}`);
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) throw new Error(`DataForSEO ${path}: ${task?.status_message || 'no task'}`);
  return task.result?.[0] || null;
}

// Exact totals for one domain.
async function fetchSummary(target, authHeader) {
  const r = await live('backlinks/summary/live', { target, include_subdomains: true, backlinks_status_type: 'live', internal_list_limit: 1 }, authHeader);
  if (!r) throw new Error('empty summary');
  const backlinks = r.backlinks || 0;
  const nofollow  = r.referring_links_attributes?.nofollow || 0;
  return {
    target,
    referringDomains: r.referring_domains || 0,
    totalBacklinks:   backlinks,
    dofollowPct:      backlinks > 0 ? Math.max(0, Math.round(100 * (backlinks - nofollow) / backlinks)) : 0,
    domainRankProxy:  r.rank || 0,              // DataForSEO domain rank, 0–1000 scale
    spamScore:        r.backlinks_spam_score ?? null,
    brokenBacklinks:  r.broken_backlinks || 0,
    fetchedAt:        new Date().toISOString(),
  };
}

// Top referring domains for the own domain (drives the new/lost delta + the list in the tab).
async function fetchTopDomains(target, authHeader) {
  const r = await live('backlinks/referring_domains/live', {
    target, include_subdomains: true, backlinks_status_type: 'live', limit: TOP_DOMAINS, order_by: ['rank,desc'],
  }, authHeader);
  // Field names differ between Backlinks endpoints; map defensively.
  return (r?.items || []).map(i => ({
    domain:    i.domain || i.domain_from,
    rank:      i.rank ?? i.domain_from_rank ?? 0,
    backlinks: i.backlinks ?? i.backlinks_num ?? 0,
    firstSeen: i.first_seen || null,
  })).filter(d => d.domain);
}

function computeDelta(current, previous) {
  if (!previous || previous.error) return { newDomains: [], lostDomains: [], referringDelta: 0 };
  const prevSet = new Set((previous.topDomains || []).map(d => d.domain));
  const currSet = new Set((current.topDomains || []).map(d => d.domain));
  return {
    newDomains:     (current.topDomains || []).filter(d => !prevSet.has(d.domain)).slice(0, 5),
    lostDomains:    (previous.topDomains || []).filter(d => !currSet.has(d.domain)).slice(0, 5),
    referringDelta: current.referringDomains - (previous.referringDomains || 0),
  };
}

async function processBrand(brand, store, authHeader) {
  const b = await getBrand(brand);
  if (!b || !b.ownDomain) return { brand, skipped: true, reason: 'no ownDomain in brand config' };
  const competitors = (b.competitors || []).filter(c => c && c.domain).map(c => ({ domain: c.domain, label: c.name }));
  console.log(`[backlinks-bg] ${brand}: own ${b.ownDomain} + ${competitors.length} competitor(s)`);

  let own;
  try {
    own = await fetchSummary(b.ownDomain, authHeader);
    own.topDomains = await fetchTopDomains(b.ownDomain, authHeader).catch(e => { console.warn(`[backlinks-bg] ${brand} top domains failed:`, e.message); return []; });
  } catch (e) {
    console.error(`[backlinks-bg] ${brand} own domain failed:`, e.message);
    own = { target: b.ownDomain, error: e.message };
  }

  const comps = [];
  for (const c of competitors) {
    try { comps.push({ ...(await fetchSummary(c.domain, authHeader)), label: c.label }); }
    catch (e) { console.error(`[backlinks-bg] competitor ${c.domain} failed:`, e.message); comps.push({ target: c.domain, label: c.label, error: e.message }); }
  }

  const previous = await store.get(`backlinkData:${brand}`, { type: 'json' }).catch(() => null);
  // Never overwrite good data with a failed run (same hardening as the GSC jobs).
  if (own.error && previous?.own && !previous.own.error) {
    console.warn(`[backlinks-bg] ${brand}: own fetch failed — preserved previous snapshot`);
    return { brand, skipped: true, reason: own.error };
  }

  const snapshot = { brand, own, competitors: comps, delta: own.error ? null : computeDelta(own, previous?.own), fetchedAt: new Date().toISOString() };
  await store.set(`backlinkData:${brand}`, JSON.stringify(snapshot));

  if (!own.error) {
    let history = await store.get(`backlinkHistory:${brand}`, { type: 'json' }).catch(() => null);
    if (!Array.isArray(history)) history = [];
    history = history.filter(h => (h.referringDomains || 0) > 0 || (h.totalBacklinks || 0) > 0); // drop the zero rows the broken job wrote
    const today = snapshot.fetchedAt.slice(0, 10);
    history = history.filter(h => h.date !== today);                                              // same-day rerun overwrites
    history.push({ date: today, referringDomains: own.referringDomains, totalBacklinks: own.totalBacklinks, rank: own.domainRankProxy });
    await store.set(`backlinkHistory:${brand}`, JSON.stringify(history.slice(-26)));
  }
  console.log(`[backlinks-bg] ${brand}: ${own.error ? 'own FAILED' : own.referringDomains + ' referring domains, rank ' + own.domainRankProxy}`);
  return snapshot;
}

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };
  if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) return { statusCode: 500, body: JSON.stringify({ error: 'DataForSEO credentials missing' }) };

  const only = event?.queryStringParameters?.brand;
  const allSlugs = await getBrandSlugs();
  const brands = only && allSlugs.includes(only) ? [only] : allSlugs;
  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
  const authHeader = getAuthHeader();

  const results = {};
  for (const brand of brands) {
    try { results[brand] = await processBrand(brand, store, authHeader); }
    catch (e) { console.error(`[backlinks-bg] ${brand} fatal:`, e.message); results[brand] = { brand, error: e.message }; }
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, results }) };
};
