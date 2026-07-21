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
const { INTERNATIONAL_MARKETS, MARKET_LOCATION_CODES, getMarketAsync, getMarketsMapAsync } = require('./_lib/international-config');
const { resolveLocation } = require('./_lib/dfs-locations');
const { isAggregatorDomain, domainMatches } = require('./_lib/aggregator-domains');
const { enrichKeywordsMixed } = require('./_lib/keyword-metrics');
const { getBrand, getBrandSlugs } = require('./_lib/brands-config');

const CACHE_KEY_PREFIX           = "competitorMatrix:";
const COMPETITOR_KEY_PREFIX      = "competitorConfig:";
const KEYWORD_KEY_PREFIX         = "keywordConfig:";
const AUTO_DETECT_KEY            = "autoDetectedCompetitors:";
const SOV_HISTORY_KEY            = "sovHistory:";
const RANKED_KEYWORDS_KEY        = "competitorRankedKeywords:";

// Domains to ignore for auto-detection — aggregators, social, directories
const AGGREGATOR_DOMAINS = new Set([
  "zomato.com","tripadvisor.com","talabat.com","timeout.com","timeoutdubai.com",
  "whatson.ae","theentertainer.com","deliveroo.ae","deliveroo.com","noonfood.com","careem.com",
  "google.com","facebook.com","instagram.com","twitter.com","x.com","youtube.com",
  "tiktok.com","linkedin.com","yelp.com","foursquare.com","maps.google.com",
  "openrice.com","hungerstation.com","noon.com","amazon.ae","wikipedia.org",
  // Social/forum/aggregator/app/store domains that surface in (esp. Arabic) SERPs
  // but are never our competitors — strategy is get-listed, not outrank.
  "reddit.com","quora.com","medium.com","pinterest.com","threads.net","snapchat.com",
  "booking.com","agoda.com","trustpilot.com","apple.com","apps.apple.com","play.google.com",
  "indeed.com","glassdoor.com","bayt.com","mrsool.co","jahez.net","thechefz.co",
  "ubereats.com","yellowpages.ae","2gis.ae","wikiwand.com","fandango.ae",
]);

// ── Brand name filter map ─────────────────────────────────────────────────────
// Per competitor domain: all branded search terms to EXCLUDE before selecting top 50.
// Rule: include brand name, common misspellings, concatenated versions (no space),
// abbreviations. When in doubt, exclude — false exclusion costs nothing.
const BRAND_KEYWORD_FILTERS = {
  // Pickl competitors
  "shakeshackme.com":     ["shake shack", "shakeshack", "shack burger", "shake shack dubai", "shake shack me", "theshack"],
  "fiveguys.ae":          ["five guys", "fiveguys", "5 guys", "five guys dubai", "five guys uae"],
  // Bonbird competitors
  "raisingcanesme.com":   ["raising cane", "raising canes", "raisingcanes", "cane's", "canes chicken", "raising cane's"],
  "jailbird.co":          ["jailbird", "jail bird", "jailbird dubai", "jailbird chicken"],
  "daveshotchicken.com":  ["daves hot chicken", "dave's hot chicken", "daveshotchicken", "dhc", "dave hot chicken"],
  "toit.vercel.app":      ["toit", "toit chicken", "toit dubai"],
  "jollibeeuae.com":      ["jollibee", "jolibee", "jollibee dubai", "jollibee uae"],
  "uae.kfc.me":           ["kfc", "kentucky fried chicken", "kentucky chicken", "kfc dubai", "kfc uae", "kfc abu dhabi"],
  "popeyesuae.com":       ["popeyes", "popeye", "popeyes chicken", "popeyes dubai", "popeyes uae"],
  "uae.texaschicken.com": ["texas chicken", "texaschicken", "texas chicken dubai", "texas chicken uae"],
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

// ── Restaurant relevance filter for competitor keywords ───────────────────────
// Rejects irrelevant keywords that competitors happen to rank for (e.g. "western union",
// "cities in riyadh", "time in nyc") — free, instant, no API calls needed.
const FOOD_TERMS = [
  // Food items
  "burger","chicken","fries","wrap","sandwich","steak","pizza","sushi","hot dog","wings",
  "tenders","strips","nuggets","rice","bowl","salad","cheese","sauce","spicy","crispy",
  "smash","fried","grilled","bbq","loaded","brunch","breakfast","snack","combo",
  // Drinks (no "coffee" — neither brand is a coffee shop; it pulls in cafes)
  "shake","juice","drink","smoothie",
  // Restaurant & dining category terms
  "restaurant","cafe","cafeteria","diner","bistro","dine","dining","fast food",
  "quick service","food court","food truck","street food","casual dining",
  "takeaway","takeout","delivery","menu","kitchen","grill","food","eat","meal",
  "lunch","dinner","feast","cuisine","catering","branch","franchise",
];
const LOCATION_TERMS = [
  "dubai","abu dhabi","uae","sharjah","ajman","fujairah","ras al","umm al","khalifa",
  "downtown","marina","jbr","deira","bur dubai","jumeirah","mirdif","karama","satwa",
  "near me","nearby","in dubai","in uae","in abu dhabi","delivery dubai",
];

// Arabic equivalents so Arabic keywords are filtered as strictly as English —
// NOT blanket-accepted. Reject competitor brands + off-menu cuisines; accept only
// genuine food/restaurant or local-intent terms.
const ARABIC_OFFMENU = [
  "هندي","صيني","ايطالي","إيطالي","ياباني","تايلندي","لبناني","مكسيكي","تركي",   // other cuisines
  "بيتزا","سوشي","شاورما","برياني","باستا","مكرونة","كباب","ستيك","ساشيمي",      // off-menu dishes
  "قهوة","كافيه","كوفي","حلويات","كيك","مخبز","ايس كريم","آيس كريم","دونات",     // coffee/bakery/sweets
  "ستاربكس","كنتاكي","ماكدونالدز","ماك","هرفي","البيك","بربوس","دومينوز",        // competitor brands
];
const ARABIC_FOOD = [
  "برغر","برجر","همبرغر","برقر","دجاج","تشيكن","بطاطس","فرايز","ساندويتش","ساندويش",
  "وجبة","وجبات","مطعم","مطاعم","توصيل","اكل","أكل","طعام","غداء","عشاء","مقرمش","مقلي","سماش",
];
const ARABIC_LOC = ["الرياض","جدة","السعودية","الدمام","مكة","المدينة","الخبر","قريب","قريبة","بالقرب","توصيل"];

function isRestaurantKeyword(keyword) {
  const lower = keyword.toLowerCase();
  if (/[؀-ۿ]/.test(keyword)) {
    if (ARABIC_OFFMENU.some(t => keyword.includes(t))) return false;
    return ARABIC_FOOD.some(t => keyword.includes(t)) || ARABIC_LOC.some(t => keyword.includes(t));
  }
  return FOOD_TERMS.some(t => lower.includes(t)) || LOCATION_TERMS.some(t => lower.includes(t));
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

async function loadBrandConfig(store, brand, marketKey = null) {
  // Config fallback for brands with no built-in DEFAULT_* seed (Southpour, Yolk, …).
  const brandCfg = await getBrand(brand).catch(() => null);
  let competitors = DEFAULT_COMPETITORS[brand] || brandCfg?.competitors || [];
  let keywords    = DEFAULT_KEYWORDS[brand] || brandCfg?.keywordSeeds || [];
  let location_code = 21191; // Default: Dubai UAE
  let labsSupported = true;  // is this market in DataForSEO Labs? (ranked_keywords)
  let locationLanguages = ['en', 'ar']; // valid Labs languages (UAE accepts both)

  // If a specific market is requested, use market-specific config
  if (marketKey && marketKey !== 'uae') {
    const market = await getMarketAsync(marketKey);
    if (market) {
      const loc = await resolveLocation(market.label);
      location_code = loc.code || market.location_code;
      // Definitively-not-in-Labs (e.g. Qatar/Oman) → skip the Labs ranked_keywords step.
      labsSupported = !(loc.inCache && loc.supported === false);
      // Authoritative Labs languages (KSA=['ar'], Jordan=['en'], …). Drives the
      // enrichment language so KD/volume resolve instead of 40501-ing on 'en'.
      locationLanguages = (loc.languages && loc.languages.length) ? loc.languages : (market.languages || ['en']);
      // Use market seed keywords as the keyword list
      const marketKws = [
        ...(market.seedKeywords?.en || []),
        ...(market.seedKeywords?.ar || []), // Arabic-first markets: track native-language terms too
        // Add any generic competitive terms for this market
        `best burger in ${market.label}`,
        `best fried chicken in ${market.label}`,
        `burger restaurant ${market.label}`,
        `chicken restaurant ${market.label}`,
      ].filter(Boolean);
      if (marketKws.length) keywords = marketKws;
    }
  }

  try {
    const storedComp = await store.get(`${COMPETITOR_KEY_PREFIX}${brand}`, { type: "json" });
    if (storedComp?.competitors?.length) competitors = storedComp.competitors;
  } catch { /* use default */ }

  // Only use stored keywords for UAE (international uses market seed keywords)
  if (!marketKey || marketKey === 'uae') {
    try {
      const storedKw = await store.get(`${KEYWORD_KEY_PREFIX}${brand}`, { type: "json" });
      if (storedKw?.keywords?.length) keywords = storedKw.keywords;
    } catch { /* use default */ }
  }

  return {
    siteUrl:        BRAND_SITE[brand] || (brandCfg ? brandCfg.domain.replace(/\/?$/, '/') : null),
    competitors,
    targetKeywords: keywords,
    location_code,
    language_code:  "en",
    marketKey:      marketKey || 'uae',
    labsSupported,
    locationLanguages,
  };
}

// ── DataForSEO Standard mode ─────────────────────────────────────────────────
const DATAFORSEO_POST_URL  = "https://api.dataforseo.com/v3/serp/google/organic/task_post";
const DATAFORSEO_READY_URL = "https://api.dataforseo.com/v3/serp/google/organic/tasks_ready";
const DATAFORSEO_GET_URL   = "https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced";
const BATCH_SIZE           = 100;
const TASK_TAG_PREFIX      = "yolkseo_";
// tasks_ready approach: one call returns ALL ready task IDs — far cheaper than polling each individually
const READY_POLL_INTERVAL  = 30000;  // check every 30s (not 5s per-task)
const READY_POLL_MAX       = 20;     // max 20 checks = 10 minutes total

async function fetchSerpRankings(brand, config) {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DataForSEO credentials missing");

  const authHeader = "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
  const keywords   = config.targetKeywords;
  const ourDomain  = new URL(config.siteUrl).hostname.replace(/^www\./, "");

  if (!keywords.length) {
    console.error(`[competitor-matrix] ${brand} — NO TRACKED KEYWORDS. Add keywords in Manage Keywords tab.`);
    return { rows: [], sovCurrent: {}, ourDomain };
  }
  console.log(`[competitor-matrix] ${brand} — posting ${keywords.length} keywords`);

  // ── Step 1: POST all keywords in batches ──────────────────────────────────
  const taskIds = [];

  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE);
    const tasks = batch.map(kw => ({
      keyword:       kw,
      location_code: config.location_code,
      // Arabic-script keywords must be queried in Arabic or the SERP comes back
      // empty (Arabic-first markets like KSA). Detect per keyword.
      language_code: /[؀-ۿ]/.test(kw) ? "ar" : config.language_code,
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

  const taskIdSet = new Set(taskIds);
  console.log(`[competitor-matrix] ${brand} — ${taskIds.length} tasks posted, using tasks_ready endpoint…`);

  // ── Step 2: Use tasks_ready — ONE call returns ALL completed task IDs ─────
  // Much cheaper than polling each task individually (was costing ~$1.50/run)
  const results  = {};
  let   attempt  = 0;

  while (Object.keys(results).length < taskIds.length && attempt < READY_POLL_MAX) {
    attempt++;
    await new Promise(r => setTimeout(r, READY_POLL_INTERVAL));

    try {
      // tasks_ready returns IDs of ALL completed SERP tasks for this account
      const readyRes  = await fetch(DATAFORSEO_READY_URL, { headers: { Authorization: authHeader } });
      if (!readyRes.ok) { console.warn(`[competitor-matrix] tasks_ready HTTP ${readyRes.status}`); continue; }
      const readyData = await readyRes.json();
      if (readyData.status_code !== 20000) { console.warn(`[competitor-matrix] tasks_ready error: ${readyData.status_message}`); continue; }

      const readyIds = (readyData.tasks?.[0]?.result || [])
        .map(t => t.id)
        .filter(id => taskIdSet.has(id) && !results[id]); // only our tasks, not yet fetched

      if (!readyIds.length) {
        console.log(`[competitor-matrix] ${brand} — ${Object.keys(results).length}/${taskIds.length} done (check ${attempt})`);
        continue;
      }

      // Fetch results for ready tasks only — no wasted calls
      for (const taskId of readyIds) {
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
            }
          }
        } catch (e) { console.warn(`[competitor-matrix] fetch error ${taskId}: ${e.message}`); }
      }

      console.log(`[competitor-matrix] ${brand} — ${Object.keys(results).length}/${taskIds.length} done (check ${attempt})`);
    } catch (e) {
      console.warn(`[competitor-matrix] tasks_ready error: ${e.message}`);
    }
  }

  if (Object.keys(results).length < taskIds.length) {
    console.warn(`[competitor-matrix] ${brand} — only ${Object.keys(results).length}/${taskIds.length} tasks completed after ${attempt} checks`);
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
      if (item.type === "answer_box" || item.type === "ai_overview") {
        serpFeatures.aiOverview = true;
        continue;
      }

      if (item.type !== "organic") continue;

      // ── Our rank ──────────────────────────────────────────────────────────
      if (ourRank === null && domainMatches(itemDomain, ourDomain)) {
        ourRank = rank;
      }

      // ── Competitor ranks ──────────────────────────────────────────────────
      for (const comp of config.competitors) {
        if (competitorRanks[comp.name] === null && domainMatches(itemDomain, comp.domain)) {
          competitorRanks[comp.name] = rank;
        }
      }

      // ── Top domains (top 20 organic only, for SoV + auto-detection) ───────
      if (rank <= 20) {
        topDomains.push({ domain: itemDomain, rank, url: item.url || null }); // url → page-level competitor context for content-gen

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
function buildAutoDetected(domainFrequency, knownCompetitors, ourDomain, minAppearances = 3) {
  const knownDomains = new Set([
    ourDomain,
    ...knownCompetitors.map(c => c.domain.replace(/^www\./, "")),
  ]);

  return Object.entries(domainFrequency)
    .filter(([domain, data]) => {
      if (knownDomains.has(domain)) return false;
      if (isAggregatorDomain(domain)) return false; // bare-term match → catches timeoutbahrain, zomato.qa, etc.
      return data.count >= minAppearances;
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
  const resultsMap = {};
  let labsError    = null; // store first error for UI display

  // Labs requires country-level codes; Dubai city (21191) returns 0 results.
  // Remap UAE-city/default → UAE country (2784); international markets already
  // pass a country code, so they flow through. Previously this was hardcoded to
  // 2784, so a per-market matrix run still pulled UAE competitor keywords.
  const labsLoc = (!locationCode || locationCode === 21191) ? 2784 : locationCode;

  // language_code is validated against the location's database. Some markets
  // (e.g. Saudi Arabia 2682) reject 'en' with a 40501 "Invalid Field:
  // 'language_code'" even though UAE (2784) accepts it. It's optional here
  // (auto-derived from location), so if the probe below detects a rejection we
  // drop it for every domain call. Only flips on an actual language error, so
  // working markets are unaffected.
  let useLanguage = true;

  // Test the Labs endpoint with the first competitor before running all
  // This surfaces auth/plan errors without burning through all competitors
  const firstDomain = competitors[0]?.domain.replace(/^www\./, "");
  if (firstDomain) {
    try {
      const testRes = await fetch(LABS_RANKED_KEYWORDS_URL, {
        method:  "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify([{ target: firstDomain, location_code: labsLoc, language_code: "en", limit: 1 }]),
      });
      const testData = await testRes.json();
      const testTask = testData.tasks?.[0] || {};
      console.log(`[competitor-matrix] Labs test — HTTP ${testRes.status}, status_code: ${testData.status_code}, msg: ${testData.status_message}, task: ${testTask.status_code} ${testTask.status_message || ''}`);
      if (testRes.status === 403 || testData.status_code === 40300) {
        labsError = "DataForSEO Labs access denied (403) — your account may not have Labs enabled. Contact DataForSEO support.";
        console.warn("[competitor-matrix]", labsError);
        return { resultsMap, labsError };
      }
      if (testData.status_code === 40100 || testData.status_code === 40101) {
        labsError = `DataForSEO auth error (${testData.status_code}): ${testData.status_message}`;
        console.warn("[competitor-matrix]", labsError);
        return { resultsMap, labsError };
      }
      // Detect language_code rejection (top-level or task-level) → drop it for all calls
      if (/language_code/i.test(testData.status_message || "") || /language_code/i.test(testTask.status_message || "")) {
        useLanguage = false;
        console.warn(`[competitor-matrix] Labs rejected language_code for loc ${labsLoc} — fetching ranked keywords without language`);
      }
    } catch (e) {
      labsError = `Network error reaching DataForSEO Labs: ${e.message}`;
      console.warn("[competitor-matrix]", labsError);
      return { resultsMap, labsError };
    }
  }

  for (const comp of competitors) {
    const domain     = comp.domain.replace(/^www\./, "");
    const brandTerms = getBrandFilters(domain);

    console.log(`[competitor-matrix] Fetching ranked keywords for ${domain}`);

    try {
      const rkPayload = {
        target:        domain,
        location_code: labsLoc, // remapped above: UAE city 21191 → 2784; intl markets pass through
        filters: [["keyword_data.keyword_info.search_volume", ">", 0]],
        order_by: ["keyword_data.keyword_info.search_volume,desc"],
        limit: 200,
      };
      if (useLanguage) rkPayload.language_code = "en";
      const res = await fetch(LABS_RANKED_KEYWORDS_URL, {
        method:  "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify([rkPayload]),
      });

      if (!res.ok) {
        console.warn(`[competitor-matrix] Labs HTTP ${res.status} for ${domain}`);
        if (!labsError) labsError = `HTTP ${res.status} from DataForSEO Labs`;
        resultsMap[domain] = [];
        continue;
      }

      const data = await res.json();
      if (data.status_code !== 20000) {
        console.warn(`[competitor-matrix] Labs API error for ${domain}: ${data.status_code} — ${data.status_message}`);
        if (!labsError) labsError = `${data.status_code}: ${data.status_message}`;
        resultsMap[domain] = [];
        continue;
      }

      const items = data.tasks?.[0]?.result?.[0]?.items || [];
      resultsMap[domain] = items
        .filter(item => {
          const kw = (item.keyword_data?.keyword || "").toLowerCase();
          return kw.length > 0
            && !isBrandedKeyword(kw, brandTerms)
            && isRestaurantKeyword(kw);  // reject "western union", "time in nyc" etc.
        })
        .slice(0, 50)
        .map(item => ({
          keyword:      item.keyword_data?.keyword,
          searchVolume: item.keyword_data?.keyword_info?.search_volume || 0,
          position:     item.ranked_serp_element?.serp_item?.rank_absolute || null,
          url:          item.ranked_serp_element?.serp_item?.url || null,
          cpc:          item.keyword_data?.keyword_info?.cpc || null,
        }));

      console.log(`[competitor-matrix] ${domain}: ${items.length} total → ${resultsMap[domain].length} non-branded`);
      await new Promise(r => setTimeout(r, 300));

    } catch (e) {
      console.warn(`[competitor-matrix] Labs error for ${domain}: ${e.message}`);
      if (!labsError) labsError = e.message;
      resultsMap[domain] = [];
    }
  }

  return { resultsMap, labsError };
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
const { authorizeJob } = require("./_lib/auth");

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Not authenticated" }) };
  console.log(`[competitor-matrix] Starting — ${new Date().toISOString()}`);

  const store = getStore({
    name:   "seo-tool",
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  const qs           = event?.queryStringParameters || {};
  const targetMarket = qs.market || null; // e.g. 'pickl_bahrain', null = UAE default
  const force        = qs.force === 'true';

  const results = {};
  const errors  = {};

  async function processBrand(brand, marketParam) {
    const marketKey  = marketParam || 'uae';
    const isIntlRun  = !!(marketParam && marketParam !== 'uae');
    const cacheKey   = marketParam ? `${CACHE_KEY_PREFIX}${brand}:${marketParam}` : `${CACHE_KEY_PREFIX}${brand}`;
    const sovKey     = marketParam ? `${SOV_HISTORY_KEY}${brand}:${marketParam}` : `${SOV_HISTORY_KEY}${brand}`;

    try {
      console.log(`[competitor-matrix] Processing ${brand} (market: ${marketKey})…`);

      let previousRows = [];
      try {
        const prev = await store.get(cacheKey, { type: "json" });
        previousRows = prev?.rows || [];
      } catch { /* first run */ }

      const config = await loadBrandConfig(store, brand, marketParam);
      const { rows: rawRows, domainFrequency } = await fetchSerpRankings(brand, config);
      const rows            = detectMovement(rawRows, previousRows);
      const ourDomain       = new URL(config.siteUrl).hostname.replace(/^www\./, "");

      // ── Enrich rows with volume + CPC + Keyword Difficulty ────────────────
      // SERP results don't carry search volume; fetch it (+ KD) from the Keyword
      // Data / Labs layer, language-aware. Skip markets not in Labs (no valid code).
      if (!isIntlRun || config.labsSupported) {
        try {
          const authH   = "Basic " + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
          const metrics = await enrichKeywordsMixed(rows.map(r => r.keyword), config.location_code, authH, config.locationLanguages);
          for (const row of rows) {
            const m = metrics[(row.keyword || "").toLowerCase()];
            if (m) {
              if (m.volume != null) row.searchVolume = m.volume;
              if (m.cpc    != null) row.cpc_usd      = m.cpc;
              row.keywordDifficulty = m.kd;
            }
          }
          console.log(`[competitor-matrix] ${brand}/${marketKey} — enriched ${Object.keys(metrics).length} keywords (vol/cpc/KD)`);
        } catch (e) { console.warn(`[competitor-matrix] enrich failed: ${e.message}`); }
      }

      // ── Auto-detected competitors ─────────────────────────────────────────
      const autoDetected  = buildAutoDetected(domainFrequency, config.competitors, ourDomain, isIntlRun ? 2 : 3);
      const autoDetectKey = isIntlRun ? `${AUTO_DETECT_KEY}${brand}:${marketParam}` : `${AUTO_DETECT_KEY}${brand}`;
      await store.set(autoDetectKey, JSON.stringify({
        brand,
        market:    marketKey,
        domains:   autoDetected,
        updatedAt: new Date().toISOString(),
      })).catch(() => {});

      // ── Effective competitor set (intl: auto-detected ∪ manual; UAE: curated) ─
      // For UAE, config.competitors is the curated DEFAULT_COMPETITORS list.
      // For intl, no curated list exists — auto-detected domains fill the role,
      // with any manual overrides (competitorConfig:<brand>:<market>) taking priority.
      let effectiveCompetitors = config.competitors;
      if (isIntlRun) {
        const manualOverrides = await store.get(`${COMPETITOR_KEY_PREFIX}${brand}:${marketParam}`, { type: 'json' })
          .then(d => d?.competitors || []).catch(() => []);
        const autoCompetitors = autoDetected.slice(0, 10).map(d => ({
          name:   d.domain,   // full domain — unambiguous column label (split('.')[0] gave dup "ar")
          domain: d.domain,
        }));
        const manualDomains = new Set(manualOverrides.map(c => c.domain.replace(/^www\./, '')));
        const autoFill = autoCompetitors.filter(c => !manualDomains.has(c.domain.replace(/^www\./, '')));
        effectiveCompetitors = [...manualOverrides, ...autoFill];
        console.log(`[competitor-matrix] ${brand}/${marketKey} — ${effectiveCompetitors.length} effective competitors (${manualOverrides.length} manual + ${autoFill.length} auto-detected)`);

        // Re-key each row's competitorRanks to the EFFECTIVE competitor set.
        // fetchSerpRankings keyed them by config.competitors (the curated UAE list),
        // but intl columns render the auto-detected/manual set — so without this the
        // names never match and every competitor cell shows "—". topDomains already
        // holds every top-20 organic domain+rank per keyword; match against that.
        for (const row of rows) {
          const cr = {};
          for (const comp of effectiveCompetitors) cr[comp.name] = null;
          for (const { domain, rank } of (row.topDomains || [])) {
            for (const comp of effectiveCompetitors) {
              if (cr[comp.name] == null && domainMatches(domain, comp.domain)) cr[comp.name] = rank;
            }
          }
          row.competitorRanks = cr;
        }
      }

      // ── Share of Voice calculation ────────────────────────────────────────
      const trackedDomains = new Set([
        ourDomain,
        ...effectiveCompetitors.map(c => c.domain.replace(/^www\./, "")),
      ]);
      const sovCurrent = calculateSoV(rows, trackedDomains);

      // ── SoV history (rolling 12 weeks) ────────────────────────────────────
      let sovHistory = [];
      try {
        const hist = await store.get(sovKey, { type: "json" });
        sovHistory = Array.isArray(hist) ? hist : [];
      } catch { /* empty */ }

      const todayStr = new Date().toISOString().split("T")[0];
      sovHistory = sovHistory.filter(h => h.date !== todayStr); // no duplicate entry on same-day re-run
      sovHistory.push({ date: todayStr, sov: sovCurrent });
      if (sovHistory.length > 12) sovHistory = sovHistory.slice(-12); // keep last 12
      await store.set(sovKey, JSON.stringify(sovHistory)).catch(() => {});

      // ── Competitor ranked keywords (non-branded top 50 via DataForSEO Labs) ──
      // Runs after SERP fetch to avoid parallel rate limiting.
      // Labs is a DB query (not live SERP) — no Standard mode equivalent exists.
      let competitorKeywords = {};
      let labsError          = null;
      try {
        const authHeader = "Basic " + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
        const rankedKey  = isIntlRun ? `${RANKED_KEYWORDS_KEY}${brand}:${marketParam}` : `${RANKED_KEYWORDS_KEY}${brand}`;
        if (!config.labsSupported) {
          // Market not in DataForSEO Labs (e.g. Qatar, Oman) — skip gracefully.
          labsError = `${marketKey} is not in DataForSEO Labs — competitor ranked keywords unavailable`;
          console.warn(`[competitor-matrix] ${labsError}`);
        } else {
          const result     = await fetchCompetitorRankedKeywords(effectiveCompetitors, config.location_code, authHeader);
          competitorKeywords = result.resultsMap || {};
          labsError          = result.labsError  || null;
        }
        await store.set(rankedKey, JSON.stringify({
          brand,
          market:      marketKey,
          competitors: competitorKeywords,
          labsError,
          fetchedAt: new Date().toISOString(),
        })).catch(() => {});
        const totalKws = Object.values(competitorKeywords).reduce((s, arr) => s + arr.length, 0);
        console.log(`[competitor-matrix] ${brand}/${marketKey} competitor keywords: ${totalKws} across ${Object.keys(competitorKeywords).length} competitors${labsError ? ` | error: ${labsError}` : ""}`);
      } catch (e) {
        labsError = e.message;
        console.warn(`[competitor-matrix] ${brand}/${marketKey} ranked keywords failed: ${e.message}`);
        const rankedKeyErr = isIntlRun ? `${RANKED_KEYWORDS_KEY}${brand}:${marketParam}` : `${RANKED_KEYWORDS_KEY}${brand}`;
        await store.set(rankedKeyErr, JSON.stringify({ brand, market: marketKey, competitors: {}, labsError, fetchedAt: new Date().toISOString() })).catch(() => {});
      }

      // ── Store main matrix payload ─────────────────────────────────────────
      // ONLY overwrite blob if we got actual rows — preserve previous data on empty run
      if (rows.length === 0) {
        const reason = config.targetKeywords.length === 0
          ? 'No tracked keywords configured — add keywords in Manage Keywords tab'
          : 'DataForSEO returned 0 results — may be a temporary API issue';
        console.warn(`[competitor-matrix] ${brand} — 0 rows, NOT overwriting previous data. Reason: ${reason}`);
        results[`${brand}:${marketKey}`] = { success: false, keywordCount: 0, reason, preserved: true };
      } else {
        const payload = {
          brand,
          market:       marketKey,
          rows,
          competitors:  effectiveCompetitors.map(c => c.name),
          sovCurrent,
          ourDomain,
          fetchedAt:    new Date().toISOString(),
          keywordCount: rows.length,
          schedule:     "Monday 04:00 UTC / 08:00 Dubai",
        };
        await store.set(cacheKey, JSON.stringify(payload));
        results[`${brand}:${marketKey}`] = { success: true, keywordCount: rows.length, autoDetected: autoDetected.length, market: marketKey };
        console.log(`[competitor-matrix] ${brand}/${marketKey} done — ${rows.length} keywords`);
      }

    } catch (err) {
      console.error(`[competitor-matrix] ${brand}/${marketKey} failed:`, err.message);
      errors[`${brand}:${marketKey}`] = err.message;
      try {
        const prev = await store.get(cacheKey, { type: "json" }).catch(() => null);
        await store.set(cacheKey, JSON.stringify({
          ...(prev || {}),
          lastError:   err.message,
          lastErrorAt: new Date().toISOString(),
        }));
      } catch { /* best effort */ }
    }
  }

  if (targetMarket) {
    // Specific market requested. An intl market belongs to exactly ONE brand
    // (the market key encodes it, e.g. pickl_ksa), so derive the brand from config
    // — never run both brands blindly (that created competitorMatrix:bonbird:pickl_ksa
    // etc. + doubled DataForSEO spend). UAE (not in INTERNATIONAL_MARKETS) runs both.
    const m = await getMarketAsync(targetMarket);
    if (m) await processBrand(m.brand, targetMarket);
    else   await Promise.all((await getBrandSlugs()).map(b => processBrand(b, targetMarket)));
  } else {
    // UAE always runs weekly — for every configured brand (CLAUDE.md #12).
    await Promise.all((await getBrandSlugs()).map(b => processBrand(b, null)));

    // International markets run monthly (first Monday of month = UTC date 1–7) or when forced
    const isFirstMonday = new Date().getUTCDate() <= 7;
    if (isFirstMonday || force) {
      console.log(`[competitor-matrix] ${force ? 'forced' : 'first Monday'} — running all intl markets`);
      for (const [marketKey, market] of Object.entries(await getMarketsMapAsync())) {
        try {
          await processBrand(market.brand, marketKey);
        } catch (e) {
          console.error(`[competitor-matrix] intl ${marketKey} failed:`, e.message);
          errors[marketKey] = e.message;
        }
      }
    }
  }

  console.log("[competitor-matrix] Complete.", { results, errors });
  return {
    statusCode: 200,
    body: JSON.stringify({ results, errors, completedAt: new Date().toISOString() }),
  };
};
