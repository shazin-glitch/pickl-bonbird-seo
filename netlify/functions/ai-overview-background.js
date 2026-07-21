// netlify/functions/ai-overview-background.js
// Weekly AI Overview Visibility check — Monday 4am UTC = 8am Dubai.
//
// Strategy: AI Overviews trigger on CONVERSATIONAL decision-intent queries
// ("where can i find the best fried chicken in dubai"), not short head terms
// ("best fried chicken dubai"). We use a mixed set:
//   - 10 top non-branded GSC keywords (what users actually search)
//   - 10 curated conversational queries per brand (known AI Overview triggers)
// Total: 20 keywords per brand. Cost: ~$0.012/brand/run.
//
// Also accepts ?brand=pickl|bonbird for single-brand manual refresh.

const { getStore } = require('@netlify/blobs');
const { authorizeJob } = require('./_lib/auth');
const { getBrand, getBrandSlugs } = require('./_lib/brands-config');

const DATAFORSEO_POST_URL = 'https://api.dataforseo.com/v3/serp/google/organic/task_post';
const DATAFORSEO_GET_URL  = 'https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced';

// ── Conversational queries that reliably trigger AI Overviews ─────────────────
// These are decision-intent queries Google summarises with an AI Overview.
// Short head terms ("best burger dubai") often don't trigger AI Overviews.
// TODO(config): move to brandsConfig (per-brand AI-Overview trigger seeds — no config equivalent yet)
const CONVERSATIONAL_QUERIES = {
  pickl: [
    'where can i find the best burger in dubai',
    'what is the best burger restaurant in dubai',
    'best smash burger restaurant in dubai',
    'where to eat a good burger in dubai',
    'best burger place in dubai for lunch',
    'where can i find the best chicken burger in dubai',
    'what is the best fast food burger in dubai',
    'best burger restaurant near me dubai',
    'where to get a smash burger in dubai',
    'best burger spots in dubai 2025',
  ],
  bonbird: [
    'where can i find the best fried chicken in dubai',
    'what is the best fried chicken restaurant in dubai',
    'best crispy fried chicken in dubai',
    'where to eat fried chicken in dubai',
    'best chicken restaurant in dubai',
    'where can i find the best chicken sandwich in dubai',
    'what is the best halal fried chicken in dubai',
    'best fried chicken near me dubai',
    'where to get crispy chicken tenders in dubai',
    'best fried chicken spots in dubai 2025',
  ],
};

// Per-brand config resolved from the single source of truth (brandsConfig).
// gscCache blob key is `gscCache:<gscProperty>`.
async function brandCfg(slug) {
  const b = await getBrand(slug);
  return {
    gscKey:     `gscCache:${b.gscProperty}`,
    brandName:  b.name,
    ownDomain:  b.ownDomain,
    brandTerms: b.brandTerms,
  };
}

function getAuthHeader() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

// ── Build keyword list: top 10 GSC + 10 conversational queries ───────────────
async function getTopKeywords(brand, store) {
  const config  = await brandCfg(brand);
  const cached  = await store.get(config.gscKey, { type: 'json' }).catch(() => null);
  const rows    = cached?.rows || [];

  // Top 10 non-branded GSC keywords
  const gscKeywords = rows
    .filter(r => r.keyword && !config.brandTerms.some(t => r.keyword.toLowerCase().includes(t)))
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
    .slice(0, 10)
    .map(r => ({ keyword: r.keyword, ourPosition: r.position || null, impressions: r.impressions || 0, source: 'gsc' }));

  // 10 curated conversational queries (known AI Overview triggers)
  const conversational = (CONVERSATIONAL_QUERIES[brand] || [])
    .map(kw => ({ keyword: kw, ourPosition: null, impressions: 0, source: 'conversational' }));

  const combined = [...gscKeywords, ...conversational];
  console.log(`[ai-overview-bg] ${brand} — ${gscKeywords.length} GSC keywords + ${conversational.length} conversational queries = ${combined.length} total`);
  return combined;
}

// ── Submit all keywords as a single batch POST ───────────────────────────────
async function submitBatch(keywords, authHeader) {
  const tasks = keywords.map(k => ({
    keyword:       k.keyword,
    location_code: 21191, // Dubai
    language_code: 'en',
    device:        'desktop',
    depth:         100,
  }));

  const res  = await fetch(DATAFORSEO_POST_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body:    JSON.stringify(tasks),
  });
  const data = await res.json();
  if (data.status_code !== 20000) throw new Error(`task_post error ${data.status_code}: ${data.status_message}`);

  // Build taskId → keyword map
  const taskMap = {};
  for (let i = 0; i < (data.tasks || []).length; i++) {
    const task = data.tasks[i];
    if (task?.id) taskMap[task.id] = keywords[i];
  }
  return taskMap;
}

// ── Extract all text + cited domains from an ai_overview item ────────────────
function extractAiOverviewContent(aiItem) {
  if (!aiItem) return { text: '', domains: [] };

  const textParts = [];
  const domains   = [];

  function walk(node) {
    if (!node) return;
    if (typeof node === 'string') { textParts.push(node); return; }
    if (typeof node.text    === 'string') textParts.push(node.text);
    if (typeof node.content === 'string') textParts.push(node.content);
    if (typeof node.title   === 'string') textParts.push(node.title);
    // Cited source domains
    if (node.url) {
      try { domains.push(new URL(node.url).hostname.replace(/^www\./, '')); } catch {}
    }
    if (node.domain)      domains.push(node.domain.replace(/^www\./, ''));
    if (node.source_url)  {
      try { domains.push(new URL(node.source_url).hostname.replace(/^www\./, '')); } catch {}
    }
    // Recurse into sub-items
    if (Array.isArray(node.items)) node.items.forEach(walk);
    if (Array.isArray(node.references)) node.references.forEach(walk);
    if (Array.isArray(node.sources)) node.sources.forEach(walk);
  }

  walk(aiItem);
  return { text: textParts.filter(Boolean).join(' '), domains: [...new Set(domains)] };
}

// ── Poll using tasks_ready — one call returns all completed task IDs ──────────
// Cheaper than polling each task individually every 5s
const DATAFORSEO_READY_URL = 'https://api.dataforseo.com/v3/serp/google/organic/tasks_ready';

async function pollAll(taskMap, authHeader, maxWaitMs = 120000) {
  const taskIdSet    = new Set(Object.keys(taskMap));
  const results      = {};
  const pollInterval = 20000; // check every 20s
  const maxAttempts  = Math.ceil(maxWaitMs / pollInterval);

  for (let attempt = 0; attempt < maxAttempts && Object.keys(results).length < taskIdSet.size; attempt++) {
    await new Promise(r => setTimeout(r, pollInterval));

    try {
      const readyRes  = await fetch(DATAFORSEO_READY_URL, { headers: { Authorization: authHeader } });
      if (!readyRes.ok) continue;
      const readyData = await readyRes.json();
      if (readyData.status_code !== 20000) continue;

      const readyIds = (readyData.tasks?.[0]?.result || [])
        .map(t => t.id)
        .filter(id => taskIdSet.has(id) && !results[id]);

      await Promise.all(readyIds.map(async (taskId) => {
        try {
          const res  = await fetch(`${DATAFORSEO_GET_URL}/${taskId}`, { headers: { Authorization: authHeader } });
          const data = await res.json();
          if (data.status_code !== 20000) return;
          const task = data.tasks?.[0];
          if (task?.status_code === 20000 && task.result) {
            results[taskId] = task.result[0] || null;
          } else {
            results[taskId] = null; // hard error, mark done
          }
        } catch (e) { /* retry next cycle */ }
      }));

      console.log(`[ai-overview-bg] ${Object.keys(results).length}/${taskIdSet.size} tasks done (check ${attempt + 1})`);
    } catch (e) { /* transient — retry */ }
  }

  // Any tasks that never appeared in tasks_ready — mark null
  for (const id of taskIdSet) {
    if (!results[id]) results[id] = null;
  }

  return results;
}

// ── Process one brand ────────────────────────────────────────────────────────
async function processBrand(brand, store, authHeader) {
  const config   = await brandCfg(brand);
  const keywords = await getTopKeywords(brand, store);

  if (!keywords.length) {
    console.log(`[ai-overview-bg] No GSC keywords for ${brand} — skipping`);
    return [];
  }

  console.log(`[ai-overview-bg] ${brand} — submitting ${keywords.length} SERP tasks`);
  const taskMap = await submitBatch(keywords, authHeader);
  console.log(`[ai-overview-bg] ${brand} — ${Object.keys(taskMap).length} tasks submitted, polling…`);

  const pollResults = await pollAll(taskMap, authHeader);

  // ── Parse results ──────────────────────────────────────────────────────────
  const output = [];
  for (const [taskId, serpResult] of Object.entries(pollResults)) {
    const kwObj = taskMap[taskId];
    if (!kwObj) continue;

    const items        = serpResult?.items || [];
    const serpFeatures = serpResult?.serp_info?.serp_features || [];

    const aiItem        = items.find(i => i.type === 'ai_overview');
    const hasAiOverview = !!aiItem || serpFeatures.includes('ai_overview');

    // Check brand mention — text content AND cited source domains
    let brandMentioned = false;
    if (hasAiOverview && aiItem) {
      const { text, domains } = extractAiOverviewContent(aiItem);
      const textLower = text.toLowerCase();
      const brandLower = config.brandName.toLowerCase();
      // Match in text
      const inText = textLower.includes(brandLower) ||
        config.brandTerms.some(t => textLower.includes(t.toLowerCase()));
      // Match in cited domains
      const inDomains = domains.some(d => d.includes(config.ownDomain.replace('www.','')));
      brandMentioned = inText || inDomains;
    }

    // Our organic position from SERP (more current than gscCache avg position)
    const ourOrganic  = items.filter(i => i.type === 'organic' && i.url && i.url.includes(config.ownDomain));
    const serpPosition = ourOrganic.length > 0 ? ourOrganic[0].rank_absolute : null;

    output.push({
      keyword:       kwObj.keyword,
      hasAiOverview,
      brandMentioned,
      ourPosition:   serpPosition || kwObj.ourPosition,
      impressions:   kwObj.impressions,
      source:        kwObj.source || 'gsc', // 'gsc' | 'conversational'
      checkedAt:     new Date().toISOString(),
    });
  }

  // Sort: AI Overview Yes first, then by position ascending
  output.sort((a, b) => {
    if (a.hasAiOverview !== b.hasAiOverview) return (b.hasAiOverview ? 1 : 0) - (a.hasAiOverview ? 1 : 0);
    return (a.ourPosition || 999) - (b.ourPosition || 999);
  });

  // Save latest results
  await store.set(`aiOverviewData:${brand}`, JSON.stringify(output));

  // Update rolling 12-week history
  const aiCount  = output.filter(r => r.hasAiOverview).length;
  const mentioned = output.filter(r => r.brandMentioned).length;

  let history = await store.get(`aiOverviewHistory:${brand}`, { type: 'json' }).catch(() => []) || [];
  if (!Array.isArray(history)) history = [];
  history.push({
    date:                new Date().toISOString().slice(0, 10),
    keywordsChecked:     output.length,
    aiOverviewCount:     aiCount,
    brandMentionedCount: mentioned,
  });
  if (history.length > 12) history = history.slice(-12);
  await store.set(`aiOverviewHistory:${brand}`, JSON.stringify(history));

  console.log(`[ai-overview-bg] ${brand} done: ${aiCount}/${output.length} AI Overviews, ${mentioned} brand mentions`);
  return output;
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };
  console.log('[ai-overview-bg] Starting');

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });
  const authHeader = getAuthHeader();

  // Single brand via query string for manual refresh
  const targetBrand = event?.queryStringParameters?.brand;
  const allSlugs    = await getBrandSlugs();
  const brands = (targetBrand && allSlugs.includes(targetBrand))
    ? [targetBrand]
    : allSlugs;

  for (const brand of brands) {
    try {
      await processBrand(brand, store, authHeader);
    } catch (e) {
      console.error(`[ai-overview-bg] Fatal error for ${brand}:`, e.message);
    }
  }

  console.log('[ai-overview-bg] Done');
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
