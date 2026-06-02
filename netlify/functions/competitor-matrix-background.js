// netlify/functions/competitor-matrix-background.js
// Netlify Background Function — weekly SERP refresh for both brands.
//
// Pass 1 additions (June 2026):
//   - Saves ALL top-20 domains per keyword (not just tracked competitors)
//   - Auto-detects unknown competitors (3+ appearances, not aggregator/social)
//   - Calculates Share of Voice (CTR-weighted) per domain per keyword set
//   - Stores weekly SoV snapshots for trend charting
//   - Captures SERP features (featured snippet, local pack, PAA, video) per keyword
//
// Pass 2 additions (June 2026):
//   - Fetches top 50 NON-BRANDED ranked keywords per competitor via DataForSEO Labs
//   - Uses domain_brand_filters to strip out branded search terms before selecting top 50
//   - Stores in competitorRankedKeywords:<brand> — drives real gap + content strategy
//
// Schedule: Monday 4:00am UTC = Monday 8:00am Dubai time (UTC+4)

const { getStore } = require("@netlify/blobs");

const CACHE_KEY_PREFIX           = "competitorMatrix:";
const COMPETITOR_KEY_PREFIX      = "competitorConfig:";
const KEYWORD_KEY_PREFIX         = "keywordConfig:";
const AUTO_DETECT_KEY            = "autoDetectedCompetitors:";
const SOV_HISTORY_KEY            = "sovHistory:";
const RANKED_KEYWORDS_KEY        = "competitorRankedKeywords:";

// Domains to ignore for auto-detection — aggregators, social, directories
const AGGREGATOR_DOMAINS = new Set([
  "zomato.com","tripadvisor.com","talabat.com","timeout.com","timeoutdubai.com",
  "whatson.ae","theentertainer.com","deliveroo.ae","noonfood.com","careem.com",
  "google.com","facebook.com","instagram.com","twitter.com","youtube.com",
  "tiktok.com","linkedin.com","yelp.com","foursquare.com","maps.google.com",
  "openrice.com","hungerstation.com","noon.com","amazon.ae","wikipedia.org",
]);

// ── Brand name filter map ─────────────────────────────────────────────────────
// Per competitor domain: all branded search terms to EXCLUDE before selecting top 50.
// Rule: include brand name, common misspellings, concatenated versions (no space),
// abbreviations. When in doubt, exclude — false exclusion costs nothing.
const BRAND_KEYWORD_FILTERS = {
  // Pickl competitors
  "saltuae.com":          ["salt", "saltt", "salt burger", "salt uae", "salt restaurant", "salt dubai", "salt burgers"],
  "highjoint.co":         ["high joint", "highjoint", "the high joint", "high joint dubai"],
  "shakeshack.com":       ["shake shack", "shakeshack", "shack burger", "shake shack dubai", "shake shack abu dhabi", "theshack"],
  "fiveguys.ae":          ["five guys", "fiveguys", "5 guys", "five guys dubai", "five guys uae"],
  // Bonbird competitors
  "raisingcanes.com":     ["raising cane", "raising canes", "raisingcanes", "cane's", "canes chicken", "raising cane's", "cane's chicken"],
  "jailbirddubai.com":    ["jailbird", "jail bird", "jailbird dubai", "jailbird chicken"],
  "daveshotchicken.com":  ["daves hot chicken", "dave's hot chicken", "daveshotchicken", "dhc", "dave hot chicken", "daves chicken"],
  "toitchicken.com":      ["toit", "toit chicken", "toit dubai"],
  "nashhotchicken.com":   ["nash hot chicken", "nashhotchicken", "nash chicken", "nash dubai", "nash hot"],
  "peppersuae.com":       ["peppers", "peppers uae", "peppers chicken", "peppers dubai"],
  "jollibee.com.ph":      ["jollibee", "jolibee", "jollibee dubai", "jollibee uae"],
  "kfc.com":              ["kfc", "kentucky fried chicken", "kentucky chicken", "kfc dubai", "kfc uae", "kfc abu dhabi"],
  "popeyes.com":          ["popeyes", "popeye", "popeyes chicken", "popeyes dubai", "popeyes uae"],
};

// Get brand filter terms for a domain — falls back to extracting from domain name
function getBrandFilters(domain) {
  const clean = domain.replace(/^www\./, "");
  if (BRAND_KEYWORD_FILTERS[clean]) return BRAND_KEYWORD_FILTERS[clean];
  // Generic fallback: strip TLD, split on dots/hyphens
  const base = clean.split(".")[0].replace(/-/g, " ");
  return [base];
}

function isBrandedKeyword(keyword, brandTerms) {
  const lower = keyword.toLowerCase();
  return brandTerms.some(term => lower.includes(term.toLowerCase()));
}

const DEFAULT_COMPETITORS = {
  pickl: [
    { name: "Salt",        domain: "saltuae.com"    },
    { name: "High Joint",  domain: "highjoint.co"   },
    { name: "Shake Shack", domain: "shakeshack.com" },
    { name: "Five Guys",   domain: "fiveguys.ae"    },
  ],
  bonbird: [
    { name: "Raising Cane's",     domain: "raisingcanes.com"    },
    { name: "Jailbird",           domain: "jailbirddubai.com"   },
    { name: "Dave's Hot Chicken", domain: "daveshotchicken.com" },
    { name: "Toit",               domain: "toitchicken.com"     },
    { name: "Nash Hot Chicken",   domain: "nashhotchicken.com"  },
    { name: "Peppers",            domain: "peppersuae.com"      },
    { name: "Jollibee",           domain: "jollibee.com.ph"     },
    { name: "KFC",                domain: "kfc.com"             },
    { name: "Popeyes",            domain: "popeyes.com"         },
  ],
};

const DEFAULT_KEYWORDS = {
  pickl: [
    "best burger in dubai","best burger in abu dhabi","best burger in uae",
    "best burger in sharjah","smash burger dubai","smash burger abu dhabi",
    "burger restaurant dubai","burger restaurant abu dhabi",
    "american burger dubai","halal burger dubai",
    "cheese burger dubai","double burger dubai","plant based burger dubai",
    "best fast food dubai","fast food restaurant dubai",
    "best chicken burger in dubai","chicken sandwich dubai",
    "best fries in dubai","loaded fries dubai","fries dubai",
    "burgers jbr dubai","burgers marina dubai","burger city walk dubai",
    "burger mall of emirates","burgers downtown dubai",
    "burger abu dhabi","burger yas mall abu dhabi",
    "burger delivery dubai","best burger delivery dubai",
    "burger delivery abu dhabi",
    "best lunch dubai","best dinner dubai","casual dining dubai",
    "hot dog dubai","best hot dog in dubai",
  ],
  bonbird: [
    "best fried chicken in dubai","best fried chicken in abu dhabi",
    "fried chicken dubai","crispy chicken dubai","crispy chicken abu dhabi",
    "best crispy chicken dubai","best chicken restaurant dubai",
    "broasted chicken dubai","korean fried chicken dubai",
    "nashville hot chicken dubai","southern fried chicken dubai",
    "crispy chicken burger dubai","best chicken burger dubai",
    "chicken tender dubai","chicken strips dubai",
    "chicken wrap dubai","crispy chicken wrap dubai",
    "chicken rice bowl dubai","chicken combo dubai",
    "fried chicken marina dubai","fried chicken jbr",
    "crispy chicken abu dhabi","fried chicken delivery dubai",
    "fried chicken delivery abu dhabi","best fried chicken delivery dubai",
    "best fast food dubai","fast food abu dhabi",
    "halal fried chicken dubai","chicken restaurant dubai",
  ],
};

const BRAND_SITE = {
  pickl:   "https://eatpickl.com/",
  bonbird: "https://bonbirdchicken.com/",
};

// CTR estimate by position (used for Share of Voice weighting)
function estimatedCtr(position) {
  if (!position || position < 1) return 0;
  const ctrs = [0, 0.30, 0.18, 0.12, 0.09, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02];
  if (position <= 10) return ctrs[position] || 0.02;
  if (position <= 20) return 0.01;
  return 0.005;
}

async function loadBrandConfig(store, brand) {
  let competitors = DEFAULT_COMPETITORS[brand];
  let keywords    = DEFAULT_KEYWORDS[brand];

  try {
    const storedComp = await store.get(`${COMPETITOR_KEY_PREFIX}${brand}`, { type: "json" });
    if (storedComp?.competitors?.length) competitors = storedComp.competitors;
  } catch { /* use default */ }

  try {
    const storedKw = await store.get(`${KEYWORD_KEY_PREFIX}${brand}`, { type: "json" });
    if (storedKw?.keywords?.length) keywords = storedKw.keywords;
  } catch { /* use default */ }

  return {
    siteUrl:        BRAND_SITE[brand],
    competitors,
    targetKeywords: keywords,
    location_code:  21191,
    language_code:  "en",
  };
}

// ── DataForSEO Standard mode ─────────────────────────────────────────────────
const DATAFORSEO_POST_URL = "https://api.dataforseo.com/v3/serp/google/organic/task_post";
const DATAFORSEO_GET_URL  = "https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced";
const BATCH_SIZE          = 100;
const POLL_INTERVAL_MS    = 5000;
const POLL_MAX_ATTEMPTS   = 120;
const TASK_TAG_PREFIX     = "yolkseo_";

async function fetchSerpRankings(brand, config) {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DataForSEO credentials missing");

  const authHeader = "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
  const keywords   = config.targetKeywords;
  const ourDomain  = new URL(config.siteUrl).hostname.replace(/^www\./, "");

  console.log(`[competitor-matrix] ${brand} — posting ${keywords.length} keywords`);

  // ── Step 1: POST all keywords in batches ──────────────────────────────────
  const taskIds = [];

  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE);
    const tasks = batch.map(kw => ({
      keyword:       kw,
      location_code: config.location_code,
      language_code: config.language_code,
      device:        "desktop",
      os:            "windows",
      depth:         100,
      tag:           `${TASK_TAG_PREFIX}${brand}`,
    }));

    const res = await fetch(DATAFORSEO_POST_URL, {
      method:  "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body:    JSON.stringify(tasks),
    });
    if (!res.ok) throw new Error(`task_post HTTP ${res.status}`);
    const data = await res.json();
    if (data.status_code !== 20000) throw new Error(`task_post error ${data.status_code}: ${data.status_message}`);

    for (const task of data.tasks || []) {
      if (task.id) taskIds.push(task.id);
    }
  }

  console.log(`[competitor-matrix] ${brand} — ${taskIds.length} tasks posted, polling…`);

  // ── Step 2: Poll until all tasks complete ─────────────────────────────────
  const results  = {};
  let   pending  = new Set(taskIds);
  let   attempts = 0;

  while (pending.size > 0 && attempts < POLL_MAX_ATTEMPTS) {
    attempts++;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    for (const taskId of [...pending].slice(0, 50)) {
      try {
        const res  = await fetch(`${DATAFORSEO_GET_URL}/${taskId}`, { headers: { Authorization: authHeader } });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.status_code !== 20000) continue;

        for (const task of data.tasks || []) {
          if (task.status_code === 20000 && task.result) {
            results[taskId] = {
              keyword:     task.data?.keyword || "",
              items:       task.result?.[0]?.items || [],
              keywordInfo: task.result?.[0]?.keyword_info || null,
            };
            pending.delete(taskId);
          } else if (task.status_code === 40501 || task.status_code === 40601) {
            pending.delete(taskId);
          }
        }
      } catch (e) {
        console.warn(`[competitor-matrix] poll error ${taskId}: ${e.message}`);
      }
    }

    if (attempts % 6 === 0) {
      console.log(`[competitor-matrix] ${brand} — ${pending.size} tasks remaining (attempt ${attempts})`);
    }
  }

  if (pending.size > 0) {
    console.warn(`[competitor-matrix] ${brand} — ${pending.size} tasks pending after max polls, proceeding`);
  }

  // ── Step 3: Parse results ─────────────────────────────────────────────────
  const rows = [];

  // Domain frequency tracking for auto-detection (top 10 appearances)
  const domainFrequency = {}; // domain → { count, sampleKeywords[], firstPos }

  for (const { keyword, items, keywordInfo } of Object.values(results)) {
    let ourRank = null;
    const competitorRanks = {};
    for (const comp of config.competitors) competitorRanks[comp.name] = null;

    // All organic domains in top 20 (for SoV + auto-detection)
    const topDomains = [];

    // SERP features present
    const serpFeatures = {
      featuredSnippet: null,  // domain that owns it, or true if present
      localPack:       false,
      peopleAlsoAsk:   false,
      video:           false,
      aiOverview:      false,
    };

    for (const item of items) {
      const rank       = item.rank_absolute;
      const itemDomain = (item.domain || "").replace(/^www\./, "");

      // ── SERP feature detection ────────────────────────────────────────────
      if (item.type === "featured_snippet") {
        serpFeatures.featuredSnippet = itemDomain || true;
        continue;
      }
      if (item.type === "local_pack") {
        serpFeatures.localPack = true;
        continue;
      }
      if (item.type === "people_also_ask") {
        serpFeatures.peopleAlsoAsk = true;
        continue;
      }
      if (item.type === "video") {
        serpFeatures.video = true;
        continue;
      }
      if (item.type === "answer_box" || (item.type === "organic" && item.title?.includes("AI Overview"))) {
        serpFeatures.aiOverview = true;
        continue;
      }

      if (item.type !== "organic") continue;

      // ── Our rank ──────────────────────────────────────────────────────────
      if (ourRank === null && (itemDomain === ourDomain || itemDomain.includes(ourDomain))) {
        ourRank = rank;
      }

      // ── Competitor ranks ──────────────────────────────────────────────────
      for (const comp of config.competitors) {
        if (competitorRanks[comp.name] === null) {
          const compDomain = comp.domain.replace(/^www\./, "");
          if (itemDomain === compDomain || itemDomain.includes(compDomain)) {
            competitorRanks[comp.name] = rank;
          }
        }
      }

      // ── Top domains (top 20 organic only, for SoV + auto-detection) ───────
      if (rank <= 20) {
        topDomains.push({ domain: itemDomain, rank });

        // Track domain frequency for auto-detection
        if (rank <= 10 && itemDomain && itemDomain !== ourDomain) {
          if (!domainFrequency[itemDomain]) {
            domainFrequency[itemDomain] = { count: 0, sampleKeywords: [], bestRank: rank };
          }
          domainFrequency[itemDomain].count++;
          if (domainFrequency[itemDomain].sampleKeywords.length < 3) {
            domainFrequency[itemDomain].sampleKeywords.push(keyword);
          }
          if (rank < domainFrequency[itemDomain].bestRank) {
            domainFrequency[itemDomain].bestRank = rank;
          }
        }
      }
    }

    rows.push({
      keyword,
      brand,
      ourRank,
      ourDomain,
      competitorRanks,
      topDomains,
      serpFeatures,
      cpc_usd:      keywordInfo?.cpc          ?? null,
      searchVolume: keywordInfo?.search_volume ?? null,
      fetchedAt: new Date().toISOString(),
    });
  }

  return { rows, domainFrequency };
}

// ── Auto-detect unknown competitors ──────────────────────────────────────────
function buildAutoDetected(domainFrequency, knownCompetitors, ourDomain) {
  const knownDomains = new Set([
    ourDomain,
    ...knownCompetitors.map(c => c.domain.replace(/^www\./, "")),
  ]);

  return Object.entries(domainFrequency)
    .filter(([domain, data]) => {
      if (knownDomains.has(domain)) return false;
      if (AGGREGATOR_DOMAINS.has(domain)) return false;
      // Check any aggregator subdomain
      for (const agg of AGGREGATOR_DOMAINS) {
        if (domain.endsWith("." + agg) || domain.includes(agg)) return false;
      }
      return data.count >= 3; // appears in 3+ keyword SERPs
    })
    .map(([domain, data]) => ({
      domain,
      appearances:     data.count,
      bestRank:        data.bestRank,
      sampleKeywords:  data.sampleKeywords,
      firstSeenAt:     new Date().toISOString(),
    }))
    .sort((a, b) => b.appearances - a.appearances)
    .slice(0, 20); // top 20 unknown domains
}

// ── Calculate Share of Voice ──────────────────────────────────────────────────
function calculateSoV(rows, trackedDomains) {
  const domainScores = {};

  for (const row of rows) {
    for (const { domain, rank } of row.topDomains || []) {
      if (!domainScores[domain]) domainScores[domain] = 0;
      domainScores[domain] += estimatedCtr(rank);
    }
  }

  const totalScore = Object.values(domainScores).reduce((a, b) => a + b, 0);
  if (!totalScore) return {};

  // Return SoV for tracked domains only (+ unknown top 5)
  const allEntries = Object.entries(domainScores)
    .map(([domain, score]) => ({
      domain,
      sov: Math.round((score / totalScore) * 1000) / 10, // percentage to 1dp
      score,
    }))
    .sort((a, b) => b.score - a.score);

  // Tracked domains
  const result = {};
  for (const { domain, sov } of allEntries) {
    if (trackedDomains.has(domain) || allEntries.indexOf(allEntries.find(e => e.domain === domain)) < 10) {
      result[domain] = sov;
    }
  }
  return result;
}

// ── DataForSEO Labs — competitor ranked keywords ──────────────────────────────
// Uses dataforseo_labs/google/ranked_keywords/live (Labs DB query, not live SERP).
// Returns top 50 NON-BRANDED organic keywords by search volume.
// Cost: ~$0.005/domain. All 13 competitors ≈ $0.065/run.
const LABS_RANKED_KEYWORDS_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live";

async function fetchCompetitorRankedKeywords(competitors, locationCode, authHeader) {
  const resultsMap = {}; // domain → [{keyword, searchVolume, position, url, cpc}]

  for (const comp of competitors) {
    const domain     = comp.domain.replace(/^www\./, "");
    const brandTerms = getBrandFilters(domain);

    console.log(`[competitor-matrix] Fetching ranked keywords for ${domain} (filtering: ${brandTerms.slice(0,3).join(", ")}…)`);

    try {
      const res = await fetch(LABS_RANKED_KEYWORDS_URL, {
        method:  "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify([{
          target:        domain,
          location_code: locationCode,
          language_code: "en",
          filters: [["keyword_data.keyword_info.search_volume", ">", 0]],
          order_by: ["keyword_data.keyword_info.search_volume,desc"],
          limit: 200,  // fetch more, then filter branded terms to get clean top 50
        }]),
      });

      if (!res.ok) {
        console.warn(`[competitor-matrix] Labs HTTP ${res.status} for ${domain}`);
        resultsMap[domain] = [];
        continue;
      }

      const data = await res.json();
      if (data.status_code !== 20000) {
        console.warn(`[competitor-matrix] Labs API error for ${domain}: ${data.status_message}`);
        resultsMap[domain] = [];
        continue;
      }

      const items = data.tasks?.[0]?.result?.[0]?.items || [];

      // Filter branded terms, take top 50 by search volume
      resultsMap[domain] = items
        .filter(item => {
          const kw = (item.keyword_data?.keyword || "").toLowerCase();
          return kw.length > 0 && !isBrandedKeyword(kw, brandTerms);
        })
        .slice(0, 50)
        .map(item => ({
          keyword:      item.keyword_data?.keyword,
          searchVolume: item.keyword_data?.keyword_info?.search_volume || 0,
          position:     item.ranked_serp_element?.serp_item?.rank_absolute || null,
          url:          item.ranked_serp_element?.serp_item?.url || null,
          cpc:          item.keyword_data?.keyword_info?.cpc || null,
        }));

      console.log(`[competitor-matrix] ${domain}: ${items.length} total keywords → ${resultsMap[domain].length} non-branded`);

      // Small delay between Labs calls to be kind to the API
      await new Promise(r => setTimeout(r, 300));

    } catch (e) {
      console.warn(`[competitor-matrix] Labs error for ${domain}: ${e.message}`);
      resultsMap[domain] = [];
    }
  }

  return resultsMap;
}

function detectMovement(currentRows, previousRows) {
  if (!previousRows || !previousRows.length) return currentRows;
  const prevMap = {};
  for (const row of previousRows) prevMap[row.keyword] = row.ourRank;

  return currentRows.map(row => {
    const prev = prevMap[row.keyword];
    let movement = "new";
    let movementDelta = null;

    if (prev !== undefined) {
      if (row.ourRank === null && prev === null)        { movement = "not_ranking"; }
      else if (row.ourRank === null && prev !== null)   { movement = "dropped_out"; }
      else if (row.ourRank !== null && prev === null)   { movement = "entered"; }
      else {
        movementDelta = prev - row.ourRank; // positive = improved
        movement = movementDelta > 0 ? "up" : movementDelta < 0 ? "down" : "stable";
      }
    }
    return { ...row, movement, movementDelta };
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async () => {
  console.log(`[competitor-matrix] Starting — ${new Date().toISOString()}`);

  const store = getStore({
    name:   "seo-tool",
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  const results = {};
  const errors  = {};

  async function processBrand(brand) {
    try {
      console.log(`[competitor-matrix] Processing ${brand}…`);

      let previousRows = [];
      try {
        const prev = await store.get(`${CACHE_KEY_PREFIX}${brand}`, { type: "json" });
        previousRows = prev?.rows || [];
      } catch { /* first run */ }

      const config          = await loadBrandConfig(store, brand);
      const { rows: rawRows, domainFrequency } = await fetchSerpRankings(brand, config);
      const rows            = detectMovement(rawRows, previousRows);
      const ourDomain       = new URL(config.siteUrl).hostname.replace(/^www\./, "");

      // ── Auto-detected competitors ─────────────────────────────────────────
      const autoDetected = buildAutoDetected(domainFrequency, config.competitors, ourDomain);
      await store.set(`${AUTO_DETECT_KEY}${brand}`, JSON.stringify({
        brand,
        domains:   autoDetected,
        updatedAt: new Date().toISOString(),
      })).catch(() => {});

      // ── Share of Voice calculation ────────────────────────────────────────
      const trackedDomains = new Set([
        ourDomain,
        ...config.competitors.map(c => c.domain.replace(/^www\./, "")),
      ]);
      const sovCurrent = calculateSoV(rows, trackedDomains);

      // ── SoV history (rolling 12 weeks) ────────────────────────────────────
      let sovHistory = [];
      try {
        const hist = await store.get(`${SOV_HISTORY_KEY}${brand}`, { type: "json" });
        sovHistory = Array.isArray(hist) ? hist : [];
      } catch { /* empty */ }

      const todayStr = new Date().toISOString().split("T")[0];
      sovHistory.push({ date: todayStr, sov: sovCurrent });
      if (sovHistory.length > 12) sovHistory = sovHistory.slice(-12); // keep last 12
      await store.set(`${SOV_HISTORY_KEY}${brand}`, JSON.stringify(sovHistory)).catch(() => {});

      // ── Competitor ranked keywords (non-branded top 50 via DataForSEO Labs) ──
      // Runs after SERP fetch to avoid parallel rate limiting.
      // Labs is a DB query (not live SERP) — no Standard mode equivalent exists.
      let competitorKeywords = {};
      try {
        const authHeader = "Basic " + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
        competitorKeywords = await fetchCompetitorRankedKeywords(config.competitors, config.location_code, authHeader);
        await store.set(`${RANKED_KEYWORDS_KEY}${brand}`, JSON.stringify({
          brand,
          competitors: competitorKeywords,
          fetchedAt: new Date().toISOString(),
        })).catch(() => {});
        const totalKws = Object.values(competitorKeywords).reduce((s, arr) => s + arr.length, 0);
        console.log(`[competitor-matrix] ${brand} competitor keywords: ${totalKws} non-branded keywords across ${Object.keys(competitorKeywords).length} competitors`);
      } catch (e) {
        console.warn(`[competitor-matrix] ${brand} ranked keywords failed: ${e.message}`);
      }

      // ── Store main matrix payload ─────────────────────────────────────────
      const payload = {
        brand,
        rows,
        competitors:  config.competitors.map(c => c.name),
        sovCurrent,
        ourDomain,
        fetchedAt:    new Date().toISOString(),
        keywordCount: rows.length,
        schedule:     "Monday 04:00 UTC / 08:00 Dubai",
      };

      await store.set(`${CACHE_KEY_PREFIX}${brand}`, JSON.stringify(payload));
      results[brand] = { success: true, keywordCount: rows.length, autoDetected: autoDetected.length };
      console.log(`[competitor-matrix] ${brand} done — ${rows.length} keywords, ${autoDetected.length} unknown competitors found`);

    } catch (err) {
      console.error(`[competitor-matrix] ${brand} failed:`, err.message);
      errors[brand] = err.message;
    }
  }

  await Promise.all(["pickl", "bonbird"].map(processBrand));
  console.log("[competitor-matrix] Complete.", { results, errors });

  return {
    statusCode: 200,
    body: JSON.stringify({ results, errors, completedAt: new Date().toISOString() }),
  };
};
