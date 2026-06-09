// netlify/functions/keyword-discovery-background.js
// Keyword Discovery Engine — runs weekly, builds a scored opportunity list
// from DataForSEO keyword ideas + competitor data + GSC cross-reference.
//
// Approach: data-driven, zero human input required.
//   1. Menu items + brand + location → DataForSEO keyword ideas (what people search for)
//   2. Cross-reference with GSC cache → what do we already rank for?
//   3. Cross-reference with competitorRankedKeywords → do competitors rank for it?
//   4. Filter by menu relevancy, minimum volume, market fit
//   5. Score by: volume × CPC weight × gap vs competitors × reachability
//   6. Store top opportunities as keywordOpportunities:<brand>
//
// Runs Monday 4am UTC alongside main scheduler.
// Manual trigger: GET /.netlify/functions/keyword-discovery-background?brand=pickl&force=true

const { getStore }        = require('@netlify/blobs');
const { getBrandContext } = require('./_lib/brand');

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';

function getAuth() {
  const l = process.env.DATAFORSEO_LOGIN;
  const p = process.env.DATAFORSEO_PASSWORD;
  return 'Basic ' + Buffer.from(`${l}:${p}`).toString('base64');
}

// ── Menu seeds per brand ──────────────────────────────────────────────────────
const BRAND_SEEDS = {
  pickl: [
    'smash burger', 'double smash burger', 'chicken sandwich',
    'smash burger dubai', 'best burger dubai', 'chicken sando',
    'cheese burger dubai', 'burger delivery dubai',
  ],
  bonbird: [
    'fried chicken', 'crispy fried chicken', 'chicken sandwich',
    'bone in chicken', 'chicken rice bowl', 'chicken tenders',
    'fresh fried chicken dubai', 'fried chicken delivery dubai',
  ],
};

// Market location codes (DataForSEO)
const MARKET_LOCATIONS = {
  UAE:      21191,
  KSA:      2682,
  Bahrain:  17000,
  Qatar:    179,
  Egypt:    2818,
  Jordan:   2144,
  Oman:     2114,
  Pakistan: 2586,
};

// Off-menu dishes — keywords containing these are rejected if not in menu
const OFF_MENU_DISHES = [
  'butter chicken', 'biryani', 'kebab', 'shawarma', 'pizza', 'pasta',
  'fish and chips', 'sushi', 'tacos', 'burritos', 'ramen', 'dumplings',
  'hummus', 'falafel', 'steak house', 'bbq ribs', 'lobster', 'seafood',
];

// ── DataForSEO keyword ideas ──────────────────────────────────────────────────
async function getKeywordIdeas(seeds, locationCode, authHeader) {
  try {
    // Use UAE country code (2784) for keyword volume data — city code (21191) is for SERP only
    const kwLocationCode = 2784; // United Arab Emirates country
    const res = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/keyword_ideas/live`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify([{
        keywords:       seeds,
        location_code:  kwLocationCode,
        language_code:  'en',
        limit:          200,
        include_serp_info: false,
        order_by:       ['keyword_info.search_volume,desc'],
        filters:        [
          ['keyword_info.search_volume', '>', 10],
        ],
      }]),
    });

    const data = await res.json();
    const taskId     = data.tasks?.[0]?.id || 'no-task-id';
    const taskStatus = data.tasks?.[0]?.status_code;
    const taskMsg    = data.tasks?.[0]?.status_message;
    console.log(`[kw-discovery] keyword_ideas top-level: ${data.status_code} | task id: ${taskId} | task status: ${taskStatus} | task msg: ${taskMsg}`);

    if (data.status_code !== 20000) {
      console.warn(`[kw-discovery] keyword_ideas failed ${data.status_code}: ${data.status_message}`);
      return [];
    }

    const items = data.tasks?.[0]?.result?.[0]?.items || [];
    console.log(`[kw-discovery] keyword_ideas raw items: ${items.length}`);
    return items.map(item => {
      const info = item.keyword_info || {};
      return {
        keyword:     item.keyword || '',
        volume:      info.search_volume || 0,
        cpc:         info.cpc || 0,
        competition: info.competition_level || 'medium',
      };
    }).filter(k => k.keyword && k.volume > 0);

  } catch (e) {
    console.warn('[kw-discovery] keyword_ideas error:', e.message);
    return [];
  }
}

// ── Relevancy filter ─────────────────────────────────────────────────────────
function isRelevantToMenu(keyword, brandCtx) {
  const kw       = keyword.toLowerCase();
  const menuText = JSON.stringify(brandCtx?.menu || {}).toLowerCase();

  // Reject if keyword mentions specific off-menu dishes
  for (const dish of OFF_MENU_DISHES) {
    if (kw.includes(dish) && !menuText.includes(dish)) return false;
  }

  // Reject pure competitor brand mentions
  const competitorBrands = ['shake shack', 'five guys', 'kfc', 'mcdonalds', 'burger king',
    'raising canes', 'jollibee', 'popeyes', 'hardees', 'wendys'];
  for (const brand of competitorBrands) {
    if (kw.includes(brand)) return false;
  }

  return true;
}

// ── Opportunity scoring ───────────────────────────────────────────────────────
// score = volume_norm × 0.4 + cpc_norm × 0.2 + gap_score × 0.3 + reachability × 0.1
function scoreOpportunity(kw, ourPosition, competitorPositions) {
  const volumeNorm      = Math.min(kw.volume / 2000, 1);
  const cpcNorm         = Math.min((kw.cpc || 0) / 3, 1);
  const competitorBest  = Math.min(...(competitorPositions.length ? competitorPositions : [100]));
  const ourPos          = ourPosition || 101;

  // Gap: competitor ranks well, we don't
  let gapScore = 0;
  if (ourPos > 20  && competitorBest <= 10) gapScore = 1.0; // they own it, we're nowhere
  else if (ourPos > 10 && competitorBest <= 10) gapScore = 0.7; // they're top 10, we're not
  else if (ourPos > 10 && competitorBest <= 20) gapScore = 0.5; // both in 11-20
  else if (ourPos <= 20 && ourPos > 3)           gapScore = 0.3; // we're close, no competitor needed
  else if (ourPos <= 3)                           gapScore = 0.0; // already winning

  // Reachability: easier competition = more reachable
  const reachability = kw.competition === 'low' ? 1.0 : kw.competition === 'medium' ? 0.6 : 0.3;

  return (volumeNorm * 0.4) + (cpcNorm * 0.2) + (gapScore * 0.3) + (reachability * 0.1);
}

// ── Tier classification ───────────────────────────────────────────────────────
function getTier(ourPosition, competitorBest, score) {
  const pos = ourPosition || 101;
  if (pos <= 3)                           return 'top3';
  if (pos <= 10)                          return 'top10';
  if (pos <= 20 && pos > 10)             return 'quick_win';
  if (pos <= 50 && pos > 20)             return 'push';
  if (competitorBest <= 10 && pos > 50)  return 'content_gap';
  if (pos > 50)                          return 'content_gap';
  return 'monitor';
}

// ── Main discovery per brand ──────────────────────────────────────────────────
async function discoverKeywords(brand, store, authHeader, force = false) {
  const tag = `[kw-discovery/${brand}]`;
  console.log(`${tag} starting discovery`);

  const brandCtx = await getBrandContext(brand);

  // Load GSC cache for position lookup
  const GSC_URL   = brand === 'pickl' ? 'https://eatpickl.com/' : 'https://bonbirdchicken.com/';
  const gscCache  = await store.get(`gscCache:${GSC_URL}`, { type: 'json' }).catch(() => null);
  const gscMap    = {};
  if (gscCache?.rows) {
    for (const row of gscCache.rows) {
      if (row.keyword) gscMap[row.keyword.toLowerCase()] = row.position;
    }
  }
  console.log(`${tag} GSC positions loaded: ${Object.keys(gscMap).length} keywords`);

  // Load competitor ranked keywords
  const compData = await store.get(`competitorRankedKeywords:${brand}`, { type: 'json' }).catch(() => null);
  const compMap  = {}; // keyword → [positions from competitors]
  if (Array.isArray(compData)) {
    for (const comp of compData) {
      for (const kw of comp.keywords || []) {
        const key = kw.keyword?.toLowerCase();
        if (key) {
          if (!compMap[key]) compMap[key] = [];
          compMap[key].push(kw.position || 100);
        }
      }
    }
  }
  console.log(`${tag} competitor keywords loaded: ${Object.keys(compMap).length} unique`);

  // Get keyword ideas for UAE (primary market, richest volume data)
  const seeds    = BRAND_SEEDS[brand] || [];
  const ideas    = await getKeywordIdeas(seeds, MARKET_LOCATIONS.UAE, authHeader);
  console.log(`${tag} DataForSEO returned ${ideas.length} keyword ideas`);

  // Also add competitor keywords we don't yet track
  const compKeywords = Object.entries(compMap)
    .filter(([kw]) => !gscMap[kw]) // not ranking for it at all
    .map(([kw, positions]) => ({
      keyword:     kw,
      volume:      0, // volume unknown from competitor data
      cpc:         0,
      competition: 'medium',
      fromCompetitor: true,
    }));

  // Merge all sources
  const allKeywords = [...ideas, ...compKeywords];
  const seen = new Set();
  const unique = allKeywords.filter(k => {
    if (!k.keyword || seen.has(k.keyword.toLowerCase())) return false;
    seen.add(k.keyword.toLowerCase());
    return true;
  });

  // Filter, score, tier
  const opportunities = unique
    .filter(k => isRelevantToMenu(k.keyword, brandCtx))
    .filter(k => k.volume >= 20 || k.fromCompetitor) // low threshold for competitor keywords
    .map(k => {
      const kw           = k.keyword.toLowerCase();
      const ourPosition  = gscMap[kw] || null;
      const compPositions = compMap[kw] || [];
      const score        = scoreOpportunity(k, ourPosition, compPositions);
      const tier         = getTier(ourPosition, Math.min(...(compPositions.length ? compPositions : [100])), score);
      return {
        keyword:          k.keyword,
        volume:           k.volume,
        cpc:              k.cpc,
        competition:      k.competition,
        ourPosition:      ourPosition,
        competitorBest:   compPositions.length ? Math.min(...compPositions) : null,
        competitorCount:  compPositions.length,
        score:            Math.round(score * 1000) / 1000,
        tier,
        fromCompetitor:   k.fromCompetitor || false,
      };
    })
    .filter(k => k.tier !== 'top3') // already winning, skip
    .sort((a, b) => b.score - a.score)
    .slice(0, 100); // top 100 opportunities

  const summary = {
    quick_win:    opportunities.filter(k => k.tier === 'quick_win').length,
    push:         opportunities.filter(k => k.tier === 'push').length,
    content_gap:  opportunities.filter(k => k.tier === 'content_gap').length,
    top10:        opportunities.filter(k => k.tier === 'top10').length,
    monitor:      opportunities.filter(k => k.tier === 'monitor').length,
  };

  const result = {
    brand,
    updatedAt:     new Date().toISOString(),
    opportunities,
    summary,
    gscKeywords:   Object.keys(gscMap).length,
    ideasFetched:  ideas.length,
  };

  await store.set(`keywordOpportunities:${brand}`, JSON.stringify(result));
  console.log(`${tag} stored ${opportunities.length} opportunities:`, JSON.stringify(summary));
  return result;
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  console.log('[kw-discovery] Starting', new Date().toISOString());

  const store      = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
  const authHeader = getAuth();
  const force      = event.queryStringParameters?.force === 'true';
  const brandParam = event.queryStringParameters?.brand;
  const brands     = brandParam ? [brandParam] : ['pickl', 'bonbird'];

  const results = {};
  for (const brand of brands) {
    try {
      results[brand] = await discoverKeywords(brand, store, authHeader, force);
    } catch (e) {
      console.error(`[kw-discovery] ${brand} failed:`, e.message);
      results[brand] = { error: e.message };
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, results }),
  };
};
