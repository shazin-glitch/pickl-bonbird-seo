// netlify/functions/backlinks.js
// Backlink monitoring — read cached data and trigger manual refreshes.
//
// GET  ?brand=pickl|bonbird|all         — returns cached backlink data
// POST { brand, action:'refresh' }      — triggers a fresh DataForSEO fetch
//
// DataForSEO: Standard mode ONLY (task_post + task_get polling)
// Endpoint: /v3/backlinks/referring_domains/task_post + task_get
// Cost: ~$0.002-0.005 per domain query

const { getStore } = require('@netlify/blobs');
const { getBrand, getBrandSlugs } = require('./_lib/brands-config');

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getAuthHeader() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

// ── DataForSEO Standard mode: submit task ────────────────────────────────────
async function submitReferringDomainsTask(target, authHeader) {
  const res = await fetch(`${DATAFORSEO_BASE}/backlinks/referring_domains/task_post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify([{
      target,
      limit: 100,
      order_by: ['backlinks_num,desc'],
      filters: [['dofollow', '=', true]],
    }]),
  });
  const data = await res.json();
  if (data.status_code !== 20000) throw new Error(`DataForSEO submit error: ${data.status_message}`);
  const taskId = data.tasks?.[0]?.id;
  if (!taskId) throw new Error('No task ID returned from DataForSEO');
  return taskId;
}

// ── DataForSEO Standard mode: poll for result ────────────────────────────────
async function pollTask(taskId, authHeader, maxWaitMs = 60000) {
  const pollInterval = 5000;
  const maxAttempts  = Math.ceil(maxWaitMs / pollInterval);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, pollInterval));
    const res = await fetch(`${DATAFORSEO_BASE}/backlinks/referring_domains/task_get/${taskId}`, {
      headers: { Authorization: authHeader },
    });
    const data = await res.json();
    const task = data.tasks?.[0];
    if (!task) continue;
    if (task.status_code === 20000) {
      return task.result?.[0] || null;
    }
    if (task.status_code === 40602) continue; // still processing
    throw new Error(`Task failed: ${task.status_message}`);
  }
  throw new Error('DataForSEO task timed out after 60s');
}

// ── Fetch referring domains for one domain ───────────────────────────────────
async function fetchReferringDomains(target, authHeader) {
  const taskId = await submitReferringDomainsTask(target, authHeader);
  const result = await pollTask(taskId, authHeader);
  if (!result) return { target, totalCount: 0, items: [] };

  const items = (result.items || []).map(item => ({
    domain:       item.domain_from,
    rank:         item.domain_from_rank || 0,
    backlinks:    item.backlinks_num || item.total_count || 1,
    dofollow:     item.dofollow || 0,
    nofollow:     item.nofollow || 0,
    isBroken:     !!item.is_broken,
  }));

  return {
    target,
    totalCount:        result.total_count || items.length,
    dofollowDomains:   items.filter(i => i.dofollow > 0).length,
    items,
    fetchedAt:         new Date().toISOString(),
  };
}

// ── Build summary stats from referring_domains result ───────────────────────
function buildSummary(referringData) {
  const items = referringData.items || [];
  const totalBacklinks    = items.reduce((s, i) => s + i.backlinks, 0);
  const totalDofollow     = items.reduce((s, i) => s + i.dofollow, 0);
  const dofollowPct       = totalBacklinks > 0 ? Math.round((totalDofollow / totalBacklinks) * 100) : 0;
  const topDomains        = items.slice(0, 10);
  // Simple domain authority proxy: weighted avg rank of top referring domains
  const domainRankProxy   = items.length > 0
    ? Math.round(items.slice(0, 20).reduce((s, i) => s + i.rank, 0) / Math.min(items.length, 20))
    : 0;

  return {
    target:            referringData.target,
    referringDomains:  referringData.totalCount || items.length,
    totalBacklinks,
    dofollowPct,
    domainRankProxy,   // DataForSEO's 0-1000 domain rank score
    topDomains,
    fetchedAt:         referringData.fetchedAt,
  };
}

// ── Compute delta vs previous snapshot ───────────────────────────────────────
function computeDelta(current, previous) {
  if (!previous) return { newDomains: [], lostDomains: [], referringDelta: 0 };
  const prevSet = new Set((previous.topDomains || []).map(d => d.domain));
  const currSet = new Set((current.topDomains  || []).map(d => d.domain));
  const newDomains  = current.topDomains.filter(d => !prevSet.has(d.domain));
  const lostDomains = (previous.topDomains || []).filter(d => !currSet.has(d.domain));
  const referringDelta = current.referringDomains - (previous.referringDomains || 0);
  return { newDomains: newDomains.slice(0, 5), lostDomains: lostDomains.slice(0, 5), referringDelta };
}

// ── Full brand refresh ────────────────────────────────────────────────────────
async function refreshBrand(brand, store, authHeader) {
  const b = await getBrand(brand);
  if (!b) throw new Error(`Unknown brand: ${brand}`);
  const config = {
    own: b.ownDomain,
    competitors: (b.competitors || []).map(c => ({ domain: c.domain, label: c.name })),
  };

  const results = {};

  // Fetch own domain
  try {
    const ownData    = await fetchReferringDomains(config.own, authHeader);
    results[config.own] = buildSummary(ownData);
  } catch (e) {
    console.error(`[backlinks] Own domain fetch failed for ${brand}:`, e.message);
    results[config.own] = { target: config.own, error: e.message };
  }

  // Fetch each competitor (sequential to avoid rate limits)
  for (const comp of config.competitors) {
    try {
      const compData = await fetchReferringDomains(comp.domain, authHeader);
      results[comp.domain] = { ...buildSummary(compData), label: comp.label };
      await new Promise(r => setTimeout(r, 2000)); // small delay between tasks
    } catch (e) {
      console.error(`[backlinks] Competitor fetch failed (${comp.domain}):`, e.message);
      results[comp.domain] = { target: comp.domain, label: comp.label, error: e.message };
    }
  }

  // Load previous snapshot for delta
  let previous = null;
  try {
    const prev = await store.get(`backlinkData:${brand}`, { type: 'json' });
    previous   = prev;
  } catch {}

  // Compute deltas for own domain
  const ownResult  = results[config.own];
  const ownPrev    = previous?.own;
  const delta      = ownResult && !ownResult.error ? computeDelta(ownResult, ownPrev) : null;

  // Save new snapshot
  const snapshot = {
    brand,
    own:         ownResult,
    competitors: config.competitors.map(c => results[c.domain] || { target: c.domain, label: c.label, error: 'Not fetched' }),
    delta,
    fetchedAt:   new Date().toISOString(),
  };
  await store.set(`backlinkData:${brand}`, JSON.stringify(snapshot));

  // Update rolling history (12 weeks max)
  let history = [];
  try {
    history = await store.get(`backlinkHistory:${brand}`, { type: 'json' }) || [];
  } catch {}
  if (!Array.isArray(history)) history = [];
  const historyEntry = {
    date:            snapshot.fetchedAt.slice(0, 10),
    referringDomains: ownResult?.referringDomains || 0,
    totalBacklinks:  ownResult?.totalBacklinks || 0,
  };
  history.push(historyEntry);
  if (history.length > 12) history = history.slice(-12);
  await store.set(`backlinkHistory:${brand}`, JSON.stringify(history));

  return snapshot;
}

// ── Handler ───────────────────────────────────────────────────────────────────
const { authorize, denied } = require('./_lib/auth');
exports.handler = async (event) => {
  if (event.httpMethod !== 'OPTIONS') { const _a = await authorize(event); if (!_a.ok) return denied(); }
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  try {
    // ── GET: return cached data ──────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const brandParam = event.queryStringParameters?.brand || 'all';
      const brands     = brandParam === 'all' ? await getBrandSlugs() : [brandParam];
      const result     = {};

      for (const brand of brands) {
        try {
          const cached = await store.get(`backlinkData:${brand}`, { type: 'json' });
          const history = await store.get(`backlinkHistory:${brand}`, { type: 'json' });
          result[brand] = cached ? { ...cached, history: history || [] } : null;
        } catch {
          result[brand] = null;
        }
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // ── POST: trigger refresh ────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body   = JSON.parse(event.body || '{}');
      const brand  = body.brand;
      const action = body.action;

      if (action !== 'refresh') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
      }
      if (!brand || !(await getBrand(brand))) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid brand' }) };
      }

      // Fire the background function (up to 15 min) and return immediately. Running
      // refreshBrand inline here times out — it polls DataForSEO for 1 own + 4
      // competitor domains (~5 min), well past the synchronous function limit.
      // Background functions MUST be called at /.netlify/functions/<name> directly
      // (netlify.toml redirects do not apply to them). UI polls GET until fetchedAt changes.
      const base  = process.env.URL || 'http://localhost:8888';
      const bgUrl = `${base}/.netlify/functions/backlinks-background?brand=${brand}`;
      // MUST await — an un-awaited fetch is frozen when the function returns, so the
      // background invocation never fires. Awaiting resolves on the fast 202.
      await fetch(bgUrl).catch(e => console.error('[backlinks] bg trigger failed:', e.message));

      return {
        statusCode: 202,
        headers,
        body: JSON.stringify({
          ok:      true,
          message: `Refresh started for ${brand} — poll GET /api/backlinks?brand=${brand} until fetchedAt updates`,
        }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[backlinks] Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
