// netlify/functions/competitor-matrix-background.js
// Netlify Background Function — weekly SERP refresh for both brands.
//
// Schedule: Monday 4:00am UTC = Monday 8:00am Dubai time (UTC+4)
// Set in netlify.toml:
//   [functions."competitor-matrix-background"]
//     schedule = "0 4 * * 1"
//
// Can also be triggered manually:
//   GET /.netlify/functions/competitor-matrix-background

const { getStore } = require("@netlify/blobs");

const CACHE_KEY_PREFIX      = "competitorMatrix:";
const COMPETITOR_KEY_PREFIX = "competitorConfig:";
const KEYWORD_KEY_PREFIX    = "keywordConfig:";

const DEFAULT_COMPETITORS = {
  pickl: [
    { name: "Salt",        domain: "saltuae.com"    },
    { name: "High Joint",  domain: "highjoint.co"   },
    { name: "Shake Shack", domain: "shakeshack.com" },
    { name: "Five Guys",   domain: "fiveguys.ae"    },
  ],
  bonbird: [
    { name: "Raising Cane's",     domain: "raisingcanes.com"      },
    { name: "Jailbird",           domain: "jailbirddubai.com"     },
    { name: "Dave's Hot Chicken", domain: "daveshotchicken.com"   },
    { name: "Toit",               domain: "toitchicken.com"       },
    { name: "Nash Hot Chicken",   domain: "nashhotchicken.com"    },
    { name: "Peppers",            domain: "peppersuae.com"        },
    { name: "Jollibee",           domain: "jollibee.com.ph"       },
    { name: "KFC",                domain: "kfc.com"               },
    { name: "Popeyes",            domain: "popeyes.com"           },
  ],
};

const DEFAULT_KEYWORDS = {
  pickl: [
    "hot dog", "french fries", "cheese burger", "hot dog sandwich", "chicken tender",
    "chicken sando", "chocolate shake", "hot dog dubai", "spicy fries", "strawberry shake",
    "chocolate milk shake", "plant based burger", "beef hot dog", "double cheese burger",
    "messy fries", "fries dubai", "spicy french fries", "parmesan fries", "vanilla shake",
    "crispy chicken tender", "cheese slice burger", "buffalo chicken sando",
    "american cheese burger", "hot dog in dubai", "caramel shake", "crispy chicken sando",
    "plant based burger dubai", "bbq cheese burger", "cheese melt burger",
    "messy fries near me", "ice cream sando", "bacon cheese burger", "melt burger dubai",
    "smash burger dubai", "smash burger abu dhabi", "best burger in dubai",
    "best burger in abu dhabi", "best burger in sharjah", "best burger abu dhabi",
    "best burger in uae", "best burgers near me dubai", "best fries in dubai",
    "best chicken burger in dubai", "best fast food dubai", "burger restaurant near me",
    "burger places near me", "burger shop near me", "burger delivery dubai marina",
    "burger restaurant city walk dubai", "burgers jbr dubai", "loaded fries near me",
    "hot dog near me", "best hot dog in dubai", "chicken sandwich dubai",
    "franchise business", "franchise in uae", "franchise dubai", "franchise in dubai",
    "franchise business in dubai", "franchise opportunities dubai", "franchise business in uae",
    "restaurant franchise", "restaurant franchise opportunities", "restaurant franchise in dubai",
    "how to franchise a restaurant", "fast food franchise in dubai", "fast food franchise",
  ],
  bonbird: [
    "crispy chicken", "broasted chicken", "fried chicken", "chicken strips", "chicken tenders",
    "chicken fingers", "chicken tender", "tender chicken", "strips chicken", "chicken strip",
    "chicken finger", "chicken wrap", "chicken tortilla wrap", "crispy chicken wrap",
    "buffalo chicken wrap", "tortilla wraps", "rice bowl", "chicken rice bowl",
    "chicken burger", "crispy chicken burger", "breaded chicken burger",
    "fried chicken burger", "crunchy chicken burger", "crispy chicken menu",
    "crispy chicken dubai menu", "best chicken abu dhabi", "best fried chicken in dubai",
    "best burger in dubai", "burger near me", "best burger in abu dhabi",
    "burger restaurant near me", "best chicken burger dubai", "crispy chicken abu dhabi",
    "crispy chicken near me", "broasted chicken near me", "fried chicken near me",
    "crispy chicken dubai", "best chicken near me", "fried chicken dubai",
    "crispy chicken uae", "broasted chicken sharjah", "fried chicken abu dhabi",
    "fried chicken delivery dubai", "korean chicken burger dubai", "chicken rice bowl dubai",
    "franchise business", "franchise in uae", "franchise dubai", "franchise in dubai",
    "franchise business in dubai", "franchise opportunities dubai",
    "restaurant franchise in dubai", "fast food franchise in dubai", "fried chicken franchise",
  ],
};

const BRAND_SITE = {
  pickl:   "https://eatpickl.com/",
  bonbird: "https://bonbirdchicken.com/",
};

// Load competitors and keywords from Blobs, fall back to defaults
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
    siteUrl:       BRAND_SITE[brand],
    competitors,
    targetKeywords: keywords,
    location_code:  21191,
    language_code:  "en",
  };
}

// ─── DataForSEO fetch — one keyword per request (plan limitation) ─────────────
async function fetchSerpRankings(brand, config) {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DataForSEO credentials missing");

  const authHeader = "Basic " + Buffer.from(`${login}:${password}`).toString("base64");

  const rows = [];

  for (const kw of config.targetKeywords) {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 20000); // 20s max per keyword

    let postRes;
    try {
      postRes = await fetch(
        "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
        {
          method:  "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify([{
            keyword:       kw,
            location_code: config.location_code,
            language_code: config.language_code,
            device:        "desktop",
            os:            "windows",
            depth:         100, // top 100 results — same cost as 50, catches page 6-10 rankings
          }]),
          signal: controller.signal,
        }
      );
    } catch (fetchErr) {
      clearTimeout(timeout);
      console.warn(`[competitor-matrix-background] Timeout/error on keyword "${kw}" — skipping`);
      continue;
    }
    clearTimeout(timeout);

    if (!postRes.ok) {
      console.warn(`[competitor-matrix-background] HTTP ${postRes.status} on keyword "${kw}" — skipping`);
      continue;
    }

    const data = await postRes.json();
    if (data.status_code !== 20000) {
      console.warn(`[competitor-matrix-background] API status ${data.status_code} on keyword "${kw}": ${data.status_message} — skipping`);
      continue;
    }

    for (const task of data.tasks || []) {
      if (task.status_code !== 20000) {
        console.warn(`[competitor-matrix-background] Task skipped — keyword: "${task.data?.keyword}" status: ${task.status_code} message: ${task.status_message}`);
        continue;
      }

      const keyword   = task.data?.keyword || "";
      const items     = task.result?.[0]?.items || [];
      const ourDomain = new URL(config.siteUrl).hostname.replace(/^www\./, "");

      let ourRank = null;
      for (const item of items) {
        if (item.type !== "organic") continue;
        const itemDomain = (item.domain || "").replace(/^www\./, "");
        if (itemDomain === ourDomain || itemDomain.includes(ourDomain)) {
          ourRank = item.rank_absolute;
          break;
        }
      }

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
  }

  return rows;
}

// ─── Load keywords — blob config first, hardcoded fallback ───────────────────

function detectMovement(currentRows, previousRows) {
  if (!previousRows || !previousRows.length) return currentRows;

  const prevMap = {};
  for (const row of previousRows) prevMap[row.keyword] = row.ourRank;

  return currentRows.map((row) => {
    const prev = prevMap[row.keyword];
    let movement = "new";
    let movementDelta = null;

    if (prev !== undefined) {
      if (row.ourRank === null && prev === null) {
        movement = "not_ranking";
      } else if (row.ourRank === null && prev !== null) {
        movement = "dropped_out";
      } else if (row.ourRank !== null && prev === null) {
        movement = "entered";
      } else {
        movementDelta = prev - row.ourRank; // positive = improved (lower rank number)
        movement = movementDelta > 0 ? "up" : movementDelta < 0 ? "down" : "stable";
      }
    }

    return { ...row, movement, movementDelta };
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async () => {
  console.log(
    `[competitor-matrix-background] Starting — ${new Date().toISOString()}`,
    "(Monday 4am UTC = 8am Dubai time)"
  );

  const store = getStore({
    name:   "seo-tool",
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  const results = {};
  const errors  = {};

  // Process both brands in parallel — halves total runtime from ~18min to ~9min
  async function processBrand(brand) {
    try {
      console.log(`[competitor-matrix-background] Fetching ${brand}...`);

      let previousRows = [];
      try {
        const prev = await store.get(`${CACHE_KEY_PREFIX}${brand}`, { type: "json" });
        previousRows = prev?.rows || [];
      } catch {
        // no previous data — first run
      }

      const config  = await loadBrandConfig(store, brand);
      const rawRows = await fetchSerpRankings(brand, config);
      const rows    = detectMovement(rawRows, previousRows);

      const payload = {
        brand,
        rows,
        competitors:  config.competitors.map((c) => c.name),
        fetchedAt:    new Date().toISOString(),
        keywordCount: rows.length,
        schedule:     "Monday 04:00 UTC / 08:00 Dubai",
      };

      await store.set(`${CACHE_KEY_PREFIX}${brand}`, JSON.stringify(payload));
      results[brand] = { success: true, keywordCount: rows.length };
      console.log(`[competitor-matrix-background] ${brand} done — ${rows.length} keywords`);

    } catch (err) {
      console.error(`[competitor-matrix-background] ${brand} failed:`, err.message);
      errors[brand] = err.message;
    }
  }

  await Promise.all(["pickl", "bonbird"].map(processBrand));

  console.log("[competitor-matrix-background] Complete.", { results, errors });

  return {
    statusCode: 200,
    body: JSON.stringify({
      results,
      errors,
      completedAt: new Date().toISOString(),
    }),
  };
};
