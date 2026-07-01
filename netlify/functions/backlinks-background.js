// netlify/functions/backlinks-background.js
// Automated Monday backlink monitoring.
// Runs alongside the main scheduler (Monday 4am UTC = 8am Dubai).
//
// DataForSEO Standard mode: task_post + task_get polling only.
// Fetches referring_domains for eatpickl.com + bonbirdchicken.com + key competitors.
// Stores data in Blobs for the Analytics tab.

const { getStore } = require('@netlify/blobs');
const { authorizeJob } = require('./_lib/auth');

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';

const BRAND_DOMAINS = {
  pickl: {
    own: 'eatpickl.com',
    competitors: [
      { domain: 'salt.ae', label: 'Salt' },
      { domain: 'highjoint.ae', label: 'High Joint' },
      { domain: 'shakeshack.com', label: 'Shake Shack' },
      { domain: 'fiveguys.ae', label: 'Five Guys' },
    ],
  },
  bonbird: {
    own: 'bonbirdchicken.com',
    competitors: [
      { domain: 'raisingcanes.com', label: "Raising Cane's" },
      { domain: 'kfc.com', label: 'KFC' },
      { domain: 'popeyes.com', label: 'Popeyes' },
      { domain: 'daves-hot-chicken.com', label: "Dave's Hot Chicken" },
    ],
  },
};

function getAuthHeader() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

async function submitTask(target, authHeader) {
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
  if (data.status_code !== 20000) throw new Error(`Submit error: ${data.status_message}`);
  const taskId = data.tasks?.[0]?.id;
  if (!taskId) throw new Error('No task ID from DataForSEO');
  return taskId;
}

async function pollTask(taskId, authHeader, maxAttempts = 24) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`${DATAFORSEO_BASE}/backlinks/referring_domains/task_get/${taskId}`, {
      headers: { Authorization: authHeader },
    });
    const data = await res.json();
    const task = data.tasks?.[0];
    if (!task) continue;
    if (task.status_code === 20000) return task.result?.[0] || null;
    if (task.status_code === 40602) continue; // still processing
    throw new Error(`Task failed: ${task.status_message}`);
  }
  throw new Error('Task timed out');
}

function buildSummary(target, result) {
  const items = (result?.items || []).map(item => ({
    domain:    item.domain_from,
    rank:      item.domain_from_rank || 0,
    backlinks: item.backlinks_num || item.total_count || 1,
    dofollow:  item.dofollow || 0,
    nofollow:  item.nofollow || 0,
  }));
  const totalBacklinks = items.reduce((s, i) => s + i.backlinks, 0);
  const totalDofollow  = items.reduce((s, i) => s + i.dofollow, 0);
  const dofollowPct    = totalBacklinks > 0 ? Math.round((totalDofollow / totalBacklinks) * 100) : 0;
  const domainRankProxy = items.length > 0
    ? Math.round(items.slice(0, 20).reduce((s, i) => s + i.rank, 0) / Math.min(items.length, 20))
    : 0;
  return {
    target,
    referringDomains: result?.total_count || items.length,
    totalBacklinks,
    dofollowPct,
    domainRankProxy,
    topDomains: items.slice(0, 10),
    fetchedAt: new Date().toISOString(),
  };
}

function computeDelta(current, previous) {
  if (!previous) return { newDomains: [], lostDomains: [], referringDelta: 0 };
  const prevSet = new Set((previous.topDomains || []).map(d => d.domain));
  const currSet = new Set((current.topDomains  || []).map(d => d.domain));
  return {
    newDomains:      current.topDomains.filter(d => !prevSet.has(d.domain)).slice(0, 5),
    lostDomains:     (previous.topDomains || []).filter(d => !currSet.has(d.domain)).slice(0, 5),
    referringDelta:  current.referringDomains - (previous.referringDomains || 0),
  };
}

async function processBrand(brand, store, authHeader) {
  const config = BRAND_DOMAINS[brand];
  console.log(`[backlinks-bg] Processing ${brand}...`);

  // Fetch own domain first
  let ownSummary = null;
  try {
    const taskId = await submitTask(config.own, authHeader);
    const result = await pollTask(taskId, authHeader);
    ownSummary   = buildSummary(config.own, result);
    console.log(`[backlinks-bg] ${brand} own: ${ownSummary.referringDomains} referring domains`);
  } catch (e) {
    console.error(`[backlinks-bg] Own domain failed for ${brand}:`, e.message);
    ownSummary = { target: config.own, error: e.message };
  }

  // Fetch competitors with delay between each
  const competitorSummaries = [];
  for (const comp of config.competitors) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const taskId = await submitTask(comp.domain, authHeader);
      const result = await pollTask(taskId, authHeader);
      const summary = buildSummary(comp.domain, result);
      competitorSummaries.push({ ...summary, label: comp.label });
      console.log(`[backlinks-bg] ${comp.label}: ${summary.referringDomains} referring domains`);
    } catch (e) {
      console.error(`[backlinks-bg] Competitor failed (${comp.domain}):`, e.message);
      competitorSummaries.push({ target: comp.domain, label: comp.label, error: e.message });
    }
  }

  // Load previous for delta calculation
  let previous = null;
  try {
    previous = await store.get(`backlinkData:${brand}`, { type: 'json' });
  } catch {}

  const delta = ownSummary && !ownSummary.error
    ? computeDelta(ownSummary, previous?.own)
    : null;

  const snapshot = {
    brand,
    own:         ownSummary,
    competitors: competitorSummaries,
    delta,
    fetchedAt:   new Date().toISOString(),
  };

  await store.set(`backlinkData:${brand}`, JSON.stringify(snapshot));

  // Update rolling history
  let history = [];
  try {
    history = await store.get(`backlinkHistory:${brand}`, { type: 'json' }) || [];
  } catch {}
  if (!Array.isArray(history)) history = [];

  if (ownSummary && !ownSummary.error) {
    history.push({
      date:             snapshot.fetchedAt.slice(0, 10),
      referringDomains: ownSummary.referringDomains,
      totalBacklinks:   ownSummary.totalBacklinks,
    });
    if (history.length > 12) history = history.slice(-12);
    await store.set(`backlinkHistory:${brand}`, JSON.stringify(history));
  }

  return snapshot;
}

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };
  // On-demand manual refresh passes ?brand=pickl|bonbird; the Monday cron passes
  // no query string and runs both brands.
  const only   = event?.queryStringParameters?.brand;
  const brands = only && BRAND_DOMAINS[only] ? [only] : ['pickl', 'bonbird'];
  console.log(`[backlinks-bg] Starting backlink monitoring run for: ${brands.join(', ')}`);

  const store      = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });
  const authHeader = getAuthHeader();
  const results    = {};

  for (const brand of brands) {
    try {
      results[brand] = await processBrand(brand, store, authHeader);
    } catch (e) {
      console.error(`[backlinks-bg] Fatal error for ${brand}:`, e.message);
      results[brand] = { brand, error: e.message };
    }
  }

  console.log('[backlinks-bg] Done');
  return { statusCode: 200, body: JSON.stringify({ ok: true, results }) };
};
