// netlify/functions/ai-overview-background.js
// Weekly AI Overview Visibility check — Monday 4am UTC = 8am Dubai.
//
// Reads top 20 non-branded keywords from gscCache per brand,
// submits SERP tasks to DataForSEO Standard mode (batch submit + parallel poll),
// checks for ai_overview item type and brand mention in result text.
// Stores results in aiOverviewData:<brand> + rolling 12-week history.
//
// Also accepts ?brand=pickl|bonbird for single-brand manual refresh.
//
// DataForSEO: Standard mode ONLY — task_post batch + task_get/advanced parallel polling.
// Cost: ~$0.0006/keyword × 20 = ~$0.012/brand/run.

const { getStore } = require('@netlify/blobs');

const DATAFORSEO_POST_URL = 'https://api.dataforseo.com/v3/serp/google/organic/task_post';
const DATAFORSEO_GET_URL  = 'https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced';

const BRAND_CONFIG = {
  pickl: {
    gscKey:    'gscCache:https://eatpickl.com/',
    brandName: 'Pickl',
    ownDomain: 'eatpickl.com',
    // English variants + misspellings + Arabic transliterations
    brandTerms: ['pickl', 'pickel', 'pikle', 'pickels', 'بيكل', 'بكلز', 'بيكلز', 'بيكل برجر'],
  },
  bonbird: {
    gscKey:    'gscCache:sc-domain:bonbirdchicken.com',
    brandName: 'Bonbird',
    ownDomain: 'bonbirdchicken.com',
    brandTerms: ['bonbird', 'bon bird', 'بونبيرد'],
  },
};

function getAuthHeader() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

// ── Get top 20 non-branded keywords from gscCache ────────────────────────────
async function getTopKeywords(brand, store) {
  const config  = BRAND_CONFIG[brand];
  const cached  = await store.get(config.gscKey, { type: 'json' }).catch(() => null);
  const rows    = cached?.rows || [];

  return rows
    .filter(r => r.keyword && !config.brandTerms.some(t => r.keyword.toLowerCase().includes(t)))
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
    .slice(0, 20)
    .map(r => ({ keyword: r.keyword, ourPosition: r.position || null, impressions: r.impressions || 0 }));
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

// ── Extract text content from an ai_overview item ───────────────────────────
function extractAiOverviewText(aiItem) {
  if (!aiItem) return '';
  if (typeof aiItem.text === 'string') return aiItem.text;
  if (Array.isArray(aiItem.items)) {
    return aiItem.items.map(sub => sub.text || sub.content || '').filter(Boolean).join(' ');
  }
  return '';
}

// ── Poll all task IDs in parallel until done or timeout ─────────────────────
async function pollAll(taskMap, authHeader, maxWaitMs = 90000) {
  const pollInterval = 5000;
  const maxAttempts  = Math.ceil(maxWaitMs / pollInterval);
  const pending      = new Set(Object.keys(taskMap));
  const results      = {};

  for (let attempt = 0; attempt < maxAttempts && pending.size > 0; attempt++) {
    await new Promise(r => setTimeout(r, pollInterval));

    await Promise.all([...pending].map(async (taskId) => {
      try {
        const res  = await fetch(`${DATAFORSEO_GET_URL}/${taskId}`, {
          headers: { Authorization: authHeader },
        });
        const data = await res.json();
        if (data.status_code !== 20000) return;

        const task = data.tasks?.[0];
        if (!task) return;

        if (task.status_code === 20000 && task.result) {
          results[taskId] = task.result[0] || null;
          pending.delete(taskId);
        } else if (task.status_code === 40501 || task.status_code === 40601) {
          results[taskId] = null;
          pending.delete(taskId);
        }
        // 40602 = still processing — keep polling
      } catch (e) {
        // Transient error — retry next cycle
      }
    }));

    if (attempt % 3 === 2) {
      console.log(`[ai-overview-bg] ${pending.size} tasks still pending (attempt ${attempt + 1})`);
    }
  }

  if (pending.size > 0) {
    console.warn(`[ai-overview-bg] ${pending.size} tasks timed out — using partial results`);
    for (const id of pending) results[id] = null;
  }

  return results;
}

// ── Process one brand ────────────────────────────────────────────────────────
async function processBrand(brand, store, authHeader) {
  const config   = BRAND_CONFIG[brand];
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

    const aiItem       = items.find(i => i.type === 'ai_overview');
    const hasAiOverview = !!aiItem || serpFeatures.includes('ai_overview');

    // Check brand mention inside AI overview text
    let brandMentioned = false;
    if (hasAiOverview && aiItem) {
      const text = extractAiOverviewText(aiItem);
      brandMentioned = text.toLowerCase().includes(config.brandName.toLowerCase());
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
  console.log('[ai-overview-bg] Starting');

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });
  const authHeader = getAuthHeader();

  // Single brand via query string for manual refresh
  const targetBrand = event?.queryStringParameters?.brand;
  const brands = (targetBrand && BRAND_CONFIG[targetBrand])
    ? [targetBrand]
    : ['pickl', 'bonbird'];

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
