// netlify/functions/competitor-matrix.js
// Returns cached competitor SERP data, or fetches fresh if stale/missing.
//
// GET  ?brand=pickl|bonbird|all          — returns cached matrix data
// GET  ?brand=all&refresh=true           — forces fresh DataForSEO pull
// POST { brand, keywords[] }             — targeted refresh for specific brand
//
// Cache TTL: 7 days (refreshed every Monday at 4am UTC = 8am Dubai time)
// Blob keys: competitorMatrix:pickl / competitorMatrix:bonbird

const { getStore } = require("@netlify/blobs");

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_KEY_PREFIX = "competitorMatrix:";

// ─── Brand config — strictly separated, never mixed ───────────────────────────
const BRAND_CONFIG = {
  pickl: {
    siteUrl: "https://eatpickl.com/",
    competitors: [
      { name: "Salt",        domain: "saltuae.com"   },
      { name: "High Joint",  domain: "highjoint.co"  },
      { name: "Shake Shack", domain: "shakeshack.com" },
      { name: "Five Guys",   domain: "fiveguys.ae"   },
    ],
    targetKeywords: [
      "smash burger dubai",
      "best burgers near me dubai",
      "halal fried chicken uae",
      "burger delivery dubai marina",
      "chicken sandwich dubai",
      "best chicken sandwich uae",
      "smash burger abu dhabi",
      "burgers jbr dubai",
      "burger restaurant city walk dubai",
      "best fast food dubai",
    ],
    location_code: 21191, // UAE
    language_code: "en",
  },

  bonbird: {
    siteUrl: "https://bonbirdchicken.com/",
    competitors: [
      { name: "Salt",        domain: "saltuae.com"   },
      { name: "High Joint",  domain: "highjoint.co"  },
      { name: "Shake Shack", domain: "shakeshack.com" },
      { name: "Five Guys",   domain: "fiveguys.ae"   },
    ],
    // Keywords reflect actual Bonbird menu: bone-in, tenders, sandwiches, wraps, rice bowls
    // International markets: Oman, Pakistan, Qatar (NOT Jordan/Egypt/Saudi — those are Pickl)
    targetKeywords: [
      "fried chicken dubai",
      "best fried chicken uae",
      "crispy fried chicken dubai",
      "chicken tenders dubai",
      "bone in fried chicken dubai",
      "chicken sandwich dubai",
      "fried chicken delivery dubai",
      "halal fried chicken restaurant dubai",
      "korean chicken burger dubai",
      "chicken rice bowl dubai",
    ],
    location_code: 21191, // UAE
    language_code: "en",
  },
};

// ─── DataForSEO SERP fetch ────────────────────────────────────────────────────
async function fetchSerpRankings(brand, keywords) {
  const config = BRAND_CONFIG[brand];
  if (!config) throw new Error(`Unknown brand: ${brand}`);

  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DataForSEO credentials missing from env vars");

  const authHeader = "Basic " + Buffer.from(`${login}:${password}`).toString("base64");

  const tasks = keywords.map((kw) => ({
    keyword:       kw,
    location_code: config.location_code,
    language_code: config.language_code,
    device:        "desktop",
    os:            "windows",
    depth:         30, // fetch top 30 results to find all competitors
  }));

  const postRes = await fetch(
    "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
    {
      method:  "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body:    JSON.stringify(tasks),
    }
  );

  if (!postRes.ok) {
    const errText = await postRes.text();
    throw new Error(`DataForSEO API error ${postRes.status}: ${errText}`);
  }

  const data = await postRes.json();
  if (data.status_code !== 20000) {
    throw new Error(`DataForSEO status ${data.status_code}: ${data.status_message}`);
  }

  const rows = [];

  for (const task of data.tasks || []) {
    if (task.status_code !== 20000) continue;

    const keyword   = task.data?.keyword || "";
    const items     = task.result?.[0]?.items || [];
    const ourDomain = new URL(config.siteUrl).hostname.replace(/^www\./, "");

    // Find our rank
    let ourRank = null;
    for (const item of items) {
      if (item.type !== "organic") continue;
      const itemDomain = (item.domain || "").replace(/^www\./, "");
      if (itemDomain === ourDomain || itemDomain.includes(ourDomain)) {
        ourRank = item.rank_absolute;
        break;
      }
    }

    // Find each competitor's rank
    const competitorRanks = {};
    for (const comp of config.competitors) {
      const compDomain = comp.domain.replace(/^www\./, "");
      competitorRanks[comp.name] = null;
      for (const item of items) {
        if (item.type !== "organic") continue;
        const itemDomain = (item.domain || "").replace(/^www\./, "");
        if (itemDomain === compDomain || itemDomain.includes(compDomain)) {
          competitorRanks[comp.name] = item.rank_absolute;
          break;
        }
      }
    }

    rows.push({
      keyword,
      brand,
      ourRank,
      ourDomain,
      competitorRanks,
      fetchedAt: new Date().toISOString(),
    });
  }

  return rows;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const store = getStore({
    name:   "seo-tool",
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  try {
    // ── GET: return cached data (or refresh if stale / forced) ──────────────
    if (event.httpMethod === "GET") {
      const brandParam   = event.queryStringParameters?.brand || "all";
      const forceRefresh = event.queryStringParameters?.refresh === "true";
      const brands       = brandParam === "all" ? ["pickl", "bonbird"] : [brandParam];

      const result = {};

      for (const brand of brands) {
        const cacheKey = `${CACHE_KEY_PREFIX}${brand}`;
        let cached = null;

        try {
          cached = await store.get(cacheKey, { type: "json" });
        } catch {
          // key doesn't exist yet — first run
        }

        const isStale =
          !cached ||
          Date.now() - new Date(cached.fetchedAt).getTime() > CACHE_TTL_MS;

        if (isStale || forceRefresh) {
          const config = BRAND_CONFIG[brand];
          const rows   = await fetchSerpRankings(brand, config.targetKeywords);
          const payload = { brand, rows, fetchedAt: new Date().toISOString() };
          await store.set(cacheKey, JSON.stringify(payload));
          result[brand] = payload;
        } else {
          result[brand] = cached;
        }
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // ── POST: force refresh for specific brand + keywords ────────────────────
    if (event.httpMethod === "POST") {
      const body     = JSON.parse(event.body || "{}");
      const brand    = body.brand;
      const keywords = body.keywords || BRAND_CONFIG[brand]?.targetKeywords;

      if (!brand || !BRAND_CONFIG[brand]) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Invalid or missing brand" }),
        };
      }

      const rows    = await fetchSerpRankings(brand, keywords);
      const payload = { brand, rows, fetchedAt: new Date().toISOString() };
      await store.set(`${CACHE_KEY_PREFIX}${brand}`, JSON.stringify(payload));

      return { statusCode: 200, headers, body: JSON.stringify(payload) };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };

  } catch (err) {
    console.error("[competitor-matrix] Error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
