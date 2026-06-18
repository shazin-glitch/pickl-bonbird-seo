// netlify/functions/citations.js
// Citation Tracker — NAP consistency checker across UAE food platforms.
//
// GET ?brand=all|pickl|bonbird    — returns cached citation data + NAP + statuses
// POST { action: 'check', brand } — runs all 5 platform SERP checks for one brand
// POST { action: 'save_nap', brand, nap }              — saves canonical NAP
// POST { action: 'save_status', brand, platform, status } — saves manual verified/issue status
//
// DataForSEO: Standard mode ONLY (task_post + task_get/advanced polling)
// Endpoint: /v3/serp/google/organic/task_post + task_get/advanced
// Cost: ~$0.0006/query × 5 platforms = ~$0.003/brand/run

const { getStore } = require('@netlify/blobs');

const DATAFORSEO_POST_URL = 'https://api.dataforseo.com/v3/serp/google/organic/task_post';
const DATAFORSEO_GET_URL  = 'https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced';

const PLATFORMS = [
  { id: 'zomato',       label: 'Zomato',         emoji: '🍽',  domain: 'zomato.com' },
  { id: 'tripadvisor',  label: 'TripAdvisor',     emoji: '✈️', domain: 'tripadvisor.com' },
  { id: 'timeoutdubai', label: 'Time Out Dubai',  emoji: '⏰', domain: 'timeoutdubai.com' },
  { id: 'whatson',      label: "What's On",       emoji: '📱', domain: 'whatson.ae' },
  { id: 'entertainer',  label: 'The Entertainer', emoji: '🎟', domain: 'theentertainerme.com' },
];

const DEFAULT_NAP = {
  pickl:   { name: 'Pickl',           address: 'Dubai, UAE', phone: '+971' },
  bonbird: { name: 'Bonbird Chicken', address: 'Dubai, UAE', phone: '+971' },
};

function getAuthHeader() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

// ── Submit one SERP task ──────────────────────────────────────────────────────
async function submitSerpTask(keyword, authHeader) {
  const res = await fetch(DATAFORSEO_POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify([{
      keyword,
      location_name: 'United Arab Emirates',
      language_name: 'English',
      device:        'desktop',
      depth:         10,
    }]),
  });
  const data = await res.json();
  if (data.status_code !== 20000) throw new Error(`DataForSEO submit error: ${data.status_message}`);
  const taskId = data.tasks?.[0]?.id;
  if (!taskId) throw new Error('No task ID returned from DataForSEO');
  return taskId;
}

// ── Poll task until done (max 60s) ───────────────────────────────────────────
async function pollSerpTask(taskId, authHeader, maxWaitMs = 90000) {
  const pollInterval = 5000;
  const maxAttempts  = Math.ceil(maxWaitMs / pollInterval);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, pollInterval));
    const res = await fetch(`${DATAFORSEO_GET_URL}/${taskId}`, {
      headers: { Authorization: authHeader },
    });
    const data = await res.json();
    if (data.status_code !== 20000) continue;

    const task = data.tasks?.[0];
    if (!task) continue;
    if (task.status_code === 20000 && task.result) return task.result[0] || null;
    if (task.status_code === 40501) return null; // task not found — return null, no error
    // 40601 = task handed to another server — keep polling
    // 40602 = still processing — keep polling
  }
  return null; // timed out — return null rather than throwing
}

// ── Check one platform for a brand ───────────────────────────────────────────
async function checkPlatform(brandName, platform, authHeader) {
  const query = `${brandName} Dubai site:${platform.domain}`;
  try {
    const taskId = await submitSerpTask(query, authHeader);
    const result = await pollSerpTask(taskId, authHeader);

    const items      = result?.items || [];
    const topOrganic = items.find(i => i.type === 'organic');

    return {
      platform:  platform.id,
      query,
      title:     topOrganic?.title       || null,
      snippet:   topOrganic?.description || null,
      url:       topOrganic?.url         || null,
      found:     !!topOrganic,
      checkedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      platform:  platform.id,
      query,
      title:     null,
      snippet:   null,
      url:       null,
      found:     false,
      error:     e.message,
      checkedAt: new Date().toISOString(),
    };
  }
}

// ── Run all platforms for one brand ─────────────────────────────────────────
async function checkBrand(brand, store, authHeader) {
  const nap  = await store.get(`citationNAP:${brand}`, { type: 'json' }).catch(() => null)
            || DEFAULT_NAP[brand];
  const results = [];

  for (const platform of PLATFORMS) {
    const result = await checkPlatform(nap.name, platform, authHeader);
    console.log(`[citations] ${brand}/${platform.id}: found=${result.found}, error=${result.error || 'none'}`);
    results.push(result);
    // 2s gap between tasks to avoid rate limits
    if (platform !== PLATFORMS[PLATFORMS.length - 1]) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  await store.set(`citationData:${brand}`, JSON.stringify(results));
  return results;
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
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
      const brands     = brandParam === 'all' ? ['pickl', 'bonbird'] : [brandParam];
      const result     = {};

      for (const brand of brands) {
        const [nap, data, status] = await Promise.all([
          store.get(`citationNAP:${brand}`,    { type: 'json' }).catch(() => null),
          store.get(`citationData:${brand}`,   { type: 'json' }).catch(() => null),
          store.get(`citationStatus:${brand}`, { type: 'json' }).catch(() => null),
        ]);
        result[brand] = {
          nap:    nap    || DEFAULT_NAP[brand],
          data:   data   || [],
          status: status || {},
        };
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // ── POST: actions ────────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body   = JSON.parse(event.body || '{}');
      const action = body.action;

      // Save canonical NAP
      if (action === 'save_nap') {
        const { brand, nap } = body;
        if (!brand || !nap) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'brand and nap required' }) };
        }
        await store.set(`citationNAP:${brand}`, JSON.stringify(nap));
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      // Save manual verified/issue status for a platform
      if (action === 'save_status') {
        const { brand, platform, status } = body;
        if (!brand || !platform) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'brand and platform required' }) };
        }
        const existing = await store.get(`citationStatus:${brand}`, { type: 'json' }).catch(() => ({})) || {};
        if (status === null) {
          delete existing[platform];
        } else {
          existing[platform] = status;
        }
        await store.set(`citationStatus:${brand}`, JSON.stringify(existing));
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      // Run checks for one brand
      if (action === 'check') {
        const { brand } = body;
        if (!brand || !['pickl', 'bonbird'].includes(brand)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid brand' }) };
        }
        // Fire the background function and return immediately. checkBrand polls
        // DataForSEO for 5 platforms (~1-7 min), which exceeds the synchronous
        // function limit. Background functions MUST be called at
        // /.netlify/functions/<name> directly (redirects don't apply). UI polls
        // GET until the per-platform checkedAt timestamps update.
        const base  = process.env.URL || 'http://localhost:8888';
        const bgUrl = `${base}/.netlify/functions/citations-background?brand=${brand}`;
        fetch(bgUrl).catch(e => console.error('[citations] bg trigger failed:', e.message));
        return {
          statusCode: 202,
          headers,
          body: JSON.stringify({
            ok:      true,
            message: `Check started for ${brand} — poll GET /api/citations?brand=${brand} until checkedAt updates`,
          }),
        };
      }

      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[citations] Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

// Export for use by background function
exports.PLATFORMS   = PLATFORMS;
exports.DEFAULT_NAP = DEFAULT_NAP;
exports.checkBrand  = checkBrand;
